import { regionArea } from "@mark1russell7/layout-contract";
import { describe, expect, it } from "vitest";
import { planShape, planShapes } from "./plan.ts";
import type { Scene } from "./room.ts";
import { SAMPLE_SCENE } from "./sample.ts";
import { sceneSolids, solidCorners, solidVolume } from "./solids.ts";

const areaOf = (ring: readonly (readonly [number, number])[]): number => regionArea({ kind: "polygon", points: ring });

describe("planShape", () => {
  it("gives an outline with the area of the solid from above, between its bottom and its top", () => {
    for (const solid of sceneSolids(SAMPLE_SCENE)) {
      const shape = planShape(solid);
      const heights = solidCorners(solid).map((corner) => corner.z);
      expect(shape.bottom, solid.id).toBeCloseTo(Math.min(...heights), 9);
      expect(shape.top, solid.id).toBeCloseTo(Math.max(...heights), 9);
      expect(areaOf(shape.ring) * (shape.top - shape.bottom), solid.id).toBeCloseTo(solidVolume(solid), 9);
      expect([shape.solid, shape.kind, shape.source]).toEqual([solid.id, solid.kind, solid.source]);
    }
  });

  it("has each corner of the outline below or above a corner of the solid", () => {
    for (const solid of sceneSolids(SAMPLE_SCENE)) {
      const corners = solidCorners(solid);
      for (const [x, y] of planShape(solid).ring) {
        const near = Math.min(...corners.map((corner) => Math.hypot(corner.x - x, corner.y - y)));
        expect(near, solid.id).toBeLessThan(1e-9);
      }
    }
  });

  it("turns the outline of an object with its turn, in the unit of the room", () => {
    const scene: Scene = {
      schema: "scene/1",
      room: { schema: "room/1", unit: "cm", height: 240, wallThickness: 10, walls: [] },
      objects: [{ id: "box", kind: "box", size: [200, 100, 50], at: [300, 400], lift: 20, turn: 90 }],
    };
    const [shape] = planShapes(scene);
    const xs = shape!.ring.map(([x]) => x);
    const ys = shape!.ring.map(([, y]) => y);
    // After a turn of 90 degrees, the side of 2 m is along the y axis.
    expect([Math.min(...xs), Math.max(...xs)]).toEqual([expect.closeTo(2.5, 9), expect.closeTo(3.5, 9)]);
    expect([Math.min(...ys), Math.max(...ys)]).toEqual([expect.closeTo(3, 9), expect.closeTo(5, 9)]);
    expect([shape!.bottom, shape!.top]).toEqual([expect.closeTo(0.2, 9), expect.closeTo(0.7, 9)]);
  });
});

describe("planShapes", () => {
  const shapes = planShapes(SAMPLE_SCENE);

  it("gives one outline for each solid", () => {
    expect(shapes.map((shape) => shape.solid).sort()).toEqual(sceneSolids(SAMPLE_SCENE).map((solid) => solid.id).sort());
  });

  it("goes from the lowest top to the highest top, so that the floor is first", () => {
    const tops = shapes.map((shape) => shape.top);
    expect(tops).toEqual([...tops].sort((a, b) => a - b));
    expect(shapes[0]!.kind).toBe("floor");
    expect(shapes.at(-1)!.kind).toBe("wall");
  });

  it("puts an object on a second object after that object", () => {
    const ids = shapes.map((shape) => shape.solid);
    expect(ids.indexOf("object:display")).toBeGreaterThan(ids.indexOf("object:desk"));
    expect(ids.indexOf("object:rack")).toBeGreaterThan(ids.indexOf("object:node-4"));
  });

  it("has only the solids with a bottom below the cut", () => {
    const cut = planShapes(SAMPLE_SCENE, { cut: 1.2 });
    const ids = cut.map((shape) => shape.solid);
    expect(cut.every((shape) => shape.bottom < 1.2)).toBe(true);
    // The glass of a window starts at 0.9 m, and the part of the wall above a door starts at 2.05 m.
    expect(ids).toContain("glass:window-east");
    const above = shapes.filter((shape) => shape.bottom >= 1.2);
    expect(above.map((shape) => shape.source).sort()).toEqual(["east", "south", "west"]);
    expect(above.every((shape) => shape.kind === "wall")).toBe(true);
    expect(cut.length).toBe(shapes.length - above.length);
    // Each wall starts at the bottom of the floor. Thus a cut at the top of the floor keeps the floor and the low part of each wall.
    const low = planShapes(SAMPLE_SCENE, { cut: 0 });
    expect(low).toEqual(shapes.filter((shape) => shape.bottom < 0));
    expect(low[0]).toEqual(shapes[0]);
    expect(low.every((shape) => shape.kind === "floor" || shape.kind === "wall")).toBe(true);
    expect(planShapes(SAMPLE_SCENE, { cut: -1 })).toEqual([]);
  });

  it("gives no outline for a scene with no solid", () => {
    expect(planShapes({ schema: "scene/1", room: { schema: "room/1", unit: "m", height: 2.4, wallThickness: 0.1, walls: [] } })).toEqual([]);
  });
});
