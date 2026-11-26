import { priorityQueue } from "@mark1russell7/collections";
import type { PlanPoint } from "./room.ts";

/**
 * A grid of the cells inside the outline of a floor. A cell is inside when its center is inside the outline.
 * The cell at column `c` and row `r` has the index `r * columns + c`.
 */
export interface FloorGrid {
  /** The least x and the least y of the outline. */
  readonly origin: PlanPoint;
  /** The side of a cell, in the unit of the room. */
  readonly cell: number;
  readonly columns: number;
  readonly rows: number;
  /** The value 1 for each cell inside the outline, else 0. */
  readonly inside: Uint8Array;
}

/** The greatest count of cells of one grid. A larger floor gets larger cells. */
const LARGEST_GRID = 4_000_000;

/**
 * This function makes the grid of a floor from its outline. A cell inside a hole is not inside the floor.
 * When the grid has more than 4,000,000 cells, the side of a cell doubles until it fits.
 *
 * @param ring - The outline of the floor
 * @param cell - The side of a cell, in the unit of the room
 * @param holes - The outlines of the holes of the floor, for example the other floors inside its outline
 */
export function floorGrid(ring: readonly PlanPoint[], cell: number, holes: readonly (readonly PlanPoint[])[] = []): FloorGrid {
  const xs = ring.map(([x]) => x);
  const ys = ring.map(([, y]) => y);
  const origin: PlanPoint = [Math.min(...xs), Math.min(...ys)];
  const width = Math.max(...xs) - origin[0];
  const height = Math.max(...ys) - origin[1];
  let side = cell;
  while (Math.ceil(width / side) * Math.ceil(height / side) > LARGEST_GRID) side *= 2;
  const columns = Math.max(1, Math.ceil(width / side));
  const rows = Math.max(1, Math.ceil(height / side));
  const grid: FloorGrid = { origin, cell: side, columns, rows, inside: new Uint8Array(columns * rows) };
  fillRing(grid, ring, 1);
  for (const hole of holes) fillRing(grid, hole, 0);
  return grid;
}

/** This function sets each cell with its center inside a ring to a value. Each row fills the cells between pairs of edge crossings. */
function fillRing(grid: FloorGrid, ring: readonly PlanPoint[], value: number): void {
  const { origin, cell, columns, rows, inside } = grid;
  const ys = ring.map(([, y]) => y);
  const firstRow = Math.max(0, Math.floor((Math.min(...ys) - origin[1]) / cell));
  const lastRow = Math.min(rows - 1, Math.ceil((Math.max(...ys) - origin[1]) / cell));
  for (let row = firstRow; row <= lastRow; row++) {
    const y = origin[1] + (row + 0.5) * cell;
    const crossings: number[] = [];
    ring.forEach(([xa, ya], index) => {
      const [xb, yb] = ring[(index + 1) % ring.length]!;
      if (ya > y !== yb > y) crossings.push(xa + ((y - ya) * (xb - xa)) / (yb - ya));
    });
    crossings.sort((a, b) => a - b);
    for (let k = 0; k + 1 < crossings.length; k += 2) {
      const first = Math.max(0, Math.ceil((crossings[k]! - origin[0]) / cell - 0.5));
      const last = Math.min(columns - 1, Math.floor((crossings[k + 1]! - origin[0]) / cell - 0.5));
      if (last >= first) inside.fill(value, row * columns + first, row * columns + last + 1);
    }
  }
}

/** This function gives the center of a cell of a grid. */
export function cellCenter(grid: FloorGrid, index: number): PlanPoint {
  const column = index % grid.columns;
  const row = (index - column) / grid.columns;
  return [grid.origin[0] + (column + 0.5) * grid.cell, grid.origin[1] + (row + 0.5) * grid.cell];
}

/**
 * This function gives the cell inside the floor that is nearest to a point, within 4 cells of the cell of the point.
 * It gives -1 when no cell inside the floor is so near.
 */
export function cellNear(grid: FloorGrid, [x, y]: PlanPoint): number {
  const column = Math.floor((x - grid.origin[0]) / grid.cell);
  const row = Math.floor((y - grid.origin[1]) / grid.cell);
  let best = -1;
  let bestDistance = Infinity;
  for (let dr = -4; dr <= 4; dr++) {
    for (let dc = -4; dc <= 4; dc++) {
      const c = column + dc;
      const r = row + dr;
      if (c < 0 || r < 0 || c >= grid.columns || r >= grid.rows || grid.inside[r * grid.columns + c] === 0) continue;
      const [cx, cy] = cellCenter(grid, r * grid.columns + c);
      const distance = Math.hypot(cx - x, cy - y);
      if (distance < bestDistance) {
        best = r * grid.columns + c;
        bestDistance = distance;
      }
    }
  }
  return best;
}

/** The result of a search of a grid from one cell: the walk length to each cell, and the cell before it on the walk. */
export interface GridSearch {
  /** The length of the shortest walk to each cell, in the unit of the room. A cell with no walk has `Infinity`. */
  readonly distance: Float64Array;
  /** The cell before each cell on its shortest walk. The start and a cell with no walk have -1. */
  readonly previous: Int32Array;
}

/**
 * This function finds the shortest walk from one cell to each cell of a grid, in steps to the 8 next cells.
 * A step on a diagonal goes only between two cells inside the floor, so a walk does not cut a corner of a wall.
 * Such a walk is at most 8.3% longer than the shortest walk in any direction.
 *
 * @param grid - The grid of the floor
 * @param start - The index of the start cell
 * @param targets - The cells that end the search when the search reaches each of them. No value searches each cell.
 */
export function searchGrid(grid: FloorGrid, start: number, targets?: readonly number[]): GridSearch {
  const { columns, rows, inside, cell } = grid;
  const distance = new Float64Array(columns * rows).fill(Infinity);
  const previous = new Int32Array(columns * rows).fill(-1);
  const done = new Uint8Array(columns * rows);
  let left = targets === undefined ? -1 : new Set(targets).size;
  const wanted = targets === undefined ? undefined : new Set(targets);
  const diagonal = cell * Math.SQRT2;
  const queue = priorityQueue<readonly [number, number]>({ compare: (a, b) => a[0] - b[0] });
  distance[start] = 0;
  queue.offer([0, start]);
  for (let item = queue.pollOrUndefined(); item !== undefined; item = queue.pollOrUndefined()) {
    const [length, index] = item;
    if (done[index] === 1 || length > distance[index]!) continue;
    done[index] = 1;
    if (wanted?.has(index) === true && --left === 0) break;
    const column = index % columns;
    const row = (index - column) / columns;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const c = column + dc;
        const r = row + dr;
        if (c < 0 || r < 0 || c >= columns || r >= rows) continue;
        const next = r * columns + c;
        if (inside[next] === 0) continue;
        if (dr !== 0 && dc !== 0 && (inside[row * columns + c] === 0 || inside[r * columns + column] === 0)) continue;
        const step = length + (dr !== 0 && dc !== 0 ? diagonal : cell);
        if (step < distance[next]!) {
          distance[next] = step;
          previous[next] = index;
          queue.offer([step, next]);
        }
      }
    }
  }
  return { distance, previous };
}

/** This function gives the cells of the walk from the start of a search to a cell, in their sequence. A cell with no walk gives an empty list. */
export function walkCells(search: GridSearch, end: number): number[] {
  if (search.distance[end] === Infinity) return [];
  const cells: number[] = [];
  for (let index = end; index !== -1; index = search.previous[index]!) cells.push(index);
  return cells.reverse();
}

/** This function tells if the straight line between two points stays in the cells inside the floor. It samples the line at each half cell. */
export function inSight(grid: FloorGrid, [xa, ya]: PlanPoint, [xb, yb]: PlanPoint): boolean {
  const samples = Math.max(1, Math.ceil(Math.hypot(xb - xa, yb - ya) / (grid.cell / 2)));
  for (let k = 0; k <= samples; k++) {
    const x = xa + ((xb - xa) * k) / samples;
    const y = ya + ((yb - ya) * k) / samples;
    const column = Math.floor((x - grid.origin[0]) / grid.cell);
    const row = Math.floor((y - grid.origin[1]) / grid.cell);
    if (column < 0 || row < 0 || column >= grid.columns || row >= grid.rows || grid.inside[row * grid.columns + column] === 0) return false;
  }
  return true;
}

/**
 * This function makes a walk shorter: from each corner, it goes straight to the farthest next point in sight.
 * The first point and the last point stay. Each straight run stays in the cells inside the floor.
 */
export function straighten(grid: FloorGrid, points: readonly PlanPoint[]): PlanPoint[] {
  if (points.length <= 2) return [...points];
  const result: PlanPoint[] = [points[0]!];
  let anchor = 0;
  while (anchor < points.length - 1) {
    let next = anchor + 1;
    for (let k = points.length - 1; k > anchor + 1; k--) {
      if (inSight(grid, points[anchor]!, points[k]!)) {
        next = k;
        break;
      }
    }
    result.push(points[next]!);
    anchor = next;
  }
  return result;
}

/** This function gives the length of a path of points. */
export function pathLength(points: readonly PlanPoint[]): number {
  let length = 0;
  for (let k = 1; k < points.length; k++) length += Math.hypot(points[k]![0] - points[k - 1]![0], points[k]![1] - points[k - 1]![1]);
  return length;
}
