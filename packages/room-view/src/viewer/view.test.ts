import { transformPoint3, type Point3 } from "@mark1russell7/layout-contract";
import { viewAxes } from "@mark1russell7/visuals";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { TO_Y_UP } from "../solids.ts";
import { HOME_VIEW, TOP_VIEW, toRoom, toViewer } from "./view.ts";

const close = (point: Point3): unknown => ({ x: expect.closeTo(point.x, 9), y: expect.closeTo(point.y, 9), z: expect.closeTo(point.z, 9) });

const coordinate = fc.double({ min: -50, max: 50, noNaN: true });
const anyPoint = fc.record({ x: coordinate, y: coordinate, z: coordinate });

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

describe("the views of a room", () => {
  it("put north at the top of the plan view, and east at its right side", () => {
    const { back, right, up } = viewAxes(TOP_VIEW);
    expect(toRoom(back)).toEqual(close({ x: 0, y: 0, z: 1 }));
    expect(toRoom(up)).toEqual(close({ x: 0, y: 1, z: 0 }));
    expect(toRoom(right)).toEqual(close({ x: 1, y: 0, z: 0 }));
  });

  it("put the home camera to the south-east of the room and above it", () => {
    const back = toRoom(viewAxes(HOME_VIEW).back);
    expect(back.x).toBeGreaterThan(0);
    expect(back.y).toBeLessThan(0);
    expect(back.z).toBeGreaterThan(0);
  });
});
