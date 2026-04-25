import { redirect } from "next/navigation";

export default function BarberHomeRedirectPage() {
  redirect("/dashboard/barber");
}
