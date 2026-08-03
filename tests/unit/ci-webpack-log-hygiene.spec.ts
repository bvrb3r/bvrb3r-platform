import { describe, expect, it, vi } from "vitest";

describe("CI webpack log hygiene", () => {
  it("keeps application warnings visible while silencing webpack cache infrastructure chatter", async () => {
    vi.stubEnv("VERCEL", "1");
    vi.resetModules();

    const { default: config } = await import("../../next.config");
    const webpack = config.webpack;
    expect(webpack).toBeTypeOf("function");

    const result = webpack?.(
      {
        infrastructureLogging: {
          appendOnly: true
        }
      },
      {} as never
    );

    expect(result?.infrastructureLogging).toEqual({
      appendOnly: true,
      level: "error"
    });

    vi.unstubAllEnvs();
  });
});
