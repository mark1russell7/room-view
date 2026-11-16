import { planShapes, SHAPE_OUTLINES, type LevelShape, type PlanShape } from "@mark1russell7/room-view";
import { SAMPLE_SCENE } from "@mark1russell7/room-view/sample";
import { describe, expect, it } from "vitest";
import { signPath } from "./plan.ts";

/** This function gives the corners of a path, with the y axis up. */
function cornersOf(path: string): readonly (readonly [number, number])[] {
  return [...path.matchAll(/[ML](-?[\d.e-]+) (-?[\d.e-]+)/g)].map((found) => [Number(found[1]), 0 - Number(found[2])] as const);
}

function outletShape(source: string): PlanShape {
  const shape = planShapes(SAMPLE_SCENE).find((item) => item.kind === "outlet" && item.source === source);
  if (shape === undefined) throw new Error(`The plan has no outlet ${source}.`);
  return shape;
}

describe("signPath", () => {
  // This outlet is 2.4 m along the south wall, and its plate goes 12 mm into the room.
  const south = outletShape("south-1");

  it("puts each corner of a sign at the radius of its outline, around the center of the outlet", () => {
    const signs: readonly LevelShape[] = ["ring", "disc", "triangle", "square"];
    for (const sign of signs) {
      const corners = cornersOf(signPath(south, sign, 1));
      expect(corners.length, sign).toBe(SHAPE_OUTLINES[sign].sides);
      for (const [x, y] of corners) expect(Math.hypot(x - 2.4, y - 0.006), sign).toBeCloseTo(0.09 * SHAPE_OUTLINES[sign].radius, 9);
    }
  });

  it("points a triangle up in the picture, where the y axis points down", () => {
    const path = signPath(south, "triangle", 1);
    expect(path.endsWith(" Z")).toBe(true);
    const [first] = cornersOf(path);
    expect(first?.[0]).toBeCloseTo(2.4, 9);
    expect(first?.[1]).toBeCloseTo(0.006 + 0.09 * SHAPE_OUTLINES.triangle.radius, 9);
    // The first number pair of the path has a negative y value: the corner is above the center in the picture.
    expect(Number(/^M\S+ (\S+)/.exec(path)?.[1])).toBeLessThan(0);
  });

  it("changes the size with the factor", () => {
    const [corner] = cornersOf(signPath(south, "square", 1.5));
    expect(Math.hypot((corner?.[0] ?? 0) - 2.4, (corner?.[1] ?? 0) - 0.006)).toBeCloseTo(0.09 * 1.5 * SHAPE_OUTLINES.square.radius, 9);
  });
});
