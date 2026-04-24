import { redirect } from "next/navigation";

export default function BarberAppointmentsRedirectPage() {
  redirect("/dashboard/barber/calendar");
}
