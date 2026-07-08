"use client";

import { useState } from "react";
import { LockKeyhole, Scissors, Sparkles, Store, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useCreateMarketplaceServiceMutation, useMarketplaceServiceCatalog, useUpdateMarketplaceServiceMutation } from "@/lib/marketplace/client";
import { getReadableActionError } from "@/lib/utils/feedback";
import { currency } from "@/lib/utils";
import { isBarberAccountRole, isShopOwnerRole } from "@/lib/auth/roles";
import type { Role } from "@/types/domain";

interface ServiceCatalogWorkspaceProps {
  role: Role;
  barberSubtype?: "freelance" | "booth_rent" | "commission";
  barberId?: string;
}

interface ServiceDraft {
  name: string;
  category: string;
  description: string;
  durationMin: string;
  bufferMin: string;
  price: string;
  deposit: string;
  styleTagId: string;
}

function buildDraft(item: { service: { name: string; category: string; description: string; durationMin: number; bufferMin: number; price: number; deposit: number; styleTagIds?: string[] } }): ServiceDraft {
  return {
    name: item.service.name,
    category: item.service.category,
    description: item.service.description,
    durationMin: String(item.service.durationMin),
    bufferMin: String(item.service.bufferMin),
    price: String(item.service.price),
    deposit: String(item.service.deposit),
    styleTagId: item.service.styleTagIds?.[0] ?? ""
  };
}

function MetricSkeleton() {
  return (
    <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-4 h-10 w-20" />
      <Skeleton className="mt-4 h-4 w-32" />
    </div>
  );
}

export function ServiceCatalogWorkspace({ role, barberSubtype }: ServiceCatalogWorkspaceProps) {
  const catalogQuery = useMarketplaceServiceCatalog();
  const createMutation = useCreateMarketplaceServiceMutation();
  const updateMutation = useUpdateMarketplaceServiceMutation();
  const [drafts, setDrafts] = useState<Record<string, ServiceDraft>>({});
  const [statusUpdate, setStatusUpdate] = useState<{ tone: "success" | "info" | "error"; message: string } | null>(null);
  const [createDraft, setCreateDraft] = useState<ServiceDraft>({
    name: "",
    category: isShopOwnerRole(role) ? "Haircuts" : "Signature",
    description: "",
    durationMin: "60",
    bufferMin: "10",
    price: "65",
    deposit: "15",
    styleTagId: ""
  });

  const isInitialLoading = catalogQuery.isLoading && !catalogQuery.data;
  const canOwnBarberServices = isBarberAccountRole(role)
    ? barberSubtype !== "commission"
    : false;

  function updateDraft(serviceId: string, field: keyof ServiceDraft, value: string) {
    setDrafts((current) => ({
      ...current,
      [serviceId]: {
        ...(current[serviceId] ?? buildDraft(catalogQuery.data!.editableServices.find((item) => item.service.id === serviceId)!)),
        [field]: value
      }
    }));
  }

  async function handleCreateService() {
    setStatusUpdate(null);
    try {
      await createMutation.mutateAsync({
        category: createDraft.category,
        name: createDraft.name,
        description: createDraft.description,
        durationMin: Number(createDraft.durationMin) || 60,
        bufferMin: Number(createDraft.bufferMin) || 0,
        price: Number(createDraft.price) || 0,
        deposit: Number(createDraft.deposit) || 0,
        fullPrepay: false,
        styleTagIds: createDraft.styleTagId ? [createDraft.styleTagId] : []
      });
      setCreateDraft({ name: "", category: createDraft.category, description: "", durationMin: "60", bufferMin: "10", price: "65", deposit: "15", styleTagId: "" });
      setStatusUpdate({ tone: "success", message: "Service created and added to the marketplace-ready catalog." });
    } catch (error) {
      setStatusUpdate({ tone: "error", message: getReadableActionError(error as { status?: number; message?: string }) });
    }
  }

  async function handleSaveService(serviceId: string) {
    setStatusUpdate(null);
    const existing = catalogQuery.data?.editableServices.find((item) => item.service.id === serviceId);
    const draft = drafts[serviceId] ?? (existing ? buildDraft(existing) : undefined);
    if (!draft) {
      return;
    }

    try {
      await updateMutation.mutateAsync({
        serviceId,
        category: draft.category,
        name: draft.name,
        description: draft.description,
        durationMin: Number(draft.durationMin) || 60,
        bufferMin: Number(draft.bufferMin) || 0,
        price: Number(draft.price) || 0,
        deposit: Number(draft.deposit) || 0,
        styleTagIds: draft.styleTagId ? [draft.styleTagId] : []
      });
      setStatusUpdate({ tone: "success", message: "Service details updated. Discovery and public profiles will reflect the change." });
    } catch (error) {
      setStatusUpdate({ tone: "error", message: getReadableActionError(error as { status?: number; message?: string }) });
    }
  }

  return (
    <div className="space-y-4" data-testid="service-catalog-workspace">
      <section className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <Card className="rounded-[32px] p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="surface-label">Service ownership engine</p>
              <h3 className="mt-3 text-3xl font-semibold sm:text-5xl" data-display="true">{role === "owner" ? "Control the commission catalog" : canOwnBarberServices ? "Own your chair services" : "Shop-defined services only"}</h3>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-white/62">
                {role === "owner"
                  ? "Owner accounts control shop-defined commission services, pricing, and marketplace presentation across the business."
                  : canOwnBarberServices
                    ? "Booth-rent barbers can create and edit their own self-owned services without touching the shop-controlled commission catalog."
                    : "Commission barbers perform the shop catalog, but service names, pricing, duration, and structure remain owner-controlled."}
              </p>
            </div>
            <div className="rounded-[24px] border border-white/8 bg-black/20 p-4 text-sm text-white/68">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#C4F24E]/20 bg-[#C4F24E]/10 px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-[#e4f9b8]">
                {role === "owner" ? <Store className="h-4 w-4" /> : <Scissors className="h-4 w-4" />}
                {role === "owner" ? "Shop-owned catalog" : canOwnBarberServices ? "Barber-owned services" : "Read-only service catalog"}
              </div>
            </div>
          </div>
          <div className="mt-5 space-y-3">
            {statusUpdate ? <FeedbackBanner tone={statusUpdate.tone} message={statusUpdate.message} /> : null}
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {isInitialLoading ? (
              <>
                <MetricSkeleton />
                <MetricSkeleton />
                <MetricSkeleton />
              </>
            ) : (
              <>
                <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
                  <p className="surface-label">Editable services</p>
                  <p className="mt-3 text-3xl font-semibold" data-display="true">{catalogQuery.data?.editableServices.length ?? 0}</p>
                  <p className="mt-2 text-sm text-white/58">Services you can actively control in this role.</p>
                </div>
                <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
                  <p className="surface-label">Read-only services</p>
                  <p className="mt-3 text-3xl font-semibold" data-display="true">{catalogQuery.data?.readOnlyServices.length ?? 0}</p>
                  <p className="mt-2 text-sm text-white/58">Visible for context, protected from accidental pricing changes.</p>
                </div>
                <div className="rounded-[24px] border border-[#C4F24E]/18 bg-[#C4F24E]/8 p-4">
                  <p className="surface-label text-[#e4f9b8]">Most booked capability</p>
                  <p className="mt-3 text-3xl font-semibold" data-display="true">Live</p>
                  <p className="mt-2 text-sm text-white/70">Popularity metrics are already available for profiles and discovery.</p>
                </div>
              </>
            )}
          </div>
        </Card>

        <Card className="rounded-[32px] p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="surface-label">Create service</p>
              <p className="mt-2 text-sm text-white/58">{catalogQuery.data?.canCreate ? "Add a new marketplace-ready service without touching unrelated workflows." : "This role can view service performance, but cannot create or edit service definitions."}</p>
            </div>
            {catalogQuery.data?.canCreate ? <Sparkles className="h-5 w-5 text-[#d9f985]" /> : <LockKeyhole className="h-5 w-5 text-[#d9f985]" />}
          </div>
          {catalogQuery.data?.canCreate ? (
            <div className="mt-4 space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Input placeholder="Service name" value={createDraft.name} onChange={(event) => setCreateDraft((current) => ({ ...current, name: event.target.value }))} />
                <Input placeholder="Category" value={createDraft.category} onChange={(event) => setCreateDraft((current) => ({ ...current, category: event.target.value }))} />
              </div>
              <textarea className="min-h-[120px] w-full rounded-[22px] border border-white/10 bg-[rgba(15,15,15,0.9)] px-4 py-3 text-sm text-white outline-none transition focus:border-[#C4F24E]/35 focus:ring-2 focus:ring-[#C4F24E]/20" placeholder="Describe the service experience." value={createDraft.description} onChange={(event) => setCreateDraft((current) => ({ ...current, description: event.target.value }))} />
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Input type="number" placeholder="Duration" value={createDraft.durationMin} onChange={(event) => setCreateDraft((current) => ({ ...current, durationMin: event.target.value }))} />
                <Input type="number" placeholder="Buffer" value={createDraft.bufferMin} onChange={(event) => setCreateDraft((current) => ({ ...current, bufferMin: event.target.value }))} />
                <Input type="number" placeholder="Price" value={createDraft.price} onChange={(event) => setCreateDraft((current) => ({ ...current, price: event.target.value }))} />
                <Input type="number" placeholder="Deposit" value={createDraft.deposit} onChange={(event) => setCreateDraft((current) => ({ ...current, deposit: event.target.value }))} />
              </div>
              <Select value={createDraft.styleTagId} onChange={(event) => setCreateDraft((current) => ({ ...current, styleTagId: event.target.value }))}>
                <option value="">Primary style tag</option>
                {(catalogQuery.data?.styleTags ?? []).map((styleTag) => (
                  <option key={styleTag.id} value={styleTag.id}>{styleTag.name}</option>
                ))}
              </Select>
              <Button className="h-12 w-full" disabled={createMutation.isPending} onClick={() => void handleCreateService()}>
                {createMutation.isPending ? "Creating service..." : "Create service"}
              </Button>
            </div>
          ) : (
            <div className="empty-state-panel mt-4 rounded-[24px] p-5 text-sm leading-7 text-white/58">
              Commission barbers can see how services perform, but only the owner can change shop pricing or rename commission services.
            </div>
          )}
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <Card className="rounded-[32px] p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="surface-label">Editable catalog</p>
              <p className="mt-2 text-sm text-white/58">Update service names, descriptions, pricing, duration, and style ownership only where your role allows it.</p>
            </div>
            <TrendingUp className="h-5 w-5 text-[#d9f985]" />
          </div>
          <div className="mt-4 space-y-3">
            {isInitialLoading ? (
              <>
                <MetricSkeleton />
                <MetricSkeleton />
              </>
            ) : catalogQuery.data?.editableServices.length ? catalogQuery.data.editableServices.map((item) => {
              const draft = drafts[item.service.id] ?? buildDraft(item);
              return (
                <div key={item.service.id} className="rounded-[24px] border border-white/8 bg-black/20 p-4 transition hover:border-[#C4F24E]/16 hover:bg-black/30">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">{item.service.name}</p>
                      <p className="mt-1 text-sm text-white/55">{item.ownerLabel}</p>
                    </div>
                    <span className="status-pill text-[#e4f9b8]">Rank #{item.popularity.popularityRank || "--"}</span>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <Input value={draft.name} onChange={(event) => updateDraft(item.service.id, "name", event.target.value)} />
                    <Input value={draft.category} onChange={(event) => updateDraft(item.service.id, "category", event.target.value)} />
                  </div>
                  <textarea className="mt-3 min-h-[110px] w-full rounded-[22px] border border-white/10 bg-[rgba(15,15,15,0.9)] px-4 py-3 text-sm text-white outline-none transition focus:border-[#C4F24E]/35 focus:ring-2 focus:ring-[#C4F24E]/20" value={draft.description} onChange={(event) => updateDraft(item.service.id, "description", event.target.value)} />
                  <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    <Input type="number" value={draft.durationMin} onChange={(event) => updateDraft(item.service.id, "durationMin", event.target.value)} />
                    <Input type="number" value={draft.bufferMin} onChange={(event) => updateDraft(item.service.id, "bufferMin", event.target.value)} />
                    <Input type="number" value={draft.price} onChange={(event) => updateDraft(item.service.id, "price", event.target.value)} />
                    <Input type="number" value={draft.deposit} onChange={(event) => updateDraft(item.service.id, "deposit", event.target.value)} />
                    <Select value={draft.styleTagId} onChange={(event) => updateDraft(item.service.id, "styleTagId", event.target.value)}>
                      <option value="">Primary style</option>
                      {(catalogQuery.data?.styleTags ?? []).map((styleTag) => (
                        <option key={styleTag.id} value={styleTag.id}>{styleTag.name}</option>
                      ))}
                    </Select>
                  </div>
                  <div className="mt-4 grid gap-3 text-sm text-white/68 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-[18px] border border-white/8 bg-black/25 px-3 py-3">Bookings {item.popularity.bookingCount}</div>
                    <div className="rounded-[18px] border border-white/8 bg-black/25 px-3 py-3">Revenue {currency(item.popularity.revenueGenerated)}</div>
                    <div className="rounded-[18px] border border-white/8 bg-black/25 px-3 py-3">Rating {item.popularity.averageRating.toFixed(1)}</div>
                    <div className="rounded-[18px] border border-white/8 bg-black/25 px-3 py-3">Repeat {item.popularity.repeatRate}%</div>
                  </div>
                  <div className="mt-4 flex justify-end">
                    <Button className="h-11 px-5" disabled={updateMutation.isPending} onClick={() => void handleSaveService(item.service.id)}>
                      {updateMutation.isPending ? "Saving..." : "Save service"}
                    </Button>
                  </div>
                </div>
              );
            }) : (
              <div className="empty-state-panel rounded-[24px] p-5 text-sm text-white/55">
                No editable services are available in this role yet.
              </div>
            )}
          </div>
        </Card>

        <Card className="rounded-[32px] p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="surface-label">Protected catalog visibility</p>
              <p className="mt-2 text-sm text-white/58">Shop-owned commission services and self-owned booth-rent services are visible here without weakening the permission boundary.</p>
            </div>
            <LockKeyhole className="h-5 w-5 text-[#d9f985]" />
          </div>
          <div className="mt-4 space-y-3">
            {isInitialLoading ? (
              <>
                <MetricSkeleton />
                <MetricSkeleton />
              </>
            ) : catalogQuery.data?.readOnlyServices.length ? catalogQuery.data.readOnlyServices.map((item) => (
              <div key={item.service.id} className="rounded-[24px] border border-white/8 bg-black/20 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">{item.service.name}</p>
                    <p className="mt-1 text-sm text-white/55">{item.ownerLabel}</p>
                  </div>
                  <span className="status-pill text-white/68">Read-only</span>
                </div>
                <p className="mt-3 text-sm text-white/62">{item.service.description}</p>
                <div className="mt-4 grid gap-3 text-sm text-white/68 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-[18px] border border-white/8 bg-black/25 px-3 py-3">{currency(item.service.price)}</div>
                  <div className="rounded-[18px] border border-white/8 bg-black/25 px-3 py-3">{item.service.durationMin} min</div>
                  <div className="rounded-[18px] border border-white/8 bg-black/25 px-3 py-3">Bookings {item.popularity.bookingCount}</div>
                  <div className="rounded-[18px] border border-white/8 bg-black/25 px-3 py-3">Top style {item.styleTags[0]?.name ?? "General"}</div>
                </div>
              </div>
            )) : (
              <div className="empty-state-panel rounded-[24px] p-5 text-sm text-white/55">
                No read-only service lanes are active for this role right now.
              </div>
            )}
          </div>
        </Card>
      </section>
    </div>
  );
}




