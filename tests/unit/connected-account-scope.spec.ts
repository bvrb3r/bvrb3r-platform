import { describe, expect, it } from "vitest";
import {
  collectConnectedAccountLocationIds,
  resolveMembershipConnectedAccountLocationId
} from "@/lib/fintech/connected-account-scope";

describe("connected-account shop scope", () => {
  it("never sends canonical text shop IDs into the UUID location account scope", () => {
    const memberships = [{
      id: "membership-1",
      location_id: null,
      shop_id: "shop-the-bvrb3r-shop-universi-a02c68"
    }];
    const contexts = new Map([["membership-1", {
      location: null
    }]]);

    expect(collectConnectedAccountLocationIds(memberships, contexts)).toEqual([]);
  });

  it("uses only a resolved location UUID for shop connected-account lookup", () => {
    const membership = {
      id: "membership-1",
      location_id: null
    };
    const context = {
      location: { id: "67ad0d9b-4f60-44e6-a213-86f665324574" }
    };

    expect(resolveMembershipConnectedAccountLocationId(membership, context)).toBe(
      "67ad0d9b-4f60-44e6-a213-86f665324574"
    );
    expect(collectConnectedAccountLocationIds([membership], new Map([[membership.id, context]]))).toEqual([
      "67ad0d9b-4f60-44e6-a213-86f665324574"
    ]);
  });

  it("rejects a non-UUID legacy location value", () => {
    expect(resolveMembershipConnectedAccountLocationId({
      id: "membership-legacy",
      location_id: "shop-the-bvrb3r-shop-universi-a02c68"
    })).toBeNull();
  });
});
