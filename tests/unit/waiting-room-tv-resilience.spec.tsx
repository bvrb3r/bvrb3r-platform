import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WaitingRoomTv } from "@/components/tv/waiting-room-tv";
import type { WaitingRoomTvSnapshot } from "@/lib/tv/waiting-room";

const initialSnapshot: WaitingRoomTvSnapshot = {
  shopId: "shop-resilience",
  shopName: "Resilience Shop",
  generatedAt: "2026-08-03T12:00:00.000Z",
  team: [{
    barberId: "barber-before",
    name: "Before Barber",
    floorState: "open",
    booked: 1,
    completed: 0,
    liveAppointments: 0,
    nextAppointmentStart: null
  }],
  menu: [],
  status: "live"
};

const recoveredSnapshot: WaitingRoomTvSnapshot = {
  ...initialSnapshot,
  generatedAt: "2026-08-03T12:01:00.000Z",
  team: [{
    ...initialSnapshot.team[0],
    barberId: "barber-after",
    name: "Recovered Barber"
  }]
};

function snapshotResponse(snapshot: WaitingRoomTvSnapshot) {
  return {
    ok: true,
    status: 200,
    json: async () => snapshot
  } as Response;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("waiting-room TV connection resilience", () => {
  it("fails closed on a browser outage and recovers from the visible retry", async () => {
    const fetchMock = vi.fn().mockResolvedValue(snapshotResponse(recoveredSnapshot));
    vi.stubGlobal("fetch", fetchMock);
    render(<WaitingRoomTv initialSnapshot={initialSnapshot} />);

    expect(screen.getByText("Before Barber")).toBeInTheDocument();

    act(() => window.dispatchEvent(new Event("offline")));
    expect(screen.getByText("Display offline")).toBeInTheDocument();
    expect(screen.queryByText("Before Barber")).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Retry connection" }));
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/shop/tv?shopId=shop-resilience",
      { cache: "no-store" }
    );
    expect(screen.getByText("Recovered Barber")).toBeInTheDocument();
    expect(screen.queryByText("Display offline")).not.toBeInTheDocument();
  });

  it("switches to the short retry interval after a failed refresh and restores fresh state automatically", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error("network unavailable"))
      .mockResolvedValueOnce(snapshotResponse(recoveredSnapshot));
    vi.stubGlobal("fetch", fetchMock);
    render(<WaitingRoomTv initialSnapshot={initialSnapshot} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Display offline")).toBeInTheDocument();
    expect(screen.getByText(/refreshes every 5 seconds/i)).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Recovered Barber")).toBeInTheDocument();
    expect(screen.queryByText("Display offline")).not.toBeInTheDocument();
  });
});
