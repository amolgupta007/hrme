"use client";

import React from "react";
import { toast } from "sonner";
import { Copy, Eye, EyeOff, RefreshCw, Fingerprint } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  toggleFingerprintEnabled,
  generateDeviceToken,
  updateEmployeeDeviceCode,
} from "@/actions/fingerprint";
import type { FingerprintConfig, EmployeeWithDeviceCode } from "@/actions/fingerprint";

const WEBHOOK_URL = "https://jambahr.com/api/attendance/punch";

export function FingerprintSection({
  initialConfig,
  initialEmployees,
}: {
  initialConfig: FingerprintConfig;
  initialEmployees: EmployeeWithDeviceCode[];
}) {
  const [enabled, setEnabled] = React.useState(initialConfig.enabled);
  const [token, setToken] = React.useState(initialConfig.device_token ?? "");
  const [showToken, setShowToken] = React.useState(false);
  const [togglingEnabled, setTogglingEnabled] = React.useState(false);
  const [generatingToken, setGeneratingToken] = React.useState(false);
  const [showPayload, setShowPayload] = React.useState(false);
  const [employees, setEmployees] =
    React.useState<EmployeeWithDeviceCode[]>(initialEmployees);
  const [savingCode, setSavingCode] = React.useState<string | null>(null);
  const [editingCodes, setEditingCodes] = React.useState<
    Record<string, string>
  >({});

  async function handleToggleEnabled() {
    setTogglingEnabled(true);
    const next = !enabled;
    const result = await toggleFingerprintEnabled(next);
    setTogglingEnabled(false);
    if (result.success) {
      setEnabled(next);
      toast.success(next ? "Fingerprint integration enabled" : "Fingerprint integration disabled");
    } else {
      toast.error(result.error);
    }
  }

  async function handleGenerateToken() {
    if (token) {
      const confirmed = window.confirm(
        "Regenerating the token will immediately invalidate the current one. The device will stop working until reconfigured. Continue?"
      );
      if (!confirmed) return;
    }
    setGeneratingToken(true);
    const result = await generateDeviceToken();
    setGeneratingToken(false);
    if (result.success) {
      setToken(result.data);
      setShowToken(true);
      toast.success("New device token generated");
    } else {
      toast.error(result.error);
    }
  }

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text).then(() => toast.success(`${label} copied`));
  }

  async function handleSaveCode(employeeId: string) {
    setSavingCode(employeeId);
    const code = editingCodes[employeeId] ?? "";
    const result = await updateEmployeeDeviceCode(employeeId, code || null);
    setSavingCode(null);
    if (result.success) {
      setEmployees((prev) =>
        prev.map((e) =>
          e.id === employeeId ? { ...e, device_code: code || null } : e
        )
      );
      setEditingCodes((prev) => {
        const next = { ...prev };
        delete next[employeeId];
        return next;
      });
      toast.success("Device code saved");
    } else {
      toast.error(result.error);
    }
  }

  const maskedToken = token ? `dt_${"•".repeat(20)}` : "—";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Fingerprint className="h-4 w-4" />
          Fingerprint Integration
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Enable toggle */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Enable fingerprint punch-in</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Allow a fingerprint device to clock employees in and out via webhook.
            </p>
          </div>
          <button
            onClick={handleToggleEnabled}
            disabled={togglingEnabled}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
              enabled ? "bg-primary" : "bg-gray-200"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                enabled ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>

        {/* Webhook URL */}
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Webhook URL</p>
          <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
            <code className="flex-1 text-xs text-muted-foreground truncate">
              POST {WEBHOOK_URL}
            </code>
            <button
              onClick={() => copyToClipboard(WEBHOOK_URL, "URL")}
              className="text-muted-foreground hover:text-foreground"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Device token */}
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Device token</p>
          <div className="flex items-center gap-2">
            <div className="flex flex-1 items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
              <code className="flex-1 text-xs text-muted-foreground truncate">
                {token ? (showToken ? token : maskedToken) : "No token yet — generate one below"}
              </code>
              {token && (
                <>
                  <button
                    onClick={() => setShowToken((v) => !v)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    {showToken ? (
                      <EyeOff className="h-3.5 w-3.5" />
                    ) : (
                      <Eye className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <button
                    onClick={() => copyToClipboard(token, "Token")}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </div>
            <button
              onClick={handleGenerateToken}
              disabled={generatingToken}
              className="flex items-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium hover:bg-muted disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${generatingToken ? "animate-spin" : ""}`} />
              {token ? "Regenerate" : "Generate"}
            </button>
          </div>
          {token && (
            <p className="text-xs text-muted-foreground">
              Use this token in the device&apos;s HTTP header:{" "}
              <code className="bg-muted px-1 rounded">Authorization: Bearer &lt;token&gt;</code>
            </p>
          )}
        </div>

        {/* Payload format (collapsible) */}
        <div className="space-y-1.5">
          <button
            onClick={() => setShowPayload((v) => !v)}
            className="text-sm font-medium text-primary hover:underline"
          >
            {showPayload ? "Hide" : "Show"} expected payload format
          </button>
          {showPayload && (
            <pre className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground overflow-x-auto">
{`POST ${WEBHOOK_URL}
Authorization: Bearer <device_token>
Content-Type: application/json

{
  "employee_code": "EMP001",
  "timestamp": "2026-04-20T09:05:00Z",
  "event_type": "auto"
}

// event_type: "auto" (default), "clock_in", or "clock_out"`}
            </pre>
          )}
        </div>

        {/* Employee codes table */}
        <div className="space-y-2">
          <div>
            <p className="text-sm font-medium">Employee device codes</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Set the same code here as in the fingerprint device when enrolling.
              Leave blank to match by email.
            </p>
          </div>
          <div className="rounded-md border overflow-hidden">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                    Employee
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                    Device code
                  </th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {employees.map((emp) => {
                  const editing = emp.id in editingCodes;
                  const currentValue = editing
                    ? editingCodes[emp.id]
                    : emp.device_code ?? "";
                  return (
                    <tr key={emp.id} className="hover:bg-muted/20">
                      <td className="px-3 py-2">
                        <p className="font-medium">
                          {emp.first_name} {emp.last_name}
                        </p>
                        <p className="text-xs text-muted-foreground">{emp.email}</p>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={currentValue}
                          placeholder="e.g. EMP001"
                          onChange={(e) =>
                            setEditingCodes((prev) => ({
                              ...prev,
                              [emp.id]: e.target.value,
                            }))
                          }
                          className="w-28 rounded border px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        {editing && (
                          <button
                            onClick={() => handleSaveCode(emp.id)}
                            disabled={savingCode === emp.id}
                            className="rounded bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                          >
                            {savingCode === emp.id ? "Saving…" : "Save"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {employees.length === 0 && (
                  <tr>
                    <td
                      colSpan={3}
                      className="px-3 py-4 text-center text-xs text-muted-foreground"
                    >
                      No active employees found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
