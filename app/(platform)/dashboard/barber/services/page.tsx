import { redirect } from "next/navigation";

export default function BarberServicesRedirectPage() {
  redirect("/dashboard/barber/checkout?section=services");
}
