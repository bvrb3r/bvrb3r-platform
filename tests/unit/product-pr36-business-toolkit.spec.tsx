import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BusinessToolkitWorkspace } from "@/components/toolkit/business-toolkit-workspace";
import { autoBoothEstimate, calculateBusinessToolkit, DEFAULT_BUSINESS_TOOLKIT_STATE } from "@/lib/toolkit/business-toolkit";

describe("Product PR36 business toolkit", () => {
  it("uses the exact capped AutoBooth formula and never includes tips", () => {
    expect(autoBoothEstimate(100, 20, 12)).toBe(12);
    expect(autoBoothEstimate(100, 20, 50)).toBe(20);
    expect(autoBoothEstimate(100, 20, 0)).toBe(0);
    expect(calculateBusinessToolkit(DEFAULT_BUSINESS_TOOLKIT_STATE).autoBoothContribution).toBe(6.75);
  });

  it("renders all six marketing-accessible calculators as estimates", () => {
    render(<BusinessToolkitWorkspace />);
    expect(screen.getByText("Estimate · real numbers live in the app")).toBeInTheDocument();
    ["Income", "Pricing", "Booth rent", "AutoBooth", "Utilization", "No-shows"].forEach((label) => {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    });
  });

  it("states the doctrine formula and tip exclusion on the AutoBooth calculator", () => {
    render(<BusinessToolkitWorkspace />);
    fireEvent.click(screen.getByRole("button", { name: "AutoBooth" }));
    expect(screen.getByText(/contribution = min\(transaction × rate, remaining_balance\)/i)).toBeInTheDocument();
    expect(screen.getByText("untouched — 100% barber-owned")).toBeInTheDocument();
    expect(screen.getByText(/contributions stop by structure/i)).toBeInTheDocument();
  });
});
