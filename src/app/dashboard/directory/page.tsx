import { listDirectoryEmployees } from "@/actions/directory";
import { DirectoryClient } from "@/components/directory/directory-client";

export default async function DirectoryPage() {
  const result = await listDirectoryEmployees();
  const employees = result.success ? result.data : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Employee Directory</h1>
        <p className="mt-1 text-muted-foreground">
          Browse the team, reporting structure, and org hierarchy.
        </p>
      </div>
      <DirectoryClient employees={employees} />
    </div>
  );
}
