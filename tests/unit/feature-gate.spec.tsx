import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FeatureGate, RegisteredFeatureGate } from "@/components/ui/feature-gate";
import { applyFeatureFlagRows, FEATURE_GATE_REASONS, GATES } from "@/lib/feature-gates";

describe("FeatureGate", () => {
  it.each([
    ["building", "Still being built", "#C4F24E"],
    ["plan", "Part of Pro", "#D9B461"],
    ["debug", "Being looked at — back soon", "#FF9B9B"],
    ["staged", "Opening soon", "rgba(245, 241, 232, 0.58)"]
  ] as const)("renders the exact %s reason contract", (reason, copy, color) => {
    const { container } = render(
      <FeatureGate reason={reason} scale="card" label="Future room">
        <button type="button">Unsafe child action</button>
      </FeatureGate>
    );

    expect(screen.getByText(copy)).toBeInTheDocument();
    expect(container.querySelector("[data-feature-gate]")).toHaveStyle({ "--feature-gate-color": color });
    expect(screen.getByText("Unsafe child action").parentElement).toHaveAttribute("inert");
    expect(screen.getByText("Unsafe child action").parentElement).toHaveAttribute("aria-hidden", "true");
  });

  it("shows an honest reason on click and links plan gates to pricing", () => {
    render(
      <FeatureGate reason="plan" scale="row" label="Forecasting" note="Forecasting belongs to Pro.">
        <button type="button">Run forecast</button>
      </FeatureGate>
    );

    fireEvent.click(screen.getByRole("button", { name: /Forecasting: Part of Pro/i }));
    expect(screen.getByRole("tooltip")).toHaveTextContent("Forecasting belongs to Pro.");
    expect(screen.getByRole("link", { name: "See Pro" })).toHaveAttribute("href", "/pricing");
  });

  it("removes the wrapper completely when the server flag opens the door", () => {
    const { container } = render(
      <FeatureGate reason="building" scale="button" label="Group booking" enabled>
        <button type="button">Book a group</button>
      </FeatureGate>
    );

    expect(container.querySelector("[data-feature-gate]")).toBeNull();
    expect(screen.getByRole("button", { name: "Book a group" })).toBeEnabled();
  });

  it("resolves reason and note through the one registry", () => {
    render(
      <RegisteredFeatureGate gateKey="queue.smart_overbook" scale="row" label="Smart overbook">
        <button type="button">Rebalance</button>
      </RegisteredFeatureGate>
    );

    fireEvent.click(screen.getByRole("button", { name: /Smart overbook: Being looked at/i }));
    expect(screen.getByRole("tooltip")).toHaveTextContent("capacity safeguards");
  });
});

describe("feature gate registry", () => {
  it("keeps every canonical placement in one developer truth map", () => {
    expect(Object.keys(GATES)).toHaveLength(27);
    expect(new Set(Object.values(GATES).map((gate) => gate.reason))).toEqual(
      new Set(Object.keys(FEATURE_GATE_REASONS))
    );
  });

  it("accepts database overrides without inventing unregistered gates", () => {
    const resolved = applyFeatureFlagRows([
      {
        key: "owner.analytics.forecasting",
        reason: "staged",
        enabled: true,
        plan_required: "pro"
      },
      {
        key: "unknown.gate",
        reason: "debug",
        enabled: true,
        plan_required: null
      }
    ]);

    expect(resolved["owner.analytics.forecasting"]).toMatchObject({
      reason: "staged",
      enabled: true,
      planRequired: "pro"
    });
    expect(Object.keys(resolved)).toHaveLength(27);
  });
});
