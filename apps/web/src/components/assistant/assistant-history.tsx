"use client";

import { useState, useEffect, useCallback } from "react";
import { Clock, Trash2, X, Plus, MessageSquare } from "lucide-react";
import { timeAgo } from "@/lib/utils";
import type { ConversationSummary, HistoryMessage } from "@/lib/assistant/conversations";

type HistoryProps = {
  currentId: string;
  onSelect: (id: string, messages: HistoryMessage[]) => void;
  onNew: () => void;
};

export function AssistantHistory({ currentId, onSelect, onNew }: HistoryProps) {
  const [open, setOpen] = useState(false);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchList = useCallback(async (q?: string) => {
    setLoading(true);
    try {
      const url = q
        ? `/api/assistant/conversations?search=${encodeURIComponent(q)}`
        : "/api/assistant/conversations";
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      fetchList(search || undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function handleSelect(id: string) {
    setLoadingId(id);
    try {
      const res = await fetch(`/api/assistant/conversations?id=${id}`);
      if (!res.ok) return;
      const data = await res.json();
      onSelect(id, data.messages ?? []);
      setOpen(false);
    } finally {
      setLoadingId(null);
    }
  }

  async function handleDelete(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    setDeletingId(id);
    try {
      const res = await fetch(`/api/assistant/conversations?id=${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setConversations((prev) => prev.filter((c) => c.id !== id));
        // If we deleted the currently-open conversation, start a new one
        if (id === currentId) {
          onNew();
          setOpen(false);
        }
      }
    } finally {
      setDeletingId(null);
    }
  }

  function handleSearch(val: string) {
    setSearch(val);
    fetchList(val || undefined);
  }

  const filtered = search
    ? conversations.filter((c) =>
        c.title.toLowerCase().includes(search.toLowerCase())
      )
    : conversations;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label="Conversation history"
      >
        <Clock className="h-3 w-3" />
        <span>History</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-end bg-black/40"
          onClick={() => setOpen(false)}
        >
          <div
            className="relative flex h-full w-full max-w-sm flex-col bg-background shadow-2xl sm:rounded-l-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <p className="text-sm font-semibold">Conversation history</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md p-1 text-muted-foreground hover:bg-muted"
                aria-label="Close history"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* New chat button */}
            <div className="border-b border-border px-4 py-2">
              <button
                type="button"
                onClick={() => {
                  onNew();
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-primary hover:bg-muted"
              >
                <Plus className="h-4 w-4" />
                New chat
              </button>
            </div>

            {/* Search */}
            <div className="border-b border-border px-4 py-2">
              <input
                type="text"
                value={search}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="Search conversations…"
                className="w-full rounded-md border border-border bg-muted/50 px-3 py-1.5 text-sm outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto py-2">
              {loading ? (
                <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
                  Loading…
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
                  <MessageSquare className="h-6 w-6 text-muted-foreground/50" />
                  <p className="text-xs text-muted-foreground">
                    {search ? "No conversations match your search." : "No past conversations yet."}
                  </p>
                </div>
              ) : (
                filtered.map((conv) => {
                  const isActive = conv.id === currentId;
                  const isLoadingThis = loadingId === conv.id;
                  const isDeletingThis = deletingId === conv.id;
                  return (
                    <div
                      key={conv.id}
                      className={`group flex cursor-pointer items-start gap-3 px-4 py-3 hover:bg-muted ${
                        isActive ? "bg-muted/60" : ""
                      }`}
                      onClick={() => handleSelect(conv.id)}
                    >
                      <div className="min-w-0 flex-1">
                        <p
                          className={`truncate text-sm font-medium ${
                            isLoadingThis ? "opacity-60" : ""
                          }`}
                        >
                          {conv.title}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {timeAgo(conv.updatedAt)}
                          {conv.messageCount > 0 && (
                            <span className="ml-1.5">
                              · {conv.messageCount}{" "}
                              {conv.messageCount === 1 ? "msg" : "msgs"}
                            </span>
                          )}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => handleDelete(e, conv.id)}
                        disabled={isDeletingThis}
                        className="mt-0.5 rounded p-1 text-muted-foreground opacity-0 hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 disabled:opacity-50"
                        aria-label={`Delete conversation: ${conv.title}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
