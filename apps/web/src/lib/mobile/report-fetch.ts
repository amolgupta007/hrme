// Server-only. Plain module (NOT "use server") so nothing here becomes a
// browser-callable RPC — mirrors the `"use server"` boundary rule already
// applied to src/lib/whatsapp/load-config.ts and src/lib/attendance/late-policy-dispatch.ts
// (gotcha #85).
//
// Pages through PostgREST's 1000-row cap and stitches the pages together.
// Same idiom as the private `fetchAll` in src/lib/reports/fetch-report-data.ts
// (kept standalone here rather than importing that module's internal helper,
// since the mobile Reports routes are a distinct, lighter-weight surface —
// see task-7-report.md for the reuse-vs-fresh-write decision).
const PAGE = 1000;

export async function fetchAllRows<T>(
  makeQuery: (
    fromIdx: number,
    toIdx: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let page = 0; ; page++) {
    const { data, error } = await makeQuery(page * PAGE, page * PAGE + PAGE - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < PAGE) break;
  }
  return out;
}
