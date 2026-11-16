import { transformPoint3 } from "@mark1russell7/layout-contract";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Opening, Room, Scene } from "./room.ts";
import { SAMPLE_ROOM, SAMPLE_SCENE } from "./sample.ts";
import { boundsOfSolids, FLOOR_DEPTH, objectTransforms, roomSolids, sceneSolids, solidCorners, solidVolume, TO_Y_UP, type Solid } from "./solids.ts";

/** One wall along the x axis, 4 long, 0.2 thick and 2.4 high. */
function oneWall(openings: readonly Opening[] = [], more: Partial<Room> = {}): Room {
  return { schema: "room/1", unit: "m", height: 2.4, wallThickness: 0.2, walls: [{ id: "a", from: [0, 0], to: [4, 0] }], openings, ...more };
}

function volumeOf(solids: readonly Solid[], kind: Solid["kind"]): number {
  return solids.filter((solid) => solid.kind === kind).reduce((sum, solid) => sum + solidVolume(solid), 0);
}

function boxOf(solid: Solid): { readonly min: readonly number[]; readonly max: readonly number[] } {
  const corners = solidCorners(solid);
  const axis = (pick: (corner: { x: number; y: number; z: number }) => number): readonly [number, number] => [Math.min(...corners.map(pick)), Math.max(...corners.map(pick))];
  const [x, y, z] = [axis((c) => c.x), axis((c) => c.y), axis((c) => c.z)];
  return { min: [x[0], y[0], z[0]], max: [x[1], y[1], z[1]] };
}

function close(values: readonly number[]): unknown[] {
  return values.map((value) => expect.closeTo(value, 9));
}

const full = 4 * 0.2 * (2.4 + FLOOR_DEPTH);

describe("roomSolids", () => {
  it("gives one solid for a wall with no opening", () => {
    const solids = roomSolids(oneWall());
    expect(solids).toHaveLength(1);
    expect(solids[0]!.id).toBe("wall:a:0");
    expect(solidVolume(solids[0]!)).toBeCloseTo(full, 12);
    expect(boxOf(solids[0]!)).toEqual({ min: close([0, -0.1, -FLOOR_DEPTH]), max: close([4, 0.1, 2.4]) });
  });

  it("removes the volume of each opening from its wall", () => {
    const solids = roomSolids(
      oneWall([
        { id: "door", wall: "a", kind: "door", offset: 0.5, width: 0.9, height: 2 },
        { id: "window", wall: "a", kind: "window", offset: 2, width: 1.2, sill: 0.9, height: 1.1 },
      ]),
    );
    expect(volumeOf(solids, "wall")).toBeCloseTo(full - 0.9 * 0.2 * 2 - 1.2 * 0.2 * 1.1, 12);
    // The parts: the wall before the door, the parts below and above the door, the wall between, the parts below and above the window, and the rest.
    expect(solids.filter((solid) => solid.kind === "wall")).toHaveLength(7);
    expect(new Set(solids.map((solid) => solid.id)).size).toBe(solids.length);
  });

  it("removes the volume of each opening, for each position that is valid", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1.5, noNaN: true }),
        fc.double({ min: 0.1, max: 1, noNaN: true }),
        fc.double({ min: 0.05, max: 0.5, noNaN: true }),
        fc.double({ min: 0.1, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0.2, max: 1.3, noNaN: true }),
        (offset, width, gap, second, sill, height) => {
          const solids = roomSolids(
            oneWall([
              { id: "two", wall: "a", kind: "window", offset: offset + width + gap, width: second, sill, height },
              { id: "one", wall: "a", kind: "gap", offset, width, height },
            ]),
          );
          expect(volumeOf(solids, "wall")).toBeCloseTo(full - (width + second) * 0.2 * height, 9);
        },
      ),
    );
  });

  it("puts the glass of a window in the middle of the wall", () => {
    const solids = roomSolids(oneWall([{ id: "window", wall: "a", kind: "window", offset: 2, width: 1.2, sill: 0.9, height: 1.1 }]));
    const glass = solids.filter((solid) => solid.kind === "glass");
    expect(glass.map((solid) => [solid.id, solid.source])).toEqual([["glass:window", "window"]]);
    expect(boxOf(glass[0]!)).toEqual({ min: close([2, -0.01, 0.9]), max: close([3.2, 0.01, 2]) });
  });

  it("makes no glass for a door and a gap", () => {
    const solids = roomSolids(
      oneWall([
        { id: "door", wall: "a", kind: "door", offset: 0.5, width: 0.9, height: 2 },
        { id: "gap", wall: "a", kind: "gap", offset: 2, width: 1, height: 2.4 },
      ]),
    );
    expect(solids.filter((solid) => solid.kind === "glass")).toEqual([]);
  });

  it("skips an opening that it cannot make", () => {
    const solids = roomSolids(
      oneWall([
        { id: "no-wall", wall: "b", kind: "door", offset: 0.5, width: 0.9, height: 2 },
        { id: "out", wall: "a", kind: "door", offset: 3.5, width: 0.9, height: 2 },
        { id: "flat", wall: "a", kind: "door", offset: 1, width: 0, height: 2 },
        { id: "first", wall: "a", kind: "door", offset: 1, width: 1, height: 2 },
        { id: "overlap", wall: "a", kind: "door", offset: 1.5, width: 1, height: 2 },
      ]),
    );
    expect(volumeOf(solids, "wall")).toBeCloseTo(full - 1 * 0.2 * 2, 12);
  });

  it("puts an outlet on the face that the record names", () => {
    const room: Room = {
      schema: "room/1",
      unit: "m",
      height: 2.4,
      wallThickness: 0.2,
      walls: [{ id: "up", from: [1, 1], to: [1, 4] }],
      outlets: [
        { id: "l", wall: "up", face: "left", offset: 2, height: 0.3 },
        { id: "r", wall: "up", face: "right", offset: 2, height: 0.3 },
        { id: "lost", wall: "none", face: "left", offset: 2, height: 0.3 },
      ],
    };
    const outlets = roomSolids(room).filter((solid) => solid.kind === "outlet");
    expect(outlets.map((solid) => solid.id)).toEqual(["outlet:l", "outlet:r"]);
    // The wall goes up the plan, so its left face is at x = 0.9 and its right face is at x = 1.1.
    expect(boxOf(outlets[0]!)).toEqual({ min: close([0.888, 2.965, 0.2425]), max: close([0.9, 3.035, 0.3575]) });
    expect(boxOf(outlets[1]!)).toEqual({ min: close([1.1, 2.965, 0.2425]), max: close([1.112, 3.035, 0.3575]) });
  });

  it("makes each floor a slab below the height 0, in meters", () => {
    const room: Room = {
      schema: "room/1",
      unit: "cm",
      height: 240,
      wallThickness: 10,
      walls: [],
      floors: [
        {
          id: "f",
          ring: [
            [0, 0],
            [300, 0],
            [300, 200],
            [0, 200],
          ],
        },
        { id: "line", ring: [[0, 0]] },
      ],
    };
    const solids = roomSolids(room, { floorDepth: 0.2 });
    expect(solids.map((solid) => solid.id)).toEqual(["floor:f"]);
    expect(solidVolume(solids[0]!)).toBeCloseTo(3 * 2 * 0.2, 12);
    expect(boxOf(solids[0]!)).toEqual({ min: close([0, 0, -0.2]), max: close([3, 2, 0]) });
  });

  it("gives the same model for a room in feet and the same room in meters", () => {
    const foot = 0.3048;
    const s = (value: number): number => value / foot;
    const inFeet: Room = {
      ...SAMPLE_ROOM,
      unit: "ft",
      height: s(SAMPLE_ROOM.height),
      wallThickness: s(SAMPLE_ROOM.wallThickness),
      walls: SAMPLE_ROOM.walls.map((wall) => ({ ...wall, from: [s(wall.from[0]), s(wall.from[1])], to: [s(wall.to[0]), s(wall.to[1])], ...(wall.thickness === undefined ? {} : { thickness: s(wall.thickness) }) })),
      openings: (SAMPLE_ROOM.openings ?? []).map((opening) => ({
        ...opening,
        offset: s(opening.offset),
        width: s(opening.width),
        height: s(opening.height),
        ...(opening.sill === undefined ? {} : { sill: s(opening.sill) }),
      })),
      floors: (SAMPLE_ROOM.floors ?? []).map((floor) => ({ ...floor, ring: floor.ring.map(([x, y]) => [s(x), s(y)] as const) })),
      outlets: (SAMPLE_ROOM.outlets ?? []).map((outlet) => ({ ...outlet, offset: s(outlet.offset), height: s(outlet.height) })),
    };
    const meters = roomSolids(SAMPLE_ROOM);
    const feet = roomSolids(inFeet);
    expect(feet.map((solid) => solid.id)).toEqual(meters.map((solid) => solid.id));
    feet.forEach((solid, index) => {
      expect(solidVolume(solid)).toBeCloseTo(solidVolume(meters[index]!), 9);
    });
  });
});

describe("objectTransforms", () => {
  const scene = (objects: Scene["objects"]): Scene => ({ schema: "scene/1", room: oneWall(), objects });

  it("puts an object at its point, with its lift and its turn", () => {
    const transform = objectTransforms(scene([{ id: "a", kind: "box", size: [1, 1, 1], at: [3, 4], lift: 0.5, turn: 90 }])).get("a")!;
    const corner = transformPoint3(transform, { x: 1, y: 0, z: 0 });
    expect([corner.x, corner.y, corner.z]).toEqual(close([3, 5, 0.5]));
  });

  it("puts a child in the frame of its parent", () => {
    const transforms = objectTransforms(
      scene([
        { id: "child", kind: "box", size: [1, 1, 1], at: [0.2, 0], lift: 0.1, turn: 90, parent: "rack" },
        { id: "rack", kind: "rack", size: [1, 1, 2], at: [3, 4], lift: 1, turn: 90 },
      ]),
    );
    const child = transforms.get("child")!;
    // The parent turns the offset (0.2, 0) to (0, 0.2). The two turns of 90 degrees add up to 180 degrees.
    expect([child.position.x, child.position.y, child.position.z]).toEqual(close([3, 4.2, 1.1]));
    const ahead = transformPoint3(child, { x: 1, y: 0, z: 0 });
    expect([ahead.x, ahead.y, ahead.z]).toEqual(close([2, 4.2, 1.1]));
  });

  it("gives no transform to an object with no parent in the scene, or in a loop of parents", () => {
    const transforms = objectTransforms(
      scene([
        { id: "lost", kind: "box", size: [1, 1, 1], at: [0, 0], parent: "none" },
        { id: "a", kind: "box", size: [1, 1, 1], at: [0, 0], parent: "b" },
        { id: "b", kind: "box", size: [1, 1, 1], at: [0, 0], parent: "a" },
        { id: "self", kind: "box", size: [1, 1, 1], at: [0, 0], parent: "self" },
        { id: "under", kind: "box", size: [1, 1, 1], at: [0, 0], parent: "a" },
        { id: "good", kind: "box", size: [1, 1, 1], at: [1, 1] },
      ]),
    );
    expect([...transforms.keys()]).toEqual(["good"]);
  });
});

describe("sceneSolids", () => {
  it("adds one box for each placed object of the sample scene", () => {
    const solids = sceneSolids(SAMPLE_SCENE);
    expect(new Set(solids.map((solid) => solid.id)).size).toBe(solids.length);
    expect(solids.filter((solid) => solid.kind === "object").map((solid) => solid.source)).toEqual((SAMPLE_SCENE.objects ?? []).map((object) => object.id));
    expect(solids.filter((solid) => solid.kind === "outlet")).toHaveLength(7);
    expect(solids.filter((solid) => solid.kind === "glass")).toHaveLength(2);
    expect(solids.filter((solid) => solid.kind === "floor")).toHaveLength(1);
  });

  it("puts the display on the desk and each computer in the rack", () => {
    const solids = sceneSolids(SAMPLE_SCENE);
    const by = (id: string): ReturnType<typeof boxOf> => boxOf(solids.find((solid) => solid.id === `object:${id}`)!);
    expect(by("display").min[2]).toBeCloseTo(0.74, 12);
    const rack = by("rack");
    for (const id of ["node-1", "node-2", "node-3", "node-4"]) {
      const node = by(id);
      for (const axis of [0, 1, 2]) {
        expect(node.min[axis]!).toBeGreaterThanOrEqual(rack.min[axis]!);
        expect(node.max[axis]!).toBeLessThanOrEqual(rack.max[axis]!);
      }
    }
  });

  it("gives the bounds of the sample scene", () => {
    const bounds = boundsOfSolids(sceneSolids(SAMPLE_SCENE))!;
    expect([bounds.x, bounds.y, bounds.z]).toEqual(close([-0.15, -0.15, -FLOOR_DEPTH]));
    expect([bounds.x + bounds.w, bounds.y + bounds.h, bounds.z + bounds.d]).toEqual(close([6.15, 5.15, 2.5]));
    expect(boundsOfSolids([])).toBeUndefined();
  });

  it("skips an object with no size or with no transform", () => {
    const solids = sceneSolids({
      schema: "scene/1",
      room: oneWall(),
      objects: [
        { id: "flat", kind: "box", size: [1, 0, 1], at: [0, 2] },
        { id: "lost", kind: "box", size: [1, 1, 1], at: [0, 2], parent: "none" },
        { id: "good", kind: "box", size: [1, 2, 3], at: [0, 2] },
      ],
    });
    const objects = solids.filter((solid) => solid.kind === "object");
    expect(objects.map((solid) => solid.id)).toEqual(["object:good"]);
    expect(solidVolume(objects[0]!)).toBeCloseTo(6, 12);
    expect(boxOf(objects[0]!)).toEqual({ min: close([-0.5, 1, 0]), max: close([0.5, 3, 3]) });
  });
});

describe("TO_Y_UP", () => {
  it("turns the vertical axis of the room to the y axis", () => {
    const up = transformPoint3(TO_Y_UP, { x: 0, y: 0, z: 1 });
    const north = transformPoint3(TO_Y_UP, { x: 0, y: 1, z: 0 });
    const east = transformPoint3(TO_Y_UP, { x: 1, y: 0, z: 0 });
    expect([up.x, up.y, up.z]).toEqual(close([0, 1, 0]));
    expect([north.x, north.y, north.z]).toEqual(close([0, 0, -1]));
    expect([east.x, east.y, east.z]).toEqual(close([1, 0, 0]));
  });
});
