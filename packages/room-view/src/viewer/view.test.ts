import { transformPoint3, type Point3 } from "@mark1russell7/layout-contract";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { TO_Y_UP } from "../solids.ts";
import { cameraPosition, fitDistance, HOME_VIEW, TOP_VIEW, toRoom, toViewer, turnBetween, viewAxes, viewOf, type ViewAngles } from "./view.ts";

const dot = (a: Point3, b: Point3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Point3, b: Point3): Point3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const minus = (a: Point3, b: Point3): Point3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const close = (point: Point3): unknown => ({ x: expect.closeTo(point.x, 9), y: expect.closeTo(point.y, 9), z: expect.closeTo(point.z, 9) });

const coordinate = fc.double({ min: -50, max: 50, noNaN: true });
const anyPoint = fc.record({ x: coordinate, y: coordinate, z: coordinate });
const anyView: fc.Arbitrary<ViewAngles> = fc.record({
  polar: fc.double({ min: 0.01, max: Math.PI - 0.01, noNaN: true }),
  azimuth: fc.double({ min: -3.14, max: 3.14, noNaN: true }),
});

describe("toViewer and toRoom", () => {
  it("are the rotation TO_Y_UP and its inverse", () => {
    fc.assert(
      fc.property(anyPoint, (point) => {
        expect(toViewer(point)).toEqual(close(transformPoint3(TO_Y_UP, point)));
        expect(toRoom(toViewer(point))).toEqual(close(point));
      }),
    );
  });

  it("put the height of the room on the y axis of the viewer", () => {
    expect(toViewer({ x: 1, y: 2, z: 3 })).toEqual({ x: 1, y: 3, z: -2 });
  });
});

describe("viewAxes", () => {
  it("gives three unit vectors at right angles, with the right side, the top and the back in the sequence of a right hand", () => {
    fc.assert(
      fc.property(anyView, (view) => {
        const { back, right, up } = viewAxes(view);
        for (const axis of [back, right, up]) expect(dot(axis, axis)).toBeCloseTo(1, 9);
        expect(dot(back, right)).toBeCloseTo(0, 9);
        expect(dot(back, up)).toBeCloseTo(0, 9);
        expect(dot(right, up)).toBeCloseTo(0, 9);
        expect(cross(right, up)).toEqual(close(back));
      }),
    );
  });

  it("puts north at the top of the plan view, and east at its right side", () => {
    const { back, right, up } = viewAxes(TOP_VIEW);
    expect(toRoom(back)).toEqual(close({ x: 0, y: 0, z: 1 }));
    expect(toRoom(up)).toEqual(close({ x: 0, y: 1, z: 0 }));
    expect(toRoom(right)).toEqual(close({ x: 1, y: 0, z: 0 }));
  });

  it("puts the home camera to the south-east of the room and above it", () => {
    const back = toRoom(viewAxes(HOME_VIEW).back);
    expect(back.x).toBeGreaterThan(0);
    expect(back.y).toBeLessThan(0);
    expect(back.z).toBeGreaterThan(0);
  });
});

describe("fitDistance", () => {
  it("gives the distance at which the widest side of a plan fills the picture", () => {
    const corners = [
      { x: -2, y: 0, z: -1 },
      { x: 2, y: 0, z: -1 },
      { x: 2, y: 0, z: 1 },
      { x: -2, y: 0, z: 1 },
    ];
    const origin = { x: 0, y: 0, z: 0 };
    // At 90 degrees, the picture shows as much above its center as the distance. The depth is the limit for a square picture.
    expect(fitDistance(corners, origin, TOP_VIEW, 90, 1)).toBeCloseTo(2, 9);
    expect(fitDistance(corners, origin, TOP_VIEW, 90, 2)).toBeCloseTo(1, 9);
    expect(fitDistance(corners, origin, TOP_VIEW, 90, 4)).toBeCloseTo(1, 9);
  });

  it("adds the height of a point above the target", () => {
    expect(fitDistance([{ x: 1, y: 3, z: 0 }], { x: 0, y: 0, z: 0 }, TOP_VIEW, 90, 1)).toBeCloseTo(4, 9);
  });

  it("gives a camera that shows each point, with one point on an edge of the picture", () => {
    fc.assert(
      fc.property(fc.array(anyPoint, { minLength: 1, maxLength: 12 }), anyPoint, anyView, fc.double({ min: 10, max: 100, noNaN: true }), fc.double({ min: 0.3, max: 3, noNaN: true }), (points, target, view, fov, aspect) => {
        const distance = fitDistance(points, target, view, fov, aspect);
        fc.pre(distance > 1e-6);
        const axes = viewAxes(view);
        const camera = cameraPosition(target, view, distance);
        const tanUp = Math.tan((fov * Math.PI) / 360);
        let fullest = 0;
        for (const point of points) {
          const from = minus(point, camera);
          const depth = 0 - dot(from, axes.back);
          expect(depth).toBeGreaterThan(-1e-9);
          const reach = Math.max(Math.abs(dot(from, axes.right)) / (tanUp * aspect), Math.abs(dot(from, axes.up)) / tanUp);
          expect(reach).toBeLessThanOrEqual(depth + 1e-9);
          fullest = Math.max(fullest, reach - depth);
        }
        expect(fullest).toBeCloseTo(0, 6);
      }),
    );
  });

  it("gives 0 for no points, and for an angle or an aspect that makes no picture", () => {
    const origin = { x: 0, y: 0, z: 0 };
    const point = [{ x: 1, y: 1, z: 1 }];
    expect(fitDistance([], origin, HOME_VIEW, 32, 1.5)).toBe(0);
    expect(fitDistance(point, origin, HOME_VIEW, 0, 1.5)).toBe(0);
    expect(fitDistance(point, origin, HOME_VIEW, 32, 0)).toBe(0);
    expect(fitDistance(point, origin, HOME_VIEW, Number.NaN, 1.5)).toBe(0);
    expect(fitDistance(point, origin, HOME_VIEW, 32, Infinity)).toBe(0);
  });
});

describe("viewOf", () => {
  it("gives the view and the distance of a camera from cameraPosition", () => {
    fc.assert(
      fc.property(anyPoint, anyView, fc.double({ min: 0.1, max: 200, noNaN: true }), (target, view, distance) => {
        const found = viewOf(cameraPosition(target, view, distance), target);
        expect(found.polar).toBeCloseTo(view.polar, 6);
        expect(turnBetween(found.azimuth, view.azimuth)).toBeCloseTo(0, 6);
        expect(found.distance).toBeCloseTo(distance, 6);
      }),
    );
  });

  it("gives the angles 0 for a camera at the target", () => {
    expect(viewOf({ x: 1, y: 2, z: 3 }, { x: 1, y: 2, z: 3 })).toEqual({ polar: 0, azimuth: 0, distance: 0 });
  });
});

describe("turnBetween", () => {
  it("gives the shortest turn", () => {
    expect(turnBetween(0, Math.PI / 2)).toBeCloseTo(Math.PI / 2, 12);
    expect(turnBetween(0, (3 * Math.PI) / 2)).toBeCloseTo(0 - Math.PI / 2, 12);
    expect(turnBetween(3, -3)).toBeCloseTo(2 * Math.PI - 6, 12);
    expect(turnBetween(1, 1 + 4 * Math.PI)).toBeCloseTo(0, 12);
  });

  it("gives a turn of half a circle at most, that goes from the first angle to the second", () => {
    fc.assert(
      fc.property(fc.double({ min: -20, max: 20, noNaN: true }), fc.double({ min: -20, max: 20, noNaN: true }), (from, to) => {
        const turn = turnBetween(from, to);
        expect(Math.abs(turn)).toBeLessThanOrEqual(Math.PI + 1e-12);
        expect(Math.cos(from + turn)).toBeCloseTo(Math.cos(to), 9);
        expect(Math.sin(from + turn)).toBeCloseTo(Math.sin(to), 9);
      }),
    );
  });
});
