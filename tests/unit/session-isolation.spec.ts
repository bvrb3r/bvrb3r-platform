import { beforeEach, describe, expect, it } from "vitest";
import {
  clearBrowserAccountState,
  isSessionIsolationCookieName,
  isSessionIsolationStorageKey
} from "@/lib/auth/session-isolation";

describe("session isolation helpers", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    document.cookie.split(";").forEach((cookie) => {
      const name = cookie.split("=")[0]?.trim();
      if (name) {
        document.cookie = `${name}=; Max-Age=0; path=/`;
      }
    });
  });

  it("classifies Supabase and BVRB3R auth artifacts as session-scoped", () => {
    expect(isSessionIsolationStorageKey("sb-project-auth-token")).toBe(true);
    expect(isSessionIsolationStorageKey("bvrb3r-booking-draft:v1")).toBe(true);
    expect(isSessionIsolationStorageKey("react-query-owner-dashboard")).toBe(true);
    expect(isSessionIsolationStorageKey("theme")).toBe(false);
    expect(isSessionIsolationCookieName("sb-project-auth-token.0")).toBe(true);
    expect(isSessionIsolationCookieName("bvrb3r-demo-email")).toBe(true);
  });

  it("clears previous-user browser state before a shared-device login can continue", () => {
    window.localStorage.setItem("sb-project-auth-token", "owner-token");
    window.localStorage.setItem("bvrb3r-booking-draft:v1", JSON.stringify({ owner: true }));
    window.localStorage.setItem("theme", "dark");
    window.sessionStorage.setItem("bvrb3r-marketplace-cta:owner", "1");
    document.cookie = "sb-project-auth-token=owner-token; path=/";
    document.cookie = "bvrb3r-demo-email=owner@bvrb3r.demo; path=/";

    const result = clearBrowserAccountState();

    expect(result.localStorageKeys).toEqual(expect.arrayContaining([
      "sb-project-auth-token",
      "bvrb3r-booking-draft:v1"
    ]));
    expect(result.sessionStorageKeys).toContain("bvrb3r-marketplace-cta:owner");
    expect(window.localStorage.getItem("sb-project-auth-token")).toBeNull();
    expect(window.localStorage.getItem("bvrb3r-booking-draft:v1")).toBeNull();
    expect(window.localStorage.getItem("theme")).toBe("dark");
    expect(window.sessionStorage.getItem("bvrb3r-marketplace-cta:owner")).toBeNull();
    expect(document.cookie).not.toContain("sb-project-auth-token");
    expect(document.cookie).not.toContain("bvrb3r-demo-email");
  });
});
