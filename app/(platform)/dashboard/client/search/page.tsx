import { ClientAppShell } from "@/components/client-experience/client-app-shell";
import { ClientSearchScreen } from "@/components/client-experience/client-search-screen";
import { getClientExperienceContext } from "@/lib/client-experience/session";

export default async function ClientSearchDashboardPage({
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
  }>;
}) {
  const context = await getClientExperienceContext();
  const params = await searchParams;

  return (
    <ClientAppShell activeTab="search" mode={context.isGuest ? "guest" : "client"}>
      <ClientSearchScreen
        clientId={context.clientId}
        initialType={params.type === "shops" ? "shops" : "barbers"}
        initialQuery={params.q ?? ""}
        initialCategory={params.category ?? ""}
        initialLocationId={params.locationId ?? ""}
        initialMinRating={params.rating ? Number(params.rating) : undefined}
        initialMaxPrice={params.price ? Number(params.price) : undefined}
        initialAvailability={params.availability ?? "any"}
        initialSpecialty={params.specialty ?? ""}
        initialVerifiedOnly={params.verified === "1"}
        routeBase="/dashboard/client/search"
      />
    </ClientAppShell>
  );
}
