import manifest from "@/app/manifest";

describe("pwa manifest", () => {
  it("exposes installable standalone metadata", () => {
    const result = manifest();

    expect(result.name).toBe("BVRB3R Platform");
    expect(result.display).toBe("standalone");
    expect(result.theme_color).toBe("#050505");
    expect(result.icons?.some((icon) => icon.src === "/icons/pwa-192.png")).toBe(true);
    expect(result.icons?.some((icon) => icon.purpose === "maskable")).toBe(true);
    expect(result.shortcuts?.map((shortcut) => shortcut.url)).toEqual(expect.arrayContaining(["/booking/new", "/discover", "/login"]));
    expect(result.related_applications?.some((app) => app?.platform === "play")).toBe(true);
  });
});
