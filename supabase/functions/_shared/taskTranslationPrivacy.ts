// Translation input must come from caller-readable database rows, not supplied
// titles or the service-role cache. Moving free text is always private.
export const MOVING_CATEGORY_ID = "513b748c-2dbf-47ab-b155-5555e0d33765";

type TranslationRow = { id: string; title: string | null; description: string | null; category_id: string | null };
export function safeTranslationInputs(requested: Array<{ id: string }>, readable: TranslationRow[]) {
  const rows = new Map(readable.map(row => [row.id, row]));
  return requested.flatMap(({ id }) => {
    const row = rows.get(id);
    if (!row) return [];
    if (row.category_id === MOVING_CATEGORY_ID) {
      return [{ id, title: "Moving", description: null, privateMoving: true }];
    }
    return [{ id, title: row.title || "", description: row.description, privateMoving: false }];
  });
}