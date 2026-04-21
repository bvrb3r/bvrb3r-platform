import { describe, expect, it } from "vitest";
import { demoAppointments, demoBarbers, demoClients } from "@/lib/data/demo";
import { buildCompensationSnapshot, buildOwnerAnalyticsSnapshot, buildWorkflowPersistenceEnvelope } from "@/lib/operations/persistence";

const appointment = demoAppointments.find((entry) => entry.id === "appt-4")!;
const barber = demoBarbers.find((entry) => entry.id === appointment.barberId)!;
const client = demoClients.find((entry) => entry.id === appointment.clientId)!;

const checkout = {
  id: "checkout-hardening",
  appointmentId: appointment.id,
  locationId: appointment.locationId,
  barberId: appointment.barberId,
  clientId: appointment.clientId,
  amountCollected: 0,
  tipAmount: appointment.tipAmount,
  paymentMethod: "tap_to_pay" as const,
  provider: "mock" as const,
  collectedAt: "2026-03-08T09:45:00-05:00"
};

const latestActivity = {
  id: "activity-hardening",
  appointmentId: appointment.id,
  type: "checkout" as const,
  actorRole: "front_desk",
  title: "Checkout captured payment and tip",
  detail: "appt-4 collected checkout",
  createdAt: "2026-03-08T09:45:00-05:00"
};

describe("Milestone 8 persistence builders", () => {
  it("builds a commission compensation snapshot", () => {
    const commissionBarber = demoBarbers.find((entry) => entry.id === "barber-wave")!;
    const commissionAppointment = demoAppointments.find((entry) => entry.id === "appt-7")!;
    const commissionSnapshot = buildCompensationSnapshot({
      appointment: commissionAppointment,
      appointments: demoAppointments,
      barber: commissionBarber,
      client: demoClients.find((entry) => entry.id === commissionAppointment.clientId),
      latestActivity,
      checkout
    });

    expect(commissionSnapshot?.compensationModel).toBe("commission");
    expect(commissionSnapshot?.commissionAmount).toBeGreaterThan(0);
    expect(commissionSnapshot?.boothRentAmount).toBeNull();
  });

  it("builds a booth-rent snapshot and owner analytics snapshot", () => {
    const compensationSnapshot = buildCompensationSnapshot({
      appointment,
      appointments: demoAppointments,
      barber,
      client,
      latestActivity,
      checkout
    });

    const analyticsSnapshot = buildOwnerAnalyticsSnapshot("loc-ybor", demoAppointments);
    const envelope = buildWorkflowPersistenceEnvelope({
      appointment,
      appointments: demoAppointments,
      barber,
      client,
      latestActivity,
      checkout
    });

    expect(compensationSnapshot?.compensationModel).toBe("booth_rent");
    expect(compensationSnapshot?.boothRentAmount).toBe(barber.boothRentAmount);
    expect(compensationSnapshot?.boothRentPeriodLabel).toBe(barber.boothRentFrequency);
    expect(analyticsSnapshot.locationReference).toBe("loc-ybor");
    expect(analyticsSnapshot.revenueTotal).toBe(70);
    expect(envelope.workflowEvent.eventType).toBe("checkout");
    expect(envelope.ownerAnalyticsSnapshot.locationReference).toBe("loc-ybor");
  });
});
