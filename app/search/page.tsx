import { ClientAppShell } from "@/components/client-experience/client-app-shell";
import { ClientSearchScreen } from "@/components/client-experience/client-search-screen";
import { getClientExperienceContext } from "@/lib/client-experience/session";

export default async function SearchPage({
  searchParams
}: {
  searchParams: Promise<{
    q?: string;
    category?: string;
    locationId?: string;
    rating?: string;
    price?: string;
    availability?: "any" | "today" | "now";
    specialty?: string;
    verified?: string;
  }>;
}) {
  const context = await getClientExperienceContext();
  const params = await searchParams;

  return (
    <ClientAppShell activeTab="search" mode={context.isGuest ? "guest" : "client"}>
      <ClientSearchScreen
        clientId={context.clientId}
        initialQuery={params.q ?? ""}
        initialCategory={params.category ?? ""}
        initialLocationId={params.locationId ?? ""}
        initialMinRating={params.rating ? Number(params.rating) : undefined}
        initialMaxPrice={params.price ? Number(params.price) : undefined}
        initialAvailability={params.availability ?? "any"}
        initialSpecialty={params.specialty ?? ""}
        initialVerifiedOnly={params.verified === "1"}
        routeBase="/search"
      />
    </ClientAppShell>
  );
}
