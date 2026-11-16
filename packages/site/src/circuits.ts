import { CIRCUIT_LIMIT, CONTINUOUS_LOAD, DEFAULT_CONTINUOUS_LOAD } from "@mark1russell7/cluster-design";
import type { Circuit } from "@mark1russell7/room-view";
import { evaluate, space } from "@mark1russell7/vex";
import { NumDomain } from "@mark1russell7/vex-domains";
import { idsOf, MOST_CIRCUITS, MOST_TEXT, numberOf, systemOf, type CircuitRecords, type DraftCircuit, type LengthMode, type System } from "./draft.ts";

// The circuits of the page "Measure a room": the breakers of the electrical panel, and the limit of each one.
// The limit is the program `CIRCUIT_LIMIT` of `@mark1russell7/cluster-design`, so this page and the cluster design use one formula.
// Each function of this file is pure, so the tests need no browser.

/** A number of a circuit: the rating of its breaker in amperes, or its voltage in volts. */
export type CircuitField = "breaker" | "voltage";

/**
 * The usual breaker and voltage of a circuit of a home, for an empty field.
 * A home with feet and inches is in North America: 15 A at 120 V. A home with meters is in most other countries: 16 A at 230 V.
 */
const USUAL_CIRCUIT: Readonly<Record<System, Readonly<Record<CircuitField, number>>>> = {
  imperial: { breaker: 15, voltage: 120 },
  metric: { breaker: 16, voltage: 230 },
};

/** This function gives the usual value of a number of a circuit for the units of a mode. The page uses it when the field has no text. */
export function usualCircuit(field: CircuitField, mode: LengthMode): number {
  return USUAL_CIRCUIT[systemOf(mode)][field];
}

/**
 * This function gives the continuous load limit of a circuit in watts, from the rating of its breaker and its voltage.
 * The program `CIRCUIT_LIMIT` multiplies the voltage, the rating and the part for a continuous load: 80%, the default of the cluster design.
 * Thus 15 A at 120 V gives 1440 W. A value that is not a finite number gives `undefined`.
 */
export function circuitLimit(breaker: number, voltage: number): number | undefined {
  const result = evaluate(CIRCUIT_LIMIT, {
    space: space.record({ circuit: { breaker, voltage } }),
    origin: "circuit",
    domains: [NumDomain],
    vars: { [CONTINUOUS_LOAD]: DEFAULT_CONTINUOUS_LOAD },
  });
  // The limit is in watts, and a part of a milliwatt is noise of the floating point.
  return result.ok && typeof result.value === "number" && Number.isFinite(result.value) ? Math.round(result.value * 1000) / 1000 : undefined;
}

/** The numbers of a circuit of the draft: its breaker, its voltage and its limit, or the first field that has no valid number. */
export type CircuitReading =
  | { readonly state: "ok"; readonly breaker: number; readonly voltage: number; readonly limit: number }
  | { readonly state: "bad"; readonly field: CircuitField };

/** This function reads the numbers of a circuit. An empty field gets its usual value. A field with a text that is not a number above 0 is bad. */
export function readCircuit(circuit: DraftCircuit, mode: LengthMode): CircuitReading {
  const read = (field: CircuitField): number | undefined => {
    const value = numberOf(circuit[field]) ?? usualCircuit(field, mode);
    return value > 0 && Number.isFinite(value) ? value : undefined;
  };
  const breaker = read("breaker");
  if (breaker === undefined) return { state: "bad", field: "breaker" };
  const voltage = read("voltage");
  if (voltage === undefined) return { state: "bad", field: "voltage" };
  const limit = circuitLimit(breaker, voltage);
  return limit === undefined || !(limit > 0) ? { state: "bad", field: "breaker" } : { state: "ok", breaker, voltage, limit };
}

/** This function gives the name of a circuit in the page: its name, or its number when it has no name. */
export function circuitName(circuit: DraftCircuit, index: number): string {
  const name = circuit.name.trim();
  return name === "" ? `Circuit ${String(index + 1)}` : name;
}

/**
 * This function makes the records of the circuits of a store, for a survey record or a level record.
 * The `id` of a circuit is the words of its name, or `circuit-N` when it has no name.
 * A circuit with a bad number is not in the records, so no outlet names it.
 */
export function circuitRecords(circuits: readonly DraftCircuit[], mode: LengthMode): CircuitRecords {
  const ids = new Map<string, string>();
  const records: Circuit[] = [];
  const names = idsOf(
    circuits.map((circuit) => circuit.name),
    "circuit",
  );
  circuits.forEach((circuit, index) => {
    const reading = readCircuit(circuit, mode);
    const id = names[index];
    if (reading.state !== "ok" || id === undefined) return;
    const name = circuit.name.trim();
    ids.set(circuit.key, id);
    records.push({ id, ...(name === "" ? {} : { name }), breaker: reading.breaker, voltage: reading.voltage, limit: reading.limit });
  });
  return { ids, records };
}

/** The circuits of a store from the circuit records of a file. */
export interface CircuitDrafts {
  readonly circuits: readonly DraftCircuit[];
  /** The key of the circuit of the store for the `id` of each circuit record. */
  readonly keys: ReadonlyMap<string, string>;
  /**
   * This value is true when the records have data that the store does not keep.
   * Such data is a second record of an `id` with different data, a circuit past the limit of a store, or a name that is too long.
   * It is also a limit that is not the limit of the breaker and the voltage of the record.
   */
  readonly more: boolean;
}

/** This function gives the text of a number of a circuit record. A number that is not above 0 gives an empty text, and the page uses the usual value. */
function numberText(value: number | undefined): string {
  return value !== undefined && Number.isFinite(value) && value > 0 ? String(value) : "";
}

/**
 * This function makes the circuits of a store from circuit records. Two records with one `id` are one circuit, and the first one stays.
 * The page calculates the limit of each circuit from its breaker and its voltage, so it does not keep the limit of a record.
 */
export function circuitDrafts(records: readonly Circuit[], mode: LengthMode): CircuitDrafts {
  const first = new Map<string, Circuit>();
  const keys = new Map<string, string>();
  const circuits: DraftCircuit[] = [];
  let more = false;
  for (const record of records) {
    const earlier = first.get(record.id);
    if (earlier !== undefined) {
      if (JSON.stringify(earlier) !== JSON.stringify(record)) more = true;
      continue;
    }
    if (circuits.length >= MOST_CIRCUITS) {
      more = true;
      continue;
    }
    first.set(record.id, record);
    const given = (record.name ?? "").trim();
    const circuit: DraftCircuit = { key: `c${String(circuits.length + 1)}`, name: given.slice(0, MOST_TEXT), breaker: numberText(record.breaker), voltage: numberText(record.voltage) };
    keys.set(record.id, circuit.key);
    circuits.push(circuit);
    const reading = readCircuit(circuit, mode);
    const limit = reading.state === "ok" ? reading.limit : Number.NaN;
    if (given.length > MOST_TEXT || !(Math.abs(limit - record.limit) <= 1e-6 * Math.max(1, Math.abs(record.limit)))) more = true;
  }
  return { circuits, keys, more };
}
