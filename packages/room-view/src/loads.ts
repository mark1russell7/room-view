import type { Ring } from "@mark1russell7/layout-contract";
import type { Scene } from "./room.ts";

/** These are the levels of the load of a circuit. */
export const LOAD_LEVELS: readonly ["unknown", "ok", "near", "over"] = ["unknown", "ok", "near", "over"];

/** A level of the load of a circuit. A viewer gives each level a color. */
export type LoadLevel = (typeof LOAD_LEVELS)[number];

/** The state of one circuit of a scene. */
export interface CircuitState {
  /** The `id` of the circuit. */
  readonly circuit: string;
  /** The sum of the loads of the circuit, in watts. */
  readonly watts: number;
  /** The limit of the circuit, in watts. */
  readonly limit: number;
  /** The load as a part of the limit. It is 0 for a limit that is not above 0. */
  readonly ratio: number;
  readonly level: LoadLevel;
  /** The `id` of each outlet of the circuit. */
  readonly outlets: readonly string[];
  /** The `id` of each placed object with an outlet of the circuit. */
  readonly objects: readonly string[];
}

/** The options of the levels. */
export interface LoadOptions {
  /** A circuit with this part of its limit, or more, has the level `near`. The default is 0.8. */
  readonly near?: number | undefined;
}

/** The default part of the limit at which a circuit has the level `near`. */
export const NEAR_LIMIT = 0.8;

/**
 * This function gives the state of each circuit of a scene, in the sequence of the circuits.
 *
 * The loads are input data: a calculation or a meter gives them. A circuit that no load record names has the level `unknown`,
 * and so has a circuit with a limit that is not above 0. A load above the limit has the level `over`.
 */
export function circuitStates(scene: Scene, options: LoadOptions = {}): readonly CircuitState[] {
  const near = options.near ?? NEAR_LIMIT;
  const outlets = scene.room.outlets ?? [];
  return (scene.room.circuits ?? []).map((circuit): CircuitState => {
    const loads = (scene.loads ?? []).filter((load) => load.circuit === circuit.id);
    const watts = loads.reduce((sum, load) => sum + load.watts, 0);
    const known = loads.length > 0 && circuit.limit > 0 && Number.isFinite(watts);
    const ratio = known ? watts / circuit.limit : 0;
    const mine = outlets.filter((outlet) => outlet.circuit === circuit.id).map((outlet) => outlet.id);
    return {
      circuit: circuit.id,
      watts,
      limit: circuit.limit,
      ratio,
      level: !known ? "unknown" : ratio > 1 ? "over" : ratio >= near ? "near" : "ok",
      outlets: mine,
      objects: (scene.objects ?? []).filter((object) => object.outlet !== undefined && mine.includes(object.outlet)).map((object) => object.id),
    };
  });
}

/**
 * This function gives the level of each outlet of a scene: the level of its circuit. The key is the `id` of the outlet.
 * An outlet with no circuit of the room has no level, and the map does not have it.
 */
export function outletLevels(scene: Scene, options: LoadOptions = {}): ReadonlyMap<string, LoadLevel> {
  const levels = new Map<string, LoadLevel>();
  for (const state of circuitStates(scene, options)) {
    for (const outlet of state.outlets) levels.set(outlet, state.level);
  }
  return levels;
}

/** These are the shapes of the sign of a level. */
export const LEVEL_SHAPES: readonly ["ring", "disc", "triangle", "square"] = ["ring", "disc", "triangle", "square"];

/** A shape of the sign of a level. A person who does not see a color reads the level from the shape. */
export type LevelShape = (typeof LEVEL_SHAPES)[number];

/**
 * This function gives the shape of the sign of a level: a disc for `ok`, a triangle for `near` and a square for `over`.
 * The level `unknown` has a ring, and so has an outlet with no level.
 */
export function levelShape(level: LoadLevel | undefined): LevelShape {
  return level === "ok" ? "disc" : level === "near" ? "triangle" : level === "over" ? "square" : "ring";
}

/** The outline of the sign of a shape, as a regular polygon. A circle is a polygon with 40 sides. */
export interface ShapeOutline {
  /** The radius of the circle through the corners, for a disc with the radius 1. */
  readonly radius: number;
  /** The number of the sides. */
  readonly sides: number;
  /** The angle of the first corner, in radians, counter-clockwise from the x axis. */
  readonly start: number;
  /** The radius of the hole of the sign, for a disc with the radius 1. A sign with no hole has 0. */
  readonly hole: number;
}

/**
 * The outline of the sign of each shape. Each viewer draws the signs from these values, so each viewer shows the same signs.
 * A triangle and a square with the radius of the disc look small, so they are larger.
 */
export const SHAPE_OUTLINES: Readonly<Record<LevelShape, ShapeOutline>> = {
  ring: { radius: 1, sides: 40, start: 0, hole: 0.52 },
  disc: { radius: 1, sides: 40, start: 0, hole: 0 },
  triangle: { radius: 1.3, sides: 3, start: Math.PI / 2, hole: 0 },
  square: { radius: 1.25, sides: 4, start: Math.PI / 4, hole: 0 },
};

/**
 * This function gives the corners of the outline of a sign, counter-clockwise, with the y axis up.
 * The center of the sign is the origin, and `radius` is the radius of a disc.
 */
export function shapeRing(shape: LevelShape, radius: number = 1): Ring {
  const outline = SHAPE_OUTLINES[shape];
  return Array.from({ length: outline.sides }, (_, index): readonly [number, number] => {
    const angle = outline.start + (index * 2 * Math.PI) / outline.sides;
    return [radius * outline.radius * Math.cos(angle), radius * outline.radius * Math.sin(angle)];
  });
}
