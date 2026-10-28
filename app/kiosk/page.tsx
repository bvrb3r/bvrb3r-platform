import type { Metadata } from "next";
import { SquareBookingWelcome } from "@/components/kiosk/square-booking-welcome";

export const metadata: Metadata = {
  title: "Book an appointment | The BVRB3R Shop",
  description: "Book your next appointment at The BVRB3R Shop through Square.",
  robots: { index: false, follow: false, nocache: true }
};

export default function KioskWelcomePage() {
  return <SquareBookingWelcome />;
}
