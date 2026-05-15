import type { Route } from "next";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { ServiceCatalogWorkspace } from "@/components/marketplace/service-catalog-workspace";
import { getAuthorizedUser } from "@/lib/auth/guards";
import { isBarberAccountRole, isShopOwnerRole } from "@/lib/auth/roles";
import type { Role } from "@/types/domain";

function getTitle(role: Role, barberSubtype?: string) {
  if (isShopOwnerRole(role)) {
    return "Service catalog and ownership controls";
  }

  if (isBarberAccountRole(role)) {
    return barberSubtype === "commission" ? "Shop-defined services at your chair" : "Own and refine your service menu";
  }

  return "Services";
}

function getSubtitle(role: Role, barberSubtype?: string) {
  if (isShopOwnerRole(role)) {
    return "Control the commission service catalog, protect pricing authority, and review popularity signals that now feed marketplace discovery.";
  }

  if (isBarberAccountRole(role)) {
    return barberSubtype === "commission"
      ? "See the shop-defined services you perform, understand how they rank, and stay clear on the owner-controlled pricing boundary."
      : "Create and manage your own barber-owned services while keeping pricing, style tags, and public profile presentation aligned.";
  }

  return "Manage services.";
}

export default async function ServicesPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await getAuthorizedUser(["shop_owner_user", "barber_user"]);
  const marketplaceRole = user.role;

  if (isShopOwnerRole(marketplaceRole)) {
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
