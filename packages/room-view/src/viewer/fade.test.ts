import type { Point3 } from "@mark1russell7/layout-contract";
import { cameraPosition } from "@mark1russell7/visuals";
import { describe, expect, it } from "vitest";
import type { Room } from "../room.ts";
import { SAMPLE_ROOM } from "../sample.ts";
import { hiddenDepth, hidingWalls, wallShades, type WallShade } from "./fade.ts";
import { HOME_VIEW, TOP_VIEW, toRoom, toViewer } from "./view.ts";

/** The center of the sample room, in meters. */
const CENTER: Point3 = { x: 3, y: 2.5, z: 1.25 };

/** This function gives a camera of the sample room, as a point of the room. */
function cameraAt(polar: number, azimuth: number, distance: number): Point3 {
  return toRoom(cameraPosition(toViewer(CENTER), { polar, azimuth }, distance));
}

function shadeOf(shades: readonly WallShade[], id: string): WallShade {
  const found = shades.find((shade) => shade.frame.id === id);
  if (found === undefined) throw new Error(`The wall ${id} has no shade.`);
  return found;
}

const sorted = (ids: ReadonlySet<string>): readonly string[] => [...ids].sort();

describe("wallShades", () => {
  const shades = wallShades(SAMPLE_ROOM);

  it("finds the side of each outer wall that has the floor", () => {
    expect(Object.fromEntries(shades.map((shade) => [shade.frame.id, shade.inner]))).toEqual({
      south: "left",
      east: "left",
      "inset-north": "left",
      "inset-east": "left",
      north: "left",
      west: "left",
      nook: "both",
    });
  });

  it("uses the unit of the room", () => {
    const feet: Room = { schema: "room/1", unit: "ft", height: 8, wallThickness: 0.5, walls: [{ id: "a", from: [0, 0], to: [10, 0] }], floors: [{ id: "f", ring: [[0, -0.25], [10, -0.25], [10, -9], [0, -9]] }] }; // prettier-ignore
    expect(wallShades(feet).map((shade) => shade.inner)).toEqual(["right"]);
  });

  it("uses the center for a wall with no floor, and gives both sides with no center", () => {
    const bare: Room = { schema: "room/1", unit: "m", height: 2.4, wallThickness: 0.2, walls: [{ id: "a", from: [0, 0], to: [4, 0] }] };
    expect(wallShades(bare, { x: 2, y: 3 }).map((shade) => shade.inner)).toEqual(["left"]);
    expect(wallShades(bare, { x: 2, y: -3 }).map((shade) => shade.inner)).toEqual(["right"]);
    expect(wallShades(bare, { x: 2, y: 0 }).map((shade) => shade.inner)).toEqual(["both"]);
    expect(wallShades(bare).map((shade) => shade.inner)).toEqual(["both"]);
  });

  it("skips a wall that the model does not make", () => {
    const room: Room = { schema: "room/1", unit: "m", height: 2.4, wallThickness: 0.2, walls: [{ id: "none", from: [1, 1], to: [1, 1] }, { id: "a", from: [0, 0], to: [4, 0] }] }; // prettier-ignore
    expect(wallShades(room).map((shade) => shade.frame.id)).toEqual(["a"]);
  });
});

describe("hiddenDepth", () => {
  const south = shadeOf(wallShades(SAMPLE_ROOM), "south").frame;

  it("gives the depth of the strip of the floor that the wall hides", () => {
    // The outer face is at y = -0.15. The camera is 5 m from it, and 5 m above the top of the wall of 2.5 m.
    expect(hiddenDepth(south, { x: 3, y: -5.15, z: 7.5 })).toBeCloseTo(2.5, 9);
    expect(hiddenDepth(south, { x: 3, y: 4, z: 7.5 })).toBeCloseTo(2, 9);
  });

  it("gives 0 for a camera between the two faces", () => {
    expect(hiddenDepth(south, { x: 3, y: -0.1, z: 9 })).toBe(0);
  });

  it("gives Infinity for a camera that is not above the top of the wall", () => {
    expect(hiddenDepth(south, { x: 3, y: -4, z: 2.5 })).toBe(Infinity);
    expect(hiddenDepth(south, { x: 3, y: -4, z: 1 })).toBe(Infinity);
  });
});

describe("hidingWalls", () => {
  const shades = wallShades(SAMPLE_ROOM);

  it("gives the walls between the home camera and the room", () => {
    expect(sorted(hidingWalls(shades, cameraAt(HOME_VIEW.polar, HOME_VIEW.azimuth, 13)))).toEqual(["east", "inset-east", "nook", "south"]);
  });

  it("gives no wall for a camera above the room", () => {
    expect(sorted(hidingWalls(shades, cameraAt(TOP_VIEW.polar, TOP_VIEW.azimuth, 20)))).toEqual([]);
  });

  it("gives the opposite outer walls for the opposite camera", () => {
    const found = hidingWalls(shades, cameraAt(HOME_VIEW.polar, HOME_VIEW.azimuth + Math.PI, 13));
    expect(sorted(found)).toEqual(["inset-north", "nook", "north", "west"]);
  });

  it("gives some outer walls, and not each of them, for each camera around the room", () => {
    const outer = ["south", "east", "inset-north", "inset-east", "north", "west"];
    for (let step = 0; step < 24; step += 1) {
      const found = hidingWalls(shades, cameraAt(HOME_VIEW.polar, (step * Math.PI) / 12, 13));
      const count = outer.filter((id) => found.has(id)).length;
      expect(count, `step ${String(step)}`).toBeGreaterThan(0);
      expect(count, `step ${String(step)}`).toBeLessThan(outer.length);
    }
  });

  it("keeps a wall that hides a strip below the limit", () => {
    const camera = cameraAt(HOME_VIEW.polar, HOME_VIEW.azimuth, 13);
    expect(sorted(hidingWalls(shades, camera, 100))).toEqual([]);
    const south = shadeOf(shades, "south").frame;
    const depth = hiddenDepth(south, camera);
    expect(hidingWalls(shades, camera, depth - 0.01).has("south")).toBe(true);
    expect(hidingWalls(shades, camera, depth + 0.01).has("south")).toBe(false);
  });

  it("keeps a wall with the camera between its faces", () => {
    expect(hidingWalls(shades, { x: 3, y: -0.1, z: 1 }).has("south")).toBe(false);
  });
});
