import { redirect } from "next/navigation";

export default function ArchitectRefundsRedirectPage() {
  redirect("/architect/money?section=refunds");
}
