import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  useShopManagerQueryMock,
  useQueueEntryActionMutationMock
} = vi.hoisted(() => ({
  useShopManagerQueryMock: vi.fn(),
  useQueueEntryActionMutationMock: vi.fn()
}));

vi.mock("@/lib/operations/shop-manager-client", () => ({
  useShopManagerQuery: useShopManagerQueryMock
}));

vi.mock("@/lib/operations/queue-client", () => ({
  useQueueEntryActionMutation: useQueueEntryActionMutationMock
}));

import { ShopManagerPanel } from "@/components/operations/shop-manager-panel";

describe("shop manager panel", () => {
  beforeEach(() => {
    useShopManagerQueryMock.mockReset();
    useQueueEntryActionMutationMock.mockReset();
  });

  it("renders assist-mode suggestions and lets staff assign the next walk-in", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({});
    useQueueEntryActionMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync
    });
    useShopManagerQueryMock.mockReturnValue({
      isLoading: false,
      error: null,
      data: {
        mode: "assist",
        autoModeAvailable: false,
        autoModeReason: "Auto mode stays locked.",
        generatedAt: "2026-03-27T15:00:00.000Z",
        summary: {
          queueEntries: 2,
          openChairs: 1,
          recoveryOpportunities: 1
        },
        suggestions: [
          {
            id: "walk-in-1",
            type: "walk_in_assignment",
            priority: "high",
            title: "Route Jordan Ellis to Blaze King",
            detail: "Blaze is the fastest chair.",
            audience: "front_desk",
            safeAutomation: true,
            action: {
              kind: "assign_queue",
              label: "Assign next walk-in",
              entryId: "queue-1",
              barberId: "barber-blaze"
            }
          }
        ]
      }
    });

    render(<ShopManagerPanel />);

    expect(screen.getByText("AI shop manager")).toBeInTheDocument();
    expect(screen.getByText("Route Jordan Ellis to Blaze King")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Assign next walk-in" }));
    });

    expect(mutateAsync).toHaveBeenCalledWith({
      entryId: "queue-1",
      action: "assign",
      barberId: "barber-blaze"
    });
  });
});
