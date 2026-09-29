"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Megaphone, Plus, Search, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DestructiveDialog } from "@/components/ui/destructive-dialog";
import { AnnouncementCard } from "@/components/announcements/announcement-card";
import { ComposerDialog } from "@/components/announcements/composer-dialog";
import { AcknowledgeDialog } from "@/components/announcements/acknowledge-dialog";
import { deleteAnnouncement, togglePin, type Announcement } from "@/actions/announcements";
import { ANNOUNCEMENT_CATEGORIES, CATEGORY_META, announcementAnchor } from "@/lib/announcements/categories";
import type { UserRole } from "@/types";
import { hasPermission } from "@/types";

interface AnnouncementsClientProps {
  announcements: Announcement[];
  role: UserRole;
  /** Set when the list failed to load — rendered as an error, never as "empty". */
  loadError?: string | null;
}

type View = "all" | "needs_ack" | "pinned";

export function AnnouncementsClient({ announcements, role, loadError }: AnnouncementsClientProps) {
  const router = useRouter();
  const canManage = hasPermission(role, "admin");

  const [items, setItems] = React.useState(announcements);
  React.useEffect(() => setItems(announcements), [announcements]);

  const [composerOpen, setComposerOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Announcement | null>(null);
  const [acking, setAcking] = React.useState<Announcement | null>(null);
  const [deleting, setDeleting] = React.useState<Announcement | null>(null);
  const [deleteBusy, setDeleteBusy] = React.useState(false);

  const [query, setQuery] = React.useState("");
  const [category, setCategory] = React.useState<string>("all");
  const needsAckCount = items.filter((a) => a.my_ack && a.my_ack.state !== "acknowledged").length;
  const [view, setView] = React.useState<View>(needsAckCount > 0 && !canManage ? "needs_ack" : "all");

  // Deep link (#announcement-<id>, used by reminder emails): scroll + highlight.
  const [highlightId, setHighlightId] = React.useState<string | null>(null);
  React.useEffect(() => {
    const hash = window.location.hash.replace(/^#/, "");
    const match = items.find((a) => announcementAnchor(a.id) === hash);
    if (!match) return;
    setView("all");
    setHighlightId(match.id);
    requestAnimationFrame(() => document.getElementById(hash)?.scrollIntoView({ behavior: "smooth", block: "start" }));
    if (match.my_ack && match.my_ack.state !== "acknowledged") setAcking(match);
    const t = setTimeout(() => setHighlightId(null), 2500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const q = query.trim().toLowerCase();
  const visible = items.filter((a) => {
    if (view === "needs_ack" && !(a.my_ack && a.my_ack.state !== "acknowledged")) return false;
    if (view === "pinned" && !a.is_pinned) return false;
    if (category !== "all" && a.category !== category) return false;
    if (q && !`${a.title} ${a.body}`.toLowerCase().includes(q)) return false;
    return true;
  });

  function openCreate() {
    setEditing(null);
    setComposerOpen(true);
  }

  async function handlePin(a: Announcement) {
    setItems((prev) => prev.map((x) => (x.id === a.id ? { ...x, is_pinned: !a.is_pinned } : x)));
    const res = await togglePin(a.id, !a.is_pinned);
    if (!res.success) {
      setItems((prev) => prev.map((x) => (x.id === a.id ? { ...x, is_pinned: a.is_pinned } : x)));
      toast.error(res.error);
    } else {
      toast.success(a.is_pinned ? "Unpinned" : "Pinned to top");
      router.refresh();
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    const res = await deleteAnnouncement(deleting.id);
    setDeleteBusy(false);
    if (!res.success) return void toast.error(res.error);
    setItems((prev) => prev.filter((x) => x.id !== deleting.id));
    toast.success(res.data.archived ? "Announcement archived — acknowledgement records kept" : "Announcement deleted");
    setDeleting(null);
    router.refresh();
  }

  function handleAcknowledged(id: string, acknowledgedAt: string) {
    setItems((prev) =>
      prev.map((x) => (x.id === id ? { ...x, my_ack: { state: "acknowledged", acknowledged_at: acknowledgedAt } } : x))
    );
    router.refresh();
  }

  const deletingHasAcks = (deleting?.ack_totals?.acknowledged ?? 0) > 0;

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Announcements</h1>
          <p className="mt-1 text-muted-foreground">Updates and notices from your organisation.</p>
        </div>
        {canManage && (
          <Button onClick={openCreate} className="self-start sm:self-auto">
            <Plus className="mr-2 h-4 w-4" />
            New announcement
          </Button>
        )}
      </div>

      {!loadError && items.length > 0 && (
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="inline-flex w-full rounded-lg border border-border bg-muted/40 p-1 md:w-auto" role="tablist">
            <ViewTab active={view === "all"} onClick={() => setView("all")}>
              All
            </ViewTab>
            {needsAckCount > 0 && (
              <ViewTab active={view === "needs_ack"} onClick={() => setView("needs_ack")}>
                <ShieldCheck className="h-3.5 w-3.5" />
                Needs my acknowledgement
                <span className="rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                  {needsAckCount}
                </span>
              </ViewTab>
            )}
            <ViewTab active={view === "pinned"} onClick={() => setView("pinned")}>
              Pinned
            </ViewTab>
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1 md:w-64">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search announcements"
                className="pl-8"
                aria-label="Search announcements"
              />
            </div>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-36" aria-label="Filter by category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {ANNOUNCEMENT_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {CATEGORY_META[c].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {loadError ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-destructive/30 bg-destructive/5 px-6 py-14 text-center">
          <AlertCircle className="mb-3 h-8 w-8 text-destructive" />
          <p className="font-medium">Announcements couldn&apos;t be loaded</p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            This is usually temporary. Try again in a moment.
          </p>
          <Button variant="outline" className="mt-4" onClick={() => router.refresh()}>
            Try again
          </Button>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border px-6 py-16 text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Megaphone className="h-6 w-6 text-primary" />
          </div>
          <p className="font-medium">No announcements yet</p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            {canManage
              ? "Share policy updates, events and urgent notices with your team — and ask them to acknowledge when it matters."
              : "When your organisation posts an update, it will appear here."}
          </p>
          {canManage && (
            <Button className="mt-4" onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" />
              Post the first announcement
            </Button>
          )}
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
          {view === "needs_ack" ? "You're all caught up — nothing left to acknowledge." : "No announcements match your filters."}
          {(q || category !== "all") && (
            <button
              className="ml-1 font-medium text-primary underline-offset-2 hover:underline"
              onClick={() => {
                setQuery("");
                setCategory("all");
              }}
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {visible.map((a) => (
            <AnnouncementCard
              key={a.id}
              announcement={a}
              canManage={canManage}
              highlighted={highlightId === a.id}
              onEdit={() => {
                setEditing(a);
                setComposerOpen(true);
              }}
              onDelete={() => setDeleting(a)}
              onTogglePin={() => handlePin(a)}
              onAcknowledge={() => setAcking(a)}
            />
          ))}
        </div>
      )}

      {canManage && (
        <ComposerDialog
          open={composerOpen}
          editing={editing}
          onOpenChange={(o) => {
            setComposerOpen(o);
            if (!o) router.refresh();
          }}
        />
      )}

      <AcknowledgeDialog
        announcement={acking}
        onOpenChange={(o) => !o && setAcking(null)}
        onAcknowledged={handleAcknowledged}
      />

      <DestructiveDialog
        open={!!deleting}
        onOpenChange={(o) => !o && !deleteBusy && setDeleting(null)}
        title={deletingHasAcks ? "Archive announcement?" : "Delete announcement?"}
        description={
          deletingHasAcks
            ? "People have already acknowledged this announcement, so it will be archived instead of deleted: it disappears for everyone, but the acknowledgement records are kept for your audit trail."
            : `“${deleting?.title ?? ""}” will be permanently removed for everyone.`
        }
        confirmLabel={deletingHasAcks ? "Archive" : "Delete"}
        loading={deleteBusy}
        onConfirm={confirmDelete}
      />
    </>
  );
}

function ViewTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors md:flex-none",
        active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}
