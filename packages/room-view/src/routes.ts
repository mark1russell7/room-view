import { shortestPath, type PathEdge } from "@mark1russell7/collections/graph";
import { floorLocator, floorShapes, innerFloors, type FloorShape } from "./floors.ts";
import { wallFrames, wallPoint } from "./frames.ts";
import { OPENING_KINDS, type OpeningKind, type PlanPoint, type Room } from "./room.ts";
import { metersPer } from "./units.ts";
import { cellCenter, cellNear, floorGrid, pathLength, searchGrid, straighten, walkCells, type FloorGrid } from "./walk.ts";

/** The floors on the two sides of one opening. */
export interface OpeningSides {
  /** The `id` of the opening. */
  readonly opening: string;
  /** The center of the opening on the line of its wall, in the unit of the room. */
  readonly at: PlanPoint;
  /** The floors on the two sides: none, one (an opening to the outside or to no floor) or two. */
  readonly floors: readonly string[];
  /** The first point on each floor of `floors`, at the same index, where the search found the floor. */
  readonly entries: readonly PlanPoint[];
}

/** The grids of the walks of a room graph, from `roomGraph` with the option `walk`. */
export interface RoomWalk {
  /** The grid of each floor with two or more openings. */
  readonly grids: ReadonlyMap<string, FloorGrid>;
}

/** The graph of the ways through a room: each opening between floors, and the steps between the openings of one floor. */
export interface RoomGraph {
  /** The sides of each opening of the kinds of the graph, in the sequence of the openings. */
  readonly sides: readonly OpeningSides[];
  /** A step from one opening to another opening of the same floor, in both directions. The weight is the straight distance, or the length of the walk with the option `walk`. */
  readonly steps: readonly PathEdge<string>[];
  /** The floor of each step, at the same index as the step. */
  readonly stepFloors: readonly string[];
  /** The grids of the walks. Only a graph from the option `walk` has them. */
  readonly walk?: RoomWalk | undefined;
}

/** The options of `roomGraph`. */
export interface RoomGraphOptions {
  /** The kinds of opening that a person goes through. The default is `door` and `gap`. */
  readonly kinds?: readonly OpeningKind[] | undefined;
  /**
   * The search distance for a floor from each face of the wall of an opening, in the unit of the room.
   * The default is the width of the opening and 0.3 m more. Thus the search goes past the swing of a door, which a plan import keeps out of the floor.
   */
  readonly reach?: number | undefined;
  /**
   * The walk inside each floor. With it, the weight of a step is the length of a walk on a grid inside the floor, and not the straight distance.
   * The value `true` gives cells of 0.25 m. A number gives the side of a cell in the unit of the room.
   */
  readonly walk?: boolean | number | undefined;
}

/**
 * This function makes the graph of the ways through a room.
 *
 * - The floors of an opening are the first floors on a line from its center. The line goes out from each face of its wall, up to the reach.
 * - An opening with the same floor on its two sides is not in the graph.
 * - A step joins two openings of the same floor. Its weight is the straight distance between their centers.
 *   In a floor that is not convex, the walk can be longer, so the weight is a lower bound.
 * - With the option `walk`, the weight of a step is the length of a walk on a grid inside the floor. The walk goes from the center of each opening.
 *   The other floors inside the outline of the floor are holes of its grid. A step with no walk on the grid is not in the graph.
 *
 * @param room - The room record
 * @param options - The kinds of opening and the search distance
 * @returns The sides of each opening and the steps between them
 */
export function roomGraph(room: Room, options: RoomGraphOptions = {}): RoomGraph {
  const kinds = new Set<OpeningKind>(options.kinds ?? OPENING_KINDS.filter((kind) => kind !== "window"));
  const scale = metersPer(room.unit);
  const frames = new Map(wallFrames(room).map((frame) => [frame.id, frame]));
  const floors = floorShapes(room);
  const floorAt = floorLocator(floors);
  const sides: OpeningSides[] = [];
  for (const opening of room.openings ?? []) {
    const frame = frames.get(opening.wall);
    if (frame === undefined || !kinds.has(opening.kind)) continue;
    const along = (opening.offset + opening.width / 2) * scale;
    const reach = (options.reach ?? opening.width + 0.3 / scale) * scale;
    // The probes are 0.1 m apart or closer, and there are at least four.
    const probes = Math.max(4, Math.ceil(reach / 0.1));
    const found: string[] = [];
    const entries: PlanPoint[] = [];
    for (const [face, sign] of [
      [frame.leftOffset, 1],
      [frame.rightOffset, -1],
    ] as const) {
      for (let k = 1; k <= probes; k++) {
        const point = wallPoint(frame, along, face + (sign * reach * k) / probes);
        const floor = floorAt(point.x / scale, point.y / scale);
        if (floor !== undefined) {
          found.push(floor);
          entries.push([point.x / scale, point.y / scale]);
          break;
        }
      }
    }
    const center = wallPoint(frame, along, (frame.leftOffset + frame.rightOffset) / 2);
    if (found.length === 2 && found[0] === found[1]) continue;
    sides.push({ opening: opening.id, at: [center.x / scale, center.y / scale], floors: found, entries });
  }
  const byFloor = new Map<string, OpeningSides[]>();
  for (const side of sides) for (const floor of side.floors) byFloor.set(floor, [...(byFloor.get(floor) ?? []), side]);
  const steps: PathEdge<string>[] = [];
  const stepFloors: string[] = [];
  if (options.walk === undefined || options.walk === false) {
    for (const [floor, list] of byFloor) {
      for (const a of list) {
        for (const b of list) {
          if (a === b) continue;
          steps.push({ from: a.opening, to: b.opening, weight: Math.hypot(a.at[0] - b.at[0], a.at[1] - b.at[1]) });
          stepFloors.push(floor);
        }
      }
    }
    return { sides, steps, stepFloors };
  }
  const cell = options.walk === true ? 0.25 / scale : options.walk;
  const grids = new Map<string, FloorGrid>();
  for (const [floor, list] of byFloor) {
    if (list.length < 2) continue;
    const grid = walkGrid(floors, floor, cell);
    grids.set(floor, grid);
    const cells = list.map((side) => cellNear(grid, entryOf(side, floor)));
    list.forEach((a, i) => {
      if (cells[i]! < 0) return;
      const search = searchGrid(grid, cells[i]!, cells.filter((value, j) => j !== i && value >= 0));
      list.forEach((b, j) => {
        if (j === i || cells[j]! < 0 || search.distance[cells[j]!] === Infinity) return;
        const ends = distance(a.at, entryOf(a, floor)) + distance(entryOf(b, floor), b.at);
        steps.push({ from: a.opening, to: b.opening, weight: search.distance[cells[j]!]! + ends });
        stepFloors.push(floor);
      });
    });
  }
  return { sides, steps, stepFloors, walk: { grids } };
}

/** A route from one floor to the nearest floor of a set. */
export interface FloorRoute {
  /** The floors of the route, from the start to the end. */
  readonly floors: readonly string[];
  /** The openings of the route, in their sequence. */
  readonly openings: readonly string[];
  /**
   * The length from the first opening to the last opening, along straight lines between their centers, in the unit of the room.
   * It is a lower bound of the walk. The walk inside the first floor and inside the last floor is not in it.
   */
  readonly length: number;
  /**
   * The points of the walk from the first opening to the last opening. Only a graph from the option `walk` gives them.
   * The walk goes straight between each two points, and each straight part stays inside a floor. Then `length` is the length of this walk.
   */
  readonly path?: readonly PlanPoint[] | undefined;
}

/** The options of `floorRoute`. */
export interface FloorRouteOptions {
  /**
   * The floors that a route can go through, between the start floor and the end floor. No value lets a route go through each floor.
   * Thus a route from a home to a stair can go through the corridors and not through the other homes.
   */
  readonly through?: Iterable<string> | undefined;
}

/** The node of an opening in a search has the prefix `o`. Thus no opening is the start node `s` or the end node `e`. */
const START = "s";
const END = "e";
const node = (opening: string): string => `o${opening}`;

/**
 * This function finds the shortest route from a floor to the nearest floor of a set, through the openings of a room graph.
 * A route from a floor of the set is the floor alone, with no opening and the length 0.
 *
 * @param graph - The graph from `roomGraph`
 * @param from - The `id` of the start floor
 * @param to - The `id` of each floor that ends the route
 * @param options - The floors that a route can go through
 * @returns The route, or `undefined` when no route goes from the start to a floor of the set
 */
export function floorRoute(graph: RoomGraph, from: string, to: Iterable<string>, options: FloorRouteOptions = {}): FloorRoute | undefined {
  const targets = new Set(to);
  const through = options.through === undefined ? undefined : new Set(options.through);
  if (targets.has(from)) return { floors: [from], openings: [], length: 0 };
  const ends = graph.sides.filter((side) => side.floors.some((floor) => targets.has(floor)));
  if (ends.length === 0) return undefined;
  // A route ends at an opening of a target floor. The end node joins each of them, with the weight 0.
  // A step on a floor that the route cannot go through gets no edge. `stepOf` gives the step of each edge of a step.
  const stepOf = graph.steps.flatMap((_, index) => (through === undefined || through.has(graph.stepFloors[index]!) ? [index] : []));
  const edges: PathEdge<string>[] = [
    ...stepOf.map((index) => ({ from: node(graph.steps[index]!.from), to: node(graph.steps[index]!.to), weight: graph.steps[index]!.weight })),
    ...graph.sides.filter((side) => side.floors.includes(from)).map((side) => ({ from: START, to: node(side.opening), weight: 0 })),
    ...ends.map((side) => ({ from: node(side.opening), to: END, weight: 0 })),
  ];
  const found = shortestPath(edges, START, END);
  if (found.kind !== "path") return undefined;
  const openings = found.nodes.slice(1, -1).map((name) => name.slice(1));
  const floors = [from];
  const add = (floor: string | undefined): void => {
    if (floor !== undefined && floor !== floors[floors.length - 1]) floors.push(floor);
  };
  const used = found.edges.flatMap((edge) => (edge < stepOf.length ? [stepOf[edge]!] : []));
  for (const index of used) add(graph.stepFloors[index]);
  const last = graph.sides.find((side) => side.opening === openings[openings.length - 1]);
  add(last?.floors.find((floor) => targets.has(floor)));
  if (graph.walk === undefined) return { floors, openings, length: found.cost };
  const bySide = new Map(graph.sides.map((side) => [side.opening, side]));
  const path: PlanPoint[] = openings.length === 0 ? [] : [bySide.get(openings[0]!)!.at];
  for (const index of used) {
    const step = graph.steps[index]!;
    const floor = graph.stepFloors[index]!;
    const a = bySide.get(step.from)!;
    const b = bySide.get(step.to)!;
    path.push(...floorWalk(graph.walk.grids.get(floor)!, entryOf(a, floor), entryOf(b, floor)), b.at);
  }
  return { floors, openings, length: pathLength(path), path };
}

/**
 * This function gives the walk between two points of one floor on its grid, with each corner that a straight line can skip removed.
 * The two points are the first point and the last point of the walk.
 */
function floorWalk(grid: FloorGrid, from: PlanPoint, to: PlanPoint): PlanPoint[] {
  const start = cellNear(grid, from);
  const end = cellNear(grid, to);
  const centers = walkCells(searchGrid(grid, start, [end]), end).map((index) => cellCenter(grid, index));
  return [from, ...straighten(grid, centers), to];
}

/** This function makes the grid of the walks of one floor. The other floors inside its outline are holes. */
function walkGrid(floors: readonly FloorShape[], id: string, cell: number): FloorGrid {
  const floor = floors.find((item) => item.id === id)!;
  return floorGrid(floor.ring, cell, innerFloors(floors, floor).map((hole) => hole.ring));
}

/** This function gives the first point of a floor beside an opening. */
function entryOf(side: OpeningSides, floor: string): PlanPoint {
  return side.entries[side.floors.indexOf(floor)]!;
}

/** This function gives the straight distance between two points. */
function distance(a: PlanPoint, b: PlanPoint): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}
