import { useLocalSearchParams } from "expo-router";
import { PayslipDetailScreen } from "@/components/payslip-detail-screen";

export default function PayslipDetail() {
  const { entryId } = useLocalSearchParams<{ entryId: string }>();
  return <PayslipDetailScreen entryId={entryId} />;
}
