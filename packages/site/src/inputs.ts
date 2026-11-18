import { readFormRecord, type FormCollection, type FormField, type FormSystem, type FormValue, type LayerForm } from "@mark1russell7/room-view";
import { countOf, listOf } from "@mark1russell7/text/english";
import { collectionOf } from "./add-ons.ts";
import type { ListTexts, PageAddOn } from "./page-add-on.ts";
import { featureLabel, listRecords, nameWords, placedFeatures, recordUse, textOf, type Draft, type DraftRecord, type OwnedChange, type Store } from "./draft.ts";
import { numberFrom, placeOf, type LayerLists, type TypedFields } from "./layers.ts";

// The inputs of the records of the add-ons in the page "Measure a room", and the texts of the page that name a collection.
//
// A form tells the fields of each collection. This file gives the inputs of a record from its form.
// It knows no topic: each name comes from a form, or from the texts of an add-on of the page.
// Each function of this file is pure, so the tests need no browser.

/** This function gives a text with a small first letter, for example `outlets` for `Outlets`. A text that starts with two capital letters does not change. */
export function lowerFirst(text: string): string {
  const [first = "", second = ""] = text;
  return second !== second.toLowerCase() ? text : `${first.toLowerCase()}${text.slice(first.length)}`;
}

/** This function gives the words for one record of a collection in a sentence, for example `water tap`. No collection, or a collection with no word, gives `record`. */
export function wordsOf(collection: FormCollection | undefined): string {
  const words = nameWords(collection?.word ?? "");
  return words.length === 0 ? "record" : words.join(" ");
}

/** The group of the fields of a record of a store that keeps the text of an input. */
export type InputGroup = "values" | "records" | "points";

/** The groups of the fields of a record of a store. */
export const INPUT_GROUPS: readonly InputGroup[] = ["values", "records", "points"];

/** This function gives the change of a record of a store for a new text of one input. */
export function changeOf(group: InputGroup, name: string, text: string): OwnedChange {
  const texts = Object.fromEntries([[name, text]]);
  return group === "values" ? { values: texts } : group === "records" ? { records: texts } : { points: texts };
}

/** The parts that each input of a record has. */
interface InputPart {
  /** The name of the field in its collection. */
  readonly name: string;
  readonly label: string;
  /** This value is true when a record with no value in the field is not a record of the form. */
  readonly needed: boolean;
}

/** An input for a text. With `empty`, the field needs a value and has none. */
export interface TextInput extends InputPart {
  readonly kind: "text";
  readonly group: "values";
  readonly text: string;
  readonly state: "ok" | "empty";
}

/** An input for a number. With `bad`, the text is not a number that the form accepts. */
export interface NumberInput extends InputPart {
  readonly kind: "number";
  readonly group: "values";
  readonly text: string;
  readonly unit: string | undefined;
  /** The usual value of the system of units, as text. The page shows it in an empty input. */
  readonly usual: string | undefined;
  /** The sentence for a text that the form does not accept. */
  readonly fault: string;
  readonly state: "ok" | "empty" | "bad";
}

/** A record that an input can name. */
export interface Choice {
  /** The key of the record in the store: the key of a record of a list, or the key of the feature of a point. */
  readonly key: string;
  readonly text: string;
}

/** An input that names a record: a record of a list of the store, or a point of the room. */
export interface ChoiceInput extends InputPart {
  readonly kind: "choice";
  readonly group: "records" | "points";
  /** The key of the selected record. The empty key is no record. */
  readonly key: string;
  /** The text of the choice of no record. */
  readonly none: string;
  readonly choices: readonly Choice[];
  /** The sentence of the form for a field with no record to name. The page shows it in place of the input. */
  readonly aid: string | undefined;
  readonly state: "ok" | "empty";
}

/** An input of a record of an add-on in the page. */
export type RecordInput = TextInput | NumberInput | ChoiceInput;

/** The records that the inputs of one layer can name, by the name of their collection. */
export type Choices = ReadonlyMap<string, readonly Choice[]>;

/** The text of the choice of no record, for a field with no such text in its form. */
const NO_RECORD = "None";

/**
 * This function gives the name of a record of a list in the page.
 * The name is the text of the field `idFrom` of its collection. A record with no such text has the label of the collection and its position, for example `Circuit 2`.
 */
export function recordName(collection: FormCollection, record: DraftRecord, index: number): string {
  const name = collection.idFrom === undefined ? "" : (textOf(record.values, collection.idFrom) ?? "").trim();
  return name === "" ? `${collection.label} ${String(index + 1)}` : name;
}

/**
 * This function gives the records that the inputs of a layer can name.
 * They are the records of each list of the store, and the points of a room.
 * With no room, the result has no point.
 */
export function layerChoices(form: LayerForm, store: Store, draft: Draft | undefined, forms: readonly LayerForm[]): Choices {
  const placed = draft === undefined ? [] : placedFeatures(draft, forms);
  const choices = new Map<string, readonly Choice[]>();
  for (const collection of form.collections) {
    const place = placeOf(collection);
    if (place === "list") {
      choices.set(
        collection.name,
        listRecords(store, form.schema, collection.name).map((record, index): Choice => ({ key: record.key, text: recordName(collection, record, index) })),
      );
    } else if (place === "point") {
      choices.set(
        collection.name,
        placed
          .filter(({ feature }) => feature.point?.layer === form.schema && feature.point.collection === collection.name)
          .map((item): Choice => ({ key: item.feature.key, text: `${featureLabel(item.feature, forms)} ${String(item.number)}, wall ${String(item.side + 1)}` })),
      );
    }
  }
  return choices;
}

/** This function reads one field of a record with the rules of its form, and it gives the state of the field. */
function stateOf(collection: FormCollection, field: FormField, value: FormValue | undefined, system: FormSystem): "ok" | "empty" | "bad" {
  const { name, word, label, title } = collection;
  return readFormRecord({ name, word, label, title, fields: [field] }, { id: name, values: Object.fromEntries(value === undefined ? [] : [[field.name, value]]) }, system).state;
}

/**
 * This function gives the inputs of a record of a collection, in the sequence of the fields of the form.
 *
 * - A text and a number have an input each. A number has its unit, and the usual value of the system of units.
 * - A field that names a record of a list is a choice of the records of that list.
 * - A field that names a point is a choice of the points of the room. A record of a list names no point, so it has no such input.
 * - A field of the kind `object` has no input: the page knows the object that owns a record.
 * - A field that names a record of an object has no input.
 */
export function recordInputs(form: LayerForm, collection: FormCollection, fields: TypedFields, system: FormSystem, choices: Choices): readonly RecordInput[] {
  const place = placeOf(collection);
  return collection.fields.flatMap((field): RecordInput[] => {
    if (field.kind === "object") return [];
    const part: InputPart = { name: field.name, label: field.label, needed: field.needed === true };
    if (field.kind === "text") {
      const text = textOf(fields.values, field.name) ?? "";
      return [{ ...part, kind: "text", group: "values", text, state: stateOf(collection, field, text, system) === "empty" ? "empty" : "ok" }];
    }
    if (field.kind === "number") {
      const text = textOf(fields.values, field.name) ?? "";
      const usual = field.usual?.[system];
      const fault = field.fault ?? `Type a number for "${field.label}".`;
      return [{ ...part, kind: "number", group: "values", text, unit: field.unit, usual: usual === undefined ? undefined : String(usual), fault, state: stateOf(collection, field, numberFrom(text), system) }];
    }
    const target = form.collections.find((item) => item.name === field.of);
    const to = target === undefined ? undefined : placeOf(target);
    if (to === undefined || to === "owned" || (to === "point" && place === "list")) return [];
    const group = to === "list" ? "records" : "points";
    const list = choices.get(field.of) ?? [];
    const typed = textOf((group === "records" ? fields.records : fields.points) ?? {}, field.name);
    // A name with no record is no record.
    const key = list.find((choice) => choice.key === typed)?.key ?? "";
    const state = stateOf(collection, field, key === "" ? undefined : key, system) === "empty" ? "empty" : "ok";
    return [{ ...part, kind: "choice", group, key, none: field.none ?? NO_RECORD, choices: list, aid: list.length === 0 ? field.aid : undefined, state }];
  });
}

/** The note of a record in the page. */
export interface RecordNote {
  /** With `error`, a field has a text that the form does not accept. With `lack`, a field needs a value. A `note` tells about a good record. */
  readonly level: "error" | "lack" | "note";
  /** The name of the field of an `error` or of a `lack`. */
  readonly field: string | undefined;
  readonly text: string;
}

/**
 * This function gives the problem of a record from its inputs.
 * The first number that the form does not accept comes before the first field that needs a value.
 * A record with no problem gives `undefined`. A file of measurements has only the records with no problem.
 */
export function recordProblem(collection: FormCollection, inputs: readonly RecordInput[]): RecordNote | undefined {
  for (const input of inputs) {
    if (input.kind === "number" && input.state === "bad") return { level: "error", field: input.name, text: input.fault };
  }
  const empty = inputs.find((input) => input.state === "empty");
  if (empty === undefined) return undefined;
  return { level: "lack", field: empty.name, text: `This ${wordsOf(collection)} is not in a file yet, because "${empty.label}" has no value.` };
}

/**
 * This function tells the records of the rooms that name a record of a list.
 * For example, 3 outlets in 2 rooms use a circuit.
 * When no collection of the form can name the record, the function gives an empty text.
 *
 * The plural of a word is the word with an `s`, as `countOf` makes it.
 */
export function useNote(store: Store, key: string, form: LayerForm, collection: FormCollection, forms: readonly LayerForm[]): string {
  const word = wordsOf(collection);
  const use = recordUse(store, key);
  if (use.users.length > 0) {
    const counts = new Map<string, number>();
    for (const user of use.users) {
      const name = wordsOf(collectionOf(user.layer, user.collection, forms));
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    const parts = [...counts].map(([name, count]) => countOf(count, name));
    return `${listOf(parts)} in ${countOf(use.rooms, "room")} ${use.users.length === 1 ? "uses" : "use"} this ${word}.`;
  }
  const users = form.collections.filter((item) => {
    const place = placeOf(item);
    return (place === "point" || place === "owned") && item.fields.some((field) => field.kind === "record" && field.of === collection.name);
  });
  return users.length === 0 ? "" : `No ${listOf(users.map(wordsOf), { conjunction: "or" })} uses this ${word} yet.`;
}

/** A record of a list in the page, with its inputs and its note. */
export interface ListItem {
  /** The key of the record in the store. */
  readonly key: string;
  /** The label of the collection and the position of the record, for example `Circuit 2`. */
  readonly title: string;
  readonly inputs: readonly RecordInput[];
  readonly note: RecordNote;
}

/**
 * This function gives the records of a list of a store for the page, in their sequence.
 *
 * The note of a record tells its problem. A record with no problem has the sentence of its add-on, then the records of the rooms that name it.
 * `lists` has the records of the lists of the layer, as `storeLists` gives them. The add-on gets the values that a file has.
 */
export function listItems(addOn: PageAddOn, collection: FormCollection, store: Store, lists: LayerLists, forms: readonly LayerForm[]): readonly ListItem[] {
  const form = addOn.form;
  const choices = layerChoices(form, store, undefined, forms);
  const typed = Object.hasOwn(lists.records, collection.name) ? (lists.records[collection.name] ?? []) : [];
  return listRecords(store, form.schema, collection.name).map((record, index): ListItem => {
    const inputs = recordInputs(form, collection, record, lists.system, choices);
    const title = `${collection.label} ${String(index + 1)}`;
    const problem = recordProblem(collection, inputs);
    if (problem !== undefined) return { key: record.key, title, inputs, note: problem };
    const id = lists.ids.get(record.key);
    const found = typed.find((item) => item.id === id);
    const reading = found === undefined ? undefined : readFormRecord(collection, found, lists.system);
    const about = reading?.state === "ok" ? (addOn.note?.(collection.name, reading.values) ?? "") : "";
    const text = [about, useNote(store, record.key, form, collection, forms)].filter((part) => part !== "").join(" ");
    return { key: record.key, title, inputs, note: { level: "note", field: undefined, text } };
  });
}

/** A list of the page: a collection of an add-on with records for each room of the store. */
export interface ListSection {
  readonly addOn: PageAddOn;
  readonly collection: FormCollection;
  readonly texts: ListTexts;
}

/** This function gives the lists of the page, in the sequence of the add-ons and of the collections of their forms. */
export function listSections(addOns: readonly PageAddOn[]): readonly ListSection[] {
  return addOns.flatMap((addOn) =>
    addOn.form.collections
      .filter((collection) => placeOf(collection) === "list")
      .map((collection): ListSection => ({ addOn, collection, texts: addOn.lists !== undefined && Object.hasOwn(addOn.lists, collection.name) ? (addOn.lists[collection.name] ?? {}) : {} })),
  );
}

/** A collection of an add-on with records that an object owns. */
export interface OwnedSection {
  readonly addOn: PageAddOn;
  readonly collection: FormCollection;
}

/** This function gives the collections with records that an object owns, in the sequence of the add-ons and of the collections of their forms. */
export function ownedSections(addOns: readonly PageAddOn[]): readonly OwnedSection[] {
  return addOns.flatMap((addOn) => addOn.form.collections.filter((collection) => placeOf(collection) === "owned").map((collection): OwnedSection => ({ addOn, collection })));
}

/** This function gives the text of the button that adds a record to a list. With no text of the add-on, it is `New` and the word of the collection. */
export function addText(section: ListSection): string {
  return section.texts.add ?? `New ${wordsOf(section.collection)}`;
}

/**
 * This function gives the number of the records of each list, with the title of the list. A list with no record has no number.
 * With a room, a number has only the records that the records of the room name.
 */
export function listCounts(store: Store, sections: readonly ListSection[], draft?: Draft): readonly (readonly [title: string, count: number])[] {
  // The keys of the records of the lists are unique in a store, so one room in a store of its own gives the names of the room.
  const named = draft === undefined ? undefined : new Set(store.lists.flatMap((list) => list.records).filter((record) => recordUse({ ...store, rooms: [draft] }, record.key).rooms > 0).map((record) => record.key));
  return sections.flatMap(({ addOn, collection }): [string, number][] => {
    const records = listRecords(store, addOn.form.schema, collection.name);
    const count = named === undefined ? records.length : records.filter((record) => named.has(record.key)).length;
    return count > 0 ? [[collection.title, count]] : [];
  });
}

/** This function gives the titles of the collections with points on a wall, with a small first letter, for example `outlets`. */
function pointTitles(forms: readonly LayerForm[]): readonly string[] {
  return forms.flatMap((form) => form.collections.filter((collection) => placeOf(collection) === "point").map((collection) => lowerFirst(collection.title)));
}

/** This function gives the parts of a wall in the first paragraph of the page, for example `the doors, the windows, the outlets and the furniture`. */
export function wallPartsText(forms: readonly LayerForm[]): string {
  return listOf(["the doors", "the windows", ...pointTitles(forms).map((title) => `the ${title}`), "the furniture"]);
}

/** This function gives the text of the button that shows the kinds of feature of a wall, for example `Add doors, windows or outlets`. */
export function addFeatureText(forms: readonly LayerForm[]): string {
  return `Add ${listOf(["doors", "windows", ...pointTitles(forms)], { conjunction: "or" })}`;
}

/** This function gives the label of the list of the features of a wall, for example `Doors, windows and outlets of wall 2`. */
export function featuresLabel(forms: readonly LayerForm[], wall: string): string {
  return `${listOf(["Doors", "windows", ...pointTitles(forms)])} of wall ${wall}`;
}

/** This function gives the title of the box "More" of an object, for example `Name, power and more distances`. */
export function moreText(addOns: readonly PageAddOn[]): string {
  return listOf(["Name", ...ownedSections(addOns).map(({ collection }) => lowerFirst(collection.title)), "more distances"]);
}

/** This function tells the parts of a file that the page shows, when the file has more data than the page keeps. */
export function filePartsText(addOns: readonly PageAddOn[]): string {
  const forms = addOns.map((addOn) => addOn.form);
  const lists = listSections(addOns).map(({ collection }) => `the ${lowerFirst(collection.title)}`);
  const parts = ["the walls", "the doors", "the windows", ...pointTitles(forms).map((title) => `the ${title}`), ...lists, "the furniture"];
  return `The page shows ${listOf(parts)} of the file. It does not keep the other data of the file yet.`;
}

/** This function gives the steps of the help of the page for the points of the add-ons. Each collection with points on a wall has one step. */
export function pointSteps(forms: readonly LayerForm[]): readonly string[] {
  return forms.flatMap((form) =>
    form.collections
      .filter((collection) => placeOf(collection) === "point")
      .map((collection) => `For each ${wordsOf(collection)} of this wall, measure from a corner of the wall to its center. Then measure its height above the floor.`),
  );
}
