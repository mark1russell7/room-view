import { metersPer, planShapes, SCENE_SCHEMA, type PlanPoint, type SurveyResult } from "@mark1russell7/room-view";
import type { FeatureKind, FeatureSpan, ObjectMark } from "./draft.ts";

// The drawing of a walk for the page "Measure a room", as data. Each position is in pixels of the picture.
// The y axis of a plan points up, and that of a picture points down.

/** A position in the picture, in pixels. */
export type Pixel = readonly [x: number, y: number];

/** The size of the picture, in pixels. */
export interface PictureSize {
  readonly width: number;
  readonly height: number;
}

/** One wall of the drawing. */
export interface WalkWall {
  /** The position of the wall in the walk, from 0. */
  readonly side: number;
  readonly from: Pixel;
  readonly to: Pixel;
}

/** The length of a wall as text, next to the wall on the outer side of the room. */
export interface WalkLabel {
  readonly side: number;
  readonly at: Pixel;
  /** The part of the text that is at the position. */
  readonly anchor: "start" | "middle" | "end";
  readonly text: string;
}

/** A door, a window, an opening or an outlet of a wall of the drawing. */
export interface WalkFeature {
  /** The position of the wall in the walk, from 0. */
  readonly side: number;
  /** The key of the feature in the page. */
  readonly key: string;
  readonly kind: FeatureKind;
  /** The edge of the feature that is nearer to the start of its wall. An outlet has its center. */
  readonly from: Pixel;
  /** The edge of the feature that is nearer to the end of its wall. An outlet has its center. */
  readonly to: Pixel;
  /** The direction from the wall into the room: a vector with a length of 1. */
  readonly inner: Pixel;
  /** The measured distance: the line from a corner of the wall to the near edge of the feature. */
  readonly reach: readonly [corner: Pixel, edge: Pixel];
  /** The level of the fault of the place of the feature. */
  readonly fault: "error" | "warning" | undefined;
}

/** An object of the drawing: a piece of furniture or a piece of equipment, as a camera above the room sees it. */
export interface WalkObject {
  /** The position of the wall of the object in the walk, from 0. An object on a holder has the wall of the holder. */
  readonly side: number;
  /** The key of the object in the page. */
  readonly key: string;
  readonly kind: string;
  /** The outline of the object. */
  readonly ring: readonly Pixel[];
  /** The level of the object: 1 for an object against a wall, 2 for an object on such an object. */
  readonly level: number;
  /** The level of the fault of the place of the object. */
  readonly fault: "error" | "warning" | undefined;
}

/** The drawing of a walk. */
export interface WalkDrawing {
  readonly walls: readonly WalkWall[];
  /** The features of the walls. A feature on a wall with no length is not in the drawing. */
  readonly features: readonly WalkFeature[];
  /**
   * The objects of a closed room, from the object with the lowest top to the object with the highest top.
   * Thus a drawing in this sequence shows a display on a desk. An open walk has no objects.
   */
  readonly objects: readonly WalkObject[];
  /** The outline of the floor of a closed room. An open walk has no floor. */
  readonly floor: readonly Pixel[] | undefined;
  readonly labels: readonly WalkLabel[];
  /** The corner where the walk starts. */
  readonly start: Pixel;
  /** The direction of the first wall in the picture: a vector with a length of 1. A first wall with no length has none. */
  readonly heading: Pixel | undefined;
  /** The line from the end of an open walk to its start, with its label. */
  readonly gap: { readonly from: Pixel; readonly to: Pixel; readonly at: Pixel } | undefined;
}

/** The space between the drawing and the edge of the picture, in pixels. The labels of the walls are in this space. */
export const PICTURE_MARGIN = { x: 58, y: 34 };

/** The distance from a wall to its label, in pixels. */
const LABEL_DISTANCE = 13;

/** A wall shorter than this number of pixels has no label. */
const SHORTEST_LABEL = 26;

/** The gap of a walk below this number of pixels has no line. */
const SMALLEST_GAP = 3;

/** The space between a drawing and the edge of its picture, in pixels. */
export interface PictureMargin {
  readonly x: number;
  readonly y: number;
}

/**
 * This function gives the function that puts a point of a plan at a position of the picture.
 * The points fill the picture, with the margin at each edge. They keep their shape, and their center is the center of the picture.
 */
export function fitOf(points: readonly PlanPoint[], size: PictureSize, margin: PictureMargin): (point: PlanPoint) => Pixel {
  if (points.length === 0) return () => [size.width / 2, size.height / 2];
  let left = Infinity;
  let bottom = Infinity;
  let right = -Infinity;
  let top = -Infinity;
  for (const [x, y] of points) {
    left = Math.min(left, x);
    bottom = Math.min(bottom, y);
    right = Math.max(right, x);
    top = Math.max(top, y);
  }
  const wide = right - left;
  const high = top - bottom;
  const roomX = Math.max(size.width - 2 * margin.x, 1);
  const roomY = Math.max(size.height - 2 * margin.y, 1);
  // Points with no size get a scale of 1: each of them is the center of the picture.
  const scales = [wide > 0 ? roomX / wide : Infinity, high > 0 ? roomY / high : Infinity];
  const scale = Number.isFinite(Math.min(...scales)) ? Math.min(...scales) : 1;
  const offsetX = (size.width - wide * scale) / 2;
  const offsetY = (size.height - high * scale) / 2;
  return ([x, y]) => [offsetX + (x - left) * scale, size.height - offsetY - (y - bottom) * scale];
}

/**
 * This function gives the drawing of the result of a survey in a picture. `texts` has the label of each wall, and a wall with `undefined` has none.
 * `spans` has the place of each feature along its wall, and `marks` has each object of the survey record: the result of `objectMarks`.
 */
export function drawWalk(
  result: SurveyResult,
  size: PictureSize,
  texts: readonly (string | undefined)[],
  spans: readonly FeatureSpan[] = [],
  marks: readonly ObjectMark[] = [],
): WalkDrawing {
  return drawWalkAt(result, fitOf(result.closure.closed ? result.corners : result.walk, size, PICTURE_MARGIN), texts, spans, marks);
}

/**
 * This function gives the drawing of the result of a survey, as `drawWalk` does. `pixel` gives the position of each point of the plan in the picture.
 * Thus the drawings of two or more rooms can have one scale.
 */
export function drawWalkAt(
  result: SurveyResult,
  pixel: (point: PlanPoint) => Pixel,
  texts: readonly (string | undefined)[],
  spans: readonly FeatureSpan[] = [],
  marks: readonly ObjectMark[] = [],
): WalkDrawing {
  const closed = result.closure.closed;
  const count = result.room.walls.length;
  const points: readonly PlanPoint[] = closed ? result.corners : result.walk;

  const first = points[0] ?? [0, 0];
  const ends = (index: number): readonly [PlanPoint, PlanPoint] => [points[index] ?? first, points[closed ? (index + 1) % count : index + 1] ?? first];
  const walls = Array.from({ length: count }, (_, side): WalkWall => {
    const [from, to] = ends(side);
    return { side, from: pixel(from), to: pixel(to) };
  });

  // The wall of a walk to the left is on the right of the walk. In a picture, this side of the direction (x, y) is (-y, x).
  const outer = result.room.walls[0]?.side === "left" ? -1 : 1;
  const labels = walls.flatMap((wall): WalkLabel[] => {
    const text = texts[wall.side];
    const dx = wall.to[0] - wall.from[0];
    const dy = wall.to[1] - wall.from[1];
    const length = Math.hypot(dx, dy);
    if (text === undefined || length < SHORTEST_LABEL) return [];
    const nx = (outer * -dy) / length;
    const ny = (outer * dx) / length;
    const at: Pixel = [(wall.from[0] + wall.to[0]) / 2 + nx * LABEL_DISTANCE, (wall.from[1] + wall.to[1]) / 2 + ny * LABEL_DISTANCE];
    return [{ side: wall.side, at, anchor: nx > 0.5 ? "start" : nx < -0.5 ? "end" : "middle", text }];
  });

  // The room is on the side of a wall that is opposite to its labels.
  const features = spans.flatMap((span): WalkFeature[] => {
    const wall = walls[span.side];
    if (wall === undefined) return [];
    const dx = wall.to[0] - wall.from[0];
    const dy = wall.to[1] - wall.from[1];
    const length = Math.hypot(dx, dy);
    if (!(length > 0)) return [];
    const at = (part: number): Pixel => [wall.from[0] + dx * part, wall.from[1] + dy * part];
    const from = at(span.from);
    const to = at(span.to);
    const inner: Pixel = [(outer * dy) / length, (outer * (0 - dx)) / length];
    return [{ side: span.side, key: span.key, kind: span.kind, from, to, inner, reach: span.corner === "start" ? [wall.from, from] : [wall.to, to], fault: span.fault }];
  });

  const start = pixel(first);
  const lead = walls.find((wall) => Math.hypot(wall.to[0] - wall.from[0], wall.to[1] - wall.from[1]) > 0);
  const heading = lead === undefined || lead.side !== 0 ? undefined : unit(lead);
  const end = pixel(points.at(-1) ?? first);
  const open = !closed && Math.hypot(end[0] - start[0], end[1] - start[1]) >= SMALLEST_GAP;
  const gap = open ? { from: end, to: start, at: [(end[0] + start[0]) / 2, (end[1] + start[1]) / 2] as const } : undefined;

  return { walls, features, objects: closed ? objectsOf(result, pixel, marks) : [], floor: closed ? result.corners.map(pixel) : undefined, labels, start, heading, gap };
}

/**
 * This function gives the objects of the drawing of a closed room. Each object of `marks` with a box in the model of the room is in it.
 * The outline of a box comes from `planShapes`, in meters, so the function changes it to the unit of the room before `pixel`.
 */
function objectsOf(result: SurveyResult, pixel: (point: PlanPoint) => Pixel, marks: readonly ObjectMark[]): readonly WalkObject[] {
  if (marks.length === 0 || result.objects.length === 0) return [];
  const byId = new Map(marks.map((mark): [string, ObjectMark] => [mark.id, mark]));
  const scale = metersPer(result.room.unit);
  return planShapes({ schema: SCENE_SCHEMA, room: result.room, objects: result.objects }).flatMap((shape): WalkObject[] => {
    const mark = shape.kind === "object" ? byId.get(shape.source) : undefined;
    if (mark === undefined) return [];
    const ring = shape.ring.map(([x, y]) => pixel([x / scale, y / scale]));
    return [{ side: mark.side, key: mark.key, kind: mark.kind, ring, level: mark.level, fault: mark.fault }];
  });
}

function unit(wall: WalkWall): Pixel {
  const dx = wall.to[0] - wall.from[0];
  const dy = wall.to[1] - wall.from[1];
  const length = Math.hypot(dx, dy);
  return [dx / length, dy / length];
}

/** This function gives a line through positions as the data of a path. */
export function pathOf(points: readonly Pixel[], close: boolean): string {
  const line = points.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  return close ? `${line} Z` : line;
}
