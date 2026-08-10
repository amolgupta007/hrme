import { hasPermission } from "@jambahr/shared";
import { HomeScreen } from "@/components/home-screen";
import { useSession } from "@/lib/session";

/**
 * Shared Home tab for every role now that `(staff)`/`(admin)` have
 * converged into one tab group (Task 5). `isAdmin` is derived from the
 * live session instead of two separate static route files — `HomeScreen`
 * itself is unchanged (Task 6b reworks its content to the hi-fi design).
 */
export default function Home() {
  const { me } = useSession();
  const isAdmin = !!me && hasPermission(me.role, "admin");
  return <HomeScreen isAdmin={isAdmin} />;
}
