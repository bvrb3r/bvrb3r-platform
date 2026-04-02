import { calculateBookingQuote, hasScheduleConflict, resolveBookableAddOn, resolveBookableBarber, resolveBookableService, resolveBookableSlot } from "@/lib/utils/booking";
import { demoServices } from "@/lib/data/demo";

describe("booking logic", () => {
  it("calculates deposit and duration including add-ons", () => {
    const service = demoServices.find((entry) => entry.id === "srv-signature");
    const addOn = demoServices.find((entry) => entry.id === "srv-beard");

    expect(service).toBeDefined();
    expect(addOn).toBeDefined();

    const result = calculateBookingQuote(service!, [addOn!]);

    expect(result.subtotal).toBe(73);
    expect(result.depositDue).toBe(15);
    expect(result.totalDuration).toBe(95);
  });

  it("detects overlapping appointments", () => {
    const hasConflict = hasScheduleConflict({
      barberId: "barber-wave",
      serviceId: "srv-signature",
      addOnIds: [],
      start: "2026-03-08T10:30:00-05:00"
    });

    expect(hasConflict).toBe(true);
  });

  it("falls back to the current barber's first valid service when a stale service id is selected", () => {
    const primaryServices = demoServices.filter((entry) => entry.id === "srv-signature" || entry.id === "srv-premium");

    const result = resolveBookableService(primaryServices, "srv-razor");

    expect(result?.id).toBe("srv-signature");
  });

  it("falls back to the first available barber when a stale barber id is selected", () => {
    const result = resolveBookableBarber(
      [
        { barberId: "barber-wave", barberName: "Wave" },
        { barberId: "barber-blaze", barberName: "Blaze" }
      ],
      "barber-missing"
    );

    expect(result?.barberId).toBe("barber-wave");
  });

  it("clears an invalid stale add-on selection", () => {
    const availableAddOns = demoServices.filter((entry) => entry.id === "srv-beard" || entry.id === "srv-enhancement");

    const result = resolveBookableAddOn(availableAddOns, "srv-blackmask");

    expect(result).toBeNull();
  });

  it("falls back to the first live slot when the previously selected time is no longer valid", () => {
    const result = resolveBookableSlot(
      [
        { startsAt: "2026-03-08T14:00:00-05:00" },
        { startsAt: "2026-03-08T15:30:00-05:00" }
      ],
      "2026-03-08T10:00:00-05:00"
    );

    expect(result?.startsAt).toBe("2026-03-08T14:00:00-05:00");
  });
});
