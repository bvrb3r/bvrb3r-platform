import { getBarberCompSummary } from "@/lib/utils/booking";
import { demoBarbers } from "@/lib/data/demo";

describe("compensation summaries", () => {
  it("formats commission barber summary", () => {
    const barber = demoBarbers.find((entry) => entry.id === "barber-wave");
    const summary = getBarberCompSummary(barber!);

    expect(summary.mode).toBe("Commission");
    expect(summary.headline).toContain("48%");
  });

  it("formats booth rent barber summary", () => {
    const barber = demoBarbers.find((entry) => entry.id === "barber-blaze");
    const summary = getBarberCompSummary(barber!);

    expect(summary.mode).toBe("Booth Rent");
    expect(summary.headline).toContain("weekly");
  });
});