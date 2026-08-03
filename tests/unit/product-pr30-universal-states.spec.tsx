import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  GLOBAL_SAFETY_STATE_KEYS,
  GlobalSafetyState
} from "@/components/ui/global-safety-state";

const pr30States = [
  "no_search_results",
  "empty_schedule",
  "empty_culture",
  "offline",
  "server_error",
  "payment_declined",
  "queue_closed",
  "kiosk_disconnected"
] as const;

describe("Product PR30 universal empty and error states", () => {
  it("covers every required first-day and bad-day state", () => {
    expect(GLOBAL_SAFETY_STATE_KEYS).toEqual(expect.arrayContaining([...pr30States]));
  });

  it.each(pr30States)("renders %s with one cause, one truth, and one action", (state) => {
    const onAction = vi.fn();
    const { container } = render(
      <GlobalSafetyState state={state} onAction={onAction} />
    );

    expect(container.querySelector(".h-14.w-14")).toBeInTheDocument();
    expect(container.querySelector("h2")?.className).toContain("font-serif");
    expect(screen.getAllByRole("button")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button"));
    expect(onAction).toHaveBeenCalledOnce();
    expect(container.querySelectorAll("p").length).toBeGreaterThanOrEqual(2);
  });

  it("names payment truth before recovery", () => {
    render(<GlobalSafetyState state="payment_declined" onAction={() => undefined} />);

    expect(screen.getByText("Card declined.")).toBeInTheDocument();
    expect(screen.getByText(/No money moved/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Try again/ })).toBeInTheDocument();
  });
});
