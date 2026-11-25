import type { PlanPoint } from "../room.ts";
import { lineLength, type SheetLine } from "./sheet.ts";
import { parallelPairs } from "./walls.ts";

/** The options of the search for bridges. Each length is in the `unit` of the sheet. */
export interface BridgeOptions {
  /** The smallest width of a gap in a wall. The default is 1.5 ft. */
  readonly narrowest?: number | undefined;
  /** The largest width of a gap in a wall. The default is 4.5 ft. */
  readonly widest?: number | undefined;
  /** The smallest length of the end line of a wall. The default is 0.2 ft. */
  readonly shortestEnd?: number | undefined;
  /** The largest length of the end line of a wall. The default is 1.6 ft. */
  readonly longestEnd?: number | undefined;
  /** Two lines touch when the distance between them is this value or less. The default is 0.225 ft. */
  readonly touch?: number | undefined;
  /** The largest angle between the direction of an open end and the direction to the other end, in degrees. The default is 25. */
  readonly angle?: number | undefined;
}

/** The limits of the search for bridges, in the units of the sheet. */
export interface BridgeLimits {
  readonly narrowest: number;
  readonly widest: number;
  readonly shortestEnd: number;
  readonly longestEnd: number;
  readonly touch: number;
  readonly angle: number;
}

/** These are the sources of a bridge. `ends` is a pair of end lines of two walls. `open` is a pair of open ends of two lines. */
export const BRIDGE_SOURCES: readonly ["ends", "open"] = ["ends", "open"];

/** A source of a bridge. */
export type BridgeSource = (typeof BRIDGE_SOURCES)[number];

/** A bridge: a gap between two wall ends, in the coordinates of the sheet. A bridge closes a room, and the room record has it as an opening. */
export interface Bridge {
  readonly source: BridgeSource;
  /** The line of the bridge from the middle of one wall end to the middle of the other. */
  readonly from: PlanPoint;
  readonly to: PlanPoint;
  /** The thickness of the wall at the bridge. A bridge from open ends has no thickness. */
  readonly thickness: number | undefined;
  /** The lines that close the gap, as the barrier of the rooms. */
  readonly lines: readonly SheetLine[];
}

/**
 * This function finds the bridges across the gaps in the walls. A gap is from `narrowest` to `widest`.
 *
 * - Two short end lines of walls can be parallel and face each other across a gap. They give two lines, one along each face of the wall.
 * - An open end of a long line, with no other line near it, joins the nearest open end that faces it.
 */
export function findBridges(lines: readonly SheetLine[], limits: BridgeLimits): readonly Bridge[] {
  const bridges: Bridge[] = [];
  const ends = lines.filter((line) => {
    const length = lineLength(line);
    return length >= limits.shortestEnd && length <= limits.longestEnd;
  });
  const { pairs } = parallelPairs(ends, limits.narrowest, limits.widest, 0.6 * limits.shortestEnd, 0.06);
  for (const pair of pairs) {
    const a = ends[pair.a]!;
    const b = ends[pair.b]!;
    const width = Math.max(a.width, b.width);
    const color = a.color;
    const straight = Math.hypot(a.from[0] - b.from[0], a.from[1] - b.from[1]) + Math.hypot(a.to[0] - b.to[0], a.to[1] - b.to[1]);
    const crossed = Math.hypot(a.from[0] - b.to[0], a.from[1] - b.to[1]) + Math.hypot(a.to[0] - b.from[0], a.to[1] - b.from[1]);
    const [b0, b1] = straight <= crossed ? [b.from, b.to] : [b.to, b.from];
    bridges.push({
      source: "ends",
      from: [(a.from[0] + a.to[0]) / 2, (a.from[1] + a.to[1]) / 2],
      to: [(b.from[0] + b.to[0]) / 2, (b.from[1] + b.to[1]) / 2],
      thickness: (lineLength(a) + lineLength(b)) / 2,
      lines: [
        { from: a.from, to: b0, width, color },
        { from: a.to, to: b1, width, color },
      ],
    });
  }

  // The open ends: an end of a long line with no other line near it.
  const cell = Math.max(limits.touch * 3, 1e-9);
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
  const near = (x: number, y: number, self: number): boolean => {
    const cx = Math.floor(x / cell);
    const cy = Math.floor(y / cell);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const index of grid.get(`${cx + dx},${cy + dy}`) ?? []) {
          if (index === self) continue;
          const line = lines[index]!;
          const vx = line.to[0] - line.from[0];
          const vy = line.to[1] - line.from[1];
          const square = vx * vx + vy * vy;
          const t = square > 0 ? Math.max(0, Math.min(1, ((x - line.from[0]) * vx + (y - line.from[1]) * vy) / square)) : 0;
          if (Math.hypot(x - line.from[0] - t * vx, y - line.from[1] - t * vy) < limits.touch) return true;
        }
      }
    }
    return false;
  };
  interface End {
    readonly x: number;
    readonly y: number;
    readonly dx: number;
    readonly dy: number;
    readonly line: number;
  }
  const open: End[] = [];
  lines.forEach((line, index) => {
    const length = lineLength(line);
    if (length < limits.longestEnd) return;
    const ux = (line.to[0] - line.from[0]) / length;
    const uy = (line.to[1] - line.from[1]) / length;
    if (!near(line.to[0], line.to[1], index)) open.push({ x: line.to[0], y: line.to[1], dx: ux, dy: uy, line: index });
    if (!near(line.from[0], line.from[1], index)) open.push({ x: line.from[0], y: line.from[1], dx: -ux, dy: -uy, line: index });
  });
  // The search of the partner of an open end looks only in the cells of the widest gap around it.
  const span = Math.max(limits.widest, 1e-9);
  const endGrid = new Map<string, number[]>();
  const spanKey = (x: number, y: number): string => `${Math.floor(x / span)},${Math.floor(y / span)}`;
  open.forEach((end, index) => {
    const key = spanKey(end.x, end.y);
    const list = endGrid.get(key) ?? [];
    list.push(index);
    endGrid.set(key, list);
  });
  const cosine = Math.cos((limits.angle * Math.PI) / 180);
  const best = open.map((end, a) => {
    let found = -1;
    let distance = Infinity;
    const cx = Math.floor(end.x / span);
    const cy = Math.floor(end.y / span);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const b of endGrid.get(`${cx + dx},${cy + dy}`) ?? []) {
          const other = open[b]!;
          if (a === b || other.line === end.line) continue;
          const gx = other.x - end.x;
          const gy = other.y - end.y;
          const gap = Math.hypot(gx, gy);
          if (gap < limits.narrowest || gap > limits.widest) continue;
          if ((gx * end.dx + gy * end.dy) / gap < cosine) continue;
          if (-(other.dx * end.dx + other.dy * end.dy) < cosine) continue;
          // The sequence of the ends breaks a tie, so the result does not change with the sequence of the cells.
          if (gap < distance || (gap === distance && b < found)) {
            distance = gap;
            found = b;
          }
        }
      }
    }
    return found;
  });
  best.forEach((b, a) => {
    if (b < 0 || best[b] !== a || a > b) return;
    const end = open[a]!;
    const other = open[b]!;
    const line = lines[end.line]!;
    bridges.push({
      source: "open",
      from: [end.x, end.y],
      to: [other.x, other.y],
      thickness: undefined,
      lines: [{ from: [end.x, end.y], to: [other.x, other.y], width: line.width, color: line.color }],
    });
  });
  return bridges;
}
