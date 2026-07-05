// Unified builder for ALL outbound WhatsApp webhook payloads.
// Every ChatbotIsrael workflow (welcome, new_proposal, tasker_hired,
// escrow_released, matching_task_published, work_approved_by_client,
// application_response_received, and any future event) MUST go through
// buildWhatsappWebhookPayload(). Do NOT assemble webhook payloads inline.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type WhatsappQueueRow = {
  id: string;
  phone: string | null;
  target_user_id: string | null;
  event_type: string;
  task_id: string | null;
  retry_count: number;
  metadata: Record<string, unknown>;
};

export type BuiltPayload = {
  payload: Record<string, unknown>;
  outboundMeta: Record<string, unknown>;
  userName: string;
  orderId: string;
  language: string;
};

// event_type -> workflow slug used by ChatbotIsrael.
const WORKFLOW_MAP: Record<string, string> = {
  welcome: "welcome",
  new_proposal: "new_proposal",
  tasker_hired: "accepted",
  escrow_released: "approved",
  matching_task_published: "matching_task",
  work_approved_by_client: "work_approved_by_client",
  application_response_received: "application_response_received",
};

function pickString(...vals: unknown[]): string | null {
  for (const v of vals) {
    if (typeof v === "string") {
      const t = v.trim();
      if (t) return t;
    }
  }
  return null;
}

async function resolveUserName(
  admin: SupabaseClient,
  userId: string | null,
  meta: Record<string, unknown>,
): Promise<string> {
  const metaName = pickString(
    meta.user_name,
    meta.recipient_name,
    meta.tasker_name,
    meta.client_name,
    meta.full_name,
    meta.display_name,
  );
  if (metaName) return metaName;

  if (userId) {
    const { data } = await admin
      .from("profiles")
      .select("full_name, display_name, email")
      .eq("user_id", userId)
      .maybeSingle();
    const fromProfile = pickString(
      (data as { full_name?: unknown } | null)?.full_name,
      (data as { display_name?: unknown } | null)?.display_name,
    );
    if (fromProfile) return fromProfile;
    const email = pickString((data as { email?: unknown } | null)?.email);
    if (email) {
      const local = email.split("@")[0];
      if (local) return local;
    }
  }
  return "User";
}

async function resolveOrderId(
  admin: SupabaseClient,
  taskId: string | null,
  userId: string | null,
  meta: Record<string, unknown>,
): Promise<string> {
  const metaOrder = pickString(
    meta.order_id,
    (meta as { escrow?: { order_id?: unknown } })?.escrow?.order_id,
    (meta as { task_orders?: { order_id?: unknown } })?.task_orders?.order_id,
  );
  if (metaOrder) return metaOrder;

  if (taskId) {
    try {
      let query = admin
        .from("orders")
        .select("id")
        .eq("task_id", taskId)
        .order("created_at", { ascending: false })
        .limit(1);
      if (userId) query = query.eq("user_id", userId);
      const { data } = await query.maybeSingle();
      const id = pickString((data as { id?: unknown } | null)?.id);
      if (id) return id;
    } catch (_) { /* ignore */ }

    try {
      const { data } = await admin
        .from("orders")
        .select("id")
        .eq("task_id", taskId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const id = pickString((data as { id?: unknown } | null)?.id);
      if (id) return id;
    } catch (_) { /* ignore */ }

    return taskId;
  }
  return "N/A";
}

async function resolveTaskId(
  admin: SupabaseClient,
  rowTaskId: string | null,
  meta: Record<string, unknown>,
): Promise<string | null> {
  if (rowTaskId) return rowTaskId;
  const metaTaskId = pickString(
    meta.task_id,
    (meta as { task?: { id?: unknown } })?.task?.id,
    (meta as { escrow?: { task_id?: unknown } })?.escrow?.task_id,
    (meta as { order?: { task_id?: unknown } })?.order?.task_id,
  );
  if (metaTaskId) return metaTaskId;

  const orderId = pickString(
    meta.order_id,
    (meta as { escrow?: { order_id?: unknown } })?.escrow?.order_id,
  );
  if (orderId) {
    try {
      const { data } = await admin
        .from("orders")
        .select("task_id")
        .eq("id", orderId)
        .maybeSingle();
      const tid = pickString((data as { task_id?: unknown } | null)?.task_id);
      if (tid) return tid;
    } catch (_) { /* ignore */ }
  }
  return null;
}

/**
 * Build the unified webhook payload for ChatbotIsrael.
 * Guarantees the base fields required by every workflow:
 *   phone, language, user_name, order_id, task_id, event, event_type,
 *   workflow, source, provider, timestamp, metadata.
 * Event-specific fields from row.metadata are merged on top.
 */
export async function buildWhatsappWebhookPayload(params: {
  admin: SupabaseClient;
  row: WhatsappQueueRow;
  e164Phone: string;
  language: string;
  message: string;
  webhookUrl: string;
}): Promise<BuiltPayload> {
  const { admin, row, e164Phone, language, message, webhookUrl } = params;
  const meta = { ...(row.metadata || {}) } as Record<string, unknown>;

  const workflow = WORKFLOW_MAP[row.event_type] ?? row.event_type;
  const userName = await resolveUserName(admin, row.target_user_id, meta);
  const resolvedTaskId = await resolveTaskId(admin, row.task_id, meta);
  const orderId = await resolveOrderId(admin, resolvedTaskId, row.target_user_id, meta);
  const lang = (typeof language === "string" && language.trim()) ? language : "en";
  const timestamp = new Date().toISOString();

  const outboundMeta: Record<string, unknown> = {
    ...meta,
    workflow,
    webhook_url: webhookUrl,
    user_name: userName,
    order_id: orderId,
  };

  const payload: Record<string, unknown> = {
    phone: e164Phone,
    language: lang,
    user_name: userName,
    order_id: orderId,
    task_id: resolvedTaskId,
    event: row.event_type,
    event_type: row.event_type,
    workflow,
    source: "flow4you",
    provider: "chatbotisrael",
    timestamp,
    target_user_id: row.target_user_id,
    message,
    metadata: outboundMeta,
  };

  const passthroughKeys = [
    "proposal_id",
    "task_title",
    "category_name",
    "city",
    "budget",
    "price",
    "currency",
    "client_user_id",
    "client_name",
    "tasker_user_id",
    "tasker_name",
    "created_at",
    "template",
  ];
  for (const k of passthroughKeys) {
    if (meta[k] !== undefined && payload[k] === undefined) {
      payload[k] = meta[k];
    }
  }
  if (payload.tasker_user_id === undefined && row.target_user_id) {
    payload.tasker_user_id = row.target_user_id;
  }

  // ==== Template-safe fallbacks ====
  // ChatbotIsrael templates reject null / undefined / empty string
  // for text parameters (#131008). Guarantee non-empty values for
  // every field that may be bound as a template text parameter.
  const safeStr = (v: unknown, fallback: string): string => {
    if (typeof v === "string" && v.trim()) return v;
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
    return fallback;
  };
  const safeUserName = safeStr(payload.user_name, "User");
  const safeTaskId = safeStr(payload.task_id, "N/A");
  const safeOrderId = safeStr(payload.order_id, safeTaskId);
  payload.user_name = safeUserName;
  payload.task_id = safeTaskId;
  payload.order_id = safeOrderId;
  payload.task_title = safeStr(payload.task_title, "Task");
  payload.client_name = safeStr(payload.client_name, "Client");
  payload.tasker_name = safeStr(payload.tasker_name, safeUserName);
  const priceFb = safeStr(payload.price, safeStr((meta as { amount?: unknown }).amount, "0"));
  payload.price = priceFb;
  payload.budget = safeStr(payload.budget, priceFb);
  payload.currency = safeStr(payload.currency, "ILS");
  payload.city = safeStr(payload.city, "Israel");
  payload.category_name = safeStr(payload.category_name, "Service");
  payload.message = safeStr(payload.message, "Update from Flow4You");

  // Mirror the safe values back into outboundMeta so persisted logs match.
  outboundMeta.user_name = payload.user_name;
  outboundMeta.order_id = payload.order_id;

  return { payload, outboundMeta, userName: safeUserName, orderId: safeOrderId, language: lang };
}
