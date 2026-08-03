import { readFileSync } from "node:fs";
import { join } from "node:path";

const primerConsumers = [
  ["components/engagement/client-engagement-panel.tsx", "booking"],
  ["components/engagement/barber-engagement-panel.tsx", "chair"],
  ["components/engagement/owner-intelligence-panel.tsx", "owner"],
  ["components/notifications/push-permission-screen.tsx", "notifications"]
] as const;

const read = (relativePath: string) => readFileSync(join(process.cwd(), relativePath), "utf8");

describe("Product PR31 push permission contract", () => {
  it("uses the three canonical concrete value rows", () => {
    const source = read("components/pwa/push-permission-primer.tsx");
    expect(source).toContain("Appointment reminders");
    expect(source).toContain("Your barber says you’re up");
    expect(source).toContain("Payout landed");
  });

  it.each(primerConsumers)("routes %s through the shared %s primer", (relativePath, intent) => {
    const source = readFileSync(join(process.cwd(), relativePath), "utf8");

    expect(source).toContain(`requestPushPrimer("${intent}")`);
    expect(source).not.toContain(".enablePush(");
    expect(source).not.toContain("Notification.requestPermission(");
  });

  it("keeps the browser permission call owned by the PWA provider", () => {
    const provider = readFileSync(join(process.cwd(), "components/pwa/pwa-provider.tsx"), "utf8");
    const permissionCalls = provider.match(/Notification\.requestPermission\(/g) ?? [];

    expect(permissionCalls).toHaveLength(1);
    expect(provider).toContain("activatePushFromPrimer");
    expect(provider).not.toContain("showPushPrompt");
  });

  it("opens the primer after signed-in booking and waitlist value events", () => {
    const source = read("components/booking/booking-form.tsx");
    expect(source.match(/requestPushPrimer\("booking"\)/g)).toHaveLength(2);
    expect(source).toContain("setConfirmationId");
    expect(source).toContain("Waitlist joined");
  });
});
