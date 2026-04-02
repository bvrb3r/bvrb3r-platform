import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveDemoUser } from "@/lib/auth/demo-auth";

const {
  getPlatformAdminUserMock,
  getPlatformAdminConsolePayloadMock
} = vi.hoisted(() => ({
  getPlatformAdminUserMock: vi.fn(),
  getPlatformAdminConsolePayloadMock: vi.fn()
}));

vi.mock("@/lib/auth/guards", () => ({
  getPlatformAdminUser: getPlatformAdminUserMock
}));

vi.mock("@/lib/platform-admin/service", () => ({
  getPlatformAdminConsolePayload: getPlatformAdminConsolePayloadMock
}));

vi.mock("@/components/operations/architect-console", () => ({
  ArchitectConsole: ({ initialData }: { initialData: { actorName: string; warnings?: string[] } }) => (
    <div data-testid="architect-console-stub">
      <span>{initialData.actorName}</span>
      <span data-testid="architect-warning-count">{initialData.warnings?.length ?? 0}</span>
    </div>
  )
}));

import ArchitectPage from "@/app/(platform)/architect/page";

describe("architect page", () => {
  beforeEach(() => {
    getPlatformAdminUserMock.mockReset();
    getPlatformAdminConsolePayloadMock.mockReset();
  });

  it("renders the hidden founder console with server-loaded payload", async () => {
    getPlatformAdminUserMock.mockResolvedValue(resolveDemoUser("architect@bvrb3r.demo"));
    getPlatformAdminConsolePayloadMock.mockResolvedValue({
      actorName: "Architect",
      overview: {},
      users: [],
      shops: [],
      moneyRisk: {},
      support: [],
      controls: { shops: [], release: { readyCount: 0, attentionCount: 0 } },
      auditLog: [],
      warnings: []
    });

    render(await ArchitectPage());

    expect(screen.getByTestId("architect-console-stub")).toHaveTextContent("Architect");
    expect(screen.getByTestId("architect-warning-count")).toHaveTextContent("0");
  });

  it("falls back safely when the architect payload resolves to null", async () => {
    const founder = resolveDemoUser("architect@bvrb3r.demo");
    getPlatformAdminUserMock.mockResolvedValue(founder);
    getPlatformAdminConsolePayloadMock.mockResolvedValue(null);

    render(await ArchitectPage());

    expect(screen.getByTestId("architect-console-stub")).toHaveTextContent(founder.name);
    expect(screen.getByTestId("architect-warning-count")).toHaveTextContent("1");
  });

  it("renders a degraded founder payload instead of crashing on raw data-source errors", async () => {
    const founder = resolveDemoUser("architect@bvrb3r.demo");
    getPlatformAdminUserMock.mockResolvedValue(founder);
    getPlatformAdminConsolePayloadMock.mockRejectedValue({
      code: "42P01",
      details: null,
      hint: null,
      message: "relation \"platform_admin_audit_logs\" does not exist"
    });

    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    render(await ArchitectPage());

    expect(screen.getByTestId("architect-console-stub")).toHaveTextContent(founder.name);
    expect(screen.getByTestId("architect-warning-count")).toHaveTextContent("1");
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });
});
