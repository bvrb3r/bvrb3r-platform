import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ComponentProps, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  useRouterMock,
  useMessageThreadsQueryMock,
  useMessageThreadQueryMock,
  useMessageParticipantSearchQueryMock,
  useCreateMessageThreadMutationMock,
  useMarkMessageThreadReadMutationMock,
  useSendMessageMutationMock,
  useApprovePosPaymentRequestMutationMock,
  useDeclinePosPaymentRequestMutationMock,
  useSendMessageBroadcastMutationMock
} = vi.hoisted(() => ({
  useRouterMock: vi.fn(),
  useMessageThreadsQueryMock: vi.fn(),
  useMessageThreadQueryMock: vi.fn(),
  useMessageParticipantSearchQueryMock: vi.fn(),
  useCreateMessageThreadMutationMock: vi.fn(),
  useMarkMessageThreadReadMutationMock: vi.fn(),
  useSendMessageMutationMock: vi.fn(),
  useApprovePosPaymentRequestMutationMock: vi.fn(),
  useDeclinePosPaymentRequestMutationMock: vi.fn(),
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
  useMessageParticipantSearchQuery: useMessageParticipantSearchQueryMock,
  useCreateMessageThreadMutation: useCreateMessageThreadMutationMock,
  useMarkMessageThreadReadMutation: useMarkMessageThreadReadMutationMock,
  useSendMessageMutation: useSendMessageMutationMock,
  useApprovePosPaymentRequestMutation: useApprovePosPaymentRequestMutationMock,
  useDeclinePosPaymentRequestMutation: useDeclinePosPaymentRequestMutationMock,
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
      role: "barber_user",
      avatarUrl: "https://cdn.bvrb3r.test/barber-avatar.jpg",
      publicUsername: "phillipforsure",
      publicContextLine: "8516 Island Breeze Ln - Temple Terrace, FL 33607",
      publicProfileHref: "/barber/phillipforsure",
      bookingHref: "/booking/new?barber=phillipforsure&barberId=barber-43b3cda2"
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

function buildSupportThread(overrides: Record<string, unknown> = {}) {
  return buildThread({
    id: "thread-support-1",
    threadType: "support",
    appointmentId: null,
    locationId: null,
    locationContext: null,
    createdAt: "2026-05-19T13:20:00.000Z",
    updatedAt: "2026-05-19T13:40:00.000Z",
    counterpart: {
      profileId: "profile-support",
      fullName: "BVRB3R Support",
      role: "platform_admin",
      avatarUrl: null,
      publicProfileHref: null,
      bookingHref: null
    },
    appointmentContext: null,
    lastMessage: {
      id: "message-support-1",
      body: "How can we help?",
      messageType: "text",
      createdAt: "2026-05-19T13:40:00.000Z",
      senderName: "BVRB3R Support"
    },
    ...overrides
  });
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
    useMessageParticipantSearchQueryMock.mockReset();
    useCreateMessageThreadMutationMock.mockReset();
    useMarkMessageThreadReadMutationMock.mockReset();
    useSendMessageMutationMock.mockReset();
    useApprovePosPaymentRequestMutationMock.mockReset();
    useDeclinePosPaymentRequestMutationMock.mockReset();
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
    useMessageParticipantSearchQueryMock.mockReturnValue({
      data: {
        results: []
      },
      isLoading: false,
      error: null
    });
    useCreateMessageThreadMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn()
    });
    useMarkMessageThreadReadMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn().mockResolvedValue({ threadId: "thread-appointment-1", lastReadAt: "2026-05-19T13:31:00.000Z" })
    });
    useSendMessageMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn()
    });
    useApprovePosPaymentRequestMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn()
    });
    useDeclinePosPaymentRequestMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn()
    });
    useSendMessageBroadcastMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn()
    });
  });

  it("renders the client inbox empty state without the redundant starter section", () => {
    render(
      <MessagingInboxScreen
        surface="client"
        basePath="/dashboard/client/messages"
        title="Messages"
        subtitle="Barbers, shops, bookings, and support."
      />
    );

    expect(screen.getByText("MESSAGES")).toBeInTheDocument();
    expect(screen.getByText("Barbers, shops, bookings, and support.")).toBeInTheDocument();
    expect(screen.getByText("No messages yet.")).toBeInTheDocument();
    expect(screen.getByText("Your barber, shop, booking, and support conversations will appear here.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New Message" })).toBeInTheDocument();
    ["All", "Barbers", "Shops", "Bookings", "Support"].forEach((label) => {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: "Other" })).not.toBeInTheDocument();
    expect(screen.queryByText("New")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start a support message" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Message Support" })).not.toBeInTheDocument();
    expect(screen.queryByText("New messages")).not.toBeInTheDocument();
    expect(screen.queryByText("Start from a booked appointment, shop line, or support.")).not.toBeInTheDocument();
  });

  it("opens an empty compose modal from the top New Message button without auto-selecting support", () => {
    const mutateAsync = vi.fn();
    useCreateMessageThreadMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync
    });

    render(
      <MessagingInboxScreen
        surface="client"
        basePath="/dashboard/client/messages"
        title="Messages"
        subtitle="Your conversations, appointments, and support."
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "New Message" }));

    const composeModal = screen.getByTestId("message-compose-modal");
    expect(within(composeModal).getByPlaceholderText("Search barbers, shops, or clients")).toBeInTheDocument();
    expect(within(composeModal).queryByText("BVRB3R Support")).not.toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("renders Culture as a secondary Messages header action", () => {
    render(
      <MessagingInboxScreen
        surface="client"
        basePath="/dashboard/client/messages"
        cultureHref="/dashboard/client/culture"
        title="Messages"
        subtitle="Barbers, shops, bookings, and support."
      />
    );

    expect(screen.getByRole("button", { name: "New Message" })).toBeInTheDocument();
    const cultureLink = screen.getByRole("link", { name: "Culture" });
    expect(cultureLink).toHaveAttribute("href", "/dashboard/client/culture");
    expect(cultureLink.querySelector(".lucide-sparkles")).toBeInTheDocument();
    expect(cultureLink.querySelector(".lucide-radio-tower")).not.toBeInTheDocument();
  });

  it("marks an unread thread read and removes the dot when the row opens", async () => {
    const markRead = vi.fn().mockResolvedValue({
      threadId: "thread-appointment-1",
      lastReadAt: "2026-05-19T13:31:00.000Z"
    });
    useMarkMessageThreadReadMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync: markRead
    });
    const thread = buildThread({ hasUnread: true });
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
      error: null,
      refetch: vi.fn()
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
        messages: []
      },
      isLoading: false,
      error: null
    });

    render(
      <MessagingInboxScreen
        surface="client"
        basePath="/dashboard/client/messages"
        title="Messages"
        subtitle="Barbers, shops, bookings, and support."
      />
    );

    expect(screen.getByLabelText("Unread message")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("message-thread-row-thread-appointment-1"));

    await waitFor(() => {
      expect(markRead).toHaveBeenCalledWith("thread-appointment-1");
    });
    expect(screen.queryByLabelText("Unread message")).not.toBeInTheDocument();
  });

  it("does not render a green unread dot when the thread is already read", () => {
    useMessageThreadsQueryMock.mockReturnValue({
      data: {
        available: true,
        viewer: {
          profileId: "profile-client",
          fullName: "Jordan Ellis",
          role: "client"
        },
        threads: [buildThread({ hasUnread: false })],
        eligibleAppointments: [],
        eligibleContacts: [],
        broadcastTargets: []
      },
      isLoading: false,
      error: null,
      refetch: vi.fn()
    });

    render(
      <MessagingInboxScreen
        surface="client"
        basePath="/dashboard/client/messages"
        title="Messages"
        subtitle="Barbers, shops, bookings, and support."
      />
    );

    expect(screen.queryByLabelText("Unread message")).not.toBeInTheDocument();
  });

  it("marks a directly loaded selected thread read", async () => {
    const markRead = vi.fn().mockResolvedValue({
      threadId: "thread-appointment-1",
      lastReadAt: "2026-05-19T13:31:00.000Z"
    });
    useMarkMessageThreadReadMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync: markRead
    });
    const thread = buildThread({ hasUnread: true });
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
      error: null,
      refetch: vi.fn()
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
        messages: []
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
        subtitle="Barbers, shops, bookings, and support."
      />
    );

    await waitFor(() => {
      expect(markRead).toHaveBeenCalledWith("thread-appointment-1");
    });
  });

  it("maps Culture header actions for barber and owner message surfaces", () => {
    const { rerender } = render(
      <MessagingInboxScreen
        surface="barber"
        basePath="/dashboard/barber/messages"
        cultureHref="/dashboard/barber/culture"
        title="Messages"
        subtitle="Clients, bookings, shop lines, and support."
      />
    );

    expect(screen.getByRole("button", { name: "New Message" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Culture" })).toHaveAttribute("href", "/dashboard/barber/culture");

    rerender(
      <MessagingInboxScreen
        surface="shop"
        basePath="/dashboard/owner/messages"
        cultureHref="/dashboard/owner/culture"
        title="Messages"
        subtitle="Clients, barbers, team, bookings, and support."
      />
    );

    expect(screen.getByRole("button", { name: "New Message" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Culture" })).toHaveAttribute("href", "/dashboard/owner/culture");
  });

  it("finds a barber public username from the main Messages search", () => {
    useMessageParticipantSearchQueryMock.mockReturnValue({
      data: {
        results: [
          {
            id: "profile-barber",
            participantId: "profile-barber",
            displayName: "Phillip mcgee",
            resultType: "barber",
            participantType: "barber",
            role: "barber_user",
            avatarUrl: "https://cdn.bvrb3r.test/phillip.jpg",
            publicUsername: "phillipforsure",
            publicContextLine: "8516 Island Breeze Ln - Temple Terrace, FL 33607",
            publicProfileHref: "/barber/phillipforsure",
            profileHref: "/barber/phillipforsure",
            bookingHref: "/booking/new?barber=phillipforsure&barberId=barber-43b3cda2",
            existingThreadId: null,
            createThreadInput: {
              threadType: "client_barber",
              profileId: "profile-barber"
            },
            subtitle: "Barber"
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
        title="Messages"
        subtitle="Your conversations, appointments, and support."
      />
    );

    fireEvent.change(screen.getByRole("textbox", { name: "Search messages" }), {
      target: { value: "@phillipforsure" }
    });

    expect(screen.getByText("People and businesses")).toBeInTheDocument();
    expect(screen.getByText("@phillipforsure")).toBeInTheDocument();
    expect(screen.getByText("8516 Island Breeze Ln - Temple Terrace, FL 33607")).toBeInTheDocument();
    expect(screen.getByText("Start")).toBeInTheDocument();
    expect(screen.queryByText("Phillip mcgee")).not.toBeInTheDocument();
  });

  it("searches public usernames without requiring the at sign", () => {
    useMessageParticipantSearchQueryMock.mockReturnValue({
      data: {
        results: [
          {
            id: "profile-barber",
            participantId: "profile-barber",
            displayName: "Phillip mcgee",
            resultType: "barber",
            participantType: "barber",
            role: "barber_user",
            avatarUrl: null,
            publicUsername: "phillipforsure",
            publicContextLine: "8516 Island Breeze Ln - Temple Terrace, FL 33607",
            publicProfileHref: "/barber/phillipforsure",
            profileHref: "/barber/phillipforsure",
            existingThreadId: null,
            createThreadInput: {
              threadType: "client_barber",
              profileId: "profile-barber"
            },
            subtitle: "Barber"
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
        title="Messages"
        subtitle="Your conversations, appointments, and support."
      />
    );

    fireEvent.change(screen.getByRole("textbox", { name: "Search messages" }), {
      target: { value: "phillipforsure" }
    });

    expect(screen.getByText("@phillipforsure")).toBeInTheDocument();
  });

  it("finds a shop public username from the main Messages search", () => {
    useMessageParticipantSearchQueryMock.mockReturnValue({
      data: {
        results: [
          {
            id: "shop-the-bvrb3r-shop",
            participantId: "shop-the-bvrb3r-shop",
            displayName: "The BVRB3R Shop",
            resultType: "shop",
            participantType: "shop",
            role: "shop_owner_user",
            avatarUrl: "https://cdn.bvrb3r.test/shop-logo.jpg",
            publicUsername: "thebvrb3rshopuniversitymall",
            publicContextLine: "2172 University Square Mall - Tampa, FL 33612",
            publicProfileHref: "/shop/thebvrb3rshopuniversitymall",
            profileHref: "/shop/thebvrb3rshopuniversitymall",
            existingThreadId: null,
            createThreadInput: {
              threadType: "client_shop",
              profileId: "profile-owner",
              locationId: "shop-the-bvrb3r-shop"
            },
            subtitle: "Shop"
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
        title="Messages"
        subtitle="Your conversations, appointments, and support."
      />
    );

    fireEvent.change(screen.getByRole("textbox", { name: "Search messages" }), {
      target: { value: "@thebvrb3rshopuniversitymall" }
    });

    expect(screen.getByText("@thebvrb3rshopuniversitymall")).toBeInTheDocument();
    expect(screen.getByText("2172 University Square Mall - Tampa, FL 33612")).toBeInTheDocument();
    expect(screen.queryByText("The BVRB3R Shop")).not.toBeInTheDocument();
  });

  it("shows existing conversations before public identity search results", () => {
    useMessageThreadsQueryMock.mockReturnValue({
      data: {
        available: true,
        viewer: {
          profileId: "profile-client",
          fullName: "Jordan Ellis",
          role: "client"
        },
        threads: [buildThread()],
        eligibleAppointments: [],
        eligibleContacts: [],
        broadcastTargets: []
      },
      isLoading: false,
      error: null
    });
    useMessageParticipantSearchQueryMock.mockReturnValue({
      data: {
        results: [
          {
            id: "profile-shop",
            participantId: "profile-shop",
            displayName: "The BVRB3R Shop",
            resultType: "shop",
            participantType: "shop",
            role: "shop_owner_user",
            avatarUrl: null,
            publicUsername: "thebvrb3rshopuniversitymall",
            publicContextLine: "2172 University Square Mall - Tampa, FL 33612",
            publicProfileHref: "/shop/thebvrb3rshopuniversitymall",
            profileHref: "/shop/thebvrb3rshopuniversitymall",
            existingThreadId: null,
            createThreadInput: {
              threadType: "client_shop",
              profileId: "profile-shop",
              locationId: "shop-the-bvrb3r-shop"
            },
            subtitle: "Shop"
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
        title="Messages"
        subtitle="Your conversations, appointments, and support."
      />
    );

    fireEvent.change(screen.getByRole("textbox", { name: "Search messages" }), {
      target: { value: "phillipforsure" }
    });

    expect(screen.getByText("Existing conversations")).toBeInTheDocument();
    expect(screen.getByText("People and businesses")).toBeInTheDocument();
    const existingHeader = screen.getByText("Existing conversations");
    const peopleHeader = screen.getByText("People and businesses");
    expect(existingHeader.compareDocumentPosition(peopleHeader) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("opens an existing thread from a main search public identity result and marks it read", async () => {
    const push = vi.fn();
    const markRead = vi.fn().mockResolvedValue({
      threadId: "thread-appointment-1",
      lastReadAt: "2026-05-19T13:31:00.000Z"
    });
    useRouterMock.mockReturnValue({
      push,
      replace: vi.fn()
    });
    useMarkMessageThreadReadMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync: markRead
    });
    useMessageParticipantSearchQueryMock.mockReturnValue({
      data: {
        results: [
          {
            id: "profile-barber",
            participantId: "profile-barber",
            displayName: "Phillip mcgee",
            resultType: "barber",
            participantType: "barber",
            role: "barber_user",
            avatarUrl: null,
            publicUsername: "phillipforsure",
            publicContextLine: "8516 Island Breeze Ln - Temple Terrace, FL 33607",
            publicProfileHref: "/barber/phillipforsure",
            profileHref: "/barber/phillipforsure",
            existingThreadId: "thread-appointment-1",
            createThreadInput: {
              threadType: "client_barber",
              profileId: "profile-barber"
            },
            subtitle: "Barber"
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
        title="Messages"
        subtitle="Your conversations, appointments, and support."
      />
    );

    fireEvent.change(screen.getByRole("textbox", { name: "Search messages" }), {
      target: { value: "@phillipforsure" }
    });
    fireEvent.click(screen.getByText("@phillipforsure"));

    expect(push).toHaveBeenCalledWith("/dashboard/client/messages/thread-appointment-1", { scroll: false });
    await waitFor(() => {
      expect(markRead).toHaveBeenCalledWith("thread-appointment-1");
    });
  });

  it("creates a new thread from a main search public identity result", async () => {
    const push = vi.fn();
    const mutateAsync = vi.fn().mockResolvedValue({
      thread: {
        id: "thread-new-shop"
      }
    });
    useRouterMock.mockReturnValue({
      push,
      replace: vi.fn()
    });
    useCreateMessageThreadMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync
    });
    useMessageParticipantSearchQueryMock.mockReturnValue({
      data: {
        results: [
          {
            id: "profile-shop",
            participantId: "profile-shop",
            displayName: "The BVRB3R Shop",
            resultType: "shop",
            participantType: "shop",
            role: "shop_owner_user",
            avatarUrl: null,
            publicUsername: "thebvrb3rshopuniversitymall",
            publicContextLine: "2172 University Square Mall - Tampa, FL 33612",
            publicProfileHref: "/shop/thebvrb3rshopuniversitymall",
            profileHref: "/shop/thebvrb3rshopuniversitymall",
            existingThreadId: null,
            createThreadInput: {
              threadType: "client_shop",
              profileId: "profile-shop",
              locationId: "shop-the-bvrb3r-shop"
            },
            subtitle: "Shop"
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
        title="Messages"
        subtitle="Your conversations, appointments, and support."
      />
    );

    fireEvent.change(screen.getByRole("textbox", { name: "Search messages" }), {
      target: { value: "@thebvrb3rshopuniversitymall" }
    });
    fireEvent.click(screen.getByText("@thebvrb3rshopuniversitymall"));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith({
        threadType: "client_shop",
        profileId: "profile-shop",
        locationId: "shop-the-bvrb3r-shop"
      });
    });
    expect(push).toHaveBeenCalledWith("/dashboard/client/messages/thread-new-shop", { scroll: false });
  });

  it("shows a public username no-result state from the main Messages search", () => {
    render(
      <MessagingInboxScreen
        surface="client"
        basePath="/dashboard/client/messages"
        title="Messages"
        subtitle="Your conversations, appointments, and support."
      />
    );

    fireEvent.change(screen.getByRole("textbox", { name: "Search messages" }), {
      target: { value: "@missinghandle" }
    });

    expect(screen.getByText("No matching people or messages.")).toBeInTheDocument();
    expect(screen.getByText("Try a public username like @phillipforsure.")).toBeInTheDocument();
  });

  it("shows a clear public username search error", () => {
    useMessageParticipantSearchQueryMock.mockReturnValue({
      data: {
        results: []
      },
      isLoading: false,
      error: new Error("Search failed")
    });

    render(
      <MessagingInboxScreen
        surface="client"
        basePath="/dashboard/client/messages"
        title="Messages"
        subtitle="Your conversations, appointments, and support."
      />
    );

    fireEvent.change(screen.getByRole("textbox", { name: "Search messages" }), {
      target: { value: "@phillipforsure" }
    });

    expect(screen.getByText("Unable to search public usernames. Try again.")).toBeInTheDocument();
  });

  it("renders participant search results and opens an existing barber thread", () => {
    const push = vi.fn();
    const mutateAsync = vi.fn();
    useRouterMock.mockReturnValue({
      push,
      replace: vi.fn()
    });
    useCreateMessageThreadMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync
    });
    useMessageParticipantSearchQueryMock.mockReturnValue({
      data: {
        results: [
          {
            id: "profile-barber",
            participantId: "profile-barber",
            displayName: "Phillip mcgee",
            resultType: "barber",
            participantType: "barber",
            role: "barber_user",
            avatarUrl: "https://cdn.bvrb3r.test/phillip.jpg",
            publicUsername: "phillipforsure",
            publicContextLine: "8516 Island Breeze Ln - Temple Terrace, FL 33607",
            publicProfileHref: "/barber/phillipforsure",
            profileHref: "/barber/phillipforsure",
            bookingHref: "/booking/new?barber=phillipmcgee&barberId=barber-43b3cda2",
            existingThreadId: "thread-appointment-1",
            createThreadInput: {
              threadType: "client_barber",
              profileId: "profile-barber"
            },
            subtitle: "Barber"
          },
          {
            id: "profile-support",
            participantId: "profile-support",
            displayName: "BVRB3R Support",
            resultType: "support",
            participantType: "support",
            role: "platform_admin",
            avatarUrl: null,
            publicProfileHref: null,
            profileHref: null,
            existingThreadId: null,
            createThreadInput: {
              threadType: "support"
            },
            subtitle: "BVRB3R Support"
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
        title="Messages"
        subtitle="Your conversations, appointments, and support."
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "New Message" }));
    fireEvent.change(screen.getByPlaceholderText("Search barbers, shops, or clients"), {
      target: { value: "phillip" }
    });

    const composeModal = screen.getByTestId("message-compose-modal");
    expect(within(composeModal).getByText("@phillipforsure")).toBeInTheDocument();
    expect(within(composeModal).queryByText("Phillip mcgee")).not.toBeInTheDocument();
    expect(within(composeModal).getAllByText("BVRB3R Support").length).toBeGreaterThan(0);
    fireEvent.click(within(composeModal).getByText("@phillipforsure"));

    expect(mutateAsync).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/dashboard/client/messages/thread-appointment-1", { scroll: false });
  });

  it("keeps barber results visible when shop participant search returns a warning", () => {
    useMessageParticipantSearchQueryMock.mockReturnValue({
      data: {
        results: [
          {
            id: "profile-barber",
            participantId: "profile-barber",
            displayName: "Phillip mcgee",
            resultType: "barber",
            participantType: "barber",
            role: "barber_user",
            avatarUrl: null,
            publicUsername: "phillipforsure",
            publicContextLine: "8516 Island Breeze Ln - Temple Terrace, FL 33607",
            publicProfileHref: "/barber/phillipforsure",
            profileHref: "/barber/phillipforsure",
            bookingHref: "/booking/new?barber=phillipforsure&barberId=barber-43b3cda2",
            existingThreadId: "thread-appointment-1",
            createThreadInput: {
              threadType: "client_barber",
              profileId: "profile-barber"
            },
            subtitle: "Barber"
          }
        ],
        warnings: [
          {
            branch: "shop",
            message: "Unable to search shop messaging results."
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
        title="Messages"
        subtitle="Your conversations, appointments, and support."
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "New Message" }));
    fireEvent.change(screen.getByPlaceholderText("Search barbers, shops, or clients"), {
      target: { value: "phillip" }
    });

    const composeModal = screen.getByTestId("message-compose-modal");
    expect(within(composeModal).getByText("@phillipforsure")).toBeInTheDocument();
    expect(within(composeModal).queryByText("Phillip mcgee")).not.toBeInTheDocument();
    expect(within(composeModal).queryByText("Unable to search shop messaging results.")).not.toBeInTheDocument();
  });

  it("creates one thread when selecting a new barber search result", async () => {
    const push = vi.fn();
    const mutateAsync = vi.fn().mockResolvedValue({
      thread: {
        id: "thread-new-barber"
      }
    });
    useRouterMock.mockReturnValue({
      push,
      replace: vi.fn()
    });
    useCreateMessageThreadMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync
    });
    useMessageParticipantSearchQueryMock.mockReturnValue({
      data: {
        results: [
          {
            id: "profile-new-barber",
            participantId: "profile-new-barber",
            displayName: "Nova Blades",
            resultType: "barber",
            participantType: "barber",
            role: "barber_user",
            avatarUrl: null,
            publicProfileHref: "/barber/nova-blades",
            profileHref: "/barber/nova-blades",
            bookingHref: "/booking/new?barber=nova-blades&barberId=barber-nova",
            existingThreadId: null,
            createThreadInput: {
              threadType: "client_barber",
              profileId: "profile-new-barber"
            },
            subtitle: "Barber"
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
        title="Messages"
        subtitle="Your conversations, appointments, and support."
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "New Message" }));
    fireEvent.change(screen.getByPlaceholderText("Search barbers, shops, or clients"), {
      target: { value: "nova" }
    });
    fireEvent.click(screen.getByText("Nova Blades"));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledTimes(1);
    });
    expect(mutateAsync).toHaveBeenCalledWith({
      threadType: "client_barber",
      profileId: "profile-new-barber"
    });
    expect(push).toHaveBeenCalledWith("/dashboard/client/messages/thread-new-barber", { scroll: false });
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

  it("renders one sorted thread list for barber and support conversations", () => {
    const barberThread = buildThread({
      updatedAt: "2026-05-19T13:30:00.000Z",
      lastMessage: {
        id: "message-barber-1",
        body: "Barber thread",
        messageType: "text",
        createdAt: "2026-05-19T13:30:00.000Z",
        senderName: "Phillip mcgee"
      }
    });
    const supportThread = buildSupportThread({
      updatedAt: "2026-05-19T14:05:00.000Z",
      lastMessage: {
        id: "message-support-1",
        body: "Latest support reply",
        messageType: "text",
        createdAt: "2026-05-19T14:05:00.000Z",
        senderName: "BVRB3R Support"
      }
    });
    const staleDuplicateSupportThread = buildSupportThread({
      updatedAt: "2026-05-19T12:05:00.000Z",
      lastMessage: {
        id: "message-support-old",
        body: "Old support reply",
        messageType: "text",
        createdAt: "2026-05-19T12:05:00.000Z",
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
        threads: [barberThread, staleDuplicateSupportThread, supportThread],
        eligibleAppointments: [
          {
            kind: "appointment",
            appointmentId: "appointment-1",
            counterpart: {
              profileId: "profile-barber",
              fullName: "Phillip mcgee",
              role: "barber_user"
            },
            appointmentContext: barberThread.appointmentContext
          },
          {
            kind: "appointment",
            appointmentId: "appointment-1",
            counterpart: {
              profileId: "profile-barber",
              fullName: "Phillip mcgee",
              role: "barber_user"
            },
            appointmentContext: barberThread.appointmentContext
          }
        ],
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
        title="Messages"
        subtitle="Your conversations, appointments, and support."
      />
    );

    expect(screen.queryByText("New messages")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Message Support" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open" })).not.toBeInTheDocument();
    expect(screen.getByTestId("message-thread-row-thread-appointment-1")).toBeInTheDocument();
    expect(screen.getByTestId("message-thread-row-thread-support-1")).toBeInTheDocument();
    expect(screen.getAllByText("@phillipforsure").length).toBeGreaterThan(0);
    expect(screen.getByText("8516 Island Breeze Ln - Temple Terrace, FL 33607")).toBeInTheDocument();
    expect(screen.getByText("Barber thread")).toBeInTheDocument();
    expect(screen.getByText("Latest support reply")).toBeInTheDocument();
    expect(screen.queryByText("Old support reply")).not.toBeInTheDocument();
    expect(screen.getAllByAltText("@phillipforsure").length).toBeGreaterThan(0);
    expect(screen.getAllByText("B").length).toBeGreaterThan(0);

    const rows = screen.getAllByTestId(/message-thread-row-/);
    expect(rows.map((row) => row.getAttribute("data-testid"))).toEqual([
      "message-thread-row-thread-support-1",
      "message-thread-row-thread-appointment-1"
    ]);
  });

  it("dedupes multiple appointment threads by barber and opens combined context", () => {
    const firstBarberThread = buildThread({
      id: "thread-appointment-1",
      appointmentId: "appointment-1",
      updatedAt: "2026-05-19T13:30:00.000Z",
      lastMessage: {
        id: "message-barber-old",
        body: "First appointment follow-up",
        messageType: "text",
        createdAt: "2026-05-19T13:30:00.000Z",
        senderName: "Phillip mcgee"
      }
    });
    const secondAppointmentContext = {
      appointmentId: "appointment-2",
      confirmationCode: "2T7CIYH15O",
      status: "completed",
      statusLabel: "Completed",
      startsAt: "2026-05-21T13:30:00.000Z",
      serviceName: "beard detail",
      locationLabel: "Phils chair"
    };
    const secondBarberThread = buildThread({
      id: "thread-appointment-2",
      appointmentId: "appointment-2",
      appointmentContext: secondAppointmentContext,
      updatedAt: "2026-05-19T14:20:00.000Z",
      lastMessage: {
        id: "message-barber-new",
        body: "Second appointment update",
        messageType: "text",
        createdAt: "2026-05-19T14:20:00.000Z",
        senderName: "Phillip mcgee"
      }
    });
    const otherBarberThread = buildThread({
      id: "thread-wave-1",
      counterpart: {
        profileId: "profile-wave",
        fullName: "Wave Carter",
        role: "barber_user"
      },
      appointmentId: "appointment-wave",
      appointmentContext: {
        appointmentId: "appointment-wave",
        confirmationCode: "WAVE1",
        status: "confirmed",
        statusLabel: "Confirmed",
        startsAt: "2026-05-22T15:00:00.000Z",
        serviceName: "razor fade",
        locationLabel: "Wave chair"
      },
      updatedAt: "2026-05-19T14:00:00.000Z",
      lastMessage: {
        id: "message-wave-1",
        body: "Wave is ready.",
        messageType: "text",
        createdAt: "2026-05-19T14:00:00.000Z",
        senderName: "Wave Carter"
      }
    });
    const supportThread = buildSupportThread({
      updatedAt: "2026-05-19T12:00:00.000Z",
      lastMessage: {
        id: "message-support-1",
        body: "Support check-in.",
        messageType: "text",
        createdAt: "2026-05-19T12:00:00.000Z",
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
        threads: [firstBarberThread, otherBarberThread, secondBarberThread, supportThread],
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
        thread: buildThreadDetail(secondBarberThread),
        messages: [
          {
            id: "message-barber-old",
            body: "First appointment follow-up",
            messageType: "text",
            createdAt: "2026-05-19T13:30:00.000Z",
            senderName: "Phillip mcgee",
            senderRole: "barber_user",
            isOwn: false
          },
          {
            id: "message-barber-new",
            body: "Second appointment update",
            messageType: "text",
            createdAt: "2026-05-19T14:20:00.000Z",
            senderName: "Phillip mcgee",
            senderRole: "barber_user",
            isOwn: false
          }
        ],
        relatedAppointmentContexts: [
          secondAppointmentContext,
          firstBarberThread.appointmentContext
        ]
      },
      isLoading: false,
      error: null
    });

    render(
      <MessagingInboxScreen
        surface="client"
        basePath="/dashboard/client/messages"
        title="Messages"
        subtitle="Your conversations, appointments, and support."
      />
    );

    expect(screen.getByTestId("message-thread-row-thread-appointment-2")).toBeInTheDocument();
    expect(screen.queryByTestId("message-thread-row-thread-appointment-1")).not.toBeInTheDocument();
    expect(screen.getByTestId("message-thread-row-thread-wave-1")).toBeInTheDocument();
    expect(screen.getByTestId("message-thread-row-thread-support-1")).toBeInTheDocument();
    expect(screen.getAllByText("@phillipforsure").length).toBeGreaterThan(0);
    expect(screen.queryByText("Phillip mcgee")).not.toBeInTheDocument();

    const rows = screen.getAllByTestId(/message-thread-row-/);
    expect(rows.map((row) => row.getAttribute("data-testid"))).toEqual([
      "message-thread-row-thread-appointment-2",
      "message-thread-row-thread-wave-1",
      "message-thread-row-thread-support-1"
    ]);

    fireEvent.click(screen.getByTestId("message-thread-row-thread-appointment-2"));

    const modal = screen.getByTestId("message-thread-modal");
    expect(within(modal).getByText("First appointment follow-up")).toBeInTheDocument();
    expect(within(modal).getByText("Second appointment update")).toBeInTheDocument();
    expect(within(modal).getByTestId("related-appointment-contexts")).toHaveTextContent("beard detail");
    expect(within(modal).getByTestId("related-appointment-contexts")).toHaveTextContent("test cut");
  });

  it("renders barber profile photos in the inbox row, avatar rail, and modal header", () => {
    const thread = buildThread({
      counterpart: {
        profileId: "profile-barber",
        fullName: "Phillip mcgee",
        role: "barber_user",
        avatarUrl: "https://cdn.bvrb3r.test/phillip.jpg",
        publicUsername: "phillipforsure",
        publicContextLine: "8516 Island Breeze Ln - Temple Terrace, FL 33607",
        publicProfileHref: "/barber/phillipforsure",
        bookingHref: "/booking/new?barber=phillipforsure&barberId=barber-43b3cda2"
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
        messages: []
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

    const images = screen.getAllByRole("img", { name: "@phillipforsure" });
    expect(images.length).toBeGreaterThanOrEqual(3);
    for (const image of images) {
      expect(image).toHaveAttribute("src", "https://cdn.bvrb3r.test/phillip.jpg");
    }
  });

  it("renders a thin appointment-linked client inbox row and modal conversation shell", () => {
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
    expect(screen.queryByTestId("message-thread-panel")).not.toBeInTheDocument();
    expect(screen.getByTestId("message-thread-modal")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Search messages" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New Message" })).toBeInTheDocument();
    expect(screen.getAllByText("@phillipforsure").length).toBeGreaterThan(0);
    expect(screen.getAllByAltText("@phillipforsure").length).toBeGreaterThan(0);
    expect(screen.queryByText("Phillip mcgee")).not.toBeInTheDocument();
    expect(screen.getAllByText("Barber").length).toBeGreaterThan(0);
    expect(screen.getAllByText("8516 Island Breeze Ln - Temple Terrace, FL 33607").length).toBeGreaterThan(0);
    expect(screen.getByText("test cut • May 19 • Cancelled")).toBeInTheDocument();
    expect(screen.getAllByText("Conversation opened...").length).toBeGreaterThan(1);
    expect(screen.getByRole("link", { name: "View Profile" })).toHaveAttribute("href", "/barber/phillipforsure");
    expect(screen.getByRole("link", { name: "Book" })).toHaveAttribute("href", "/booking/new?barber=phillipforsure&barberId=barber-43b3cda2");

    const row = screen.getAllByText("Conversation opened...")[0]?.closest("a");
    expect(row?.className).toContain("min-h-[78px]");
  });

  it("opens a barber appointment thread in a modal and closes back to the inbox", () => {
    const push = vi.fn();
    const thread = buildThread();
    useRouterMock.mockReturnValue({
      push,
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
        title="Messages"
        subtitle="Your conversations, appointments, and support."
      />
    );

    expect(screen.queryByTestId("message-thread-panel")).not.toBeInTheDocument();
    expect(screen.queryByTestId("message-thread-modal")).not.toBeInTheDocument();

    const threadRow = screen.getByText("Conversation opened...").closest("a");
    expect(threadRow).not.toBeNull();
    fireEvent.click(threadRow as HTMLAnchorElement);

    expect(push).toHaveBeenCalledWith("/dashboard/client/messages/thread-appointment-1", { scroll: false });
    const modal = screen.getByTestId("message-thread-modal");
    expect(within(modal).getByText("@phillipforsure")).toBeInTheDocument();
    expect(within(modal).queryByText("Phillip mcgee")).not.toBeInTheDocument();
    expect(within(modal).getByRole("textbox", { name: "Reply" })).toBeInTheDocument();
    expect(within(modal).getByRole("button", { name: "Send message" })).toBeInTheDocument();
    expect(within(modal).getByRole("link", { name: "View Profile" })).toHaveAttribute("href", "/barber/phillipforsure");
    expect(within(modal).getByRole("link", { name: "Book" })).toHaveAttribute("href", "/booking/new?barber=phillipforsure&barberId=barber-43b3cda2");

    fireEvent.click(within(modal).getByRole("button", { name: "Back" }));

    expect(push).toHaveBeenCalledWith("/dashboard/client/messages", { scroll: false });
    expect(screen.queryByTestId("message-thread-modal")).not.toBeInTheDocument();
    expect(screen.getByText("Conversation opened...")).toBeInTheDocument();
  });

  it("opens a support thread in the same modal without booking actions", () => {
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
        title="Messages"
        subtitle="Your conversations, appointments, and support."
      />
    );

    const supportRow = screen.getByText("How can we help?").closest("a");
    expect(supportRow).not.toBeNull();
    fireEvent.click(supportRow as HTMLAnchorElement);

    const modal = screen.getByTestId("message-thread-modal");
    expect(within(modal).getAllByText("BVRB3R Support").length).toBeGreaterThan(0);
    expect(within(modal).getAllByText("B").length).toBeGreaterThan(0);
    expect(within(modal).queryByRole("link", { name: "Book" })).not.toBeInTheDocument();
    expect(within(modal).getByRole("textbox", { name: "Reply" })).toBeInTheDocument();
  });

  it("renders a structured POS payment request card with approve and decline actions", async () => {
    const thread = buildThread({
      lastMessage: {
        id: "message-pos-request",
        body: "Phillip mcgee requested $35.00 for a walk-in service.",
        messageType: "system",
        createdAt: "2026-05-25T15:00:00.000Z",
        senderName: "Phillip mcgee"
      }
    });
    const approve = vi.fn().mockResolvedValue({ ok: true });
    const decline = vi.fn().mockResolvedValue({ ok: true });
    useApprovePosPaymentRequestMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync: approve
    });
    useDeclinePosPaymentRequestMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync: decline
    });
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
            id: "message-pos-request",
            body: "Phillip mcgee requested $35.00 for a walk-in service.",
            messageType: "system",
            metadata: {
              kind: "pos_payment_request",
              paymentRequestId: "request-pos-1",
              posSaleId: "sale-pos-1",
              amountCents: 3500,
              status: "pending"
            },
            createdAt: "2026-05-25T15:00:00.000Z",
            senderName: "Phillip mcgee",
            senderRole: "barber_user",
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

    const modal = screen.getByTestId("message-thread-modal");
    const card = within(modal).getByTestId("pos-payment-request-card");
    expect(card).toHaveTextContent("Payment Request");
    expect(card).toHaveTextContent("@phillipforsure requested $35.00");
    expect(card).not.toHaveTextContent("Phillip mcgee requested $35.00");

    fireEvent.click(within(card).getByRole("button", { name: "Approve Payment" }));
    await waitFor(() => {
      expect(approve).toHaveBeenCalledWith("request-pos-1");
    });

    fireEvent.click(within(card).getByRole("button", { name: "Decline" }));
    await waitFor(() => {
      expect(decline).toHaveBeenCalledWith("request-pos-1");
    });
  });

  it("does not allow approval from failed or superseded payment request cards", async () => {
    const approve = vi.fn().mockResolvedValue({});
    const decline = vi.fn().mockResolvedValue({});
    const thread = buildThread({
      id: "thread-pos-failed",
      counterpart: {
        profileId: "profile-barber",
        fullName: "Phillip mcgee",
        role: "barber_user"
      }
    });
    useApprovePosPaymentRequestMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync: approve
    });
    useDeclinePosPaymentRequestMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync: decline
    });
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
            id: "message-pos-request",
            body: "Phillip mcgee requested $35.00 for a walk-in service.",
            messageType: "system",
            metadata: {
              kind: "pos_payment_request",
              paymentRequestId: "request-pos-1",
              posSaleId: "sale-pos-1",
              amountCents: 3500,
              status: "pending_message_failed"
            },
            createdAt: "2026-05-25T15:00:00.000Z",
            senderName: "Phillip mcgee",
            senderRole: "barber_user",
            isOwn: false
          },
          {
            id: "message-pos-request-superseded",
            body: "Phillip mcgee requested $35.00 for a walk-in service.",
            messageType: "system",
            metadata: {
              kind: "pos_payment_request",
              paymentRequestId: "request-pos-2",
              posSaleId: "sale-pos-2",
              amountCents: 3500,
              status: "superseded"
            },
            createdAt: "2026-05-25T15:02:00.000Z",
            senderName: "Phillip mcgee",
            senderRole: "barber_user",
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
        selectedThreadId="thread-pos-failed"
        title="Messages"
        subtitle="Your conversations, appointments, and support."
      />
    );

    const cards = within(screen.getByTestId("message-thread-modal")).getAllByTestId("pos-payment-request-card");
    expect(cards[0]).toHaveTextContent("Retry Needed");
    expect(cards[0]).toHaveTextContent("needs to be resent");
    expect(within(cards[0]).queryByRole("button", { name: "Approve Payment" })).not.toBeInTheDocument();
    expect(cards[1]).toHaveTextContent("Superseded");
    expect(cards[1]).toHaveTextContent("duplicate request was closed");
    expect(within(cards[1]).queryByRole("button", { name: "Approve Payment" })).not.toBeInTheDocument();
    expect(approve).not.toHaveBeenCalled();
    expect(decline).not.toHaveBeenCalled();
  });

  it("renders the barber inbox with the same compact conversation system", () => {
    const thread = buildThread({
      counterpart: {
        profileId: "profile-client",
        fullName: "Jordan Ellis",
        role: "client",
        avatarUrl: "https://cdn.bvrb3r.test/client.jpg",
        publicUsername: "jordanellis",
        publicContextLine: "Tampa, FL",
        publicProfileHref: "/client/jordanellis"
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
    expect(screen.queryByRole("button", { name: /Primary/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /General/i })).not.toBeInTheDocument();
    expect(screen.queryByTestId("message-thread-panel")).not.toBeInTheDocument();
    expect(screen.getByTestId("message-thread-modal")).toBeInTheDocument();
    ["All", "Clients", "Shops", "Support", "Requests", "Bookings"].forEach((label) => {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    });
    expect(screen.getAllByText("@jordanellis").length).toBeGreaterThan(0);
    expect(screen.queryByText("Jordan Ellis")).not.toBeInTheDocument();
    expect(screen.getAllByText("Client").length).toBeGreaterThan(0);
    expect(screen.getAllByText("@jordanellis").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "View Profile" })).toHaveAttribute("href", "/client/jordanellis");
    expect(screen.getAllByText("I am outside.").length).toBeGreaterThan(1);
    expect(screen.getByText("test cut • May 19 • Cancelled")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Book" })).toHaveAttribute("href", "/booking/new");
  });

  it("renders the shop owner inbox with owner-specific filters on the shared messaging layout", () => {
    const clientThread = buildThread({
      id: "thread-client-1",
      counterpart: {
        profileId: "profile-client",
        fullName: "Jordan Ellis",
        role: "client",
        avatarUrl: "https://cdn.bvrb3r.test/client.jpg",
        publicUsername: "jordanellis",
        publicContextLine: "Tampa, FL",
        publicProfileHref: "/client/jordanellis"
      },
      appointmentContext: null,
      lastMessage: {
        id: "message-client-owner",
        body: "Can I book with the shop?",
        messageType: "text",
        createdAt: "2026-05-19T13:35:00.000Z",
        senderName: "Jordan Ellis"
      }
    });
    useMessageThreadsQueryMock.mockReturnValue({
      data: {
        available: true,
        viewer: {
          profileId: "profile-owner",
          fullName: "BVRB3R Owner",
          role: "owner"
        },
        threads: [clientThread],
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
          profileId: "profile-owner",
          fullName: "BVRB3R Owner",
          role: "owner"
        },
        thread: buildThreadDetail(clientThread, "owner"),
        messages: [
          {
            id: "message-client-owner",
            body: "Can I book with the shop?",
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
        surface="shop"
        basePath="/dashboard/owner/messages"
        selectedThreadId="thread-client-1"
        title="Messages"
        subtitle="Client, barber, team, booking, and support conversations."
      />
    );

    expect(screen.getByTestId("messaging-inbox-shop")).toBeInTheDocument();
    ["All", "Clients", "Barbers", "Support", "Team", "Bookings"].forEach((label) => {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    });
    expect(screen.getAllByText("@jordanellis").length).toBeGreaterThan(0);
    expect(screen.queryByText("Jordan Ellis")).not.toBeInTheDocument();
    expect(screen.getAllByText("Client").length).toBeGreaterThan(0);
    expect(screen.getAllByText("@jordanellis").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "View Profile" })).toHaveAttribute("href", "/client/jordanellis");
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

    expect(screen.queryByTestId("message-thread-panel")).not.toBeInTheDocument();
    expect(screen.getByTestId("message-thread-modal")).toBeInTheDocument();
    expect(screen.getAllByText("BVRB3R Support").length).toBeGreaterThan(0);
    expect(screen.getAllByText("B").length).toBeGreaterThan(0);
    expect(screen.getAllByText("How can we help?").length).toBeGreaterThan(1);
    expect(screen.getAllByText("Support").length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: "View Profile" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Book" })).not.toBeInTheDocument();
  });
});
