import type { AddOnFault, SceneSpace } from "@mark1russell7/room-view";
import { LIMITS_DIFFER, RATED_LIMIT } from "./formulas.ts";
import type { ElectricalLayer } from "./layer.ts";
import { circuitStates, electricalSpace, evaluateCircuit, type LoadOptions } from "./states.ts";

// The checks of the meaning of an electrical layer. The schema examines the form, and the core examines each anchor.

/** These are the codes of the faults of an electrical layer. */
export const ELECTRICAL_CODES: readonly [
  "id-duplicate",
  "outlet-circuit",
  "feed-outlet",
  "feed-object",
  "feed-watts",
  "circuit-number",
  "circuit-no-limit",
  "circuit-limits",
  "circuit-over",
] = ["id-duplicate", "outlet-circuit", "feed-outlet", "feed-object", "feed-watts", "circuit-number", "circuit-no-limit", "circuit-limits", "circuit-over"];

/** A code of a fault of an electrical layer. */
export type ElectricalCode = (typeof ELECTRICAL_CODES)[number];

/** A fault of an electrical layer. `checkLayers` of the core gives it the name of the layer. */
export interface ElectricalFault extends AddOnFault {
  readonly code: ElectricalCode;
}

/** This function gives a number with 3 decimals at most. */
function show(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}

/** This function tells if a value is a finite number above 0. */
function isAboveZero(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

/** This function tells if a value is a finite number, 0 or more. */
function isZeroOrMore(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

/**
 * This function gives each fault of the meaning of an electrical layer, in the space of a scene.
 *
 * - An error: an `id` of two records, a circuit, an outlet or an object that is not there, and a number that is not valid.
 * - A warning: a circuit with no limit, a limit that is not the rated limit, and a known load above the limit.
 *
 * The function does not examine the anchors: `checkLayers` of the core does. A warning is a fault that a viewer can show.
 */
export function checkElectrical(layer: ElectricalLayer, space: SceneSpace, options: LoadOptions = {}): readonly ElectricalFault[] {
  const faults: ElectricalFault[] = [];
  const error = (code: ElectricalCode, at: string, message: string, other?: string): void => {
    faults.push({ level: "error", code, at, message, ...(other === undefined ? {} : { other }) });
  };
  const warning = (code: ElectricalCode, at: string, message: string): void => {
    faults.push({ level: "warning", code, at, message });
  };
  const outlets = layer.outlets ?? [];
  const circuits = layer.circuits ?? [];
  const feeds = layer.feeds ?? [];

  const kinds = new Map<string, string[]>();
  const count = (word: string, id: string): void => {
    kinds.set(id, [...(kinds.get(id) ?? []), word]);
  };
  for (const outlet of outlets) count("an outlet", outlet.id);
  for (const circuit of circuits) count("a circuit", circuit.id);
  for (const feed of feeds) count("a feed", feed.id);
  for (const [id, words] of kinds) {
    if (words.length > 1) error("id-duplicate", id, `The id "${id}" is the id of ${words.length} records of the layer: ${words.join(", ")}. Each record of a layer has its own id.`);
  }

  const circuitIds = new Set(circuits.map((circuit) => circuit.id));
  const outletIds = new Set(outlets.map((outlet) => outlet.id));
  for (const outlet of outlets) {
    if (outlet.circuit !== undefined && !circuitIds.has(outlet.circuit)) {
      error("outlet-circuit", outlet.id, `The outlet "${outlet.id}" is on the circuit "${outlet.circuit}", which the layer does not have.`, outlet.circuit);
    }
  }
  for (const feed of feeds) {
    if (!outletIds.has(feed.outlet)) error("feed-outlet", feed.id, `The feed "${feed.id}" is from the outlet "${feed.outlet}", which the layer does not have.`, feed.outlet);
    if (space.object(feed.object) === undefined) error("feed-object", feed.id, `The feed "${feed.id}" gives power to the object "${feed.object}", which the scene does not have.`, feed.object);
    if (feed.watts !== undefined && !isZeroOrMore(feed.watts)) error("feed-watts", feed.id, `The feed "${feed.id}" has a power of ${show(feed.watts)} W. It must be a finite number, 0 or more.`);
  }

  const tree = electricalSpace(layer);
  const states = new Map(circuitStates(layer, options).map((state) => [state.circuit, state] as const));
  const examined = new Set<string>();
  for (const circuit of circuits) {
    const name = `the circuit "${circuit.id}"`;
    if (circuit.breaker !== undefined && !isAboveZero(circuit.breaker)) error("circuit-number", circuit.id, `The breaker of ${name} is ${show(circuit.breaker)} A. It must be above 0.`);
    if (circuit.voltage !== undefined && !isAboveZero(circuit.voltage)) error("circuit-number", circuit.id, `The voltage of ${name} is ${show(circuit.voltage)} V. It must be above 0.`);
    if (circuit.limit !== undefined && !isAboveZero(circuit.limit)) error("circuit-number", circuit.id, `The limit of ${name} is ${show(circuit.limit)} W. It must be above 0.`);
    if (circuit.otherLoad !== undefined && !isZeroOrMore(circuit.otherLoad)) {
      error("circuit-number", circuit.id, `The other load of ${name} is ${show(circuit.otherLoad)} W. It must be a finite number, 0 or more.`);
    }
    // The tree has the first record of an `id`, so the programs examine only that record.
    if (examined.has(circuit.id)) continue;
    examined.add(circuit.id);
    const state = states.get(circuit.id);
    if (state === undefined) continue;
    if (state.limit === undefined) {
      warning("circuit-no-limit", circuit.id, `The circuit "${circuit.id}" has no limit, and it does not have a breaker and a voltage. Its level is not known.`);
    }
    const differ = evaluateCircuit(LIMITS_DIFFER, tree, circuit.id, options);
    const rated = evaluateCircuit(RATED_LIMIT, tree, circuit.id, options);
    if (differ.ok && differ.value === true && rated.ok && typeof rated.value === "number" && circuit.limit !== undefined) {
      warning(
        "circuit-limits",
        circuit.id,
        `The circuit "${circuit.id}" has the limit ${show(circuit.limit)} W. Its breaker of ${show(circuit.breaker ?? 0)} A at ${show(circuit.voltage ?? 0)} V gives ${show(rated.value)} W for a continuous load.`,
      );
    }
    if (state.level === "over" && state.limit !== undefined) {
      warning("circuit-over", circuit.id, `The circuit "${circuit.id}" has a known load of ${show(state.watts)} W, above its limit of ${show(state.limit)} W.`);
    }
  }
  return faults;
}
