import { redirect } from "next/navigation";

export default function ArchitectClientsRedirectPage() {
  redirect("/architect/users?role=client");
}
