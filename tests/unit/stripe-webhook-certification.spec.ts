import { describe, expect, it } from "vitest";
import { isLiveStripeCertificationProbe } from "@/lib/fintech/webhook-certification";

function event(input: { livemode?: boolean; type?: string; object?: string; probe?: string; scope?: string }) {
  return {
    id: "evt_v1_probe",
    livemode: input.livemode ?? true,
    type: input.type ?? "customer.updated",
    data: {
      object: {
        id: "cus_v1_probe",
        object: input.object ?? "customer",
        metadata: {
          bvrb3r_certification_probe: input.probe ?? "v1-live-webhook",
          bvrb3r_certification_scope: input.scope ?? "processor-verification-only"
        }
      }
    }
  } as never;
}

describe("live Stripe webhook certification probe", () => {
  it("accepts only the exact live, metadata-only customer update marker", () => {
    expect(isLiveStripeCertificationProbe(event({}))).toBe(true);
  });

  it("rejects test mode, other event types, and incomplete markers", () => {
    expect(isLiveStripeCertificationProbe(event({ livemode: false }))).toBe(false);
    expect(isLiveStripeCertificationProbe(event({ type: "payment_intent.succeeded" }))).toBe(false);
    expect(isLiveStripeCertificationProbe(event({ object: "subscription" }))).toBe(false);
    expect(isLiveStripeCertificationProbe(event({ probe: "wrong" }))).toBe(false);
    expect(isLiveStripeCertificationProbe(event({ scope: "wrong" }))).toBe(false);
  });
});
