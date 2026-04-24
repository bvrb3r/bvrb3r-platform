import type { Route } from "next";
import { redirect } from "next/navigation";

export default function RewardsPage() {
  redirect("/dashboard/client/profile?section=rewards" as Route);
}
