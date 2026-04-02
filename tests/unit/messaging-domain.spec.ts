import { describe, expect, it } from "vitest";
import {
  createShopConversationInSnapshot,
  createClientBarberThreadInSnapshot,
  MessagingDomainError,
  readMessagesForParticipant,
  listThreadsForParticipant,
  sendMessageInSnapshot,
  type MessagingSnapshot
} from "@/lib/messages/domain";

function createEmptySnapshot(): MessagingSnapshot {
  return {
    threads: [],
    participants: [],
    messages: []
  };
}

describe("phase 8 messaging domain", () => {
  it("creates a valid appointment-linked client barber thread with a system message", () => {
    const result = createClientBarberThreadInSnapshot({
      snapshot: createEmptySnapshot(),
      actorProfileId: "profile-client",
      actorRole: "client",
      appointment: {
        appointmentId: "appt-1",
        clientProfileId: "profile-client",
        barberProfileId: "profile-barber",
        barberRole: "booth_rent_barber",
        clientName: "Jordan Ellis",
        barberName: "Blaze King",
        serviceName: "Signature Precision Cut",
        startsAt: "2026-03-21T14:00:00.000Z"
      },
      createdAt: "2026-03-20T12:00:00.000Z"
    });

    expect(result.thread.threadType).toBe("client_barber");
    expect(result.thread.appointmentId).toBe("appt-1");
    expect(result.snapshot.participants).toHaveLength(2);
    expect(result.snapshot.messages).toHaveLength(1);
    expect(result.snapshot.messages[0]?.messageType).toBe("system");
  });

  it("rejects invalid thread creation outside the appointment relationship", () => {
    expect(() =>
      createClientBarberThreadInSnapshot({
        snapshot: createEmptySnapshot(),
        actorProfileId: "profile-owner",
        actorRole: "owner",
        appointment: {
          appointmentId: "appt-1",
          clientProfileId: "profile-client",
          barberProfileId: "profile-barber",
          clientName: "Jordan Ellis",
          barberName: "Blaze King",
          serviceName: "Signature Precision Cut",
          startsAt: "2026-03-21T14:00:00.000Z"
        }
      })
    ).toThrow(MessagingDomainError);
  });

  it("returns the existing appointment-linked thread instead of creating duplicates", () => {
    const first = createClientBarberThreadInSnapshot({
      snapshot: createEmptySnapshot(),
      actorProfileId: "profile-client",
      actorRole: "client",
      appointment: {
        appointmentId: "appt-1",
        clientProfileId: "profile-client",
        barberProfileId: "profile-barber",
        clientName: "Jordan Ellis",
        barberName: "Blaze King",
        serviceName: "Signature Precision Cut",
        startsAt: "2026-03-21T14:00:00.000Z"
      }
    });
    const second = createClientBarberThreadInSnapshot({
      snapshot: first.snapshot,
      actorProfileId: "profile-barber",
      actorRole: "commission_barber",
      appointment: {
        appointmentId: "appt-1",
        clientProfileId: "profile-client",
        barberProfileId: "profile-barber",
        clientName: "Jordan Ellis",
        barberName: "Blaze King",
        serviceName: "Signature Precision Cut",
        startsAt: "2026-03-21T14:00:00.000Z"
      }
    });

    expect(second.snapshot.threads).toHaveLength(1);
    expect(second.thread.id).toBe(first.thread.id);
  });

  it("lets a participant read thread messages in chronological order", () => {
    const created = createClientBarberThreadInSnapshot({
      snapshot: createEmptySnapshot(),
      actorProfileId: "profile-client",
      actorRole: "client",
      appointment: {
        appointmentId: "appt-2",
        clientProfileId: "profile-client",
        barberProfileId: "profile-barber",
        clientName: "Jordan Ellis",
        barberName: "Blaze King",
        serviceName: "Signature Precision Cut",
        startsAt: "2026-03-21T14:00:00.000Z"
      },
      createdAt: "2026-03-20T12:00:00.000Z"
    });
    const firstMessage = sendMessageInSnapshot({
      snapshot: created.snapshot,
      threadId: created.thread.id,
      senderProfileId: "profile-client",
      body: "Can I arrive five minutes early?",
      createdAt: "2026-03-20T12:05:00.000Z"
    });
    const secondMessage = sendMessageInSnapshot({
      snapshot: firstMessage.snapshot,
      threadId: created.thread.id,
      senderProfileId: "profile-barber",
      body: "Yes, that works.",
      createdAt: "2026-03-20T12:07:00.000Z"
    });

    const messages = readMessagesForParticipant(secondMessage.snapshot, created.thread.id, "profile-client");

    expect(messages).toHaveLength(3);
    expect(messages[0]?.body).toContain("Conversation opened for Signature Precision Cut");
    expect(messages[1]?.body).toBe("Can I arrive five minutes early?");
    expect(messages[2]?.body).toBe("Yes, that works.");
  });

  it("blocks non-participants from reading a thread", () => {
    const created = createClientBarberThreadInSnapshot({
      snapshot: createEmptySnapshot(),
      actorProfileId: "profile-client",
      actorRole: "client",
      appointment: {
        appointmentId: "appt-3",
        clientProfileId: "profile-client",
        barberProfileId: "profile-barber",
        clientName: "Jordan Ellis",
        barberName: "Blaze King",
        serviceName: "Signature Precision Cut",
        startsAt: "2026-03-21T14:00:00.000Z"
      }
    });

    expect(() => readMessagesForParticipant(created.snapshot, created.thread.id, "profile-outsider")).toThrow(MessagingDomainError);
  });

  it("lets a participant send a message and blocks outsiders", () => {
    const created = createClientBarberThreadInSnapshot({
      snapshot: createEmptySnapshot(),
      actorProfileId: "profile-client",
      actorRole: "client",
      appointment: {
        appointmentId: "appt-4",
        clientProfileId: "profile-client",
        barberProfileId: "profile-barber",
        clientName: "Jordan Ellis",
        barberName: "Blaze King",
        serviceName: "Signature Precision Cut",
        startsAt: "2026-03-21T14:00:00.000Z"
      }
    });

    expect(() =>
      sendMessageInSnapshot({
        snapshot: created.snapshot,
        threadId: created.thread.id,
        senderProfileId: "profile-outsider",
        body: "I should not be here"
      })
    ).toThrow(MessagingDomainError);

    const sent = sendMessageInSnapshot({
      snapshot: created.snapshot,
      threadId: created.thread.id,
      senderProfileId: "profile-client",
      body: "Looking forward to it."
    });

    expect(sent.message.body).toBe("Looking forward to it.");
  });

  it("rejects empty message bodies", () => {
    const created = createClientBarberThreadInSnapshot({
      snapshot: createEmptySnapshot(),
      actorProfileId: "profile-client",
      actorRole: "client",
      appointment: {
        appointmentId: "appt-5",
        clientProfileId: "profile-client",
        barberProfileId: "profile-barber",
        clientName: "Jordan Ellis",
        barberName: "Blaze King",
        serviceName: "Signature Precision Cut",
        startsAt: "2026-03-21T14:00:00.000Z"
      }
    });

    expect(() =>
      sendMessageInSnapshot({
        snapshot: created.snapshot,
        threadId: created.thread.id,
        senderProfileId: "profile-client",
        body: "   "
      })
    ).toThrow(MessagingDomainError);
  });

  it("lists only threads owned by the current participant", () => {
    const first = createClientBarberThreadInSnapshot({
      snapshot: createEmptySnapshot(),
      actorProfileId: "profile-client",
      actorRole: "client",
      appointment: {
        appointmentId: "appt-6",
        clientProfileId: "profile-client",
        barberProfileId: "profile-barber",
        clientName: "Jordan Ellis",
        barberName: "Blaze King",
        serviceName: "Signature Precision Cut",
        startsAt: "2026-03-21T14:00:00.000Z"
      },
      createdAt: "2026-03-20T12:00:00.000Z"
    });
    const second = createClientBarberThreadInSnapshot({
      snapshot: first.snapshot,
      actorProfileId: "profile-client-2",
      actorRole: "client",
      appointment: {
        appointmentId: "appt-7",
        clientProfileId: "profile-client-2",
        barberProfileId: "profile-barber-2",
        clientName: "Harper Moss",
        barberName: "Wave Carter",
        serviceName: "Razor Fade",
        startsAt: "2026-03-21T16:00:00.000Z"
      },
      createdAt: "2026-03-20T13:00:00.000Z"
    });

    const visible = listThreadsForParticipant(second.snapshot, "profile-client");

    expect(visible).toHaveLength(1);
    expect(visible[0]?.appointmentId).toBe("appt-6");
  });

  it("creates a client-to-shop conversation without duplicating the thread model", () => {
    const result = createShopConversationInSnapshot({
      snapshot: createEmptySnapshot(),
      actorProfileId: "profile-client",
      actorRole: "client",
      threadType: "client_shop",
      locationId: "loc-ybor",
      locationLabel: "Centro Ybor Flagship | Ybor City",
      counterpartProfileId: "profile-frontdesk",
      counterpartRole: "front_desk",
      counterpartName: "Kayla Brooks",
      createdAt: "2026-03-26T12:00:00.000Z"
    });

    expect(result.thread.threadType).toBe("client_shop");
    expect(result.thread.locationId).toBe("loc-ybor");
    expect(result.snapshot.participants).toHaveLength(2);
    expect(result.snapshot.messages[0]?.body).toContain("shop");
  });

  it("creates a barber-to-shop conversation and rejects same-side participants", () => {
    const created = createShopConversationInSnapshot({
      snapshot: createEmptySnapshot(),
      actorProfileId: "profile-barber",
      actorRole: "booth_rent_barber",
      threadType: "barber_shop",
      locationId: "loc-ybor",
      locationLabel: "Centro Ybor Flagship | Ybor City",
      counterpartProfileId: "profile-manager",
      counterpartRole: "manager",
      counterpartName: "Mia Torres"
    });

    expect(created.thread.threadType).toBe("barber_shop");

    expect(() =>
      createShopConversationInSnapshot({
        snapshot: createEmptySnapshot(),
        actorProfileId: "profile-manager",
        actorRole: "manager",
        threadType: "barber_shop",
        locationId: "loc-ybor",
        locationLabel: "Centro Ybor Flagship | Ybor City",
        counterpartProfileId: "profile-owner",
        counterpartRole: "owner",
        counterpartName: "Brandon Rivers"
      })
    ).toThrow(MessagingDomainError);
  });
});
