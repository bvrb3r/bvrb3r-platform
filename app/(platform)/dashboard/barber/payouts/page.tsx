import { redirect } from "next/navigation";

export default function BarberPayoutsRedirectPage() {
  redirect("/dashboard/barber/settings?section=payouts");
}
