import { addPoints3, dot3, scalePoint3, subtractPoints3, type Point3 } from "@mark1russell7/layout-contract";
import { checkMarks, type LinkMark, type Mark, type PointMark } from "@mark1russell7/visuals/marks";
import { describe, expect, it } from "vitest";
import type { Scene } from "../room.ts";
import { SAMPLE_SCENE } from "../sample.ts";
import { OUTLET_PLATE, sceneSolids, solidCorners, type Solid } from "../solids.ts";
import { outletMarks } from "./outlets.ts";

const SOLIDS = sceneSolids(SAMPLE_SCENE);
const MARKS = outletMarks(SAMPLE_SCENE, SOLIDS);

const points = (marks: readonly Mark[]): readonly PointMark[] => marks.filter((mark): mark is PointMark => mark.type === "point");
const links = (marks: readonly Mark[]): readonly LinkMark[] => marks.filter((mark): mark is LinkMark => mark.type === "link");

function solidOf(solids: readonly Solid[], id: string): Solid {
  const found = solids.find((solid) => solid.id === id);
  if (found === undefined) throw new Error(`The scene has no solid ${id}.`);
  return found;
}

/** This function gives the mean of the corners of a solid. */
function centerOf(solid: Solid): Point3 {
  const corners = solidCorners(solid);
  return scalePoint3(
    corners.reduce((sum, corner) => addPoints3(sum, corner), { x: 0, y: 0, z: 0 }),
    1 / corners.length,
  );
}

function expectPoint(actual: Point3, expected: Point3): void {
  expect(actual.x).toBeCloseTo(expected.x, 9);
  expect(actual.y).toBeCloseTo(expected.y, 9);
  expect(actual.z).toBeCloseTo(expected.z, 9);
}

/** This function gives a scene with different outlets and objects in the sample room. */
function sceneWith(outlets: NonNullable<Scene["room"]["outlets"]>, objects: NonNullable<Scene["objects"]> = []): Scene {
  return { ...SAMPLE_SCENE, room: { ...SAMPLE_SCENE.room, outlets }, objects };
}

describe("outletMarks", () => {
  it("gives one point for each outlet, with the record of the outlet", () => {
    expect(points(MARKS).map((mark) => mark.record)).toEqual(["outlet:south-1", "outlet:south-2", "outlet:east-1", "outlet:west-1", "outlet:north-1", "outlet:nook-1", "outlet:nook-2"]);
    expect(points(MARKS).every((mark) => mark.kind === "outlet")).toBe(true);
  });

  it("gives a point the level and the name of its circuit", () => {
    const byRecord = new Map(points(MARKS).map((mark) => [mark.record, mark]));
    expect(byRecord.get("outlet:south-1")?.level).toBe("ok");
    expect(byRecord.get("outlet:south-1")?.label).toBe("Outlet south-1, circuit Circuit A");
    expect(byRecord.get("outlet:nook-2")?.level).toBe("near");
    expect(byRecord.get("outlet:nook-2")?.label).toBe("Outlet nook-2, circuit Circuit B");
  });

  it("uses the options of the loads", () => {
    // The circuit of this outlet has 420 W of 1440 W.
    const marks = outletMarks(SAMPLE_SCENE, SOLIDS, { near: 0.25 });
    expect(points(marks).find((mark) => mark.record === "outlet:south-1")?.level).toBe("near");
  });

  it("puts a point at the center of the front of the plate, with the direction out of the wall", () => {
    for (const mark of points(MARKS)) {
      const plate = solidOf(SOLIDS, mark.record);
      const center = centerOf(plate);
      // The front of the plate is half of its depth from its center, in the direction out of the wall.
      expectPoint(mark.frame.at, addPoints3(center, scalePoint3(mark.frame.out, OUTLET_PLATE.depth / 2)));
      // No corner of the plate is in front of the point.
      const reach = Math.max(...solidCorners(plate).map((corner) => dot3(subtractPoints3(corner, mark.frame.at), mark.frame.out)));
      expect(reach).toBeCloseTo(0, 9);
    }
  });

  it("gives the point of an outlet on the south wall a direction to the north", () => {
    const south = points(MARKS).find((mark) => mark.record === "outlet:south-1");
    expectPoint(south?.frame.out ?? { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
    expectPoint(south?.frame.at ?? { x: 0, y: 0, z: 0 }, { x: 2.4, y: OUTLET_PLATE.depth, z: 0.3 });
  });

  it("gives one link for each object on an outlet, with the record of the object", () => {
    expect(links(MARKS).map((mark) => [mark.record, mark.from.record, mark.to.record])).toEqual([
      ["object:tower", "outlet:north-1", "object:tower"],
      ["object:node-1", "outlet:nook-1", "object:node-1"],
      ["object:node-2", "outlet:nook-1", "object:node-2"],
      ["object:node-3", "outlet:nook-2", "object:node-3"],
      ["object:node-4", "outlet:nook-2", "object:node-4"],
    ]);
    expect(links(MARKS).every((mark) => mark.kind === "feed")).toBe(true);
  });

  it("makes a link from the point of the outlet to the center of the object", () => {
    const tower = links(MARKS).find((mark) => mark.record === "object:tower");
    const outlet = points(MARKS).find((mark) => mark.record === "outlet:north-1");
    expect(tower?.from.at).toEqual(outlet?.frame.at);
    expectPoint(tower?.to.at ?? { x: 0, y: 0, z: 0 }, centerOf(solidOf(SOLIDS, "object:tower")));
    expect(tower?.label).toBe("Outlet north-1 to Tower");
    expect(tower?.level).toBe(outlet?.level);
  });

  it("gives marks with no fault", () => {
    expect(checkMarks(MARKS)).toEqual([]);
  });

  it("gives an outlet with no circuit of the room the level unknown, and no circuit in its label", () => {
    const scene = sceneWith([
      { id: "free", wall: "south", face: "left", offset: 1, height: 0.3 },
      { id: "lost", wall: "south", face: "left", offset: 2, height: 0.3, circuit: "none" },
    ]);
    const marks = points(outletMarks(scene, sceneSolids(scene)));
    expect(marks.map((mark) => [mark.record, mark.level, mark.label])).toEqual([
      ["outlet:free", "unknown", "Outlet free"],
      ["outlet:lost", "unknown", "Outlet lost"],
    ]);
  });

  it("uses the id of an object with no name in the label of its link", () => {
    const scene = sceneWith(
      [{ id: "free", wall: "south", face: "left", offset: 1, height: 0.3 }],
      [{ id: "lamp", kind: "lamp", size: [0.3, 0.3, 1.4], at: [2, 2], outlet: "free" }],
    );
    expect(links(outletMarks(scene, sceneSolids(scene))).map((mark) => [mark.label, mark.level])).toEqual([["Outlet free to lamp", "unknown"]]);
  });

  it("gives no link for an outlet that the room does not have", () => {
    const scene = sceneWith(
      [{ id: "free", wall: "south", face: "left", offset: 1, height: 0.3 }],
      [{ id: "lamp", kind: "lamp", size: [0.3, 0.3, 1.4], at: [2, 2], outlet: "gone" }],
    );
    expect(links(outletMarks(scene, sceneSolids(scene)))).toEqual([]);
  });

  it("gives no mark for an outlet or an object with no solid", () => {
    const scene = sceneWith(
      [
        { id: "free", wall: "south", face: "left", offset: 1, height: 0.3 },
        { id: "nowhere", wall: "no-wall", face: "left", offset: 1, height: 0.3 },
      ],
      [{ id: "lamp", kind: "lamp", size: [0.3, 0.3, 1.4], at: [2, 2], outlet: "free" }],
    );
    const solids = sceneSolids(scene);
    expect(outletMarks(scene, solids).map((mark) => mark.record)).toEqual(["outlet:free", "object:lamp"]);
    // With no solid of the object, the link has no end.
    const noObjects = solids.filter((solid) => solid.kind !== "object");
    expect(outletMarks(scene, noObjects).map((mark) => mark.record)).toEqual(["outlet:free"]);
    expect(outletMarks(scene, [])).toEqual([]);
  });

  it("uses the first record of an id", () => {
    const scene = sceneWith(
      [
        { id: "twice", wall: "south", face: "left", offset: 1, height: 0.3 },
        { id: "twice", wall: "south", face: "left", offset: 3, height: 0.3 },
      ],
      [
        { id: "lamp", kind: "lamp", size: [0.3, 0.3, 1.4], at: [2, 2], outlet: "twice" },
        { id: "lamp", kind: "lamp", size: [0.3, 0.3, 1.4], at: [4, 2], outlet: "twice" },
      ],
    );
    const marks = outletMarks(scene, sceneSolids(scene));
    expect(marks.map((mark) => mark.record)).toEqual(["outlet:twice", "object:lamp"]);
    expect(points(marks)[0]?.frame.at.x).toBeCloseTo(1, 9);
    expect(checkMarks(marks)).toEqual([]);
  });
});
