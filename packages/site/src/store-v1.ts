import { ELECTRICAL } from "./add-ons.ts";

// The move of a store of version 1 of the page "Measure a room" to version 2.
// A store of version 1 has the electrical records in fields of its own: the circuits of the store, the circuit of an outlet and the outlet of an object.
// A store of version 2 keeps the records of each add-on by the name of its layer. The move loses no number.
// The move does not examine the store. The reader of version 2 examines the result, so the two versions have one set of rules.

type Json = Readonly<Record<string, unknown>>;

const isObject = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value);

/** This function changes each item of a list. A value that is not a list stays, and the reader of version 2 refuses it. */
const each = (value: unknown, change: (item: unknown) => unknown): unknown => (Array.isArray(value) ? value.map(change) : value);

/**
 * This function moves a feature. An outlet becomes a point of the collection of the outlets, and its circuit becomes a field of its record.
 * A feature of a different kind had no use for a circuit, so it loses that field.
 * An outlet with no circuit has the empty text, and the reader of version 2 removes a field with the empty text.
 */
function featureFromV1(value: unknown): unknown {
  if (!isObject(value)) return value;
  const { circuit, ...rest } = value;
  if (value["kind"] !== "outlet") return rest;
  const records = circuit === undefined ? {} : { [ELECTRICAL.circuit]: circuit };
  return { ...rest, kind: "point", point: { layer: ELECTRICAL.layer, collection: ELECTRICAL.outlets, values: {}, records, points: {} } };
}

/**
 * This function moves an object, with the objects that it holds. The outlet of an object becomes a feed: a record that the object owns.
 * An object with no text for its outlet is not an object of version 1. It gets no list of records, so the reader refuses it.
 */
function objectFromV1(value: unknown): unknown {
  if (!isObject(value)) return value;
  const { outlet, holds, ...rest } = value;
  const feed = { layer: ELECTRICAL.layer, collection: ELECTRICAL.feeds, values: {}, records: {}, points: { [ELECTRICAL.outlet]: outlet } };
  const owns = typeof outlet === "string" ? (outlet === "" ? [] : [feed]) : undefined;
  return { ...rest, owns, holds: each(holds, objectFromV1) };
}

function sideFromV1(value: unknown): unknown {
  if (!isObject(value)) return value;
  return { ...value, features: each(value["features"] ?? [], featureFromV1), objects: each(value["objects"] ?? [], objectFromV1) };
}

function roomFromV1(value: unknown): unknown {
  return isObject(value) ? { ...value, sides: each(value["sides"], sideFromV1) } : value;
}

/** This function moves a circuit to a record of the list of the circuits. A circuit with no text in a field is not a circuit, and the reader removes it. */
function circuitFromV1(value: unknown): unknown {
  if (!isObject(value)) return value;
  return { key: value["key"], values: { [ELECTRICAL.name]: value["name"], [ELECTRICAL.breaker]: value["breaker"], [ELECTRICAL.voltage]: value["voltage"] }, records: {} };
}

/**
 * This function gives the store of version 2 for the data of a store of version 1.
 * The rooms, the connections and the shown room stay. The keys of the features, of the objects and of the circuits stay too.
 */
export function storeFromV1(value: Json): Json {
  const { circuits, ...rest } = value;
  const lists = Array.isArray(circuits) && circuits.length > 0 ? [{ layer: ELECTRICAL.layer, collection: ELECTRICAL.circuits, records: circuits.map(circuitFromV1) }] : [];
  return { ...rest, version: 2, rooms: each(value["rooms"], roomFromV1), lists };
}
