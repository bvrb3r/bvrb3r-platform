import { redirect } from "next/navigation";

export default function ArchitectSystemLogsRedirectPage() {
  redirect("/architect/settings?section=logs");
}
