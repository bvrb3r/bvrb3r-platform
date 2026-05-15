import { describe, expect, it } from "vitest";
import {
  isClientRole,
  isShopOwnerRole,
  isBarberAccountRole,
  isRoleAllowed,
  getCanonicalAccountRole,
  normalizeAccountRole,
  normalizeBarberSubtype,
  subtypeFromLegacyBarberRole
} from "@/lib/auth/roles";

describe("barber account role normalization", () => {
  it("normalizes legacy account roles to master-truth identity roles", () => {
    expect(getCanonicalAccountRole("client")).toBe("client_user");
    expect(normalizeAccountRole("client_user")).toBe("client_user");
    expect(normalizeAccountRole("booth_rent_barber")).toBe("barber_user");
    expect(normalizeAccountRole("commission_barber")).toBe("barber_user");
    expect(normalizeAccountRole("freelance_barber")).toBe("barber_user");
    expect(normalizeAccountRole("barber")).toBe("barber_user");
    expect(normalizeAccountRole("barber_user")).toBe("barber_user");
    expect(normalizeAccountRole("owner")).toBe("shop_owner_user");
    expect(normalizeAccountRole("shop_owner")).toBe("shop_owner_user");
    expect(normalizeAccountRole("shop_owner_user")).toBe("shop_owner_user");
  });

  it("keeps business relationship subtype separate from account role", () => {
    expect(normalizeBarberSubtype("blueprint")).toBe("booth_rent");
    expect(normalizeBarberSubtype("booth_rent")).toBe("booth_rent");
    expect(normalizeBarberSubtype("commission")).toBe("commission");
    expect(normalizeBarberSubtype("freelance")).toBe("freelance");
    expect(subtypeFromLegacyBarberRole("booth_rent_barber")).toBe("booth_rent");
    expect(subtypeFromLegacyBarberRole("commission_barber")).toBe("commission");
  });

  it("allows canonical barber users through legacy barber gates while data migrates", () => {
    expect(isClientRole("client_user")).toBe(true);
    expect(isClientRole("client")).toBe(true);
    expect(isShopOwnerRole("shop_owner_user")).toBe(true);
    expect(isShopOwnerRole("owner")).toBe(true);
    expect(isBarberAccountRole("barber_user")).toBe(true);
    expect(isBarberAccountRole("barber")).toBe(true);
    expect(isRoleAllowed("barber_user", ["booth_rent_barber"])).toBe(true);
    expect(isRoleAllowed("booth_rent_barber", ["barber_user"])).toBe(true);
    expect(isRoleAllowed("commission_barber", ["barber_user"])).toBe(true);
    expect(isRoleAllowed("shop_owner_user", ["owner"])).toBe(true);
    expect(isRoleAllowed("client_user", ["client"])).toBe(true);
  });
});
