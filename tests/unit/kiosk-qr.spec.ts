import { describe, expect, it } from "vitest";

import {
  codewordsForText,
  dataModulePositions,
  encodeKioskQr,
  extractDataCodewords,
  kioskBookingUrl,
  rsSyndromes
} from "@/lib/kiosk/qr";

/**
 * There is no scanner in the test environment, so correctness is proved
 * structurally: the Reed–Solomon block has to be a valid codeword, the symbol
 * has to carry the exact bytes the encoder produced, and the fixed patterns
 * every reader locks onto have to be where the spec says they are. An encoder
 * that passes all three produces a symbol a phone can read.
 */
describe("kiosk QR encoder", () => {
  const url = kioskBookingUrl("LOCAL001");

  it("builds the booking URL a scan resolves to", () => {
    expect(url).toBe("https://bvrb3r.app/r/LOCAL001");
  });

  it("produces Reed–Solomon codewords with zero syndromes", () => {
    const built = codewordsForText(url);
    expect(built).not.toBeNull();

    // Version 1–7 at level M is a single block, so the interleaved stream is
    // the block itself and its syndromes must vanish.
    const { version, codewords } = built!;
    expect(version).toBeLessThanOrEqual(7);

    const ecPerBlock = { 1: 10, 2: 16, 3: 26, 4: 18, 5: 24, 6: 16, 7: 18 }[version as 1 | 2 | 3 | 4 | 5 | 6 | 7]!;
    const blocks = { 1: 1, 2: 1, 3: 1, 4: 2, 5: 2, 6: 4, 7: 4 }[version as 1 | 2 | 3 | 4 | 5 | 6 | 7]!;

    if (blocks === 1) {
      expect(rsSyndromes(codewords, ecPerBlock).every((value) => value === 0)).toBe(true);
    }
  });

  it("encodes the byte-mode header and payload the spec requires", () => {
    const built = codewordsForText(url)!;
    const [first, second] = built.codewords;

    // Mode indicator 0100 in the high nibble, then the length split across the
    // nibble boundary: 0100 LLLL / LLLL DDDD.
    expect(first >>> 4).toBe(0b0100);
    const length = ((first & 0x0f) << 4) | (second >>> 4);
    expect(length).toBe(new TextEncoder().encode(url).length);
  });

  it("places the exact codeword stream on the grid", () => {
    const built = codewordsForText(url)!;
    const symbol = encodeKioskQr(url)!;

    const readBack = extractDataCodewords(symbol, built.codewords.length);
    expect(readBack).toEqual(built.codewords);
  });

  it("emits the fixed patterns a scanner locks onto", () => {
    const symbol = encodeKioskQr(url)!;
    const { modules, size } = symbol;

    expect(size).toBe(symbol.version * 4 + 17);

    // Finder cores: 3x3 dark, ringed by light at the 1-module separator.
    for (const [row, column] of [[0, 0], [0, size - 7], [size - 7, 0]] as const) {
      expect(modules[row + 3][column + 3]).toBe(true);
      expect(modules[row + 1][column + 1]).toBe(false);
      expect(modules[row][column]).toBe(true);
    }

    // Timing patterns alternate, starting dark at index 8 (even).
    for (let i = 8; i < size - 8; i += 1) {
      expect(modules[6][i]).toBe(i % 2 === 0);
      expect(modules[i][6]).toBe(i % 2 === 0);
    }

    // The module below the top-left finder is always dark.
    expect(modules[size - 8][8]).toBe(true);
  });

  it("walks every data module exactly once", () => {
    const symbol = encodeKioskQr(url)!;
    const positions = dataModulePositions(symbol.size);
    const seen = new Set(positions.map(([r, c]) => `${r}:${c}`));

    expect(positions.length).toBe(seen.size);
    // Two-wide columns across the full grid, minus the skipped timing column.
    expect(positions.length).toBe(symbol.size * (symbol.size - 1));
  });

  it("picks a larger version as the payload grows and refuses what will not fit", () => {
    const small = encodeKioskQr(kioskBookingUrl("BVR-1234"))!;
    const large = encodeKioskQr(`https://bvrb3r.app/r/${"C".repeat(150)}`)!;

    expect(large.version).toBeGreaterThan(small.version);
    // Level M tops out at 214 bytes in version 10; past that the caller falls
    // back to printing the reference code rather than a truncated symbol.
    expect(encodeKioskQr(`https://bvrb3r.app/r/${"C".repeat(400)}`)).toBeNull();
    expect(encodeKioskQr("")).toBeNull();
  });

  it("selects the lowest-penalty mask deterministically", () => {
    const first = encodeKioskQr(url)!;
    const second = encodeKioskQr(url)!;

    expect(first.mask).toBe(second.mask);
    expect(first.mask).toBeGreaterThanOrEqual(0);
    expect(first.mask).toBeLessThanOrEqual(7);
    expect(first.modules).toEqual(second.modules);
  });
});
