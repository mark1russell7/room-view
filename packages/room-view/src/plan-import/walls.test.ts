import { describe, expect, it } from "vitest";
import { findBridges, type BridgeLimits } from "./bridges.ts";
import type { SheetLine } from "./sheet.ts";
import { parallelPairs, readPens, wallPairs, type WallLimits } from "./walls.ts";

const line = (x0: number, y0: number, x1: number, y1: number, width = 1, color = "#000000"): SheetLine => ({ from: [x0, y0], to: [x1, y1], width, color });

const wallLimits: WallLimits = { thinnest: 0.25, thickest: 1.5, longLine: 1.5, fewestLines: 2, leastLength: 0, shortestWall: 1 };
const bridgeLimits: BridgeLimits = { narrowest: 1.5, widest: 4.5, shortestEnd: 0.2, longestEnd: 1.6, touch: 0.2, angle: 25 };

describe("parallelPairs", () => {
  it("finds two parallel lines at a distance in the range, and counts the partner on each side", () => {
    const lines = [line(0, 0, 10, 0), line(10, 0.5, 0, 0.5), line(0, 5, 10, 5), line(0, 0.5, 0, 5)];
    const { pairs, sides } = parallelPairs(lines, 0.25, 1.5, 1);
    expect(pairs.map((pair) => [pair.a, pair.b])).toEqual([[0, 1]]);
    expect(pairs[0]!.distance).toBeCloseTo(0.5, 9);
    expect(pairs[0]!.overlap).toBeCloseTo(10, 9);
    expect(sides[0]! + sides[1]!).toBe(1);
    expect(sides[2]! + sides[3]!).toBe(1);
  });

  it("does not pair two lines with a small common part", () => {
    expect(parallelPairs([line(0, 0, 10, 0), line(9.5, 0.5, 20, 0.5)], 0.25, 1.5, 1).pairs).toEqual([]);
  });
});

describe("readPens and wallPairs", () => {
  it("reads a pen of double lines as a wall pen, and a pen of single lines as a different pen", () => {
    const lines = [line(0, 0, 10, 0), line(0, 0.5, 10, 0.5), line(0, 4, 0, 14, 0.2), line(3, 4, 3, 14, 0.2)];
    const reads = readPens(lines, wallLimits, 1);
    expect(reads.find((read) => read.pen === "1|#000000")).toMatchObject({ lines: 2, paired: 1, oneSide: 1, wall: true });
    expect(reads.find((read) => read.pen === "0.2|#000000")).toMatchObject({ lines: 2, paired: 0, wall: false });
  });

  it("gives the center line of the common part of two faces", () => {
    const [wall] = wallPairs([line(0, 0, 10, 0), line(12, 0.5, 2, 0.5)], wallLimits);
    expect(wall!.from[0]).toBeCloseTo(2, 9);
    expect(wall!.from[1]).toBeCloseTo(0.25, 9);
    expect(wall!.to[0]).toBeCloseTo(10, 9);
    expect(wall!.thickness).toBeCloseTo(0.5, 9);
  });
});

describe("findBridges", () => {
  it("bridges the gap between the end lines of two walls with a line along each face", () => {
    const left = [line(0, 0, 5, 0), line(0, 0.5, 5, 0.5), line(5, 0, 5, 0.5)];
    const right = [line(8, 0, 13, 0), line(8, 0.5, 13, 0.5), line(8, 0, 8, 0.5)];
    const bridges = findBridges([...left, ...right], bridgeLimits);
    expect(bridges).toHaveLength(1);
    expect(bridges[0]).toMatchObject({ source: "ends", from: [5, 0.25], to: [8, 0.25], thickness: 0.5 });
    expect(bridges[0]!.lines).toHaveLength(2);
  });

  it("bridges two open ends that face each other", () => {
    const bridges = findBridges([line(0, 0, 5, 0), line(8, 0, 13, 0)], bridgeLimits);
    expect(bridges).toHaveLength(1);
    expect(bridges[0]).toMatchObject({ source: "open", from: [5, 0], to: [8, 0], thickness: undefined });
  });

  it("does not bridge a gap that is too wide or two ends that do not face each other", () => {
    expect(findBridges([line(0, 0, 5, 0), line(10, 0, 15, 0)], bridgeLimits)).toEqual([]);
    expect(findBridges([line(0, 0, 5, 0), line(8, 3, 8, 8)], bridgeLimits)).toEqual([]);
  });
});
