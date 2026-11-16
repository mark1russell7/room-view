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
