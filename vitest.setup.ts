import "@testing-library/jest-dom";
import { vi } from "vitest";

const canvasContext2D = {
  arc: vi.fn(),
  beginPath: vi.fn(),
  clearRect: vi.fn(),
  fill: vi.fn(),
  fillText: vi.fn(),
  lineTo: vi.fn(),
  moveTo: vi.fn(),
  restore: vi.fn(),
  save: vi.fn(),
  setTransform: vi.fn(),
  stroke: vi.fn(),
  fillStyle: "",
  font: "",
  globalAlpha: 1,
  lineWidth: 1,
  shadowBlur: 0,
  shadowColor: "",
  strokeStyle: "",
  textAlign: "start",
  textBaseline: "alphabetic"
};

Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
  configurable: true,
  value: vi.fn((contextId: string) => contextId === "2d" ? canvasContext2D : null)
});
