/**
 * Minimal QR encoder for the kiosk confirmation screen.
 *
 * The celebration screen shows a scannable code so a client can keep their
 * booking without an account. That needs a real QR symbol — a decorative
 * lookalike is worse than nothing, because a client scans it, gets nothing,
 * and loses the booking they thought they saved.
 *
 * No QR dependency exists in this repo and none is being added, so this is a
 * self-contained byte-mode encoder at error-correction level M, versions 1–10.
 * That covers every `https://bvrb3r.app/r/{confirmationCode}` URL with room to
 * spare. Everything here is the published QR spec: GF(256) Reed–Solomon,
 * the standard function patterns, all eight masks, and the four penalty rules.
 *
 * `extractDataCodewords` reverses the placement and masking steps. It exists so
 * the tests can read the symbol back out and prove the bits on the grid are the
 * bits that went in — the only way to verify an encoder without a scanner.
 */

export const QR_ERROR_CORRECTION_LEVEL = "M" as const;

/** `[ecCodewordsPerBlock, group1Blocks, group1DataCodewords, group2Blocks, group2DataCodewords]` */
const EC_BLOCK_TABLE_M: Record<number, [number, number, number, number, number]> = {
  1: [10, 1, 16, 0, 0],
  2: [16, 1, 28, 0, 0],
  3: [26, 1, 44, 0, 0],
  4: [18, 2, 32, 0, 0],
  5: [24, 2, 43, 0, 0],
  6: [16, 4, 27, 0, 0],
  7: [18, 4, 31, 0, 0],
  8: [22, 2, 38, 2, 39],
  9: [22, 3, 36, 2, 37],
  10: [26, 4, 43, 1, 44]
};

const ALIGNMENT_CENTERS: Record<number, number[]> = {
  1: [],
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
  5: [6, 30],
  6: [6, 34],
  7: [6, 22, 38],
  8: [6, 24, 42],
  9: [6, 26, 46],
  10: [6, 28, 50]
};

const MAX_VERSION = 10;

// ---------------------------------------------------------------------------
// GF(256) arithmetic, primitive polynomial 0x11D
// ---------------------------------------------------------------------------

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);

(() => {
  let value = 1;
  for (let i = 0; i < 255; i += 1) {
    EXP[i] = value;
    LOG[value] = i;
    value <<= 1;
    if (value & 0x100) {
      value ^= 0x11d;
    }
  }
  for (let i = 255; i < 512; i += 1) {
    EXP[i] = EXP[i - 255];
  }
})();

function gfMultiply(a: number, b: number) {
  if (a === 0 || b === 0) {
    return 0;
  }
  return EXP[LOG[a] + LOG[b]];
}

/** Generator polynomial for `degree` error-correction codewords. */
function rsGeneratorPolynomial(degree: number) {
  let poly = [1];
  for (let i = 0; i < degree; i += 1) {
    const next = new Array<number>(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j += 1) {
      next[j] ^= gfMultiply(poly[j], 1);
      next[j + 1] ^= gfMultiply(poly[j], EXP[i]);
    }
    poly = next;
  }
  return poly;
}

function rsEncode(data: number[], ecCount: number) {
  const generator = rsGeneratorPolynomial(ecCount);
  const remainder = new Array<number>(ecCount).fill(0);

  for (const byte of data) {
    const factor = byte ^ remainder[0];
    remainder.shift();
    remainder.push(0);
    if (factor !== 0) {
      for (let i = 0; i < ecCount; i += 1) {
        remainder[i] ^= gfMultiply(generator[i + 1], factor);
      }
    }
  }

  return remainder;
}

/**
 * A well-formed Reed–Solomon codeword evaluates to zero at every root of the
 * generator. The tests use this as an independent check on `rsEncode`.
 */
export function rsSyndromes(codewords: number[], ecCount: number) {
  const syndromes: number[] = [];
  for (let i = 0; i < ecCount; i += 1) {
    let value = 0;
    for (const byte of codewords) {
      value = gfMultiply(value, EXP[i]) ^ byte;
    }
    syndromes.push(value);
  }
  return syndromes;
}

// ---------------------------------------------------------------------------
// Bit stream
// ---------------------------------------------------------------------------

class BitBuffer {
  private bits: number[] = [];

  push(value: number, length: number) {
    for (let i = length - 1; i >= 0; i -= 1) {
      this.bits.push((value >>> i) & 1);
    }
  }

  get length() {
    return this.bits.length;
  }

  toCodewords() {
    const bytes: number[] = [];
    for (let i = 0; i < this.bits.length; i += 8) {
      let byte = 0;
      for (let j = 0; j < 8; j += 1) {
        byte = (byte << 1) | (this.bits[i + j] ?? 0);
      }
      bytes.push(byte);
    }
    return bytes;
  }
}

function totalDataCodewords(version: number) {
  const [, g1Blocks, g1Data, g2Blocks, g2Data] = EC_BLOCK_TABLE_M[version];
  return g1Blocks * g1Data + g2Blocks * g2Data;
}

function pickVersion(byteLength: number) {
  for (let version = 1; version <= MAX_VERSION; version += 1) {
    // 4-bit mode indicator + 8- or 16-bit character count.
    const headerBits = 4 + (version >= 10 ? 16 : 8);
    const capacity = Math.floor((totalDataCodewords(version) * 8 - headerBits) / 8);
    if (byteLength <= capacity) {
      return version;
    }
  }
  return null;
}

function buildCodewords(bytes: number[], version: number) {
  const [ecPerBlock, g1Blocks, g1Data, g2Blocks, g2Data] = EC_BLOCK_TABLE_M[version];
  const capacity = totalDataCodewords(version);

  const buffer = new BitBuffer();
  buffer.push(0b0100, 4);
  buffer.push(bytes.length, version >= 10 ? 16 : 8);
  for (const byte of bytes) {
    buffer.push(byte, 8);
  }

  // Terminator: up to four zero bits, then zero-fill to a byte boundary.
  const remainingBits = capacity * 8 - buffer.length;
  buffer.push(0, Math.min(4, Math.max(0, remainingBits)));
  if (buffer.length % 8 !== 0) {
    buffer.push(0, 8 - (buffer.length % 8));
  }

  const data = buffer.toCodewords();
  const PAD = [0xec, 0x11];
  let padIndex = 0;
  while (data.length < capacity) {
    data.push(PAD[padIndex % 2]);
    padIndex += 1;
  }

  // Split into blocks, error-correct each, then interleave.
  const blocks: number[][] = [];
  const ecBlocks: number[][] = [];
  let offset = 0;
  for (let i = 0; i < g1Blocks; i += 1) {
    const block = data.slice(offset, offset + g1Data);
    offset += g1Data;
    blocks.push(block);
    ecBlocks.push(rsEncode(block, ecPerBlock));
  }
  for (let i = 0; i < g2Blocks; i += 1) {
    const block = data.slice(offset, offset + g2Data);
    offset += g2Data;
    blocks.push(block);
    ecBlocks.push(rsEncode(block, ecPerBlock));
  }

  const interleaved: number[] = [];
  const maxDataLength = Math.max(g1Data, g2Blocks ? g2Data : 0);
  for (let i = 0; i < maxDataLength; i += 1) {
    for (const block of blocks) {
      if (i < block.length) {
        interleaved.push(block[i]);
      }
    }
  }
  for (let i = 0; i < ecPerBlock; i += 1) {
    for (const block of ecBlocks) {
      interleaved.push(block[i]);
    }
  }

  return interleaved;
}

// ---------------------------------------------------------------------------
// Matrix
// ---------------------------------------------------------------------------

type Grid = {
  size: number;
  modules: (boolean | null)[][];
  reserved: boolean[][];
};

function createGrid(version: number): Grid {
  const size = version * 4 + 17;
  return {
    size,
    modules: Array.from({ length: size }, () => new Array<boolean | null>(size).fill(null)),
    reserved: Array.from({ length: size }, () => new Array<boolean>(size).fill(false))
  };
}

function setFunctionModule(grid: Grid, row: number, column: number, dark: boolean) {
  grid.modules[row][column] = dark;
  grid.reserved[row][column] = true;
}

function placeFinder(grid: Grid, row: number, column: number) {
  for (let r = -1; r <= 7; r += 1) {
    for (let c = -1; c <= 7; c += 1) {
      const rr = row + r;
      const cc = column + c;
      if (rr < 0 || rr >= grid.size || cc < 0 || cc >= grid.size) {
        continue;
      }
      const inRing = (r >= 0 && r <= 6 && (c === 0 || c === 6)) || (c >= 0 && c <= 6 && (r === 0 || r === 6));
      const inCore = r >= 2 && r <= 4 && c >= 2 && c <= 4;
      setFunctionModule(grid, rr, cc, inRing || inCore);
    }
  }
}

function placeAlignment(grid: Grid, version: number) {
  const centers = ALIGNMENT_CENTERS[version];
  for (const row of centers) {
    for (const column of centers) {
      // The three finder corners already own their alignment slots.
      const nearFinder =
        (row === 6 && column === 6) ||
        (row === 6 && column === grid.size - 7) ||
        (row === grid.size - 7 && column === 6);
      if (nearFinder) {
        continue;
      }
      for (let r = -2; r <= 2; r += 1) {
        for (let c = -2; c <= 2; c += 1) {
          const dark = Math.max(Math.abs(r), Math.abs(c)) !== 1;
          setFunctionModule(grid, row + r, column + c, dark);
        }
      }
    }
  }
}

function placeTiming(grid: Grid) {
  for (let i = 8; i < grid.size - 8; i += 1) {
    const dark = i % 2 === 0;
    setFunctionModule(grid, 6, i, dark);
    setFunctionModule(grid, i, 6, dark);
  }
}

function reserveFormatAreas(grid: Grid, version: number) {
  for (let i = 0; i < 9; i += 1) {
    if (!grid.reserved[8][i]) {
      setFunctionModule(grid, 8, i, false);
    }
    if (!grid.reserved[i][8]) {
      setFunctionModule(grid, i, 8, false);
    }
  }
  for (let i = 0; i < 8; i += 1) {
    if (!grid.reserved[8][grid.size - 1 - i]) {
      setFunctionModule(grid, 8, grid.size - 1 - i, false);
    }
    if (!grid.reserved[grid.size - 1 - i][8]) {
      setFunctionModule(grid, grid.size - 1 - i, 8, false);
    }
  }
  // The always-dark module below the top-left finder.
  setFunctionModule(grid, grid.size - 8, 8, true);

  if (version >= 7) {
    for (let i = 0; i < 18; i += 1) {
      const row = Math.floor(i / 3);
      const column = grid.size - 11 + (i % 3);
      setFunctionModule(grid, row, column, false);
      setFunctionModule(grid, column, row, false);
    }
  }
}

/**
 * The zigzag data path: two-module-wide columns walked right to left,
 * alternating upward and downward, skipping the vertical timing column.
 */
export function dataModulePositions(size: number) {
  const positions: Array<[number, number]> = [];
  let upward = true;

  for (let right = size - 1; right >= 1; right -= 2) {
    const columnRight = right <= 6 ? right - 1 : right;
    for (let step = 0; step < size; step += 1) {
      const row = upward ? size - 1 - step : step;
      for (let offset = 0; offset < 2; offset += 1) {
        positions.push([row, columnRight - offset]);
      }
    }
    upward = !upward;
  }

  return positions;
}

const MASKS: Array<(row: number, column: number) => boolean> = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (_r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0
];

function placeData(grid: Grid, codewords: number[]) {
  const positions = dataModulePositions(grid.size);
  let bitIndex = 0;

  for (const [row, column] of positions) {
    if (row < 0 || column < 0 || row >= grid.size || column >= grid.size) {
      continue;
    }
    if (grid.reserved[row][column]) {
      continue;
    }
    const byte = codewords[bitIndex >> 3];
    const bit = byte === undefined ? 0 : (byte >>> (7 - (bitIndex & 7))) & 1;
    grid.modules[row][column] = bit === 1;
    bitIndex += 1;
  }
}

function applyMask(grid: Grid, maskId: number) {
  const mask = MASKS[maskId];
  for (let row = 0; row < grid.size; row += 1) {
    for (let column = 0; column < grid.size; column += 1) {
      if (grid.reserved[row][column]) {
        continue;
      }
      if (mask(row, column)) {
        grid.modules[row][column] = !grid.modules[row][column];
      }
    }
  }
}

function formatBits(maskId: number) {
  // Level M is `00`; the five data bits are the level followed by the mask id.
  const data = (0b00 << 3) | maskId;
  let bch = data << 10;
  for (let i = 14; i >= 10; i -= 1) {
    if ((bch >>> i) & 1) {
      bch ^= 0b10100110111 << (i - 10);
    }
  }
  return ((data << 10) | bch) ^ 0b101010000010010;
}

function placeFormat(grid: Grid, maskId: number) {
  const bits = formatBits(maskId);
  const read = (index: number) => ((bits >>> index) & 1) === 1;

  for (let i = 0; i <= 5; i += 1) {
    setFunctionModule(grid, 8, i, read(i));
  }
  setFunctionModule(grid, 8, 7, read(6));
  setFunctionModule(grid, 8, 8, read(7));
  setFunctionModule(grid, 7, 8, read(8));
  for (let i = 9; i <= 14; i += 1) {
    setFunctionModule(grid, 14 - i, 8, read(i));
  }

  for (let i = 0; i <= 7; i += 1) {
    setFunctionModule(grid, grid.size - 1 - i, 8, read(i));
  }
  for (let i = 8; i <= 14; i += 1) {
    setFunctionModule(grid, 8, grid.size - 15 + i, read(i));
  }
  setFunctionModule(grid, grid.size - 8, 8, true);
}

function versionBits(version: number) {
  let bch = version << 12;
  for (let i = 17; i >= 12; i -= 1) {
    if ((bch >>> i) & 1) {
      bch ^= 0b1111100100101 << (i - 12);
    }
  }
  return (version << 12) | bch;
}

function placeVersion(grid: Grid, version: number) {
  if (version < 7) {
    return;
  }
  const bits = versionBits(version);
  for (let i = 0; i < 18; i += 1) {
    const dark = ((bits >>> i) & 1) === 1;
    const row = Math.floor(i / 3);
    const column = grid.size - 11 + (i % 3);
    setFunctionModule(grid, row, column, dark);
    setFunctionModule(grid, column, row, dark);
  }
}

function penalty(grid: Grid) {
  const size = grid.size;
  const at = (r: number, c: number) => grid.modules[r][c] === true;
  let score = 0;

  // Rule 1 — runs of five or more same-colour modules in a row or column.
  for (let i = 0; i < size; i += 1) {
    let rowRun = 1;
    let colRun = 1;
    for (let j = 1; j < size; j += 1) {
      rowRun = at(i, j) === at(i, j - 1) ? rowRun + 1 : 1;
      if (rowRun === 5) score += 3;
      else if (rowRun > 5) score += 1;

      colRun = at(j, i) === at(j - 1, i) ? colRun + 1 : 1;
      if (colRun === 5) score += 3;
      else if (colRun > 5) score += 1;
    }
  }

  // Rule 2 — 2x2 blocks of one colour.
  for (let r = 0; r < size - 1; r += 1) {
    for (let c = 0; c < size - 1; c += 1) {
      const first = at(r, c);
      if (first === at(r, c + 1) && first === at(r + 1, c) && first === at(r + 1, c + 1)) {
        score += 3;
      }
    }
  }

  // Rule 3 — finder-like 1:1:3:1:1 patterns with four light modules beside them.
  const pattern = [true, false, true, true, true, false, true, false, false, false, false];
  const reversed = [...pattern].reverse();
  const matches = (values: boolean[], start: number, target: boolean[]) =>
    target.every((value, index) => values[start + index] === value);

  for (let i = 0; i < size; i += 1) {
    const row: boolean[] = [];
    const column: boolean[] = [];
    for (let j = 0; j < size; j += 1) {
      row.push(at(i, j));
      column.push(at(j, i));
    }
    for (let j = 0; j + pattern.length <= size; j += 1) {
      if (matches(row, j, pattern) || matches(row, j, reversed)) score += 40;
      if (matches(column, j, pattern) || matches(column, j, reversed)) score += 40;
    }
  }

  // Rule 4 — deviation from an even split of dark and light.
  let dark = 0;
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      if (at(r, c)) dark += 1;
    }
  }
  const percent = (dark * 100) / (size * size);
  score += Math.floor(Math.abs(percent - 50) / 5) * 10;

  return score;
}

export interface KioskQrSymbol {
  version: number;
  size: number;
  mask: number;
  /** Row-major; `true` is a dark module. */
  modules: boolean[][];
}

/**
 * Encodes `text` as a QR symbol, or returns null when it does not fit in
 * version 10 — the caller shows the reference code as text instead of a
 * misleading half-symbol.
 */
export function encodeKioskQr(text: string): KioskQrSymbol | null {
  if (!text) {
    return null;
  }

  const bytes = Array.from(new TextEncoder().encode(text));
  const version = pickVersion(bytes.length);
  if (!version) {
    return null;
  }

  const codewords = buildCodewords(bytes, version);

  let best: { grid: Grid; mask: number; score: number } | null = null;
  for (let maskId = 0; maskId < 8; maskId += 1) {
    const grid = createGrid(version);
    placeFinder(grid, 0, 0);
    placeFinder(grid, 0, grid.size - 7);
    placeFinder(grid, grid.size - 7, 0);
    placeAlignment(grid, version);
    placeTiming(grid);
    reserveFormatAreas(grid, version);
    placeData(grid, codewords);
    applyMask(grid, maskId);
    placeFormat(grid, maskId);
    placeVersion(grid, version);

    const score = penalty(grid);
    if (!best || score < best.score) {
      best = { grid, mask: maskId, score };
    }
  }

  if (!best) {
    return null;
  }

  return {
    version,
    size: best.grid.size,
    mask: best.mask,
    modules: best.grid.modules.map((row) => row.map((value) => value === true))
  };
}

/**
 * Reads the data codewords back out of a finished symbol by undoing the mask
 * and walking the same zigzag the writer used. Verification only — this is how
 * the tests prove the grid carries the bytes the encoder claims.
 */
export function extractDataCodewords(symbol: KioskQrSymbol, codewordCount: number) {
  const grid = createGrid(symbol.version);
  placeFinder(grid, 0, 0);
  placeFinder(grid, 0, grid.size - 7);
  placeFinder(grid, grid.size - 7, 0);
  placeAlignment(grid, symbol.version);
  placeTiming(grid);
  reserveFormatAreas(grid, symbol.version);

  const mask = MASKS[symbol.mask];
  const bits: number[] = [];
  for (const [row, column] of dataModulePositions(symbol.size)) {
    if (row < 0 || column < 0 || row >= symbol.size || column >= symbol.size) {
      continue;
    }
    if (grid.reserved[row][column]) {
      continue;
    }
    const value = symbol.modules[row][column];
    bits.push(mask(row, column) ? (value ? 0 : 1) : value ? 1 : 0);
  }

  const codewords: number[] = [];
  for (let i = 0; i < codewordCount; i += 1) {
    let byte = 0;
    for (let j = 0; j < 8; j += 1) {
      byte = (byte << 1) | (bits[i * 8 + j] ?? 0);
    }
    codewords.push(byte);
  }
  return codewords;
}

/** Test seam: the interleaved codeword stream the encoder places on the grid. */
export function codewordsForText(text: string) {
  const bytes = Array.from(new TextEncoder().encode(text));
  const version = pickVersion(bytes.length);
  if (!version) {
    return null;
  }
  return { version, codewords: buildCodewords(bytes, version) };
}

/** The public URL a kiosk QR resolves to. */
export function kioskBookingUrl(confirmationCode: string) {
  return `https://bvrb3r.app/r/${encodeURIComponent(confirmationCode)}`;
}
