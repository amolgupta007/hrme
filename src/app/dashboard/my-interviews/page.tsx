import { redirect } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { listMyInterviews } from "@/actions/hire";
import { getCurrentUser } from "@/lib/current-user";
import { MyInterviewsClient } from "@/components/dashboard/my-interviews-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "My Interviews — JambaHR" };

export default async function MyInterviewsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  if (!user.jambaHireEnabled) redirect("/dashboard");

  const result = await listMyInterviews();
  const interviews = result.success ? result.data : [];

  const upcoming = interviews.filter(
    (i) => new Date(i.scheduled_at).getTime() >= Date.now() && i.status !== "cancelled",
  );
  const past = interviews.filter(
    (i) => new Date(i.scheduled_at).getTime() < Date.now() || i.status === "completed",
  );

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-indigo-600" />
          <h1 className="text-xl font-semibold text-foreground">My Interviews</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Interviews you&apos;ve been assigned to. Submit feedback after each one.
        </p>
      </div>

      <MyInterviewsClient upcoming={upcoming} past={past} />
    </div>
  );
}
