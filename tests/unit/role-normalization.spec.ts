import { describe, expect, it } from "vitest";
import {
  isBarberAccountRole,
  isRoleAllowed,
  normalizeAccountRole,
  normalizeBarberSubtype,
  subtypeFromLegacyBarberRole
} from "@/lib/auth/roles";

describe("barber account role normalization", () => {
  it("normalizes legacy barber account roles to the barber access role", () => {
    expect(normalizeAccountRole("booth_rent_barber")).toBe("barber");
    expect(normalizeAccountRole("commission_barber")).toBe("barber");
    expect(normalizeAccountRole("barber")).toBe("barber");
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
    expect(isBarberAccountRole("barber")).toBe(true);
    expect(isRoleAllowed("barber", ["booth_rent_barber"])).toBe(true);
    expect(isRoleAllowed("booth_rent_barber", ["barber"])).toBe(true);
    expect(isRoleAllowed("commission_barber", ["barber"])).toBe(true);
  });
});
