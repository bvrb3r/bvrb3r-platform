import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicComingSoonShop } from "@/components/prelaunch/public-coming-soon-shop";
import { getCurrentUserFromServer } from "@/lib/auth/session";
import { Pr36PrelaunchServiceError, readPr36PublicPrelaunch } from "@/lib/shops/pr36-prelaunch-service";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ shop: string }> }): Promise<Metadata> {
  const { shop } = await params;
  const label = shop.replace(/[._-]+/g, " ").trim() || "Shop";
  return {
    title: `${label} — Opening Soon | BVRB3R`,
    description: "Join the verified opening waitlist. Waitlisted clients receive a 24-hour booking head start and no payment is taken before opening."
  };
}

export default async function ComingSoonShopPage({ params }: { params: Promise<{ shop: string }> }) {
  const [{ shop }, session] = await Promise.all([params, getCurrentUserFromServer()]);
  try {
    const prelaunch = await readPr36PublicPrelaunch({
      slug: shop,
      viewer: session.authenticated && session.user.id !== "guest-user" ? session.user : null
    });
    return (
      <PublicComingSoonShop
        initial={prelaunch}
        initialEmail={session.authenticated && session.user.id !== "guest-user" ? session.user.email : ""}
        serverNow={new Date().toISOString()}
      />
    );
  } catch (error) {
    if (error instanceof Pr36PrelaunchServiceError && error.status === 404) notFound();
    throw error;
  }
}
