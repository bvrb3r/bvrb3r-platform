import { redirect } from "next/navigation";

export default function ArchitectDisputesRedirectPage() {
  redirect("/architect/money?section=disputes");
}
