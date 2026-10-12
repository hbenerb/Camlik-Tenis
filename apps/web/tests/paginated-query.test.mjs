import assert from "node:assert/strict";
import test from "node:test";

import { loadAllPages } from "../src/lib/paginated-query.ts";

test("loads every page when the result exceeds Supabase's 1000-row limit", async () => {
  const source = Array.from({ length: 1039 }, (_, index) => index);
  const calls = [];

  const result = await loadAllPages(async (from, to) => {
    calls.push([from, to]);
    return { data: source.slice(from, to + 1), error: null };
  });

  assert.deepEqual(calls, [[0, 999], [1000, 1999]]);
  assert.deepEqual(result, { data: source, error: null });
});

test("stops and discards partial data when a later page fails", async () => {
  const result = await loadAllPages(async (from) => {
    if (from === 0) {
      return { data: [1, 2], error: null };
    }

    return { data: null, error: { message: "request failed" } };
  }, 2);

  assert.deepEqual(result, {
    data: [],
    error: { message: "request failed" },
  });
});
