import { describe, expect, it } from "vitest";
import { hashKioskPin, isFourDigitKioskPin, verifyKioskPinHash } from "@/lib/kiosk/pin";

describe("kiosk PIN hashing", () => {
  it("accepts only 4-digit kiosk PIN values", () => {
    expect(isFourDigitKioskPin("1234")).toBe(true);
    expect(isFourDigitKioskPin("12345")).toBe(false);
    expect(isFourDigitKioskPin("abcd")).toBe(false);
  });

  it("stores a hash instead of the plain kiosk PIN", () => {
    const hash = hashKioskPin("1234", "fixed-salt");

    expect(hash).not.toBe("1234");
    expect(hash).toMatch(/^pbkdf2_sha256\$/);
    expect(verifyKioskPinHash("1234", hash)).toBe(true);
    expect(verifyKioskPinHash("0000", hash)).toBe(false);
  });
});
