import { getMyProfile } from "@/actions/profile";
import { ProfileClient } from "@/components/profile/profile-client";
import { User } from "lucide-react";

export default async function ProfilePage() {
  const result = await getMyProfile();

  if (!result.success) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My Profile</h1>
          <p className="mt-1 text-muted-foreground">Your personal and demographic information.</p>
        </div>
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <User className="h-7 w-7 text-muted-foreground" />
          </div>
          <div>
            <p className="font-medium">No employee profile linked</p>
            <p className="mt-1 text-sm text-muted-foreground max-w-sm">
              Your account isn&apos;t linked to an employee record yet. Ask your admin to add you as an employee using your account email.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">My Profile</h1>
        <p className="mt-1 text-muted-foreground">Your personal and demographic information.</p>
      </div>
      <ProfileClient profile={result.data} />
    </div>
  );
}
