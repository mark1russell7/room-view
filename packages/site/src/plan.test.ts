import { ELECTRICAL_SCHEMA } from "@mark1russell7/electrical";
import { electricalMarks } from "@mark1russell7/electrical/marks";
import { SAMPLE_ELECTRICAL_SCENE, SAMPLE_SCENE_LAYER } from "@mark1russell7/electrical/sample";
import { recordName, sceneSpace } from "@mark1russell7/room-view";
import { SHAPE_OUTLINES, type LevelShape, type PointMark } from "@mark1russell7/visuals/marks";
import { describe, expect, it } from "vitest";
import { signPath } from "./plan.ts";

/** This function gives the corners of a path, with the y axis up. */
function cornersOf(path: string): readonly (readonly [number, number])[] {
  return [...path.matchAll(/[ML](-?[\d.e-]+) (-?[\d.e-]+)/g)].map((found) => [Number(found[1]), 0 - Number(found[2])] as const);
}

/** This function gives the point mark of an outlet of the sample room. */
function outletMark(id: string): PointMark {
  const marks = electricalMarks(SAMPLE_SCENE_LAYER, sceneSpace(SAMPLE_ELECTRICAL_SCENE));
  const mark = marks.find((item): item is PointMark => item.type === "point" && item.record === recordName(ELECTRICAL_SCHEMA, id));
  if (mark === undefined) throw new Error(`The marks have no outlet ${id}.`);
  return mark;
}

describe("signPath", () => {
  // This outlet is 2.4 m along the south wall, on the face of the wall in the room.
  const south = outletMark("south-1");
  const center = [south.frame.at.x, south.frame.at.y] as const;

  it("gets the point of the outlet from the mark of the electrical add-on", () => {
    expect(center[0]).toBeCloseTo(2.4, 9);
    expect(center[1]).toBeCloseTo(0, 9);
  });

  it("puts each corner of a sign at the radius of its outline, around the point", () => {
    const signs: readonly LevelShape[] = ["ring", "disc", "triangle", "square"];
    for (const sign of signs) {
      const corners = cornersOf(signPath(center, sign, 1));
      expect(corners.length, sign).toBe(SHAPE_OUTLINES[sign].sides);
      for (const [x, y] of corners) expect(Math.hypot(x - center[0], y - center[1]), sign).toBeCloseTo(0.09 * SHAPE_OUTLINES[sign].radius, 9);
    }
  });

  it("points a triangle up in the picture, where the y axis points down", () => {
    const path = signPath(center, "triangle", 1);
    expect(path.endsWith(" Z")).toBe(true);
    const [first] = cornersOf(path);
    expect(first?.[0]).toBeCloseTo(center[0], 9);
    expect(first?.[1]).toBeCloseTo(center[1] + 0.09 * SHAPE_OUTLINES.triangle.radius, 9);
    // The first number pair of the path has a negative y value: the corner is above the center in the picture.
    expect(Number(/^M\S+ (\S+)/.exec(path)?.[1])).toBeLessThan(0);
  });

  it("changes the size with the factor", () => {
    const [corner] = cornersOf(signPath(center, "square", 1.5));
    expect(Math.hypot((corner?.[0] ?? 0) - center[0], (corner?.[1] ?? 0) - center[1])).toBeCloseTo(0.09 * 1.5 * SHAPE_OUTLINES.square.radius, 9);
  });
});
