import { redirect } from "next/navigation";

export default function ArchitectIntegrationsRedirectPage() {
  redirect("/architect/settings?section=integrations");
}
