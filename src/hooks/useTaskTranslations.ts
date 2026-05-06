import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  getCachedTranslation,
  setCachedTranslations,
  makeKey,
  isTranslatedCopyUsable,
} from "@/lib/translationCache";

export interface TranslatableTask {
  id: string;
  title: string | null;
  description: string | null;
}

export interface DisplayCopy {
  title: string;
  description: string | null;
}

/**
 * Unified translation cache + on-demand AI translation for task title/description.
 * Used by Tasks, NearbyOrders, Dashboard, and other task list surfaces so all
 * lists share the same cache and behave consistently across EN/RU/HE/AR.
 *
 * Always falls back to the original task copy when no usable translation
 * is available for the current locale.
 */
export function useTaskTranslations(locale: string, tasks: TranslatableTask[]) {
  const [translated, setTranslated] = useState<Record<string, DisplayCopy>>({});

  // Hydrate from localStorage cache when locale/tasks change.
  useEffect(() => {
    const fromCache: Record<string, DisplayCopy> = {};
    for (const task of tasks) {
      const key = makeKey(locale, task.id);
      if (translated[key]) continue;
      const cached = getCachedTranslation(locale, task.id);
      if (
        cached &&
        isTranslatedCopyUsable(locale, task.title || "", task.description, cached)
      ) {
        fromCache[key] = { title: cached.title, description: cached.description };
      }
    }
    if (Object.keys(fromCache).length > 0) {
      setTranslated((prev) => ({ ...prev, ...fromCache }));
    }
  }, [locale, tasks, translated]);

  // Fetch missing translations from AI.
  useEffect(() => {
    const need = tasks
      .filter((task) => task.title || task.description)
      .filter((task) => {
        const key = makeKey(locale, task.id);
        if (
          isTranslatedCopyUsable(
            locale,
            task.title || "",
            task.description,
            translated[key],
          )
        ) {
          return false;
        }
        const cached = getCachedTranslation(locale, task.id);
        return !isTranslatedCopyUsable(
          locale,
          task.title || "",
          task.description,
          cached,
        );
      });

    if (need.length === 0) return;
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase.functions.invoke("ai-task-assistant", {
        body: {
          type: "translate_tasks",
          targetLocale: locale,
          tasks: need.map(({ id, title, description }) => ({
            id,
            title: title || "",
            description,
          })),
        },
      });
      if (cancelled || error || !data?.translations) return;

      const valid = (data.translations as Array<{ id: string; title: string; description: string | null }>)
        .map((tr) => {
          const orig = need.find((task) => task.id === tr.id);
          if (!orig) return null;
          const next = {
            id: tr.id,
            title: tr.title || orig.title || "",
            description: tr.description ?? orig.description,
          };
          return isTranslatedCopyUsable(
            locale,
            orig.title || "",
            orig.description,
            next,
          )
            ? next
            : null;
        })
        .filter((tr): tr is { id: string; title: string; description: string | null } => Boolean(tr));

      if (valid.length === 0) return;
      setCachedTranslations(locale, valid);
      setTranslated((prev) => {
        const next = { ...prev };
        valid.forEach((tr) => {
          next[makeKey(locale, tr.id)] = {
            title: tr.title,
            description: tr.description,
          };
        });
        return next;
      });
    })().catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [locale, tasks, translated]);

  const getDisplayCopy = (task: TranslatableTask): DisplayCopy => {
    const key = makeKey(locale, task.id);
    const inState = translated[key];
    if (
      isTranslatedCopyUsable(locale, task.title || "", task.description, inState)
    ) {
      return inState;
    }
    const cached = getCachedTranslation(locale, task.id);
    if (
      cached &&
      isTranslatedCopyUsable(locale, task.title || "", task.description, cached)
    ) {
      return { title: cached.title, description: cached.description };
    }
    return { title: task.title || "", description: task.description };
  };

  return { getDisplayCopy, translated };
}
