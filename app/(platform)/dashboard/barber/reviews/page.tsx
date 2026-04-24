import { redirect } from "next/navigation";

export default function BarberReviewsRedirectPage() {
  redirect("/dashboard/barber/profile?section=reviews");
}
