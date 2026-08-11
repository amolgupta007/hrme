import { RefreshControl, ScrollView, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { MobilePayslipDetail } from "@jambahr/shared";
import { useSession } from "@/lib/session";
import { useMobileQuery } from "@/lib/query";
import { monthLabel, paidOnLabel, payslipQueryKey } from "@/lib/payslips";
import { MONO, formatDeduction, formatINR } from "@/lib/money";

/** category slug → human label for the earnings line items. */
function categoryLabel(category: string): string {
  switch (category) {
    case "overtime":
      return "Overtime";
    case "allowance":
      return "Allowance";
    case "reimbursement":
      return "Reimbursement";
    case "bonus":
      return "Bonus";
    default:
      return "Other";
  }
}

/**
 * Payslip detail (WF-Payslip): net-pay hero + EARNINGS / DEDUCTIONS sections.
 * Amounts monospaced; deductions in danger red with a leading minus (design
 * §money). The entry is self-scoped server-side — another employee's entryId
 * 404s. No PDF in v1 (D3).
 */
export function PayslipDetailScreen({ entryId }: { entryId: string }) {
  const { me } = useSession();
  const orgId = me?.orgId ?? null;

  const query = useMobileQuery<MobilePayslipDetail>(
    payslipQueryKey(orgId, entryId),
    `/api/mobile/payslips/${entryId}`,
    { orgId, enabled: !!orgId, staleTime: 5 * 60_000 }
  );

  const d = query.data;

  return (
    <ScrollView
      className="flex-1 bg-canvas"
      contentContainerClassName="px-4 pb-10 pt-3 gap-4"
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={query.isRefetching} onRefresh={() => query.refetch()} />
      }
    >
      {!d && query.isLoading ? (
        <View className="gap-4">
          <View className="h-36 rounded-2xl bg-[#EFF1F3]" />
          <View className="h-48 rounded-2xl bg-[#EFF1F3]" />
          <View className="h-40 rounded-2xl bg-[#EFF1F3]" />
        </View>
      ) : !d ? (
        <View className="mt-6 items-center rounded-2xl border border-line bg-surface px-6 py-10">
          <Ionicons name="alert-circle-outline" size={24} color="#B91C1C" />
          <Text className="mt-3 text-[15px] font-semibold text-ink-900">
            Payslip unavailable
          </Text>
          <Text className="mt-1 text-center text-[13px] leading-5 text-ink-600">
            This payslip couldn&apos;t be loaded. Pull to refresh once you&apos;re online.
          </Text>
        </View>
      ) : (
        <>
          {/* Net-pay hero */}
          <View className="rounded-2xl border border-line bg-surface p-5">
            <View className="flex-row items-center justify-between">
              <Text className="text-[15px] font-semibold text-ink-900">{monthLabel(d.month)}</Text>
              <StatusChip status={d.status} />
            </View>
            <Text className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-ink-600">
              Net pay
            </Text>
            <Text
              className="mt-1 text-[34px] font-extrabold leading-10 text-ink-900"
              style={{ fontFamily: MONO }}
            >
              {formatINR(d.netPay)}
            </Text>
            {paidOnLabel(d.paidAt) ? (
              <Text className="mt-1 text-[13px] text-ink-600">Paid on {paidOnLabel(d.paidAt)}</Text>
            ) : null}
          </View>

          {/* Earnings */}
          <Section title="EARNINGS">
            <AmountRow label="Basic" amount={formatINR(d.earnings.basic)} />
            <AmountRow label="HRA" amount={formatINR(d.earnings.hra)} />
            <AmountRow label="Special allowance" amount={formatINR(d.earnings.specialAllowance)} />
            <AmountRow label="Gross" amount={formatINR(d.earnings.gross)} emphasis />
            {d.bonus > 0 ? <AmountRow label="Bonus" amount={formatINR(d.bonus)} /> : null}
            {d.lineItems.map((li, i) => (
              <AmountRow
                key={`li-${i}`}
                label={li.label ?? categoryLabel(li.category)}
                sublabel={li.taxable ? undefined : "Non-taxable"}
                amount={formatINR(li.amount)}
              />
            ))}
          </Section>

          {/* Deductions */}
          <Section title="DEDUCTIONS">
            <AmountRow label="Provident fund (PF)" amount={formatDeduction(d.deductions.employeePf)} danger />
            <AmountRow label="Professional tax" amount={formatDeduction(d.deductions.professionalTax)} danger />
            <AmountRow label="TDS" amount={formatDeduction(d.deductions.tds)} danger />
            {d.deductions.lopDays > 0 ? (
              <AmountRow
                label="Loss of pay"
                sublabel={`${d.deductions.lopDays} ${d.deductions.lopDays === 1 ? "day" : "days"}`}
                amount={formatDeduction(d.deductions.lopDeduction)}
                danger
              />
            ) : null}
            <AmountRow
              label="Total deductions"
              amount={formatDeduction(d.totalDeductions)}
              danger
              emphasis
            />
          </Section>
        </>
      )}
    </ScrollView>
  );
}

function StatusChip({ status }: { status: string }) {
  const chip =
    status === "paid"
      ? { label: "Paid", bg: "bg-success", fg: "text-white" }
      : { label: "Processed", bg: "bg-info-tint", fg: "text-info-ontint" };
  return (
    <View className={`rounded-full px-2.5 py-0.5 ${chip.bg}`}>
      <Text className={`text-[12px] font-medium ${chip.fg}`}>{chip.label}</Text>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="gap-2">
      <Text className="px-1 text-[11px] font-semibold uppercase tracking-wider text-ink-400">
        {title}
      </Text>
      <View className="rounded-2xl border border-line bg-surface px-4 py-1">{children}</View>
    </View>
  );
}

function AmountRow({
  label,
  sublabel,
  amount,
  danger = false,
  emphasis = false,
}: {
  label: string;
  sublabel?: string;
  amount: string;
  danger?: boolean;
  emphasis?: boolean;
}) {
  return (
    <View
      className={`flex-row items-center justify-between py-3 ${emphasis ? "border-t border-line" : ""}`}
    >
      <View className="flex-1 pr-3">
        <Text
          className={`text-[15px] ${emphasis ? "font-semibold text-ink-900" : "text-ink-600"}`}
          numberOfLines={1}
        >
          {label}
        </Text>
        {sublabel ? <Text className="mt-0.5 text-[12px] text-ink-400">{sublabel}</Text> : null}
      </View>
      <Text
        className={`text-[15px] ${emphasis ? "font-bold" : "font-medium"} ${
          danger ? "text-danger-ontint" : "text-ink-900"
        }`}
        style={{ fontFamily: MONO }}
      >
        {amount}
      </Text>
    </View>
  );
}
