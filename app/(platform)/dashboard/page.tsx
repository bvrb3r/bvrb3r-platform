import { redirect } from "next/navigation";
import { getDefaultRouteForUser } from "@/lib/auth/demo-auth";
import { getCurrentUserFromServer } from "@/lib/auth/session";

export default async function DashboardIndexPage() {
  const { user } = await getCurrentUserFromServer();
  redirect(getDefaultRouteForUser(user));
}