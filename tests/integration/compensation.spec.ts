import { getBarberCompSummary } from "@/lib/utils/booking";
import { demoBarbers } from "@/lib/data/demo";
import type { Barber } from "@/types/domain";

describe("compensation summaries", () => {
  it("formats a Full Booth Rent barber summary", () => {
    const barber = demoBarbers.find((entry) => entry.id === "barber-blaze");
    const summary = getBarberCompSummary(barber!);

    expect(summary.mode).toBe("Full Booth Rent");
    expect(summary.headline).toContain("weekly");
  });

  it("formats an AutoBooth Rent summary as rent paydown, never a split", () => {
    const autoBoothBarber: Barber = {
      ...demoBarbers.find((entry) => entry.id === "barber-blaze")!,
      compensationModel: "autobooth_rent",
      autoBoothPercent: 0.35
    };
    const summary = getBarberCompSummary(autoBoothBarber);

    expect(summary.mode).toBe("AutoBooth Rent");
    expect(summary.headline).toContain("35% auto-applied");
    expect(summary.detail).toMatch(/rent you still owe/i);
    expect(summary.headline).not.toMatch(/split/i);
  });

  it("reports no shop rent agreement for a freelance barber", () => {
    const barber = demoBarbers.find((entry) => entry.id === "barber-wave");
    const summary = getBarberCompSummary(barber!);

    expect(summary.mode).toBe("Freelance");
    expect(summary.headline).toMatch(/no shop rent agreement/i);
  });
});
