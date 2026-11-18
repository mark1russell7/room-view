import {
  checkRoom,
  checkScene,
  metersPer,
  SCENE_SCHEMA,
  SURVEY_SCHEMA,
  type Finding,
  type FormCollection,
  type FormUsual,
  type LayerForm,
  type LengthUnit,
  type Opening,
  type PlacedObject,
  type Room,
  type Survey,
  type SurveyObject,
  type SurveyResult,
  type SurveyTurn,
} from "@mark1russell7/room-view";
import { collectionOf, FORMS } from "./add-ons.ts";
import { ELECTRICAL } from "./electrical.ts";
import { storeFromV1 } from "./store-v1.ts";

// The draft of the page "Measure a room": the text of each field, as a person typed it.
// Each function of this file is pure, so the tests need no browser.
// The draft and the store know no topic. An add-on gives the form of its layer, and the store keeps the records of each layer by its name.

/** These are the ways to type a length: feet with inches, or one number in inches, meters or centimeters. */
export const LENGTH_MODES: readonly ["ft-in", "in", "m", "cm"] = ["ft-in", "in", "m", "cm"];

/** A way to type a length. */
export type LengthMode = (typeof LENGTH_MODES)[number];

/** The name of each way to type a length, for the list of the units. */
export const MODE_NAMES: Readonly<Record<LengthMode, string>> = { "ft-in": "Feet and inches", in: "Inches", m: "Meters", cm: "Centimeters" };

/** The decimal places of a number that the page writes in a field, for each way to type a length. */
const DIGITS: Readonly<Record<LengthMode, number>> = { "ft-in": 2, in: 2, m: 3, cm: 1 };

const INCHES_IN_FOOT = 12;

/** This function gives the unit of the survey record for a way to type a length. Feet with inches become inches. */
export function unitOf(mode: LengthMode): LengthUnit {
  return mode === "ft-in" ? "in" : mode;
}

/** A length as text. In the mode `ft-in`, `value` is the feet and `inches` is the inches. In each other mode, `inches` is empty. */
export interface TypedLength {
  readonly value: string;
  readonly inches: string;
}

/** The value of a field: no text, a text that is not a number, or a number. */
export type Reading = { readonly state: "empty" } | { readonly state: "bad" } | { readonly state: "ok"; readonly value: number };

const EMPTY: Reading = { state: "empty" };
const BAD: Reading = { state: "bad" };

/** A number with digits only, and with one point or one comma at most. */
const NUMBER = /^(?:\d+[.,]?\d*|[.,]\d+)$/;

/**
 * This function gives the number of a text. A text with no characters gives `undefined`.
 * A text that is not a value of 0 or more gives `NaN`.
 */
export function numberOf(text: string): number | undefined {
  const trimmed = text.trim();
  if (trimmed === "") return undefined;
  return NUMBER.test(trimmed) ? Number(trimmed.replace(",", ".")) : Number.NaN;
}

/** This function gives the value of a typed length in the unit of its mode. Feet with inches give inches. */
export function readLength(typed: TypedLength, mode: LengthMode): Reading {
  const main = numberOf(typed.value);
  const part = mode === "ft-in" ? numberOf(typed.inches) : undefined;
  if (main === undefined && part === undefined) return EMPTY;
  const value = mode === "ft-in" ? (main ?? 0) * INCHES_IN_FOOT + (part ?? 0) : (main ?? 0);
  return Number.isFinite(value) ? { state: "ok", value } : BAD;
}

function rounded(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/** This function gives a value in the unit of a mode as the text of its fields. It is the opposite of `readLength`. */
export function typedOf(value: number, mode: LengthMode): TypedLength {
  const exact = rounded(value, DIGITS[mode]);
  if (mode !== "ft-in") return { value: String(exact), inches: "" };
  const feet = Math.floor(exact / INCHES_IN_FOOT);
  return { value: String(feet), inches: String(rounded(exact - feet * INCHES_IN_FOOT, DIGITS[mode])) };
}

/** This function gives a typed length in a different mode: the length stays, and the numbers change. A text that is not a number stays. */
export function convertTyped(typed: TypedLength, from: LengthMode, to: LengthMode): TypedLength {
  const reading = readLength(typed, from);
  if (reading.state === "empty") return { value: "", inches: "" };
  if (reading.state === "bad") return { value: typed.value, inches: to === "ft-in" ? typed.inches : "" };
  return typedOf((reading.value * metersPer(unitOf(from))) / metersPer(unitOf(to)), to);
}

/** These are the corners that a person can choose: a square turn to the left or to the right, or a measured angle. */
export const CORNERS: readonly ["left", "right", "angle"] = ["left", "right", "angle"];

/** The kind of a corner. */
export type Corner = (typeof CORNERS)[number];

/**
 * These are the kinds of a feature of a wall: a door, a window, an opening with no door, or a point.
 * A point is a record of an add-on at one place of the wall, for example an outlet. The form of the add-on gives its name.
 */
export const FEATURE_KINDS: readonly ["door", "window", "gap", "point"] = ["door", "window", "gap", "point"];

/** A kind of feature. */
export type FeatureKind = (typeof FEATURE_KINDS)[number];

/** The name of each kind of feature. `featureLabel` gives the name of a point from the form of its add-on. */
export const FEATURE_NAMES: Readonly<Record<FeatureKind, string>> = { door: "Door", window: "Window", gap: "Opening", point: "Point" };

/** The word for each kind of feature in an `id` and in a message. `featureWord` gives the word of a point from the form of its add-on. */
const FEATURE_WORDS: Readonly<Record<FeatureKind, string>> = { door: "door", window: "window", gap: "opening", point: "point" };

/** These are the corners of a wall where a distance along the wall can start: its start and its end. */
export const FEATURE_ENDS: readonly ["start", "end"] = ["start", "end"];

/** A corner of a wall. */
export type FeatureEnd = (typeof FEATURE_ENDS)[number];

/** These are the lengths of a feature. */
export const FEATURE_FIELDS: readonly ["offset", "width", "height", "sill"] = ["offset", "width", "height", "sill"];

/** A length of a feature. */
export type FeatureField = (typeof FEATURE_FIELDS)[number];

/** Texts by the name of a field. The names are in the sequence of their characters, and no text is empty. */
export type DraftTexts = Readonly<Record<string, string>>;

/** The fields of a record of an add-on, as a person typed them. The form of the add-on tells the kind of each field. */
export interface DraftFields {
  /** The text of each text field and of each number field. A field with no text has no entry. */
  readonly values: DraftTexts;
  /** The key of a record of a list of the store, for each field that names such a record. For example, an outlet names its circuit. */
  readonly records: DraftTexts;
}

/** A record of a list of the store, for example a circuit. Each record of a store has its own key. */
export interface DraftRecord extends DraftFields {
  readonly key: string;
}

/**
 * A record of an add-on in a room: the record of a point of a wall, or a record that an object owns.
 * `layer` is the name of the layer of the add-on, and `collection` is the name of a collection of its form.
 * The record has no key, so a different record cannot name it. A record names a point by the key of the feature.
 */
export interface DraftOwned extends DraftFields {
  readonly layer: string;
  readonly collection: string;
  /** The key of a point of the same room, for each field that names such a point. For example, the power of an object names an outlet. */
  readonly points: DraftTexts;
}

/** A list of the store: the records of one collection of an add-on that are not in a room, for example the circuits. */
export interface DraftList {
  readonly layer: string;
  readonly collection: string;
  readonly records: readonly DraftRecord[];
}

/** This function tells if a text is a name of a layer, of a collection or of a field. */
const isName = (value: unknown): value is string => isText(value) && value !== "" && value !== "__proto__";

/**
 * This function gives texts by name in their one form: the names in the sequence of their characters, with no empty text.
 * The last text of a name stays. A text keeps only the characters that a text of a store can have, from its start.
 */
function textsOf(entries: Iterable<readonly [string, string]>): DraftTexts {
  const last = new Map<string, string>(entries);
  const kept = [...last].filter(([name, text]) => isName(name) && text !== "").map(([name, text]): [string, string] => [name, text.slice(0, LIMITS.text)]);
  return Object.fromEntries(kept.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

/** This function gives the text of a name, or `undefined` for a name with no text. */
export function textOf(texts: DraftTexts, name: string): string | undefined {
  return Object.hasOwn(texts, name) ? texts[name] : undefined;
}

/**
 * This function gives texts after a change. An empty text removes its name. Texts with no change stay the same texts.
 * A change that gives more names than a group of a record can have does not apply.
 */
function mergedTexts(texts: DraftTexts, change: DraftTexts | undefined): DraftTexts {
  if (change === undefined) return texts;
  const next = textsOf([...Object.entries(texts), ...Object.entries(change)]);
  if (Object.keys(next).length > LIMITS.fields) return texts;
  return JSON.stringify(next) === JSON.stringify(texts) ? texts : next;
}

/** The fields of a record of a room that a change can set. */
export type OwnedChange = Partial<Pick<DraftOwned, "values" | "records" | "points">>;

/** This function makes a record of an add-on in a room. Each of its groups of fields is in its one form. */
export function ownedOf(layer: string, collection: string, fields: OwnedChange = {}): DraftOwned {
  return {
    layer,
    collection,
    values: textsOf(Object.entries(fields.values ?? {})),
    records: textsOf(Object.entries(fields.records ?? {})),
    points: textsOf(Object.entries(fields.points ?? {})),
  };
}

/** This function makes a record of a list of the store. Each of its groups of fields is in its one form. */
export function recordOf(key: string, fields: Partial<DraftFields> = {}): DraftRecord {
  return { key, values: textsOf(Object.entries(fields.values ?? {})), records: textsOf(Object.entries(fields.records ?? {})) };
}

/** This function gives a record of a room after a change of its fields. A record with no change stays the same record. */
function changedOwned(owned: DraftOwned, change: OwnedChange): DraftOwned {
  const values = mergedTexts(owned.values, change.values);
  const records = mergedTexts(owned.records, change.records);
  const points = mergedTexts(owned.points, change.points);
  return values === owned.values && records === owned.records && points === owned.points ? owned : { layer: owned.layer, collection: owned.collection, values, records, points };
}

/** This function tells if a record of a room has one field or more. */
function hasFields(owned: DraftOwned): boolean {
  return Object.keys(owned.values).length + Object.keys(owned.records).length + Object.keys(owned.points).length > 0;
}

/**
 * A feature of a wall of the draft: a door, a window, an opening or a point.
 *
 * `offset` is the distance from a corner of the wall to the near edge of an opening, or to the center of a point.
 * `height` is the height of an opening, or the height of the center of a point above the floor.
 * `sill` is the height of the bottom of a window above the floor. A kind that does not have a length keeps an empty text.
 */
export interface DraftFeature {
  /** The key of the feature in the page. Each feature of a room has its own key. */
  readonly key: string;
  readonly kind: FeatureKind;
  /** The corner of the wall where `offset` starts. */
  readonly from: FeatureEnd;
  readonly offset: TypedLength;
  readonly width: TypedLength;
  readonly height: TypedLength;
  readonly sill: TypedLength;
  /** The record of a point: the layer and the collection of its add-on, and its fields. Each point has it, and each other kind has none. */
  readonly point?: DraftOwned | undefined;
}

/** This function gives the lengths that a kind of feature has, in the sequence of the form. */
export function fieldsOf(kind: FeatureKind): readonly FeatureField[] {
  if (kind === "point") return ["offset", "height"];
  return kind === "window" ? ["offset", "width", "sill", "height"] : ["offset", "width", "height"];
}

/**
 * This function gives the collection of the form of a point. The collection has records on a wall.
 * A feature that is not a point gives `undefined`. A point of a layer or of a collection that the forms do not have gives `undefined` too.
 */
export function pointForm(feature: DraftFeature, forms: readonly LayerForm[] = FORMS): FormCollection | undefined {
  if (feature.point === undefined) return undefined;
  const collection = collectionOf(feature.point.layer, feature.point.collection, forms);
  return collection?.on?.includes("wall") === true ? collection : undefined;
}

/**
 * This function gives the word for a feature in an `id` and in a message: `door`, `window` or `opening`.
 * A point has the word of its collection, for example `outlet`. A point of a collection that the forms do not have is a `point`.
 */
export function featureWord(feature: DraftFeature, forms: readonly LayerForm[] = FORMS): string {
  return feature.kind === "point" ? pointWord(pointForm(feature, forms)) : FEATURE_WORDS[feature.kind];
}

/** This function gives the word for the points of a collection. No collection, or a collection with no word, gives `point`. */
function pointWord(collection: FormCollection | undefined): string {
  const words = nameWords(collection?.word ?? "");
  return words.length === 0 ? FEATURE_WORDS.point : words.join(" ");
}

/** A kind of point that a person can add to a wall: the points of one collection of an add-on. */
export interface PointKind {
  /** The name of the layer of the add-on. */
  readonly layer: string;
  /** The collection of the form of the add-on. Its records are on a wall. */
  readonly collection: FormCollection;
  /** The name of the kind for the page and the drawing, as `featureTag` gives it for a point of the collection. */
  readonly tag: string;
}

/** This function gives the kinds of point of the forms, in the sequence of the forms. A collection with records on a wall gives one kind. */
export function pointKinds(forms: readonly LayerForm[] = FORMS): readonly PointKind[] {
  return forms.flatMap((form) =>
    form.collections.filter((collection) => collection.on?.includes("wall") === true).map((collection): PointKind => ({ layer: form.schema, collection, tag: pointWord(collection).split(" ").join("-") })),
  );
}

/** This function gives the name of a feature, for example `Door`. A point has the label of its collection, for example `Outlet`. */
export function featureLabel(feature: DraftFeature, forms: readonly LayerForm[] = FORMS): string {
  const label = feature.kind === "point" ? pointForm(feature, forms)?.label.trim() : undefined;
  return label === undefined || label === "" ? FEATURE_NAMES[feature.kind] : label;
}

/**
 * This function gives the name of the kind of a feature for the page and the drawing: `door`, `window` or `gap`.
 * A point has the word of its collection with a hyphen between the words, for example `outlet`.
 */
export function featureTag(feature: DraftFeature, forms: readonly LayerForm[] = FORMS): string {
  return feature.kind === "point" ? featureWord(feature, forms).split(" ").join("-") : feature.kind;
}

/** These are the kinds of furniture and equipment that the form offers. The kind `other` is an object of a different kind. */
export const OBJECT_KINDS: readonly ["desk", "table", "chair", "sofa", "bed", "shelf", "cabinet", "rack", "computer", "display", "appliance", "other"] = [
  "desk",
  "table",
  "chair",
  "sofa",
  "bed",
  "shelf",
  "cabinet",
  "rack",
  "computer",
  "display",
  "appliance",
  "other",
];

/** A kind of furniture or equipment of the form. */
export type ObjectKind = (typeof OBJECT_KINDS)[number];

/** The name of each kind of object, for a button of the form. */
export const OBJECT_NAMES: Readonly<Record<ObjectKind, string>> = {
  desk: "Desk",
  table: "Table",
  chair: "Chair",
  sofa: "Sofa",
  bed: "Bed",
  shelf: "Shelves",
  cabinet: "Cabinet",
  rack: "Rack",
  computer: "Computer",
  display: "Display",
  appliance: "Appliance",
  other: "Other",
};

/** The word for each kind of object in an `id` and in a message. */
const OBJECT_WORDS: Readonly<Record<ObjectKind, string>> = {
  desk: "desk",
  table: "table",
  chair: "chair",
  sofa: "sofa",
  bed: "bed",
  shelf: "shelves",
  cabinet: "cabinet",
  rack: "rack",
  computer: "computer",
  display: "display",
  appliance: "appliance",
  other: "object",
};

/**
 * This function gives the words for a kind of object in a message, for example `desk`.
 * A file can have a kind that the form does not offer. Such a kind gives its own letters and digits, or `object` when it has none.
 */
export function objectWords(kind: string): string {
  if (isOneOf(OBJECT_KINDS, kind)) return OBJECT_WORDS[kind];
  const words = nameWords(kind);
  return words.length === 0 ? OBJECT_WORDS.other : words.join(" ");
}

/** These are the lengths of an object. */
export const OBJECT_FIELDS: readonly ["offset", "width", "depth", "height", "gap", "lift"] = ["offset", "width", "depth", "height", "gap", "lift"];

/** A length of an object. */
export type ObjectField = (typeof OBJECT_FIELDS)[number];

/**
 * An object of the draft: a piece of furniture or equipment against a wall, or on a different object.
 *
 * `offset` is the distance along the wall from a corner to the near edge of the object.
 * For an object on a different object, it is the distance from an edge of that object.
 * `width` is the size along the wall, and `depth` is the size from the wall into the room.
 * `gap` is the space between the wall and the back of the object. For an object on a holder, it is the space between the two backs.
 * `lift` is the height of the bottom of the object above the floor, or above the bottom of the holder.
 */
export interface DraftObject {
  /** The key of the object in the page. Each object of a room has its own key. */
  readonly key: string;
  /** The kind of the object: a kind of `OBJECT_KINDS`, or a different text from a file. */
  readonly kind: string;
  /** The name that a person gives to the object, for example `Standing desk`. */
  readonly name: string;
  /** The corner of the wall, or the edge of the holder, where `offset` starts. */
  readonly from: FeatureEnd;
  readonly offset: TypedLength;
  readonly width: TypedLength;
  readonly depth: TypedLength;
  readonly height: TypedLength;
  readonly gap: TypedLength;
  readonly lift: TypedLength;
  /** The records of the add-ons that the object owns, for example its power. A record that loses its last field goes away. */
  readonly owns: readonly DraftOwned[];
  /** The objects on this object, or in it. */
  readonly holds: readonly DraftObject[];
}

/** One wall of the draft, and the corner at its end. */
export interface DraftSide {
  /** The key of the wall in the page. It stays when a person removes a different wall. */
  readonly key: string;
  readonly length: TypedLength;
  readonly corner: Corner;
  /** The angle of a measured corner in degrees, as text. The angle is inside the room, between the two walls. */
  readonly angle: string;
  /** The doors, the windows, the openings and the points of the wall. */
  readonly features: readonly DraftFeature[];
  /** The furniture and the equipment that a person measures from this wall. */
  readonly objects: readonly DraftObject[];
}

/** The draft of one room. */
export interface Draft {
  readonly name: string;
  readonly mode: LengthMode;
  readonly height: TypedLength;
  readonly thickness: TypedLength;
  readonly sides: readonly DraftSide[];
}

const SQUARE = 90;
const STRAIGHT = 180;
const FULL = 360;

/** This function gives the angle of a measured corner: a number above 0 and below 360, or `undefined`. */
export function angleOf(side: DraftSide): number | undefined {
  const angle = numberOf(side.angle);
  return angle !== undefined && angle > 0 && angle < FULL ? angle : undefined;
}

/**
 * This function tells if the walk of a draft goes to the right: the person keeps the walls on the left.
 * A walk to the left makes a turn of 360 degrees, and a walk to the right makes a turn of -360 degrees.
 * The function gives the direction whose sum of turns is nearer to its full turn. A tie gives a walk to the left.
 */
export function walksRight(sides: readonly DraftSide[]): boolean {
  let squares = 0;
  let measured = 0;
  for (const side of sides) {
    if (side.corner === "left") squares += SQUARE;
    else if (side.corner === "right") squares -= SQUARE;
    else measured += STRAIGHT - (angleOf(side) ?? STRAIGHT);
  }
  return Math.abs(squares - measured + FULL) < Math.abs(squares + measured - FULL);
}

/**
 * This function gives the turn of the walk at the end of a wall.
 * A walk to the left turns left by 180 degrees minus the angle inside the room. A walk to the right turns right by the same angle.
 * A measured corner with no valid angle gives no turn.
 */
export function turnOf(side: DraftSide, toRight = false): SurveyTurn {
  if (side.corner !== "angle") return side.corner;
  const angle = angleOf(side);
  if (angle === undefined) return 0;
  return toRight ? angle - STRAIGHT : STRAIGHT - angle;
}

/** The height of a room and the thickness of a wall that the page uses when their fields have no valid number, in meters. */
const USUAL = { height: 2.4, thickness: 0.11 };

function lengthOr(typed: TypedLength, mode: LengthMode, usualMeters: number): number {
  const reading = readLength(typed, mode);
  return reading.state === "ok" && reading.value > 0 ? reading.value : usualMeters / metersPer(unitOf(mode));
}

/** This function gives the `id` of the wall at a position of the walk, from 0. */
export function wallId(index: number): string {
  return `wall-${String(index + 1)}`;
}

/** The two groups of the ways to type a length. Each group has its own round numbers. */
/** A system of units: feet and inches, or meters and centimeters. */
export type System = "imperial" | "metric";

/** This function gives the system of the units of a mode. */
export function systemOf(mode: LengthMode): System {
  return mode === "ft-in" || mode === "in" ? "imperial" : "metric";
}

/**
 * The usual lengths of a feature, in meters. `door` is the height of a door or an opening, and `window` is the height of a window.
 * `sill` is the height of the bottom of a window above the floor. The imperial numbers are 80 in, 48 in and 36 in.
 */
const USUAL_FEATURE: Readonly<Record<System, { readonly door: number; readonly window: number; readonly sill: number }>> = {
  imperial: { door: 2.032, window: 1.2192, sill: 0.9144 },
  metric: { door: 2.03, window: 1.2, sill: 0.9 },
};

/**
 * This function gives the usual value of a length of a feature in the unit of a mode. The page uses it when the field has no text.
 * The distance from the corner and the width have no usual value.
 * `point` is the usual height of a point above the floor, in meters for each system. The form of the point gives it, and `usualFor` reads it.
 */
export function usualOf(kind: FeatureKind, field: FeatureField, mode: LengthMode, point?: FormUsual): number | undefined {
  const system = systemOf(mode);
  const usual = USUAL_FEATURE[system];
  let meters: number | undefined;
  if (field === "sill" && kind === "window") meters = usual.sill;
  if (field === "height") meters = kind === "point" ? point?.[system] : kind === "window" ? usual.window : usual.door;
  return meters === undefined ? undefined : rounded(meters / metersPer(unitOf(mode)), 6);
}

/** This function gives the usual value of a length of a feature, as `usualOf` does. A point gets the usual height of its collection. */
export function usualFor(feature: DraftFeature, field: FeatureField, mode: LengthMode, forms: readonly LayerForm[] = FORMS): number | undefined {
  return usualOf(feature.kind, field, mode, pointForm(feature, forms)?.height);
}

/** The numbers of a feature, in the unit of the mode. */
export interface FeatureNumbers {
  /** The distance from the start of the wall to the near edge of an opening, or to the center of a point. */
  readonly start: number;
  /** The width of an opening. A point has 0. */
  readonly width: number;
  /** The height of an opening, or the height of the center of a point above the floor. */
  readonly height: number;
  /** The height of the bottom of a window above the floor. Each other kind has 0. */
  readonly sill: number;
}

/** The value of a feature: its numbers, or the first field that needs a value. */
export type FeatureReading =
  | { readonly state: "ok"; readonly numbers: FeatureNumbers }
  | { readonly state: "empty" | "bad" | "zero"; readonly field: FeatureField };

/**
 * This function gives the numbers of a feature on a wall with a length.
 * A height with no text gets its usual value. A distance from the end of the wall becomes a distance from its start.
 */
export function readFeature(feature: DraftFeature, wallLength: number, mode: LengthMode, forms: readonly LayerForm[] = FORMS): FeatureReading {
  const numbers = { offset: 0, width: 0, height: 0, sill: 0 };
  for (const field of fieldsOf(feature.kind)) {
    const reading = readLength(feature[field], mode);
    if (reading.state === "bad") return { state: "bad", field };
    const value = reading.state === "ok" ? reading.value : usualFor(feature, field, mode, forms);
    if (value === undefined) return { state: "empty", field };
    // An opening has a width and a height above 0. A point can be at the floor.
    if (value === 0 && (field === "width" || (field === "height" && feature.kind !== "point"))) return { state: "zero", field };
    numbers[field] = value;
  }
  const start = feature.from === "start" ? numbers.offset : rounded(wallLength - numbers.offset - numbers.width, 6);
  return { state: "ok", numbers: { start, width: numbers.width, height: numbers.height, sill: numbers.sill } };
}

/** A feature of a draft, with its wall and its name. */
export interface PlacedFeature {
  /** The position of the wall in the walk, from 0. */
  readonly side: number;
  readonly feature: DraftFeature;
  /** The number of the feature in the features with its word, in the sequence of the walk, from 1. The points of one collection have one word. */
  readonly number: number;
  /** The `id` of the record of the feature: its word and its number, for example `door-2`. */
  readonly id: string;
  /** The length of the wall in the unit of the mode. A wall with no valid length has 0. */
  readonly wall: number;
  readonly reading: FeatureReading;
}

/** This function gives each feature of a draft, in the sequence of the walk. */
export function placedFeatures(draft: Draft, forms: readonly LayerForm[] = FORMS): readonly PlacedFeature[] {
  const counts = new Map<string, number>();
  return draft.sides.flatMap((side, index) => {
    const length = readLength(side.length, draft.mode);
    const wall = length.state === "ok" ? length.value : 0;
    return side.features.map((feature): PlacedFeature => {
      const word = featureWord(feature, forms);
      const number = (counts.get(word) ?? 0) + 1;
      counts.set(word, number);
      return { side: index, feature, number, id: `${word.split(" ").join("-")}-${String(number)}`, wall, reading: readFeature(feature, wall, draft.mode, forms) };
    });
  });
}

/**
 * The usual size of each kind of object in meters: its width along the wall, its depth from the wall and its height.
 * The imperial numbers are round numbers of inches. For example, a desk is 60 in by 30 in, and 29 in high.
 */
const USUAL_OBJECT: Readonly<Record<System, Readonly<Record<ObjectKind, readonly [width: number, depth: number, height: number]>>>> = {
  imperial: {
    desk: [1.524, 0.762, 0.7366],
    table: [1.524, 0.9144, 0.762],
    chair: [0.508, 0.508, 0.8636],
    sofa: [2.1336, 0.9144, 0.8636],
    bed: [1.524, 2.032, 0.6096],
    shelf: [0.8128, 0.3048, 1.8288],
    cabinet: [0.9144, 0.6096, 0.9144],
    rack: [0.6096, 0.9144, 1.2192],
    computer: [0.2032, 0.4572, 0.4572],
    display: [0.6096, 0.2032, 0.4572],
    appliance: [0.762, 0.762, 0.9144],
    other: [0.6096, 0.6096, 0.6096],
  },
  metric: {
    desk: [1.5, 0.75, 0.75],
    table: [1.5, 0.9, 0.75],
    chair: [0.5, 0.5, 0.85],
    sofa: [2.1, 0.9, 0.85],
    bed: [1.5, 2, 0.6],
    shelf: [0.8, 0.3, 1.8],
    cabinet: [0.9, 0.6, 0.9],
    rack: [0.6, 0.9, 1.2],
    computer: [0.2, 0.45, 0.45],
    display: [0.6, 0.2, 0.45],
    appliance: [0.6, 0.6, 0.85],
    other: [0.6, 0.6, 0.6],
  },
};

/**
 * This function gives the usual value of a length of an object in the unit of a mode. The page uses it when the field has no text.
 * A kind that the form does not offer gets the size of the kind `other`. The space between the wall and the object is 0.
 * The distance from the corner has no usual value. The height of the bottom has none here: the floor, or the top of the holder, is the usual place.
 */
export function usualSize(kind: string, field: ObjectField, mode: LengthMode): number | undefined {
  if (field === "offset" || field === "lift") return undefined;
  if (field === "gap") return 0;
  const [width, depth, height] = USUAL_OBJECT[systemOf(mode)][isOneOf(OBJECT_KINDS, kind) ? kind : "other"];
  const meters = field === "width" ? width : field === "depth" ? depth : height;
  return rounded(meters / metersPer(unitOf(mode)), 6);
}

/** The numbers of an object, in the unit of the mode. */
export interface ObjectNumbers {
  /** The distance from the start of the wall, or from the near edge of the holder, to the near edge of the object. */
  readonly start: number;
  readonly width: number;
  readonly depth: number;
  readonly height: number;
  /** The space between the wall and the back of the object, or between the back of the holder and the back of the object. */
  readonly gap: number;
  /** The height of the bottom above the floor, or above the bottom of the holder. An object at its usual place has `undefined`. */
  readonly lift: number | undefined;
}

/** The value of an object: its numbers, or the first field that needs a value. */
export type ObjectReading = { readonly state: "ok"; readonly numbers: ObjectNumbers } | { readonly state: "empty" | "bad" | "zero"; readonly field: ObjectField };

/**
 * This function gives the numbers of an object. `base` is the length of its wall, or the width of its holder.
 * A size with no text gets the usual size of the kind. A distance from the far end of `base` becomes a distance from its start.
 */
export function readObject(object: DraftObject, base: number, mode: LengthMode): ObjectReading {
  const numbers = { offset: 0, width: 0, depth: 0, height: 0, gap: 0 };
  let lift: number | undefined;
  for (const field of OBJECT_FIELDS) {
    const reading = readLength(object[field], mode);
    if (reading.state === "bad") return { state: "bad", field };
    if (field === "lift") {
      lift = reading.state === "ok" ? reading.value : undefined;
      continue;
    }
    const value = reading.state === "ok" ? reading.value : usualSize(object.kind, field, mode);
    if (value === undefined) return { state: "empty", field };
    // An object has a size above 0. Its distances can be 0.
    if (value === 0 && (field === "width" || field === "depth" || field === "height")) return { state: "zero", field };
    numbers[field] = value;
  }
  const start = object.from === "start" ? numbers.offset : rounded(base - numbers.offset - numbers.width, 6);
  return { state: "ok", numbers: { start, width: numbers.width, depth: numbers.depth, height: numbers.height, gap: numbers.gap, lift } };
}

/** An object of a draft, with its wall, its holder and its name. */
export interface ListedObject {
  /** The position of the wall in the walk, from 0. An object on a holder has the wall of the holder. */
  readonly side: number;
  readonly object: DraftObject;
  /** The object that holds this object. An object against a wall has none. */
  readonly holder: ListedObject | undefined;
  /** The level of the object: 1 for an object against a wall, 2 for an object on such an object. */
  readonly level: number;
  /** The number of the object in the objects of its kind, in the sequence of the form, from 1. */
  readonly number: number;
  /** The `id` of the record of the object: the words of its kind and its number, for example `desk-2`. */
  readonly id: string;
  /** The words for the object in a message, for example `desk 2`. */
  readonly words: string;
  /** The length of the wall, or the width of the holder, in the unit of the mode. A length that is not known is 0. */
  readonly base: number;
  readonly reading: ObjectReading;
  /** This value is true when the survey record has the object. Then the object has its numbers, its wall has a length, and its holder is in the record. */
  readonly ready: boolean;
}

/**
 * This function gives each object of a draft, in the sequence of the form.
 * The objects of a wall follow the sequence of the walk, and the objects on an object follow that object.
 */
export function listedObjects(draft: Draft): readonly ListedObject[] {
  const counts = new Map<string, number>();
  const list: ListedObject[] = [];
  const visit = (object: DraftObject, side: number, holder: ListedObject | undefined, base: number): void => {
    const kind = objectWords(object.kind);
    const number = (counts.get(kind) ?? 0) + 1;
    counts.set(kind, number);
    const reading = readObject(object, base, draft.mode);
    const item: ListedObject = {
      side,
      object,
      holder,
      level: holder === undefined ? 1 : holder.level + 1,
      number,
      id: `${kind.split(" ").join("-")}-${String(number)}`,
      words: `${kind} ${String(number)}`,
      base,
      reading,
      ready: (holder === undefined || holder.ready) && base > 0 && reading.state === "ok",
    };
    list.push(item);
    const width = reading.state === "ok" ? reading.numbers.width : 0;
    for (const held of object.holds) visit(held, side, item, width);
  };
  draft.sides.forEach((side, index) => {
    const length = readLength(side.length, draft.mode);
    for (const object of side.objects) visit(object, index, undefined, length.state === "ok" ? length.value : 0);
  });
  return list;
}

/** A point of an add-on on a wall of a survey record, for the draft of the record. */
export interface SurveyPoint {
  /** The `id` of the wall of the point. */
  readonly wall: string;
  /** The distance along the wall from its start to the point, in the unit of the survey. */
  readonly offset: number;
  /** The height of the point above the floor, in the unit of the survey. */
  readonly height: number;
  /** The record of the point. A field that names a point has the position of that point in the points of the survey, as text. */
  readonly point: DraftOwned;
}

/** The records of the add-ons of one survey record, for the draft of the record. `levelParts` makes them. */
export interface SurveyParts {
  /** The points of the walls. A record names a point by its position in this list, from 0, as text. */
  readonly points: readonly SurveyPoint[];
  /** The records that each object owns, by the `id` of the object. */
  readonly owned: ReadonlyMap<string, readonly DraftOwned[]>;
}

/** No records of an add-on. */
const NO_PARTS: SurveyParts = { points: [], owned: new Map() };

/**
 * This function makes the survey record of a draft. It is total: a length with no valid number counts as 0.
 * A height or a thickness with no valid number gets a usual value.
 * The record has each opening that has its numbers, on a wall that has a length.
 * It has each object that has its numbers, against such a wall or on an object of the record.
 *
 * The record has no record of an add-on: a point of a wall and a record of an object stay in the draft. `roomSurvey` adds them.
 */
export function surveyOf(draft: Draft, forms: readonly LayerForm[] = FORMS): Survey {
  const name = draft.name.trim();
  const toRight = walksRight(draft.sides);
  const openings: Opening[] = [];
  for (const item of placedFeatures(draft, forms)) {
    if (item.reading.state !== "ok" || !(item.wall > 0) || item.feature.kind === "point") continue;
    const { start, width, height, sill } = item.reading.numbers;
    openings.push({ id: item.id, wall: wallId(item.side), kind: item.feature.kind, offset: start, width, ...(sill > 0 ? { sill } : {}), height });
  }
  const objects: SurveyObject[] = [];
  for (const item of listedObjects(draft)) {
    if (!item.ready || item.reading.state !== "ok") continue;
    const { start, width, depth, height, gap, lift } = item.reading.numbers;
    const label = item.object.name.trim();
    objects.push({
      id: item.id,
      kind: item.object.kind,
      ...(label === "" ? {} : { name: label }),
      ...(item.holder === undefined ? { wall: wallId(item.side) } : { on: item.holder.id }),
      offset: start,
      width,
      depth,
      height,
      ...(gap > 0 ? { gap } : {}),
      ...(lift === undefined ? {} : { lift }),
    });
  }
  return {
    schema: SURVEY_SCHEMA,
    ...(name === "" ? {} : { name }),
    unit: unitOf(draft.mode),
    height: lengthOr(draft.height, draft.mode, USUAL.height),
    wallThickness: lengthOr(draft.thickness, draft.mode, USUAL.thickness),
    sides: draft.sides.map((side, index) => {
      const reading = readLength(side.length, draft.mode);
      return { id: wallId(index), length: reading.state === "ok" ? reading.value : 0, turn: turnOf(side, toRight) };
    }),
    ...(openings.length === 0 ? {} : { openings }),
    ...(objects.length === 0 ? {} : { objects }),
  };
}

/** This function gives the way to type a length that fits the unit of a survey record. */
export function modeOf(unit: LengthUnit): LengthMode {
  if (unit === "ft" || unit === "in") return "ft-in";
  return unit === "mm" ? "cm" : unit;
}

/** This function gives a turn of a survey record in degrees. A turn to the left is positive, and a turn that is not finite is 0. */
function degreesOf(turn: SurveyTurn): number {
  if (turn === "left") return SQUARE;
  if (turn === "right") return 0 - SQUARE;
  return Number.isFinite(turn) ? turn : 0;
}

/** This function gives the angle inside the room for a turn of the walk, as text with 2 decimals at most. */
function angleText(turn: number, toRight: boolean): string {
  return String(rounded(toRight ? STRAIGHT + turn : STRAIGHT - turn, 2));
}

const NO_TEXT: TypedLength = { value: "", inches: "" };

/**
 * This function makes the draft of a survey record.
 * It reads the name, the height, the thickness, the sides, the openings and the objects.
 * The features and the objects of a wall are in the sequence of their distances from its start.
 * The draft has no checks and no record of an add-on. `draftKeys` can give the draft the records of the add-ons.
 */
export function draftOf(survey: Survey): Draft {
  return draftKeys(survey).draft;
}

/** An object of a survey record that a draft keeps, with the objects on it. */
interface KeptObject {
  readonly record: SurveyObject;
  readonly holds: readonly KeptObject[];
}

/** The objects of a survey record that a draft keeps. */
interface KeptObjects {
  /** The objects against each wall, by the `id` of the wall, in the sequence of their distances from its start. */
  readonly walls: ReadonlyMap<string, readonly KeptObject[]>;
  /** The number of the objects, with the objects that they hold. */
  readonly count: number;
}

/**
 * This function gives the objects of a survey record that a draft keeps.
 * An object stays when its wall is a wall of the survey, or when its holder stays. The first object of an `id` is the object of that `id`.
 * A draft keeps a limited number of objects and of levels, so an object past a limit does not stay.
 */
function keptObjects(survey: Survey): KeptObjects {
  const sides = new Set(survey.sides.map((side) => side.id));
  const first = new Map<string, SurveyObject>();
  for (const item of survey.objects ?? []) if (!first.has(item.id)) first.set(item.id, item);
  const onWall = new Map<string, SurveyObject[]>();
  const onObject = new Map<string, SurveyObject[]>();
  for (const item of first.values()) {
    // A holder comes before a wall, as in the survey.
    if (item.on !== undefined) onObject.set(item.on, [...(onObject.get(item.on) ?? []), item]);
    else if (item.wall !== undefined && sides.has(item.wall)) onWall.set(item.wall, [...(onWall.get(item.wall) ?? []), item]);
  }
  let count = 0;
  const sorted = (list: readonly SurveyObject[]): readonly SurveyObject[] => [...list].sort((a, b) => a.offset - b.offset);
  // The walk starts at the walls, so it does not reach an object of a loop of holders.
  const kept = (list: readonly SurveyObject[], level: number): readonly KeptObject[] =>
    sorted(list).flatMap((record): KeptObject[] => {
      if (level > LIMITS.nesting || count >= LIMITS.objects) return [];
      count += 1;
      return [{ record, holds: kept(onObject.get(record.id) ?? [], level + 1) }];
    });
  const walls = new Map<string, readonly KeptObject[]>();
  for (const side of survey.sides) if (!walls.has(side.id)) walls.set(side.id, kept(onWall.get(side.id) ?? [], 1));
  return { walls, count };
}

/** This function gives the `id` of each object of a survey record that a draft keeps. */
export function keptIds(survey: Survey): ReadonlySet<string> {
  const ids = new Set<string>();
  const add = (list: readonly KeptObject[]): void => {
    for (const item of list) {
      ids.add(item.record.id);
      add(item.holds);
    }
  };
  for (const list of keptObjects(survey).walls.values()) add(list);
  return ids;
}

/** The draft of a survey record, and the key of the feature of each opening of the record. */
export interface DraftKeys {
  readonly draft: Draft;
  /** The key of the feature of the draft for the `id` of each opening of the survey. Two openings with one `id` give the key of the first one. */
  readonly keys: ReadonlyMap<string, string>;
}

/** This function gives each name of a point the key of its feature. A name of a point with no feature goes away. */
function pointNames(owned: DraftOwned, keyOf: ReadonlyMap<string, string>): DraftOwned {
  const points = Object.entries(owned.points).flatMap(([name, position]): [string, string][] => {
    const key = keyOf.get(position);
    return key === undefined ? [] : [[name, key]];
  });
  return ownedOf(owned.layer, owned.collection, { values: owned.values, records: owned.records, points: Object.fromEntries(points) });
}

/**
 * This function makes the draft of a survey record, as `draftOf` does. It also tells which feature of the draft is each opening of the record.
 * `parts` gives the records of the add-ons: the points of the walls, and the records that the objects own.
 * A point becomes a feature of its wall, and each name of a point becomes the key of that feature.
 */
export function draftKeys(survey: Survey, parts: SurveyParts = NO_PARTS): DraftKeys {
  const keys = new Map<string, string>();
  const mode = modeOf(survey.unit);
  const factor = metersPer(survey.unit) / metersPer(unitOf(mode));
  const typed = (value: number): TypedLength => (Number.isFinite(value) && value > 0 ? typedOf(value * factor, mode) : NO_TEXT);
  /** A distance or a height can be 0. */
  const typedFrom0 = (value: number): TypedLength => (Number.isFinite(value) && value >= 0 ? typedOf(value * factor, mode) : NO_TEXT);
  // The turns of a walk to the right make a negative sum.
  const toRight = survey.sides.reduce((sum, side) => sum + degreesOf(side.turn), 0) < 0;
  const seen = new Set<string>();
  /** The key of the feature of each point, by the position of the point in the points of `parts`, as text. */
  const pointKeys = new Map<string, string>();
  let count = 0;
  const sides = survey.sides.map((side, index): DraftSide => {
    // A survey gives the features of an `id` to the first side with that `id`.
    const first = !seen.has(side.id);
    seen.add(side.id);
    const openings = first ? (survey.openings ?? []).filter((item) => item.wall === side.id) : [];
    const points = first ? parts.points.flatMap((item, position) => (item.wall === side.id ? [{ item, position: String(position) }] : [])) : [];
    const features: readonly { readonly at: number; readonly id: string | undefined; readonly position: string | undefined; readonly feature: Omit<DraftFeature, "key" | "from"> }[] = [
      ...openings.map((item) => ({
        at: item.offset,
        id: item.id,
        position: undefined,
        feature: {
          kind: item.kind,
          offset: typedFrom0(item.offset),
          width: typed(item.width),
          height: typed(item.height),
          sill: item.kind === "window" ? typedFrom0(item.sill ?? 0) : NO_TEXT,
        },
      })),
      ...points.map(({ item, position }) => ({
        at: item.offset,
        id: undefined,
        position,
        feature: { kind: "point" as const, offset: typedFrom0(item.offset), width: NO_TEXT, height: typedFrom0(item.height), sill: NO_TEXT, point: item.point },
      })),
    ].sort((a, b) => a.at - b.at);
    return {
      key: `s${String(index + 1)}`,
      length: typed(side.length),
      corner: typeof side.turn === "number" ? "angle" : side.turn,
      angle: typeof side.turn === "number" && Number.isFinite(side.turn) ? angleText(side.turn, toRight) : "",
      features: features.map(({ id, position, feature }): DraftFeature => {
        count += 1;
        const key = `f${String(count)}`;
        if (id !== undefined && !keys.has(id)) keys.set(id, key);
        if (position !== undefined) pointKeys.set(position, key);
        const { kind, offset, width, height, sill, point } = feature;
        // The fields have the sequence of each feature of a draft, so equal features give equal JSON.
        return { key, kind, from: "start", offset, width, height, sill, ...(point === undefined ? {} : { point }) };
      }),
      objects: [],
    };
  });
  // A record of a point can name a point of a later wall, so the names get their keys after the walk.
  const named = sides.map((side): DraftSide => ({ ...side, features: side.features.map((feature) => (feature.point === undefined ? feature : { ...feature, point: pointNames(feature.point, pointKeys) })) }));
  // The objects come after the features, because an object can name a point of a later wall.
  let objects = 0;
  const objectOf = ({ record, holds }: KeptObject): DraftObject => {
    objects += 1;
    const kind = record.kind.trim().slice(0, LIMITS.text);
    return {
      key: `o${String(objects)}`,
      kind: kind === "" ? "other" : kind,
      name: (record.name ?? "").trim().slice(0, LIMITS.text),
      from: "start",
      offset: typedFrom0(record.offset),
      // A size of 0 stays as text, so the page tells the fault.
      width: typedFrom0(record.width),
      depth: typedFrom0(record.depth),
      height: typedFrom0(record.height),
      gap: typed(record.gap ?? 0),
      lift: record.lift === undefined ? NO_TEXT : typedFrom0(record.lift),
      owns: (parts.owned.get(record.id) ?? []).map((owned) => pointNames(owned, pointKeys)).filter(hasFields),
      holds: holds.map(objectOf),
    };
  };
  const kept = keptObjects(survey);
  const used = new Set<string>();
  const draft: Draft = {
    name: (survey.name ?? "").slice(0, LIMITS.text),
    mode,
    height: typed(survey.height),
    thickness: typed(survey.wallThickness),
    sides: named.map((side, index): DraftSide => {
      const id = survey.sides[index]?.id;
      // The first side of an `id` has the objects of that `id`, as it has the features.
      if (id === undefined || used.has(id)) return side;
      used.add(id);
      return { ...side, objects: (kept.walls.get(id) ?? []).map(objectOf) };
    }),
  };
  return { draft, keys };
}

/**
 * This function tells if a survey record has data that a draft does not keep.
 * This data is the checks, and the height or the thickness of one side.
 * It is also the bottom of a door above the floor, and an opening on a wall that the survey does not have.
 * For the objects, it is an object that the draft does not keep, or a distance below 0.
 *
 * The function does not examine the records of the add-ons. `levelParts` tells the data of those records that a draft does not keep.
 */
export function hasMore(survey: Survey): boolean {
  const walls = new Set(survey.sides.map((side) => side.id));
  const objects = survey.objects ?? [];
  return (
    (survey.checks ?? []).length > 0 ||
    survey.sides.some((side) => side.thickness !== undefined || side.height !== undefined) ||
    (survey.openings ?? []).some((item) => !walls.has(item.wall) || (item.kind !== "window" && (item.sill ?? 0) !== 0)) ||
    (objects.length > 0 && keptObjects(survey).count !== objects.length) ||
    objects.some((item) => (item.gap ?? 0) < 0 || (item.lift ?? 0) < 0)
  );
}

/** The lengths of the example room in meters: a room of 12 ft by 10 ft, or of 3.6 m by 3 m. */
const EXAMPLE: Readonly<Record<System, { readonly sides: readonly number[]; readonly height: number; readonly thickness: number }>> = {
  imperial: { sides: [3.6576, 3.048, 3.6576, 3.048], height: 2.4384, thickness: 0.1143 },
  metric: { sides: [3.6, 3, 3.6, 3], height: 2.4, thickness: 0.11 },
};

/**
 * The features of the example room, each with the position of its wall and its lengths in meters.
 * They are a door on wall 1, an outlet on wall 2 and a window on wall 3. The imperial door is 6 in from the corner and 32 in wide.
 */
const EXAMPLE_FEATURES: Readonly<Record<System, readonly (readonly [side: number, kind: "door" | "window" | "outlet", lengths: Partial<Readonly<Record<FeatureField, number>>>])[]>> = {
  imperial: [
    [0, "door", { offset: 0.1524, width: 0.8128, height: 2.032 }],
    [1, "outlet", { offset: 1.524, height: 0.3048 }],
    [2, "window", { offset: 1.2192, width: 1.2192, sill: 0.9144, height: 1.2192 }],
  ],
  metric: [
    [0, "door", { offset: 0.15, width: 0.8, height: 2.03 }],
    [1, "outlet", { offset: 1.5, height: 0.3 }],
    [2, "window", { offset: 1.2, width: 1.2, sill: 0.9, height: 1.2 }],
  ],
};

/** An object of the example room: its key, its kind and its lengths in meters. `outlet` is the key of the feature of its outlet. */
interface ExampleObject {
  readonly key: string;
  readonly kind: ObjectKind;
  readonly lengths: Partial<Readonly<Record<ObjectField, number>>>;
  readonly outlet?: string;
  readonly holds?: readonly ExampleObject[];
}

/**
 * The objects of the example room, each with the position of its wall.
 * They are a rack in front of the outlet of wall 2, and a desk with a display below the window of wall 3.
 * The imperial desk is 60 in by 30 in, and its display is 18 in from its edge.
 */
const EXAMPLE_OBJECTS: Readonly<Record<System, readonly (readonly [side: number, object: ExampleObject])[]>> = {
  imperial: [
    [1, { key: "o1", kind: "rack", lengths: { offset: 1.2192, width: 0.6096, depth: 0.9144, height: 1.2192, gap: 0.1016 }, outlet: "f2" }],
    [
      2,
      {
        key: "o2",
        kind: "desk",
        lengths: { offset: 1.0668, width: 1.524, depth: 0.762, height: 0.7366 },
        holds: [{ key: "o3", kind: "display", lengths: { offset: 0.4572, width: 0.6096, depth: 0.2032, height: 0.4572, gap: 0.1016 } }],
      },
    ],
  ],
  metric: [
    [1, { key: "o1", kind: "rack", lengths: { offset: 1.2, width: 0.6, depth: 0.9, height: 1.2, gap: 0.1 }, outlet: "f2" }],
    [
      2,
      {
        key: "o2",
        kind: "desk",
        lengths: { offset: 1.05, width: 1.5, depth: 0.75, height: 0.75 },
        holds: [{ key: "o3", kind: "display", lengths: { offset: 0.45, width: 0.6, depth: 0.2, height: 0.45, gap: 0.1 } }],
      },
    ],
  ],
};

function draftWith(mode: LengthMode, lengths: (meters: number) => TypedLength): Draft {
  const example = EXAMPLE[systemOf(mode)];
  return {
    name: "",
    mode,
    height: typedOf(example.height / metersPer(unitOf(mode)), mode),
    thickness: typedOf(example.thickness / metersPer(unitOf(mode)), mode),
    sides: example.sides.map((meters, index) => ({ key: `s${String(index + 1)}`, length: lengths(meters), corner: "left", angle: "", features: [], objects: [] })),
  };
}

/** This function gives the example room with its furniture, or the example room of the page from before the furniture. */
function exampleWith(mode: LengthMode, furniture: boolean): Draft {
  const typed = (meters: number | undefined): TypedLength => (meters === undefined ? NO_TEXT : typedOf(meters / metersPer(unitOf(mode)), mode));
  const draft = draftWith(mode, typed);
  const features = EXAMPLE_FEATURES[systemOf(mode)];
  const objects = furniture ? EXAMPLE_OBJECTS[systemOf(mode)] : [];
  const objectOf = ({ key, kind, lengths, outlet, holds }: ExampleObject): DraftObject => ({
    key,
    kind,
    name: "",
    from: "start",
    offset: typed(lengths.offset),
    width: typed(lengths.width),
    depth: typed(lengths.depth),
    height: typed(lengths.height),
    gap: typed(lengths.gap),
    lift: typed(lengths.lift),
    owns: feedOwns(outlet ?? ""),
    holds: (holds ?? []).map(objectOf),
  });
  return {
    ...draft,
    sides: draft.sides.map((side, index) => ({
      ...side,
      features: features.flatMap(([at, kind, lengths], position): DraftFeature[] => {
        if (at !== index) return [];
        const base = { from: "start" as const, offset: typed(lengths.offset), width: typed(lengths.width), height: typed(lengths.height), sill: typed(lengths.sill) };
        const key = `f${String(position + 1)}`;
        return [kind === "outlet" ? { key, kind: "point", ...base, point: outletPoint(undefined) } : { key, kind, ...base }];
      }),
      objects: objects.flatMap(([at, object]): DraftObject[] => (at === index ? [objectOf(object)] : [])),
    })),
  };
}

/**
 * This function gives the example room: four walls with square corners, a door, a window and an outlet.
 * It has a rack at the outlet, and a desk with a display. A person types the numbers of a real room over it.
 */
export function exampleDraft(mode: LengthMode): Draft {
  return exampleWith(mode, true);
}

/**
 * This function tells if a draft is the example room, with no change.
 * The example room of the page from before the furniture is also the example room, because a browser can keep it.
 */
export function isExample(draft: Draft): boolean {
  return sameDraft(draft, exampleWith(draft.mode, true)) || sameDraft(draft, exampleWith(draft.mode, false));
}

/** This function gives a room with four walls and no lengths. */
export function emptyDraft(mode: LengthMode): Draft {
  return draftWith(mode, () => ({ value: "", inches: "" }));
}

/** This function tells if two drafts have the same text in each field. */
export function sameDraft(a: Draft, b: Draft): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** This function gives the way to type a length for the language of a browser: feet and inches where people use them. */
export function defaultMode(language: string | undefined): LengthMode {
  return language !== undefined && /-(?:US|LR|MM)$/i.test(language) ? "ft-in" : "m";
}

/** This function gives a draft in a different mode. Each length stays, and its numbers change. */
export function withMode(draft: Draft, mode: LengthMode): Draft {
  if (mode === draft.mode) return draft;
  const convert = (typed: TypedLength): TypedLength => convertTyped(typed, draft.mode, mode);
  const feature = (item: DraftFeature): DraftFeature => ({ ...item, offset: convert(item.offset), width: convert(item.width), height: convert(item.height), sill: convert(item.sill) });
  const object = (item: DraftObject): DraftObject => ({
    ...item,
    offset: convert(item.offset),
    width: convert(item.width),
    depth: convert(item.depth),
    height: convert(item.height),
    gap: convert(item.gap),
    lift: convert(item.lift),
    holds: item.holds.map(object),
  });
  return {
    ...draft,
    mode,
    height: convert(draft.height),
    thickness: convert(draft.thickness),
    sides: draft.sides.map((side) => ({ ...side, length: convert(side.length), features: side.features.map(feature), objects: side.objects.map(object) })),
  };
}

/** This function gives a key that no wall of the draft has. */
function freeKey(draft: Draft): string {
  const numbers = draft.sides.map((side) => Number(side.key.slice(1))).filter((value) => Number.isInteger(value));
  return `s${String(Math.max(0, ...numbers) + 1)}`;
}

/** This function adds a wall with no length at the end of the walk. Its corner is the corner of the wall before it. */
export function withNewSide(draft: Draft): Draft {
  const last = draft.sides.at(-1);
  const corner = last === undefined || last.corner === "angle" ? "left" : last.corner;
  return { ...draft, sides: [...draft.sides, { key: freeKey(draft), length: NO_TEXT, corner, angle: "", features: [], objects: [] }] };
}

/**
 * This function gives a list of objects after a change of each list in it. The change goes to the list, then to the list of the objects that each object holds.
 * A change that gives its list back keeps that list.
 */
function changedObjects(objects: readonly DraftObject[], change: (list: readonly DraftObject[]) => readonly DraftObject[]): readonly DraftObject[] {
  const list = change(objects);
  let same = list === objects;
  const next = list.map((object) => {
    const holds = changedObjects(object.holds, change);
    if (holds === object.holds) return object;
    same = false;
    return { ...object, holds };
  });
  return same ? objects : next;
}

/** This function changes each list of objects of a draft, as `changedObjects` does. A draft with no change stays the same draft. */
function withObjects(draft: Draft, change: (list: readonly DraftObject[]) => readonly DraftObject[]): Draft {
  let same = true;
  const sides = draft.sides.map((side) => {
    const objects = changedObjects(side.objects, change);
    if (objects === side.objects) return side;
    same = false;
    return { ...side, objects };
  });
  return same ? draft : { ...draft, sides };
}

/**
 * This function changes each record of an add-on in a draft: the record of each point, and each record that an object owns.
 * A change that gives its record back keeps that record, and a draft with no change stays the same draft.
 * A record of an object that loses its last field goes away.
 */
function withRecords(draft: Draft, change: (owned: DraftOwned) => DraftOwned): Draft {
  const owns = (list: readonly DraftOwned[]): readonly DraftOwned[] => {
    const next = list.map(change);
    return next.every((item, index) => item === list[index]) ? list : next.filter((item, index) => item === list[index] || hasFields(item));
  };
  const objects = withObjects(draft, (list) => {
    const next = list.map((object) => {
      const records = owns(object.owns);
      return records === object.owns ? object : { ...object, owns: records };
    });
    return next.every((object, index) => object === list[index]) ? list : next;
  });
  let same = true;
  const sides = objects.sides.map((side) => {
    const features = side.features.map((feature) => {
      if (feature.point === undefined) return feature;
      const point = change(feature.point);
      return point === feature.point ? feature : { ...feature, point };
    });
    if (features.every((feature, index) => feature === side.features[index])) return side;
    same = false;
    return { ...side, features };
  });
  return same ? objects : { ...objects, sides };
}

/** This function gives the names that stay. Names with no change stay the same names. */
function keptTexts(texts: DraftTexts, stays: (key: string) => boolean): DraftTexts {
  const entries = Object.entries(texts);
  const kept = entries.filter(([, key]) => stays(key));
  return kept.length === entries.length ? texts : Object.fromEntries(kept);
}

/**
 * This function keeps only the names of points for which `stays` is true.
 * `stays` gets the layer of the record that has the name, and the key of the point.
 */
function withPointNames(draft: Draft, stays: (layer: string, key: string) => boolean): Draft {
  return withRecords(draft, (owned) => {
    const points = keptTexts(owned.points, (key) => stays(owned.layer, key));
    return points === owned.points ? owned : { ...owned, points };
  });
}

/**
 * This function gives a new key to each name of a record of a list.
 * `keyOf` gets the layer of the record that has the name, and the old key. A name with no new key goes away.
 */
function withRecordNames(draft: Draft, keyOf: (layer: string, key: string) => string | undefined): Draft {
  return withRecords(draft, (owned) => {
    const records = renamedTexts(owned.records, (key) => keyOf(owned.layer, key));
    return records === owned.records ? owned : { ...owned, records };
  });
}

/** This function gives each name the key that `keyOf` gives for its old key. A name with no new key goes away. Names with no change stay the same names. */
function renamedTexts(texts: DraftTexts, keyOf: (key: string) => string | undefined): DraftTexts {
  const entries = Object.entries(texts);
  if (entries.every(([, key]) => keyOf(key) === key)) return texts;
  return Object.fromEntries(
    entries.flatMap(([name, key]): [string, string][] => {
      const next = keyOf(key);
      return next === undefined ? [] : [[name, next]];
    }),
  );
}

/** This function removes each name of a point with one of these keys from the records of a draft. */
function withoutPoints(draft: Draft, keys: ReadonlySet<string>): Draft {
  return keys.size === 0 ? draft : withPointNames(draft, (_, key) => !keys.has(key));
}

/** This function removes the wall with a key, with its features and its objects. A record of a different wall does not keep the name of a point of the removed wall. */
export function withoutSide(draft: Draft, key: string): Draft {
  const gone = new Set(draft.sides.filter((side) => side.key === key).flatMap((side) => side.features.map((feature) => feature.key)));
  return withoutPoints({ ...draft, sides: draft.sides.filter((side) => side.key !== key) }, gone);
}

/** This function changes the fields of the wall with a key. */
export function withSide(draft: Draft, key: string, change: Partial<Omit<DraftSide, "key">>): Draft {
  return { ...draft, sides: draft.sides.map((side) => (side.key === key ? { ...side, ...change } : side)) };
}

/** This function gives the feature with a key. */
export function featureOf(draft: Draft, key: string): DraftFeature | undefined {
  return draft.sides.flatMap((side) => side.features).find((feature) => feature.key === key);
}

/** This function adds a feature at the end of the features of the wall with a key. The feature gets a key that no feature of the draft has. */
function withAddedFeature(draft: Draft, sideKey: string, feature: (key: string) => DraftFeature): Draft {
  const numbers = draft.sides.flatMap((side) => side.features.map((item) => Number(item.key.slice(1)))).filter((value) => Number.isInteger(value));
  const added = feature(`f${String(Math.max(0, ...numbers) + 1)}`);
  return { ...draft, sides: draft.sides.map((side) => (side.key === sideKey ? { ...side, features: [...side.features, added] } : side)) };
}

/**
 * This function adds a door, a window or an opening with no lengths at the end of the features of the wall with a key.
 * The distance of the feature starts at the start of the wall. `withNewPoint` adds a point.
 */
export function withNewFeature(draft: Draft, sideKey: string, kind: Exclude<FeatureKind, "point">): Draft {
  return withAddedFeature(draft, sideKey, (key) => ({ key, kind, from: "start", offset: NO_TEXT, width: NO_TEXT, height: NO_TEXT, sill: NO_TEXT }));
}

/**
 * This function adds a point of a collection of an add-on at the end of the features of the wall with a key.
 * The point has no lengths, and its record has no fields. Its distance starts at the start of the wall.
 */
export function withNewPoint(draft: Draft, sideKey: string, layer: string, collection: string): Draft {
  return withAddedFeature(draft, sideKey, (key) => ({ key, kind: "point", from: "start", offset: NO_TEXT, width: NO_TEXT, height: NO_TEXT, sill: NO_TEXT, point: ownedOf(layer, collection) }));
}

/** This function removes the feature with a key. A record does not keep the name of a removed point. */
export function withoutFeature(draft: Draft, key: string): Draft {
  return withoutPoints({ ...draft, sides: draft.sides.map((side) => ({ ...side, features: side.features.filter((feature) => feature.key !== key) })) }, new Set([key]));
}

/** This function changes the fields of the feature with a key. `withPoint` changes the record of a point. */
export function withFeature(draft: Draft, key: string, change: Partial<Omit<DraftFeature, "key" | "kind" | "point">>): Draft {
  return { ...draft, sides: draft.sides.map((side) => ({ ...side, features: side.features.map((feature) => (feature.key === key ? { ...feature, ...change } : feature)) })) };
}

/** This function changes the fields of the record of the point with a key. An empty text removes its field. A feature that is not a point does not change. */
export function withPoint(draft: Draft, key: string, change: OwnedChange): Draft {
  let same = true;
  const sides = draft.sides.map((side) => {
    const features = side.features.map((feature) => {
      if (feature.key !== key || feature.point === undefined) return feature;
      const point = changedOwned(feature.point, change);
      return point === feature.point ? feature : { ...feature, point };
    });
    if (features.every((feature, index) => feature === side.features[index])) return side;
    same = false;
    return { ...side, features };
  });
  return same ? draft : { ...draft, sides };
}

/** This function gives each object of a list and the objects that they hold, in the sequence of the form. */
function eachObject(objects: readonly DraftObject[]): readonly DraftObject[] {
  return objects.flatMap((object) => [object, ...eachObject(object.holds)]);
}

/** This function gives the object with a key. */
export function objectOf(draft: Draft, key: string): DraftObject | undefined {
  return draft.sides.flatMap((side) => eachObject(side.objects)).find((object) => object.key === key);
}

/** The place of a new object: against the wall with a key, or on the object with a key. */
export type ObjectPlace = { readonly side: string } | { readonly holder: string };

/** This function gives the level of the object with a key in a list of objects, from `level` for the objects of the list. */
function levelIn(objects: readonly DraftObject[], key: string, level: number): number | undefined {
  for (const object of objects) {
    const found = object.key === key ? level : levelIn(object.holds, key, level + 1);
    if (found !== undefined) return found;
  }
  return undefined;
}

/**
 * This function adds an object with no lengths after the objects of a wall, or after the objects that an object holds.
 * The distance of the object starts at the start of the wall, or at the near edge of its holder.
 * A draft with the largest number of objects does not change. An object at the last level does not get an object.
 */
export function withNewObject(draft: Draft, place: ObjectPlace, kind: string): Draft {
  const all = draft.sides.flatMap((side) => eachObject(side.objects));
  if (all.length >= LIMITS.objects) return draft;
  const numbers = all.map((object) => Number(object.key.slice(1))).filter((value) => Number.isInteger(value));
  const fresh: DraftObject = {
    key: `o${String(Math.max(0, ...numbers) + 1)}`,
    kind,
    name: "",
    from: "start",
    offset: NO_TEXT,
    width: NO_TEXT,
    depth: NO_TEXT,
    height: NO_TEXT,
    gap: NO_TEXT,
    lift: NO_TEXT,
    owns: [],
    holds: [],
  };
  if ("side" in place) return { ...draft, sides: draft.sides.map((side) => (side.key === place.side ? { ...side, objects: [...side.objects, fresh] } : side)) };
  const level = draft.sides.map((side) => levelIn(side.objects, place.holder, 1)).find((value) => value !== undefined);
  if (level === undefined || level >= LIMITS.nesting) return draft;
  return withObjects(draft, (list) => (list.some((object) => object.key === place.holder) ? list.map((object) => (object.key === place.holder ? { ...object, holds: [...object.holds, fresh] } : object)) : list));
}

/** This function removes the object with a key, with the objects that it holds. */
export function withoutObject(draft: Draft, key: string): Draft {
  return withObjects(draft, (list) => (list.some((object) => object.key === key) ? list.filter((object) => object.key !== key) : list));
}

/** This function changes the fields of the object with a key. `withOwned` changes a record that the object owns. */
export function withObject(draft: Draft, key: string, change: Partial<Omit<DraftObject, "key" | "holds" | "owns">>): Draft {
  return withObjects(draft, (list) => (list.some((object) => object.key === key) ? list.map((object) => (object.key === key ? { ...object, ...change } : object)) : list));
}

/** This function gives the first record of a collection of an add-on that an object owns. */
export function ownedBy(object: DraftObject, layer: string, collection: string): DraftOwned | undefined {
  return object.owns.find((owned) => owned.layer === layer && owned.collection === collection);
}

/**
 * This function changes the fields of the record of a collection of an add-on that the object with a key owns. An empty text removes its field.
 * An object with no such record gets one, and a record that loses its last field goes away. An object with the largest number of records gets no more.
 */
export function withOwned(draft: Draft, key: string, layer: string, collection: string, change: OwnedChange): Draft {
  const owns = (object: DraftObject): readonly DraftOwned[] => {
    const before = ownedBy(object, layer, collection);
    const after = changedOwned(before ?? ownedOf(layer, collection), change);
    if (before === undefined) return hasFields(after) && object.owns.length < LIMITS.owned ? [...object.owns, after] : object.owns;
    if (after === before) return object.owns;
    return hasFields(after) ? object.owns.map((owned) => (owned === before ? after : owned)) : object.owns.filter((owned) => owned !== before);
  };
  return withObjects(draft, (list) => {
    const next = list.map((object) => {
      if (object.key !== key) return object;
      const records = owns(object);
      return records === object.owns ? object : { ...object, owns: records };
    });
    return next.every((object, index) => object === list[index]) ? list : next;
  });
}

/** This function gives a length as a person says it: `12 ft 3.5 in`, `147.5 in`, `3.74 m` or `374 cm`. The value is in the unit of the mode. */
export function lengthText(value: number, mode: LengthMode): string {
  const typed = typedOf(Math.abs(value), mode);
  if (mode !== "ft-in") return `${typed.value} ${mode}`;
  if (typed.value === "0") return `${typed.inches} in`;
  return typed.inches === "0" ? `${typed.value} ft` : `${typed.value} ft ${typed.inches} in`;
}

/** This function gives a length as a drawing shows it: `12′ 3.5″`, `147.5″`, `3.74 m` or `374 cm`. */
export function dimensionText(value: number, mode: LengthMode): string {
  const typed = typedOf(Math.abs(value), mode);
  if (mode === "in") return `${typed.value}″`;
  if (mode !== "ft-in") return `${typed.value} ${mode}`;
  if (typed.value === "0") return `${typed.inches}″`;
  return typed.inches === "0" ? `${typed.value}′` : `${typed.value}′ ${typed.inches}″`;
}

/** This function gives an area as text in square feet or in square meters. The value is in the square of the unit of the mode. */
export function areaText(value: number, mode: LengthMode): string {
  const imperial = mode === "ft-in" || mode === "in";
  const meters = metersPer(unitOf(mode)) / (imperial ? metersPer("ft") : 1);
  return `${String(rounded(value * meters * meters, 1))} ${imperial ? "ft²" : "m²"}`;
}

/** The state of a draft: a field needs a value, the walk is open, or the room is closed. */
export type StatusLevel = "typing" | "open" | "closed";

/** The message of the page about a draft. */
export interface Status {
  readonly level: StatusLevel;
  readonly title: string;
  readonly text: string;
  /** The position of the wall that needs a value, or of the wall of the feature or the object with a fault, from 0. */
  readonly side?: number | undefined;
  /** The key of the feature with a fault. */
  readonly feature?: string | undefined;
  /** The key of the object with a fault. */
  readonly object?: string | undefined;
}

/** The smallest number of walls of a room. */
const FEWEST_SIDES = 3;

/** An error of the sum of the turns below this number of degrees is noise of the calculation. */
const TURN_NOISE = 1e-6;

/** The page tells a gap below this part of the length of the walk as no gap. */
const NO_GAP = 1e-9;

/** This function gives the first field of the draft that needs a value, as a message. */
function missing(draft: Draft): Status | undefined {
  for (const [index, side] of draft.sides.entries()) {
    const wall = `wall ${String(index + 1)}`;
    const reading = readLength(side.length, draft.mode);
    if (reading.state === "empty") return { level: "typing", title: `Type the length of ${wall}.`, text: "The drawing shows this wall when it has a length.", side: index };
    if (reading.state === "bad") return { level: "typing", title: `The length of ${wall} is not a number.`, text: "Use digits and a decimal point, for example 3.5.", side: index };
    if (reading.value === 0) return { level: "typing", title: `The length of ${wall} is 0.`, text: "Type its length, or remove the wall.", side: index };
    if (side.corner === "angle" && angleOf(side) === undefined) {
      return { level: "typing", title: `Type the angle of the corner after ${wall}.`, text: "Measure the angle inside the room, between the two walls. It is above 0 and below 360 degrees.", side: index };
    }
  }
  return undefined;
}

/** A fault of a feature, as a message. */
export interface FeatureFault {
  /** The position of the wall of the feature, from 0. */
  readonly side: number;
  /** The key of the feature. */
  readonly key: string;
  /** The `id` of the record of the feature. */
  readonly id: string;
  /** `typing` is a field that needs a value. `error` is a feature that the room cannot show. `warning` is a feature that the room shows. */
  readonly level: "typing" | "error" | "warning";
  /** The field that needs a value. */
  readonly field?: FeatureField | undefined;
  /** The message with the name of the feature and its wall, for the status of the page. */
  readonly text: string;
  /** The short message, for the place of the feature in the form. */
  readonly note: string;
}

/** This function gives the words for a length of a feature in a message. */
function fieldWords(kind: FeatureKind, field: FeatureField): string {
  if (field === "offset") return "distance from the corner";
  if (field === "sill") return "height of the bottom";
  if (field === "width") return "width";
  return kind === "point" ? "height above the floor" : "height";
}

/** This function gives the two messages of a finding of the room check about a feature: the full message and the short message. */
function findingTexts(finding: Finding, item: PlacedFeature, name: string, wall: string): readonly [text: string, note: string] {
  const label = `${name.slice(0, 1).toUpperCase()}${name.slice(1)}`;
  const numbers = item.reading.state === "ok" ? item.reading.numbers : undefined;
  switch (finding.code) {
    case "opening-range":
      // An opening that is in the length of its wall can be in the thickness of the next wall, at a corner that points into the room.
      if (numbers !== undefined && numbers.start >= 0 && numbers.start + numbers.width <= item.wall) {
        return [`${label} on ${wall} is too near a corner.`, "It is too near a corner: the other wall of the corner covers a part of it."];
      }
      return [`${label} does not fit in ${wall}.`, "It does not fit in the wall."];
    case "opening-height":
      return [`${label} on ${wall} is higher than the wall.`, "It is higher than the wall."];
    case "opening-overlap":
      return [`${label} on ${wall} is in the space of a different opening.`, "It is in the space of a different opening of this wall."];
    case "outlet-range":
      return [`${label} is not on ${wall}.`, "It is not on the wall."];
    case "outlet-in-opening":
      return [`${label} on ${wall} is in an opening.`, "It is in an opening of this wall."];
    default:
      return [`Examine the numbers of ${name} on ${wall}.`, "Examine its numbers."];
  }
}

/**
 * This function gives the faults of the features of a draft, in the sequence of the walk. A feature has one fault at most.
 * The first field that needs a value comes before a fault of the place of the feature, which the room check finds.
 * A feature on a wall with no length has no fault of its place.
 */
export function featureFaults(draft: Draft, result: SurveyResult, forms: readonly LayerForm[] = FORMS): readonly FeatureFault[] {
  const placed = placedFeatures(draft, forms);
  if (placed.length === 0) return [];
  const findings = new Map<string, Finding>();
  for (const finding of checkRoom(result.room)) {
    if ((finding.record === "opening" || finding.record === "outlet") && !findings.has(finding.at)) findings.set(finding.at, finding);
  }
  return placed.flatMap((item): FeatureFault[] => {
    const { side, feature, id, reading } = item;
    const name = `${featureWord(feature, forms)} ${String(item.number)}`;
    const wall = `wall ${String(side + 1)}`;
    const base = { side, key: feature.key, id };
    if (reading.state !== "ok") {
      const words = fieldWords(feature.kind, reading.field);
      const field = reading.field;
      if (reading.state === "empty") return [{ ...base, level: "typing", field, text: `Type the ${words} of ${name} on ${wall}.`, note: `Type its ${words}.` }];
      const fault = reading.state === "bad" ? "is not a number" : "is 0";
      return [{ ...base, level: "typing", field, text: `The ${words} of ${name} on ${wall} ${fault}.`, note: `Its ${words} ${fault}.` }];
    }
    const finding = item.wall > 0 ? findings.get(id) : undefined;
    if (finding === undefined) return [];
    const [text, note] = findingTexts(finding, item, name, wall);
    return [{ ...base, level: finding.level, text, note }];
  });
}

/**
 * This function gives a room record with no opening and no outlet that has an error.
 * A room with an error does not give a full model, so the page shows and saves this record.
 */
export function shownRoom(room: Room, faults: readonly FeatureFault[]): Room {
  const bad = new Set(faults.filter((fault) => fault.level === "error").map((fault) => fault.id));
  if (bad.size === 0) return room;
  const { openings, outlets, ...rest } = room;
  return {
    ...rest,
    ...(openings === undefined ? {} : { openings: openings.filter((item) => !bad.has(item.id)) }),
    ...(outlets === undefined ? {} : { outlets: outlets.filter((item) => !bad.has(item.id)) }),
  };
}

/** The place of a feature along its wall, for the drawing. */
export interface FeatureSpan {
  /** The position of the wall, from 0. */
  readonly side: number;
  /** The key of the feature. */
  readonly key: string;
  readonly kind: FeatureKind;
  /** The name of the kind of the feature for the drawing, from `featureTag`. A point has the word of its collection, for example `outlet`. */
  readonly tag: string;
  /** The near edge of the feature, as a part of the length of the wall from its start: a number from 0 to 1. */
  readonly from: number;
  /** The far edge of the feature. A point has the value of `from`. */
  readonly to: number;
  /** The corner of the wall where the distance of the feature starts. */
  readonly corner: FeatureEnd;
  /** The level of the fault of the place of the feature. */
  readonly fault: "error" | "warning" | undefined;
}

/** This function gives the place of each feature that has its numbers, on a wall that has a length. */
export function featureSpans(draft: Draft, faults: readonly FeatureFault[], forms: readonly LayerForm[] = FORMS): readonly FeatureSpan[] {
  const part = (value: number): number => Math.min(Math.max(value, 0), 1);
  return placedFeatures(draft, forms).flatMap((item): FeatureSpan[] => {
    if (item.reading.state !== "ok" || !(item.wall > 0)) return [];
    const { start, width } = item.reading.numbers;
    const level = faults.find((fault) => fault.key === item.feature.key)?.level;
    return [
      {
        side: item.side,
        key: item.feature.key,
        kind: item.feature.kind,
        tag: featureTag(item.feature, forms),
        from: part(start / item.wall),
        to: part((start + width) / item.wall),
        corner: item.feature.from,
        fault: level === "error" || level === "warning" ? level : undefined,
      },
    ];
  });
}

/** A fault of an object, as a message. */
export interface ObjectFault {
  /** The position of the wall of the object, from 0. An object on a holder has the wall of the holder. */
  readonly side: number;
  /** The key of the object. */
  readonly key: string;
  /** The `id` of the record of the object. */
  readonly id: string;
  /** `typing` is a field that needs a value. `error` and `warning` are faults of the place of the object. */
  readonly level: "typing" | "error" | "warning";
  /** The field that needs a value. */
  readonly field?: ObjectField | undefined;
  /** The message with the name of the object and its wall or its holder, for the status of the page. */
  readonly text: string;
  /** The short message, for the place of the object in the form. */
  readonly note: string;
}

/** This function gives the words for a length of an object in a message. `held` is true for an object on a holder. */
function objectFieldWords(field: ObjectField, held: boolean): string {
  if (field === "offset") return held ? "distance from the edge" : "distance from the corner";
  if (field === "gap") return held ? "distance from the back" : "distance from the wall";
  return field === "lift" ? "height of the bottom" : field;
}

/** This function gives the two messages of a finding of the scene check about an object: the full message and the short message. */
function objectTexts(finding: Finding, name: string, where: string, others: ReadonlyMap<string, ListedObject>): readonly [text: string, note: string] {
  const label = `${name.slice(0, 1).toUpperCase()}${name.slice(1)}`;
  switch (finding.code) {
    case "object-outside":
      return [`${label} ${where} is not in the room.`, "It is not in the room. Examine its distances."];
    case "object-in-wall": {
      const number = /^wall-(\d+)$/.exec(finding.other ?? "")?.[1];
      const wall = number === undefined ? "a wall" : `wall ${number}`;
      return [`${label} ${where} is in the space of ${wall}.`, `It is in the space of ${wall}.`];
    }
    case "object-overlap": {
      const other = others.get(finding.other ?? "")?.words ?? "a different object";
      return [`${label} ${where} is in the space of ${other}.`, `It is in the space of ${other}.`];
    }
    default:
      return [`Examine the numbers of ${name} ${where}.`, "Examine its numbers."];
  }
}

/**
 * This function gives the faults of the objects of a draft, in the sequence of the form. An object has one fault at most.
 * The first field that needs a value comes before a fault of the place of the object, which the scene check finds.
 * The check tells the place of an object only in a room that closes. An object that waits for its wall or for its holder has no fault.
 */
export function objectFaults(draft: Draft, result: SurveyResult): readonly ObjectFault[] {
  const listed = listedObjects(draft);
  if (listed.length === 0) return [];
  const byId = new Map(listed.map((item) => [item.id, item]));
  const findings = new Map<string, Finding>();
  if (result.closure.closed && result.objects.length > 0) {
    for (const finding of checkScene({ schema: SCENE_SCHEMA, room: result.room, objects: result.objects })) {
      if (finding.record !== "object") continue;
      if (!findings.has(finding.at)) findings.set(finding.at, finding);
      // The check tells an overlap at one of its two objects. It is a fault of each of them.
      if (finding.code === "object-overlap" && finding.other !== undefined && !findings.has(finding.other)) findings.set(finding.other, { ...finding, at: finding.other, other: finding.at });
    }
  }
  return listed.flatMap((item): ObjectFault[] => {
    const { side, object, holder, id, reading } = item;
    const where = holder === undefined ? `on wall ${String(side + 1)}` : `on ${holder.words}`;
    const base = { side, key: object.key, id };
    if (reading.state !== "ok") {
      const words = objectFieldWords(reading.field, holder !== undefined);
      const field = reading.field;
      if (reading.state === "empty") return [{ ...base, level: "typing", field, text: `Type the ${words} of ${item.words} ${where}.`, note: `Type its ${words}.` }];
      const fault = reading.state === "bad" ? "is not a number" : "is 0";
      return [{ ...base, level: "typing", field, text: `The ${words} of ${item.words} ${where} ${fault}.`, note: `Its ${words} ${fault}.` }];
    }
    const finding = item.ready ? findings.get(id) : undefined;
    if (finding === undefined) return [];
    const [text, note] = objectTexts(finding, item.words, where, byId);
    return [{ ...base, level: finding.level, text, note }];
  });
}

/**
 * This function gives the objects for a shown room.
 * The page does not show an outlet with an error, so an object does not keep an outlet that the shown room does not have.
 */
export function shownObjects(room: Room, objects: readonly PlacedObject[]): readonly PlacedObject[] {
  const outlets = new Set((room.outlets ?? []).map((item) => item.id));
  return objects.map((object): PlacedObject => {
    const { outlet, ...rest } = object;
    return outlet === undefined || outlets.has(outlet) ? object : rest;
  });
}

/** An object of the survey record of a draft, for the drawing. */
export interface ObjectMark {
  /** The position of the wall of the object, from 0. An object on a holder has the wall of the holder. */
  readonly side: number;
  /** The key of the object. */
  readonly key: string;
  /** The `id` of the record of the object. */
  readonly id: string;
  readonly kind: string;
  /** The level of the object: 1 for an object against a wall, 2 for an object on such an object. */
  readonly level: number;
  /** The level of the fault of the place of the object. */
  readonly fault: "error" | "warning" | undefined;
}

/** This function gives each object that the survey record of a draft has. `faults` is the result of `objectFaults`. */
export function objectMarks(draft: Draft, faults: readonly ObjectFault[]): readonly ObjectMark[] {
  return listedObjects(draft).flatMap((item): ObjectMark[] => {
    if (!item.ready) return [];
    const level = faults.find((fault) => fault.key === item.object.key)?.level;
    return [{ side: item.side, key: item.object.key, id: item.id, kind: item.object.kind, level: item.level, fault: level === "error" || level === "warning" ? level : undefined }];
  });
}

/**
 * This function gives the message of the page about a draft and the result of its survey.
 * The message of a closed room tells the first fault of its features, or then the first fault of its objects.
 * `faults` is the result of `featureFaults`, and `objects` is the result of `objectFaults`.
 */
export function statusOf(draft: Draft, result: SurveyResult, faults?: readonly FeatureFault[], objects?: readonly ObjectFault[]): Status {
  const field = missing(draft);
  if (field !== undefined) return field;
  if (draft.sides.length < FEWEST_SIDES) return { level: "typing", title: "A room has 3 walls or more.", text: "Add the next wall of your walk." };
  const { closure } = result;
  const gap = lengthText(closure.gap, draft.mode);
  const part = rounded(closure.ratio * 100, 1);
  const percent = part === 0 ? "less than 0.1%" : `${String(part)}%`;
  if (closure.closed) {
    const fault = (faults ?? featureFaults(draft, result))[0];
    if (fault !== undefined) return { level: "closed", title: "The room closes.", text: fault.text, side: fault.side, feature: fault.key };
    const second = (objects ?? objectFaults(draft, result))[0];
    if (second !== undefined) return { level: "closed", title: "The room closes.", text: second.text, side: second.side, object: second.key };
    if (closure.ratio < NO_GAP) return { level: "closed", title: "The room closes.", text: "The walk ends exactly at its start." };
    // A gap that the page writes as 0 is too small for a tape measure.
    if (gap === lengthText(0, draft.mode)) return { level: "closed", title: "The room closes.", text: "The walk ends at its start." };
    return { level: "closed", title: "The room closes.", text: `The walk ends ${gap} from its start. This is ${percent} of its length, so the page shares the gap between the walls.` };
  }
  // The sum of the turns of a walk to the left is 360 degrees, and that of a walk to the right is -360 degrees.
  const toLeft = result.room.walls[0]?.side !== "left";
  const sum = closure.turn + (toLeft ? FULL : 0 - FULL);
  const measured = draft.sides.filter((side) => side.corner === "angle").length;
  const shared = measured > 0 && Math.abs(closure.turn) < STRAIGHT / 4;
  if (Math.abs(closure.turn) > TURN_NOISE && !shared) {
    return { level: "open", title: "The corners do not make a full turn.", text: `They make a turn of ${String(rounded(Math.abs(sum), 1))} degrees, and a room needs 360. Examine the corner after each wall.` };
  }
  return { level: "open", title: `The walk ends ${gap} from its start.`, text: `This is ${percent} of its length, and the limit is 1%. A length is wrong, or a wall is missing.` };
}

/** One end of a connection of the store: a door, a window or an opening of a room. */
export interface DraftEnd {
  /** The position of the room in the rooms of the store, from 0. */
  readonly room: number;
  /** The key of the feature in that room. */
  readonly feature: string;
}

/**
 * A connection of the store: one hole through the wall between two rooms, for example a door.
 * A person measures the hole in each room, so each of the two rooms has it as a feature.
 */
export interface DraftConnection {
  readonly from: DraftEnd;
  readonly to: DraftEnd;
}

/**
 * The rooms that the page keeps in the browser. This is version 2 of the store.
 * Version 1 had the electrical records in fields of its own. `parseStore` moves such a store to this version, and the move loses no number.
 */
export interface Store {
  readonly version: 2;
  readonly rooms: readonly Draft[];
  /** The connections between the rooms. A feature is an end of one connection at most. */
  readonly connections: readonly DraftConnection[];
  /**
   * The lists of the add-ons: the records that are not in a room, for example the circuits.
   * One record can have a use in different rooms, so the lists are not in a room. A collection has one list at most, and a list with no record is absent.
   */
  readonly lists: readonly DraftList[];
  /** The position of the room that the page shows. */
  readonly active: number;
}

/** This function gives a store with rooms, with no connection and with no list. */
export function storeOf(rooms: readonly Draft[], active = 0): Store {
  return { version: 2, rooms, connections: [], lists: [], active };
}

/**
 * The largest number of each part of a store.
 * The parts are the characters of a text, the walls, the features of a wall and the objects of a room.
 * The other parts are the levels of objects on objects, the rooms, the connections and the lists.
 * The last parts are the records of a list, the fields of a group of a record and the records that an object owns.
 * A larger store is not a store of this page.
 */
const LIMITS = { text: 80, sides: 200, features: 100, objects: 200, nesting: 4, rooms: 100, connections: 2000, lists: 50, records: 200, fields: 40, owned: 20 };

const isObject = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === "object" && value !== null && !Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === "string" && value.length <= LIMITS.text;
const isOneOf = <T extends string>(list: readonly T[], value: unknown): value is T => typeof value === "string" && list.some((item) => item === value);

function typedFrom(value: unknown): TypedLength | undefined {
  return isObject(value) && isText(value["value"]) && isText(value["inches"]) ? { value: value["value"], inches: value["inches"] } : undefined;
}

/** This function reads texts by name, and it gives them in their one form. A name or a text that is not valid gives `undefined`. */
function textsFrom(value: unknown): DraftTexts | undefined {
  if (!isObject(value)) return undefined;
  const entries = Object.entries(value);
  if (entries.length > LIMITS.fields) return undefined;
  const texts: [string, string][] = [];
  for (const [name, text] of entries) {
    if (!isName(name) || !isText(text)) return undefined;
    texts.push([name, text]);
  }
  return textsOf(texts);
}

/** This function reads a record of an add-on in a room. A record with no field is valid, and it stays as given. */
function ownedFrom(value: unknown): DraftOwned | undefined {
  if (!isObject(value)) return undefined;
  const { layer, collection } = value;
  const values = textsFrom(value["values"]);
  const records = textsFrom(value["records"]);
  const points = textsFrom(value["points"]);
  if (!isName(layer) || !isName(collection) || values === undefined || records === undefined || points === undefined) return undefined;
  return { layer, collection, values, records, points };
}

/** This function reads a record of a list of the store. */
function recordFrom(value: unknown): DraftRecord | undefined {
  if (!isObject(value)) return undefined;
  const { key } = value;
  const values = textsFrom(value["values"]);
  const records = textsFrom(value["records"]);
  return isText(key) && key !== "" && values !== undefined && records !== undefined ? { key, values, records } : undefined;
}

function featureFrom(value: unknown): DraftFeature | undefined {
  if (!isObject(value)) return undefined;
  const { key, kind, from } = value;
  const offset = typedFrom(value["offset"]);
  const width = typedFrom(value["width"]);
  const height = typedFrom(value["height"]);
  const sill = typedFrom(value["sill"]);
  if (!isText(key) || !isOneOf(FEATURE_KINDS, kind) || !isOneOf(FEATURE_ENDS, from)) return undefined;
  if (offset === undefined || width === undefined || height === undefined || sill === undefined) return undefined;
  // Only a point has a record of an add-on. A record on a different kind goes away.
  if (kind !== "point") return { key, kind, from, offset, width, height, sill };
  const point = ownedFrom(value["point"]);
  return point === undefined ? undefined : { key, kind, from, offset, width, height, sill, point };
}

function objectFrom(value: unknown, level: number): DraftObject | undefined {
  if (!isObject(value) || level > LIMITS.nesting) return undefined;
  const { key, kind, name, from, owns, holds } = value;
  const [offset, width, depth, height, gap, lift] = OBJECT_FIELDS.map((field) => typedFrom(value[field]));
  if (!isText(key) || !isText(kind) || !isText(name) || !isOneOf(FEATURE_ENDS, from)) return undefined;
  if (offset === undefined || width === undefined || depth === undefined || height === undefined || gap === undefined || lift === undefined) return undefined;
  if (!Array.isArray(owns) || owns.length > LIMITS.owned) return undefined;
  const records = owns.map((item: unknown) => ownedFrom(item));
  if (records.some((owned) => owned === undefined)) return undefined;
  if (!Array.isArray(holds) || holds.length > LIMITS.objects) return undefined;
  const list = holds.map((item: unknown) => objectFrom(item, level + 1));
  if (list.some((object) => object === undefined)) return undefined;
  return { key, kind, name, from, offset, width, depth, height, gap, lift, owns: records.filter((owned) => owned !== undefined), holds: list.filter((object) => object !== undefined) };
}

function sideFrom(value: unknown): DraftSide | undefined {
  if (!isObject(value)) return undefined;
  const { key, corner, angle } = value;
  const length = typedFrom(value["length"]);
  if (!isText(key) || length === undefined || !isOneOf(CORNERS, corner) || !isText(angle)) return undefined;
  // A room from before the features has no list of them.
  const given = value["features"] ?? [];
  if (!Array.isArray(given) || given.length > LIMITS.features) return undefined;
  const list = given.map(featureFrom);
  if (list.some((feature) => feature === undefined)) return undefined;
  // A room from before the furniture has no list of objects.
  const things = value["objects"] ?? [];
  if (!Array.isArray(things) || things.length > LIMITS.objects) return undefined;
  const objects = things.map((item: unknown) => objectFrom(item, 1));
  if (objects.some((object) => object === undefined)) return undefined;
  return { key, length, corner, angle, features: list.filter((feature) => feature !== undefined), objects: objects.filter((object) => object !== undefined) };
}

function draftFrom(value: unknown): Draft | undefined {
  if (!isObject(value)) return undefined;
  const { name, mode, sides } = value;
  const height = typedFrom(value["height"]);
  const thickness = typedFrom(value["thickness"]);
  if (!isText(name) || !isOneOf(LENGTH_MODES, mode) || height === undefined || thickness === undefined) return undefined;
  if (!Array.isArray(sides) || sides.length > LIMITS.sides) return undefined;
  const list = sides.map(sideFrom);
  const keys = new Set(list.map((side) => side?.key));
  // Each wall has its own key.
  if (list.some((side) => side === undefined) || keys.size !== list.length) return undefined;
  const walls = list.filter((side) => side !== undefined);
  // Each feature of the room has its own key.
  const features = walls.flatMap((side) => side.features.map((feature) => feature.key));
  if (new Set(features).size !== features.length) return undefined;
  // Each object of the room has its own key, and a room has a limited number of objects.
  const objects = walls.flatMap((side) => eachObject(side.objects));
  if (objects.length > LIMITS.objects || new Set(objects.map((object) => object.key)).size !== objects.length) return undefined;
  // A record keeps only the name of a point of its layer in the room.
  const layers = new Map(walls.flatMap((side) => side.features.flatMap((feature): [string, string][] => (feature.point === undefined ? [] : [[feature.key, feature.point.layer]]))));
  return withPointNames({ name, mode, height, thickness, sides: walls }, (layer, key) => layers.get(key) === layer);
}

/**
 * This function reads the lists of a store. A store from before the lists has none.
 * A list or a record that is not valid goes away, and the rooms stay. The second list of a collection goes away, and the second record of a key goes away too.
 * A list with no record goes away.
 */
function listsFrom(value: unknown): readonly DraftList[] {
  const given: readonly unknown[] = Array.isArray(value) ? value.slice(0, LIMITS.lists) : [];
  const keys = new Set<string>();
  const lists: DraftList[] = [];
  for (const item of given) {
    if (!isObject(item)) continue;
    const { layer, collection, records } = item;
    if (!isName(layer) || !isName(collection) || !Array.isArray(records)) continue;
    if (lists.some((list) => list.layer === layer && list.collection === collection)) continue;
    const listed: readonly unknown[] = records.slice(0, LIMITS.records);
    const kept: DraftRecord[] = [];
    for (const entry of listed) {
      const record = recordFrom(entry);
      if (record === undefined || keys.has(record.key)) continue;
      keys.add(record.key);
      kept.push(record);
    }
    if (kept.length > 0) lists.push({ layer, collection, records: kept });
  }
  return lists;
}

/** This function gives the layer of each record of the lists, by the key of the record. */
function layersOf(lists: readonly DraftList[]): ReadonlyMap<string, string> {
  return new Map(lists.flatMap((list) => list.records.map((record): [string, string] => [record.key, list.layer])));
}

/**
 * This function gives a new key to each name of a record in the records of the lists.
 * `keyOf` gets the layer of the list that has the name, and the old key. A name with no new key goes away.
 */
function renamedLists(lists: readonly DraftList[], keyOf: (layer: string, key: string) => string | undefined): readonly DraftList[] {
  return lists.map((list) => {
    const records = list.records.map((record) => {
      const names = renamedTexts(record.records, (key) => keyOf(list.layer, key));
      return names === record.records ? record : { ...record, records: names };
    });
    return records.every((record, index) => record === list.records[index]) ? list : { ...list, records };
  });
}

/**
 * This function reads the store from its text. A text that is not a store of this page gives `undefined`, and the page starts again.
 * A store of version 1 moves to version 2 first, and then the function examines the result. Thus the two versions have one set of rules.
 */
export function parseStore(text: string | null): Store | undefined {
  if (text === null) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (!isObject(value)) return undefined;
  const current = value["version"] === 1 ? storeFromV1(value) : value;
  if (current["version"] !== 2) return undefined;
  const { rooms, active } = current;
  if (!Array.isArray(rooms) || rooms.length === 0 || rooms.length > LIMITS.rooms) return undefined;
  const list = rooms.map(draftFrom);
  if (list.some((room) => room === undefined)) return undefined;
  if (typeof active !== "number" || !Number.isInteger(active) || active < 0 || active >= list.length) return undefined;
  const drafts = list.filter((room) => room !== undefined);
  const read = listsFrom(current["lists"]);
  // A record keeps only the name of a record of a list of its layer.
  const layers = layersOf(read);
  const keyOf = (layer: string, key: string): string | undefined => (layers.get(key) === layer ? key : undefined);
  const keyed = drafts.map((room) => withRecordNames(room, keyOf));
  // A store from before the connections has no list of them. A connection that the rooms cannot have goes away, and the rooms stay.
  const given: readonly unknown[] = Array.isArray(current["connections"]) ? current["connections"].slice(0, LIMITS.connections) : [];
  const connections = given.flatMap((item): DraftConnection[] => {
    const from = isObject(item) ? endFrom(item["from"]) : undefined;
    const to = isObject(item) ? endFrom(item["to"]) : undefined;
    return from === undefined || to === undefined ? [] : [{ from, to }];
  });
  return { version: 2, rooms: keyed, connections: validConnections(keyed, connections), lists: renamedLists(read, keyOf), active };
}

function endFrom(value: unknown): DraftEnd | undefined {
  if (!isObject(value)) return undefined;
  const { room, feature } = value;
  return typeof room === "number" && Number.isInteger(room) && room >= 0 && isText(feature) ? { room, feature } : undefined;
}

/**
 * This function gives the door, the window or the opening at an end of a connection.
 * An end with no room or with no feature gives `undefined`. A point is not a hole, so it gives `undefined` too.
 */
export function featureAt(rooms: readonly Draft[], end: DraftEnd): DraftFeature | undefined {
  const room = rooms[end.room];
  const feature = room === undefined ? undefined : featureOf(room, end.feature);
  return feature === undefined || feature.kind === "point" ? undefined : feature;
}

const endKey = (end: DraftEnd): string => `${String(end.room)}:${end.feature}`;

/**
 * This function gives the connections that the rooms can have, in their sequence.
 * Each end of such a connection is a door, a window or an opening, and its two rooms are different.
 * A feature has one connection at most: its first connection stays. The function gives the same list when each connection stays.
 */
export function validConnections(rooms: readonly Draft[], connections: readonly DraftConnection[]): readonly DraftConnection[] {
  const used = new Set<string>();
  const valid = connections.filter(({ from, to }) => {
    if (from.room === to.room || featureAt(rooms, from) === undefined || featureAt(rooms, to) === undefined) return false;
    if (used.has(endKey(from)) || used.has(endKey(to))) return false;
    used.add(endKey(from));
    used.add(endKey(to));
    return true;
  });
  return valid.length === connections.length ? connections : valid;
}

/** This function gives the other end of the connection of a feature. A feature with no connection gives `undefined`. */
export function joinedTo(store: Store, end: DraftEnd): DraftEnd | undefined {
  const key = endKey(end);
  for (const { from, to } of store.connections) {
    if (endKey(from) === key) return to;
    if (endKey(to) === key) return from;
  }
  return undefined;
}

/**
 * This function joins the feature at `from` to the feature at `to`: the two features are one hole.
 * The old connection of each of the two features goes away. With no `to`, the feature at `from` has no connection.
 * A connection that the rooms cannot have does not go into the store.
 */
export function withConnection(store: Store, from: DraftEnd, to?: DraftEnd): Store {
  const ends = new Set([endKey(from), ...(to === undefined ? [] : [endKey(to)])]);
  const kept = store.connections.filter((item) => !ends.has(endKey(item.from)) && !ends.has(endKey(item.to)));
  if (to === undefined) return kept.length === store.connections.length ? store : { ...store, connections: kept };
  return { ...store, connections: validConnections(store.rooms, [...kept, { from, to }]) };
}

/** This function replaces the room at a position. A connection of a feature that the new room does not have goes away. */
export function withRoom(store: Store, index: number, room: Draft): Store {
  if (store.rooms[index] === undefined) return store;
  const rooms = store.rooms.map((item, position) => (position === index ? room : item));
  return { ...store, rooms, connections: validConnections(rooms, store.connections) };
}

/** This function gives the text of a store. */
export function storeText(store: Store): string {
  return JSON.stringify(store);
}

/**
 * This function gives the name of the file of a room.
 * The name has the letters and digits of the name of the room in small letters, with a hyphen between the words.
 */
export function fileName(draft: Draft, kind: "survey" | "room"): string {
  const words = nameWords(draft.name);
  return `${words.length === 0 ? "room" : words.join("-")}.${kind}.json`;
}

/** This function gives the words of a name in small letters: each group of letters and digits. */
export function nameWords(name: string): readonly string[] {
  return name.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

/**
 * This function gives an `id` for each name: the words of the name with a hyphen between them.
 * A name with no words gets the kind and its number, for example `room-3`. A second name with the same words gets a number at the end.
 */
export function idsOf(names: readonly string[], kind: string): readonly string[] {
  const taken = new Set<string>();
  return names.map((name, index) => {
    const words = nameWords(name);
    const base = words.length === 0 ? `${kind}-${String(index + 1)}` : words.join("-");
    let id = base;
    for (let count = 2; taken.has(id); count += 1) id = `${base}-${String(count)}`;
    taken.add(id);
    return id;
  });
}

/** The largest number of rooms of a store. */
export const MOST_ROOMS: number = LIMITS.rooms;

/** The largest number of levels of objects: an object against a wall is level 1, and an object on it is level 2. */
export const MOST_LEVELS: number = LIMITS.nesting;

/** The largest number of objects of a room, with the objects that other objects hold. */
export const MOST_OBJECTS: number = LIMITS.objects;

/** The largest number of records of a list of a store, for example of circuits. */
export const MOST_RECORDS: number = LIMITS.records;

/** The largest number of records that one object owns. */
export const MOST_OWNED: number = LIMITS.owned;

/** The largest number of circuits of a store. */
export const MOST_CIRCUITS: number = LIMITS.records;

/** The largest number of characters of a text of a store, for example of a name. */
export const MOST_TEXT: number = LIMITS.text;

/** This function gives the name of a room in the list of the rooms: its name, or its number when it has no name. */
export function roomName(draft: Draft, index: number): string {
  const name = draft.name.trim();
  return name === "" ? `Room ${String(index + 1)}` : name;
}

/** The state of a room in the list of the rooms. The state `fault` is a closed room with a fault of a feature or of an object. */
export type RoomState = StatusLevel | "fault";

/** This function tells if a status is the status of a closed room with a fault of a feature or of an object. */
export function hasFault(status: Status): boolean {
  return status.level === "closed" && (status.feature !== undefined || status.object !== undefined);
}

/** This function gives the state of a room from its status. */
export function roomState(status: Status): RoomState {
  return hasFault(status) ? "fault" : status.level;
}

/**
 * This function adds a room at the end of the rooms of a store, and the store shows it.
 * The example room is not a room of the visitor, so a store with only the example room gets the new room in its place.
 * With `overEmpty`, the same rule applies to a store with only an empty room. A store with the largest number of rooms does not change.
 */
export function withNewRoom(store: Store, room: Draft, overEmpty = false): Store {
  return withNewRooms(store, [room], [], overEmpty);
}

/**
 * This function adds rooms at the end of the rooms of a store, with the connections between them. The store shows the first new room.
 * The position of a room in an end of `connections` is its position in `rooms`.
 * The rules of `withNewRoom` apply. A store that cannot keep each new room does not change.
 *
 * `lists` has the records of the lists that the new rooms name, for example their circuits.
 * These records go at the end of the lists of the store with new keys, and the records of the new rooms keep them.
 * A record of a new room does not keep the name of a record that is not in `lists`. A store that cannot keep each new record does not change.
 */
export function withNewRooms(store: Store, rooms: readonly Draft[], connections: readonly DraftConnection[], overEmpty = false, lists: readonly DraftList[] = []): Store {
  if (rooms.length === 0) return store;
  const only = store.rooms.length === 1 ? store.rooms[0] : undefined;
  const fresh = only !== undefined && (isExample(only) || (overEmpty && sameDraft(only, emptyDraft(only.mode))));
  const before = fresh ? [] : store.rooms;
  if (before.length + rooms.length > LIMITS.rooms) return store;
  const joined = joinedLists(store.lists, lists);
  if (joined === undefined) return store;
  const all = [...before, ...rooms.map((room) => withRecordNames(room, joined.keyOf))];
  const moved = connections.map(({ from, to }): DraftConnection => ({ from: { ...from, room: from.room + before.length }, to: { ...to, room: to.room + before.length } }));
  return { ...store, rooms: all, connections: validConnections(all, [...(fresh ? [] : store.connections), ...moved]), lists: joined.lists, active: before.length };
}

/**
 * This function gives a store with the example room of this page.
 * A browser can keep the example room of the page from before the furniture. A store with only that room gets the example room with its furniture.
 * Each other store does not change.
 */
export function withExample(store: Store): Store {
  const only = store.rooms.length === 1 ? store.rooms[0] : undefined;
  if (only === undefined || !isExample(only)) return store;
  const example = exampleDraft(only.mode);
  return sameDraft(only, example) ? store : { ...store, rooms: [example], connections: [], active: 0 };
}

/**
 * This function removes the room at a position, with its connections. The store then shows the room that follows, or the last room.
 * A store has one room or more, so the only room of a store becomes an empty room.
 */
export function withoutRoom(store: Store, index: number): Store {
  const room = store.rooms[index];
  if (room === undefined) return store;
  if (store.rooms.length === 1) return { ...store, rooms: [emptyDraft(room.mode)], connections: [], active: 0 };
  const rooms = store.rooms.filter((_, position) => position !== index);
  const active = store.active > index ? store.active - 1 : Math.min(store.active, rooms.length - 1);
  // Each room after the removed room moves one position.
  const moved = (end: DraftEnd): DraftEnd => (end.room > index ? { ...end, room: end.room - 1 } : end);
  const connections = store.connections.filter(({ from, to }) => from.room !== index && to.room !== index).map(({ from, to }): DraftConnection => ({ from: moved(from), to: moved(to) }));
  return { ...store, rooms, connections, active };
}

/** This function shows the room at a position. A position with no room gives the same store. */
export function withActive(store: Store, index: number): Store {
  return store.rooms[index] === undefined || index === store.active ? store : { ...store, active: index };
}

/** This function gives the largest number in the keys of a list, for example 3 for the keys `c1` and `c3`. A list with no number gives 0. */
function lastNumber(list: readonly { readonly key: string }[]): number {
  return Math.max(0, ...list.map((item) => Number(item.key.slice(1))).filter((value) => Number.isInteger(value)));
}

/** This function gives each record of the lists of a store. */
function allRecords(lists: readonly DraftList[]): readonly DraftRecord[] {
  return lists.flatMap((list) => list.records);
}

/** This function gives the records of a list of a store, in their sequence. A store with no such list gives no record. */
export function listRecords(store: Store, layer: string, collection: string): readonly DraftRecord[] {
  return store.lists.find((list) => list.layer === layer && list.collection === collection)?.records ?? [];
}

/**
 * This function adds a record with no fields at the end of a list of a store. The record gets a key that no record of the store has.
 * A collection with no list gets one. A list with the largest number of records does not change, and a store with the largest number of lists gets no list.
 */
export function withNewRecord(store: Store, layer: string, collection: string): Store {
  const record = recordOf(`r${String(lastNumber(allRecords(store.lists)) + 1)}`);
  const list = store.lists.find((item) => item.layer === layer && item.collection === collection);
  if (list === undefined) {
    if (store.lists.length >= LIMITS.lists || !isName(layer) || !isName(collection)) return store;
    return { ...store, lists: [...store.lists, { layer, collection, records: [record] }] };
  }
  if (list.records.length >= LIMITS.records) return store;
  return { ...store, lists: store.lists.map((item) => (item === list ? { ...list, records: [...list.records, record] } : item)) };
}

/** This function changes the fields of the record with a key in the lists of a store. An empty text removes its field. A store with no change stays the same store. */
export function withRecord(store: Store, key: string, change: Partial<DraftFields>): Store {
  const lists = store.lists.map((list) => {
    const records = list.records.map((record) => {
      if (record.key !== key) return record;
      const values = mergedTexts(record.values, change.values);
      const names = mergedTexts(record.records, change.records);
      return values === record.values && names === record.records ? record : { key: record.key, values, records: names };
    });
    return records.every((record, index) => record === list.records[index]) ? list : { ...list, records };
  });
  return lists.every((list, index) => list === store.lists[index]) ? store : { ...store, lists };
}

/**
 * This function removes the record with a key from the lists of a store. No record of a room and no record of a list keeps its name.
 * A list that loses its last record goes away. A store with no such record stays the same store.
 */
export function withoutRecord(store: Store, key: string): Store {
  if (!allRecords(store.lists).some((record) => record.key === key)) return store;
  const keyOf = (_: string, name: string): string | undefined => (name === key ? undefined : name);
  const kept = store.lists.map((list) => ({ ...list, records: list.records.filter((record) => record.key !== key) })).filter((list) => list.records.length > 0);
  return { ...store, lists: renamedLists(kept, keyOf), rooms: store.rooms.map((room) => withRecordNames(room, keyOf)) };
}

/** This function gives each record of an add-on in a draft: the record of each point, then the records that each object owns. */
function ownedRecords(draft: Draft): readonly DraftOwned[] {
  return [
    ...draft.sides.flatMap((side) => side.features.flatMap((feature) => (feature.point === undefined ? [] : [feature.point]))),
    ...draft.sides.flatMap((side) => eachObject(side.objects).flatMap((object) => object.owns)),
  ];
}

/** The use of one record of a list in the rooms of a store. */
export interface RecordUse {
  /** The number of the records of the rooms that name the record. */
  readonly records: number;
  /** The number of the rooms with one or more such records. */
  readonly rooms: number;
}

/** This function counts the records of the rooms that name the record with a key, and the rooms that have them. */
export function recordUse(store: Store, key: string): RecordUse {
  const counts = store.rooms.map((room) => ownedRecords(room).filter((owned) => Object.values(owned.records).includes(key)).length);
  return { records: counts.reduce((sum, count) => sum + count, 0), rooms: counts.filter((count) => count > 0).length };
}

/** The lists of a store after new records come in. */
interface JoinedLists {
  readonly lists: readonly DraftList[];
  /** This function gives the new key of a record that came in, from its layer and its old key. A record that did not come in gives `undefined`. */
  readonly keyOf: (layer: string, key: string) => string | undefined;
}

/**
 * This function puts the records of new lists at the end of the lists of a store. A collection with no list gets one.
 * Each new record gets a key that no record of the store has, and the names in the new records follow the new keys.
 * The second new record of a key does not come in. A store that cannot keep each new record gives `undefined`.
 */
function joinedLists(present: readonly DraftList[], added: readonly DraftList[]): JoinedLists | undefined {
  let last = lastNumber(allRecords(present));
  const fresh = new Map<string, { readonly layer: string; readonly key: string }>();
  const coming = added.map((list) => {
    const records: DraftRecord[] = [];
    for (const record of list.records) {
      if (fresh.has(record.key)) continue;
      last += 1;
      fresh.set(record.key, { layer: list.layer, key: `r${String(last)}` });
      records.push(record);
    }
    return { list, records };
  });
  const keyOf = (layer: string, key: string): string | undefined => {
    const found = fresh.get(key);
    return found?.layer === layer ? found.key : undefined;
  };
  const lists: DraftList[] = [...present];
  for (const { list, records } of coming) {
    if (records.length === 0) continue;
    const renamed = records.map((record): DraftRecord => ({ key: keyOf(list.layer, record.key) ?? record.key, values: record.values, records: renamedTexts(record.records, (key) => keyOf(list.layer, key)) }));
    const at = lists.findIndex((item) => item.layer === list.layer && item.collection === list.collection);
    const before = lists[at];
    if (before === undefined) lists.push({ layer: list.layer, collection: list.collection, records: renamed });
    else lists[at] = { ...before, records: [...before.records, ...renamed] };
  }
  if (lists.length > LIMITS.lists || lists.some((list) => list.records.length > LIMITS.records)) return undefined;
  return { lists, keyOf };
}

// The electrical records of the page.
//
// This section is a shortcut. A survey record and a level record have no layers yet, and the page still has inputs of its own for the outlets and the circuits.
// Thus the page reads and writes the electrical records of the store by the names of `ELECTRICAL`, through the functions of this section.
// The section goes away when the page makes its inputs from the forms of the add-ons, and a record gets its electrical data from the layer of the form.

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

/** This function gives the record of the point of an outlet, with the key of its circuit or with no circuit. */
function outletPoint(circuit: string | undefined): DraftOwned {
  return ownedOf(ELECTRICAL.layer, ELECTRICAL.outlets, circuit === undefined ? {} : { records: { [ELECTRICAL.circuit]: circuit } });
}

/** This function gives the records that an object owns for its power from the outlet with a key. An empty key gives no record. */
function feedOwns(outlet: string): readonly DraftOwned[] {
  return outlet === "" ? [] : [ownedOf(ELECTRICAL.layer, ELECTRICAL.feeds, { points: { [ELECTRICAL.outlet]: outlet } })];
}

/** This function gives the outlet with a key the circuit with the key `circuit`. The empty key is a circuit that is not known. A feature that is not an outlet does not change. */
export function withOutletCircuit(draft: Draft, key: string, circuit: string): Draft {
  const feature = featureOf(draft, key);
  return feature !== undefined && isOutlet(feature) ? withPoint(draft, key, { records: { [ELECTRICAL.circuit]: circuit } }) : draft;
}

/** This function gives the object with a key its power from the outlet with the key `outlet`. The empty key is no outlet. */
export function withObjectOutlet(draft: Draft, key: string, outlet: string): Draft {
  return withOwned(draft, key, ELECTRICAL.layer, ELECTRICAL.feeds, { points: { [ELECTRICAL.outlet]: outlet } });
}

/**
 * A circuit of the store: one breaker of the electrical panel. It gives power to outlets.
 * `breaker` is the rating of the breaker in amperes, and `voltage` is its voltage in volts, as a person typed them.
 */
export interface DraftCircuit {
  /** The key of the circuit in the page. Each record of a store has its own key. */
  readonly key: string;
  readonly name: string;
  readonly breaker: string;
  readonly voltage: string;
}

/** The fields of a circuit of the page, in the sequence of the form. */
const CIRCUIT_FIELDS: readonly ["name", "breaker", "voltage"] = ["name", "breaker", "voltage"];

/** This function gives the values of a record of the list of the circuits for fields of a circuit of the page. */
function circuitValues(fields: Partial<Omit<DraftCircuit, "key">>): DraftTexts {
  return Object.fromEntries(
    CIRCUIT_FIELDS.flatMap((field): [string, string][] => {
      const text = fields[field];
      return text === undefined ? [] : [[ELECTRICAL[field], text]];
    }),
  );
}

/** This function gives the circuits of a store: the records of the list of the circuits. A field with no text gives an empty text. */
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

/** This function gives the lists of a store for circuits of the page. No circuit gives no list. */
export function circuitLists(circuits: readonly DraftCircuit[]): readonly DraftList[] {
  if (circuits.length === 0) return [];
  return [{ layer: ELECTRICAL.layer, collection: ELECTRICAL.circuits, records: circuits.map((circuit) => recordOf(circuit.key, { values: circuitValues(circuit) })) }];
}

/** This function tells if a store has a circuit with a key. */
function hasCircuit(store: Store, key: string): boolean {
  return listRecords(store, ELECTRICAL.layer, ELECTRICAL.circuits).some((record) => record.key === key);
}

/** This function adds a circuit with no name and no numbers at the end of the circuits of a store. A store with the largest number of circuits does not change. */
export function withNewCircuit(store: Store): Store {
  return withNewRecord(store, ELECTRICAL.layer, ELECTRICAL.circuits);
}

/** This function changes the fields of the circuit with a key. A store with no such circuit does not change. */
export function withCircuit(store: Store, key: string, change: Partial<Omit<DraftCircuit, "key">>): Store {
  return hasCircuit(store, key) ? withRecord(store, key, { values: circuitValues(change) }) : store;
}

/** This function removes the circuit with a key. No outlet of a room keeps it. */
export function withoutCircuit(store: Store, key: string): Store {
  return hasCircuit(store, key) ? withoutRecord(store, key) : store;
}

/** The outlets of one circuit in the rooms of a store. */
export interface CircuitUse {
  /** The number of the outlets of the circuit. */
  readonly outlets: number;
  /** The number of the rooms with one or more outlets of the circuit. */
  readonly rooms: number;
}

/** This function counts the outlets of the circuit with a key, and the rooms that have them. */
export function circuitUse(store: Store, key: string): CircuitUse {
  const use = recordUse(store, key);
  return { outlets: use.records, rooms: use.rooms };
}
