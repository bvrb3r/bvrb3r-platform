import { redirect } from "next/navigation";

export default function OwnerOverviewRedirectPage() {
  redirect("/dashboard/owner");
}
