import {
  formLayer,
  formRecords,
  readFormRecord,
  type Anchor,
  type FormCollection,
  type FormField,
  type FormRecord,
  type FormRecords,
  type FormSystem,
  type FormValue,
  type LayerForm,
  type Level,
  type Survey,
  type WallFace,
} from "@mark1russell7/room-view";
import { ADD_ONS } from "./add-ons.ts";
import type { PageAddOn } from "./bridge.ts";
import {
  draftKeys,
  hasMore,
  idsOf,
  keptIds,
  listedObjects,
  listRecords,
  modeOf,
  MOST_OWNED,
  MOST_RECORDS,
  MOST_TEXT,
  nameWords,
  numberOf,
  ownedOf,
  placedFeatures,
  recordOf,
  surveyOf,
  systemOf,
  textOf,
  wallId,
  walksRight,
  type Draft,
  type DraftList,
  type DraftOwned,
  type DraftRecord,
  type DraftTexts,
  type Store,
  type SurveyParts,
  type SurveyPoint,
} from "./draft.ts";

// The records of the add-ons of the page "Measure a room", as records of the forms of the add-ons.
//
// A store keeps the fields of a record as a person typed them. A form tells the kind of each field.
// This file changes the records of a store to the records of a form, and back. It knows no topic: each name comes from a form.
// Each function of this file is pure, so the tests need no browser.

/** The place of the records of a collection in the page. */
export type Place = "point" | "owned" | "list";

/**
 * This function gives the place of the records of a collection in the page.
 *
 * - A collection with a wall in its surfaces has the points of the walls.
 * - A collection with an owner of the kind `object` has the records that an object owns.
 * - A collection with no surfaces and no owner is a list of the store.
 *
 * Each other collection has no place in the page yet, and the function gives `undefined`.
 */
export function placeOf(collection: FormCollection): Place | undefined {
  if (collection.on !== undefined) return collection.on.includes("wall") ? "point" : undefined;
  if (collection.owner === undefined) return "list";
  return collection.fields.some((field) => field.name === collection.owner && field.kind === "object") ? "owned" : undefined;
}

/** This function gives the place of the collection with a name in a form. A name that the form does not have gives `undefined`. */
function placeIn(form: LayerForm, name: string): Place | undefined {
  const collection = form.collections.find((item) => item.name === name);
  return collection === undefined ? undefined : placeOf(collection);
}

/**
 * This function gives the number of the text of a number field. A text with no characters gives `undefined`.
 * A text with a minus sign at its start is a number below 0. A text that is not a number gives `NaN`.
 */
export function numberFrom(text: string): number | undefined {
  const trimmed = text.trim();
  if (!trimmed.startsWith("-")) return numberOf(trimmed);
  const value = numberOf(trimmed.slice(1));
  return value === undefined ? Number.NaN : -value;
}

/** This function gives the word of the records of a collection for an `id`. A collection with no word gives `record`. */
function wordOf(collection: FormCollection): string {
  const words = nameWords(collection.word);
  return words.length === 0 ? "record" : words.join("-");
}

/** This function gives an `id` that `taken` does not have, and it adds the `id` to `taken`. A taken `id` gets a number at its end. */
function freeId(base: string, taken: Set<string>): string {
  let id = base;
  for (let count = 2; taken.has(id); count += 1) id = `${base}-${String(count)}`;
  taken.add(id);
  return id;
}

/** This function gives the records of a collection. A collection with no records gives an empty list. */
function recordsIn(records: FormRecords, name: string): readonly FormRecord[] {
  return Object.hasOwn(records, name) ? (records[name] ?? []) : [];
}

/** The ids of the records that the fields of a record can name. */
interface Names {
  /** The `id` of each record of the lists of the store, by its key. */
  readonly lists: ReadonlyMap<string, string>;
  /** The `id` of each point of the room, by the key of its feature. */
  readonly points: ReadonlyMap<string, string>;
  /** The `id` of the object that owns the record. */
  readonly owner?: string | undefined;
}

/** The fields of a record of a store. A record of a list names no point. */
interface TypedFields {
  readonly values: DraftTexts;
  readonly records: DraftTexts;
  readonly points?: DraftTexts | undefined;
}

/**
 * This function gives the values of a record of a form from the fields of a record of a store.
 *
 * - A text that is not a number gives `NaN`, so the form does not accept the record.
 * - A field that names a record gets the `id` of that record. A name with no record gives no value.
 * - The field of the owner gets the `id` of the object. Each other field of the kind `object` has no value.
 */
function valuesOf(form: LayerForm, collection: FormCollection, fields: TypedFields, names: Names): Readonly<Record<string, FormValue>> {
  const values: [string, FormValue][] = [];
  for (const field of collection.fields) {
    let value: FormValue | undefined;
    if (field.kind === "text") value = textOf(fields.values, field.name);
    else if (field.kind === "number") {
      const text = textOf(fields.values, field.name);
      value = text === undefined ? undefined : numberFrom(text);
    } else if (field.kind === "object") value = field.name === collection.owner ? names.owner : undefined;
    else {
      const place = placeIn(form, field.of);
      const key = place === "list" ? textOf(fields.records, field.name) : place === "point" ? textOf(fields.points ?? {}, field.name) : undefined;
      value = key === undefined ? undefined : (place === "list" ? names.lists : names.points).get(key);
    }
    if (value !== undefined) values.push([field.name, value]);
  }
  return Object.fromEntries(values);
}

/** A record of one layer in a room, before the form reads its values. */
interface RoomRecord {
  readonly collection: FormCollection;
  readonly id: string;
  /** The place of a point. A record that an object owns has none. */
  readonly anchor?: Anchor | undefined;
  /** The `id` of the object that owns the record. A point has none. */
  readonly owner?: string | undefined;
  readonly fields: DraftOwned;
}

/** The records of one layer in a room, before the form reads their values. */
interface RoomParts {
  /** The points on a wall with a length, then the records of the objects that the survey record has. */
  readonly records: readonly RoomRecord[];
  /** The `id` of each point of the room, by the key of its feature. */
  readonly points: ReadonlyMap<string, string>;
}

/**
 * This function gives the records of one layer in a room, with the `id` of each one.
 *
 * - A point has the `id` of its feature, for example `outlet-2`. Its anchor is on the inner face of its wall.
 * - A record of an object has the word of its collection and the `id` of the object, for example `feed-desk-1`.
 */
function roomParts(form: LayerForm, draft: Draft, forms: readonly LayerForm[]): RoomParts {
  const collectionAt = (owned: DraftOwned, place: Place): FormCollection | undefined => {
    if (owned.layer !== form.schema) return undefined;
    const collection = form.collections.find((item) => item.name === owned.collection);
    return collection !== undefined && placeOf(collection) === place ? collection : undefined;
  };
  // A walk to the right has the room on its right, so the inner face of each wall is the right face.
  const face: WallFace = walksRight(draft.sides) ? "right" : "left";
  const points = new Map<string, string>();
  const taken = new Set<string>();
  const records: RoomRecord[] = [];
  for (const item of placedFeatures(draft, forms)) {
    const point = item.feature.point;
    if (item.feature.kind !== "point" || point === undefined) continue;
    points.set(item.feature.key, item.id);
    const collection = collectionAt(point, "point");
    if (collection === undefined || item.reading.state !== "ok" || !(item.wall > 0)) continue;
    const { start, height } = item.reading.numbers;
    taken.add(item.id);
    records.push({ collection, id: item.id, anchor: { on: "wall", wall: wallId(item.side), face, offset: start, height }, fields: point });
  }
  // Only an object that the survey record has owns records.
  for (const item of listedObjects(draft).filter((object) => object.ready)) {
    for (const owned of item.object.owns) {
      const collection = collectionAt(owned, "owned");
      if (collection !== undefined) records.push({ collection, id: freeId(`${wordOf(collection)}-${item.id}`, taken), owner: item.id, fields: owned });
    }
  }
  return { records, points };
}

/** The records of the lists of one layer of a store, as records of the form of the layer. */
export interface LayerLists {
  /** The system of units of the store, for the usual value of each number. */
  readonly system: FormSystem;
  /** The records of each list of the layer, by the name of its collection. The form did not read them yet. */
  readonly records: FormRecords;
  /** The `id` of each record, by its key in the store. */
  readonly ids: ReadonlyMap<string, string>;
}

/** The records of the lists of a store, by the name of each layer. */
export type StoreLists = ReadonlyMap<string, LayerLists>;

/**
 * This function gives the records of the lists of a store, as records of the forms of the add-ons.
 * The system of units is the system of the first room, so each room of a level has the same usual numbers.
 *
 * The `id` of a record has the words of the field `idFrom` of its collection, or the word of the collection and a number.
 * The ids of one layer are unique. Thus a record with the `id` of a point or of a record of an object gets the word of its collection before its `id`.
 */
export function storeLists(store: Store, addOns: readonly PageAddOn[] = ADD_ONS): StoreLists {
  const forms = addOns.map((addOn) => addOn.form);
  const system = systemOf(store.rooms[0]?.mode ?? "m");
  const lists = new Map<string, LayerLists>();
  for (const form of forms) {
    if (lists.has(form.schema)) continue;
    const taken = new Set(store.rooms.flatMap((room) => roomParts(form, room, forms).records.map((record) => record.id)));
    const ids = new Map<string, string>();
    const found: (readonly [FormCollection, readonly DraftRecord[]])[] = [];
    for (const collection of form.collections) {
      if (placeOf(collection) !== "list") continue;
      const records = listRecords(store, form.schema, collection.name);
      const word = wordOf(collection);
      const names = idsOf(
        records.map((record) => (collection.idFrom === undefined ? "" : (textOf(record.values, collection.idFrom) ?? ""))),
        word,
      );
      records.forEach((record, index) => {
        const base = names[index] ?? `${word}-${String(index + 1)}`;
        ids.set(record.key, freeId(taken.has(base) ? `${word}-${base}` : base, taken));
      });
      found.push([collection, records]);
    }
    const names: Names = { lists: ids, points: new Map() };
    const records = found.map(([collection, list]): [string, readonly FormRecord[]] => [
      collection.name,
      list.map((record): FormRecord => ({ id: ids.get(record.key) ?? "", values: valuesOf(form, collection, record, names) })),
    ]);
    lists.set(form.schema, { system, records: Object.fromEntries(records), ids });
  }
  return lists;
}

/**
 * This function gives the records of one layer for a room, as the form of the layer reads them.
 * The lists of the store come first, then the records of the room.
 * With no `lists`, the result has no record of a list, and the system of units is the system of the room.
 *
 * `formLayer` makes the records. Thus a record that the form does not accept is not in the result, and each number with a usual value has a value.
 */
export function roomRecords(form: LayerForm, draft: Draft, lists?: LayerLists, forms: readonly LayerForm[] = [form]): FormRecords {
  const parts = roomParts(form, draft, forms);
  const names: Names = { lists: lists?.ids ?? new Map(), points: parts.points };
  const records = new Map<string, FormRecord[]>();
  for (const { collection, id, anchor, owner, fields } of parts.records) {
    const record: FormRecord = { id, ...(anchor === undefined ? {} : { anchor }), values: valuesOf(form, collection, fields, { ...names, owner }) };
    const list = records.get(collection.name);
    if (list === undefined) records.set(collection.name, [record]);
    else list.push(record);
  }
  const all: FormRecords = { ...lists?.records, ...Object.fromEntries(records) };
  return formRecords(form, formLayer(form, all, { system: lists?.system ?? systemOf(draft.mode) })).records;
}

/**
 * This function makes the survey record of a draft, with the records of the add-ons. It is total, as `surveyOf` is.
 * The bridge of each add-on adds the records of its form to the record. An add-on with no bridge adds nothing yet.
 *
 * `lists` has the records of the lists of the store. With no `lists`, a record of the room names no record of a list.
 * With `listed`, the survey also lists the records of the lists. The survey of a room of a level lists none, because the level lists them.
 */
export function roomSurvey(draft: Draft, lists?: StoreLists, listed = false, addOns: readonly PageAddOn[] = ADD_ONS): Survey {
  const forms = addOns.map((addOn) => addOn.form);
  let survey = surveyOf(draft, forms);
  for (const { form, bridge } of addOns) {
    if (bridge !== undefined) survey = bridge.survey(survey, roomRecords(form, draft, lists?.get(form.schema), forms), listed);
  }
  return survey;
}

/** This function adds the records of the lists of a store to a level record. The bridge of each add-on adds the records of its form. */
export function withLists(level: Level, lists: StoreLists, addOns: readonly PageAddOn[] = ADD_ONS): Level {
  let next = level;
  for (const { form, bridge } of addOns) {
    const found = lists.get(form.schema);
    if (bridge !== undefined && found !== undefined) next = bridge.level(next, formRecords(form, formLayer(form, found.records, { system: found.system })).records);
  }
  return next;
}

/** The records of the form of one layer, from survey records and from their level record. */
export interface LayerRecords {
  readonly form: LayerForm;
  /** The records of the lists of the level, by the name of each collection. */
  readonly lists: FormRecords;
  /** The records of each room, by the name of each collection, in the sequence of the surveys. */
  readonly rooms: readonly FormRecords[];
}

/** The records of the add-ons of survey records, for the rooms of a store. */
export interface LevelParts {
  /** The lists of the store. The key of each record is unique in the lists, and `withNewRooms` gives the records new keys. */
  readonly lists: readonly DraftList[];
  /** The records of the add-ons of each survey, in the sequence of the surveys. `draftKeys` puts them in the draft of the survey. */
  readonly rooms: readonly SurveyParts[];
  /** This value is true when the records have data that the page does not keep. */
  readonly more: boolean;
}

/**
 * This function gives the value of one field as the form reads it. A text loses the spaces at its ends.
 * A value that the field does not accept gives `undefined`, and an empty text gives `undefined` too.
 */
function readValue(collection: FormCollection, field: FormField, value: FormValue, system: FormSystem): FormValue | undefined {
  const { name, word, label, title } = collection;
  const reading = readFormRecord({ name, word, label, title, fields: [field] }, { id: name, values: Object.fromEntries([[field.name, value]]) }, system);
  return reading.state === "ok" && Object.hasOwn(reading.values, field.name) ? reading.values[field.name] : undefined;
}

/**
 * This function gives the records of a store from the records of the forms of the layers. `surveys` has the survey of each room.
 * It reads each name by its collection. Thus a list and the points of a room can have one `id`, as the fields of a survey record can.
 *
 * The page does not keep these data, and `more` tells them:
 *
 * - a collection or a field that the form does not have, and a collection with no place in the page
 * - a value that its field does not accept, and the characters of a text after the largest number
 * - a second record of a list with the `id` of an earlier record and different data
 * - a record of a list after the largest number of records
 * - a point that is not on a wall of its survey
 * - a record of an object that the draft of the survey does not keep
 * - a field that names a record that is not there
 * - a record of an object with no field, and a record after the largest number of records of its owner
 */
export function levelParts(layers: readonly LayerRecords[], surveys: readonly Survey[], system: FormSystem): LevelParts {
  let more = false;
  let count = 0;
  const lists: DraftList[] = [];
  const rooms = surveys.map(() => ({ points: [] as SurveyPoint[], owned: new Map<string, readonly DraftOwned[]>() }));
  for (const { form, lists: given, rooms: givenRooms } of layers) {
    /** The key of each record of a list, by the name of its collection and then by its `id`. */
    const keys = new Map<string, ReadonlyMap<string, string>>();
    /**
     * This function gives the fields of a record as a store keeps them. `positions` has the position of each point of the room.
     * The field of the owner is not a field of a store: the record is in its object.
     */
    const fieldsOf = (collection: FormCollection, record: FormRecord, positions?: ReadonlyMap<string, ReadonlyMap<string, number>>): Pick<DraftOwned, "values" | "records" | "points"> => {
      const values: [string, string][] = [];
      const records: [string, string][] = [];
      const points: [string, string][] = [];
      if (Object.keys(record.values).some((name) => !collection.fields.some((field) => field.name === name))) more = true;
      for (const field of collection.fields) {
        const given = Object.hasOwn(record.values, field.name) ? record.values[field.name] : undefined;
        if (given === undefined || field.name === collection.owner) continue;
        const value = readValue(collection, field, given, system);
        if (value === undefined) {
          // The spaces of a text are not data. Each other value that the field does not accept is data that the page does not keep.
          if (!(field.kind === "text" && typeof given === "string")) more = true;
        } else if (field.kind === "text" || field.kind === "number") {
          const text = String(value);
          // A person can type each number that a store keeps. A number with an exponent has no such text.
          if (field.kind === "number" && numberFrom(text) !== value) more = true;
          else {
            // A record of a store keeps only the first characters of a long text.
            if (text.length > MOST_TEXT) more = true;
            values.push([field.name, text]);
          }
        } else if (field.kind === "record") {
          const key = keys.get(field.of)?.get(String(value));
          const position = positions?.get(field.of)?.get(String(value));
          if (key !== undefined) records.push([field.name, key]);
          else if (position !== undefined) points.push([field.name, String(position)]);
          else more = true;
        } else more = true;
      }
      return ownedOf(form.schema, collection.name, { values: Object.fromEntries(values), records: Object.fromEntries(records), points: Object.fromEntries(points) });
    };
    // The lists come first, because a record of a room can name a record of a list.
    const coming: (readonly [FormCollection, FormRecord, string])[] = [];
    for (const collection of form.collections) {
      if (placeOf(collection) !== "list") continue;
      const first = new Map<string, string>();
      const ids = new Map<string, string>();
      for (const record of recordsIn(given, collection.name)) {
        const text = JSON.stringify(record);
        const earlier = first.get(record.id);
        if (earlier !== undefined || ids.size >= MOST_RECORDS) {
          // Two equal records of one `id` are one record.
          if (earlier !== text) more = true;
          continue;
        }
        first.set(record.id, text);
        count += 1;
        const key = `r${String(count)}`;
        ids.set(record.id, key);
        coming.push([collection, record, key]);
      }
      keys.set(collection.name, ids);
    }
    if (Object.keys(given).some((name) => placeIn(form, name) !== "list" && recordsIn(given, name).length > 0)) more = true;
    for (const collection of form.collections) {
      const records = coming.flatMap(([from, record, key]): DraftRecord[] => (from === collection ? [recordOf(key, fieldsOf(collection, record))] : []));
      if (records.length > 0) lists.push({ layer: form.schema, collection: collection.name, records });
    }
    surveys.forEach((survey, index) => {
      const room = rooms[index];
      if (room === undefined) return;
      const records = givenRooms[index] ?? {};
      const walls = new Set(survey.sides.map((side) => side.id));
      const kept = keptIds(survey);
      if (Object.keys(records).some((name) => placeIn(form, name) !== "point" && placeIn(form, name) !== "owned" && recordsIn(records, name).length > 0)) more = true;
      // The points come before their fields, because a point can name a later point.
      const positions = new Map<string, ReadonlyMap<string, number>>();
      const found: (readonly [FormCollection, FormRecord, SurveyPoint])[] = [];
      for (const collection of form.collections) {
        if (placeOf(collection) !== "point") continue;
        const at = new Map<string, number>();
        for (const record of recordsIn(records, collection.name)) {
          const anchor = record.anchor;
          if (anchor?.on !== "wall" || !walls.has(anchor.wall)) {
            more = true;
            continue;
          }
          // Two points with one `id` stay, and a name gives the first one.
          if (!at.has(record.id)) at.set(record.id, room.points.length + found.length);
          found.push([collection, record, { wall: anchor.wall, offset: anchor.offset, height: anchor.height, point: ownedOf(form.schema, collection.name) }]);
        }
        positions.set(collection.name, at);
      }
      for (const [collection, record, point] of found) room.points.push({ ...point, point: ownedOf(form.schema, collection.name, fieldsOf(collection, record, positions)) });
      for (const collection of form.collections) {
        const ownerField = collection.owner;
        if (placeOf(collection) !== "owned" || ownerField === undefined) continue;
        const counts = new Map<string, number>();
        for (const record of recordsIn(records, collection.name)) {
          const owner = Object.hasOwn(record.values, ownerField) ? record.values[ownerField] : undefined;
          if (typeof owner !== "string" || !kept.has(owner)) {
            more = true;
            continue;
          }
          const number = (counts.get(owner) ?? 0) + 1;
          counts.set(owner, number);
          const owned = fieldsOf(collection, record, positions);
          const list = room.owned.get(owner) ?? [];
          // A record with no field is not a record of a draft.
          const empty = Object.keys(owned.values).length + Object.keys(owned.records).length + Object.keys(owned.points).length === 0;
          if (empty || (collection.most !== undefined && number > collection.most) || list.length >= MOST_OWNED) more = true;
          else room.owned.set(owner, [...list, ownedOf(form.schema, collection.name, owned)]);
        }
      }
    });
  }
  return { lists, rooms, more };
}

/**
 * This function gives the records of the add-ons of survey records, for the rooms of a store. `level` is the level record of the surveys.
 * The bridge of each add-on reads the records of its form from the fields of the surveys and of the level. An add-on with no bridge has no record yet.
 */
export function surveyParts(surveys: readonly Survey[], level: Level | undefined, system: FormSystem, addOns: readonly PageAddOn[] = ADD_ONS): LevelParts {
  let more = false;
  const layers = addOns.flatMap(({ form, bridge }): LayerRecords[] => {
    if (bridge === undefined) return [];
    const read = bridge.read(surveys, level, system);
    if (read.more) more = true;
    return [{ form, lists: read.lists, rooms: read.rooms }];
  });
  const parts = levelParts(layers, surveys, system);
  return more ? { ...parts, more } : parts;
}

/** The room of a store from one survey record. */
export interface SurveyRead {
  readonly draft: Draft;
  /** The key of the feature of the draft for the `id` of each opening of the survey. */
  readonly keys: ReadonlyMap<string, string>;
  /** The lists that the records of the draft name. `withNewRooms` gives their records new keys. */
  readonly lists: readonly DraftList[];
  /** This value is true when the survey has data that the page does not keep. */
  readonly more: boolean;
}

/** This function makes the room of a store from a survey record, with the records of the add-ons. The units of the survey give the usual numbers. */
export function readSurvey(survey: Survey, addOns: readonly PageAddOn[] = ADD_ONS): SurveyRead {
  const parts = surveyParts([survey], undefined, systemOf(modeOf(survey.unit)), addOns);
  const { draft, keys } = draftKeys(survey, parts.rooms[0]);
  return { draft, keys, lists: parts.lists, more: parts.more || hasMore(survey) };
}
