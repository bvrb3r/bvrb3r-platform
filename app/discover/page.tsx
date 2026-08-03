import type { Metadata } from "next";
import { ClientAppShell } from "@/components/client-experience/client-app-shell";
import { ClientSearchScreen } from "@/components/client-experience/client-search-screen";
import { PublicFooter } from "@/components/public-site/public-footer";
import { PublicNav } from "@/components/public-site/public-nav";
import styles from "@/components/public-site/public-site.module.css";
import { getClientExperienceContext } from "@/lib/client-experience/session";

export const metadata: Metadata = {
  title: "Guest Discovery — BVRB3R",
  description: "Discover public BVRB3R barber and shop profiles, compare their work, and begin a booking.",
  alternates: {
    canonical: "/discover?entry=guest"
  }
};

export default async function DiscoveryPage({
  searchParams
}: {
  searchParams: Promise<{
    q?: string;
    type?: "barbers" | "shops";
    category?: string;
    locationId?: string;
    rating?: string;
    price?: string;
    availability?: "any" | "today" | "now";
    specialty?: string;
    verified?: string;
    entry?: "guest";
  }>;
}) {
  const context = await getClientExperienceContext();
  const params = await searchParams;
  const isGuest = context.isGuest || params.entry === "guest";

  const searchScreen = (
    <ClientSearchScreen
      mode={isGuest ? "guest" : "client"}
      clientId={isGuest ? undefined : context.clientId}
      initialType={params.type === "shops" ? "shops" : "barbers"}
      initialQuery={params.q ?? ""}
      initialCategory={params.category ?? ""}
      initialLocationId={params.locationId ?? ""}
      initialMinRating={params.rating ? Number(params.rating) : undefined}
      initialMaxPrice={params.price ? Number(params.price) : undefined}
      initialAvailability={params.availability ?? "any"}
      initialSpecialty={params.specialty ?? ""}
      initialVerifiedOnly={params.verified === "1"}
      routeBase="/discover"
    />
  );

  if (isGuest) {
    return (
      <div className={styles.marketingPage} data-public-site>
        <PublicNav active="/discover" />
        <main className={styles.guestDiscoveryMain}>{searchScreen}</main>
        <PublicFooter />
      </div>
    );
  }

  return (
    <ClientAppShell activeTab="search" mode="client">
      {searchScreen}
    </ClientAppShell>
  );
}
