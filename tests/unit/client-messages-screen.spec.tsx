import { render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  useRouterMock,
  useMessageThreadsQueryMock,
  useMessageThreadQueryMock,
  useCreateMessageThreadMutationMock,
  useSendMessageMutationMock,
  useSendMessageBroadcastMutationMock
} = vi.hoisted(() => ({
  useRouterMock: vi.fn(),
  useMessageThreadsQueryMock: vi.fn(),
  useMessageThreadQueryMock: vi.fn(),
  useCreateMessageThreadMutationMock: vi.fn(),
  useSendMessageMutationMock: vi.fn(),
  useSendMessageBroadcastMutationMock: vi.fn()
}));

vi.mock("next/navigation", () => ({
  useRouter: useRouterMock
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    onClick,
    href,
    ...props
  }: ComponentProps<"a"> & {
    children?: ReactNode;
    onClick?: (event: ReactMouseEvent<HTMLAnchorElement>) => void;
  }) => (
    <a
      {...props}
      href={typeof href === "string" ? href : "#"}
      onClick={(event) => {
        onClick?.(event);
        event.preventDefault();
      }}
    >
      {children}
    </a>
  )
}));

vi.mock("@/lib/messages/client", () => ({
  useMessageThreadsQuery: useMessageThreadsQueryMock,
  useMessageThreadQuery: useMessageThreadQueryMock,
  useCreateMessageThreadMutation: useCreateMessageThreadMutationMock,
  useSendMessageMutation: useSendMessageMutationMock,
  useSendMessageBroadcastMutation: useSendMessageBroadcastMutationMock
}));

import { MessagingInboxScreen } from "@/components/messages/messaging-inbox-screen";

function buildThread(overrides: Record<string, unknown> = {}) {
  return {
    id: "thread-appointment-1",
    threadType: "client_barber",
    appointmentId: "appointment-1",
    locationId: "location-1",
    locationContext: null,
    createdAt: "2026-05-19T13:25:00.000Z",
    updatedAt: "2026-05-19T13:30:00.000Z",
    counterpart: {
      profileId: "profile-barber",
      fullName: "Phillip mcgee",
      role: "barber_user"
    },
    appointmentContext: {
      appointmentId: "appointment-1",
      confirmationCode: "1T7CIYH15O",
      status: "cancelled",
      statusLabel: "Cancelled",
      startsAt: "2026-05-19T13:30:00.000Z",
      serviceName: "test cut",
      locationLabel: "Phils chair"
    },
    lastMessage: {
      id: "message-1",
      body: "Conversation opened...",
      messageType: "system",
      createdAt: "2026-05-19T13:30:00.000Z",
      senderName: "BVRB3R"
    },
    ...overrides
  };
}

function buildThreadDetail(thread: ReturnType<typeof buildThread>, selfRole = "client") {
  return {
    ...thread,
    participants: [
      {
        profileId: "profile-self",
        fullName: "Jordan Ellis",
        role: selfRole,
        isSelf: true
      },
      {
        profileId: thread.counterpart.profileId,
        fullName: thread.counterpart.fullName,
        role: thread.counterpart.role,
        isSelf: false
      }
    ]
  };
}

describe("client messages screen", () => {
  beforeEach(() => {
    useRouterMock.mockReset();
    useMessageThreadsQueryMock.mockReset();
    useMessageThreadQueryMock.mockReset();
    useCreateMessageThreadMutationMock.mockReset();
    useSendMessageMutationMock.mockReset();
    useSendMessageBroadcastMutationMock.mockReset();

    useRouterMock.mockReturnValue({
      push: vi.fn(),
      replace: vi.fn()
    });
    useMessageThreadsQueryMock.mockReturnValue({
      data: {
        available: true,
        viewer: {
          profileId: "profile-client",
          fullName: "Jordan Ellis",
          role: "client"
        },
        threads: [],
        eligibleAppointments: [],
        eligibleContacts: [],
        broadcastTargets: []
      },
      isLoading: false,
      error: null
    });
    useMessageThreadQueryMock.mockReturnValue({
      data: {
        available: true,
        viewer: {
          profileId: "profile-client",
          fullName: "Jordan Ellis",
          role: "client"
        },
        thread: null,
        messages: []
      },
      isLoading: false,
      error: null
    });
    useCreateMessageThreadMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn()
    });
    useSendMessageMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn()
    });
    useSendMessageBroadcastMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn()
    });
  });

  it("renders the client inbox empty state and support entry", () => {
    render(
      <MessagingInboxScreen
        surface="client"
        basePath="/dashboard/client/messages"
        title="Messages"
        subtitle="Keep barber replies, shop updates, and support conversations in one client-safe inbox."
      />
    );

    expect(screen.getByText("No messages yet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start a support message" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Message Support" })).toBeInTheDocument();
    expect(screen.getByText("BVRB3R Support")).toBeInTheDocument();
  });

  it("routes straight into an existing support thread when requested", async () => {
    const replace = vi.fn();
    useRouterMock.mockReturnValue({
      push: vi.fn(),
      replace
    });
    useMessageThreadsQueryMock.mockReturnValue({
      data: {
        available: true,
        viewer: {
          profileId: "profile-client",
          fullName: "Jordan Ellis",
          role: "client"
        },
        threads: [
          {
            id: "thread-support-1",
            threadType: "support",
            appointmentId: null,
            locationId: null,
            locationContext: null,
            createdAt: "2026-04-26T12:00:00.000Z",
            updatedAt: "2026-04-26T12:00:00.000Z",
            counterpart: {
              profileId: "profile-support",
              fullName: "BVRB3R Support",
              role: "platform_admin"
            },
            appointmentContext: null,
            lastMessage: null
          }
        ],
        eligibleAppointments: [],
        eligibleContacts: [],
        broadcastTargets: []
      },
      isLoading: false,
      error: null
    });

    render(
      <MessagingInboxScreen
        surface="client"
        basePath="/dashboard/client/messages"
        startSupportIntent
        title="Messages"
        subtitle="Keep barber replies, shop updates, and support conversations in one client-safe inbox."
      />
    );

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith("/dashboard/client/messages/thread-support-1");
    });
  });

  it("renders a thin appointment-linked client inbox row and conversation shell", () => {
    const thread = buildThread();
    useMessageThreadsQueryMock.mockReturnValue({
      data: {
        available: true,
        viewer: {
          profileId: "profile-client",
          fullName: "Jordan Ellis",
          role: "client"
        },
        threads: [thread],
        eligibleAppointments: [],
        eligibleContacts: [],
        broadcastTargets: []
      },
      isLoading: false,
      error: null
    });
    useMessageThreadQueryMock.mockReturnValue({
      data: {
        available: true,
        viewer: {
          profileId: "profile-client",
          fullName: "Jordan Ellis",
          role: "client"
        },
        thread: buildThreadDetail(thread),
        messages: [
          {
            id: "message-1",
            body: "Conversation opened...",
            messageType: "system",
            createdAt: "2026-05-19T13:30:00.000Z",
            senderName: "BVRB3R",
            senderRole: "platform_admin",
            isOwn: false
          }
        ]
      },
      isLoading: false,
      error: null
    });

    render(
      <MessagingInboxScreen
        surface="client"
        basePath="/dashboard/client/messages"
        selectedThreadId="thread-appointment-1"
        title="Messages"
        subtitle="Your conversations, appointments, and support."
      />
    );

    expect(screen.getByTestId("messaging-inbox-client")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Search messages" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New Message" })).toBeInTheDocument();
    expect(screen.getAllByText("Phillip mcgee").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Barber").length).toBeGreaterThan(0);
    expect(screen.getAllByText("test cut • Cancelled").length).toBeGreaterThan(0);
    expect(screen.getByText("test cut • May 19 • Cancelled")).toBeInTheDocument();
    expect(screen.getAllByText("Conversation opened...").length).toBeGreaterThan(1);
    expect(screen.getByRole("button", { name: "View Profile" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Book Now" })).toHaveAttribute("href", "/booking/new");

    const row = screen.getAllByText("Conversation opened...")[0]?.closest("a");
    expect(row?.className).toContain("min-h-[74px]");
  });

  it("renders the barber inbox with the same compact conversation system", () => {
    const thread = buildThread({
      counterpart: {
        profileId: "profile-client",
        fullName: "Jordan Ellis",
        role: "client"
      },
      lastMessage: {
        id: "message-client-1",
        body: "I am outside.",
        messageType: "text",
        createdAt: "2026-05-19T13:35:00.000Z",
        senderName: "Jordan Ellis"
      }
    });
    useMessageThreadsQueryMock.mockReturnValue({
      data: {
        available: true,
        viewer: {
          profileId: "profile-barber",
          fullName: "Phillip mcgee",
          role: "barber_user"
        },
        threads: [thread],
        eligibleAppointments: [],
        eligibleContacts: [],
        broadcastTargets: []
      },
      isLoading: false,
      error: null
    });
    useMessageThreadQueryMock.mockReturnValue({
      data: {
        available: true,
        viewer: {
          profileId: "profile-barber",
          fullName: "Phillip mcgee",
          role: "barber_user"
        },
        thread: buildThreadDetail(thread, "barber_user"),
        messages: [
          {
            id: "message-client-1",
            body: "I am outside.",
            messageType: "text",
            createdAt: "2026-05-19T13:35:00.000Z",
            senderName: "Jordan Ellis",
            senderRole: "client",
            isOwn: false
          }
        ]
      },
      isLoading: false,
      error: null
    });

    render(
      <MessagingInboxScreen
        surface="barber"
        basePath="/dashboard/barber/messages"
        selectedThreadId="thread-appointment-1"
        title="Messages"
        subtitle="Connect with clients."
      />
    );

    expect(screen.getByTestId("messaging-inbox-barber")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Primary 1/i })).toBeInTheDocument();
    expect(screen.getAllByText("Jordan Ellis").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Client").length).toBeGreaterThan(0);
    expect(screen.getAllByText("I am outside.").length).toBeGreaterThan(1);
    expect(screen.getByText("test cut • May 19 • Cancelled")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Book Now" })).toHaveAttribute("href", "/booking/new");
  });

  it("keeps support conversations compact without booking actions", () => {
    const supportThread = buildThread({
      id: "thread-support-1",
      threadType: "support",
      appointmentId: null,
      locationId: null,
      locationContext: null,
      counterpart: {
        profileId: "profile-support",
        fullName: "BVRB3R Support",
        role: "platform_admin"
      },
      appointmentContext: null,
      lastMessage: {
        id: "message-support-1",
        body: "How can we help?",
        messageType: "text",
        createdAt: "2026-05-19T13:40:00.000Z",
        senderName: "BVRB3R Support"
      }
    });
    useMessageThreadsQueryMock.mockReturnValue({
      data: {
        available: true,
        viewer: {
          profileId: "profile-client",
          fullName: "Jordan Ellis",
          role: "client"
        },
        threads: [supportThread],
        eligibleAppointments: [],
        eligibleContacts: [],
        broadcastTargets: []
      },
      isLoading: false,
      error: null
    });
    useMessageThreadQueryMock.mockReturnValue({
      data: {
        available: true,
        viewer: {
          profileId: "profile-client",
          fullName: "Jordan Ellis",
          role: "client"
        },
        thread: buildThreadDetail(supportThread),
        messages: [
          {
            id: "message-support-1",
            body: "How can we help?",
            messageType: "text",
            createdAt: "2026-05-19T13:40:00.000Z",
            senderName: "BVRB3R Support",
            senderRole: "platform_admin",
            isOwn: false
          }
        ]
      },
      isLoading: false,
      error: null
    });

    render(
      <MessagingInboxScreen
        surface="client"
        basePath="/dashboard/client/messages"
        selectedThreadId="thread-support-1"
        title="Messages"
        subtitle="Your conversations, appointments, and support."
      />
    );

    expect(screen.getAllByText("BVRB3R Support").length).toBeGreaterThan(0);
    expect(screen.getAllByText("How can we help?").length).toBeGreaterThan(1);
    expect(screen.getAllByText("Support").length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: "Book Now" })).not.toBeInTheDocument();
  });
});
