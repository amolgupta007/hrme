import { redirect } from "next/navigation";
import { isSuperadminAuthenticated } from "@/lib/superadmin-auth";
import { listGroups, listUngroupedOrgs } from "@/actions/company-groups";
import { GroupsClient } from "@/components/superadmin/groups/groups-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "JambaHR Admin — Company Groups" };

export default async function SuperadminGroupsPage() {
  if (!isSuperadminAuthenticated()) redirect("/superadmin/login");

  const [groupsRes, orgsRes] = await Promise.all([listGroups(), listUngroupedOrgs()]);
  const groups = groupsRes.success ? groupsRes.data : [];
  const ungroupedOrgs = orgsRes.success ? orgsRes.data : [];

  return <GroupsClient initialGroups={groups} ungroupedOrgs={ungroupedOrgs} />;
}
