import { describe, expect, it } from "vitest";
import { findBridges, type BridgeLimits } from "./bridges.ts";
import type { SheetLine } from "./sheet.ts";
import { parallelPairs, readPens, readWallLines, snapEnds, wallPairs, type WallLimits } from "./walls.ts";

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
    expect(reads.find((read) => read.pen === "1|#000000")).toMatchObject({ lines: 2, paired: 1, oneSide: 1, lengthShare: 1, wall: true });
    expect(reads.find((read) => read.pen === "0.2|#000000")).toMatchObject({ lines: 2, paired: 0, wall: false });
  });

  it("does not read a pen of short lines as a wall pen when only some of its lines are paired", () => {
    // Two paired long lines hold 20 of the 120 units of the length of the pen: the other lines are a hatch of short lines.
    const hatch = Array.from({ length: 100 }, (_, index) => line(index, 3, index + 1, 4, 0.5));
    const reads = readPens([line(0, 0, 10, 0, 0.5), line(0, 0.5, 10, 0.5, 0.5), ...hatch], wallLimits, 1);
    const read = reads.find((each) => each.pen === "0.5|#000000")!;
    expect(read).toMatchObject({ lines: 2, paired: 1, oneSide: 1, wall: false });
    expect(read.lengthShare).toBeCloseTo(20 / (20 + 100 * Math.SQRT2), 9);
  });

  it("reads a pen as a wall pen when its paired lines hold most of its length", () => {
    const ends = Array.from({ length: 4 }, (_, index) => line(index * 2, 0, index * 2, 0.5));
    const reads = readPens([line(0, 0, 10, 0), line(0, 0.5, 10, 0.5), ...ends], wallLimits, 1);
    expect(reads.find((each) => each.pen === "1|#000000")).toMatchObject({ lines: 2, paired: 1, lengthShare: 20 / 22, wall: true });
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

  it("bridges a wide door only along the edge of a fill ring, with widestGuided", () => {
    // A door of 7 units: wider than widest (4.5), not wider than widestGuided (8).
    const left = [line(0, 0, 5, 0), line(0, 0.5, 5, 0.5), line(5, 0, 5, 0.5)];
    const right = [line(12, 0, 17, 0), line(12, 0.5, 17, 0.5), line(12, 0, 12, 0.5)];
    const walls = [...left, ...right];
    const wide = { ...bridgeLimits, widestGuided: 8 };
    const along = [{ from: [0, 0.3] as const, to: [17, 0.3] as const }];
    const across = [{ from: [8.5, -5] as const, to: [8.5, 5] as const }];
    const far = [{ from: [0, 6] as const, to: [17, 6] as const }];
    expect(findBridges(walls, wide)).toEqual([]);
    expect(findBridges(walls, bridgeLimits, along)).toEqual([]);
    expect(findBridges(walls, wide, along)).toMatchObject([{ source: "ends", from: [5, 0.25], to: [12, 0.25] }]);
    expect(findBridges(walls, wide, across)).toEqual([]);
    expect(findBridges(walls, wide, far)).toEqual([]);
    // Two open ends at the same gap follow the same rule.
    expect(findBridges([line(0, 0, 5, 0), line(12, 0, 17, 0)], wide, along)).toMatchObject([{ source: "open", from: [5, 0], to: [12, 0] }]);
    expect(findBridges([line(0, 0, 5, 0), line(12, 0, 17, 0)], wide)).toEqual([]);
  });
});

describe("readWallLines", () => {
  it("gives the faces of a pen that is not a wall pen, and the short end line that joins two face ends", () => {
    const lines = [line(0, 0, 10, 0, 0.2), line(0, 0.5, 10, 0.5, 0.2), line(10, 0, 10, 0.5, 0.2), line(3, 3, 3.5, 3, 0.2)];
    const limits: WallLimits = { ...wallLimits, touch: 0.1 };
    const read = readWallLines(lines, readPens(lines, limits, 1), limits, []);
    expect(read.faces).toEqual({ "0.2|#000000": 3 });
    expect(read.walls).toHaveLength(3);
    expect(read.walls).not.toContain(lines[3]);
  });

  it("finds the partner of a face in a different pen only with the option crossPens", () => {
    const lines = [line(0, 0, 10, 0, 0.2), line(0, 0.5, 10, 0.5, 0.2), line(0, -0.4, 10, -0.4, 0.3), line(0, 3, 10, 3, 0.3), line(0, 3.5, 10, 3.5, 0.3)];
    const reads = readPens(lines, wallLimits, 1);
    expect(readWallLines(lines, reads, { ...wallLimits, crossPens: false }, []).faces).toEqual({ "0.2|#000000": 2, "0.3|#000000": 2 });
    // The face at 0 has a partner on its two sides when the pens join, so it is not a face.
    expect(readWallLines(lines, reads, wallLimits, []).faces).toEqual({ "0.2|#000000": 1, "0.3|#000000": 3 });
  });

  it("gives only the lines of the wall pens with the read of the pens", () => {
    const lines = [line(0, 0, 10, 0), line(0, 0.5, 10, 0.5), line(0, 3, 10, 3, 0.2), line(0, 3.5, 10, 3.5, 0.2)];
    const read = readWallLines(lines, readPens(lines, wallLimits, 1), { ...wallLimits, read: "pens" }, ["1|#000000"]);
    expect(read).toEqual({ walls: lines.slice(0, 2), glazing: [], faces: {}, glazingPens: {} });
  });
});

describe("snapEnds", () => {
  it("joins an open end to the end of a line in front of it", () => {
    const lines = [line(0, 0, 5, 0), line(5.5, 0.2, 5.5, 5)];
    const snaps = snapEnds(lines, 1, 0.2);
    expect(snaps).toHaveLength(1);
    expect(snaps[0]).toMatchObject({ from: [5, 0], to: [5.5, 0.2] });
    expect(snapEnds(lines, 1, 0.2, 10)).toEqual([]);
  });

  it("goes on along the line to the next line, and does not move a closed end or an end far from a line", () => {
    const snaps = snapEnds([line(0, 0.6, 0, 5), line(-3, 0, 3, 0), line(-3, 0, -3, 5)], 1, 0.2);
    expect(snaps).toHaveLength(1);
    expect(snaps[0]!.from).toEqual([0, 0.6]);
    expect(snaps[0]!.to[0]).toBeCloseTo(0, 9);
    expect(snaps[0]!.to[1]).toBeCloseTo(0, 9);
    expect(snapEnds([line(0, 0, 5, 0), line(7, 0, 9, 0)], 1, 0.2)).toEqual([]);
  });
});
