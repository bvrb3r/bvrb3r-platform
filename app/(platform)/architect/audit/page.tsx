import { redirect } from "next/navigation";

export default function ArchitectAuditRedirectPage() {
  redirect("/architect/settings?section=audit");
}
