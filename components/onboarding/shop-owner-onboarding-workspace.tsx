"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { OnboardingReadinessSummary } from "@/components/onboarding/onboarding-readiness-summary";
import {
  OWNER_AUTHORITY_VALUES,
  SHOP_BOOKING_MODE_OPTIONS,
  SHOP_CHAIR_RANGE_VALUES,
  SHOP_HOURS_TYPE_VALUES,
  SHOP_OPERATING_MODEL_VALUES,
  SHOP_PAYMENT_MODEL_OPTIONS,
  SHOP_POLICY_VALUES,
  authorityRequiresReview,
  buildShopOwnerOnboardingReadiness,
  canUseShopBookingMode,
  chairEstimateForRange,
  cleanShopUsername,
  getNextShopOwnerOnboardingStep,
  getShopInviteLink,
  getShopOwnerHomeFallbackPrompts,
  hasCompleteShopHours,
  hasCompleteShopLocation,
  normalizeShopOwnerOnboardingStep,
  type ShopBookingMode,
  type ShopChairRange,
  type ShopHoursType,
  type ShopOperatingModel,
  type ShopOwnerOnboardingDraft,
  type ShopOwnerOnboardingStep,
  type ShopPaymentModel,
  type ShopPolicyChoice
} from "@/lib/onboarding/shop-owner-path";

type JsonResponse = {
  error?: string;
  message?: string;
  nextPath?: string;
};

type UsernameStatus = "idle" | "checking" | "available" | "taken" | "reserved" | "invalid" | "blocked" | "error";

const DAY_OPTIONS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function routeFor(step: ShopOwnerOnboardingStep) {
  return `/onboarding/owner?step=${step}` as Route;
}

function optionLabel(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (segment) => segment.toUpperCase());
}

function readJson(response: Response): Promise<JsonResponse> {
  return response.json().catch(() => ({})) as Promise<JsonResponse>;
}

function usernameMessage(status: UsernameStatus, hasShopRecord: boolean) {
  if (!hasShopRecord) return "Shop name can be drafted now. Public username claim needs a real shop record.";
  switch (status) {
    case "checking":
      return "Checking availability...";
    case "available":
      return "Available";
    case "taken":
      return "Already claimed";
    case "reserved":
      return "This name is protected";
    case "invalid":
      return "Use letters, numbers, hyphens, or underscores";
    case "blocked":
      return "Create or connect the shop record before claiming this name.";
    case "error":
      return "Could not check username. Try again.";
    default:
      return "Claim the shop BVRB3R name before Shop Ready can pass.";
  }
}

export function ShopOwnerOnboardingWorkspace({
  step,
  initialDraft
}: {
  step?: string;
  initialDraft: ShopOwnerOnboardingDraft;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const activeStep = normalizeShopOwnerOnboardingStep(step);
  const [draft, setDraft] = useState<ShopOwnerOnboardingDraft>({
    authenticated: true,
    role: "shop_owner_user",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York",
    shopMoneySetupStatus: "unknown",
    verificationPosture: "unknown",
    ...initialDraft
  });
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>(draft.usernameAvailable ? "available" : "idle");
  const [availableUsername, setAvailableUsername] = useState(draft.usernameAvailable ? draft.shopUsername ?? "" : "");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  const readiness = useMemo(() => buildShopOwnerOnboardingReadiness(draft), [draft]);
  const homePrompts = getShopOwnerHomeFallbackPrompts(draft);
  const inviteLink = getShopInviteLink(draft);
  const hasShopRecord = Boolean(draft.shopRecordId);
  const busy = isPending || usernameStatus === "checking";

  function go(nextStep: ShopOwnerOnboardingStep) {
    setErrorMessage(null);
    setSuccessMessage(null);
    startTransition(() => router.replace(routeFor(nextStep)));
  }

  function continueToNext() {
    go(getNextShopOwnerOnboardingStep(activeStep));
  }

  async function checkShopUsernameAvailability() {
    setErrorMessage(null);
    const username = cleanShopUsername(draft.shopUsername ?? "");
    setDraft((current) => ({ ...current, shopUsername: username, usernameAvailable: false }));
    setAvailableUsername("");

    if (username.length < 3) {
      setUsernameStatus("invalid");
      return false;
    }

    if (!draft.shopRecordId) {
      setUsernameStatus("blocked");
      return false;
    }

    setUsernameStatus("checking");
    try {
      const response = await fetch(`/api/profile/username/availability?username=${encodeURIComponent(username)}&ownerType=shop&shopId=${encodeURIComponent(draft.shopRecordId)}`, {
        headers: { Accept: "application/json" }
      });
      if (!response.ok) {
        setUsernameStatus("error");
        return false;
      }
      const body = await response.json().catch(() => ({})) as { available?: boolean; reason?: string | null };
      if (body.available) {
        setUsernameStatus("available");
        setAvailableUsername(username);
        setDraft((current) => ({ ...current, shopUsername: username, usernameAvailable: true }));
        return true;
      }
      setUsernameStatus(body.reason === "reserved" ? "reserved" : body.reason === "invalid" ? "invalid" : "taken");
      return false;
    } catch {
      setUsernameStatus("error");
      return false;
    }
  }

  async function saveShopIdentity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    if (!draft.shopName?.trim()) {
      setErrorMessage("Shop name is required before preview.");
      return;
    }
    if (draft.shopUsername?.trim() && hasShopRecord) {
      const usernameReady = usernameStatus === "available" && availableUsername === cleanShopUsername(draft.shopUsername)
        ? true
        : await checkShopUsernameAvailability();
      if (!usernameReady) {
        setErrorMessage("Claim an available shop name or continue with the draft username later.");
        return;
      }
      try {
        const response = await fetch("/api/profile/media", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            action: "set_shop_public_username",
            shopId: draft.shopRecordId,
            username: cleanShopUsername(draft.shopUsername)
          })
        });
        if (!response.ok) {
          const body = await readJson(response);
          throw new Error(body.error ?? "Shop public name could not be saved.");
        }
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Shop public name could not be saved.");
        return;
      }
    }
    continueToNext();
  }

  async function saveShopProfileProof() {
    if (!hasCompleteShopLocation(draft) || !hasCompleteShopHours(draft) || !draft.shopName?.trim()) {
      setErrorMessage("Shop name, full location, and hours are required before this setup can be saved.");
      return false;
    }
    try {
      const response = await fetch("/api/onboarding/owner/shop", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          shopName: draft.shopName,
          phone: draft.phone || "0000000000",
          address: [draft.addressLine1, draft.city, draft.state, draft.zipCode].filter(Boolean).join(", "),
          publicDescription: draft.publicDescription || "Shop profile started through BVRB3R onboarding.",
          hours: draft.hoursType === "standard" ? `Standard shop hours ${draft.timezone}` : `${draft.availableDays?.join(", ")} ${draft.startTime}-${draft.endTime} ${draft.timezone}`
        })
      });
      if (!response.ok) {
        const body = await readJson(response);
        throw new Error(body.message ?? body.error ?? "Shop setup could not be saved.");
      }
      setSuccessMessage("Shop setup saved.");
      return true;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Shop setup could not be saved.");
      return false;
    }
  }

  async function saveStructureProof() {
    if (!draft.operatingModel || !draft.bookingMode || !canUseShopBookingMode(draft.bookingMode, draft)) {
      setErrorMessage("Choose a supported operating and booking setup before continuing.");
      return false;
    }
    try {
      const response = await fetch("/api/onboarding/owner/structure", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          operatingModel: optionLabel(draft.operatingModel),
          walkInsEnabled: draft.bookingMode === "pick_barber",
          defaultServiceCategory: "Haircuts"
        })
      });
      if (!response.ok) {
        const body = await readJson(response);
        throw new Error(body.message ?? body.error ?? "Shop structure could not be saved.");
      }
      return true;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Shop structure could not be saved.");
      return false;
    }
  }

  async function saveTeamNote(inviteEmails: string) {
    try {
      const response = await fetch("/api/onboarding/owner/team", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ inviteEmails })
      });
      if (!response.ok) {
        const body = await readJson(response);
        throw new Error(body.message ?? body.error ?? "Team invite setup could not be saved.");
      }
      return true;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Team invite setup could not be saved.");
      return false;
    }
  }

  async function copyInvite() {
    setCopyState("idle");
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${inviteLink}`);
      setCopyState("copied");
      setDraft((current) => ({ ...current, inviteCopied: true }));
    } catch {
      setCopyState("failed");
    }
  }

  function renderPreview() {
    return (
      <Card className="rounded-[34px] p-6 sm:p-8 lg:p-10">
        <Badge>Shop Owner</Badge>
        <h1 className="mt-5 text-balance text-4xl font-semibold sm:text-5xl" data-display="true">Your shop path is ready.</h1>
        <p className="mt-5 max-w-2xl text-sm leading-7 text-white/66 sm:text-base">
          Set up your shop profile, team, chairs, policies, kiosk, and money model.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button type="button" className="h-12 px-6" onClick={() => go("access")}>Set Up My Shop</Button>
          <Link className="inline-flex h-12 items-center justify-center rounded-full border border-white/10 px-6 text-sm font-semibold text-white/78" href="/dashboard/owner">Enter Home</Link>
        </div>
        <div className="mt-6 rounded-[24px] border border-white/8 bg-black/20 p-4 text-sm leading-7 text-white/64">
          Entering Home keeps missing setup prompts visible. No setup is marked complete from this preview.
        </div>
      </Card>
    );
  }

  function renderAccess() {
    return (
      <Card className="rounded-[34px] p-6 sm:p-8 lg:p-10">
        <Badge>Shop Owner</Badge>
        <h1 className="mt-5 text-balance text-4xl font-semibold sm:text-5xl" data-display="true">Access confirmed.</h1>
        <p className="mt-5 text-sm leading-7 text-white/64">
          Basic shop profile, location, hours, chairs, and first barber invite stay open in this setup path.
        </p>
        <Button type="button" className="mt-8 h-12 w-full" onClick={continueToNext}>Continue</Button>
      </Card>
    );
  }

  function renderAuthority() {
    return (
      <Card className="rounded-[34px] p-6 sm:p-8 lg:p-10">
        <Badge>Shop Owner</Badge>
        <h1 className="mt-5 text-balance text-4xl font-semibold sm:text-5xl" data-display="true">Confirm owner authority.</h1>
        <p className="mt-4 text-sm leading-7 text-white/64">Tell BVRB3R what control you have over this shop.</p>
        <div className="mt-8 grid gap-3">
          {OWNER_AUTHORITY_VALUES.map((value) => (
            <button
              key={value}
              type="button"
              className={`rounded-[22px] border p-4 text-left text-sm font-semibold ${draft.ownerAuthorityType === value ? "border-[#d6b46a] bg-[#d6b46a]/12 text-white" : "border-white/10 bg-black/20 text-white/66"}`}
              onClick={() => setDraft((current) => ({ ...current, ownerAuthorityType: value, authorityRequiresReview: authorityRequiresReview(value) }))}
            >
              {value === "owner" ? "I own this shop" : value === "manager" ? "I manage this shop" : value === "opening_shop" ? "I'm opening a shop" : "I'm setting up for the owner"}
            </button>
          ))}
        </div>
        <Button type="button" className="mt-6 h-12 w-full" onClick={() => draft.ownerAuthorityType ? continueToNext() : setErrorMessage("Choose your authority before continuing.")}>Continue</Button>
      </Card>
    );
  }

  function renderIdentity() {
    return (
      <Card className="rounded-[34px] p-6 sm:p-8 lg:p-10">
        <Badge>Shop Owner</Badge>
        <h1 className="mt-5 text-balance text-4xl font-semibold sm:text-5xl" data-display="true">Create your shop identity.</h1>
        <form onSubmit={saveShopIdentity} className="mt-8 grid gap-4">
          <label className="grid gap-2 text-sm text-white/72">Shop name<Input value={draft.shopName ?? ""} onChange={(event) => setDraft((current) => ({ ...current, shopName: event.target.value }))} placeholder="BVRB3R Hyde Park" required /></label>
          <label className="grid gap-2 text-sm text-white/72">Display name<Input value={draft.shopDisplayName ?? ""} onChange={(event) => setDraft((current) => ({ ...current, shopDisplayName: event.target.value }))} placeholder="Hyde Park Cuts" /></label>
          <label className="grid gap-2 text-sm text-white/72">Shop username<Input value={draft.shopUsername ?? ""} onChange={(event) => { setDraft((current) => ({ ...current, shopUsername: event.target.value, usernameAvailable: false })); setUsernameStatus("idle"); }} placeholder="hydeparkcuts" /></label>
          <Button type="button" variant="secondary" className="h-11" disabled={busy || !draft.shopUsername?.trim() || !hasShopRecord} onClick={() => void checkShopUsernameAvailability()}>Check Availability</Button>
          <p className="text-xs leading-6 text-white/52" data-testid="shop-username-status">{usernameMessage(usernameStatus, hasShopRecord)}</p>
          <label className="grid gap-2 text-sm text-white/72">Public description<Input value={draft.publicDescription ?? ""} onChange={(event) => setDraft((current) => ({ ...current, publicDescription: event.target.value }))} placeholder="Premium cuts, clean timing, trusted team." /></label>
          <Button type="submit" className="h-12" disabled={busy}>Use this shop identity</Button>
        </form>
      </Card>
    );
  }

  function renderShopPreview() {
    return (
      <Card className="rounded-[34px] p-6 sm:p-8 lg:p-10">
        <Badge>Shop Owner</Badge>
        <h1 className="mt-5 text-balance text-4xl font-semibold sm:text-5xl" data-display="true">Preview your shop.</h1>
        <div className="mt-8 rounded-[28px] border border-white/8 bg-black/24 p-5">
          <p className="text-2xl font-black text-white">{draft.shopDisplayName || draft.shopName || "Draft shop"}</p>
          <p className="mt-2 text-sm leading-6 text-white/58">{draft.publicDescription || "Public description needs setup."}</p>
          <div className="mt-5 grid gap-2 text-sm text-white/62 sm:grid-cols-2">
            <p>Identity: {draft.shopName ? "Drafted" : "Needs setup"}</p>
            <p>Location: {hasCompleteShopLocation(draft) ? "Ready" : "Needs setup"}</p>
            <p>Hours: {hasCompleteShopHours(draft) ? "Ready" : "Needs setup"}</p>
            <p>Team: {draft.teamEligible ? "Connected" : "Needs first barber"}</p>
            <p>Kiosk: {readiness.readiness.kiosk.statusLabel}</p>
          </div>
        </div>
        <Button type="button" className="mt-6 h-12 w-full" onClick={continueToNext}>Continue</Button>
      </Card>
    );
  }

  function renderLocation() {
    return (
      <Card className="rounded-[34px] p-6 sm:p-8 lg:p-10">
        <Badge>Shop Owner</Badge>
        <h1 className="mt-5 text-balance text-4xl font-semibold sm:text-5xl" data-display="true">Add your shop location.</h1>
        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          <Button type="button" variant="secondary" className="h-12" onClick={() => setDraft((current) => ({ ...current, locationCaptureMethod: "full_address" }))}>Add full address</Button>
          <Button type="button" variant="secondary" className="h-12" onClick={() => { setDraft((current) => ({ ...current, locationCaptureMethod: "current_location", locationPermissionDenied: true })); setErrorMessage("Location permission was not used. Enter the shop address manually."); }}>Use current location</Button>
          <Button type="button" variant="secondary" className="h-12" onClick={() => setDraft((current) => ({ ...current, locationCaptureMethod: "city_first", locationCompleted: false }))}>Enter city first</Button>
        </div>
        <div className="mt-6 grid gap-4">
          <label className="grid gap-2 text-sm text-white/72">Address line 1<Input value={draft.addressLine1 ?? ""} onChange={(event) => setDraft((current) => ({ ...current, addressLine1: event.target.value, locationCaptureMethod: "full_address" }))} placeholder="123 Main St" /></label>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="grid gap-2 text-sm text-white/72">City<Input value={draft.city ?? ""} onChange={(event) => setDraft((current) => ({ ...current, city: event.target.value }))} placeholder="Tampa" /></label>
            <label className="grid gap-2 text-sm text-white/72">State<Input value={draft.state ?? ""} onChange={(event) => setDraft((current) => ({ ...current, state: event.target.value }))} placeholder="FL" /></label>
            <label className="grid gap-2 text-sm text-white/72">ZIP<Input value={draft.zipCode ?? ""} onChange={(event) => setDraft((current) => ({ ...current, zipCode: event.target.value }))} placeholder="33602" /></label>
          </div>
          <Button type="button" className="h-12" onClick={() => {
            const complete = hasCompleteShopLocation(draft);
            setDraft((current) => ({ ...current, locationCompleted: complete }));
            if (complete || draft.locationCaptureMethod === "city_first") {
              continueToNext();
              return;
            }
            setErrorMessage("Add a full shop address or choose city-first draft.");
          }}>Continue</Button>
        </div>
      </Card>
    );
  }

  function renderHours() {
    return (
      <Card className="rounded-[34px] p-6 sm:p-8 lg:p-10">
        <Badge>Shop Owner</Badge>
        <h1 className="mt-5 text-balance text-4xl font-semibold sm:text-5xl" data-display="true">Set shop hours.</h1>
        <div className="mt-8 grid gap-3">
          {SHOP_HOURS_TYPE_VALUES.map((value) => (
            <button key={value} type="button" className={`rounded-[22px] border p-4 text-left ${draft.hoursType === value ? "border-[#d6b46a] bg-[#d6b46a]/12 text-white" : "border-white/10 bg-black/20 text-white/66"}`} onClick={() => setDraft((current) => ({ ...current, hoursType: value as ShopHoursType }))}>
              {value === "standard" ? "Use standard shop hours" : value === "custom" ? "Custom hours" : "Set later"}
            </button>
          ))}
        </div>
        {draft.hoursType === "custom" ? (
          <div className="mt-6 grid gap-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{DAY_OPTIONS.map((day) => {
              const selected = draft.availableDays?.includes(day) ?? false;
              return <button key={day} type="button" className={`rounded-2xl border px-3 py-3 text-xs font-bold ${selected ? "border-[#d6b46a] bg-[#d6b46a]/12 text-white" : "border-white/10 bg-black/20 text-white/62"}`} onClick={() => setDraft((current) => {
                const days = current.availableDays ?? [];
                return { ...current, availableDays: selected ? days.filter((item) => item !== day) : [...days, day] };
              })}>{day}</button>;
            })}</div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm text-white/72">Open<Input type="time" value={draft.startTime ?? ""} onChange={(event) => setDraft((current) => ({ ...current, startTime: event.target.value }))} /></label>
              <label className="grid gap-2 text-sm text-white/72">Close<Input type="time" value={draft.endTime ?? ""} onChange={(event) => setDraft((current) => ({ ...current, endTime: event.target.value }))} /></label>
            </div>
          </div>
        ) : null}
        <label className="mt-6 grid gap-2 text-sm text-white/72">Timezone<Input value={draft.timezone ?? ""} onChange={(event) => setDraft((current) => ({ ...current, timezone: event.target.value }))} /></label>
        <Button type="button" className="mt-6 h-12 w-full" onClick={async () => {
          if (!draft.hoursType) {
            setErrorMessage("Choose hours or set later before continuing.");
            return;
          }
          const complete = hasCompleteShopHours(draft);
          setDraft((current) => ({ ...current, hoursCompleted: complete }));
          if (complete && hasCompleteShopLocation(draft)) {
            const saved = await saveShopProfileProof();
            if (!saved) return;
          }
          continueToNext();
        }}>Continue</Button>
      </Card>
    );
  }

  function renderChairCount() {
    return (
      <Card className="rounded-[34px] p-6 sm:p-8 lg:p-10">
        <Badge>Shop Owner</Badge>
        <h1 className="mt-5 text-balance text-4xl font-semibold sm:text-5xl" data-display="true">How many chairs are in the shop?</h1>
        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          {SHOP_CHAIR_RANGE_VALUES.map((value) => (
            <button key={value} type="button" className={`rounded-[22px] border p-4 text-left ${draft.chairRange === value ? "border-[#d6b46a] bg-[#d6b46a]/12 text-white" : "border-white/10 bg-black/20 text-white/66"}`} onClick={() => setDraft((current) => ({ ...current, chairRange: value as ShopChairRange, estimatedChairCount: chairEstimateForRange(value as ShopChairRange) }))}>
              {value === "not_sure" ? "Not sure yet" : optionLabel(value)}
            </button>
          ))}
        </div>
        <Button type="button" className="mt-6 h-12 w-full" onClick={() => draft.chairRange ? continueToNext() : setErrorMessage("Choose chair capacity or Not sure yet.")}>Continue</Button>
      </Card>
    );
  }

  function renderOperatingModel() {
    return (
      <Card className="rounded-[34px] p-6 sm:p-8 lg:p-10">
        <Badge>Shop Owner</Badge>
        <h1 className="mt-5 text-balance text-4xl font-semibold sm:text-5xl" data-display="true">Choose your operating model.</h1>
        <div className="mt-8 grid gap-3">
          {SHOP_OPERATING_MODEL_VALUES.map((value) => (
            <button key={value} type="button" className={`rounded-[22px] border p-4 text-left ${draft.operatingModel === value ? "border-[#d6b46a] bg-[#d6b46a]/12 text-white" : "border-white/10 bg-black/20 text-white/66"}`} onClick={() => setDraft((current) => ({ ...current, operatingModel: value as ShopOperatingModel }))}>
              {value === "booth_rent" ? "Booth rent" : value === "commission" ? "Commission" : value === "mixed" ? "Mixed model" : "Owner-operated"}
            </button>
          ))}
        </div>
        <p className="mt-4 text-sm leading-7 text-white/56">Booth rent and commission are shop relationship models, not account roles.</p>
        <Button type="button" className="mt-6 h-12 w-full" onClick={() => draft.operatingModel ? continueToNext() : setErrorMessage("Choose an operating model before continuing.")}>Continue</Button>
      </Card>
    );
  }

  function renderBookingMode() {
    return (
      <Card className="rounded-[34px] p-6 sm:p-8 lg:p-10">
        <Badge>Shop Owner</Badge>
        <h1 className="mt-5 text-balance text-4xl font-semibold sm:text-5xl" data-display="true">Choose how clients book.</h1>
        <div className="mt-8 grid gap-3">
          {SHOP_BOOKING_MODE_OPTIONS.map((option) => {
            const value = option.value as ShopBookingMode;
            const supported = option.supported && canUseShopBookingMode(value, draft);
            return (
              <button key={option.value} type="button" disabled={!supported} className={`rounded-[22px] border p-4 text-left ${draft.bookingMode === value ? "border-[#d6b46a] bg-[#d6b46a]/12 text-white" : "border-white/10 bg-black/20"} ${supported ? "text-white" : "text-white/40"}`} onClick={() => setDraft((current) => ({ ...current, bookingMode: value }))}>
                <span className="block font-semibold">{option.label}</span>
                <span className="mt-2 block text-sm">{supported ? "Available from current shop setup." : "Needs setup before this mode can activate."}</span>
              </button>
            );
          })}
        </div>
        <Button type="button" className="mt-6 h-12 w-full" onClick={async () => {
          if (!draft.bookingMode) {
            setErrorMessage("Choose a supported booking mode before continuing.");
            return;
          }
          const saved = await saveStructureProof();
          if (saved) continueToNext();
        }}>Continue</Button>
      </Card>
    );
  }

  function renderPaymentModel() {
    return (
      <Card className="rounded-[34px] p-6 sm:p-8 lg:p-10">
        <Badge>Shop Owner</Badge>
        <h1 className="mt-5 text-balance text-4xl font-semibold sm:text-5xl" data-display="true">Choose your shop payment model.</h1>
        <p className="mt-4 text-sm leading-7 text-white/64">Payment model selection does not mark money ready. Provider truth must come from the server.</p>
        <div className="mt-8 grid gap-3">
          {SHOP_PAYMENT_MODEL_OPTIONS.map((option) => (
            <button key={option.value} type="button" className={`rounded-[22px] border p-4 text-left ${draft.paymentModel === option.value ? "border-[#d6b46a] bg-[#d6b46a]/12 text-white" : "border-white/10 bg-black/20 text-white/66"}`} onClick={() => setDraft((current) => ({ ...current, paymentModel: option.value as ShopPaymentModel, providerTruthConnected: false, shopMoneySetupStatus: option.value === "setup_later" ? "deferred" : "needs_review" }))}>
              <span className="block font-semibold">{option.label}</span>
              <span className="mt-2 block text-sm">{option.detail}</span>
            </button>
          ))}
        </div>
        <Button type="button" className="mt-6 h-12 w-full" onClick={() => draft.paymentModel ? continueToNext() : setErrorMessage("Choose a payment model or set up later.")}>Continue</Button>
      </Card>
    );
  }

  function renderPolicies() {
    return (
      <Card className="rounded-[34px] p-6 sm:p-8 lg:p-10">
        <Badge>Shop Owner</Badge>
        <h1 className="mt-5 text-balance text-4xl font-semibold sm:text-5xl" data-display="true">Set shop policies.</h1>
        <div className="mt-8 grid gap-3">
          {SHOP_POLICY_VALUES.map((value) => (
            <button key={value} type="button" className={`rounded-[22px] border p-4 text-left ${draft.policiesChoice === value ? "border-[#d6b46a] bg-[#d6b46a]/12 text-white" : "border-white/10 bg-black/20 text-white/66"}`} onClick={() => setDraft((current) => ({ ...current, policiesChoice: value as ShopPolicyChoice, policiesAccepted: value !== "set_later" }))}>
              {value === "standard" ? "Use standard policies" : value === "custom" ? "Customize policies" : "Set later"}
            </button>
          ))}
        </div>
        <Button type="button" className="mt-6 h-12 w-full" onClick={() => draft.policiesChoice ? continueToNext() : setErrorMessage("Choose policies or set later.")}>Continue</Button>
      </Card>
    );
  }

  function renderInvite() {
    const invite = `Join my BVRB3R shop team: ${typeof window === "undefined" ? "" : window.location.origin}${inviteLink}`;
    return (
      <Card className="rounded-[34px] p-6 sm:p-8 lg:p-10">
        <Badge>Shop Owner</Badge>
        <h1 className="mt-5 text-balance text-4xl font-semibold sm:text-5xl" data-display="true">Invite your first barber.</h1>
        <div className="mt-8 grid gap-4">
          <label className="grid gap-2 text-sm text-white/72">Barber email or note<Input value={draft.inviteEmail ?? ""} onChange={(event) => setDraft((current) => ({ ...current, inviteEmail: event.target.value }))} placeholder="barber@example.com" /></label>
          <a className="inline-flex h-12 items-center justify-center rounded-full border border-white/10 px-6 text-sm font-semibold text-white/78" href={`sms:?&body=${encodeURIComponent(invite)}`}>Text invite</a>
          <Button type="button" variant="secondary" className="h-12" onClick={() => void copyInvite()}>Copy invite</Button>
          <Button type="button" variant="secondary" className="h-12" onClick={() => setErrorMessage("QR coming soon. Copy or text the invite link for now.")}>Show QR code</Button>
          <Button type="button" className="h-12" onClick={async () => {
            const saved = await saveTeamNote(draft.inviteEmail ?? "");
            if (saved) continueToNext();
          }}>Send Invite</Button>
          <Button type="button" variant="secondary" className="h-12" onClick={() => { setDraft((current) => ({ ...current, inviteSkipped: true })); go("home_handoff"); }}>Skip for now</Button>
        </div>
        {copyState === "copied" ? <p className="mt-4 text-sm text-[#d6b46a]">Copied</p> : null}
        {copyState === "failed" ? <p className="mt-4 text-sm text-[#ff8f8f]">Copy failed. Use Text invite or try again.</p> : null}
      </Card>
    );
  }

  function renderHandoff() {
    return (
      <Card className="rounded-[34px] p-6 sm:p-8 lg:p-10">
        <Badge>Shop Owner</Badge>
        <h1 className="mt-5 text-balance text-4xl font-semibold sm:text-5xl" data-display="true">Enter Owner Home.</h1>
        <p className="mt-4 text-sm leading-7 text-white/64">Owner onboarding can continue from Home. Missing setup stays visible as next action prompts.</p>
        {homePrompts.length ? <ul className="mt-6 grid gap-2 text-sm leading-7 text-white/66">{homePrompts.map((prompt) => <li key={prompt}>- {prompt}</li>)}</ul> : <p className="mt-6 text-sm text-[#d6b46a]">Owner onboarding is complete.</p>}
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link className="inline-flex h-12 items-center justify-center rounded-full bg-[#d6b46a] px-6 text-sm font-semibold text-black" href="/dashboard/owner">Enter Owner Home</Link>
          <Button type="button" variant="secondary" className="h-12 px-6" onClick={() => go("invite_first_barber")}>Invite First Barber</Button>
        </div>
      </Card>
    );
  }

  const surface = {
    preview: renderPreview,
    access: renderAccess,
    authority: renderAuthority,
    identity: renderIdentity,
    shop_preview: renderShopPreview,
    location: renderLocation,
    hours: renderHours,
    chair_count: renderChairCount,
    operating_model: renderOperatingModel,
    booking_mode: renderBookingMode,
    payment_model: renderPaymentModel,
    policies: renderPolicies,
    invite_first_barber: renderInvite,
    home_handoff: renderHandoff
  }[activeStep]();

  return (
    <section className="page-shell safe-top-pad app-safe-bottom flex min-h-[100svh] min-h-[100dvh] items-start py-6 sm:items-center sm:py-10" data-testid="shop-owner-onboarding-path">
      <div className="grid w-full gap-4 lg:grid-cols-[1fr_0.86fr]">
        <div>
          {surface}
          {errorMessage ? <p className="mt-4 rounded-[22px] border border-[#ff8f8f]/25 bg-[#ff8f8f]/10 p-4 text-sm leading-7 text-[#ffb3b3]">{errorMessage}</p> : null}
          {successMessage ? <p className="mt-4 rounded-[22px] border border-[#d6b46a]/25 bg-[#d6b46a]/10 p-4 text-sm leading-7 text-[#f1d79d]">{successMessage}</p> : null}
        </div>
        <OnboardingReadinessSummary result={readiness} title="Shop Owner readiness" sectionOrder={["account", "shop", "payout", "kiosk"]} />
      </div>
    </section>
  );
}
