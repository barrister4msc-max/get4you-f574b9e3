import { supabase } from "@/integrations/supabase/client";

type Msg = { role: "user" | "assistant"; content: string };

export async function streamChat({
  functionName,
  messages,
  onDelta,
  onDone,
  onError,
  extraBody,
}: {
  functionName: string;
  messages: Msg[];
  onDelta: (text: string) => void;
  onDone: () => void;
  onError?: (error: string) => void;
  extraBody?: Record<string, unknown>;
}) {
  try {
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${functionName}`;

    // 👉 ВАЖНО: берём JWT пользователя
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (error || !session?.access_token) {
      onError?.("User not authenticated");
      onDone();
      return;
    }

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // 👉 ВОТ ГЛАВНОЕ ИЗМЕНЕНИЕ
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ messages, ...extraBody }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: "Unknown error" }));
      onError?.(err.error || "AI service unavailable");
      onDone();
      return;
    }

    if (!resp.body) {
      onError?.("No response body");
      onDone();
      return;
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      let idx: number;
      while ((idx = buffer.indexOf("\n")) !== -1) {
        let line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);

        if (line.endsWith("\r")) line = line.slice(0, -1);
        if (!line.startsWith("data: ")) continue;

        const json = line.slice(6).trim();

        if (json === "[DONE]") {
          onDone();
          return;
        }

        try {
          const parsed = JSON.parse(json);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) onDelta(content);
        } catch {
          buffer = line + "\n" + buffer;
          break;
        }
      }
    }

    onDone();
  } catch (err) {
    onError?.(err instanceof Error ? err.message : "Unknown error");
    onDone();
  }
}
