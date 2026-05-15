import type { Route } from "next";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { ServiceCatalogWorkspace } from "@/components/marketplace/service-catalog-workspace";
import { getAuthorizedUser } from "@/lib/auth/guards";
import { isBarberAccountRole } from "@/lib/auth/roles";
import type { Role } from "@/types/domain";

function getTitle(role: Extract<Role, "owner" | "barber" | "commission_barber" | "booth_rent_barber">, barberSubtype?: string) {
  switch (role) {
    case "owner":
      return "Service catalog and ownership controls";
    case "barber":
      return barberSubtype === "commission" ? "Shop-defined services at your chair" : "Own and refine your service menu";
    case "booth_rent_barber":
      return "Own and refine your service menu";
    case "commission_barber":
      return "Shop-defined services at your chair";
    default:
      return "Services";
  }
}

function getSubtitle(role: Extract<Role, "owner" | "barber" | "commission_barber" | "booth_rent_barber">, barberSubtype?: string) {
  switch (role) {
    case "owner":
      return "Control the commission service catalog, protect pricing authority, and review popularity signals that now feed marketplace discovery.";
    case "barber":
      return barberSubtype === "commission"
        ? "See the shop-defined services you perform, understand how they rank, and stay clear on the owner-controlled pricing boundary."
        : "Create and manage your own barber-owned services while keeping pricing, style tags, and public profile presentation aligned.";
    case "booth_rent_barber":
      return "Create and manage your own barber-owned services while keeping booth-rent pricing, style tags, and public profile presentation aligned.";
    case "commission_barber":
      return "See the shop-defined services you perform, understand how they rank, and stay clear on the owner-controlled pricing boundary.";
    default:
      return "Manage services.";
  }
}

export default async function ServicesPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await getAuthorizedUser(["owner", "commission_barber", "booth_rent_barber"]);
  const marketplaceRole = user.role as Extract<Role, "owner" | "barber" | "commission_barber" | "booth_rent_barber">;

  if (marketplaceRole === "owner") {
    redirect("/dashboard/owner/settings?section=services" as Route);
  }

  if (isBarberAccountRole(marketplaceRole)) {
    const params = await searchParams;
    const query = new URLSearchParams({ section: "services" });
    Object.entries(params).forEach(([key, value]) => {
      if (value) {
        query.set(key, value);
      }
    });
    redirect(`/dashboard/barber/checkout?${query.toString()}` as Route);
  }

  return (
    <DashboardShell
      user={user}
      activeHref="/services"
      title={getTitle(marketplaceRole, user.barberSubtype)}
      subtitle={getSubtitle(marketplaceRole, user.barberSubtype)}
    >
      <ServiceCatalogWorkspace role={marketplaceRole} barberSubtype={user.barberSubtype} barberId={user.barberId} />
    </DashboardShell>
  );
}
