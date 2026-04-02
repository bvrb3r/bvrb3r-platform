import { NextRequest } from "next/server";
import { DEMO_SESSION_COOKIE } from "@/lib/auth/demo-auth";
import { KIOSK_DEVICE_COOKIE } from "@/lib/kiosk/device";
import { GET } from "@/app/auth/demo/route";
import { POST } from "@/app/auth/demo/route";

describe("demo session route", () => {
  it.each([
    ["client@bvrb3r.demo", "/dashboard/client"],
    ["lux@bvrb3r.demo", "/dashboard/barber"],
    ["blaze@bvrb3r.demo", "/dashboard/barber"],
    ["fade@bvrb3r.demo", "/dashboard/barber"],
    ["wave@bvrb3r.demo", "/dashboard/manager"],
    ["frontdesk@bvrb3r.demo", "/dashboard/front-desk"],
    ["manager@bvrb3r.demo", "/dashboard/manager"],
    ["owner@bvrb3r.demo", "/dashboard/owner"]
  ])("redirects %s to %s and persists the demo cookie", async (email, route) => {
    const request = new NextRequest(`https://bvrb3r.demo/auth/demo?email=${encodeURIComponent(email)}`);
    const response = await GET(request);

    expect(response.headers.get("location")).toBe(`https://bvrb3r.demo${route}`);
    expect(response.cookies.get(DEMO_SESSION_COOKIE)?.value).toBe(email);
  });

  it("clears the kiosk device cookie when staff unlocks from sign-in", async () => {
    const response = await POST(new NextRequest("https://bvrb3r.demo/auth/demo", {
      method: "POST",
      body: JSON.stringify({
        email: "frontdesk@bvrb3r.demo",
        unlockKiosk: "loc-ybor"
      })
    }));
    const body = await response.json();

    expect(body.redirectTo).toBe("/dashboard/front-desk");
    expect(response.cookies.get(DEMO_SESSION_COOKIE)?.value).toBe("frontdesk@bvrb3r.demo");
    expect(response.cookies.get(KIOSK_DEVICE_COOKIE)?.value).toBe("");
  });
});
