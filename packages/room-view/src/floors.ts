import { pointInRing, regionArea } from "@mark1russell7/layout-contract";
import type { PlanPoint, Room } from "./room.ts";

/** A floor of a room with its box and its area, for the searches of the floor at a point. */
export interface FloorShape {
  readonly id: string;
  readonly ring: readonly PlanPoint[];
  /** The least x, the least y, the greatest x and the greatest y of the outline. */
  readonly box: readonly [number, number, number, number];
  readonly area: number;
}

/** This function gives the shape of each floor of a room. */
export function floorShapes(room: Room): FloorShape[] {
  return (room.floors ?? []).map((floor) => ({ id: floor.id, ring: floor.ring, box: boxOf(floor.ring), area: regionArea({ kind: "polygon", points: floor.ring }) }));
}

/**
 * This function gives a search of the floor at a point. The outline of a floor can go around other floors, as a corridor goes around a court.
 * Thus the smallest floor that holds a point is its floor. A point on no floor gives no value.
 */
export function floorLocator(floors: readonly FloorShape[]): (x: number, y: number) => string | undefined {
  return (x, y) => {
    let best: FloorShape | undefined;
    for (const floor of floors) {
      const { box } = floor;
      if (x < box[0] || x > box[2] || y < box[1] || y > box[3] || (best !== undefined && floor.area >= best.area)) continue;
      if (pointInRing(x, y, floor.ring)) best = floor;
    }
    return best?.id;
  };
}

/** This function gives the other floors inside the outline of a floor: the floors that are smaller, inside its box and inside its outline. */
export function innerFloors(floors: readonly FloorShape[], floor: FloorShape): FloorShape[] {
  const [x0, y0, x1, y1] = floor.box;
  return floors.filter(
    (other) =>
      other.id !== floor.id &&
      other.area < floor.area &&
      other.box[0] >= x0 &&
      other.box[1] >= y0 &&
      other.box[2] <= x1 &&
      other.box[3] <= y1 &&
      pointInRing(other.ring[0]![0], other.ring[0]![1], floor.ring),
  );
}

/** This function gives the box of a ring: the least x, the least y, the greatest x and the greatest y. */
export function boxOf(ring: readonly PlanPoint[]): readonly [number, number, number, number] {
  const xs = ring.map(([x]) => x);
  const ys = ring.map(([, y]) => y);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}
