"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Plus, Megaphone, MoreHorizontal, Pin, PinOff, Pencil, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { cn, formatDate, timeAgo } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  togglePin,
} from "@/actions/announcements";
import type { Announcement } from "@/actions/announcements";
import type { UserRole } from "@/types";
import { hasPermission } from "@/types";

interface AnnouncementsClientProps {
  announcements: Announcement[];
  role: UserRole;
}

export function AnnouncementsClient({ announcements, role }: AnnouncementsClientProps) {
  const canManage = hasPermission(role, "admin");
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Announcement | null>(null);

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(a: Announcement) {
    setEditing(a);
    setDialogOpen(true);
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Announcements</h1>
          <p className="mt-1 text-muted-foreground">Company-wide notices from your team.</p>
        </div>
        {canManage && (
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            New Announcement
          </Button>
        )}
      </div>

      {announcements.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-20 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <Megaphone className="h-7 w-7 text-muted-foreground" />
          </div>
          <div>
            <p className="font-medium">No announcements yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {canManage
                ? "Post your first announcement to keep the team informed."
                : "No announcements have been posted yet."}
            </p>
          </div>
          {canManage && (
            <Button variant="outline" size="sm" onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" />
              New Announcement
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {announcements.map((a) => (
            <AnnouncementCard
              key={a.id}
              announcement={a}
              canManage={canManage}
              onEdit={openEdit}
            />
          ))}
        </div>
      )}

      {canManage && (
        <AnnouncementDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          announcement={editing}
        />
      )}
    </>
  );
}

function AnnouncementCard({
  announcement: a,
  canManage,
  onEdit,
}: {
  announcement: Announcement;
  canManage: boolean;
  onEdit: (a: Announcement) => void;
}) {
  const [acting, setActing] = React.useState(false);

  async function handleDelete() {
    if (!confirm(`Delete "${a.title}"? This cannot be undone.`)) return;
    setActing(true);
    const result = await deleteAnnouncement(a.id);
    setActing(false);
    if (result.success) {
      toast.success("Announcement deleted");
    } else {
      toast.error(result.error);
    }
  }

  async function handleTogglePin() {
    setActing(true);
    const result = await togglePin(a.id, !a.is_pinned);
    setActing(false);
    if (result.success) {
      toast.success(a.is_pinned ? "Unpinned" : "Pinned");
    } else {
      toast.error(result.error);
    }
  }

  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-5 transition-colors",
        a.is_pinned
          ? "border-primary/40 bg-primary/5 dark:bg-primary/10"
          : "border-border"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          {a.is_pinned && (
            <Pin className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          )}
          <div className="min-w-0">
            <p className="font-semibold leading-snug">{a.title}</p>
            <p className="mt-2 text-sm text-foreground/80 whitespace-pre-wrap">{a.body}</p>
          </div>
        </div>

        {canManage && (
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" disabled={acting}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="end"
                className="z-50 min-w-[160px] overflow-hidden rounded-lg border bg-popover p-1 shadow-md"
              >
                <DropdownMenu.Item
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none hover:bg-accent"
                  onSelect={handleTogglePin}
                >
                  {a.is_pinned ? (
                    <><PinOff className="h-3.5 w-3.5" /> Unpin</>
                  ) : (
                    <><Pin className="h-3.5 w-3.5" /> Pin to top</>
                  )}
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none hover:bg-accent"
                  onSelect={() => onEdit(a)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </DropdownMenu.Item>
                <DropdownMenu.Separator className="my-1 h-px bg-border" />
                <DropdownMenu.Item
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-destructive outline-none hover:bg-destructive/10"
                  onSelect={handleDelete}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        )}
      </div>

      <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
        {a.created_by_name && <span>Posted by {a.created_by_name}</span>}
        <span title={formatDate(a.created_at)}>{timeAgo(a.created_at)}</span>
        {a.is_pinned && (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary font-medium">
            Pinned
          </span>
        )}
      </div>
    </div>
  );
}

function AnnouncementDialog({
  open,
  onOpenChange,
  announcement,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  announcement: Announcement | null;
}) {
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [isPinned, setIsPinned] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [errors, setErrors] = React.useState<{ title?: string; body?: string }>({});

  React.useEffect(() => {
    if (open) {
      setTitle(announcement?.title ?? "");
      setBody(announcement?.body ?? "");
      setIsPinned(announcement?.is_pinned ?? false);
      setErrors({});
    }
  }, [open, announcement]);

  async function handleSubmit() {
    const newErrors: typeof errors = {};
    if (!title.trim()) newErrors.title = "Title is required";
    if (!body.trim()) newErrors.body = "Body is required";
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setLoading(true);
    const data = { title: title.trim(), body: body.trim(), is_pinned: isPinned };
    const result = announcement
      ? await updateAnnouncement(announcement.id, data)
      : await createAnnouncement(data);
    setLoading(false);

    if (result.success) {
      toast.success(announcement ? "Announcement updated" : "Announcement posted");
      onOpenChange(false);
    } else {
      toast.error(result.error);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-background p-6 shadow-lg">
          <div className="flex items-center justify-between mb-5">
            <Dialog.Title className="text-lg font-semibold">
              {announcement ? "Edit Announcement" : "New Announcement"}
            </Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <X className="h-4 w-4" />
              </Button>
            </Dialog.Close>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">Title</label>
              <input
                className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                placeholder="e.g. Office closed on Friday"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              {errors.title && <p className="mt-1 text-xs text-destructive">{errors.title}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5">Message</label>
              <textarea
                className="flex min-h-[120px] w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 resize-none"
                placeholder="Write your announcement here..."
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
              {errors.body && <p className="mt-1 text-xs text-destructive">{errors.body}</p>}
            </div>

            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-input accent-primary"
                checked={isPinned}
                onChange={(e) => setIsPinned(e.target.checked)}
              />
              <span className="text-sm">Pin to top</span>
            </label>
          </div>

          <div className="flex justify-end gap-3 mt-6">
            <Dialog.Close asChild>
              <Button variant="outline" disabled={loading}>Cancel</Button>
            </Dialog.Close>
            <Button onClick={handleSubmit} disabled={loading}>
              {loading ? "Saving..." : announcement ? "Save Changes" : "Post Announcement"}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
