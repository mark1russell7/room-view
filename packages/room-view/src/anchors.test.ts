import { describe, expect, it } from "vitest";
import { sceneSpace, type Anchor, type AnchorFrame } from "./anchors.ts";
import { checkAnchor, type AnchorFault } from "./check.ts";
import type { Room, Scene } from "./room.ts";

/** One wall along the x axis, 4 long, 0.2 thick and 2.4 high, with a center line. A door from 1 to 2, and a floor from (0, 0) to (4, 3). */
function room(more: Partial<Room> = {}): Room {
  return {
    schema: "room/1",
    unit: "m",
    height: 2.4,
    wallThickness: 0.2,
    walls: [{ id: "a", from: [0, 0], to: [4, 0] }],
    openings: [{ id: "door", wall: "a", kind: "door", offset: 1, width: 1, height: 2 }],
    floors: [{ id: "f", ring: [[0, 0], [4, 0], [4, 3], [0, 3]] }],
    ...more,
  };
}

/** A desk of 2 by 1 by 0.75 at (2, 1.5), turned by 90 degrees. */
function scene(more: Partial<Scene> = {}, roomMore: Partial<Room> = {}): Scene {
  return { schema: "scene/1", room: room(roomMore), objects: [{ id: "desk", kind: "desk", size: [2, 1, 0.75], at: [2, 1.5], turn: 90 }], ...more };
}

/** The frame with each number rounded to 6 decimals, and 0 for -0. */
function rounded(frame: AnchorFrame | undefined): unknown {
  if (frame === undefined) return undefined;
  const round = (value: number): number => Math.round(value * 1e6) / 1e6 + 0;
  const point = (p: { x: number; y: number; z: number }) => ({ x: round(p.x), y: round(p.y), z: round(p.z) });
  return { at: point(frame.at), out: point(frame.out) };
}

/** Each fault as one text: the level and the code. */
function codes(faults: readonly AnchorFault[]): readonly string[] {
  return faults.map((fault) => `${fault.level}/${fault.code}`);
}

describe("sceneSpace", () => {
  it("gives the frame of an anchor on each face of a wall", () => {
    const space = sceneSpace(scene());
    // The left face of a wall along x is at y = 0.1, and its direction out is +y.
    expect(rounded(space.frame({ on: "wall", wall: "a", face: "left", offset: 3, height: 0.3 }))).toEqual({ at: { x: 3, y: 0.1, z: 0.3 }, out: { x: 0, y: 1, z: 0 } });
    expect(rounded(space.frame({ on: "wall", wall: "a", face: "right", offset: 3, height: 0.3 }))).toEqual({ at: { x: 3, y: -0.1, z: 0.3 }, out: { x: 0, y: -1, z: 0 } });
    expect(space.frame({ on: "wall", wall: "b", face: "left", offset: 1, height: 1 })).toBeUndefined();
  });

  it("gives the face of a wall with its line on one side", () => {
    const space = sceneSpace(scene({}, { walls: [{ id: "a", from: [0, 0], to: [4, 0], side: "right" }] }));
    // The wall is on the right of its line, so the line is the left face, and the right face is the full thickness to the right.
    expect(rounded(space.frame({ on: "wall", wall: "a", face: "left", offset: 1, height: 1 }))).toEqual({ at: { x: 1, y: 0, z: 1 }, out: { x: 0, y: 1, z: 0 } });
    expect(rounded(space.frame({ on: "wall", wall: "a", face: "right", offset: 1, height: 1 }))).toEqual({ at: { x: 1, y: -0.2, z: 1 }, out: { x: 0, y: -1, z: 0 } });
  });

  it("gives the frames of the floor and of the ceiling in meters", () => {
    const space = sceneSpace(scene({}, { unit: "cm", height: 240, wallThickness: 20, walls: [{ id: "a", from: [0, 0], to: [400, 0] }], openings: [], floors: [] }));
    expect(rounded(space.frame({ on: "floor", at: [100, 50] }))).toEqual({ at: { x: 1, y: 0.5, z: 0 }, out: { x: 0, y: 0, z: 1 } });
    expect(rounded(space.frame({ on: "ceiling", at: [100, 50] }))).toEqual({ at: { x: 1, y: 0.5, z: 2.4 }, out: { x: 0, y: 0, z: -1 } });
  });

  it("gives the frame of an anchor on an object, with the turn of the object", () => {
    const space = sceneSpace(scene());
    // The default is the center of the top, and the direction up.
    expect(rounded(space.frame({ on: "object", object: "desk" }))).toEqual({ at: { x: 2, y: 1.5, z: 0.75 }, out: { x: 0, y: 0, z: 1 } });
    // The turn of 90 degrees moves +x of the desk to +y of the room.
    expect(rounded(space.frame({ on: "object", object: "desk", at: [1, 0, 0.5], out: [2, 0, 0] }))).toEqual({ at: { x: 2, y: 2.5, z: 0.5 }, out: { x: 0, y: 1, z: 0 } });
    expect(space.frame({ on: "object", object: "chair" })).toBeUndefined();
    expect(space.frame({ on: "object", object: "desk", out: [0, 0, 0] })).toBeUndefined();
  });

  it("gives the frame of an object on a different object", () => {
    const space = sceneSpace(scene({ objects: [{ id: "desk", kind: "desk", size: [2, 1, 0.75], at: [2, 1.5] }, { id: "lamp", kind: "lamp", size: [0.2, 0.2, 0.5], at: [0.5, 0], lift: 0.75, parent: "desk" }] }));
    expect(rounded(space.frame({ on: "object", object: "lamp" }))?.at).toEqual({ x: 2.5, y: 1.5, z: 1.25 });
    // An object on a parent that the scene does not have has no place.
    const lost = sceneSpace(scene({ objects: [{ id: "lamp", kind: "lamp", size: [0.2, 0.2, 0.5], at: [0, 0], parent: "desk" }] }));
    expect(lost.frame({ on: "object", object: "lamp" })).toBeUndefined();
  });

  it("gives no frame for a number that is not finite or not in the range of the model", () => {
    const space = sceneSpace(scene());
    expect(space.frame({ on: "floor", at: [Number.NaN, 0] })).toBeUndefined();
    expect(space.frame({ on: "floor", at: [2e6, 0] })).toBeUndefined();
    expect(space.frame({ on: "wall", wall: "a", face: "left", offset: 1, height: Infinity })).toBeUndefined();
  });

  it("reads the walls, the objects and their transforms", () => {
    const space = sceneSpace(scene());
    expect(space.scale).toBe(1);
    expect(space.wall("a")?.length).toBe(4);
    expect(space.wall("b")).toBeUndefined();
    expect(space.object("desk")?.kind).toBe("desk");
    expect(space.transform("desk")?.position).toEqual({ x: 2, y: 1.5, z: 0 });
    expect(space.transform("chair")).toBeUndefined();
  });
});

describe("checkAnchor", () => {
  const space = sceneSpace(scene());

  it("gives no fault for a correct anchor", () => {
    const anchors: readonly Anchor[] = [
      { on: "wall", wall: "a", face: "left", offset: 3, height: 0.3 },
      { on: "floor", at: [1, 1] },
      { on: "floor", at: [1, 1], floor: "f" },
      { on: "ceiling", at: [1, 1] },
      { on: "object", object: "desk" },
      { on: "object", object: "desk", at: [1, -0.5, 0], out: [0, -1, 0] },
    ];
    for (const anchor of anchors) expect(checkAnchor(anchor, space)).toEqual([]);
  });

  it("tells a wall, a floor or an object that the scene does not have", () => {
    expect(codes(checkAnchor({ on: "wall", wall: "b", face: "left", offset: 1, height: 1 }, space))).toEqual(["error/anchor-wall"]);
    expect(codes(checkAnchor({ on: "floor", at: [1, 1], floor: "g" }, space))).toEqual(["error/anchor-floor"]);
    expect(codes(checkAnchor({ on: "ceiling", at: [1, 1], floor: "g" }, space))).toEqual(["error/anchor-floor"]);
    expect(codes(checkAnchor({ on: "object", object: "chair" }, space))).toEqual(["error/anchor-object"]);
    // An object on a parent that the scene does not have is in the scene, but it has no place.
    const lost = sceneSpace(scene({ objects: [{ id: "lamp", kind: "lamp", size: [0.2, 0.2, 0.5], at: [0, 0], parent: "desk" }] }));
    expect(checkAnchor({ on: "object", object: "lamp" }, lost)).toEqual([{ level: "error", code: "anchor-object", message: `The anchor is on the object "lamp", which has no place in the room.` }]);
  });

  it("tells an anchor out of its wall or out of its object", () => {
    expect(codes(checkAnchor({ on: "wall", wall: "a", face: "left", offset: 4.5, height: 1 }, space))).toEqual(["error/anchor-range"]);
    expect(codes(checkAnchor({ on: "wall", wall: "a", face: "left", offset: 1, height: 3 }, space))).toEqual(["error/anchor-range"]);
    expect(codes(checkAnchor({ on: "wall", wall: "a", face: "left", offset: -0.1, height: 1 }, space))).toEqual(["error/anchor-range"]);
    expect(codes(checkAnchor({ on: "object", object: "desk", at: [1.2, 0, 0] }, space))).toEqual(["error/anchor-range"]);
    expect(codes(checkAnchor({ on: "object", object: "desk", at: [0, 0, 0.8] }, space))).toEqual(["error/anchor-range"]);
    expect(codes(checkAnchor({ on: "floor", at: [2e6, 0] }, space))).toEqual(["error/anchor-range"]);
  });

  it("tells a number that is not finite, and a direction with no length", () => {
    expect(codes(checkAnchor({ on: "wall", wall: "a", face: "left", offset: Number.NaN, height: 1 }, space))).toEqual(["error/anchor-not-finite"]);
    expect(codes(checkAnchor({ on: "object", object: "desk", out: [0, 0, 0] }, space))).toEqual(["error/anchor-direction"]);
  });

  it("warns about an anchor in an opening, and keeps its position", () => {
    const anchor: Anchor = { on: "wall", wall: "a", face: "left", offset: 1.5, height: 1 };
    const faults = checkAnchor(anchor, space, `The anchor "k"`);
    expect(faults).toEqual([{ level: "warning", code: "anchor-in-opening", message: `The anchor "k" is in the opening "door" of the wall "a".`, other: "door" }]);
    expect(space.frame(anchor)).toBeDefined();
    // Above the door, the anchor is not in the opening.
    expect(checkAnchor({ ...anchor, height: 2.2 }, space)).toEqual([]);
  });

  it("warns about a point that is not on a floor, or not above it", () => {
    expect(codes(checkAnchor({ on: "floor", at: [5, 1] }, space))).toEqual(["warning/anchor-outside"]);
    expect(codes(checkAnchor({ on: "floor", at: [5, 1], floor: "f" }, space))).toEqual(["warning/anchor-outside"]);
    expect(checkAnchor({ on: "ceiling", at: [5, 1] }, space)[0]?.message).toBe("The anchor is not above a floor of the room.");
    // A room with no floors has no such fault.
    expect(checkAnchor({ on: "floor", at: [5, 1] }, sceneSpace(scene({}, { floors: [] })))).toEqual([]);
  });
});
