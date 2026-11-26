import { floorLocator, floorShapes, type FloorShape } from "./floors.ts";
import type { PlanPoint, Room } from "./room.ts";
import { metersPer } from "./units.ts";

/** The exposure of one floor: how much of its outline is on the outside, and how far it is from the outside. */
export interface FloorExposure {
  readonly floor: string;
  /** The length of the outline of the floor with no floor beyond its wall, in the unit of the room. A floor with the value 0 is an interior floor. */
  readonly outer: number;
  /**
   * The least distance from the outline of the floor to an outer part of the outline of another floor, in the unit of the room.
   * A floor with an outer part has the value 0. With no outer part on the plan, the value is `Infinity`.
   */
  readonly depth: number;
}

/** The options of `floorExposure`. */
export interface FloorExposureOptions {
  /**
   * The greatest width of a space between two floors that is not a floor, in the unit of the room. The default is 3 m.
   * Such a space is a wall, a shaft or a chase. A wider space with no floor is the outside when it goes to the edge of the plan.
   */
  readonly reach?: number | undefined;
  /** The length of the parts of the outline that each search examines, in the unit of the room. The default is 0.5 m. */
  readonly step?: number | undefined;
  /** The floors that are outside, for example a court that is open to the sky. They get no exposure. */
  readonly outside?: Iterable<string> | undefined;
}

/**
 * This function gives the exposure of each floor of a room: the length of its outline on the outside, and its depth from the outside.
 *
 * - The outline of each floor is in parts of equal length, near `step`. A search goes out from the middle of each part, square to the outline, in steps of 0.1 m.
 * - A part is outer when the search finds no floor before `reach`, and it gets to the outside. A search that comes back into its own floor finds its own floor.
 * - The outside is the space with no floor that goes to the edge of the plan. Each gap narrower than `reach` is closed first.
 *   Thus a space that the floors close around is not the outside, for example a room that the plan has no floor for.
 * - The searches also go out from the outline of each floor of `outside`. The floor that such a search finds gets the part as an outer part.
 *   Thus a corridor that goes around a court gets the parts of its wall on the court.
 * - The depth of a floor is the least distance from its outline to the middle of an outer part of another floor.
 *
 * @param room - The room, with a floor for each space
 * @param options - The reach of the search, the length of the parts and the floors that are outside
 * @returns The exposure of each floor that is not outside, in the sequence of the floors
 */
export function floorExposure(room: Room, options: FloorExposureOptions = {}): FloorExposure[] {
  const scale = metersPer(room.unit);
  const reach = options.reach ?? 3 / scale;
  const step = options.step ?? 0.5 / scale;
  const probes = Math.max(2, Math.ceil((reach * scale) / 0.1));
  const outside = new Set(options.outside ?? []);
  const floors = floorShapes(room);
  const floorAt = floorLocator(floors);
  const outerPoints: { floor: string; point: PlanPoint }[] = [];
  const outer = new Map<string, number>(floors.map((floor) => [floor.id, 0]));
  const isOutside = outsideSpace(floors, reach);
  for (const floor of floors) {
    const open = outside.has(floor.id);
    const ring = floor.ring;
    // The outline goes counterclockwise when its signed area is positive. Then the outer side of an edge is to the right.
    const turn = signedArea(ring) >= 0 ? 1 : -1;
    // The parts go along the outline by length. The outline of a plan import has many short edges, so the direction of a part is the line between its two ends.
    const at = outlineWalker(ring);
    const parts = Math.max(1, Math.ceil(at.length / step));
    const part = at.length / parts;
    for (let index = 0; index < parts; index++) {
      const middle = at.point((index + 0.5) * part);
      const [xa, ya] = at.point(index * part);
      const [xb, yb] = at.point((index + 1) * part);
      const chord = Math.hypot(xb - xa, yb - ya);
      if (!(chord > 0)) continue;
      const normal: PlanPoint = [(turn * (yb - ya)) / chord, (turn * -(xb - xa)) / chord];
      let beyond: string | undefined;
      let left = false;
      let out = false;
      for (let k = 1; k <= probes && beyond === undefined; k++) {
        const x = middle[0] + (normal[0] * reach * k) / probes;
        const y = middle[1] + (normal[1] * reach * k) / probes;
        const found = floorAt(x, y);
        if (found !== floor.id) beyond = found;
        else if (left) beyond = found;
        left ||= found !== floor.id;
        out ||= found === undefined && isOutside(x, y);
      }
      // A search that finds no floor and does not get to the outside is in a space that the floors close around.
      if (beyond === undefined && !out) continue;
      // A part of an outside floor is an outer part of the floor beyond it. A part of another floor is outer when no floor is beyond it.
      const owner = open ? (beyond === undefined || beyond === floor.id || outside.has(beyond) ? undefined : beyond) : beyond === undefined ? floor.id : undefined;
      if (owner !== undefined) {
        outer.set(owner, outer.get(owner)! + part);
        outerPoints.push({ floor: owner, point: middle });
      }
    }
  }
  return floors
    .filter((floor) => !outside.has(floor.id))
    .map((floor) => {
      const length = outer.get(floor.id)!;
      if (length > 0) return { floor: floor.id, outer: length, depth: 0 };
      // The distance to the box of the floor is a lower bound of the distance to its outline. The search stops when the bound passes the best distance.
      const [x0, y0, x1, y1] = floor.box;
      const near = outerPoints
        .filter((item) => item.floor !== floor.id)
        .map((item) => ({ point: item.point, bound: Math.hypot(Math.max(x0 - item.point[0], 0, item.point[0] - x1), Math.max(y0 - item.point[1], 0, item.point[1] - y1)) }))
        .sort((a, b) => a.bound - b.bound);
      let depth = Infinity;
      for (const item of near) {
        if (item.bound >= depth) break;
        depth = Math.min(depth, ringDistance(floor.ring, item.point));
      }
      return { floor: floor.id, outer: 0, depth };
    });
}

/**
 * This function gives a test of the outside: the space with no floor that goes to the edge of the plan, on a grid.
 * First the floors grow by half of `reach`, so each gap narrower than `reach` closes. Then a fill from the edge finds the outside.
 * Then the outside grows back by half of `reach`, up to the floors.
 */
function outsideSpace(floors: readonly FloorShape[], reach: number): (x: number, y: number) => boolean {
  if (floors.length === 0) return () => true;
  const x0 = Math.min(...floors.map((floor) => floor.box[0])) - reach;
  const y0 = Math.min(...floors.map((floor) => floor.box[1])) - reach;
  const x1 = Math.max(...floors.map((floor) => floor.box[2])) + reach;
  const y1 = Math.max(...floors.map((floor) => floor.box[3])) + reach;
  // A cell is a twelfth of the reach. A large plan with a small reach gets larger cells, at most 2000 on a side.
  const cell = Math.max(reach / 12, (x1 - x0) / 2000, (y1 - y0) / 2000);
  const nx = Math.ceil((x1 - x0) / cell);
  const ny = Math.ceil((y1 - y0) / cell);
  const covered = new Uint8Array(nx * ny);
  // Each floor fills the cells with their centers inside its outline, row by row.
  for (const shape of floors) {
    const { ring } = shape;
    const rowFrom = Math.max(0, Math.ceil((shape.box[1] - y0) / cell - 0.5));
    const rowTo = Math.min(ny - 1, Math.floor((shape.box[3] - y0) / cell - 0.5));
    if (rowTo < rowFrom) continue;
    const crossings: number[][] = Array.from({ length: rowTo - rowFrom + 1 }, () => []);
    ring.forEach(([xa, ya], index) => {
      const [xb, yb] = ring[(index + 1) % ring.length]!;
      if (ya === yb) return;
      const low = Math.min(ya, yb);
      const high = Math.max(ya, yb);
      for (let row = Math.max(rowFrom, Math.ceil((low - y0) / cell - 0.5)); row <= rowTo; row++) {
        const y = y0 + (row + 0.5) * cell;
        if (y >= high) break;
        if (y >= low) crossings[row - rowFrom]!.push(xa + ((y - ya) / (yb - ya)) * (xb - xa));
      }
    });
    crossings.forEach((list, offset) => {
      list.sort((a, b) => a - b);
      for (let pair = 0; pair + 1 < list.length; pair += 2) {
        const from = Math.max(0, Math.ceil((list[pair]! - x0) / cell - 0.5));
        const to = Math.min(nx - 1, Math.floor((list[pair + 1]! - x0) / cell - 0.5));
        for (let column = from; column <= to; column++) covered[(rowFrom + offset) * nx + column] = 1;
      }
    });
  }
  const steps = Math.ceil(reach / 2 / cell);
  const fromFloor = chessDistance(covered, nx, ny);
  // The fill from the edge goes only through the cells that are farther than half of the reach from each floor.
  const reached = new Uint8Array(nx * ny);
  const queue: number[] = [];
  for (let column = 0; column < nx; column++) queue.push(column, (ny - 1) * nx + column);
  for (let row = 0; row < ny; row++) queue.push(row * nx, row * nx + nx - 1);
  for (let head = 0; head < queue.length; head++) {
    const index = queue[head]!;
    if (reached[index] === 1 || fromFloor[index]! <= steps) continue;
    reached[index] = 1;
    const column = index % nx;
    if (column > 0) queue.push(index - 1);
    if (column < nx - 1) queue.push(index + 1);
    if (index >= nx) queue.push(index - nx);
    if (index < (ny - 1) * nx) queue.push(index + nx);
  }
  const fromOutside = chessDistance(reached, nx, ny);
  return (x, y) => {
    const column = Math.floor((x - x0) / cell);
    const row = Math.floor((y - y0) / cell);
    if (column < 0 || row < 0 || column >= nx || row >= ny) return true;
    const index = row * nx + column;
    return covered[index] === 0 && fromOutside[index]! <= steps + 1;
  };
}

/** This function gives the distance in cells from each cell of a grid to the nearest marked cell. A diagonal step counts as 1. */
function chessDistance(marked: Uint8Array, nx: number, ny: number): Uint32Array {
  const distance = new Uint32Array(nx * ny);
  for (let index = 0; index < marked.length; index++) distance[index] = marked[index] === 1 ? 0 : nx + ny;
  for (let row = 0; row < ny; row++) {
    for (let column = 0; column < nx; column++) {
      const index = row * nx + column;
      let best = distance[index]!;
      if (column > 0) best = Math.min(best, distance[index - 1]! + 1);
      if (row > 0) {
        best = Math.min(best, distance[index - nx]! + 1);
        if (column > 0) best = Math.min(best, distance[index - nx - 1]! + 1);
        if (column < nx - 1) best = Math.min(best, distance[index - nx + 1]! + 1);
      }
      distance[index] = best;
    }
  }
  for (let row = ny - 1; row >= 0; row--) {
    for (let column = nx - 1; column >= 0; column--) {
      const index = row * nx + column;
      let best = distance[index]!;
      if (column < nx - 1) best = Math.min(best, distance[index + 1]! + 1);
      if (row < ny - 1) {
        best = Math.min(best, distance[index + nx]! + 1);
        if (column < nx - 1) best = Math.min(best, distance[index + nx + 1]! + 1);
        if (column > 0) best = Math.min(best, distance[index + nx - 1]! + 1);
      }
      distance[index] = best;
    }
  }
  return distance;
}

/** This function gives the length of the outline of a ring, and the point at a distance along it from its first point. */
function outlineWalker(ring: readonly PlanPoint[]): { length: number; point: (distance: number) => PlanPoint } {
  const ends: number[] = [0];
  ring.forEach(([xa, ya], index) => {
    const [xb, yb] = ring[(index + 1) % ring.length]!;
    ends.push(ends[index]! + Math.hypot(xb - xa, yb - ya));
  });
  const length = ends[ring.length]!;
  const point = (distance: number): PlanPoint => {
    const d = Math.min(Math.max(distance, 0), length);
    let low = 0;
    let high = ring.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (ends[mid]! <= d) low = mid;
      else high = mid - 1;
    }
    const [xa, ya] = ring[low]!;
    const [xb, yb] = ring[(low + 1) % ring.length]!;
    const edge = ends[low + 1]! - ends[low]!;
    const t = edge > 0 ? (d - ends[low]!) / edge : 0;
    return [xa + (xb - xa) * t, ya + (yb - ya) * t];
  };
  return { length, point };
}

/** This function gives the signed area of a ring. It is positive for a counterclockwise ring. */
function signedArea(ring: readonly PlanPoint[]): number {
  let sum = 0;
  ring.forEach(([xa, ya], index) => {
    const [xb, yb] = ring[(index + 1) % ring.length]!;
    sum += xa * yb - xb * ya;
  });
  return sum / 2;
}

/** This function gives the least distance from a point to the edges of a ring. */
function ringDistance(ring: readonly PlanPoint[], [x, y]: PlanPoint): number {
  let best = Infinity;
  ring.forEach(([xa, ya], index) => {
    const [xb, yb] = ring[(index + 1) % ring.length]!;
    const dx = xb - xa;
    const dy = yb - ya;
    const length = dx * dx + dy * dy;
    const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((x - xa) * dx + (y - ya) * dy) / length));
    best = Math.min(best, Math.hypot(x - (xa + t * dx), y - (ya + t * dy)));
  });
  return best;
}
