import { redirect } from "next/navigation";

export default function OwnerFinanceRedirectPage() {
  redirect("/dashboard/owner/money");
}
