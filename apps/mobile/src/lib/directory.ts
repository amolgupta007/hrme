/** Query key for the People/Directory tab (Task 7). orgId in the key. */
export function directoryQueryKey(orgId: string | null | undefined) {
  return ["mobile", "directory", orgId] as const;
}

/** Role → chip styling for the directory role badge (design usage: status on tint). */
export function roleBadge(role: string): { label: string; bg: string; fg: string } {
  switch (role) {
    case "owner":
      return { label: "Owner", bg: "bg-info-tint", fg: "text-info-ontint" };
    case "admin":
      return { label: "Admin", bg: "bg-info-tint", fg: "text-info-ontint" };
    case "manager":
      return { label: "Manager", bg: "bg-brand-tint", fg: "text-brand-pressed" };
    default:
      return { label: "Employee", bg: "bg-[#EFF1F3]", fg: "text-ink-600" };
  }
}
