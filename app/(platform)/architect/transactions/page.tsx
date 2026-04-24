import { redirect } from "next/navigation";

export default function ArchitectTransactionsRedirectPage() {
  redirect("/architect/money?section=transactions");
}
