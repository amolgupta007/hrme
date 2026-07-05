export type ByOrg<T> = ({ orgId: string; orgName: string } & T)[];
export type ExcludedOrg = { orgName: string; reason: string };

export function groupByOrg<Row, T extends object>(
  rows: Row[],
  orgs: { id: string; name: string }[],
  getOrgId: (r: Row) => string,
  build: (rowsForOrg: Row[]) => T
): ByOrg<T> {
  const byOrg = new Map<string, Row[]>();
  for (const o of orgs) byOrg.set(o.id, []);
  for (const r of rows) {
    const id = getOrgId(r);
    if (byOrg.has(id)) byOrg.get(id)!.push(r);
  }
  return orgs.map((o) => ({
    orgId: o.id,
    orgName: o.name,
    ...build(byOrg.get(o.id) ?? []),
  }));
}
