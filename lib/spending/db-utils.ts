const PAGE_SIZE = 1000;

/**
 * Supabase/PostgREST silently caps a query at 1000 rows unless you page
 * through it with `.range()`. A single statement import (e.g. a year of
 * Amex transactions) can already exceed that, so anything that needs *every*
 * matching row — transfer matching, bulk merchant recategorisation — must
 * page rather than issue one unbounded `select()`.
 */
export async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const all: T[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await fetchPage(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return all;
}
