import { shortestPath, type PathEdge } from "@mark1russell7/collections/graph";
import { pointInRing } from "@mark1russell7/layout-contract";
import { wallFrames, wallPoint } from "./frames.ts";
import { OPENING_KINDS, type OpeningKind, type PlanPoint, type Room } from "./room.ts";
import { metersPer } from "./units.ts";

/** The floors on the two sides of one opening. */
export interface OpeningSides {
  /** The `id` of the opening. */
  readonly opening: string;
  /** The center of the opening on the line of its wall, in the unit of the room. */
  readonly at: PlanPoint;
  /** The floors on the two sides: none, one (an opening to the outside or to no floor) or two. */
  readonly floors: readonly string[];
}

/** The graph of the ways through a room: each opening between floors, and the steps between the openings of one floor. */
export interface RoomGraph {
  /** The sides of each opening of the kinds of the graph, in the sequence of the openings. */
  readonly sides: readonly OpeningSides[];
  /** A step from one opening to another opening of the same floor, in both directions. The weight is the straight distance. */
  readonly steps: readonly PathEdge<string>[];
  /** The floor of each step, at the same index as the step. */
  readonly stepFloors: readonly string[];
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
}

/**
 * This function makes the graph of the ways through a room.
 *
 * - The floors of an opening are the first floors on a line from its center, out from each face of its wall, up to the reach.
 * - An opening with the same floor on its two sides is not in the graph.
 * - A step joins two openings of the same floor. Its weight is the straight distance between their centers.
 *   In a floor that is not convex, the walk can be longer, so the weight is a lower bound.
 *
 * @param room - The room record
 * @param options - The kinds of opening and the search distance
 * @returns The sides of each opening and the steps between them
 */
export function roomGraph(room: Room, options: RoomGraphOptions = {}): RoomGraph {
  const kinds = new Set<OpeningKind>(options.kinds ?? OPENING_KINDS.filter((kind) => kind !== "window"));
  const scale = metersPer(room.unit);
  const frames = new Map(wallFrames(room).map((frame) => [frame.id, frame]));
  const floors = (room.floors ?? []).map((floor) => ({ id: floor.id, ring: floor.ring, box: boxOf(floor.ring) }));
  const floorAt = (x: number, y: number): string | undefined =>
    floors.find(({ ring, box }) => x >= box[0] && x <= box[2] && y >= box[1] && y <= box[3] && pointInRing(x, y, ring))?.id;
  const sides: OpeningSides[] = [];
  for (const opening of room.openings ?? []) {
    const frame = frames.get(opening.wall);
    if (frame === undefined || !kinds.has(opening.kind)) continue;
    const along = (opening.offset + opening.width / 2) * scale;
    const reach = (options.reach ?? opening.width + 0.3 / scale) * scale;
    // The probes are 0.1 m apart or closer, and there are at least four.
    const probes = Math.max(4, Math.ceil(reach / 0.1));
    const found: string[] = [];
    for (const [face, sign] of [
      [frame.leftOffset, 1],
      [frame.rightOffset, -1],
    ] as const) {
      for (let k = 1; k <= probes; k++) {
        const point = wallPoint(frame, along, face + (sign * reach * k) / probes);
        const floor = floorAt(point.x / scale, point.y / scale);
        if (floor !== undefined) {
          found.push(floor);
          break;
        }
      }
    }
    const center = wallPoint(frame, along, (frame.leftOffset + frame.rightOffset) / 2);
    if (found.length === 2 && found[0] === found[1]) continue;
    sides.push({ opening: opening.id, at: [center.x / scale, center.y / scale], floors: found });
  }
  const byFloor = new Map<string, OpeningSides[]>();
  for (const side of sides) for (const floor of side.floors) byFloor.set(floor, [...(byFloor.get(floor) ?? []), side]);
  const steps: PathEdge<string>[] = [];
  const stepFloors: string[] = [];
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
 * @returns The route, or `undefined` when no route goes from the start to a floor of the set
 */
export function floorRoute(graph: RoomGraph, from: string, to: Iterable<string>): FloorRoute | undefined {
  const targets = new Set(to);
  if (targets.has(from)) return { floors: [from], openings: [], length: 0 };
  const ends = graph.sides.filter((side) => side.floors.some((floor) => targets.has(floor)));
  if (ends.length === 0) return undefined;
  // A route ends at an opening of a target floor. The end node joins each of them, with the weight 0.
  const edges: PathEdge<string>[] = [
    ...graph.steps.map((step) => ({ from: node(step.from), to: node(step.to), weight: step.weight })),
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
  for (const index of found.edges) if (index < graph.steps.length) add(graph.stepFloors[index]);
  const last = graph.sides.find((side) => side.opening === openings[openings.length - 1]);
  add(last?.floors.find((floor) => targets.has(floor)));
  return { floors, openings, length: found.cost };
}

/** This function gives the box of a ring: the least x, the least y, the greatest x and the greatest y. */
function boxOf(ring: readonly PlanPoint[]): readonly [number, number, number, number] {
  const xs = ring.map(([x]) => x);
  const ys = ring.map(([, y]) => y);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}
