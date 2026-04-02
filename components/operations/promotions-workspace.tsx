"use client";

import { useEffect, useMemo, useState } from "react";
import { Megaphone, Percent, TicketPercent } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useCreatePromotionMutation,
  usePromotionsManagementQuery,
  useUpdatePromotionMutation,
  type PromotionApiError
} from "@/lib/promotions/client";
import { getReadableActionError } from "@/lib/utils/feedback";
import type { Role } from "@/types/domain";

type PromotionsWorkspaceRole = Extract<Role, "owner" | "manager">;

type PromotionFormState = {
  shopId: string;
  name: string;
  code: string;
  description: string;
  promotionType: "code" | "automatic" | "featured";
  discountType: "percent" | "fixed_amount";
  discountValue: string;
  appliesToScope: "booking" | "service" | "shop";
  serviceId: string;
  barberId: string;
  minSubtotal: string;
  maxDiscountAmount: string;
  usageLimit: string;
  startsAt: string;
  endsAt: string;
};

function formatDateTime(iso: string) {
  const date = new Date(iso);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function toInputValue(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 16);
}

function toIsoOrUndefined(value: string) {
  if (!value.trim()) {
    return undefined;
  }

  const localDate = new Date(value);
  return Number.isNaN(localDate.getTime()) ? undefined : localDate.toISOString();
}

function addDays(value: Date, days: number) {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}

function createInitialFormState() {
  const now = new Date();
  const endsAt = addDays(now, 14);

  return {
    shopId: "",
    name: "",
    code: "",
    description: "",
    promotionType: "code" as const,
    discountType: "percent" as const,
    discountValue: "15",
    appliesToScope: "booking" as const,
    serviceId: "",
    barberId: "",
    minSubtotal: "",
    maxDiscountAmount: "",
    usageLimit: "",
    startsAt: toInputValue(now.toISOString()),
    endsAt: toInputValue(endsAt.toISOString())
  };
}

function getAvailabilityTone(state: string) {
  switch (state) {
    case "active":
      return "text-[#d7ffab]";
    case "scheduled":
      return "text-sky-200";
    case "expired":
      return "text-white/48";
    default:
      return "text-amber-200";
  }
}

function MetricSkeleton() {
  return (
    <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="mt-4 h-8 w-14" />
      <Skeleton className="mt-3 h-4 w-24" />
    </div>
  );
}

export function PromotionsWorkspace({
  viewerRole,
  locationIds
}: {
  viewerRole: PromotionsWorkspaceRole;
  locationIds: string[];
}) {
  const promotionsQuery = usePromotionsManagementQuery();
  const createPromotionMutation = useCreatePromotionMutation();
  const updatePromotionMutation = useUpdatePromotionMutation();
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [form, setForm] = useState<PromotionFormState>(() => createInitialFormState());

  const payload = promotionsQuery.data;
  const isInitialLoading = promotionsQuery.isLoading && !payload;
  const errorMessage = promotionsQuery.error ? getReadableActionError(promotionsQuery.error as PromotionApiError) : null;
  const scopedShops = useMemo(
    () => (payload?.shops ?? []).filter((shop) => locationIds.length === 0 || locationIds.includes(shop.id)),
    [locationIds, payload?.shops]
  );
  const selectedShopId = form.shopId || scopedShops[0]?.id || "";
  const scopedServices = useMemo(
    () => (payload?.services ?? []).filter((service) => !selectedShopId || service.shopId === selectedShopId),
    [payload?.services, selectedShopId]
  );
  const scopedBarbers = useMemo(
    () => (payload?.barbers ?? []).filter((barber) => !selectedShopId || barber.shopId === selectedShopId),
    [payload?.barbers, selectedShopId]
  );
  const scopedPromotions = useMemo(
    () => (payload?.promotions ?? []).filter((promotion) => !locationIds.length || locationIds.includes(promotion.shopId)),
    [locationIds, payload?.promotions]
  );

  useEffect(() => {
    if (!form.shopId && scopedShops[0]?.id) {
      setForm((current) => ({ ...current, shopId: scopedShops[0]?.id ?? "" }));
    }
  }, [form.shopId, scopedShops]);

  async function handleCreatePromotion() {
    setFeedback(null);

    try {
      await createPromotionMutation.mutateAsync({
        shopId: selectedShopId,
        name: form.name,
        code: form.code || undefined,
        description: form.description || undefined,
        promotionType: form.promotionType,
        discountType: form.discountType,
        discountValue: Number(form.discountValue),
        appliesToScope: form.appliesToScope,
        serviceId: form.serviceId || undefined,
        barberId: form.barberId || undefined,
        minSubtotal: form.minSubtotal ? Number(form.minSubtotal) : undefined,
        maxDiscountAmount: form.maxDiscountAmount ? Number(form.maxDiscountAmount) : undefined,
        usageLimit: form.usageLimit ? Number(form.usageLimit) : undefined,
        startsAt: toIsoOrUndefined(form.startsAt) ?? new Date().toISOString(),
        endsAt: toIsoOrUndefined(form.endsAt) ?? addDays(new Date(), 14).toISOString(),
        isActive: true
      });

      setFeedback({ tone: "success", message: "Promotion created and added to the live offers workspace." });
      setForm((current) => ({
        ...createInitialFormState(),
        shopId: current.shopId || selectedShopId
      }));
    } catch (error) {
      setFeedback({ tone: "error", message: getReadableActionError(error as PromotionApiError) });
    }
  }

  async function handleTogglePromotion(promotionId: string, isActive: boolean) {
    setFeedback(null);

    try {
      await updatePromotionMutation.mutateAsync({
        promotionId,
        payload: {
          isActive: !isActive
        }
      });
      setFeedback({
        tone: "success",
        message: isActive ? "Promotion deactivated without changing redemption history." : "Promotion activated and available for new bookings."
      });
    } catch (error) {
      setFeedback({ tone: "error", message: getReadableActionError(error as PromotionApiError) });
    }
  }

  return (
    <div className="space-y-4" data-testid="promotions-workspace">
      <Card className="rounded-[32px] p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="surface-label">Marketing and promotions</p>
            <h3 className="mt-3 text-3xl font-semibold sm:text-5xl" data-display="true">Offers that move real bookings.</h3>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-white/62">
              {viewerRole === "owner"
                ? "Launch shop offers, keep discount usage auditable, and make retention plays visible without leaving the reports lane."
                : "Create and control live promotions for your shop scope without turning booking totals into guesswork."}
            </p>
          </div>
          <div className="rounded-[24px] border border-white/8 bg-black/20 px-4 py-4 text-sm text-white/66">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#7CFF00]/20 bg-[#7CFF00]/10 px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-[#d7ffab]">
              <Megaphone className="h-4 w-4" />
              {scopedPromotions.length} offers in scope
            </div>
            <p className="mt-4 text-[11px] uppercase tracking-[0.22em] text-white/42">
              {scopedPromotions.filter((promotion) => promotion.availabilityState === "active").length} active now
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {feedback ? <FeedbackBanner tone={feedback.tone} message={feedback.message} /> : null}
          {errorMessage ? <FeedbackBanner tone="error" message={errorMessage} /> : null}
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
                <p className="surface-label">Active offers</p>
                <p className="mt-3 text-3xl font-semibold" data-display="true">
                  {scopedPromotions.filter((promotion) => promotion.availabilityState === "active").length}
                </p>
                <p className="mt-2 text-sm text-white/58">Currently available to clients in live booking.</p>
              </div>
              <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
                <p className="surface-label">Redemptions</p>
                <p className="mt-3 text-3xl font-semibold" data-display="true">
                  {scopedPromotions.reduce((sum, promotion) => sum + promotion.usageCount, 0)}
                </p>
                <p className="mt-2 text-sm text-white/58">Auditable usage across current offers.</p>
              </div>
              <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
                <p className="surface-label">Scheduled</p>
                <p className="mt-3 text-3xl font-semibold" data-display="true">
                  {scopedPromotions.filter((promotion) => promotion.availabilityState === "scheduled").length}
                </p>
                <p className="mt-2 text-sm text-white/58">Upcoming campaigns staged for release.</p>
              </div>
            </>
          )}
        </div>
      </Card>

      <section className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Card className="rounded-[32px] p-6">
          <div className="flex items-center justify-between gap-3">
            <p className="surface-label">Create promotion</p>
            <TicketPercent className="h-5 w-5 text-[#baff69]" />
          </div>

          <div className="mt-4 grid gap-3">
            <Select
              value={selectedShopId}
              onChange={(event) => setForm((current) => ({ ...current, shopId: event.target.value, serviceId: "", barberId: "" }))}
            >
              <option value="">Choose shop</option>
              {scopedShops.map((shop) => (
                <option key={shop.id} value={shop.id}>{shop.label}</option>
              ))}
            </Select>
            <Input
              placeholder="Promotion name"
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            />
            <Input
              placeholder="Promo code (optional for automatic/featured)"
              value={form.code}
              onChange={(event) => setForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))}
            />
            <Input
              placeholder="Short description"
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <Select
                value={form.promotionType}
                onChange={(event) => setForm((current) => ({ ...current, promotionType: event.target.value as PromotionFormState["promotionType"] }))}
              >
                <option value="code">Code-based</option>
                <option value="automatic">Automatic</option>
                <option value="featured">Featured</option>
              </Select>
              <Select
                value={form.discountType}
                onChange={(event) => setForm((current) => ({ ...current, discountType: event.target.value as PromotionFormState["discountType"] }))}
              >
                <option value="percent">Percent off</option>
                <option value="fixed_amount">Fixed amount off</option>
              </Select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                type="number"
                min={0}
                step="0.01"
                placeholder="Discount value"
                value={form.discountValue}
                onChange={(event) => setForm((current) => ({ ...current, discountValue: event.target.value }))}
              />
              <Select
                value={form.appliesToScope}
                onChange={(event) => setForm((current) => ({ ...current, appliesToScope: event.target.value as PromotionFormState["appliesToScope"] }))}
              >
                <option value="booking">Whole booking</option>
                <option value="service">Selected service</option>
                <option value="shop">Shop-wide</option>
              </Select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Select
                value={form.serviceId}
                onChange={(event) => setForm((current) => ({ ...current, serviceId: event.target.value }))}
              >
                <option value="">Any service</option>
                {scopedServices.map((service) => (
                  <option key={service.id} value={service.id}>{service.label}</option>
                ))}
              </Select>
              <Select
                value={form.barberId}
                onChange={(event) => setForm((current) => ({ ...current, barberId: event.target.value }))}
              >
                <option value="">Any barber</option>
                {scopedBarbers.map((barber) => (
                  <option key={barber.id} value={barber.id}>{barber.label}</option>
                ))}
              </Select>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Input
                type="number"
                min={0}
                step="0.01"
                placeholder="Min subtotal"
                value={form.minSubtotal}
                onChange={(event) => setForm((current) => ({ ...current, minSubtotal: event.target.value }))}
              />
              <Input
                type="number"
                min={0}
                step="0.01"
                placeholder="Max discount"
                value={form.maxDiscountAmount}
                onChange={(event) => setForm((current) => ({ ...current, maxDiscountAmount: event.target.value }))}
              />
              <Input
                type="number"
                min={1}
                step="1"
                placeholder="Usage limit"
                value={form.usageLimit}
                onChange={(event) => setForm((current) => ({ ...current, usageLimit: event.target.value }))}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                type="datetime-local"
                value={form.startsAt}
                onChange={(event) => setForm((current) => ({ ...current, startsAt: event.target.value }))}
              />
              <Input
                type="datetime-local"
                value={form.endsAt}
                onChange={(event) => setForm((current) => ({ ...current, endsAt: event.target.value }))}
              />
            </div>
            <Button
              className="h-12 w-full"
              disabled={
                createPromotionMutation.isPending
                || !selectedShopId
                || !form.name.trim()
                || !form.discountValue.trim()
                || (form.promotionType === "code" && !form.code.trim())
                || (form.appliesToScope === "service" && !form.serviceId)
                || !form.startsAt
                || !form.endsAt
              }
              onClick={() => void handleCreatePromotion()}
            >
              {createPromotionMutation.isPending ? "Creating..." : "Launch promotion"}
            </Button>
          </div>
        </Card>

        <Card className="rounded-[32px] p-6">
          <div className="flex items-center justify-between gap-3">
            <p className="surface-label">Live offers</p>
            <Percent className="h-5 w-5 text-[#baff69]" />
          </div>

          <div className="mt-4 space-y-3">
            {isInitialLoading ? (
              <>
                <MetricSkeleton />
                <MetricSkeleton />
              </>
            ) : scopedPromotions.length ? scopedPromotions.map((promotion) => (
              <div key={promotion.id} className="rounded-[24px] border border-white/8 bg-black/20 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-white">{promotion.name}</p>
                    <p className="mt-1 text-sm text-white/58">
                      {promotion.code ? `${promotion.code} • ` : ""}
                      {promotion.discountType === "percent"
                        ? `${promotion.discountValue}% off`
                        : `$${promotion.discountValue.toFixed(2)} off`}
                    </p>
                  </div>
                  <span className={`status-pill ${getAvailabilityTone(promotion.availabilityState)}`}>
                    {promotion.availabilityState}
                  </span>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[18px] border border-white/8 bg-black/18 p-3 text-sm text-white/72">
                    {promotion.shopLabel}
                  </div>
                  <div className="rounded-[18px] border border-white/8 bg-black/18 p-3 text-sm text-white/72">
                    {promotion.serviceName ? `Service: ${promotion.serviceName}` : promotion.appliesToScope === "shop" ? "Shop-wide offer" : "Whole booking"}
                  </div>
                  <div className="rounded-[18px] border border-white/8 bg-black/18 p-3 text-sm text-white/72">
                    Usage {promotion.usageCount}{promotion.usageLimit ? ` / ${promotion.usageLimit}` : ""}
                  </div>
                  <div className="rounded-[18px] border border-white/8 bg-black/18 p-3 text-sm text-white/72">
                    {promotion.barberName ? `Barber: ${promotion.barberName}` : "Any eligible barber"}
                  </div>
                </div>

                <p className="mt-3 text-sm text-white/55">
                  {promotion.description ?? `Runs from ${formatDateTime(promotion.startsAt)} to ${formatDateTime(promotion.endsAt)}.`}
                </p>
                <p className="mt-2 text-sm text-white/48">
                  Window {formatDateTime(promotion.startsAt)} → {formatDateTime(promotion.endsAt)}
                </p>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    className="h-11 px-4"
                    disabled={updatePromotionMutation.isPending}
                    onClick={() => void handleTogglePromotion(promotion.id, promotion.isActive)}
                  >
                    {promotion.isActive ? "Deactivate" : "Activate"}
                  </Button>
                </div>
              </div>
            )) : (
              <div className="empty-state-panel rounded-[24px] p-6 text-sm leading-7 text-white/58">
                No promotions are live yet. Launch one from the form and it will become available in the booking flow for eligible clients.
              </div>
            )}
          </div>
        </Card>
      </section>
    </div>
  );
}
