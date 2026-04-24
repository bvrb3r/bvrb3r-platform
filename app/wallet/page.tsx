import type { Route } from "next";
import { redirect } from "next/navigation";

export default function WalletPage() {
  redirect("/dashboard/client/profile?section=wallet" as Route);
}
