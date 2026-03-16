export default function EmployeesPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Employees</h1>
          <p className="mt-1 text-muted-foreground">
            Manage your team directory and employee profiles.
          </p>
        </div>
        <button className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors">
          Add Employee
        </button>
      </div>

      {/* Placeholder for employee table */}
      <div className="rounded-xl border border-dashed border-border p-12 text-center">
        <p className="text-muted-foreground">
          Employee directory will appear here once Supabase is connected.
        </p>
      </div>
    </div>
  );
}
