import { describe, expect, it } from "vitest";
import { getClientFacingBarberName } from "@/lib/marketplace/client-facing";

describe("client-facing barber display labels", () => {
  it("uses the real display name when the public handle is an internal barber reference", () => {
    expect(getClientFacingBarberName({
      username: "barber-43b3cda2",
      barberName: "Phillip mcgee"
    })).toBe("Phillip mcgee");
  });

  it("keeps real public handles when they are not generated references", () => {
    expect(getClientFacingBarberName({
      username: "philforsure",
      barberName: "Phillip mcgee"
    })).toBe("philforsure");
  });
});
