import {
  listRecords,
  ownedBy,
  recordOf,
  recordUse,
  textOf,
  withNewRecord,
  withOwned,
  withoutRecord,
  withPoint,
  withRecord,
  type Draft,
  type DraftFeature,
  type DraftList,
  type DraftObject,
  type DraftTexts,
  type Store,
} from "./draft.ts";
import { ELECTRICAL } from "./electrical.ts";

// The electrical records of the tests.
//
// The store of the page knows no topic, and the page makes its inputs from the forms of the add-ons.
// The tests of the store, of the files and of the levels use outlets and circuits as their records of an add-on.
// The functions of this file make and read those records with the functions of the store. Only tests use this file.

/** This function tells if a feature is an outlet: a point of the collection of the outlets of the electrical layer. */
export function isOutlet(feature: DraftFeature): boolean {
  return feature.point?.layer === ELECTRICAL.layer && feature.point.collection === ELECTRICAL.outlets;
}

/** This function gives the key of the circuit of an outlet. An outlet with no known circuit gives `undefined`, and a feature that is not an outlet gives `undefined` too. */
export function circuitOf(feature: DraftFeature): string | undefined {
  return isOutlet(feature) && feature.point !== undefined ? textOf(feature.point.records, ELECTRICAL.circuit) : undefined;
}

/** This function gives the key of the outlet that gives power to an object. An object with no outlet gives an empty text. */
export function outletOf(object: DraftObject): string {
  const feed = ownedBy(object, ELECTRICAL.layer, ELECTRICAL.feeds);
  return (feed === undefined ? undefined : textOf(feed.points, ELECTRICAL.outlet)) ?? "";
}

/** This function gives the point with a key the circuit with the key `circuit`. The empty key is a circuit that is not known. */
export function withOutletCircuit(draft: Draft, key: string, circuit: string): Draft {
  return withPoint(draft, key, { records: { [ELECTRICAL.circuit]: circuit } });
}

/** This function gives the object with a key its power from the outlet with the key `outlet`. The empty key is no outlet. */
export function withObjectOutlet(draft: Draft, key: string, outlet: string): Draft {
  return withOwned(draft, key, ELECTRICAL.layer, ELECTRICAL.feeds, { points: { [ELECTRICAL.outlet]: outlet } });
}

/** A circuit of a store, with the texts of its three fields. A field with no text has an empty text. */
export interface DraftCircuit {
  readonly key: string;
  readonly name: string;
  readonly breaker: string;
  readonly voltage: string;
}

/** The fields of a circuit, in the sequence of the form. */
const CIRCUIT_FIELDS: readonly ["name", "breaker", "voltage"] = ["name", "breaker", "voltage"];

/** This function gives the values of a record of the list of the circuits for fields of a circuit. */
function circuitValues(fields: Partial<Omit<DraftCircuit, "key">>): DraftTexts {
  return Object.fromEntries(
    CIRCUIT_FIELDS.flatMap((field): [string, string][] => {
      const text = fields[field];
      return text === undefined ? [] : [[ELECTRICAL[field], text]];
    }),
  );
}

/** This function gives the circuits of a store: the records of the list of the circuits. */
export function circuitsOf(store: Store): readonly DraftCircuit[] {
  return listRecords(store, ELECTRICAL.layer, ELECTRICAL.circuits).map(
    (record): DraftCircuit => ({
      key: record.key,
      name: textOf(record.values, ELECTRICAL.name) ?? "",
      breaker: textOf(record.values, ELECTRICAL.breaker) ?? "",
      voltage: textOf(record.values, ELECTRICAL.voltage) ?? "",
    }),
  );
}

/** This function gives the lists of a store for circuits. No circuit gives no list. */
export function circuitLists(circuits: readonly DraftCircuit[]): readonly DraftList[] {
  if (circuits.length === 0) return [];
  return [{ layer: ELECTRICAL.layer, collection: ELECTRICAL.circuits, records: circuits.map((circuit) => recordOf(circuit.key, { values: circuitValues(circuit) })) }];
}

/** This function adds a circuit with no name and no numbers at the end of the circuits of a store. */
export function withNewCircuit(store: Store): Store {
  return withNewRecord(store, ELECTRICAL.layer, ELECTRICAL.circuits);
}

/** This function changes the fields of the circuit with a key. */
export function withCircuit(store: Store, key: string, change: Partial<Omit<DraftCircuit, "key">>): Store {
  return withRecord(store, key, { values: circuitValues(change) });
}

/** This function removes the circuit with a key. No outlet of a room keeps it. */
export function withoutCircuit(store: Store, key: string): Store {
  return withoutRecord(store, key);
}

/** This function counts the outlets of the circuit with a key, and the rooms that have them. */
export function circuitUse(store: Store, key: string): { readonly outlets: number; readonly rooms: number } {
  const use = recordUse(store, key);
  return { outlets: use.users.length, rooms: use.rooms };
}
