import { demoAppointments, demoBarbers, demoClients, demoServices } from "@/lib/data/demo";
import { isAvailabilityBlockingAppointmentStatus } from "@/lib/appointments/domain";
import { Appointment, Barber, Service } from "@/types/domain";

export interface BookingDraft {
  barberId: string;
  serviceId: string;
  addOnIds: string[];
  start: string;
}

export function getService(serviceId: string) {
  return demoServices.find((service) => service.id === serviceId);
}

export function getBarber(barberId: string) {
  return demoBarbers.find((barber) => barber.id === barberId);
}

export function calculateBookingQuote(service: Service, addOns: Service[]) {
  const addOnTotal = addOns.reduce((sum, item) => sum + item.price, 0);
  const depositTotal = service.deposit + addOns.reduce((sum, item) => sum + item.deposit, 0);
  const totalDuration = service.durationMin + service.bufferMin + addOns.reduce((sum, item) => sum + item.durationMin + item.bufferMin, 0);
  return {
    subtotal: service.price + addOnTotal,
    depositDue: service.fullPrepay ? service.price + addOnTotal : depositTotal,
    totalDuration
  };
}

export function resolveBookableService(services: Service[], selectedServiceId?: string | null) {
  if (!services.length) {
    return null;
  }

  return services.find((service) => service.id === selectedServiceId) ?? services[0];
}

export function resolveBookableBarber<T extends { barberId: string }>(barbers: T[], selectedBarberId?: string | null) {
  if (!barbers.length) {
    return null;
  }

  return barbers.find((barber) => barber.barberId === selectedBarberId) ?? barbers[0];
}

export function resolveBookableAddOn(addOns: Service[], selectedAddOnId?: string | null) {
  if (!selectedAddOnId) {
    return null;
  }

  return addOns.find((service) => service.id === selectedAddOnId) ?? null;
}

export function resolveBookableSlot<T extends { startsAt: string }>(slots: T[], selectedAppointmentTime?: string | null) {
  if (!slots.length) {
    return null;
  }

  return slots.find((slot) => slot.startsAt === selectedAppointmentTime) ?? slots[0];
}

export function hasScheduleConflict(draft: BookingDraft, existingAppointments: Appointment[] = demoAppointments) {
  const service = getService(draft.serviceId);
  if (!service) {
    return true;
  }

  const addOns = draft.addOnIds.map(getService).filter(Boolean) as Service[];
  const { totalDuration } = calculateBookingQuote(service, addOns);
  const start = new Date(draft.start).getTime();
  const end = start + totalDuration * 60 * 1000;

  return existingAppointments.some((appointment) => {
    if (appointment.barberId !== draft.barberId) {
      return false;
    }
    if (!isAvailabilityBlockingAppointmentStatus(appointment.status)) {
      return false;
    }

    const appointmentStart = new Date(appointment.start).getTime();
    const appointmentEnd = new Date(appointment.end).getTime();
    return start < appointmentEnd && end > appointmentStart;
  });
}

export function getSuggestedTimeSlots(barberId: string, serviceId: string, existingAppointments: Appointment[] = demoAppointments) {
  const service = getService(serviceId);
  if (!service) {
    return [];
  }

  const candidateStarts = [
    "2026-03-08T14:00:00-05:00",
    "2026-03-08T15:30:00-05:00",
    "2026-03-08T17:00:00-05:00"
  ];

  return candidateStarts.filter((start) => !hasScheduleConflict({ barberId, serviceId, addOnIds: [], start }, existingAppointments));
}

export function getClientBookingSummary(clientId: string) {
  const client = demoClients.find((entry) => entry.id === clientId);
  const upcoming = demoAppointments.filter((appointment) => appointment.clientId === clientId && appointment.status !== "completed");
  return {
    client,
    upcomingCount: upcoming.length,
    lastStatus: upcoming[0]?.status ?? "completed"
  };
}

export function getBarberCompSummary(barber: Barber) {
  if (barber.compensationModel === "autobooth_rent") {
    return {
      mode: "AutoBooth Rent",
      headline: `${barber.boothRentFrequency} rent ${barber.boothRentAmount}, ${Math.round((barber.autoBoothPercent ?? 0) * 100)}% auto-applied`,
      detail: "Applied only against rent you still owe"
    };
  }

  if (barber.compensationModel === "booth_rent") {
    return {
      mode: "Full Booth Rent",
      headline: `${barber.boothRentFrequency} rent ${barber.boothRentAmount}`,
      detail: "Track due dates and overdue exposure"
    };
  }

  return {
    mode: "Freelance",
    headline: "No shop rent agreement",
    detail: `Upcoming payout ${barber.upcomingPayout}`
  };
}
