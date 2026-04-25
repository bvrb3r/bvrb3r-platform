import { redirect } from "next/navigation";

export default function BarberPayoutsRedirectPage() {
  redirect("/dashboard/barber/profile?section=payouts");
}
