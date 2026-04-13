"use client";

import * as React from "react";
import { CheckCircle2, Clock, ChevronDown, ChevronRight, FileText } from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import type { SignedRecord } from "@/actions/documents";

interface SignedRecordsTabProps {
  records: SignedRecord[];
}

export function SignedRecordsTab({ records }: SignedRecordsTabProps) {
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (records.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
        <FileText className="h-10 w-10 text-muted-foreground/40" />
        <div>
          <p className="font-medium text-sm">No acknowledgment requests yet</p>
          <p className="text-sm text-muted-foreground mt-0.5">
            Upload a Company Wide document and enable acknowledgment to see records here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {records.map((record) => {
        const isExpanded = expanded.has(record.documentId);
        const ackCount = record.acknowledgments.length;
        const isComplete = ackCount === record.totalEmployees;

        return (
          <div
            key={record.documentId}
            className="rounded-xl border border-border bg-card overflow-hidden"
          >
            {/* Header row */}
            <button
              onClick={() => toggle(record.documentId)}
              className="w-full flex items-center gap-4 px-4 py-3 hover:bg-muted/30 transition-colors text-left"
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium truncate">{record.documentName}</p>
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                      record.ackMethod === "type_name"
                        ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
                        : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                    )}
                  >
                    {record.ackMethod === "type_name" ? "type-your-name" : "audit trail"}
                  </span>
                </div>
              </div>

              {/* Progress */}
              <div className="flex items-center gap-2 shrink-0">
                <div className="w-24 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      isComplete ? "bg-green-500" : "bg-primary"
                    )}
                    style={{
                      width: record.totalEmployees > 0
                        ? `${(ackCount / record.totalEmployees) * 100}%`
                        : "0%",
                    }}
                  />
                </div>
                <span
                  className={cn(
                    "text-xs font-medium tabular-nums",
                    isComplete ? "text-green-600" : "text-muted-foreground"
                  )}
                >
                  {ackCount} / {record.totalEmployees}
                </span>
              </div>
            </button>

            {/* Expanded rows */}
            {isExpanded && (
              <div className="border-t border-border divide-y divide-border">
                {record.acknowledgments.map((ack) => (
                  <div
                    key={ack.employeeId}
                    className="flex items-center gap-3 px-4 py-2.5 bg-muted/20"
                  >
                    <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                    <span className="text-sm font-medium flex-1">{ack.employeeName}</span>
                    {ack.signatureText && (
                      <span className="text-xs text-muted-foreground italic">
                        &ldquo;{ack.signatureText}&rdquo;
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground shrink-0">
                      {formatDate(ack.acknowledgedAt)}
                    </span>
                  </div>
                ))}
                {record.pendingNames.map((name) => (
                  <div
                    key={name}
                    className="flex items-center gap-3 px-4 py-2.5 bg-muted/10"
                  >
                    <Clock className="h-4 w-4 text-amber-400 shrink-0" />
                    <span className="text-sm text-muted-foreground flex-1">{name}</span>
                    <span className="text-xs text-muted-foreground">pending</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
