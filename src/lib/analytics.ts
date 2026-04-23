import { supabase } from '@/integrations/supabase/client';

const SESSION_KEY = 'analytics_session_id';

function getSessionId(): string {
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return 'unknown';
  }
}

/**
 * Fire-and-forget analytics event. Works for guests and authenticated users.
 * Errors are swallowed so analytics never breaks the user flow.
 */
export async function trackEvent(
  eventName: string,
  opts: { taskId?: string | null; metadata?: Record<string, unknown> } = {}
): Promise<void> {
  try {
    await supabase.rpc('track_event' as never, {
      _event_name: eventName,
      _task_id: opts.taskId ?? null,
      _session_id: getSessionId(),
      _metadata: opts.metadata ? (opts.metadata as never) : null,
    } as never);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[analytics] failed to track', eventName, err);
  }
}

export const PROPOSAL_ERROR_CODES = [
  'NOT_AUTHENTICATED',
  'NOT_EXECUTOR',
  'USER_BANNED',
  'OWNER_CANNOT_BID',
  'TASK_NOT_OPEN',
  'TASK_NOT_FOUND',
  'INVALID_PRICE',
] as const;

export type ProposalErrorCode = (typeof PROPOSAL_ERROR_CODES)[number];

/**
 * Extracts a server-side proposal error code from a Supabase error.
 * Falls back to null if the error isn't one of the known codes.
 */
export function extractProposalErrorCode(err: unknown): ProposalErrorCode | null {
  const msg =
    (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string'
      ? (err as { message: string }).message
      : '') || '';
  for (const code of PROPOSAL_ERROR_CODES) {
    if (msg.includes(code)) return code;
  }
  return null;
}