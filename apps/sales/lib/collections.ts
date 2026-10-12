import "server-only";
// Page through RLS-filtered records rather than silently hiding work at the
// hosted API's per-request row cap. Callers provide a stable ordering.
export async function allRows<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
 const rows: T[] = [];
 const size = 100;
 for (let from = 0; ; from += size) {
  const { data, error } = await page(from, from + size - 1);
  if (error) throw new Error("Sales records are unavailable.");
  rows.push(...(data || []));
  if ((data || []).length < size) return rows;
 }
}
