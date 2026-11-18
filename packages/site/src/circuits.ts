import { numberOf, systemOf, type DraftCircuit, type LengthMode, type System } from "./draft.ts";
import { circuitLimit } from "./electrical.ts";

// The circuits of the page "Measure a room": the breakers of the electrical panel, and the limit of each one.
// The limit comes from `circuitLimit` of the electrical add-on of the page, so the inputs and the records have one formula.
// Each function of this file is pure, so the tests need no browser.

/** One numeric fact of a circuit: the rating of its breaker in amperes, or its voltage in volts. */
export type CircuitField = "breaker" | "voltage";

/**
 * The usual breaker and voltage of a circuit of a home, for an empty field.
 *
 * - A home with feet and inches is in North America, thus 15 A at 120 V.
 * - A home with meters is in most other countries, thus 16 A at 230 V.
 */
const USUAL_CIRCUIT: Readonly<Record<System, Readonly<Record<CircuitField, number>>>> = {
  imperial: { breaker: 15, voltage: 120 },
  metric: { breaker: 16, voltage: 230 },
};

/** This function gives the usual breaker or voltage of a circuit for the units of a mode. The page uses it when the field has no text. */
export function usualCircuit(field: CircuitField, mode: LengthMode): number {
  return USUAL_CIRCUIT[systemOf(mode)][field];
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
