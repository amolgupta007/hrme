import { listDocuments } from "@/actions/documents";
import { listEmployees } from "@/actions/employees";
import { DocumentsClient } from "@/components/documents/documents-client";

export default async function DocumentsPage() {
  const [docsResult, empsResult] = await Promise.all([
    listDocuments(),
    listEmployees(),
  ]);

  const documents = docsResult.success ? docsResult.data : [];
  const employees = empsResult.success ? empsResult.data : [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Documents</h1>
        <p className="mt-1 text-muted-foreground">
          Company policies, contracts, and employee files.
        </p>
      </div>

      <DocumentsClient documents={documents} employees={employees} />
    </div>
  );
}
