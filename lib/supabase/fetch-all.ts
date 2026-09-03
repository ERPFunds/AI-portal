// PostgREST caps an unbounded select at 1,000 rows and returns them without complaint, so a
// table that grows past that starts silently losing rows from whole-table reads. The CRM
// tables crossed that line, which quietly emptied the Contact(s) column for accounts sorted
// past the cut. Anything that reads a whole table must page through it.

const PAGE = 1000;

type Pageable<T> = {
  range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>;
};

/**
 * Read every row of a query, a page at a time.
 * Pass a builder that makes a fresh query each call — a PostgREST builder can only be awaited once.
 */
export async function fetchAll<T>(makeQuery: () => Pageable<T>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await makeQuery().range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}
