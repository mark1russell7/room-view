import type { Anchor, AnchorSurface } from "./anchors.ts";
import { isLayerName } from "./room.ts";

// The form of a layer: the collections of its records and the fields of each record, as data.
// A page makes the inputs of an add-on from this data, so the page has no code of a topic.
// The functions of this file give a layer from the records of a form, and the records of a form from a layer.
// A record of a layer has this shape: its `id`, its `anchor` when it has a place, and one value for each field.

/** These are the systems of units of a person. A usual value has one number for each system. */
export const FORM_SYSTEMS: readonly ["metric", "imperial"] = ["metric", "imperial"];

/** A system of units of a person. */
export type FormSystem = (typeof FORM_SYSTEMS)[number];

/** The usual value of a number for each system of units. A page shows it in a field that has no value. */
export type FormUsual = Readonly<Record<FormSystem, number>>;

/** These are the kinds of a field of a record. */
export const FORM_FIELD_KINDS: readonly ["text", "number", "record", "object"] = ["text", "number", "record", "object"];

/** The kind of a field of a record. */
export type FormFieldKind = (typeof FORM_FIELD_KINDS)[number];

/** The parts that each field of a record has. */
export interface FormFieldPart {
  /** The name of the field in a record of the layer, for example `breaker`. */
  readonly name: string;
  /** The name of the field in a page, for example `Breaker`. */
  readonly label: string;
  /** This value is true when a record needs a value of the field. A record with no value of it is not in the layer. */
  readonly needed?: boolean | undefined;
}

/** A field with a text, for example the name of a circuit. */
export interface FormTextField extends FormFieldPart {
  readonly kind: "text";
}

/** A field with a number in a fixed unit, for example the rating of a breaker in amperes. */
export interface FormNumberField extends FormFieldPart {
  readonly kind: "number";
  /** The text of the unit in a page, for example `A`. */
  readonly unit?: string | undefined;
  /** The value of a record that has no value of the field. */
  readonly usual?: FormUsual | undefined;
  /** A valid value is above this number. */
  readonly above?: number | undefined;
  /** A valid value is this number or more. */
  readonly least?: number | undefined;
  /** The sentence of a page for a value that is not valid. It tells the person the value to type. */
  readonly fault?: string | undefined;
}

/** A field with the `id` of a record of a collection of the same layer, for example the circuit of an outlet. */
export interface FormRecordField extends FormFieldPart {
  readonly kind: "record";
  /** The name of the collection of the record. */
  readonly of: string;
  /** The text of a page for no record, for example `No circuit`. */
  readonly none?: string | undefined;
  /** The sentence of help of a page when the collection has no record. It tells the way to the first record. */
  readonly aid?: string | undefined;
}

/** A field with the `id` of a placed object of the scene, for example the object of a power feed. */
export interface FormObjectField extends FormFieldPart {
  readonly kind: "object";
}

/** A field of a record of a form. */
export type FormField = FormTextField | FormNumberField | FormRecordField | FormObjectField;

/**
 * A collection of a form: the records of one field of a layer, for example the circuits.
 *
 * - A collection with `on` has records with a place. A page shows them with the surface of their anchor.
 * - A collection with `owner` has records of an owner. A page shows them with their owner.
 * - Each other collection is a list of the level.
 */
export interface FormCollection {
  /** The name of the field of the layer that has the records, for example `circuits`. */
  readonly name: string;
  /** The word of one record for its `id`. For example, `circuit` gives the `id` `circuit-1`. */
  readonly word: string;
  /** The name of one record in a page, for example `Circuit`. */
  readonly label: string;
  /** The title of the records in a page, for example `Circuits`. */
  readonly title: string;
  /** The surfaces of the anchor of a record. A collection with no surfaces has records with no place. */
  readonly on?: readonly AnchorSurface[] | undefined;
  /** The usual height of a record on a wall above the floor, in meters. */
  readonly height?: FormUsual | undefined;
  /** The fields of a record, in the sequence of a page. */
  readonly fields: readonly FormField[];
  /** The name of the text field that gives the words of the `id` of a record. Without it, the `id` has the word and a number. */
  readonly idFrom?: string | undefined;
  /** The name of the field that names the owner of a record. It is a necessary field of the kind `object` or `record`. */
  readonly owner?: string | undefined;
  /** The largest number of records of one owner. */
  readonly most?: number | undefined;
}

/** The form of a layer. The add-on of the layer gives it as data. */
export interface LayerForm {
  /** The name of the format of the layer, for example `electrical/1`. */
  readonly schema: string;
  /** The collections of the layer, in the sequence of a page. */
  readonly collections: readonly FormCollection[];
}

/** These are the codes of the faults of a form. */
export const FORM_CODES: readonly ["form-schema", "form-collection", "form-field"] = ["form-schema", "form-collection", "form-field"];

/** The code of a fault of a form. */
export type FormCode = (typeof FORM_CODES)[number];

/** A fault of a form. */
export interface FormFault {
  readonly code: FormCode;
  /** The name of the collection, or the names of the collection and of the field with a point between them. For the form, it is empty. */
  readonly at: string;
  /** The fault in plain words, with the values. */
  readonly message: string;
}

/** The names that a field cannot have: the parts of each record, and a name that changes an object of JavaScript. */
const RESERVED: ReadonlySet<string> = new Set(["id", "anchor", "__proto__"]);

/** This function tells if a number is a valid value of a number field. */
function numberFits(field: FormNumberField, value: number): boolean {
  return Number.isFinite(value) && (field.above === undefined || value > field.above) && (field.least === undefined || value >= field.least);
}

/** This function gives the names that are in a list two times or more. */
function repeated(names: readonly string[]): ReadonlySet<string> {
  const seen = new Set<string>();
  const twice = new Set<string>();
  for (const name of names) (seen.has(name) ? twice : seen).add(name);
  return twice;
}

/**
 * This function gives the faults of a form. A form with no fault is safe for `formLayer` and `formRecords`.
 * The test of an add-on examines its form with this function.
 */
export function checkForm(form: LayerForm): readonly FormFault[] {
  const faults: FormFault[] = [];
  if (!isLayerName(form.schema)) {
    faults.push({ code: "form-schema", at: "", message: `The form has the name "${form.schema}", which is not a word, a slash and a version, for example "electrical/1".` });
  }
  const names = new Set(form.collections.map((collection) => collection.name));
  const twice = repeated(form.collections.map((collection) => collection.name));
  for (const collection of form.collections) {
    const at = collection.name;
    const fault = (message: string): void => {
      faults.push({ code: "form-collection", at, message: `The collection "${at}" ${message}` });
    };
    if (at === "" || at === "schema" || at === "__proto__") fault("has a name that a layer cannot have.");
    if (twice.has(at)) fault("is in the form two times.");
    if (collection.word === "") fault("has no word for the ids of its records.");
    if (collection.on !== undefined && (collection.on.length === 0 || repeated(collection.on).size > 0)) fault("has a list of surfaces that is empty, or that has a surface two times.");
    if (collection.height !== undefined && !(collection.on ?? []).includes("wall")) fault("has a usual height, and its records are not on a wall.");
    if (collection.height !== undefined && !FORM_SYSTEMS.every((system) => Number.isFinite(collection.height?.[system]))) fault("has a usual height that is not a number.");
    if (collection.most !== undefined && (!Number.isInteger(collection.most) || collection.most < 1)) fault(`has the largest number ${String(collection.most)}, which is not an integer of 1 or more.`);
    if (collection.most !== undefined && collection.owner === undefined) fault("has a largest number of records of one owner, and it has no owner.");
    const fields = new Map(collection.fields.map((field) => [field.name, field]));
    if (collection.owner !== undefined) {
      const owner = fields.get(collection.owner);
      if (owner === undefined || owner.needed !== true || (owner.kind !== "object" && owner.kind !== "record")) {
        fault(`has the owner "${collection.owner}", which is not a necessary field of the kind "object" or "record".`);
      }
    }
    if (collection.idFrom !== undefined && fields.get(collection.idFrom)?.kind !== "text") fault(`takes its ids from "${collection.idFrom}", which is not a text field.`);
    const twiceFields = repeated(collection.fields.map((field) => field.name));
    for (const field of collection.fields) {
      const place = `${at}.${field.name}`;
      const fieldFault = (message: string): void => {
        faults.push({ code: "form-field", at: place, message: `The field "${field.name}" of the collection "${at}" ${message}` });
      };
      if (field.name === "" || RESERVED.has(field.name)) fieldFault("has a name that a field cannot have.");
      if (twiceFields.has(field.name)) fieldFault("is in the collection two times.");
      if (field.kind === "record" && !names.has(field.of)) fieldFault(`names the collection "${field.of}", which the form does not have.`);
      if (field.kind === "number") {
        if ((field.above !== undefined && !Number.isFinite(field.above)) || (field.least !== undefined && !Number.isFinite(field.least))) fieldFault("has a limit that is not a number.");
        if (field.usual !== undefined && !FORM_SYSTEMS.every((system) => numberFits(field, field.usual?.[system] ?? Number.NaN))) fieldFault("has a usual value that is not a valid value.");
      }
    }
  }
  return faults;
}

/** A value of a field: a text, a number, or the `id` of a record or of a placed object. */
export type FormValue = string | number;

/** A record of a form: the values that a person gave. */
export interface FormRecord {
  readonly id: string;
  /** The place of the record, for a collection with surfaces. */
  readonly anchor?: Anchor | undefined;
  /** The value of each field, by the name of the field. A field with no value is absent. */
  readonly values: Readonly<Record<string, FormValue>>;
}

/** The records of a form, by the name of each collection. */
export type FormRecords = Readonly<Record<string, readonly FormRecord[]>>;

/**
 * The read of a record: its valid values, or the first field that stops the record.
 * The state `empty` tells a necessary field with no value, and the state `bad` tells a value that is not valid. The field of the place is `anchor`.
 */
export type FormReading = { readonly state: "ok"; readonly values: Readonly<Record<string, FormValue>> } | { readonly state: "empty" | "bad"; readonly field: string };

/** This function gives the value of a field in the values of a record. A field that the values do not have gives `undefined`. */
function valueOf(values: Readonly<Record<string, FormValue>>, name: string): FormValue | undefined {
  return Object.hasOwn(values, name) ? values[name] : undefined;
}

/**
 * This function reads the values of a record of a collection.
 *
 * - A number field with no value gets its usual value for the system.
 * - A text loses the spaces at its ends. An empty text is no value.
 * - A number that is not valid, or a value of a different type, stops the record.
 * - A necessary field with no value stops the record. A collection with surfaces needs an anchor on one of them.
 *
 * The function does not examine if a record or an object of a field is there. `formLayer` examines it.
 */
export function readFormRecord(collection: FormCollection, record: FormRecord, system: FormSystem): FormReading {
  if (collection.on !== undefined) {
    if (record.anchor === undefined) return { state: "empty", field: "anchor" };
    if (!collection.on.includes(record.anchor.on)) return { state: "bad", field: "anchor" };
  }
  const values: [string, FormValue][] = [];
  for (const field of collection.fields) {
    const given = valueOf(record.values, field.name);
    if (field.kind === "number") {
      const value = given ?? field.usual?.[system];
      if (value === undefined) {
        if (field.needed === true) return { state: "empty", field: field.name };
        continue;
      }
      if (typeof value !== "number" || !numberFits(field, value)) return { state: "bad", field: field.name };
      values.push([field.name, value]);
      continue;
    }
    if (given !== undefined && typeof given !== "string") return { state: "bad", field: field.name };
    const text = field.kind === "text" ? (given ?? "").trim() : (given ?? "");
    if (text === "") {
      if (field.needed === true) return { state: "empty", field: field.name };
      continue;
    }
    values.push([field.name, text]);
  }
  return { state: "ok", values: Object.fromEntries(values) };
}

/** A record that a layer can have: its values are valid. */
interface Kept {
  readonly id: string;
  readonly anchor: Anchor | undefined;
  /** The values of the record. `settle` removes a value that names a record that is not there. */
  values: Readonly<Record<string, FormValue>>;
}

/**
 * This function removes each part that names a record or an object that is not there, one time. It gives true when it removed a part.
 *
 * - A field of a record that is not in its collection loses its value. A field of an object that is not in `objects` loses its value too.
 * - A record with no value of a necessary field goes away.
 * - A record after the largest number of records of its owner goes away.
 */
function settleOnce(form: LayerForm, kept: Map<string, Kept[]>, objects: ReadonlySet<string> | undefined): boolean {
  let changed = false;
  const ids = new Map<string, ReadonlySet<string>>();
  for (const collection of form.collections) ids.set(collection.name, new Set((kept.get(collection.name) ?? []).map((record) => record.id)));
  for (const collection of form.collections) {
    const counts = new Map<string, number>();
    const list: Kept[] = [];
    for (const record of kept.get(collection.name) ?? []) {
      let stays = true;
      for (const field of collection.fields) {
        const value = valueOf(record.values, field.name);
        if (typeof value !== "string" || field.kind === "text" || field.kind === "number") continue;
        const there = field.kind === "record" ? ids.get(field.of)?.has(value) === true : objects === undefined || objects.has(value);
        if (there) continue;
        changed = true;
        if (field.needed === true) stays = false;
        else record.values = Object.fromEntries(Object.entries(record.values).filter(([name]) => name !== field.name));
      }
      if (stays && collection.owner !== undefined && collection.most !== undefined) {
        const owner = String(valueOf(record.values, collection.owner) ?? "");
        const count = (counts.get(owner) ?? 0) + 1;
        counts.set(owner, count);
        if (count > collection.most) {
          changed = true;
          stays = false;
        }
      }
      if (stays) list.push(record);
    }
    kept.set(collection.name, list);
  }
  return changed;
}

/**
 * This function removes each part that names a record or an object that is not there. It gives true when it removed a part.
 * A record that goes away can be the record of a field, so the function repeats `settleOnce` until nothing changes.
 */
function settle(form: LayerForm, kept: Map<string, Kept[]>, objects: ReadonlySet<string> | undefined): boolean {
  let removed = false;
  while (settleOnce(form, kept, objects)) removed = true;
  return removed;
}

/** The options of `formLayer`. */
export interface FormLayerOptions {
  /** The system of units of the person, for the usual value of each number. */
  readonly system: FormSystem;
  /** The ids of the placed objects of the scene. With it, a field of the kind `object` keeps only an `id` of the set. */
  readonly objects?: ReadonlySet<string> | undefined;
}

/** A layer from the records of a form: its name, and the records of each collection that has records. */
export type FormLayer = Readonly<Record<string, unknown>> & { readonly schema: string };

/**
 * This function makes the layer of the records of a form. It is total: a record that the layer cannot have is not in the layer.
 *
 * - `readFormRecord` reads each record. A record that it stops is not in the layer.
 * - The ids of a layer are unique. The first record of an `id` stays, in the sequence of the collections.
 * - A field that names a record that is not in the layer has no value. A record with no value of a necessary field is not in the layer.
 * - A collection with no record is not in the layer.
 *
 * A record of the layer has its `id`, then its `anchor`, then its values in the sequence of the fields. Thus equal records give equal JSON.
 * The add-on of the layer reads the result with its `parse`, and `checkLayers` examines it.
 */
export function formLayer(form: LayerForm, records: FormRecords, options: FormLayerOptions): FormLayer {
  const kept = new Map<string, Kept[]>();
  const seen = new Set<string>();
  for (const collection of form.collections) {
    const list: Kept[] = [];
    for (const record of Object.hasOwn(records, collection.name) ? (records[collection.name] ?? []) : []) {
      if (record.id === "" || seen.has(record.id)) continue;
      const reading = readFormRecord(collection, record, options.system);
      if (reading.state !== "ok") continue;
      seen.add(record.id);
      list.push({ id: record.id, anchor: collection.on === undefined ? undefined : record.anchor, values: reading.values });
    }
    kept.set(collection.name, list);
  }
  settle(form, kept, options.objects);
  const layer: [string, unknown][] = [["schema", form.schema]];
  for (const collection of form.collections) {
    const list = kept.get(collection.name) ?? [];
    if (list.length === 0) continue;
    layer.push([
      collection.name,
      list.map((record) => {
        const item: [string, unknown][] = [["id", record.id]];
        if (record.anchor !== undefined) item.push(["anchor", record.anchor]);
        for (const field of collection.fields) {
          const value = valueOf(record.values, field.name);
          if (value !== undefined) item.push([field.name, value]);
        }
        return Object.fromEntries(item);
      }),
    ]);
  }
  return Object.fromEntries(layer) as FormLayer;
}

/** The records of a form from a layer. */
export interface FormRecordsRead {
  /** The records of each collection of the form. A collection with no record has an empty list. */
  readonly records: FormRecords;
  /** This value is true when the layer has data that the form does not keep. */
  readonly more: boolean;
}

const isObject = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * This function gives the records of a form from a layer. Give it a layer that its add-on read: the function does not examine the form of an anchor.
 *
 * The form does not keep these data, and `more` tells them:
 *
 * - a field of the layer or of a record that the form does not have
 * - a record with no `id`, or with the `id` of an earlier record
 * - a record of a collection with surfaces that has no anchor on one of them
 * - a value that is not a valid value of its field
 * - a field that names a record that the layer does not have
 * - a record after the largest number of records of its owner
 *
 * The records of a layer of `formLayer` are the records that the layer has, and `more` is false for them.
 */
export function formRecords(form: LayerForm, layer: unknown): FormRecordsRead {
  const kept = new Map<string, Kept[]>();
  for (const collection of form.collections) kept.set(collection.name, []);
  let more = false;
  if (isObject(layer)) {
    const names = new Set(form.collections.map((collection) => collection.name));
    if (Object.keys(layer).some((key) => key !== "schema" && !names.has(key))) more = true;
    const seen = new Set<string>();
    for (const collection of form.collections) {
      const given = Object.hasOwn(layer, collection.name) ? layer[collection.name] : undefined;
      if (given === undefined) continue;
      if (!Array.isArray(given)) {
        more = true;
        continue;
      }
      const known = new Set(["id", ...(collection.on === undefined ? [] : ["anchor"]), ...collection.fields.map((field) => field.name)]);
      const list: Kept[] = [];
      for (const item of given as readonly unknown[]) {
        const id = isObject(item) ? item["id"] : undefined;
        if (!isObject(item) || typeof id !== "string" || id === "" || seen.has(id)) {
          more = true;
          continue;
        }
        const anchor = item["anchor"];
        const surfaces: readonly string[] = collection.on ?? [];
        if (collection.on !== undefined && !(isObject(anchor) && typeof anchor["on"] === "string" && surfaces.includes(anchor["on"]))) {
          more = true;
          continue;
        }
        if (Object.keys(item).some((key) => !known.has(key))) more = true;
        const values: [string, FormValue][] = [];
        for (const field of collection.fields) {
          const value = Object.hasOwn(item, field.name) ? item[field.name] : undefined;
          if (value === undefined) continue;
          if (field.kind === "number") {
            if (typeof value === "number" && numberFits(field, value)) values.push([field.name, value]);
            else more = true;
          } else if (typeof value !== "string") more = true;
          else if (field.kind === "text") {
            // The spaces at the ends of a text are not data, and an empty text is no value.
            if (value.trim() !== "") values.push([field.name, value.trim()]);
          } else if (value === "") more = true;
          else values.push([field.name, value]);
        }
        seen.add(id);
        list.push({ id, anchor: collection.on === undefined ? undefined : (anchor as Anchor), values: Object.fromEntries(values) });
      }
      kept.set(collection.name, list);
    }
    // A record with no value of a necessary field is not a record of the form.
    for (const collection of form.collections) {
      const needed = collection.fields.filter((field) => field.needed === true);
      // A number with a usual value has a value in each layer of `formLayer`, so it does not stop a record.
      const has = (record: Kept, field: FormField): boolean => valueOf(record.values, field.name) !== undefined || (field.kind === "number" && field.usual !== undefined);
      const list = (kept.get(collection.name) ?? []).filter((record) => needed.every((field) => has(record, field)));
      if (list.length !== (kept.get(collection.name) ?? []).length) more = true;
      kept.set(collection.name, list);
    }
    if (settle(form, kept, undefined)) more = true;
  } else if (layer !== undefined) more = true;
  const records: [string, readonly FormRecord[]][] = form.collections.map((collection) => [
    collection.name,
    (kept.get(collection.name) ?? []).map((record): FormRecord => ({ id: record.id, ...(record.anchor === undefined ? {} : { anchor: record.anchor }), values: record.values })),
  ]);
  return { records: Object.fromEntries(records), more };
}
