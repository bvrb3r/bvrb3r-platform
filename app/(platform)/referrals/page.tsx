import type { Route } from "next";
import { redirect } from "next/navigation";

export default function ReferralsPage() {
  redirect("/dashboard/client/profile?section=referrals" as Route);
}
