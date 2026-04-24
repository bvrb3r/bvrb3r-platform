import { redirect } from "next/navigation";

export default function ArchitectSupportRedirectPage() {
  redirect("/architect/settings?section=support");
}
