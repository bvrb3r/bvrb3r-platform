import { redirect } from "next/navigation";

export default function BarberEarningsRedirectPage() {
  redirect("/dashboard/barber/checkout?section=money");
}
