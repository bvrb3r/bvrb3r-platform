import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseAdminClient } = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn()
}));

vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient }));

import {
  claimMatchingClientBridgeHistory,
  ClientBridgeServiceError
} from "@/lib/clientbridge/service";

describe("ClientBridge guest-history setup", () => {
  beforeEach(() => {
    createSupabaseAdminClient.mockReset();
  });

  it("rejects browser identity that is not an authenticated client account", async () => {
    const rpc = vi.fn();
    createSupabaseAdminClient.mockReturnValue({ rpc });

    await expect(claimMatchingClientBridgeHistory({ id: "guest-user", role: "client_user" }))
      .rejects.toBeInstanceOf(ClientBridgeServiceError);
    await expect(claimMatchingClientBridgeHistory({ id: "00000000-0000-4000-8000-000000000001", role: "barber_user" }))
      .rejects.toBeInstanceOf(ClientBridgeServiceError);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("claims every matching canonical record through the service-only RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        status: "claimed",
        targetClientId: "client-1",
        invitationsClaimed: 2,
        sourceClientsMerged: 1,
        appointmentsMerged: 3,
        queueEntriesMerged: 2,
        chairSyncAppointmentsMerged: 1,
        consentEventsMerged: 4
      },
      error: null
    });
    createSupabaseAdminClient.mockReturnValue({ rpc });

    await expect(claimMatchingClientBridgeHistory({
      id: "00000000-0000-4000-8000-000000000002",
      role: "client_user"
    })).resolves.toMatchObject({
      status: "claimed",
      targetClientId: "client-1",
      invitationsClaimed: 2,
      appointmentsMerged: 3,
      queueEntriesMerged: 2
    });
    expect(rpc).toHaveBeenCalledWith("pr32_claim_matching_clientbridge_history", {
      p_user_id: "00000000-0000-4000-8000-000000000002"
    });
  });

  it("returns the idempotent already-resolved state with zero merge counts", async () => {
    createSupabaseAdminClient.mockReturnValue({
      rpc: vi.fn().mockResolvedValue({
        data: {
          status: "already_resolved",
          targetClientId: "client-1",
          invitationsClaimed: 0,
          sourceClientsMerged: 0,
          appointmentsMerged: 0,
          queueEntriesMerged: 0,
          chairSyncAppointmentsMerged: 0,
          consentEventsMerged: 0
        },
        error: null
      })
    });

    await expect(claimMatchingClientBridgeHistory({
      id: "00000000-0000-4000-8000-000000000002",
      role: "client_user"
    })).resolves.toEqual({
      status: "already_resolved",
      targetClientId: "client-1",
      invitationsClaimed: 0,
      sourceClientsMerged: 0,
      appointmentsMerged: 0,
      queueEntriesMerged: 0,
      chairSyncAppointmentsMerged: 0,
      consentEventsMerged: 0
    });
  });
});
