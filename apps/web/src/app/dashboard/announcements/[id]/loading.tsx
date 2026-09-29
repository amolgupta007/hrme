import { Skeleton } from "@/components/ui/skeleton";

export default function AnnouncementStatusLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading acknowledgement status">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-8 w-2/3" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-80 rounded-xl" />
    </div>
  );
}
