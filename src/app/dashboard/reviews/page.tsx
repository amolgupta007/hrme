import { listReviewCycles, listCycleReviews } from "@/actions/reviews";
import { listEmployees } from "@/actions/employees";
import { getCurrentUser } from "@/lib/current-user";
import { ReviewsClient } from "@/components/reviews/reviews-client";

export default async function ReviewsPage() {
  const [cyclesResult, employeesResult, userCtx] = await Promise.all([
    listReviewCycles(),
    listEmployees(),
    getCurrentUser(),
  ]);

  const cycles = cyclesResult.success ? cyclesResult.data : [];
  const employees = employeesResult.success ? employeesResult.data : [];
  const role = userCtx?.role ?? "employee";

  const activeCycle = cycles.find((c) => c.status === "active") ?? cycles[0] ?? null;
  const reviewsResult = activeCycle ? await listCycleReviews(activeCycle.id) : null;
  const cycleReviews = reviewsResult?.success ? reviewsResult.data : [];

  return (
    <div className="space-y-6">
      <ReviewsClient
        cycles={cycles}
        employees={employees}
        cycleReviews={cycleReviews}
        activeCycleId={null}
        role={role}
      />
    </div>
  );
}
