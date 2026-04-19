import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { POST as postSignupIntent } from "@/app/api/auth/signup-intent/route";
import { SIGNUP_ROLE_INTENT_COOKIE } from "@/lib/auth/signup-role-intent";

describe("signup intent route", () => {
  it("stores a valid signup role intent in an http-only cookie", async () => {
    const response = await postSignupIntent(new NextRequest("https://bvrb3r.app/api/auth/signup-intent", {
      method: "POST",
      body: JSON.stringify({ role: "shop_owner" })
    }));

    expect(response.status).toBe(200);
    expect(response.cookies.get(SIGNUP_ROLE_INTENT_COOKIE)?.value).toBe("shop_owner");
  });

  it("rejects invalid role intent values", async () => {
    const response = await postSignupIntent(new NextRequest("https://bvrb3r.app/api/auth/signup-intent", {
      method: "POST",
      body: JSON.stringify({ role: "platform_admin" })
    }));

    expect(response.status).toBe(400);
  });
});
