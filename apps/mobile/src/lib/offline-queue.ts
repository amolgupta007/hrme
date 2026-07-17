/**
 * Offline punch queue — storage primitives only.
 *
 * Task 5 (Home screen clock-in/out) owns the actual drain loop: a NetInfo
 * connectivity listener that, once online, walks `peekAll()` oldest-first,
 * POSTs each to `/api/mobile/attendance/punch` (idempotent per
 * `clientEventId`, see `MobilePunchRequest`), and `remove()`s it on success.
 * This module intentionally stops at enqueue/peek/remove.
 */
import type { MobilePunchRequest } from "@jambahr/shared/mobile/types";
import {
  createAppStorage,
  offlineQueueNamespace,
  type AppStorage,
} from "@/lib/storage";

export type QueuedPunch = MobilePunchRequest & {
  /** ms since epoch when this punch was captured — oldest-first draining. */
  queuedAt: number;
};

const QUEUE_STORAGE_KEY = "offline-punch-queue";

export type OfflineQueue = {
  enqueue: (punch: QueuedPunch) => void;
  peekAll: () => QueuedPunch[];
  remove: (clientEventId: string) => void;
};

function readQueue(storage: AppStorage): QueuedPunch[] {
  const raw = storage.getItem(QUEUE_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as QueuedPunch[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(storage: AppStorage, items: QueuedPunch[]): void {
  storage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(items));
}

/**
 * `namespace` must be the identity namespace used elsewhere (the Clerk user
 * id — see `query.tsx`) so a queued punch can never be replayed against the
 * wrong account, and so the DPDP wipe (`wipeNamespaceStorage`) can find and
 * clear this queue when that identity signs out or is switched away from.
 */
export function createOfflineQueue(namespace: string): OfflineQueue {
  const storage = createAppStorage(offlineQueueNamespace(namespace));

  return {
    enqueue(punch) {
      const items = readQueue(storage);
      if (items.some((p) => p.clientEventId === punch.clientEventId)) return;
      items.push(punch);
      writeQueue(storage, items);
    },
    peekAll() {
      return readQueue(storage).sort((a, b) => a.queuedAt - b.queuedAt);
    },
    remove(clientEventId) {
      writeQueue(
        storage,
        readQueue(storage).filter((p) => p.clientEventId !== clientEventId)
      );
    },
  };
}
