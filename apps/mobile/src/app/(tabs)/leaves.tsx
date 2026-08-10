import { LeavesScreen } from "@/components/leaves-screen";

/**
 * Leaves tab (Mobile Phase D Slice 2, Task 6). Balances + own requests +
 * Request-leave sheet for everyone; a manager-only Approvals segment. Role
 * gating lives inside `LeavesScreen` (employees never see the segment).
 */
export default function Leaves() {
  return <LeavesScreen />;
}
