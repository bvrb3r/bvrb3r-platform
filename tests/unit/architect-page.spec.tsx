import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makePlatformAdminUser } from "@/tests/unit/platform-admin-test-user";

const { getPlatformAdminUserMock } = vi.hoisted(() => ({
  getPlatformAdminUserMock: vi.fn()
}));

vi.mock("@/lib/auth/guards", () => ({
  getPlatformAdminUser: getPlatformAdminUserMock
}));

vi.mock("@/components/architect/mission-control/mission-control", () => ({
  ArchitectMissionControl: () => <div data-testid="architect-mission-control">Mission Control</div>
}));

import ArchitectPage from "@/app/(platform)/architect/page";

describe("architect page", () => {
  beforeEach(() => {
    getPlatformAdminUserMock.mockReset();
  });

  it("renders Mission Control for platform admins", async () => {
    getPlatformAdminUserMock.mockResolvedValue(makePlatformAdminUser());

    render(await ArchitectPage());

    expect(getPlatformAdminUserMock).toHaveBeenCalled();
    expect(screen.getByTestId("architect-mission-control")).toHaveTextContent("Mission Control");
  });
});
