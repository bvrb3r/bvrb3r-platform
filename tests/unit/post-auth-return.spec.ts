import { describe, expect, it } from "vitest";
import {
  normalizeSafePostAuthReturnPath,
  resolveSafePostAuthReturnPath
} from "@/lib/auth/post-auth-return";
import type { UserAccount } from "@/types/domain";

const client = {
  id: "user-client",
  email: "client@example.test",
  name: "Client",
  role: "client_user"
} as UserAccount;

const barber = {
  id: "user-barber",
  email: "barber@example.test",
  name: "Barber",
  role: "barber_user"
} as UserAccount;

describe("post-auth public conversion return paths", () => {
  it("preserves barber, service, time, and source intent", () => {
    const path = "/booking/barber-live?service=fade&time=2026-07-12T14%3A00%3A00.000Z&source=marketplace";
    expect(normalizeSafePostAuthReturnPath(path)).toBe(path);
    expect(resolveSafePostAuthReturnPath(client, path)).toBe(path);
  });

  it("preserves public Barber and Shop profile conversion paths", () => {
    expect(resolveSafePostAuthReturnPath(client, "/barbers/phillip?source=culture")).toBe("/barbers/phillip?source=culture");
    expect(resolveSafePostAuthReturnPath(barber, "/shops/the-bvrb3r-shop?source=search")).toBe("/shops/the-bvrb3r-shop?source=search");
  });

  it("rejects external, protocol-relative, auth-loop, and newline redirects", () => {
    expect(normalizeSafePostAuthReturnPath("https://evil.example/steal")).toBeNull();
    expect(normalizeSafePostAuthReturnPath("//evil.example/steal")).toBeNull();
    expect(normalizeSafePostAuthReturnPath("/login?redirect=/booking/barber-live")).toBeNull();
    expect(normalizeSafePostAuthReturnPath("/booking/barber-live\r\nLocation:https://evil.example")).toBeNull();
  });

  it("continues to deny cross-role dashboard escalation", () => {
    expect(resolveSafePostAuthReturnPath(client, "/dashboard/owner/money")).toBeNull();
    expect(resolveSafePostAuthReturnPath(barber, "/dashboard/client/home")).toBeNull();
  });
});
