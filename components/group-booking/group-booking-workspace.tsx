"use client";

import type { Route } from "next";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Check, Clock3, Plus, ShieldCheck, Trash2, Users } from "lucide-react";
import { cn } from "@/lib/utils";

type MemberDraft = {
  memberKey: string;
  fullName: string;
  email: string;
  phone: string;
  isMinor: boolean;
  barberId: string;
  serviceId: string;
  locationId: string;
  startsAt: string;
};

type GroupResult = {
  groupId: string;
  memberCount: number;
  totalServiceCents: number;
  currency: string;
  startsAt: string;
  endsAt: string;
  appointments: Array<{ memberId: string; appointmentId: string; startsAt: string; status: string }>;
  paymentResponsibilities: Array<{ memberId: string; payerKind: "organizer" | "member"; amountCents: number }>;
  paymentDelivery: {
    state: "not_required" | "gated" | "delivered" | "partial";
    requiredCount: number;
    deliveredCount: number;
    chargedAtBooking: false;
    blockers: Array<{ code: string; message: string }>;
    message: string;
  };
};

type GroupCatalog = {
  splitPaymentDelivery: {
    available: boolean;
    blockers: Array<{ code: string; message: string }>;
  };
  barbers: Array<{ id: string; reference: string; label: string }>;
  services: Array<{ id: string; name: string; durationMin: number; priceCents: number; currency: string; locationId: string | null; barberReference: string | null }>;
  locations: Array<{ id: string; label: string }>;
};

const emptyMember = (index: number, defaults?: Partial<MemberDraft>): MemberDraft => ({
  memberKey: `member-${index}-${crypto.randomUUID()}`,
  fullName: "",
  email: "",
  phone: "",
  isMinor: false,
  barberId: defaults?.barberId ?? "",
  serviceId: defaults?.serviceId ?? "",
  locationId: defaults?.locationId ?? "",
  startsAt: defaults?.startsAt ?? ""
});

function money(cents: number, currency = "usd") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);
}

async function readJson<T>(response: Response) {
  const data = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? "That request could not be completed.");
  return data;
}

const fieldClass = "min-h-12 w-full rounded-[14px] border border-white/12 bg-black/30 px-4 text-sm text-white outline-none placeholder:text-white/28 focus:border-[#C4F24E]/55";

export function GroupBookingWorkspace({
  defaults = {},
  initialView = "build",
  kioskShopId = "",
  kioskOnly = false
}: {
  defaults?: Partial<Pick<MemberDraft, "barberId" | "serviceId" | "locationId" | "startsAt">>;
  initialView?: "build" | "kiosk";
  kioskShopId?: string;
  kioskOnly?: boolean;
}) {
  const [view, setView] = useState<"build" | "kiosk">(kioskOnly ? "kiosk" : initialView);
  const [organizer, setOrganizer] = useState({ fullName: "", email: "", phone: "" });
  const [members, setMembers] = useState<MemberDraft[]>(() => [emptyMember(1, defaults), emptyMember(2, defaults)]);
  const [paymentMode, setPaymentMode] = useState<"organizer" | "split">("organizer");
  const [splitPaymentSmsConsent, setSplitPaymentSmsConsent] = useState(false);
  const [catalog, setCatalog] = useState<GroupCatalog | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GroupResult | null>(null);
  const [kiosk, setKiosk] = useState({ shopId: kioskShopId, fullName: "", phone: "", email: "", groupSize: 2, seatingMode: "together" as "together" | "fastest", consent: false });
  const [kioskResult, setKioskResult] = useState<{ status: string; message: string; requestId: string } | null>(null);

  const minorCount = useMemo(() => members.filter((member) => member.isMinor).length, [members]);
  const splitPaymentAvailable = catalog?.splitPaymentDelivery.available === true;

  useEffect(() => {
    if (kioskOnly) return;
    let active = true;
    void fetch("/api/group-bookings", { cache: "no-store" })
      .then((response) => readJson<{ catalog: GroupCatalog }>(response))
      .then((body) => {
        if (active) setCatalog(body.catalog);
      })
      .catch((catalogLoadError) => {
        if (active) setCatalogError(catalogLoadError instanceof Error ? catalogLoadError.message : "Catalog unavailable.");
      });
    return () => { active = false; };
  }, [kioskOnly]);

  function updateMember(index: number, patch: Partial<MemberDraft>) {
    setMembers((current) => current.map((member, memberIndex) => memberIndex === index ? { ...member, ...patch } : member));
  }

  async function submitGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const payload = {
        organizer,
        paymentMode,
        splitPaymentSmsConsent,
        idempotencyKey: `group:${crypto.randomUUID()}`,
        members: members.map((member) => ({
          ...member,
          email: member.isMinor ? organizer.email : member.email,
          phone: member.isMinor ? organizer.phone : member.phone,
          startsAt: new Date(member.startsAt).toISOString()
        }))
      };
      const response = await fetch("/api/group-bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const body = await readJson<{ group: GroupResult }>(response);
      setResult(body.group);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "The group could not be booked.");
    } finally {
      setBusy(false);
    }
  }

  async function submitKiosk(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setKioskResult(null);
    try {
      const response = await fetch(`/api/group-bookings/kiosk/${encodeURIComponent(kiosk.shopId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: kiosk.fullName,
          phone: kiosk.phone,
          email: kiosk.email || undefined,
          groupSize: kiosk.groupSize,
          seatingMode: kiosk.seatingMode,
          operationalSmsConsent: kiosk.consent,
          idempotencyKey: `kiosk-group:${crypto.randomUUID()}`
        })
      });
      const body = await readJson<{ groupRequest: { status: string; message: string; requestId: string } }>(response);
      setKioskResult(body.groupRequest);
      setKiosk((current) => ({
        ...current,
        fullName: "",
        phone: "",
        email: "",
        consent: false
      }));
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "The kiosk could not record this group.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#060708] px-4 py-5 text-[#F5F1E8] sm:px-8">
      <header className="mx-auto flex max-w-5xl flex-wrap items-center gap-4">
        <span className="font-extrabold tracking-[0.28em]">BVRB<span className="text-[#C4F24E]">3</span>R</span>
        <span className="rounded-full border border-[#C9A87C]/30 px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.2em] text-[#C9A87C]">Group booking · everybody in one run</span>
        {kioskOnly && kioskShopId ? (
          <Link href={`/kiosk/shop/${encodeURIComponent(kioskShopId)}` as Route} className="ml-auto inline-flex min-h-10 items-center rounded-full border border-white/14 px-4 font-mono text-[9px] uppercase tracking-[0.14em] text-white/62">← Back to kiosk</Link>
        ) : (
          <div className="ml-auto inline-flex rounded-full border border-white/14 p-1">
            {(["build", "kiosk"] as const).map((tab) => (
              <button key={tab} type="button" onClick={() => { setView(tab); setError(null); }} className={cn("min-h-9 rounded-full px-4 font-mono text-[9px] uppercase tracking-[0.14em]", view === tab ? "bg-[#C4F24E] text-black" : "text-white/48")}>{tab === "build" ? "Build the group" : "Kiosk walk-in"}</button>
            ))}
          </div>
        )}
      </header>

      {view === "build" ? (
        <form onSubmit={(event) => void submitGroup(event)} className="mx-auto mt-8 flex max-w-5xl flex-col gap-5">
          <div>
            <h1 className="font-serif text-4xl font-normal sm:text-5xl">Who&apos;s coming?</h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-white/55">Each person gets a real service, barber, chair hold, confirmation, and queue status. Catalog prices are verified on the server when the chairs are held.</p>
          </div>

          <section className="grid gap-3 rounded-[22px] border border-white/10 bg-white/[0.025] p-4 sm:grid-cols-3">
            <label className="text-xs text-white/55">Organizer name<input required className={`${fieldClass} mt-2`} value={organizer.fullName} onChange={(event) => { setOrganizer((current) => ({ ...current, fullName: event.target.value })); updateMember(0, { fullName: event.target.value }); }} /></label>
            <label className="text-xs text-white/55">Organizer email<input required type="email" className={`${fieldClass} mt-2`} value={organizer.email} onChange={(event) => { setOrganizer((current) => ({ ...current, email: event.target.value })); updateMember(0, { email: event.target.value }); }} /></label>
            <label className="text-xs text-white/55">One group phone<input required className={`${fieldClass} mt-2`} value={organizer.phone} onChange={(event) => { setOrganizer((current) => ({ ...current, phone: event.target.value })); updateMember(0, { phone: event.target.value }); }} /></label>
          </section>

          <section className="space-y-3">
            {members.map((member, index) => (
              <article key={member.memberKey} className={cn("rounded-[20px] border p-4", index === 0 ? "border-[#C4F24E]/30 bg-[#C4F24E]/[0.025]" : "border-white/10 bg-white/[0.02]")}>
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full border border-white/14 bg-white/5 font-mono text-xs">{index + 1}</span>
                  <div className="min-w-0 flex-1"><p className="font-bold">Person {index + 1}{index === 0 ? " · organizer" : ""}</p><p className="mt-1 font-mono text-[9px] text-white/35">Each row becomes one appointment.</p></div>
                  {members.length > 2 ? <button type="button" aria-label={`Remove person ${index + 1}`} onClick={() => setMembers((current) => current.filter((_, memberIndex) => memberIndex !== index))} className="flex h-10 w-10 items-center justify-center rounded-full border border-white/12 text-white/45"><Trash2 className="h-4 w-4" /></button> : null}
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <label className="text-xs text-white/52">Name<input required disabled={index === 0} className={`${fieldClass} mt-2 disabled:opacity-45`} value={member.fullName} onChange={(event) => updateMember(index, { fullName: event.target.value })} /></label>
                  <label className="text-xs text-white/52">Email<input required={!member.isMinor && index !== 0} disabled={member.isMinor || index === 0} type="email" placeholder={member.isMinor || index === 0 ? "Uses organizer email" : ""} className={`${fieldClass} mt-2 disabled:opacity-45`} value={member.email} onChange={(event) => updateMember(index, { email: event.target.value })} /></label>
                  <label className="text-xs text-white/52">Phone<input required={!member.isMinor && index !== 0} disabled={member.isMinor || index === 0} placeholder={member.isMinor || index === 0 ? "Uses organizer phone" : ""} className={`${fieldClass} mt-2 disabled:opacity-45`} value={member.phone} onChange={(event) => updateMember(index, { phone: event.target.value })} /></label>
                  <label className={cn("flex items-center gap-3 self-end rounded-[14px] border border-white/10 px-4 py-3 text-xs text-white/58", index === 0 && "opacity-35")}><input type="checkbox" disabled={index === 0} checked={member.isMinor} onChange={(event) => updateMember(index, { isMinor: event.target.checked })} />{index === 0 ? "Organizer" : "Minor · organizer pays"}</label>
                  <label className="text-xs text-white/52">Barber<select required className={`${fieldClass} mt-2 bg-[#0b0c0d]`} value={member.barberId} onChange={(event) => updateMember(index, { barberId: event.target.value })}><option value="">Select a barber</option>{catalog?.barbers.map((barber) => <option key={barber.id} value={barber.id}>{barber.label}</option>)}</select></label>
                  <label className="text-xs text-white/52">Service<select required className={`${fieldClass} mt-2 bg-[#0b0c0d]`} value={member.serviceId} onChange={(event) => { const service = catalog?.services.find((item) => item.id === event.target.value); updateMember(index, { serviceId: event.target.value, ...(service?.locationId ? { locationId: service.locationId } : {}) }); }}><option value="">Select a service</option>{catalog?.services.filter((service) => { const barberReference = catalog.barbers.find((barber) => barber.id === member.barberId)?.reference; return !service.barberReference || service.barberReference === barberReference; }).map((service) => <option key={service.id} value={service.id}>{service.name} · {service.durationMin} min · {money(service.priceCents, service.currency)}</option>)}</select></label>
                  <label className="text-xs text-white/52">Shop location<select required className={`${fieldClass} mt-2 bg-[#0b0c0d]`} value={member.locationId} onChange={(event) => updateMember(index, { locationId: event.target.value })}><option value="">Select a shop</option>{catalog?.locations.map((location) => <option key={location.id} value={location.id}>{location.label}</option>)}</select></label>
                  <label className="text-xs text-white/52">Start time<input required type="datetime-local" className={`${fieldClass} mt-2`} value={member.startsAt} onChange={(event) => updateMember(index, { startsAt: event.target.value })} /></label>
                </div>
              </article>
            ))}
            <button type="button" disabled={members.length >= 6} onClick={() => setMembers((current) => [...current, emptyMember(current.length + 1, defaults)])} className="flex min-h-13 w-full items-center justify-center gap-2 rounded-[18px] border border-dashed border-[#C4F24E]/40 bg-[#C4F24E]/[0.025] font-mono text-[10px] uppercase tracking-[0.14em] text-[#C4F24E] disabled:opacity-35"><Plus className="h-4 w-4" /> Add a person · {members.length} of 6</button>
          </section>

          {catalogError ? <p className="rounded-[14px] border border-amber-300/25 bg-amber-300/5 p-3 text-xs leading-5 text-amber-100">{catalogError} Group booking remains closed until real barber, service, and shop choices can be verified.</p> : null}

          <section className="rounded-[22px] border border-white/10 bg-white/[0.025] p-5">
            <div className="flex flex-wrap items-center gap-3"><p className="font-mono text-[9px] uppercase tracking-[0.22em] text-[#C9A87C]">Who pays?</p><div className="ml-auto inline-flex rounded-full border border-white/14 p-1"><button type="button" onClick={() => { setPaymentMode("organizer"); setSplitPaymentSmsConsent(false); }} className={cn("min-h-9 rounded-full px-4 text-xs font-bold", paymentMode === "organizer" ? "bg-[#C4F24E] text-black" : "text-white/48")}>I&apos;ve got it all</button><button type="button" disabled={!splitPaymentAvailable} onClick={() => setPaymentMode("split")} className={cn("min-h-9 rounded-full px-4 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-35", paymentMode === "split" ? "bg-[#C4F24E] text-black" : "text-white/48")}>Everyone pays their own</button></div></div>
            <div className="mt-4 flex flex-wrap items-center gap-4"><p className="min-w-[15rem] flex-1 text-sm leading-6 text-white/58">{paymentMode === "organizer" ? "One payer covers every service at checkout. Each barber’s eligible service amount follows normal fee and payout routing." : `Each adult owns their service payment. ${minorCount ? `${minorCount} minor${minorCount === 1 ? "" : "s"} ride on the organizer.` : "Minors, if added, ride on the organizer."}`}</p><button disabled={busy || Boolean(result)} className="min-h-13 rounded-full bg-[#C4F24E] px-7 text-sm font-extrabold text-black disabled:opacity-45">{busy ? "Holding every chair…" : result ? "Group locked ✓" : `Lock all ${members.length} chairs`}</button></div>
            {paymentMode === "split" ? <label className="mt-4 flex items-start gap-3 rounded-[14px] border border-[#C4F24E]/20 bg-[#C4F24E]/[0.035] p-4 text-xs leading-5 text-white/62"><input required type="checkbox" checked={splitPaymentSmsConsent} onChange={(event) => setSplitPaymentSmsConsent(event.target.checked)} /><span>Text each payer a secure Stripe link for their assigned service. This consent is transactional and applies only to this group payment; no charge happens when the chairs are locked.</span></label> : null}
            {catalog && !splitPaymentAvailable ? <p role="status" className="mt-4 rounded-[14px] border border-amber-300/25 bg-amber-300/5 p-3 text-xs leading-5 text-amber-100">Split payment is honestly unavailable: {catalog.splitPaymentDelivery.blockers[0]?.message ?? "provider readiness has not passed"} The organizer can still choose one payer at checkout.</p> : null}
            <p className="mt-4 border-t border-white/7 pt-3 font-mono text-[9px] leading-5 text-white/34">No card is charged by this button. Prices, duration, and availability come from the live service catalog. One cancellation changes only that person&apos;s appointment.</p>
          </section>

          {error ? <p role="alert" className="rounded-[16px] border border-red-400/25 bg-red-500/10 p-4 text-sm text-red-100">{error}</p> : null}
          {result ? <section className="rounded-[18px] border border-[#C4F24E]/35 bg-[#C4F24E]/[0.055] p-5"><div className="flex items-start gap-3"><Check className="mt-0.5 h-5 w-5 text-[#C4F24E]" /><div><h2 className="font-serif text-2xl">Group locked — {result.memberCount} chairs.</h2><p className="mt-2 text-sm leading-6 text-white/65">{new Date(result.startsAt).toLocaleString()} · {money(result.totalServiceCents, result.currency)} server-verified service total. Every person has their own appointment confirmation.</p><p className={cn("mt-3 rounded-[12px] border p-3 text-xs leading-5", result.paymentDelivery.state === "delivered" || result.paymentDelivery.state === "not_required" ? "border-[#C4F24E]/25 bg-black/20 text-[#E4F9B8]" : "border-amber-300/25 bg-amber-300/5 text-amber-100")}>{result.paymentDelivery.message}{result.paymentDelivery.blockers[0] ? ` ${result.paymentDelivery.blockers[0].message}` : ""}</p><p className="mt-2 font-mono text-[9px] text-white/38">Group {result.groupId} · {result.appointments.length} appointments confirmed · charged at booking: no</p></div></div></section> : null}
        </form>
      ) : (
        <form onSubmit={(event) => void submitKiosk(event)} className="mx-auto mt-10 flex max-w-3xl flex-col gap-5">
          <div className="text-center"><p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#C4F24E]">Walk-in · group</p><h1 className="mt-3 font-serif text-4xl font-normal">How many in your group?</h1></div>
          <div className="grid grid-cols-5 gap-2">{[2, 3, 4, 5, 6].map((size) => <button key={size} type="button" onClick={() => setKiosk((current) => ({ ...current, groupSize: size }))} className={cn("rounded-[18px] border py-5 font-serif text-3xl", kiosk.groupSize === size ? "border-[#C4F24E]/55 bg-[#C4F24E]/5 text-[#C4F24E]" : "border-white/12 bg-white/[0.02]")}>{size}</button>)}</div>
          <div className="grid gap-3 rounded-[20px] border border-white/10 bg-white/[0.025] p-4 sm:grid-cols-2">{kioskShopId ? <div className="rounded-[14px] border border-white/10 bg-black/20 px-4 py-3 text-xs text-white/52"><span className="block font-mono text-[8px] uppercase tracking-[0.16em] text-[#C9A87C]">Paired shop kiosk</span><span className="mt-1 block truncate text-white/70">{kioskShopId}</span></div> : <label className="text-xs text-white/52">Shop kiosk ID<input required className={`${fieldClass} mt-2`} value={kiosk.shopId} onChange={(event) => setKiosk((current) => ({ ...current, shopId: event.target.value }))} /></label>}<label className="text-xs text-white/52">Group name<input required className={`${fieldClass} mt-2`} value={kiosk.fullName} onChange={(event) => setKiosk((current) => ({ ...current, fullName: event.target.value }))} /></label><label className="text-xs text-white/52">One group phone<input required className={`${fieldClass} mt-2`} value={kiosk.phone} onChange={(event) => setKiosk((current) => ({ ...current, phone: event.target.value }))} /></label><label className="text-xs text-white/52">Email · optional<input type="email" className={`${fieldClass} mt-2`} value={kiosk.email} onChange={(event) => setKiosk((current) => ({ ...current, email: event.target.value }))} /></label></div>
          <section className="rounded-[20px] border border-white/10 bg-white/[0.025] p-5"><p className="font-mono text-[9px] uppercase tracking-[0.22em] text-[#C9A87C]">The line, honestly</p><div className="mt-4 grid gap-3 sm:grid-cols-2"><button type="button" onClick={() => setKiosk((current) => ({ ...current, seatingMode: "together" }))} className={cn("min-h-16 rounded-full border px-5 text-sm font-extrabold", kiosk.seatingMode === "together" ? "border-[#C4F24E] bg-[#C4F24E] text-black" : "border-white/15 text-white/65")}>Hold {kiosk.groupSize} places together</button><button type="button" onClick={() => setKiosk((current) => ({ ...current, seatingMode: "fastest" }))} className={cn("min-h-16 rounded-full border px-5 text-sm font-bold", kiosk.seatingMode === "fastest" ? "border-[#C4F24E] bg-[#C4F24E] text-black" : "border-white/15 text-white/65")}>Split us up · fastest chairs first</button></div><p className="mt-4 flex items-start gap-2 text-sm leading-6 text-white/52"><Clock3 className="mt-1 h-4 w-4 shrink-0 text-[#C9A87C]" />No wait time or queue position is invented. The live floor must confirm enough chair capacity first.</p><label className="mt-4 flex items-start gap-3 text-xs leading-5 text-white/52"><input type="checkbox" checked={kiosk.consent} onChange={(event) => setKiosk((current) => ({ ...current, consent: event.target.checked }))} />Send operational queue texts to this one phone for the group.</label></section>
          <button disabled={busy} className="min-h-14 rounded-full bg-[#C4F24E] px-6 text-sm font-extrabold text-black disabled:opacity-45">{busy ? "Checking the live floor…" : "Record group request"}</button>
          {error ? <p role="alert" className="rounded-[16px] border border-red-400/25 bg-red-500/10 p-4 text-sm text-red-100">{error}</p> : null}
          {kioskResult ? <div className="rounded-[18px] border border-[#C4F24E]/30 bg-[#C4F24E]/5 p-5"><p className="flex items-center gap-2 font-bold text-[#E4F9B8]"><ShieldCheck className="h-5 w-5" />Request recorded</p><p className="mt-2 text-sm leading-6 text-white/62">{kioskResult.message}</p><p className="mt-2 font-mono text-[9px] text-white/35">Reference {kioskResult.requestId}</p></div> : null}
          <p className="flex items-center justify-center gap-2 font-mono text-[9px] leading-5 text-white/32"><Users className="h-4 w-4" />Each person chooses their service at the chair. One phone receives the group&apos;s operational queue texts.</p>
        </form>
      )}
    </main>
  );
}
