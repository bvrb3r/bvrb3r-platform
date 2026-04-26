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
});
