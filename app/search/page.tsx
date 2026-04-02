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
  }>;
}) {
  const context = await getClientExperienceContext();
  const params = await searchParams;

  return (
    <ClientAppShell activeTab="search">
      <ClientSearchScreen
        clientId={context.clientId}
        initialQuery={params.q ?? ""}
        initialCategory={params.category ?? ""}
        initialLocationId={params.locationId ?? ""}
        initialMinRating={params.rating ? Number(params.rating) : undefined}
        initialMaxPrice={params.price ? Number(params.price) : undefined}
        initialAvailability={params.availability ?? "any"}
        routeBase="/search"
      />
    </ClientAppShell>
  );
}
