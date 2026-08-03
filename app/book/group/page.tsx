import type { Metadata } from "next";
import { GroupBookingWorkspace } from "@/components/group-booking/group-booking-workspace";

export const metadata: Metadata = {
  title: "Group Booking | BVRB3R",
  description: "Hold two to six real BVRB3R appointments together with per-person services and confirmations."
};

export default async function GroupBookingPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const single = (key: string) => typeof query[key] === "string" ? query[key] : "";
  return <GroupBookingWorkspace defaults={{
    barberId: single("barber"),
    serviceId: single("service"),
    locationId: single("location"),
    startsAt: single("startsAt")
  }} />;
}
