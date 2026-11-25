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
}

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
