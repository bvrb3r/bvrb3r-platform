import { redirect } from "next/navigation";

export default function ArchitectPayoutsRedirectPage() {
  redirect("/architect/money?section=payouts");
}
