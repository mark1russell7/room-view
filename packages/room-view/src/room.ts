import type { Ring } from "@mark1russell7/layout-contract";
import type { LengthUnit } from "./units.ts";

/** A point of the plan: `[x, y]`. The plan is the view from above, and the z axis points up. */
export type PlanPoint = readonly [number, number];

/** The name of the format of a room record. */
export const ROOM_SCHEMA = "room/1";

/** The name of the format of a scene record. */
export const SCENE_SCHEMA = "scene/1";

/** These are the sides of the line of a wall that can have the wall. */
export const WALL_SIDES: readonly ["center", "left", "right"] = ["center", "left", "right"];

/**
 * The side of the line of a wall that has the wall, for a person who looks from `from` to `to`.
 * With `center`, the line is the middle of the wall. With `left` or `right`, the line is one face of the wall.
 */
export type WallSide = (typeof WALL_SIDES)[number];

/** These are the faces of a wall, for a person who looks from `from` to `to`. */
export const WALL_FACES: readonly ["left", "right"] = ["left", "right"];

/** A face of a wall. */
export type WallFace = (typeof WALL_FACES)[number];

/**
 * A wall: a straight line in the plan, with a thickness and a height.
 * A tape measure gives the faces of a wall, so `side` lets the line be a face. Two walls with a common end make a corner.
 */
export interface Wall {
  readonly id: string;
  readonly from: PlanPoint;
  readonly to: PlanPoint;
  /** The thickness of the wall. The default is `wallThickness` of the room. */
  readonly thickness?: number | undefined;
  /** The height of the wall. The default is `height` of the room. */
  readonly height?: number | undefined;
  /** The side of the line that has the wall. The default is `center`. */
  readonly side?: WallSide | undefined;
}

/** These are the kinds of an opening. A window has glass. A door and a gap are empty. */
export const OPENING_KINDS: readonly ["door", "window", "gap"] = ["door", "window", "gap"];

/** A kind of opening. */
export type OpeningKind = (typeof OPENING_KINDS)[number];

/** An opening: a hole through a wall. */
export interface Opening {
  readonly id: string;
  /** The `id` of the wall. */
  readonly wall: string;
  readonly kind: OpeningKind;
  /** The distance along the line of the wall, from `from` to the near edge of the opening. */
  readonly offset: number;
  readonly width: number;
  /** The height of the bottom of the opening above the floor. The default is 0. */
  readonly sill?: number | undefined;
  readonly height: number;
}

/** A floor: one area of the plan, for example one room of an apartment. The ring is the line where the floor touches the walls. */
export interface Floor {
  readonly id: string;
  readonly name?: string | undefined;
  readonly ring: Ring;
}

/** An outlet: a point on a face of a wall. */
export interface Outlet {
  readonly id: string;
  /** The `id` of the wall. */
  readonly wall: string;
  /** The face of the wall that has the outlet. */
  readonly face: WallFace;
  /** The distance along the line of the wall, from `from` to the center of the outlet. */
  readonly offset: number;
  /** The height of the center of the outlet above the floor. */
  readonly height: number;
  /** The `id` of the circuit of the outlet. */
  readonly circuit?: string | undefined;
}

/** A circuit: it gives power to outlets, and it has a limit. */
export interface Circuit {
  readonly id: string;
  readonly name?: string | undefined;
  /**
   * The largest continuous load, in watts.
   * For example, a breaker of 15 A at 120 V carries 1800 W, and 80% of that for a continuous load is 1440 W.
   */
  readonly limit: number;
}

/** A room: the walls, the openings, the floors, the outlets and the circuits of one room or one apartment. */
export interface Room {
  readonly schema: typeof ROOM_SCHEMA;
  readonly name?: string | undefined;
  /** The unit of each length of the record. */
  readonly unit: LengthUnit;
  /** The height of each wall that has no height of its own. */
  readonly height: number;
  /** The thickness of each wall that has no thickness of its own. */
  readonly wallThickness: number;
  readonly walls: readonly Wall[];
  readonly openings?: readonly Opening[] | undefined;
  readonly floors?: readonly Floor[] | undefined;
  readonly outlets?: readonly Outlet[] | undefined;
  readonly circuits?: readonly Circuit[] | undefined;
}

/**
 * A placed object: a box in the room, for example a desk, a rack or a computer.
 * With a `parent`, the position and the turn are relative to that object, whose origin is the center of its bottom.
 */
export interface PlacedObject {
  readonly id: string;
  /** The class of the object, for example `desk`, `rack` or `computer`. A viewer gives each class a color. */
  readonly kind: string;
  readonly name?: string | undefined;
  /** The size before the turn: along x, along y, and the height. */
  readonly size: readonly [number, number, number];
  /** The point of the plan below the center of the object. */
  readonly at: PlanPoint;
  /** The height of the bottom of the object above the floor, or above the bottom of its parent. The default is 0. */
  readonly lift?: number | undefined;
  /** The turn about the vertical axis in degrees, counter-clockwise from above. The default is 0. */
  readonly turn?: number | undefined;
  /** The `id` of the object that holds this object. */
  readonly parent?: string | undefined;
  /** The `id` of the outlet that gives power to the object. */
  readonly outlet?: string | undefined;
}

/** A load on a circuit, in watts. A circuit can have many loads: their sum is the load of the circuit. */
export interface CircuitLoad {
  /** The `id` of the circuit. */
  readonly circuit: string;
  readonly watts: number;
}

/** A scene: one room with its placed objects and the loads of its circuits. Two scenes of one room can be compared. */
export interface Scene {
  readonly schema: typeof SCENE_SCHEMA;
  readonly name?: string | undefined;
  readonly room: Room;
  readonly objects?: readonly PlacedObject[] | undefined;
  readonly loads?: readonly CircuitLoad[] | undefined;
}
