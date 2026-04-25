import { redirect } from "next/navigation";

export default async function EarningsPage() {
  redirect("/dashboard/barber/checkout?section=earnings");
}
