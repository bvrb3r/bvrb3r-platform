import { describe, expect, it } from "vitest";
import { isThreadUnreadForViewer } from "@/lib/messages/service";

describe("message thread read state", () => {
  it("marks incoming messages unread when the participant has never opened the thread", () => {
    expect(isThreadUnreadForViewer({
      currentProfileId: "profile-client",
      latestMessage: {
        sender_profile_id: "profile-barber",
        created_at: "2026-05-19T13:30:00.000Z"
      },
      lastReadAt: null
    })).toBe(true);
  });

  it("does not mark messages from the current user unread", () => {
    expect(isThreadUnreadForViewer({
      currentProfileId: "profile-client",
      latestMessage: {
        sender_profile_id: "profile-client",
        created_at: "2026-05-19T13:30:00.000Z"
      },
      lastReadAt: null
    })).toBe(false);
  });

  it("does not mark a thread unread when last_read_at is after the latest incoming message", () => {
    expect(isThreadUnreadForViewer({
      currentProfileId: "profile-client",
      latestMessage: {
        sender_profile_id: "profile-barber",
        created_at: "2026-05-19T13:30:00.000Z"
      },
      lastReadAt: "2026-05-19T13:31:00.000Z"
    })).toBe(false);
  });

  it("marks a thread unread when last_read_at is before the latest incoming message", () => {
    expect(isThreadUnreadForViewer({
      currentProfileId: "profile-client",
      latestMessage: {
        sender_profile_id: "profile-barber",
        created_at: "2026-05-19T13:30:00.000Z"
      },
      lastReadAt: "2026-05-19T13:29:00.000Z"
    })).toBe(true);
  });
});
