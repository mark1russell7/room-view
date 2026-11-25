import type { Ring } from "@mark1russell7/layout-contract";
import type { PlanPoint } from "../room.ts";
import type { SheetLine } from "./sheet.ts";

/**
 * A grid of square cells over a sheet. The cell at column `x` and row `y` has the position `y * columns + x` in each array of the grid.
 * The plan import keeps its rasters here: each is specific to the method of the import.
 */
export interface Grid {
  readonly columns: number;
  readonly rows: number;
  /** The side of a cell, in the units of the sheet. */
  readonly cell: number;
}

/** This function gives a grid that covers a sheet. */
export function gridOf(width: number, height: number, cell: number): Grid {
  return { columns: Math.max(1, Math.ceil(width / cell)), rows: Math.max(1, Math.ceil(height / cell)), cell };
}

/** This function sets each cell under a line to 1. A line covers a square of cells around each point, with the half width of its pen, or half a cell or more. */
export function stampLines(grid: Grid, barrier: Uint8Array, lines: readonly SheetLine[]): void {
  const { columns, rows, cell } = grid;
  for (const line of lines) {
    const half = Math.max(0.5, line.width / 2 / cell);
    const reach = Math.ceil(half - 0.5);
    const length = Math.hypot(line.to[0] - line.from[0], line.to[1] - line.from[1]) / cell;
    const steps = Math.max(1, Math.ceil(length * 2));
    for (let k = 0; k <= steps; k++) {
      const x = Math.floor((line.from[0] + ((line.to[0] - line.from[0]) * k) / steps) / cell);
      const y = Math.floor((line.from[1] + ((line.to[1] - line.from[1]) * k) / steps) / cell);
      for (let dy = -reach; dy <= reach; dy++) {
        for (let dx = -reach; dx <= reach; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < columns && yy < rows) barrier[yy * columns + xx] = 1;
        }
      }
    }
  }
}

/** One region of a grid: a set of free cells with a path of side neighbors between each two cells. */
export interface GridRegion {
  /** The label of the region, from 1. */
  readonly label: number;
  /** The first cell of the region in the sequence of the grid. */
  readonly first: number;
  readonly cells: number;
  /** The mean column and the mean row of the cells. */
  readonly center: PlanPoint;
  /** This value is true when the region touches the border of the grid. */
  readonly border: boolean;
  /** The number of cell sides between the region and the barrier. */
  readonly perimeter: number;
}

/** The regions of a grid, and the label of each cell. A barrier cell has the label 0. */
export interface GridRegions {
  readonly labels: Int32Array;
  /** The regions in the sequence of their labels. The region with the label `n` is at the position `n - 1`. */
  readonly regions: readonly GridRegion[];
}

/** This function labels the free regions of a grid, with side neighbors only. The labels go in the sequence of the first cell of each region. */
export function labelRegions(grid: Grid, barrier: Uint8Array): GridRegions {
  const { columns, rows } = grid;
  const size = columns * rows;
  const labels = new Int32Array(size);
  const queue = new Int32Array(size);
  const regions: GridRegion[] = [];
  for (let start = 0; start < size; start++) {
    if (barrier[start] !== 0 || labels[start] !== 0) continue;
    const label = regions.length + 1;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    labels[start] = label;
    let cells = 0;
    let sumX = 0;
    let sumY = 0;
    let border = false;
    let perimeter = 0;
    while (head < tail) {
      const index = queue[head++]!;
      const x = index % columns;
      const y = (index - x) / columns;
      cells++;
      sumX += x;
      sumY += y;
      if (x === 0 || y === 0 || x === columns - 1 || y === rows - 1) border = true;
      const near = [x > 0 ? index - 1 : -1, x < columns - 1 ? index + 1 : -1, y > 0 ? index - columns : -1, y < rows - 1 ? index + columns : -1];
      for (const next of near) {
        if (next < 0) continue;
        if (barrier[next] !== 0) {
          perimeter++;
          continue;
        }
        if (labels[next] === 0) {
          labels[next] = label;
          queue[tail++] = next;
        }
      }
    }
    regions.push({ label, first: start, cells, center: [sumX / cells, sumY / cells], border, perimeter });
  }
  return { labels, regions };
}

/**
 * This function calls `visit` for each cell with its center inside a set of rings, by the even-odd rule over all the rings.
 * The calls go row by row.
 */
export function scanRings(grid: Grid, rings: readonly Ring[], visit: (row: number, first: number, last: number) => void): void {
  const { columns, rows, cell } = grid;
  let top = Infinity;
  let bottom = -Infinity;
  for (const ring of rings) {
    for (const [, y] of ring) {
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
  if (!(bottom >= top)) return;
  const firstRow = Math.max(0, Math.floor(top / cell));
  const lastRow = Math.min(rows - 1, Math.ceil(bottom / cell));
  for (let y = firstRow; y <= lastRow; y++) {
    const py = (y + 0.5) * cell;
    const xs: number[] = [];
    for (const ring of rings) {
      for (let i = 0; i < ring.length; i++) {
        const [ax, ay] = ring[i]!;
        const [bx, by] = ring[(i + 1) % ring.length]!;
        if (ay <= py !== by <= py) xs.push(ax + ((py - ay) * (bx - ax)) / (by - ay));
      }
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const first = Math.max(0, Math.ceil(xs[k]! / cell - 0.5));
      const last = Math.min(columns - 1, Math.floor(xs[k + 1]! / cell - 0.5));
      if (last >= first) visit(y, first, last);
    }
  }
}

/** This function gives the number of cells of each label with the center inside one ring. */
export function ringCells(grid: Grid, labels: Int32Array, ring: Ring): Map<number, number> {
  const counts = new Map<number, number>();
  scanRings(grid, [ring], (row, first, last) => {
    for (let x = first; x <= last; x++) {
      const label = labels[row * grid.columns + x]!;
      if (label !== 0) counts.set(label, (counts.get(label) ?? 0) + 1);
    }
  });
  return counts;
}

/**
 * This function gives the outline of one region: the cell sides between the region and the other cells, as one ring.
 * The ring goes with the region on its right side in the coordinates of the grid, so in a plan with the y axis up it goes counter-clockwise.
 * A hole of the region is not in the ring. The ring has a corner only where its direction changes.
 */
export function regionOutline(grid: Grid, labels: Int32Array, region: Pick<GridRegion, "label" | "first">): Ring {
  const { columns, rows, cell } = grid;
  const inside = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < columns && y < rows && labels[y * columns + x] === region.label;
  const startX = region.first % columns;
  const startY = (region.first - startX) / columns;
  // The walk starts at the top left corner of the first cell, along its top side. The cells above it and to its left are not in the region.
  let x = startX;
  let y = startY;
  let dx = 1;
  let dy = 0;
  const corners: [number, number][] = [[x * cell, y * cell]];
  const limit = 4 * (columns + 1) * (rows + 1);
  for (let step = 0; step < limit; step++) {
    x += dx;
    y += dy;
    // The cells ahead of the corner, on the left side and on the right side of the direction.
    const left = inside(x + Math.floor((dx + dy) / 2), y + Math.floor((dy - dx) / 2));
    const right = inside(x + Math.floor((dx - dy) / 2), y + Math.floor((dy + dx) / 2));
    let nx = dx;
    let ny = dy;
    if (!right) {
      nx = -dy;
      ny = dx;
    } else if (left) {
      nx = dy;
      ny = -dx;
    }
    if (x === startX && y === startY && nx === 1 && ny === 0) break;
    if (nx !== dx || ny !== dy) corners.push([x * cell, y * cell]);
    dx = nx;
    dy = ny;
  }
  return corners;
}
