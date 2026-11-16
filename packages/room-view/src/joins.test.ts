import { convexOverlap, regionArea, type Ring } from "@mark1russell7/layout-contract";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { wallFrames } from "./frames.ts";
import { wallFootprints, type JoinOptions, type WallFootprint } from "./joins.ts";
import type { Room, Wall } from "./room.ts";
import { SAMPLE_ROOM } from "./sample.ts";

function roomOf(walls: readonly Wall[], wallThickness = 0.2): Room {
  return { schema: "room/1", unit: "m", height: 2.4, wallThickness, walls };
}

function footprintsOf(room: Room, options?: JoinOptions): readonly WallFootprint[] {
  return wallFootprints(wallFrames(room), options);
}

function areaOf(ring: Ring): number {
  return regionArea({ kind: "polygon", points: ring });
}

/** The least turn of the corners of a ring. It is above 0 for a ring that is convex and counter-clockwise. */
function leastTurn(ring: Ring): number {
  let least = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const [ax, ay] = ring[i]!;
    const [bx, by] = ring[(i + 1) % ring.length]!;
    const [cx, cy] = ring[(i + 2) % ring.length]!;
    least = Math.min(least, (bx - ax) * (cy - by) - (by - ay) * (cx - bx));
  }
  return least;
}

function has(ring: Ring, x: number, y: number): boolean {
  return ring.some(([px, py]) => Math.hypot(px - x, py - y) < 1e-9);
}

/** The largest overlap of two different outlines of a list. */
function mostOverlap(footprints: readonly WallFootprint[]): number {
  let most = -Infinity;
  for (let i = 0; i < footprints.length; i++) {
    for (let j = i + 1; j < footprints.length; j++) most = Math.max(most, convexOverlap(footprints[i]!.ring, footprints[j]!.ring));
  }
  return most;
}

/** A rectangle of walls, counter-clockwise, with the lines on the inner faces. */
function rectangle(w: number, h: number): readonly Wall[] {
  return [
    { id: "south", from: [0, 0], to: [w, 0], side: "right" },
    { id: "east", from: [w, 0], to: [w, h], side: "right" },
    { id: "north", from: [w, h], to: [0, h], side: "right" },
    { id: "west", from: [0, h], to: [0, 0], side: "right" },
  ];
}

describe("wallFootprints", () => {
  it("gives a rectangle for one wall", () => {
    const [footprint] = footprintsOf(roomOf([{ id: "a", from: [1, 1], to: [4, 5] }]));
    expect(footprint!.ring).toHaveLength(4);
    expect(areaOf(footprint!.ring)).toBeCloseTo(5 * 0.2, 12);
    expect(leastTurn(footprint!.ring)).toBeGreaterThan(0);
    expect(footprint!.clear[0]).toBeCloseTo(0, 12);
    expect(footprint!.clear[1]).toBeCloseTo(5, 12);
  });

  it("puts the wall on the side of its line that `side` names", () => {
    const acrossOf = (side: Wall["side"]): readonly [number, number] => {
      const [footprint] = footprintsOf(roomOf([{ id: "a", from: [0, 0], to: [3, 0], side }]));
      const ys = footprint!.ring.map(([, y]) => y);
      return [Math.min(...ys), Math.max(...ys)];
    };
    expect(acrossOf(undefined)).toEqual([-0.1, 0.1]);
    expect(acrossOf("center")).toEqual([-0.1, 0.1]);
    expect(acrossOf("left")).toEqual([0, 0.2]);
    expect(acrossOf("right")).toEqual([-0.2, 0]);
  });

  it("makes a miter where two walls have a common end", () => {
    const [a, b] = footprintsOf(
      roomOf([
        { id: "a", from: [0, 0], to: [4, 0] },
        { id: "b", from: [4, 0], to: [4, 3] },
      ]),
    );
    for (const footprint of [a!, b!]) {
      expect(footprint.ring).toHaveLength(4);
      expect(has(footprint.ring, 3.9, 0.1)).toBe(true);
      expect(has(footprint.ring, 4.1, -0.1)).toBe(true);
    }
    expect(areaOf(a!.ring)).toBeCloseTo(0.8, 12);
    expect(areaOf(b!.ring)).toBeCloseTo(0.6, 12);
    expect(convexOverlap(a!.ring, b!.ring)).toBeLessThan(1e-9);
    expect(a!.clear[1]).toBeCloseTo(3.9, 12);
    expect(b!.clear[0]).toBeCloseTo(0.1, 12);
  });

  it("fills a closed outline with no overlap and no hole", () => {
    fc.assert(
      fc.property(fc.double({ min: 1, max: 20, noNaN: true }), fc.double({ min: 1, max: 20, noNaN: true }), fc.double({ min: 0.05, max: 0.5, noNaN: true }), (w, h, t) => {
        const footprints = footprintsOf(roomOf(rectangle(w, h), t));
        const sum = footprints.reduce((total, footprint) => total + areaOf(footprint.ring), 0);
        expect(sum).toBeCloseTo((w + 2 * t) * (h + 2 * t) - w * h, 9);
        expect(mostOverlap(footprints)).toBeLessThan(1e-9);
        // The line of each wall is its inner face, so each wall has its full thickness along its full line.
        expect(footprints.map((footprint) => footprint.clear[0])).toEqual([0, 0, 0, 0].map(() => expect.closeTo(0, 9)));
        expect(footprints.map((footprint) => footprint.clear[1])).toEqual([w, h, w, h].map((length) => expect.closeTo(length, 9)));
      }),
    );
  });

  it("gives each wall of a corner of three walls its part", () => {
    const length = 2;
    const t = 0.2;
    const footprints = footprintsOf(
      roomOf([
        { id: "east", from: [0, 0], to: [length, 0] },
        { id: "north", from: [0, 0], to: [0, length] },
        { id: "west", from: [-length, 0], to: [0, 0] },
      ]),
    );
    const sum = footprints.reduce((total, footprint) => total + areaOf(footprint.ring), 0);
    // The three walls make the letter T: a bar of 2 lengths, and the rest of the third wall above the bar.
    expect(sum).toBeCloseTo(2 * length * t + t * (length - t / 2), 12);
    expect(mostOverlap(footprints)).toBeLessThan(1e-9);
    for (const footprint of footprints) expect(leastTurn(footprint.ring)).toBeGreaterThan(0);
    expect(has(footprints[1]!.ring, 0, 0)).toBe(true);
  });

  it("keeps a square end where a wall touches the face of a different wall", () => {
    const [north, nook] = footprintsOf(
      roomOf([
        { id: "north", from: [4, 5], to: [0, 5], side: "right" },
        { id: "nook", from: [2.5, 5], to: [2.5, 3.6], thickness: 0.1 },
      ]),
    );
    expect(areaOf(north!.ring)).toBeCloseTo(4 * 0.2, 12);
    expect(areaOf(nook!.ring)).toBeCloseTo(1.4 * 0.1, 12);
    expect(convexOverlap(north!.ring, nook!.ring)).toBeLessThan(1e-9);
  });

  it("gives square ends to a corner that is sharper than the limit", () => {
    const angle = (10 * Math.PI) / 180;
    const walls: readonly Wall[] = [
      { id: "a", from: [0, 0], to: [3, 0] },
      { id: "b", from: [0, 0], to: [3 * Math.cos(angle), 3 * Math.sin(angle)] },
    ];
    for (const footprint of footprintsOf(roomOf(walls))) expect(areaOf(footprint.ring)).toBeCloseTo(3 * 0.2, 9);
    // With a larger limit, the two walls make a long miter, and they do not overlap.
    const joined = footprintsOf(roomOf(walls), { miterLimit: 10 });
    expect(convexOverlap(joined[0]!.ring, joined[1]!.ring)).toBeLessThan(1e-9);
    expect(areaOf(joined[0]!.ring)).toBeCloseTo(areaOf(joined[1]!.ring), 9);
  });

  it("cuts a short wall at the miter of a sharp corner", () => {
    const angle = (20 * Math.PI) / 180;
    const [long, short] = footprintsOf(
      roomOf([
        { id: "long", from: [0, 0], to: [5, 0] },
        { id: "short", from: [0, 0], to: [0.3 * Math.cos(angle), 0.3 * Math.sin(angle)] },
      ]),
    );
    expect(short!.ring.length).toBeGreaterThanOrEqual(3);
    expect(leastTurn(short!.ring)).toBeGreaterThan(0);
    // The corner is longer than the short wall, so no part of that wall has its full thickness.
    expect(short!.clear).toEqual([0, 0]);
    expect(long!.clear[0]).toBeCloseTo(0.1 / Math.tan(angle / 2), 9);
    expect(convexOverlap(long!.ring, short!.ring)).toBeLessThan(1e-9);
  });

  it("makes the corner of a turn to the right on the outer side", () => {
    const footprints = footprintsOf(SAMPLE_ROOM);
    const inset = footprints.find((footprint) => footprint.wall === "inset-north")!;
    expect(has(inset.ring, 4, 3)).toBe(true);
    expect(has(inset.ring, 4.15, 3.15)).toBe(true);
    expect(inset.clear[0]).toBeCloseTo(0, 12);
    expect(inset.clear[1]).toBeCloseTo(2 - 0.15, 12);
  });

  it("gives no outline to a wall with no length or no thickness", () => {
    const footprints = footprintsOf(
      roomOf([
        { id: "dot", from: [1, 1], to: [1, 1] },
        { id: "thin", from: [0, 0], to: [1, 0], thickness: 0 },
      ]),
    );
    expect(footprints).toEqual([
      { wall: "dot", ring: [], clear: [0, 0] },
      { wall: "thin", ring: [], clear: [0, 0] },
    ]);
  });

  it("gives outlines that are convex and counter-clockwise, and that do not overlap, for the sample room", () => {
    const footprints = footprintsOf(SAMPLE_ROOM);
    for (const footprint of footprints) expect(leastTurn(footprint.ring)).toBeGreaterThan(0);
    expect(mostOverlap(footprints)).toBeLessThan(1e-9);
  });

  it("gives the same areas and the same clear parts after a turn and a move of the plan", () => {
    const before = footprintsOf(SAMPLE_ROOM);
    fc.assert(
      fc.property(fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }), fc.double({ min: -50, max: 50, noNaN: true }), fc.double({ min: -50, max: 50, noNaN: true }), (angle, dx, dy) => {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const move = ([x, y]: readonly [number, number]): readonly [number, number] => [x * cos - y * sin + dx, x * sin + y * cos + dy];
        const moved = footprintsOf({ ...SAMPLE_ROOM, walls: SAMPLE_ROOM.walls.map((wall) => ({ ...wall, from: move(wall.from), to: move(wall.to) })) });
        moved.forEach((footprint, index) => {
          expect(areaOf(footprint.ring)).toBeCloseTo(areaOf(before[index]!.ring), 7);
          expect(footprint.clear[0]).toBeCloseTo(before[index]!.clear[0], 7);
          expect(footprint.clear[1]).toBeCloseTo(before[index]!.clear[1], 7);
        });
      }),
    );
  });

  it("gives the same outlines for a room in feet and the same room in meters", () => {
    const foot = 0.3048;
    const scaled = (value: number): number => value / foot;
    const inFeet: Room = {
      ...SAMPLE_ROOM,
      unit: "ft",
      height: scaled(SAMPLE_ROOM.height),
      wallThickness: scaled(SAMPLE_ROOM.wallThickness),
      walls: SAMPLE_ROOM.walls.map((wall) => ({
        ...wall,
        from: [scaled(wall.from[0]), scaled(wall.from[1])],
        to: [scaled(wall.to[0]), scaled(wall.to[1])],
        ...(wall.thickness === undefined ? {} : { thickness: scaled(wall.thickness) }),
      })),
    };
    const meters = footprintsOf(SAMPLE_ROOM);
    footprintsOf(inFeet).forEach((footprint, index) => {
      expect(footprint.ring).toHaveLength(meters[index]!.ring.length);
      expect(areaOf(footprint.ring)).toBeCloseTo(areaOf(meters[index]!.ring), 9);
    });
  });
});
