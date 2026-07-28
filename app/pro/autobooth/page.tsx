import { redirect } from "next/navigation";

export default function CanonicalAutoBoothRoute() {
  redirect("/dashboard/barber/rent?view=autobooth");
}
