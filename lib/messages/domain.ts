import type { Role } from "@/types/domain";

export type MessagingThreadType = "client_barber" | "client_shop" | "barber_shop" | "support" | "shop_team";
export type MessagingMessageType = "text" | "system";

export type MessagingThreadRecord = {
  id: string;
  threadType: MessagingThreadType;
  appointmentId?: string | null;
  locationId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MessagingParticipantRecord = {
  id: string;
  threadId: string;
  profileId: string;
  threadRole: Role;
  createdAt: string;
};

export type MessagingMessageRecord = {
  id: string;
  threadId: string;
  senderProfileId: string | null;
  body: string;
  messageType: MessagingMessageType;
  createdAt: string;
};

export type MessagingSnapshot = {
  threads: MessagingThreadRecord[];
  participants: MessagingParticipantRecord[];
  messages: MessagingMessageRecord[];
};

export type MessagingAppointmentContext = {
  appointmentId: string;
  clientProfileId: string;
  barberProfileId: string;
  clientName: string;
  barberName: string;
  barberRole?: Extract<Role, "commission_barber" | "booth_rent_barber">;
  serviceName: string;
  startsAt: string;
};

export class MessagingDomainError extends Error {}

export function normalizeMessageBody(body: string) {
  const normalized = body.replace(/\s+/g, " ").trim();
  if (!normalized) {
    throw new MessagingDomainError("Messages cannot be empty.");
  }

  if (normalized.length > 1000) {
    throw new MessagingDomainError("Messages must be 1000 characters or fewer.");
  }

  return normalized;
}

export function isShopRole(role: Role) {
  return role === "owner" || role === "manager" || role === "front_desk";
}

export function isBarberRole(role: Role) {
  return role === "commission_barber" || role === "booth_rent_barber";
}

export function assertActorCanCreateClientBarberThread(input: {
  actorProfileId: string;
  actorRole: Role;
  appointment: MessagingAppointmentContext;
}) {
  const { actorProfileId, actorRole, appointment } = input;
  const isClientActor = actorRole === "client" && actorProfileId === appointment.clientProfileId;
  const isBarberActor = isBarberRole(actorRole) && actorProfileId === appointment.barberProfileId;

  if (!isClientActor && !isBarberActor) {
    throw new MessagingDomainError("Only the client or assigned barber can open this conversation.");
  }
}

export function assertActorCanCreateShopThread(input: {
  actorRole: Role;
  threadType: Extract<MessagingThreadType, "client_shop" | "barber_shop">;
  counterpartRole: Role;
}) {
  if (input.threadType === "client_shop") {
    const validActor = input.actorRole === "client" || isShopRole(input.actorRole);
    const validCounterpart = input.counterpartRole === "client" || isShopRole(input.counterpartRole);
    if (!validActor || !validCounterpart) {
      throw new MessagingDomainError("Client-to-shop threads must stay between a client and a shop-facing role.");
    }
    if ((input.actorRole === "client") === (input.counterpartRole === "client")) {
      throw new MessagingDomainError("Client-to-shop threads must connect one client side and one shop side.");
    }
    return;
  }

  const validActor = isBarberRole(input.actorRole) || isShopRole(input.actorRole);
  const validCounterpart = isBarberRole(input.counterpartRole) || isShopRole(input.counterpartRole);
  if (!validActor || !validCounterpart) {
    throw new MessagingDomainError("Barber-to-shop threads must stay between a barber and a shop-facing role.");
  }
  if (isBarberRole(input.actorRole) === isBarberRole(input.counterpartRole)) {
    throw new MessagingDomainError("Barber-to-shop threads must connect one barber side and one shop side.");
  }
}

export function isThreadParticipant(participants: MessagingParticipantRecord[], threadId: string, profileId: string) {
  return participants.some((participant) => participant.threadId === threadId && participant.profileId === profileId);
}

export function buildAppointmentThreadSystemMessage(appointment: MessagingAppointmentContext) {
  const formattedStartsAt = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(appointment.startsAt));

  return `Conversation opened for ${appointment.serviceName} on ${formattedStartsAt}.`;
}

export function buildShopThreadSystemMessage(input: {
  threadType: Extract<MessagingThreadType, "client_shop" | "barber_shop">;
  counterpartName: string;
  locationLabel: string;
}) {
  const relationshipLabel = input.threadType === "client_shop" ? "client" : "barber";
  return `Conversation opened between the shop and ${input.counterpartName} (${relationshipLabel}) for ${input.locationLabel}.`;
}

export function buildSupportThreadSystemMessage(counterpartName: string) {
  return `Support conversation opened with ${counterpartName}.`;
}

export function listThreadsForParticipant(snapshot: MessagingSnapshot, profileId: string) {
  const visibleThreadIds = new Set(
    snapshot.participants
      .filter((participant) => participant.profileId === profileId)
      .map((participant) => participant.threadId)
  );

  return snapshot.threads
    .filter((thread) => visibleThreadIds.has(thread.id))
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
}

export function readMessagesForParticipant(snapshot: MessagingSnapshot, threadId: string, profileId: string) {
  if (!isThreadParticipant(snapshot.participants, threadId, profileId)) {
    throw new MessagingDomainError("Only thread participants can read these messages.");
  }

  return snapshot.messages
    .filter((message) => message.threadId === threadId)
    .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());
}

export function sendMessageInSnapshot(input: {
  snapshot: MessagingSnapshot;
  threadId: string;
  senderProfileId: string;
  body: string;
  createdAt?: string;
}) {
  const createdAt = input.createdAt ?? new Date().toISOString();
  if (!isThreadParticipant(input.snapshot.participants, input.threadId, input.senderProfileId)) {
    throw new MessagingDomainError("Only thread participants can send messages.");
  }

  const normalizedBody = normalizeMessageBody(input.body);
  const message: MessagingMessageRecord = {
    id: `msg-${input.snapshot.messages.length + 1}`,
    threadId: input.threadId,
    senderProfileId: input.senderProfileId,
    body: normalizedBody,
    messageType: "text",
    createdAt
  };

  return {
    snapshot: {
      ...input.snapshot,
      threads: input.snapshot.threads.map((thread) => thread.id === input.threadId ? { ...thread, updatedAt: createdAt } : thread),
      messages: [...input.snapshot.messages, message]
    },
    message
  };
}

export function createClientBarberThreadInSnapshot(input: {
  snapshot: MessagingSnapshot;
  actorProfileId: string;
  actorRole: Role;
  appointment: MessagingAppointmentContext;
  createdAt?: string;
}) {
  assertActorCanCreateClientBarberThread({
    actorProfileId: input.actorProfileId,
    actorRole: input.actorRole,
    appointment: input.appointment
  });

  const existingThread = input.snapshot.threads.find(
    (thread) => thread.threadType === "client_barber" && thread.appointmentId === input.appointment.appointmentId
  );

  if (existingThread) {
    return {
      snapshot: input.snapshot,
      thread: existingThread
    };
  }

  const createdAt = input.createdAt ?? new Date().toISOString();
  const threadId = `thread-${input.snapshot.threads.length + 1}`;
  const thread: MessagingThreadRecord = {
    id: threadId,
    threadType: "client_barber",
    appointmentId: input.appointment.appointmentId,
    createdAt,
    updatedAt: createdAt
  };
  const participants: MessagingParticipantRecord[] = [
    {
      id: `participant-${input.snapshot.participants.length + 1}`,
      threadId,
      profileId: input.appointment.clientProfileId,
      threadRole: "client",
      createdAt
    },
    {
      id: `participant-${input.snapshot.participants.length + 2}`,
      threadId,
      profileId: input.appointment.barberProfileId,
      threadRole: input.appointment.barberRole ?? "commission_barber",
      createdAt
    }
  ];
  const systemMessage: MessagingMessageRecord = {
    id: `msg-${input.snapshot.messages.length + 1}`,
    threadId,
    senderProfileId: null,
    body: buildAppointmentThreadSystemMessage(input.appointment),
    messageType: "system",
    createdAt
  };

  return {
    snapshot: {
      threads: [...input.snapshot.threads, thread],
      participants: [...input.snapshot.participants, ...participants],
      messages: [...input.snapshot.messages, systemMessage]
    },
    thread
  };
}

export function createShopConversationInSnapshot(input: {
  snapshot: MessagingSnapshot;
  actorProfileId: string;
  actorRole: Role;
  threadType: Extract<MessagingThreadType, "client_shop" | "barber_shop">;
  locationId: string;
  locationLabel: string;
  counterpartProfileId: string;
  counterpartRole: Role;
  counterpartName: string;
  createdAt?: string;
}) {
  assertActorCanCreateShopThread({
    actorRole: input.actorRole,
    threadType: input.threadType,
    counterpartRole: input.counterpartRole
  });

  const existingThread = input.snapshot.threads.find((thread) => {
    if (thread.threadType !== input.threadType || thread.locationId !== input.locationId) {
      return false;
    }

    const participants = input.snapshot.participants.filter((participant) => participant.threadId === thread.id);
    return participants.some((participant) => participant.profileId === input.actorProfileId)
      && participants.some((participant) => participant.profileId === input.counterpartProfileId);
  });

  if (existingThread) {
    return {
      snapshot: input.snapshot,
      thread: existingThread
    };
  }

  const createdAt = input.createdAt ?? new Date().toISOString();
  const threadId = `thread-${input.snapshot.threads.length + 1}`;
  const thread: MessagingThreadRecord = {
    id: threadId,
    threadType: input.threadType,
    locationId: input.locationId,
    createdAt,
    updatedAt: createdAt
  };
  const participants: MessagingParticipantRecord[] = [
    {
      id: `participant-${input.snapshot.participants.length + 1}`,
      threadId,
      profileId: input.actorProfileId,
      threadRole: input.actorRole,
      createdAt
    },
    {
      id: `participant-${input.snapshot.participants.length + 2}`,
      threadId,
      profileId: input.counterpartProfileId,
      threadRole: input.counterpartRole,
      createdAt
    }
  ];
  const systemMessage: MessagingMessageRecord = {
    id: `msg-${input.snapshot.messages.length + 1}`,
    threadId,
    senderProfileId: null,
    body: buildShopThreadSystemMessage({
      threadType: input.threadType,
      counterpartName: input.counterpartName,
      locationLabel: input.locationLabel
    }),
    messageType: "system",
    createdAt
  };

  return {
    snapshot: {
      threads: [...input.snapshot.threads, thread],
      participants: [...input.snapshot.participants, ...participants],
      messages: [...input.snapshot.messages, systemMessage]
    },
    thread
  };
}
