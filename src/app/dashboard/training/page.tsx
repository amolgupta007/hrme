export default function TrainingPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Training & Compliance
          </h1>
          <p className="mt-1 text-muted-foreground">
            Assign courses, track completion, and ensure compliance.
          </p>
        </div>
        <button className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors">
          Create Course
        </button>
      </div>

      <div className="rounded-xl border border-dashed border-border p-12 text-center">
        <p className="text-muted-foreground">
          Training courses and compliance tracking will appear here once
          Supabase is connected.
        </p>
      </div>
    </div>
  );
}
