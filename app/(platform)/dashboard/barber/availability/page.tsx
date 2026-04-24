import { redirect } from "next/navigation";

export default function BarberAvailabilityRedirectPage() {
  redirect("/dashboard/barber/calendar");
}
