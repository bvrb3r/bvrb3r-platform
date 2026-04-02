import { demoAppointments, demoBarbers } from "@/lib/data/demo";
import { getBarberFlowMetrics, getOwnerFlowMetrics } from "@/lib/utils/operations";

describe("first working version flow metrics", () => {
  it("derives owner revenue activity from completed paid appointments", () => {
    const metrics = getOwnerFlowMetrics(demoAppointments);

    expect(metrics.revenueToday).toBe(70);
    expect(metrics.completedServicesToday).toBe(1);
    expect(metrics.bookedToday).toBe(3);
  });

  it("derives booth-rent performance from paid service activity", () => {
    const blaze = demoBarbers.find((entry) => entry.id === "barber-blaze");
    const metrics = getBarberFlowMetrics(blaze!, demoAppointments);

    expect(metrics.serviceRevenueToday).toBe(70);
    expect(metrics.completedPaidCount).toBe(1);
    expect(metrics.rentCoverageToday).toBe(-255);
  });
});