import { describe, expect, it } from "vitest";
import { LEVEL_SHAPES, LOAD_LEVELS, levelShape, SHAPE_OUTLINES } from "../loads.ts";
import { disposeLink, disposeMarker, haloScale, makeLink, makeMarker, MARKER_RADIUS } from "./markers.ts";

/** This function gives the largest distance of a corner of a geometry from its center, in the plane of x and y. */
function reach(positions: ArrayLike<number>): number {
  let far = 0;
  for (let index = 0; index + 2 < positions.length; index += 3) far = Math.max(far, Math.hypot(positions[index] ?? 0, positions[index + 1] ?? 0));
  return far;
}

describe("haloScale", () => {
  it("gives a line of one width around each shape", () => {
    for (const shape of LEVEL_SHAPES) {
      const { radius, sides } = SHAPE_OUTLINES[shape];
      // The distance from the center to the middle of a side.
      const inner = radius * Math.cos(Math.PI / sides);
      expect(inner * (haloScale(shape) - 1), shape).toBeCloseTo(0.36, 9);
    }
  });
});

describe("makeMarker", () => {
  it("puts the marker at the point, with the shape of the level", () => {
    for (const level of [...LOAD_LEVELS, undefined]) {
      const marker = makeMarker({ x: 1, y: 2, z: 3 }, level);
      expect(marker.shape).toBe(levelShape(level));
      expect([marker.root.position.x, marker.root.position.y, marker.root.position.z]).toEqual([1, 2, 3]);
      expect(marker.radius).toBe(MARKER_RADIUS);
      expect(marker.hidden).toBe(false);
      disposeMarker(marker);
    }
  });

  it("makes a sign with the radius of its outline, and a larger line around it", () => {
    for (const level of LOAD_LEVELS) {
      const marker = makeMarker({ x: 0, y: 0, z: 0 }, level);
      const outline = SHAPE_OUTLINES[marker.shape];
      expect(reach(marker.front.geometry.getAttribute("position").array), level).toBeCloseTo(outline.radius, 6);
      expect(reach(marker.back.geometry.getAttribute("position").array), level).toBeCloseTo(outline.radius, 6);
      expect(marker.back.scale.x, level).toBeCloseTo(haloScale(marker.shape), 9);
      expect(marker.front.scale.x, level).toBe(1);
      disposeMarker(marker);
    }
  });

  it("draws the line before the sign, and the solids do not hide them", () => {
    const marker = makeMarker({ x: 0, y: 0, z: 0 }, "near");
    expect(marker.root.children).toEqual([marker.back, marker.front]);
    for (const mesh of [marker.back, marker.front]) {
      expect(mesh.material.depthTest).toBe(false);
      expect(mesh.material.depthWrite).toBe(false);
      expect(mesh.material.transparent).toBe(true);
      expect(mesh.renderOrder).toBeGreaterThan(0);
    }
    disposeMarker(marker);
    expect(marker.root.children).toEqual([]);
  });

  it("makes a ring with a hole, and each other sign with no hole", () => {
    const ring = makeMarker({ x: 0, y: 0, z: 0 }, undefined);
    const disc = makeMarker({ x: 0, y: 0, z: 0 }, "ok");
    const near = (positions: ArrayLike<number>): number => {
      let least = Infinity;
      for (let index = 0; index + 2 < positions.length; index += 3) least = Math.min(least, Math.hypot(positions[index] ?? 0, positions[index + 1] ?? 0));
      return least;
    };
    expect(near(ring.front.geometry.getAttribute("position").array)).toBeCloseTo(SHAPE_OUTLINES.ring.hole, 6);
    // A disc has a corner at its center.
    expect(near(disc.front.geometry.getAttribute("position").array)).toBe(0);
    disposeMarker(ring);
    disposeMarker(disc);
  });
});

describe("makeLink", () => {
  it("makes a hidden line with dashes between the two points", () => {
    const link = makeLink("outlet:a", "object:b", "over", { x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 0 });
    expect([link.outlet, link.object, link.level]).toEqual(["outlet:a", "object:b", "over"]);
    expect(link.line.visible).toBe(false);
    expect(link.line.material.dashed).toBe(true);
    expect(link.line.material.depthTest).toBe(false);
    const start = link.line.geometry.getAttribute("instanceStart");
    const end = link.line.geometry.getAttribute("instanceEnd");
    expect([start.getX(0), start.getY(0), start.getZ(0)]).toEqual([0, 0, 0]);
    expect([end.getX(0), end.getY(0), end.getZ(0)]).toEqual([3, 4, 0]);
    // The distance along the line gives the dashes their places.
    expect(link.line.geometry.getAttribute("instanceDistanceEnd").getX(0)).toBeCloseTo(5, 6);
    disposeLink(link);
  });
});
