import type { PlanPoint } from "../room.ts";
import { lineLength, penOf, type SheetLine } from "./sheet.ts";

/** Two parallel lines at a distance from each other. */
export interface LinePair {
  /** The position of the first line. */
  readonly a: number;
  /** The position of the second line. */
  readonly b: number;
  /** The distance between the two lines. */
  readonly distance: number;
  /** The length of the common part of the two lines, along their direction. */
  readonly overlap: number;
}

/** The pairs of `parallelPairs`, and the number of partners on each side of each line. */
export interface PairSearch {
  readonly pairs: readonly LinePair[];
  /** The partners of line `i` on its left side are at `2 * i`, and on its right side at `2 * i + 1`. */
  readonly sides: Int32Array;
}

/** This function gives the direction of a line, from 0 to pi. */
function angleOf(line: SheetLine): number {
  let angle = Math.atan2(line.to[1] - line.from[1], line.to[0] - line.from[0]);
  if (angle < 0) angle += Math.PI;
  if (angle >= Math.PI) angle -= Math.PI;
  return angle;
}

/** The place of a line in the frame of a direction: its offset across the direction, and its range along it. */
interface Frame {
  readonly offset: number;
  readonly low: number;
  readonly high: number;
}

/** This function gives the place of a line in the frame of the unit direction (`ux`, `uy`). */
function frameOf(line: SheetLine, ux: number, uy: number): Frame {
  const offset = (-uy * (line.from[0] + line.to[0])) / 2 + (ux * (line.from[1] + line.to[1])) / 2;
  const t0 = ux * line.from[0] + uy * line.from[1];
  const t1 = ux * line.to[0] + uy * line.to[1];
  return { offset, low: Math.min(t0, t1), high: Math.max(t0, t1) };
}

/**
 * This function finds the pairs of parallel lines with a distance from `nearest` to `farthest`, and a common part of `overlap` or more.
 * Two lines are parallel when their directions differ by `tolerance` radians or less. The lines go in buckets by direction, so the search is fast.
 */
export function parallelPairs(lines: readonly SheetLine[], nearest: number, farthest: number, overlap: number, tolerance = 0.0175): PairSearch {
  const count = Math.round(Math.PI / tolerance);
  const buckets = new Map<number, { index: number; angle: number; offset: number }[]>();
  lines.forEach((line, index) => {
    const angle = angleOf(line);
    const key = Math.round(angle / tolerance) % count;
    const theta = key * tolerance;
    const { offset } = frameOf(line, Math.cos(theta), Math.sin(theta));
    const bucket = buckets.get(key) ?? [];
    bucket.push({ index, angle, offset });
    buckets.set(key, bucket);
  });
  for (const bucket of buckets.values()) bucket.sort((p, q) => p.offset - q.offset);
  const pairs: LinePair[] = [];
  const sides = new Int32Array(lines.length * 2);
  const slack = 3;
  const lower = (list: readonly { offset: number }[], value: number): number => {
    let low = 0;
    let high = list.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (list[middle]!.offset < value) low = middle + 1;
      else high = middle;
    }
    return low;
  };
  for (const [key, bucket] of buckets) {
    for (const next of [key, (key + 1) % count]) {
      const other = buckets.get(next);
      if (other === undefined || (next === key && count === 1)) continue;
      for (const p of bucket) {
        const ux = Math.cos(p.angle);
        const uy = Math.sin(p.angle);
        const pp = frameOf(lines[p.index]!, ux, uy);
        for (let j = lower(other, p.offset - farthest - slack); j < other.length && other[j]!.offset <= p.offset + farthest + slack; j++) {
          const q = other[j]!;
          if (next === key && q.index <= p.index) continue;
          let turn = Math.abs(q.angle - p.angle);
          if (turn > Math.PI / 2) turn = Math.PI - turn;
          if (turn > tolerance) continue;
          const qq = frameOf(lines[q.index]!, ux, uy);
          const across = qq.offset - pp.offset;
          const distance = Math.abs(across);
          if (distance < nearest || distance > farthest) continue;
          const common = Math.min(pp.high, qq.high) - Math.max(pp.low, qq.low);
          if (common < overlap) continue;
          pairs.push({ a: p.index, b: q.index, distance, overlap: common });
          sides[p.index * 2 + (across > 0 ? 0 : 1)]!++;
          sides[q.index * 2 + (across > 0 ? 1 : 0)]!++;
        }
      }
    }
  }
  return { pairs, sides };
}

/** The options of the search for walls. Each length is in the unit of the sheet. */
export interface WallOptions {
  /** The smallest thickness of a wall. The default is 0.25 ft. */
  readonly thinnest?: number | undefined;
  /** The largest thickness of a wall. The default is 1.5 ft. */
  readonly thickest?: number | undefined;
  /** The length of a long line of a pen. The pairs of the long lines tell if a pen is a wall pen. The default is 1.5 ft. */
  readonly longLine?: number | undefined;
  /** The smallest number of long lines of a wall pen. The default is 8. */
  readonly fewestLines?: number | undefined;
  /** The smallest sum of the lengths of the paired long lines of a wall pen. The default is 40 ft. */
  readonly leastLength?: number | undefined;
  /** The smallest common length of the two faces of one wall. The default is 1 ft. */
  readonly shortestWall?: number | undefined;
  /** The read of the wall lines. `pens` takes only the lines of the wall pens. `lines` also takes the wall faces of the other pens. The default is `lines`. */
  readonly read?: WallRead | undefined;
  /** A pen with a smaller part of one-side lines is a pattern pen, for example a hatch or glazing. Its lines are not wall faces. The default is 0.4. */
  readonly patternSide?: number | undefined;
  /** This value is true when a wall face can have its partner in a different pen. The default is true. */
  readonly crossPens?: boolean | undefined;
  /** This value is true when the glazing lines of the pattern pens close the rooms. The default is true. */
  readonly glazing?: boolean | undefined;
  /** The largest gap at an open end of a wall line that the import closes. The value 0 closes no gap. The default is 1 ft. */
  readonly snap?: number | undefined;
}

/** These are the reads of the wall lines. `pens` takes the wall pens only. `lines` also takes the wall faces of the other pens. */
export const WALL_READS: readonly ["pens", "lines"] = ["pens", "lines"];

/** A read of the wall lines. */
export type WallRead = (typeof WALL_READS)[number];

/** The read of one pen of a sheet. */
export interface PenRead {
  /** The name of the pen, as `penOf` gives it. */
  readonly pen: string;
  /** The number of long straight lines of the pen. */
  readonly lines: number;
  /** The part of the long lines with a parallel partner at the distance of a wall, from 0 to 1. */
  readonly paired: number;
  /** The part of the paired lines with partners on one side only, from 0 to 1. The face of a wall has a partner on one side. */
  readonly oneSide: number;
  /** The sum of the lengths of the paired lines, in the `unit` of the sheet. */
  readonly length: number;
  /** The part of the length of all the straight lines of the pen that is in the paired lines, from 0 to 1. A pen of short lines, as a hatch or text, has a small part. */
  readonly lengthShare: number;
  /** This value is true when the pen draws walls. */
  readonly wall: boolean;
}

/** The limits of the search for walls, in the units of the sheet. */
export interface WallLimits {
  readonly thinnest: number;
  readonly thickest: number;
  readonly longLine: number;
  readonly fewestLines: number;
  readonly leastLength: number;
  readonly shortestWall: number;
  /** The read of the wall lines. The default is `lines`. */
  readonly read?: WallRead | undefined;
  /** The largest part of one-side lines of a pattern pen. The default is 0.4. */
  readonly patternSide?: number | undefined;
  /** This value is true when a wall face can have its partner in a different pen. The default is true. */
  readonly crossPens?: boolean | undefined;
  /** This value is true when the glazing lines close the rooms. The default is true. */
  readonly glazing?: boolean | undefined;
  /** Two ends touch when the distance between them is this value or less. The default is `thinnest`. */
  readonly touch?: number | undefined;
}

/**
 * This function reads each pen of the straight lines of a sheet.
 * A pen is a wall pen when most of its long lines have a parallel partner at the distance of a wall thickness.
 * Also, most of the paired lines of a wall pen have the partner on one side only.
 * Also, the paired lines hold most of the length of all the straight lines of the pen. Thus a hatch with some paired lines is not a wall pen.
 *
 * The limits are in the units of the sheet. The pens with the most lines come first.
 */
export function readPens(lines: readonly SheetLine[], limits: WallLimits, scale: number): readonly PenRead[] {
  const byPen = new Map<string, SheetLine[]>();
  const straight = new Map<string, number>();
  for (const line of lines) {
    if (line.curve === true) continue;
    const pen = penOf(line);
    straight.set(pen, (straight.get(pen) ?? 0) + lineLength(line));
    if (lineLength(line) < limits.longLine) continue;
    const list = byPen.get(pen) ?? [];
    list.push(line);
    byPen.set(pen, list);
  }
  const reads: PenRead[] = [];
  for (const [pen, list] of byPen) {
    if (list.length < limits.fewestLines) {
      reads.push({ pen, lines: list.length, paired: 0, oneSide: 0, length: 0, lengthShare: 0, wall: false });
      continue;
    }
    const { sides } = parallelPairs(list, limits.thinnest, limits.thickest, limits.longLine);
    let paired = 0;
    let oneSide = 0;
    let length = 0;
    list.forEach((line, index) => {
      const left = sides[2 * index]!;
      const right = sides[2 * index + 1]!;
      if (left === 0 && right === 0) return;
      paired++;
      length += lineLength(line);
      if (left === 0 || right === 0) oneSide++;
    });
    const share = paired / list.length;
    const single = paired === 0 ? 0 : oneSide / paired;
    const lengthShare = length / straight.get(pen)!;
    const wall = share >= 0.5 && single >= 0.6 && lengthShare >= 0.5 && length >= limits.leastLength;
    reads.push({ pen, lines: list.length, paired: share, oneSide: single, length: length / scale, lengthShare, wall });
  }
  return reads.sort((p, q) => q.lines - p.lines);
}

/** A wall from two parallel lines of a wall pen: the center line of the common part, in the coordinates of the sheet. */
export interface WallPair {
  readonly a: number;
  readonly b: number;
  readonly from: PlanPoint;
  readonly to: PlanPoint;
  /** The distance between the two faces, in the units of the sheet. */
  readonly thickness: number;
}

/**
 * This function gives the walls of the straight lines of the wall pens. Each line keeps its nearest partner, so a face has one wall.
 * The wall is the center line of the common part of the two faces.
 */
export function wallPairs(lines: readonly SheetLine[], limits: WallLimits): readonly WallPair[] {
  const { pairs } = parallelPairs(lines, limits.thinnest, limits.thickest, limits.shortestWall);
  const best = new Map<number, LinePair>();
  for (const pair of pairs) {
    for (const index of [pair.a, pair.b]) {
      const known = best.get(index);
      if (known === undefined || pair.distance < known.distance) best.set(index, pair);
    }
  }
  const used = new Set<string>();
  const walls: WallPair[] = [];
  for (const pair of best.values()) {
    const key = `${Math.min(pair.a, pair.b)}:${Math.max(pair.a, pair.b)}`;
    if (used.has(key)) continue;
    used.add(key);
    const a = lines[pair.a]!;
    const b = lines[pair.b]!;
    const length = lineLength(a);
    const ux = (a.to[0] - a.from[0]) / length;
    const uy = (a.to[1] - a.from[1]) / length;
    const nx = -uy;
    const ny = ux;
    const along = [(b.from[0] - a.from[0]) * ux + (b.from[1] - a.from[1]) * uy, (b.to[0] - a.from[0]) * ux + (b.to[1] - a.from[1]) * uy];
    const low = Math.max(0, Math.min(...along));
    const high = Math.min(length, Math.max(...along));
    if (!(high > low)) continue;
    const across = ((b.from[0] - a.from[0]) * nx + (b.from[1] - a.from[1]) * ny + (b.to[0] - a.from[0]) * nx + (b.to[1] - a.from[1]) * ny) / 2;
    const point = (t: number): PlanPoint => [a.from[0] + ux * t + (nx * across) / 2, a.from[1] + uy * t + (ny * across) / 2];
    walls.push({ a: pair.a, b: pair.b, from: point(low), to: point(high), thickness: pair.distance });
  }
  return walls;
}

/** The wall lines of a sheet, from `readWallLines`. */
export interface WallLineRead {
  /** The lines of the wall pens, the wall faces of the other pens and the end lines of these faces. */
  readonly walls: readonly SheetLine[];
  /** The glazing lines of the pattern pens. They close the rooms, but they are not walls. */
  readonly glazing: readonly SheetLine[];
  /** The number of faces and end lines from each pen that is not a wall pen. */
  readonly faces: Readonly<Record<string, number>>;
  /** The number of glazing lines from each pattern pen. */
  readonly glazingPens: Readonly<Record<string, number>>;
}

/** A point of a sheet. */
type Point = readonly [number, number];

/** This function puts each point in the square cell of a grid with the side `cell`. */
function pointHash(points: readonly Point[], cell: number): Map<string, Point[]> {
  const hash = new Map<string, Point[]>();
  for (const point of points) {
    const key = `${Math.floor(point[0] / cell)},${Math.floor(point[1] / cell)}`;
    const list = hash.get(key) ?? [];
    list.push(point);
    hash.set(key, list);
  }
  return hash;
}

/** This function is true when a point of the hash is at the distance `reach` or less from the point (`x`, `y`). The value `reach` is not more than the cell. */
function nearPoint(hash: Map<string, Point[]>, cell: number, x: number, y: number, reach: number): boolean {
  const cx = Math.floor(x / cell);
  const cy = Math.floor(y / cell);
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (const point of hash.get(`${cx + dx},${cy + dy}`) ?? []) if (Math.hypot(point[0] - x, point[1] - y) <= reach) return true;
    }
  }
  return false;
}

/** This function gives the ends of the straight lines. */
function endsOf(lines: readonly SheetLine[]): Point[] {
  const ends: Point[] = [];
  for (const line of lines) if (line.curve !== true) ends.push(line.from, line.to);
  return ends;
}

/**
 * This function reads the wall lines one line at a time, not one pen at a time.
 *
 * - A wall pen gives all its lines.
 * - A pattern pen has most of its long lines in pairs, and few lines with partners on one side only. A hatch and glazing are pattern pens.
 * - Each other pen gives its wall faces. A face is a long line with a parallel partner at a wall thickness on one side only.
 * - Such a pen also gives its end lines. An end line is a short line that joins two face ends.
 * - A long line of a pattern pen with 1 to 3 partners is a glazing line when its two ends are near wall ends. A glazing line closes the rooms, but it is not a wall.
 *
 * The option `read: "pens"` gives only the lines of the wall pens. The limits are in the units of the sheet.
 */
export function readWallLines(lines: readonly SheetLine[], reads: readonly PenRead[], limits: WallLimits, wallPens: readonly string[]): WallLineRead {
  const wallSet = new Set(wallPens);
  const walls: SheetLine[] = lines.filter((line) => wallSet.has(penOf(line)));
  if (limits.read === "pens") return { walls, glazing: [], faces: {}, glazingPens: {} };
  const patternSide = limits.patternSide ?? 0.4;
  const touch = limits.touch ?? limits.thinnest;
  const readOf = new Map(reads.map((read) => [read.pen, read]));
  const kindOf = (pen: string): "wall" | "mixed" | "pattern" | "none" => {
    const read = readOf.get(pen);
    if (read === undefined || read.lines < limits.fewestLines) return "none";
    if (wallSet.has(pen)) return "wall";
    if (read.oneSide >= patternSide) return "mixed";
    // A pen with few pairs and few faces, for example a pen of doors, gives no line.
    return read.paired >= 0.5 ? "pattern" : "none";
  };

  // The faces: the long lines of the mixed pens with partners on one side only.
  const groups = new Map<string, SheetLine[]>();
  for (const line of lines) {
    if (line.curve === true || lineLength(line) < limits.longLine) continue;
    const pen = penOf(line);
    if (kindOf(pen) !== "mixed") continue;
    const key = (limits.crossPens ?? true) ? "" : pen;
    const list = groups.get(key) ?? [];
    list.push(line);
    groups.set(key, list);
  }
  const faces: Record<string, number> = {};
  const faceLines: SheetLine[] = [];
  const count = (line: SheetLine): void => {
    faceLines.push(line);
    faces[penOf(line)] = (faces[penOf(line)] ?? 0) + 1;
  };
  for (const group of groups.values()) {
    const { sides } = parallelPairs(group, limits.thinnest, limits.thickest, limits.longLine);
    group.forEach((line, index) => {
      if (sides[2 * index]! > 0 !== sides[2 * index + 1]! > 0) count(line);
    });
  }

  // The end lines: the short lines of the mixed pens with their two ends at the ends of faces or walls.
  const cell = Math.max(touch, 1e-9);
  const hash = pointHash(endsOf([...faceLines, ...walls]), cell);
  for (const line of lines) {
    if (line.curve === true) continue;
    const length = lineLength(line);
    if (length >= limits.longLine || length < touch || kindOf(penOf(line)) !== "mixed") continue;
    if (nearPoint(hash, cell, line.from[0], line.from[1], touch) && nearPoint(hash, cell, line.to[0], line.to[1], touch)) count(line);
  }
  walls.push(...faceLines);

  // The glazing: the long lines of the pattern pens with few partners, between two wall ends.
  const glazing: SheetLine[] = [];
  const glazingPens: Record<string, number> = {};
  if (limits.glazing ?? true) {
    const reach = Math.max(limits.thickest, 1e-9);
    const endHash = pointHash(endsOf(walls), reach);
    const byPen = new Map<string, SheetLine[]>();
    for (const line of lines) {
      if (line.curve === true || lineLength(line) < limits.longLine) continue;
      const pen = penOf(line);
      if (kindOf(pen) !== "pattern") continue;
      const list = byPen.get(pen) ?? [];
      list.push(line);
      byPen.set(pen, list);
    }
    for (const [pen, group] of byPen) {
      const { sides } = parallelPairs(group, 0.02 * reach, reach, limits.longLine);
      group.forEach((line, index) => {
        const partners = sides[2 * index]! + sides[2 * index + 1]!;
        if (partners < 1 || partners > 3) return;
        if (!nearPoint(endHash, reach, line.from[0], line.from[1], reach) || !nearPoint(endHash, reach, line.to[0], line.to[1], reach)) return;
        glazing.push(line);
        glazingPens[pen] = (glazingPens[pen] ?? 0) + 1;
      });
    }
  }
  return { walls, glazing, faces, glazingPens };
}

/**
 * This function closes the small gaps at the open ends of the wall lines. An open end has no other line at a distance less than `touch`.
 * The end goes on along its line to the first line within `reach`, or to the nearest line end within `reach` and `angle` degrees.
 * A gap that is narrower than a door is not a passage. Thus each closure is a barrier of the rooms.
 */
export function snapEnds(lines: readonly SheetLine[], reach: number, touch: number, angle = 25): readonly SheetLine[] {
  if (!(reach > 0)) return [];
  const cell = Math.max(reach, touch, 1e-9);
  const grid = new Map<string, number[]>();
  const keyOf = (x: number, y: number): string => `${Math.floor(x / cell)},${Math.floor(y / cell)}`;
  lines.forEach((line, index) => {
    const steps = Math.max(1, Math.ceil(lineLength(line) / cell));
    for (let k = 0; k <= steps; k++) {
      const key = keyOf(line.from[0] + ((line.to[0] - line.from[0]) * k) / steps, line.from[1] + ((line.to[1] - line.from[1]) * k) / steps);
      const list = grid.get(key) ?? [];
      if (list[list.length - 1] !== index) list.push(index);
      grid.set(key, list);
    }
  });
  const around = (x: number, y: number): Set<number> => {
    const found = new Set<number>();
    const cx = Math.floor(x / cell);
    const cy = Math.floor(y / cell);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const index of grid.get(`${cx + dx},${cy + dy}`) ?? []) found.add(index);
    return found;
  };
  const distanceTo = (x: number, y: number, line: SheetLine): number => {
    const vx = line.to[0] - line.from[0];
    const vy = line.to[1] - line.from[1];
    const square = vx * vx + vy * vy;
    const t = square > 0 ? Math.max(0, Math.min(1, ((x - line.from[0]) * vx + (y - line.from[1]) * vy) / square)) : 0;
    return Math.hypot(x - line.from[0] - t * vx, y - line.from[1] - t * vy);
  };
  const cosine = Math.cos((angle * Math.PI) / 180);
  const snaps: SheetLine[] = [];
  lines.forEach((line, index) => {
    const length = lineLength(line);
    if (length < 2 * touch) return;
    const ux = (line.to[0] - line.from[0]) / length;
    const uy = (line.to[1] - line.from[1]) / length;
    const ends: readonly (readonly [number, number, number, number])[] = [
      [line.to[0], line.to[1], ux, uy],
      [line.from[0], line.from[1], -ux, -uy],
    ];
    for (const [x, y, dx, dy] of ends) {
      const near = around(x, y);
      let open = true;
      for (const other of near) {
        if (other !== index && distanceTo(x, y, lines[other]!) < touch) {
          open = false;
          break;
        }
      }
      if (!open) continue;
      let best = Infinity;
      let point: Point | undefined;
      for (const other of near) {
        if (other === index) continue;
        const o = lines[other]!;
        // The ray from the end along its line, against the other line.
        const ex = o.to[0] - o.from[0];
        const ey = o.to[1] - o.from[1];
        const denominator = dx * ey - dy * ex;
        if (Math.abs(denominator) > 1e-9) {
          const t = ((o.from[0] - x) * ey - (o.from[1] - y) * ex) / denominator;
          const s = ((o.from[0] - x) * dy - (o.from[1] - y) * dx) / denominator;
          if (t > 0 && t <= reach && s >= 0 && s <= 1 && t < best) {
            best = t;
            point = [x + dx * t, y + dy * t];
          }
        }
        // The ends of the other line in front of the end.
        for (const [px, py] of [o.from, o.to]) {
          const gx = px - x;
          const gy = py - y;
          const gap = Math.hypot(gx, gy);
          if (gap <= 0 || gap > reach || (gx * dx + gy * dy) / gap < cosine) continue;
          if (gap < best) {
            best = gap;
            point = [px, py];
          }
        }
      }
      if (point !== undefined) snaps.push({ from: [x, y], to: point, width: line.width, color: line.color });
    }
  });
  return snaps;
}
