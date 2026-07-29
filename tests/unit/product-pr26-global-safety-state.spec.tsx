import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  GLOBAL_SAFETY_STATE_KEYS,
  GlobalSafetyState
} from "@/components/ui/global-safety-state";

describe("Product PR26 global safety states", () => {
  it("ships all 13 shared states", () => {
    expect(GLOBAL_SAFETY_STATE_KEYS).toHaveLength(13);
  });

  it("gives every degraded state an incident reference and safety line", () => {
    render(<GlobalSafetyState state="payment_degraded" />);
    expect(screen.getByText("The processor is slow.")).toBeInTheDocument();
    expect(screen.getByText(/payment remains pending/i)).toBeInTheDocument();
    expect(screen.getByText(/Incident BVR-PAYMENT-DEGRADED/i)).toBeInTheDocument();
  });

  it("renders an explicit human-review reference", () => {
    render(
      <GlobalSafetyState
        state="support"
        incidentReference="BVR-SUPPORT-2048"
      />
    );
    expect(screen.getByText("Incident BVR-SUPPORT-2048")).toBeInTheDocument();
  });
});
