const PAGE_SIZE = 1000

interface RangeableQuery {
  range(
    from: number,
    to: number
  ): PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>
}

/**
 * Fetch every row a query matches, paging past PostgREST's max-rows cap
 * (1000 by default), and throw on the first error instead of returning a
 * partial result. `makeQuery` must build a fresh, deterministically ordered
 * query (include `.order(...)`) so pages don't overlap or skip rows.
 */
export async function fetchAllRows<T>(makeQuery: () => RangeableQuery): Promise<T[]> {
  const all: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await makeQuery().range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    const rows = (data ?? []) as T[]
    all.push(...rows)
    if (rows.length < PAGE_SIZE) return all
  }
}
