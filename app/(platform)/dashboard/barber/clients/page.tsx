import { redirect } from "next/navigation";

export default function BarberClientsRedirectPage() {
  redirect("/dashboard/barber/messages");
}
