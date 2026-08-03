"use client";

import { useState } from "react";
import { SearchBox } from "@mapbox/search-js-react";
import type { SearchBoxRetrieveResponse } from "@mapbox/search-js-core";
import { LocateFixed, MapPinned, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FeedbackBanner } from "@/components/ui/feedback-banner";

type SavedShopLocation = {
  address: string;
  city: string;
  region: string;
  postalCode: string;
  latitude: number;
  longitude: number;
  verified: boolean;
};

export function ShopAddressMapboxField({
  shopId,
  currentAddress,
  onSaved
}: {
  shopId: string;
  currentAddress?: string | null;
  onSaved?: (location: SavedShopLocation) => void;
}) {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN?.trim() ?? "";
  const [value, setValue] = useState(currentAddress ?? "");
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);
  const [selectedMapboxId, setSelectedMapboxId] = useState<string | null>(null);
  const [hasSavedPin, setHasSavedPin] = useState(Boolean(currentAddress?.trim()));
  const [saving, setSaving] = useState(false);
  const [checkingPin, setCheckingPin] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);

  if (!token) {
    return (
      <div className="rounded-[24px] border border-dashed border-white/12 bg-black/25 p-5">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#C9A24D]">Verified map pin · setup required</p>
        <p className="mt-2 text-sm leading-7 text-white/58">
          Configure the URL-restricted public Mapbox token before searching for and confirming the shop address.
        </p>
      </div>
    );
  }

  function handleRetrieve(response: SearchBoxRetrieveResponse) {
    const feature = response.features[0];
    const address = feature?.properties.full_address?.trim()
      || feature?.properties.name?.trim()
      || "";
    const mapboxId = String(feature?.properties.mapbox_id ?? "").trim();
    setSelectedAddress(address && mapboxId ? address : null);
    setSelectedMapboxId(address && mapboxId ? mapboxId : null);
    if (address && mapboxId) {
      setValue(address);
      setFeedback(null);
    } else {
      setFeedback({ tone: "error", message: "Choose a complete Mapbox address result before saving." });
    }
  }

  async function saveAddress() {
    if (!selectedAddress || !selectedMapboxId) {
      setFeedback({ tone: "error", message: "Choose an address from the verified Mapbox results before saving." });
      return;
    }
    setSaving(true);
    setFeedback(null);
    try {
      const response = await fetch(`/api/marketplace/locations/${encodeURIComponent(shopId)}/geocode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: selectedAddress,
          mapboxId: selectedMapboxId,
          visibility: "exact"
        })
      });
      const body = await response.json().catch(() => ({})) as { error?: string; location?: SavedShopLocation };
      if (!response.ok || !body.location) {
        throw new Error(body.error ?? "The verified shop pin could not be saved.");
      }
      onSaved?.(body.location);
      setHasSavedPin(true);
      setFeedback({ tone: "success", message: "Verified shop address and PostGIS map pin saved." });
    } catch (error) {
      setFeedback({ tone: "error", message: error instanceof Error ? error.message : "The shop pin could not be saved." });
    } finally {
      setSaving(false);
    }
  }

  async function checkSavedPin() {
    setCheckingPin(true);
    setFeedback(null);
    try {
      const response = await fetch(`/api/marketplace/locations/${encodeURIComponent(shopId)}/reverse-geocode`, {
        method: "POST"
      });
      const body = await response.json().catch(() => ({})) as {
        error?: string;
        address?: { formattedAddress: string };
      };
      if (!response.ok || !body.address) {
        throw new Error(body.error ?? "The saved shop pin could not be checked.");
      }
      setFeedback({
        tone: "success",
        message: `Saved pin resolves to ${body.address.formattedAddress}. This reverse check was not stored.`
      });
    } catch (error) {
      setFeedback({ tone: "error", message: error instanceof Error ? error.message : "The saved shop pin could not be checked." });
    } finally {
      setCheckingPin(false);
    }
  }

  return (
    <div className="rounded-[24px] border border-white/10 bg-black/25 p-5" data-testid="shop-address-mapbox-field">
      <div className="flex items-start gap-3">
        <span className="rounded-full border border-[#C4F24E]/25 bg-[#C4F24E]/8 p-2 text-[#C4F24E]">
          <MapPinned className="h-4 w-4" />
        </span>
        <div>
          <p className="text-base font-extrabold text-white">Verified shop address & map pin</p>
          <p className="mt-1 text-sm leading-6 text-white/56">
            Suggestions stay temporary. Saving performs a permanent server-side geocode, then Supabase stores the confirmed point.
          </p>
        </div>
      </div>
      <div className="mt-4 overflow-visible rounded-2xl bg-white p-2 text-black">
        <SearchBox
          accessToken={token}
          value={value}
          placeholder="Search the commercial shop address"
          options={{ country: "US", language: "en", types: "address" }}
          onChange={(nextValue) => {
            setValue(nextValue);
            setSelectedAddress(null);
            setSelectedMapboxId(null);
          }}
          onRetrieve={handleRetrieve}
          onSuggestError={() => setFeedback({ tone: "error", message: "Address suggestions are temporarily unavailable." })}
          theme={{
            variables: {
              colorPrimary: "#101113",
              colorText: "#101113",
              borderRadius: "14px"
            }
          }}
        />
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button type="button" className="min-h-11" onClick={saveAddress} disabled={saving || !selectedAddress || !selectedMapboxId}>
          <ShieldCheck className="h-4 w-4" />
          {saving ? "Verifying..." : "Confirm & save pin"}
        </Button>
        <Button type="button" variant="secondary" className="min-h-11" onClick={checkSavedPin} disabled={checkingPin || !hasSavedPin}>
          <LocateFixed className="h-4 w-4" />
          {checkingPin ? "Checking..." : "Check saved pin"}
        </Button>
        <p className="text-xs leading-6 text-white/45">Private homes and client locations never use this exact public-shop path.</p>
      </div>
      {feedback ? <div className="mt-4"><FeedbackBanner tone={feedback.tone} message={feedback.message} /></div> : null}
    </div>
  );
}
