import type { Metadata } from "next";
import { InteractiveDemoWorkspace } from "@/components/demo/interactive-demo-workspace";
import { parseDemoRole } from "@/lib/demo/pr36-interactive-demo";

export const metadata: Metadata = {
  title: "Interactive Demo | BVRB3R",
  description: "Explore the BVRB3R barber and shop-owner operating loops using clearly labeled sample data.",
  alternates: { canonical: "/demo" },
  robots: { index: true, follow: true }
};

export default async function InteractiveDemoPage({ searchParams }: { searchParams: Promise<{ role?: string | string[] }> }) {
  const params = await searchParams;
  return <InteractiveDemoWorkspace initialRole={parseDemoRole(params.role)} />;
}
