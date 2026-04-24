import { redirect } from "next/navigation";

export default function ArchitectBarbersRedirectPage() {
  redirect("/architect/users?role=barber");
}
