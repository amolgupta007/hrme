export type LatePolicyTarget = { target_type: "department" | "employee"; target_id: string };

export function resolveCoveredEmployeeIds(params: {
  targets: LatePolicyTarget[];
  employees: Array<{ id: string; department_id: string | null }>;
}): Set<string> {
  const { targets, employees } = params;
  const deptIds = new Set(targets.filter((t) => t.target_type === "department").map((t) => t.target_id));
  const empIds = new Set(targets.filter((t) => t.target_type === "employee").map((t) => t.target_id));
  const covered = new Set<string>();
  for (const e of employees) {
    if (empIds.has(e.id)) covered.add(e.id);
    else if (e.department_id && deptIds.has(e.department_id)) covered.add(e.id);
  }
  return covered;
}
