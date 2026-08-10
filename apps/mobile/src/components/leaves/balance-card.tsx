import { Text, View } from "react-native";
import type { MobileLeaveBalance } from "@jambahr/shared/mobile/types";

/**
 * One balance card (hi-fi 2b): policy name (13/600), a `used / total` numeral
 * pair (22/800 remaining-forward — we show remaining as the headline), and a
 * 5px brand progress bar on an `#EFF1F3` track showing consumed proportion.
 * Rendered three-across in a row by the Leaves screen.
 */
export function BalanceCard({ balance }: { balance: MobileLeaveBalance }) {
  const total = balance.total ?? 0;
  const remaining = balance.remaining ?? 0;
  const pct = total > 0 ? Math.min(1, Math.max(0, balance.used / total)) : 0;

  return (
    <View className="flex-1 rounded-2xl border border-line bg-surface p-3">
      <Text className="text-[13px] font-semibold text-ink-600" numberOfLines={1}>
        {balance.name}
      </Text>
      <View className="mt-1 flex-row items-end">
        <Text className="text-[22px] font-extrabold leading-6 text-ink-900">{remaining}</Text>
        <Text className="ml-0.5 mb-0.5 text-[12px] font-normal text-ink-400">/{total}</Text>
      </View>
      {/* 5px progress track */}
      <View className="mt-2 h-[5px] overflow-hidden rounded-full bg-[#EFF1F3]">
        <View
          className="h-full rounded-full bg-brand"
          style={{ width: `${Math.round(pct * 100)}%` }}
        />
      </View>
      <Text className="mt-1.5 text-[11px] text-ink-400">{balance.used} used</Text>
    </View>
  );
}
