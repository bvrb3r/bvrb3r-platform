import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InteractiveDemoWorkspace } from "@/components/demo/interactive-demo-workspace";
import { INTERACTIVE_DEMOS, parseDemoRole } from "@/lib/demo/pr36-interactive-demo";

describe("Product PR36 interactive demo", () => {
  it("keeps both variants to four explicitly sample-only steps", () => {
    expect(INTERACTIVE_DEMOS.barber.steps).toHaveLength(4);
    expect(INTERACTIVE_DEMOS.owner.steps).toHaveLength(4);
    expect(JSON.stringify(INTERACTIVE_DEMOS)).toContain("sample");
    expect(JSON.stringify(INTERACTIVE_DEMOS)).toContain("Fixed rent only");
  });

  it("normalizes the public role selector", () => {
    expect(parseDemoRole("owner")).toBe("owner");
    expect(parseDemoRole("barber")).toBe("barber");
    expect(parseDemoRole("unexpected")).toBe("barber");
  });

  it("switches roles and advances without collecting information", () => {
    render(<InteractiveDemoWorkspace initialRole="barber" />);
    expect(screen.getByText("DEMO DATA")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByText(/card number/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "For shop owners" }));
    expect(screen.getByRole("heading", { name: "Run a demo day on the floor" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next step →" }));
    expect(screen.getByText("The kiosk keeps chairs visible")).toBeInTheDocument();
  });
});
