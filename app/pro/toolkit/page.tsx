import type { Metadata } from "next";
import { BusinessToolkitWorkspace } from "@/components/toolkit/business-toolkit-workspace";

export const metadata: Metadata = {
  title: "Business Toolkit · BVRB3R",
  description: "Free barber-business calculators for income, pricing, booth rent, AutoBooth, utilization, and no-shows."
};

export default function BusinessToolkitPage() {
  return <BusinessToolkitWorkspace />;
}
