import { describe, expect, it, vi } from "vitest";
import { toPublicMediaUrl } from "@/lib/profile/public-media-url";

describe("toPublicMediaUrl", () => {
  it("prefers the canonical public image URL when present", () => {
    const client = {
      storage: {
        from: vi.fn(() => ({
          getPublicUrl: vi.fn(() => ({ data: { publicUrl: "https://cdn.example.com/from-path.png" } }))
        }))
      }
    };

    expect(toPublicMediaUrl(client, "profiles/shops/shop/profile/logo.png", "https://cdn.example.com/shop-logo.png"))
      .toBe("https://cdn.example.com/shop-logo.png");
    expect(client.storage.from).not.toHaveBeenCalled();
  });

  it("converts a Supabase storage path into a public URL", () => {
    const getPublicUrl = vi.fn(() => ({ data: { publicUrl: "https://cdn.example.com/from-path.png" } }));
    const client = {
      storage: {
        from: vi.fn(() => ({ getPublicUrl }))
      }
    };

    expect(toPublicMediaUrl(client, "profiles/shops/shop/profile/logo.png", null))
      .toBe("https://cdn.example.com/from-path.png");
    expect(client.storage.from).toHaveBeenCalledWith("bvrb3r-media");
    expect(getPublicUrl).toHaveBeenCalledWith("profiles/shops/shop/profile/logo.png");
  });
});
