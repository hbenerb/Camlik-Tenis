type PageResult<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

export async function loadAllPages<T>(
  loadPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  pageSize = 1000,
): Promise<{ data: T[]; error: { message: string } | null }> {
  if (!Number.isInteger(pageSize) || pageSize <= 0) {
    throw new Error("pageSize must be a positive integer");
  }

  const rows: T[] = [];

  while (true) {
    const from = rows.length;
    const result = await loadPage(from, from + pageSize - 1);

    if (result.error) {
      return { data: [], error: result.error };
    }

    const page = result.data ?? [];
    rows.push(...page);

    if (page.length < pageSize) {
      return { data: rows, error: null };
    }
  }
}
