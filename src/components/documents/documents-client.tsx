"use client";

import * as React from "react";
import {
  Search, Upload, FileText, FileImage, File, Trash2,
  Download, Building2, User, AlertCircle, CheckCircle2,
  Lock, Users, PenLine,
} from "lucide-react";
import { toast } from "sonner";
import { cn, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { deleteDocument, acknowledgeDocument } from "@/actions/documents";
import { UploadDialog } from "./upload-dialog";
import { AcknowledgeDialog } from "./acknowledge-dialog";
import { SignedRecordsTab } from "./signed-records-tab";
import type { DocumentWithUrl, SignedRecord } from "@/actions/documents";
import type { Employee, UserRole } from "@/types";
import { hasPermission } from "@/types";

const CATEGORY_LABELS: Record<string, string> = {
  policy: "Policy",
  contract: "Contract",
  id_proof: "ID Proof",
  tax: "Tax",
  certificate: "Certificate",
  other: "Other",
};

const CATEGORY_COLORS: Record<string, string> = {
  policy: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  contract: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  id_proof: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  tax: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  certificate: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300",
  other: "bg-muted text-muted-foreground",
};

type SpaceTab = "company_wide" | "personal" | "owner_vault" | "signed_records";

function FileIcon({ mime }: { mime: string }) {
  if (mime.startsWith("image/")) return <FileImage className="h-5 w-5 text-blue-500" />;
  if (mime === "application/pdf") return <FileText className="h-5 w-5 text-red-500" />;
  return <File className="h-5 w-5 text-muted-foreground" />;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface DocumentsClientProps {
  documents: DocumentWithUrl[];
  employees: Employee[];
  role: UserRole;
  signedRecords: SignedRecord[];
}

export function DocumentsClient({
  documents,
  employees,
  role,
  signedRecords,
}: DocumentsClientProps) {
  const canManage = hasPermission(role, "admin");
  const [activeTab, setActiveTab] = React.useState<SpaceTab>("company_wide");
  const [search, setSearch] = React.useState("");
  const [uploadOpen, setUploadOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState<string | null>(null);
  const [acknowledging, setAcknowledging] = React.useState<string | null>(null);
  const [signDoc, setSignDoc] = React.useState<DocumentWithUrl | null>(null);

  const tabs: { id: SpaceTab; label: string; icon: React.ReactNode }[] = [
    { id: "company_wide", label: "Company Wide", icon: <Users className="h-4 w-4" /> },
    { id: "personal", label: "Personal Files", icon: <User className="h-4 w-4" /> },
    ...(canManage
      ? [
          { id: "owner_vault" as SpaceTab, label: "Owner Vault", icon: <Lock className="h-4 w-4" /> },
          { id: "signed_records" as SpaceTab, label: "Signed Records", icon: <PenLine className="h-4 w-4" /> },
        ]
      : []),
  ];

  const filtered = documents.filter((doc) => {
    if (activeTab === "signed_records") return false;
    if (doc.space !== activeTab) return false;
    const q = search.toLowerCase();
    return (
      doc.name.toLowerCase().includes(q) ||
      (doc.employee_name ?? "").toLowerCase().includes(q) ||
      CATEGORY_LABELS[doc.category]?.toLowerCase().includes(q)
    );
  });

  async function handleDelete(doc: DocumentWithUrl) {
    if (!confirm(`Delete "${doc.name}"? This cannot be undone.`)) return;
    setDeleting(doc.id);
    const result = await deleteDocument(doc.id);
    setDeleting(null);
    if (result.success) {
      toast.success("Document deleted");
    } else {
      toast.error(result.error);
    }
  }

  async function handleAuditAcknowledge(doc: DocumentWithUrl) {
    setAcknowledging(doc.id);
    const result = await acknowledgeDocument(doc.id, "audit_trail");
    setAcknowledging(null);
    if (result.success) {
      toast.success(`"${doc.name}" acknowledged`);
    } else {
      toast.error(result.error);
    }
  }

  return (
    <>
      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-border overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => { setActiveTab(tab.id); setSearch(""); }}
            className={cn(
              "flex items-center gap-1.5 shrink-0 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors",
              activeTab === tab.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Signed Records tab */}
      {activeTab === "signed_records" ? (
        <SignedRecordsTab records={signedRecords} />
      ) : (
        <>
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                className="flex h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                placeholder="Search documents..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {canManage && (
              <Button onClick={() => setUploadOpen(true)} className="ml-auto shrink-0">
                <Upload className="mr-2 h-4 w-4" />
                Upload
              </Button>
            )}
          </div>

          <p className="text-sm text-muted-foreground">
            {filtered.length} {filtered.length === 1 ? "document" : "documents"}
          </p>

          {/* Document list */}
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
              <FileText className="h-10 w-10 text-muted-foreground/40" />
              <div>
                <p className="font-medium text-sm">No documents found</p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {documents.filter((d) => d.space === activeTab).length === 0
                    ? "Upload your first document to get started."
                    : "Try adjusting your search."}
                </p>
              </div>
              {documents.filter((d) => d.space === activeTab).length === 0 && canManage && (
                <Button variant="outline" size="sm" onClick={() => setUploadOpen(true)}>
                  <Upload className="mr-2 h-4 w-4" />
                  Upload Document
                </Button>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="divide-y divide-border">
                {filtered.map((doc) => (
                  <div key={doc.id} className="flex items-center gap-4 px-4 py-3 hover:bg-muted/30 transition-colors">
                    <FileIcon mime={doc.mime_type} />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium truncate">{doc.name}</p>
                        <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", CATEGORY_COLORS[doc.category])}>
                          {CATEGORY_LABELS[doc.category]}
                        </span>
                        {doc.requires_acknowledgment && (
                          doc.acknowledged_by_me ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 px-2 py-0.5 text-xs font-medium">
                              <CheckCircle2 className="h-3 w-3" />
                              {doc.ack_method === "type_name" ? "Signed" : "Acknowledged"}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 px-2 py-0.5 text-xs font-medium">
                              <AlertCircle className="h-3 w-3" />
                              {doc.ack_method === "type_name" ? "Signature required" : "Ack required"}
                            </span>
                          )
                        )}
                        {canManage && doc.requires_acknowledgment && doc.acknowledgment_count > 0 && (
                          <span className="text-xs text-muted-foreground">
                            {doc.acknowledgment_count} acknowledged
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          {doc.is_company_wide ? (
                            <><Building2 className="h-3 w-3" /> Company-wide</>
                          ) : (
                            <><User className="h-3 w-3" /> {doc.employee_name ?? "Employee"}</>
                          )}
                        </span>
                        <span className="text-xs text-muted-foreground">{formatSize(doc.file_size)}</span>
                        <span className="text-xs text-muted-foreground">{formatDate(doc.created_at)}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {doc.requires_acknowledgment && !doc.acknowledged_by_me && (
                        doc.ack_method === "type_name" ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs"
                            onClick={() => setSignDoc(doc)}
                          >
                            <PenLine className="mr-1.5 h-3.5 w-3.5" />
                            Sign
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs"
                            onClick={() => handleAuditAcknowledge(doc)}
                            disabled={acknowledging === doc.id}
                          >
                            <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                            {acknowledging === doc.id ? "Saving..." : "Acknowledge"}
                          </Button>
                        )
                      )}
                      {doc.signed_url && (
                        <a href={doc.signed_url} target="_blank" rel="noopener noreferrer" download>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                        </a>
                      )}
                      {canManage && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => handleDelete(doc)}
                          disabled={deleting === doc.id}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {canManage && (
        <UploadDialog open={uploadOpen} onOpenChange={setUploadOpen} employees={employees} />
      )}
      {signDoc && (
        <AcknowledgeDialog
          open={!!signDoc}
          onOpenChange={(v) => { if (!v) setSignDoc(null); }}
          document={signDoc}
        />
      )}
    </>
  );
}
