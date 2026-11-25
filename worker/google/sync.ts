import type { Env } from "../env";

/** Implementación completa en la Task 3. */
export async function syncCalendar(_env: Env): Promise<{ created: number; updated: number; deleted: number; errors: number; skipped?: string }> {
  return { created: 0, updated: 0, deleted: 0, errors: 0, skipped: "not_implemented" };
}
