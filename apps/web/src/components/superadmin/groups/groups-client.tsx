"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  createGroup,
  addOrgToGroup,
  removeOrgFromGroup,
  scanGroupPinCollisions,
  type CompanyGroupRow,
  type PinCollision,
} from "@/actions/company-groups";

export function GroupsClient({
  initialGroups,
  ungroupedOrgs,
}: {
  initialGroups: CompanyGroupRow[];
  ungroupedOrgs: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [newName, setNewName] = useState("");
  const [addSel, setAddSel] = useState<Record<string, string>>({});
  const [collisions, setCollisions] = useState<Record<string, PinCollision[]>>({});
  const [busy, setBusy] = useState(false);

  async function doCreate() {
    if (!newName.trim()) return toast.error("Enter a group name");
    setBusy(true);
    const res = await createGroup(newName.trim());
    setBusy(false);
    if (res.success) {
      toast.success("Group created");
      setNewName("");
      router.refresh();
    } else toast.error(res.error);
  }

  async function doAdd(groupId: string) {
    const orgId = addSel[groupId];
    if (!orgId) return toast.error("Pick an organization");
    setBusy(true);
    const res = await addOrgToGroup({ groupId, orgId });
    setBusy(false);
    if (res.success) {
      if (res.data.collisions.length > 0) {
        setCollisions((c) => ({ ...c, [groupId]: res.data.collisions }));
        toast.warning(`Added, but ${res.data.collisions.length} PIN(s) collide across the group`);
      } else {
        toast.success("Organization added to group");
      }
      router.refresh();
    } else toast.error(res.error);
  }

  async function doRemove(orgId: string) {
    setBusy(true);
    const res = await removeOrgFromGroup(orgId);
    setBusy(false);
    if (res.success) {
      toast.success("Organization removed");
      router.refresh();
    } else toast.error(res.error);
  }

  async function doScan(groupId: string) {
    const res = await scanGroupPinCollisions(groupId);
    if (res.success) {
      setCollisions((c) => ({ ...c, [groupId]: res.data }));
      toast.success(res.data.length === 0 ? "No PIN collisions" : `${res.data.length} PIN collision(s)`);
    } else toast.error(res.error);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">Company Groups</h1>
        <p className="text-sm text-muted-foreground">
          Link multiple organizations into one business group. Employees of grouped orgs can punch
          at any group location and be attributed to their own payroll org. Cross-org attribution
          resolves by employee PIN, so PINs must be unique across the group.
        </p>
      </div>

      {/* Create */}
      <div className="flex items-end gap-2 rounded-lg border p-4">
        <label className="flex-1 text-sm">
          New group name
          <input
            className="mt-1 w-full rounded-md border px-3 py-2"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. TMP"
          />
        </label>
        <button
          onClick={doCreate}
          disabled={busy}
          className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
        >
          Create group
        </button>
      </div>

      {/* Groups */}
      {initialGroups.length === 0 && (
        <p className="text-sm text-muted-foreground">No groups yet.</p>
      )}
      {initialGroups.map((g) => (
        <div key={g.id} className="space-y-3 rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">{g.name}</h2>
            <button
              onClick={() => doScan(g.id)}
              className="rounded-md border px-2 py-1 text-xs hover:bg-muted"
            >
              Scan PIN collisions
            </button>
          </div>

          <ul className="space-y-1">
            {g.members.length === 0 && (
              <li className="text-sm text-muted-foreground">No organizations in this group.</li>
            )}
            {g.members.map((m) => (
              <li key={m.org_id} className="flex items-center justify-between text-sm">
                <span>{m.org_name}</span>
                <button
                  onClick={() => doRemove(m.org_id)}
                  disabled={busy}
                  className="text-xs text-muted-foreground hover:text-destructive"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>

          {collisions[g.id] && collisions[g.id].length > 0 && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs">
              <p className="font-medium text-destructive">PIN collisions — resolve before relying on cross-org:</p>
              <ul className="mt-1 space-y-0.5">
                {collisions[g.id].map((c) => (
                  <li key={c.pin}>
                    PIN {c.pin} in {c.orgs.map((o) => o.org_name).join(", ")}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Add org */}
          <div className="flex items-center gap-2 border-t pt-3">
            <select
              className="flex-1 rounded-md border px-2 py-1.5 text-sm"
              value={addSel[g.id] ?? ""}
              onChange={(e) => setAddSel((s) => ({ ...s, [g.id]: e.target.value }))}
            >
              <option value="">Add an organization…</option>
              {ungroupedOrgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
            <button
              onClick={() => doAdd(g.id)}
              disabled={busy}
              className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
            >
              Add
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
