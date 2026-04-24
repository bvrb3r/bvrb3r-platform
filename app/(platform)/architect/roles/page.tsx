import { redirect } from "next/navigation";

export default function ArchitectRolesRedirectPage() {
  redirect("/architect/settings?section=roles");
}
