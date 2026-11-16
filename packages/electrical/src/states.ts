import { evaluate, space, type Expr, type Result, type Space } from "@mark1russell7/vex";
import { BoolDomain, NumDomain, TextDomain } from "@mark1russell7/vex-domains";
import {
  CIRCUIT_LEVEL,
  CIRCUIT_LIMIT,
  CIRCUIT_LOAD,
  CIRCUIT_RATIO,
  CONTINUOUS_LOAD,
  DEFAULT_CONTINUOUS_LOAD,
  DEFAULT_NEAR_LOAD,
  LOAD_LEVELS,
  MISSING_LOADS,
  NEAR_LOAD,
  type LoadLevel,
  type NodeKind,
} from "./formulas.ts";
import type { ElectricalLayer } from "./layer.ts";

// The state of each circuit of a layer. The layer becomes a tree, and the programs of `formulas.ts` evaluate at each circuit.

/** This function gives the key of a node of the electrical tree: its kind, a colon and the `id` of its record. */
export function nodeKey(kind: NodeKind, id: string): string {
  return `${kind}:${id}`;
}

/**
 * This function gives the tree of a layer, as a space of Vex. The programs of a circuit evaluate at the key of its node.
 *
 * - A circuit is a root. Its fields are `breaker`, `voltage` and `limit`.
 * - An outlet is a child of its circuit, and a feed is a child of its outlet. A feed has the field `watts`.
 * - The other load of a circuit is a child of the circuit, with the kind `other` and the field `watts`.
 *
 * A record that names no parent of the layer is a root, so no circuit has it. The first record of an `id` is used.
 */
export function electricalSpace(layer: ElectricalLayer): Space {
  const records: Record<string, Readonly<Record<string, unknown>>> = {};
  const parents: Record<string, string | null> = {};
  const add = (key: string, parent: string | undefined, record: Readonly<Record<string, unknown>>): void => {
    if (Object.hasOwn(records, key)) return;
    records[key] = record;
    parents[key] = parent !== undefined && Object.hasOwn(records, parent) ? parent : null;
  };
  for (const circuit of layer.circuits ?? []) {
    const key = nodeKey("circuit", circuit.id);
    if (Object.hasOwn(records, key)) continue;
    add(key, undefined, {
      kind: "circuit",
      ...(circuit.breaker === undefined ? {} : { breaker: circuit.breaker }),
      ...(circuit.voltage === undefined ? {} : { voltage: circuit.voltage }),
      ...(circuit.limit === undefined ? {} : { limit: circuit.limit }),
    });
    if (circuit.otherLoad !== undefined) add(nodeKey("other", circuit.id), key, { kind: "other", watts: circuit.otherLoad });
  }
  for (const outlet of layer.outlets ?? []) {
    add(nodeKey("outlet", outlet.id), outlet.circuit === undefined ? undefined : nodeKey("circuit", outlet.circuit), { kind: "outlet" });
  }
  for (const feed of layer.feeds ?? []) {
    add(nodeKey("feed", feed.id), nodeKey("outlet", feed.outlet), { kind: "feed", ...(feed.watts === undefined ? {} : { watts: feed.watts }) });
  }
  return space.tree(records, parents);
}

/** The options of the limits and the levels. */
export interface LoadOptions {
  /** The part of the rating of a breaker that a continuous load can use. The default is 0.8. */
  readonly continuousLoad?: number | undefined;
  /** A circuit with this part of its limit, or more, has the level `near`. The default is 0.8. */
  readonly near?: number | undefined;
}

/** This function gives the variables of the programs, from the options. */
export function loadVars(options: LoadOptions = {}): Readonly<Record<string, number>> {
  return { [CONTINUOUS_LOAD]: options.continuousLoad ?? DEFAULT_CONTINUOUS_LOAD, [NEAR_LOAD]: options.near ?? DEFAULT_NEAR_LOAD };
}

/**
 * This function evaluates a program of `formulas.ts` at a circuit of a tree. It gives the value, or the error value.
 * `tree` is the result of `electricalSpace`, and `circuit` is the `id` of the circuit.
 */
export function evaluateCircuit(program: Expr, tree: Space, circuit: string, options: LoadOptions = {}): Result<unknown> {
  return evaluate(program, { space: tree, origin: nodeKey("circuit", circuit), domains: [NumDomain, BoolDomain, TextDomain], vars: loadVars(options) });
}

/** The state of one circuit of a layer. */
export interface CircuitState {
  /** The `id` of the circuit. */
  readonly circuit: string;
  /** The known load of the circuit, in watts: the sum of the watts of its feeds, plus its other load. */
  readonly watts: number;
  /** The limit of the circuit, in watts. A circuit with no limit has none. */
  readonly limit?: number | undefined;
  /** The known load as a part of the limit. A circuit with no limit above 0 has none. */
  readonly ratio?: number | undefined;
  /** The level of the known load. */
  readonly level: LoadLevel;
  /** The `id` of each feed of the circuit with no watts. With one or more, the true load can be above `watts`. */
  readonly missing: readonly string[];
  /** The `id` of each outlet of the circuit. */
  readonly outlets: readonly string[];
  /** The `id` of each feed from an outlet of the circuit. */
  readonly feeds: readonly string[];
  /** The `id` of each placed object with a feed from an outlet of the circuit. */
  readonly objects: readonly string[];
}

/** This function gives the number of a result, or `undefined` for an error value. */
function numberOf(result: Result<unknown>): number | undefined {
  return result.ok && typeof result.value === "number" ? result.value : undefined;
}

/** This function gives the texts of a result that is a list of texts. An error value gives no texts. */
function textsOf(result: Result<unknown>): ReadonlySet<string> {
  const value = result.ok ? result.value : [];
  return new Set(Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);
}

/** This function gives the first record of each `id` of a list, in the sequence of the list. */
function firsts<Item extends { readonly id: string }>(list: readonly Item[]): readonly Item[] {
  const seen = new Set<string>();
  return list.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

/**
 * This function gives the state of each circuit of a layer, in the sequence of the circuits.
 *
 * The level is the level of the known load. A feed with no watts adds nothing to the load, and `missing` names it.
 * A circuit with no known load has the level `unknown`, and so has a circuit with no limit above 0.
 */
export function circuitStates(layer: ElectricalLayer, options: LoadOptions = {}): readonly CircuitState[] {
  const tree = electricalSpace(layer);
  const parent = (key: string): string | undefined => tree.parentOf?.(key);
  const states: CircuitState[] = [];
  for (const circuit of firsts(layer.circuits ?? [])) {
    const key = nodeKey("circuit", circuit.id);
    const run = (program: Expr): Result<unknown> => evaluateCircuit(program, tree, circuit.id, options);
    const level = run(CIRCUIT_LEVEL);
    const missing = textsOf(run(MISSING_LOADS));
    // The tree tells the circuit of each record, so the lists and the programs agree.
    const outlets = firsts(layer.outlets ?? [])
      .filter((outlet) => parent(nodeKey("outlet", outlet.id)) === key)
      .map((outlet) => outlet.id);
    const feeds = firsts(layer.feeds ?? []).filter((feed) => {
      const outlet = parent(nodeKey("feed", feed.id));
      return outlet !== undefined && parent(outlet) === key;
    });
    states.push({
      circuit: circuit.id,
      watts: numberOf(run(CIRCUIT_LOAD)) ?? 0,
      limit: numberOf(run(CIRCUIT_LIMIT)),
      ratio: numberOf(run(CIRCUIT_RATIO)),
      level: level.ok && LOAD_LEVELS.includes(level.value as LoadLevel) ? (level.value as LoadLevel) : "unknown",
      missing: feeds.filter((feed) => missing.has(nodeKey("feed", feed.id))).map((feed) => feed.id),
      outlets,
      feeds: feeds.map((feed) => feed.id),
      objects: [...new Set(feeds.map((feed) => feed.object))],
    });
  }
  return states;
}

/**
 * This function gives the level of each outlet of a layer: the level of its circuit. The key is the `id` of the outlet.
 * An outlet with no circuit of the layer has no level, and the map does not have it.
 */
export function outletLevels(layer: ElectricalLayer, options: LoadOptions = {}): ReadonlyMap<string, LoadLevel> {
  const levels = new Map<string, LoadLevel>();
  for (const state of circuitStates(layer, options)) {
    for (const outlet of state.outlets) levels.set(outlet, state.level);
  }
  return levels;
}
