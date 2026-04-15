"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Building2, Plus, Play, CheckCircle, Trash2, ChevronDown,
  ChevronRight, Pencil, FileText, Users, IndianRupee, Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatINR } from "@/lib/ctc";
import { SalaryStructureDialog } from "./salary-structure-dialog";
import { PayrollRunDialog } from "./payroll-run-dialog";
import { EntryEditDialog } from "./entry-edit-dialog";
import { PayslipDialog } from "./payslip-dialog";
import {
  processPayrollRun,
  markPayrollPaid,
  deletePayrollRun,
  getPayrollEntries,
} from "@/actions/payroll";
import type {
  SalaryStructureRow,
  PayrollRun,
  PayrollEntry,
  MyPayslip,
} from "@/actions/payroll";

interface Employee {
  id: string;
  first_name: string;
  last_name: string;
  designation: string | null;
  status: string;
}

interface Props {
  isAdmin: boolean;
  employees: Employee[];
  salaryStructures: SalaryStructureRow[];
  payrollRuns: PayrollRun[];
  myPayslips: MyPayslip[];
  orgName: string;
  currentEmployeeName: string;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function monthLabel(m: string) {
  const [y, mo] = m.split("-");
  return `${MONTHS[parseInt(mo) - 1]} ${y}`;
}

function statusBadge(status: string) {
  if (status === "paid") return <Badge variant="success">Paid</Badge>;
  if (status === "processed") return <Badge variant="secondary">Processed</Badge>;
  return <Badge variant="outline">Draft</Badge>;
}

export function PayrollClient({
  isAdmin,
  employees,
  salaryStructures,
  payrollRuns,
  myPayslips,
  orgName,
  currentEmployeeName,
}: Props) {
  const router = useRouter();
  const tabs = isAdmin
    ? ["Salary Structures", "Payroll Runs", "My Payslips"]
    : ["My Payslips"];
  const [activeTab, setActiveTab] = useState(tabs[0]);

  // Dialogs
  const [salaryDialog, setSalaryDialog] = useState<{
    open: boolean;
    existing?: SalaryStructureRow | null;
  }>({ open: false });
  const [runDialog, setRunDialog] = useState(false);
  const [editEntry, setEditEntry] = useState<PayrollEntry | null>(null);
  const [viewSlip, setViewSlip] = useState<
    ((PayrollEntry & { month: string; employee_name: string }) | (MyPayslip & { employee_name: string })) | null
  >(null);

  // Expanded run
  const [expandedRun, setExpandedRun] = useState<string | null>(null);
  const [runEntries, setRunEntries] = useState<Record<string, PayrollEntry[]>>({});
  const [loadingEntries, setLoadingEntries] = useState<string | null>(null);
  const [processingRun, setProcessingRun] = useState<string | null>(null);
  const [markingPaid, setMarkingPaid] = useState<string | null>(null);
  const [deletingRun, setDeletingRun] = useState<string | null>(null);

  // Active employees without salary configured
  const activeEmployeeIds = new Set(employees.filter((e) => e.status === "active").map((e) => e.id));
  const configuredIds = new Set(salaryStructures.map((s) => s.employee_id));
  const unconfiguredCount = [...activeEmployeeIds].filter((id) => !configuredIds.has(id)).length;

  async function handleExpandRun(runId: string) {
    if (expandedRun === runId) {
      setExpandedRun(null);
      return;
    }
    setExpandedRun(runId);
    if (!runEntries[runId]) {
      setLoadingEntries(runId);
      const result = await getPayrollEntries(runId);
      if (result.success) setRunEntries((prev) => ({ ...prev, [runId]: result.data }));
      else toast.error(result.error);
      setLoadingEntries(null);
    }
  }

  async function handleProcess(runId: string) {
    setProcessingRun(runId);
    try {
      const result = await processPayrollRun(runId);
      if (result.success) {
        toast.success("Payroll processed successfully");
        router.refresh();
        // Refresh entries
        const entries = await getPayrollEntries(runId);
        if (entries.success) setRunEntries((prev) => ({ ...prev, [runId]: entries.data }));
        setExpandedRun(runId);
      } else {
        toast.error(result.error);
      }
    } finally {
      setProcessingRun(null);
    }
  }

  async function handleMarkPaid(runId: string) {
    setMarkingPaid(runId);
    try {
      const result = await markPayrollPaid(runId);
      if (result.success) { toast.success("Payroll marked as paid"); router.refresh(); }
      else toast.error(result.error);
    } finally {
      setMarkingPaid(null);
    }
  }

  async function handleDeleteRun(runId: string) {
    if (!confirm("Delete this payroll run? This cannot be undone.")) return;
    setDeletingRun(runId);
    try {
      const result = await deletePayrollRun(runId);
      if (result.success) { toast.success("Payroll run deleted"); router.refresh(); }
      else toast.error(result.error);
    } finally {
      setDeletingRun(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Payroll & Compensation</h1>
          <p className="mt-1 text-muted-foreground">
            Salary structures, monthly runs, and payslips.
          </p>
        </div>
        {isAdmin && activeTab === "Salary Structures" && (
          <Button onClick={() => setSalaryDialog({ open: true })}>
            <Plus className="h-4 w-4 mr-2" />
            Configure Salary
          </Button>
        )}
        {isAdmin && activeTab === "Payroll Runs" && (
          <Button onClick={() => setRunDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Run
          </Button>
        )}
      </div>

      {/* Alert: unconfigured employees */}
      {isAdmin && unconfiguredCount > 0 && activeTab === "Salary Structures" && (
        <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
          {unconfiguredCount} active employee{unconfiguredCount > 1 ? "s" : ""} don&apos;t have a salary structure configured yet.
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-border">
        <nav className="flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab}
            </button>
          ))}
        </nav>
      </div>

      {/* ─── Salary Structures Tab ─── */}
      {activeTab === "Salary Structures" && (
        <div>
          {salaryStructures.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-12 text-center">
              <IndianRupee className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="font-medium">No salary structures configured</p>
              <p className="text-sm text-muted-foreground mt-1">
                Configure CTC for each employee to enable payroll runs.
              </p>
              <Button className="mt-4" onClick={() => setSalaryDialog({ open: true })}>
                Configure First Salary
              </Button>
            </div>
          ) : (
            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b border-border">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Employee</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Annual CTC</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Gross/Month</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Deductions/Month</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Net/Month</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">State</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {salaryStructures.map((s) => {
                    const totalDed = s.employee_pf_monthly + s.professional_tax_monthly + s.tds_monthly;
                    return (
                      <tr key={s.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3">
                          <p className="font-medium">{s.employee_name}</p>
                          {s.department && (
                            <p className="text-xs text-muted-foreground">{s.department}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-mono">
                          {formatINR(s.ctc)}
                          <p className="text-xs text-muted-foreground">
                            {(s.ctc / 100000).toFixed(1)} LPA
                          </p>
                        </td>
                        <td className="px-4 py-3 text-right font-mono">{formatINR(s.gross_monthly)}</td>
                        <td className="px-4 py-3 text-right font-mono text-destructive">
                          −{formatINR(totalDed)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-semibold text-primary">
                          {formatINR(s.net_monthly)}
                        </td>
                        <td className="px-4 py-3 capitalize text-muted-foreground text-xs">
                          {s.state}
                        </td>
                        <td className="px-4 py-3">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSalaryDialog({ open: true, existing: s })}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ─── Payroll Runs Tab ─── */}
      {activeTab === "Payroll Runs" && (
        <div className="space-y-3">
          {payrollRuns.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-12 text-center">
              <Clock className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="font-medium">No payroll runs yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Create a monthly payroll run to compute and disburse salaries.
              </p>
              <Button className="mt-4" onClick={() => setRunDialog(true)}>
                Create First Run
              </Button>
            </div>
          ) : (
            payrollRuns.map((run) => (
              <div key={run.id} className="rounded-xl border border-border overflow-hidden">
                {/* Run header */}
                <div className="flex items-center justify-between px-5 py-4 bg-card">
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => handleExpandRun(run.id)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      {expandedRun === run.id ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </button>
                    <div>
                      <p className="font-semibold">{monthLabel(run.month)}</p>
                      <p className="text-xs text-muted-foreground">
                        {run.employee_count ?? 0} employees · {run.working_days} working days
                      </p>
                    </div>
                    {statusBadge(run.status)}
                  </div>

                  <div className="flex items-center gap-6">
                    {run.total_net != null && (
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Total Net Payout</p>
                        <p className="font-semibold font-mono text-primary">
                          {formatINR(run.total_net)}
                        </p>
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      {run.status === "draft" && (
                        <Button
                          size="sm"
                          onClick={() => handleProcess(run.id)}
                          disabled={processingRun === run.id}
                        >
                          <Play className="h-3.5 w-3.5 mr-1" />
                          {processingRun === run.id ? "Processing…" : "Process"}
                        </Button>
                      )}
                      {run.status === "processed" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleMarkPaid(run.id)}
                          disabled={markingPaid === run.id}
                        >
                          <CheckCircle className="h-3.5 w-3.5 mr-1" />
                          {markingPaid === run.id ? "…" : "Mark Paid"}
                        </Button>
                      )}
                      {run.status !== "paid" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDeleteRun(run.id)}
                          disabled={deletingRun === run.id}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Entries */}
                {expandedRun === run.id && (
                  <div className="border-t border-border">
                    {loadingEntries === run.id ? (
                      <div className="p-6 text-center text-sm text-muted-foreground">Loading entries…</div>
                    ) : (runEntries[run.id] ?? []).length === 0 ? (
                      <div className="p-6 text-center text-sm text-muted-foreground">
                        No entries yet. Click Process to compute salaries.
                      </div>
                    ) : (
                      <table className="w-full text-sm">
                        <thead className="bg-muted/30 border-b border-border">
                          <tr>
                            <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Employee</th>
                            <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Gross</th>
                            <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">PF</th>
                            <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">PT</th>
                            <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">TDS</th>
                            <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">LOP</th>
                            <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Bonus</th>
                            <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Net Pay</th>
                            <th className="px-4 py-2.5" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {(runEntries[run.id] ?? []).map((entry) => (
                            <tr key={entry.id} className="hover:bg-muted/20">
                              <td className="px-4 py-2.5">
                                <p className="font-medium">{entry.employee_name}</p>
                                {entry.department && (
                                  <p className="text-xs text-muted-foreground">{entry.department}</p>
                                )}
                              </td>
                              <td className="px-4 py-2.5 text-right font-mono">{formatINR(entry.gross_salary)}</td>
                              <td className="px-4 py-2.5 text-right font-mono text-muted-foreground">{formatINR(entry.employee_pf)}</td>
                              <td className="px-4 py-2.5 text-right font-mono text-muted-foreground">{formatINR(entry.professional_tax)}</td>
                              <td className="px-4 py-2.5 text-right font-mono text-muted-foreground">{formatINR(entry.tds)}</td>
                              <td className="px-4 py-2.5 text-right font-mono text-muted-foreground">
                                {entry.lop_days > 0 ? (
                                  <span className="text-destructive">{entry.lop_days}d</span>
                                ) : "—"}
                              </td>
                              <td className="px-4 py-2.5 text-right font-mono">
                                {entry.bonus > 0 ? formatINR(entry.bonus) : "—"}
                              </td>
                              <td className="px-4 py-2.5 text-right font-mono font-semibold text-primary">
                                {formatINR(entry.net_pay)}
                              </td>
                              <td className="px-4 py-2.5">
                                <div className="flex items-center gap-1">
                                  {run.status !== "paid" && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => setEditEntry(entry)}
                                      title="Edit entry"
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                  )}
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() =>
                                      setViewSlip({
                                        ...entry,
                                        month: run.month,
                                        employee_name: entry.employee_name,
                                      })
                                    }
                                    title="View payslip"
                                  >
                                    <FileText className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        {/* Summary row */}
                        <tfoot className="border-t border-border bg-muted/30">
                          <tr>
                            <td className="px-4 py-2.5 font-semibold" colSpan={7}>
                              Total ({runEntries[run.id]?.length ?? 0} employees)
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono font-bold text-primary">
                              {formatINR(
                                (runEntries[run.id] ?? []).reduce((s, e) => s + e.net_pay, 0)
                              )}
                            </td>
                            <td />
                          </tr>
                        </tfoot>
                      </table>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* ─── My Payslips Tab ─── */}
      {activeTab === "My Payslips" && (
        <div>
          {myPayslips.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-12 text-center">
              <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="font-medium">No payslips yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Your payslips will appear here once payroll is processed.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b border-border">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Month</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Gross</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Deductions</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Net Pay</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {myPayslips.map((slip) => (
                    <tr key={slip.entry_id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium">{monthLabel(slip.month)}</td>
                      <td className="px-4 py-3 text-right font-mono">
                        {formatINR(slip.gross_salary + slip.bonus)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-destructive">
                        −{formatINR(slip.total_deductions)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold text-primary">
                        {formatINR(slip.net_pay)}
                      </td>
                      <td className="px-4 py-3">{statusBadge(slip.status)}</td>
                      <td className="px-4 py-3">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setViewSlip({ ...slip, employee_name: currentEmployeeName })
                          }
                        >
                          <FileText className="h-3.5 w-3.5 mr-1" />
                          View
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Dialogs */}
      <SalaryStructureDialog
        open={salaryDialog.open}
        onClose={() => { setSalaryDialog({ open: false }); router.refresh(); }}
        employees={employees.filter((e) => e.status === "active")}
        existing={salaryDialog.existing}
      />

      <PayrollRunDialog open={runDialog} onClose={() => { setRunDialog(false); router.refresh(); }} />

      {editEntry && (
        <EntryEditDialog
          open
          onClose={() => setEditEntry(null)}
          entry={editEntry}
        />
      )}

      {viewSlip && (
        <PayslipDialog
          open
          onClose={() => setViewSlip(null)}
          data={viewSlip}
          orgName={orgName}
        />
      )}
    </div>
  );
}
