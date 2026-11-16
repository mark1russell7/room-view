import {
  checkRoom,
  metersPer,
  SURVEY_SCHEMA,
  type Finding,
  type LengthUnit,
  type Opening,
  type Room,
  type Survey,
  type SurveyOutlet,
  type SurveyResult,
  type SurveyTurn,
} from "@mark1russell7/room-view";

// The draft of the page "Measure a room": the text of each field, as a person typed it.
// Each function of this file is pure, so the tests need no browser.

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

/** These are the kinds of a feature of a wall: a door, a window, an opening with no door, or an outlet. */
export const FEATURE_KINDS: readonly ["door", "window", "gap", "outlet"] = ["door", "window", "gap", "outlet"];

/** A kind of feature. */
export type FeatureKind = (typeof FEATURE_KINDS)[number];

/** The name of each kind of feature. */
export const FEATURE_NAMES: Readonly<Record<FeatureKind, string>> = { door: "Door", window: "Window", gap: "Opening", outlet: "Outlet" };

/** The word for each kind of feature in an `id` and in a message. */
const FEATURE_WORDS: Readonly<Record<FeatureKind, string>> = { door: "door", window: "window", gap: "opening", outlet: "outlet" };

/** These are the corners of a wall where a distance along the wall can start: its start and its end. */
export const FEATURE_ENDS: readonly ["start", "end"] = ["start", "end"];

/** A corner of a wall. */
export type FeatureEnd = (typeof FEATURE_ENDS)[number];

/** These are the lengths of a feature. */
export const FEATURE_FIELDS: readonly ["offset", "width", "height", "sill"] = ["offset", "width", "height", "sill"];

/** A length of a feature. */
export type FeatureField = (typeof FEATURE_FIELDS)[number];

/**
 * A feature of a wall of the draft: a door, a window, an opening or an outlet.
 *
 * `offset` is the distance from a corner of the wall to the near edge of an opening, or to the center of an outlet.
 * `height` is the height of an opening, or the height of the center of an outlet above the floor.
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
}

/** This function gives the lengths that a kind of feature has, in the sequence of the form. */
export function fieldsOf(kind: FeatureKind): readonly FeatureField[] {
  if (kind === "outlet") return ["offset", "height"];
  return kind === "window" ? ["offset", "width", "sill", "height"] : ["offset", "width", "height"];
}

/** One wall of the draft, and the corner at its end. */
export interface DraftSide {
  /** The key of the wall in the page. It stays when a person removes a different wall. */
  readonly key: string;
  readonly length: TypedLength;
  readonly corner: Corner;
  /** The angle of a measured corner in degrees, as text. The angle is inside the room, between the two walls. */
  readonly angle: string;
  /** The doors, the windows, the openings and the outlets of the wall. */
  readonly features: readonly DraftFeature[];
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
type System = "imperial" | "metric";

function systemOf(mode: LengthMode): System {
  return mode === "ft-in" || mode === "in" ? "imperial" : "metric";
}

/**
 * The usual lengths of a feature, in meters. `door` is the height of a door or an opening, and `window` is the height of a window.
 * `sill` is the height of the bottom of a window above the floor, and `outlet` is the height of an outlet above the floor.
 * The imperial numbers are 80 in, 48 in, 36 in and 12 in.
 */
const USUAL_FEATURE: Readonly<Record<System, { readonly door: number; readonly window: number; readonly sill: number; readonly outlet: number }>> = {
  imperial: { door: 2.032, window: 1.2192, sill: 0.9144, outlet: 0.3048 },
  metric: { door: 2.03, window: 1.2, sill: 0.9, outlet: 0.3 },
};

/**
 * This function gives the usual value of a length of a feature in the unit of a mode. The page uses it when the field has no text.
 * The distance from the corner and the width have no usual value.
 */
export function usualOf(kind: FeatureKind, field: FeatureField, mode: LengthMode): number | undefined {
  const usual = USUAL_FEATURE[systemOf(mode)];
  let meters: number | undefined;
  if (field === "sill" && kind === "window") meters = usual.sill;
  if (field === "height") meters = kind === "outlet" ? usual.outlet : kind === "window" ? usual.window : usual.door;
  return meters === undefined ? undefined : rounded(meters / metersPer(unitOf(mode)), 6);
}

/** The numbers of a feature, in the unit of the mode. */
export interface FeatureNumbers {
  /** The distance from the start of the wall to the near edge of an opening, or to the center of an outlet. */
  readonly start: number;
  /** The width of an opening. An outlet has 0. */
  readonly width: number;
  /** The height of an opening, or the height of the center of an outlet above the floor. */
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
export function readFeature(feature: DraftFeature, wallLength: number, mode: LengthMode): FeatureReading {
  const numbers = { offset: 0, width: 0, height: 0, sill: 0 };
  for (const field of fieldsOf(feature.kind)) {
    const reading = readLength(feature[field], mode);
    if (reading.state === "bad") return { state: "bad", field };
    const value = reading.state === "ok" ? reading.value : usualOf(feature.kind, field, mode);
    if (value === undefined) return { state: "empty", field };
    // An opening has a width and a height above 0. An outlet can be at the floor.
    if (value === 0 && (field === "width" || (field === "height" && feature.kind !== "outlet"))) return { state: "zero", field };
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
  /** The number of the feature in the features of its kind, in the sequence of the walk, from 1. */
  readonly number: number;
  /** The `id` of the record of the feature: the word of its kind and its number, for example `door-2`. */
  readonly id: string;
  /** The length of the wall in the unit of the mode. A wall with no valid length has 0. */
  readonly wall: number;
  readonly reading: FeatureReading;
}

/** This function gives each feature of a draft, in the sequence of the walk. */
export function placedFeatures(draft: Draft): readonly PlacedFeature[] {
  const counts = new Map<FeatureKind, number>();
  return draft.sides.flatMap((side, index) => {
    const length = readLength(side.length, draft.mode);
    const wall = length.state === "ok" ? length.value : 0;
    return side.features.map((feature): PlacedFeature => {
      const number = (counts.get(feature.kind) ?? 0) + 1;
      counts.set(feature.kind, number);
      return { side: index, feature, number, id: `${FEATURE_WORDS[feature.kind]}-${String(number)}`, wall, reading: readFeature(feature, wall, draft.mode) };
    });
  });
}

/**
 * This function makes the survey record of a draft. It is total: a length with no valid number counts as 0.
 * A height or a thickness with no valid number gets a usual value.
 * The record has each feature that has its numbers, on a wall that has a length.
 */
export function surveyOf(draft: Draft): Survey {
  const name = draft.name.trim();
  const toRight = walksRight(draft.sides);
  const openings: Opening[] = [];
  const outlets: SurveyOutlet[] = [];
  for (const item of placedFeatures(draft)) {
    if (item.reading.state !== "ok" || !(item.wall > 0)) continue;
    const { start, width, height, sill } = item.reading.numbers;
    const wall = wallId(item.side);
    if (item.feature.kind === "outlet") outlets.push({ id: item.id, wall, offset: start, height });
    else openings.push({ id: item.id, wall, kind: item.feature.kind, offset: start, width, ...(sill > 0 ? { sill } : {}), height });
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
    ...(outlets.length === 0 ? {} : { outlets }),
  };
}

/** This function gives the way to type a length that fits the unit of a survey record. */
function modeOf(unit: LengthUnit): LengthMode {
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
 * This function makes the draft of a survey record. It reads the name, the height, the thickness, the sides, the openings and the outlets.
 * The features of a wall are in the sequence of their distances from its start. The draft has no circuits and no checks.
 */
export function draftOf(survey: Survey): Draft {
  const mode = modeOf(survey.unit);
  const factor = metersPer(survey.unit) / metersPer(unitOf(mode));
  const typed = (value: number): TypedLength => (Number.isFinite(value) && value > 0 ? typedOf(value * factor, mode) : NO_TEXT);
  /** A distance or a height can be 0. */
  const typedFrom0 = (value: number): TypedLength => (Number.isFinite(value) && value >= 0 ? typedOf(value * factor, mode) : NO_TEXT);
  // The turns of a walk to the right make a negative sum.
  const toRight = survey.sides.reduce((sum, side) => sum + degreesOf(side.turn), 0) < 0;
  const seen = new Set<string>();
  let count = 0;
  return {
    name: survey.name ?? "",
    mode,
    height: typed(survey.height),
    thickness: typed(survey.wallThickness),
    sides: survey.sides.map((side, index) => {
      // A survey gives the features of an `id` to the first side with that `id`.
      const first = !seen.has(side.id);
      seen.add(side.id);
      const openings = first ? (survey.openings ?? []).filter((item) => item.wall === side.id) : [];
      const outlets = first ? (survey.outlets ?? []).filter((item) => item.wall === side.id) : [];
      const features = [
        ...openings.map((item) => ({
          at: item.offset,
          kind: item.kind,
          offset: typedFrom0(item.offset),
          width: typed(item.width),
          height: typed(item.height),
          sill: item.kind === "window" ? typedFrom0(item.sill ?? 0) : NO_TEXT,
        })),
        ...outlets.map((item) => ({ at: item.offset, kind: "outlet" as const, offset: typedFrom0(item.offset), width: NO_TEXT, height: typedFrom0(item.height), sill: NO_TEXT })),
      ].sort((a, b) => a.at - b.at);
      return {
        key: `s${String(index + 1)}`,
        length: typed(side.length),
        corner: typeof side.turn === "number" ? "angle" : side.turn,
        angle: typeof side.turn === "number" && Number.isFinite(side.turn) ? angleText(side.turn, toRight) : "",
        features: features.map(({ kind, offset, width, height, sill }): DraftFeature => {
          count += 1;
          return { key: `f${String(count)}`, kind, from: "start", offset, width, height, sill };
        }),
      };
    }),
  };
}

/**
 * This function tells if a survey record has data that a draft does not keep.
 * This data is the circuits, the checks, the circuit of an outlet, and the height or the thickness of one side.
 * It is also the bottom of a door above the floor, and a feature on a wall that the survey does not have.
 */
export function hasMore(survey: Survey): boolean {
  const walls = new Set(survey.sides.map((side) => side.id));
  return (
    (survey.circuits ?? []).length > 0 ||
    (survey.checks ?? []).length > 0 ||
    survey.sides.some((side) => side.thickness !== undefined || side.height !== undefined) ||
    (survey.openings ?? []).some((item) => !walls.has(item.wall) || (item.kind !== "window" && (item.sill ?? 0) !== 0)) ||
    (survey.outlets ?? []).some((item) => !walls.has(item.wall) || item.circuit !== undefined)
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
const EXAMPLE_FEATURES: Readonly<Record<System, readonly (readonly [side: number, kind: FeatureKind, lengths: Partial<Readonly<Record<FeatureField, number>>>])[]>> = {
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

function draftWith(mode: LengthMode, lengths: (meters: number) => TypedLength): Draft {
  const example = EXAMPLE[systemOf(mode)];
  return {
    name: "",
    mode,
    height: typedOf(example.height / metersPer(unitOf(mode)), mode),
    thickness: typedOf(example.thickness / metersPer(unitOf(mode)), mode),
    sides: example.sides.map((meters, index) => ({ key: `s${String(index + 1)}`, length: lengths(meters), corner: "left", angle: "", features: [] })),
  };
}

/**
 * This function gives the example room: four walls with square corners, a door, a window and an outlet.
 * A person types the numbers of a real room over it.
 */
export function exampleDraft(mode: LengthMode): Draft {
  const typed = (meters: number | undefined): TypedLength => (meters === undefined ? NO_TEXT : typedOf(meters / metersPer(unitOf(mode)), mode));
  const draft = draftWith(mode, typed);
  const features = EXAMPLE_FEATURES[systemOf(mode)];
  return {
    ...draft,
    sides: draft.sides.map((side, index) => ({
      ...side,
      features: features.flatMap(([at, kind, lengths], position): DraftFeature[] =>
        at === index ? [{ key: `f${String(position + 1)}`, kind, from: "start", offset: typed(lengths.offset), width: typed(lengths.width), height: typed(lengths.height), sill: typed(lengths.sill) }] : [],
      ),
    })),
  };
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
  return {
    ...draft,
    mode,
    height: convert(draft.height),
    thickness: convert(draft.thickness),
    sides: draft.sides.map((side) => ({ ...side, length: convert(side.length), features: side.features.map(feature) })),
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
  return { ...draft, sides: [...draft.sides, { key: freeKey(draft), length: NO_TEXT, corner, angle: "", features: [] }] };
}

/** This function removes the wall with a key. */
export function withoutSide(draft: Draft, key: string): Draft {
  return { ...draft, sides: draft.sides.filter((side) => side.key !== key) };
}

/** This function changes the fields of the wall with a key. */
export function withSide(draft: Draft, key: string, change: Partial<Omit<DraftSide, "key">>): Draft {
  return { ...draft, sides: draft.sides.map((side) => (side.key === key ? { ...side, ...change } : side)) };
}

/** This function gives the feature with a key. */
export function featureOf(draft: Draft, key: string): DraftFeature | undefined {
  return draft.sides.flatMap((side) => side.features).find((feature) => feature.key === key);
}

/** This function adds a feature with no lengths at the end of the features of the wall with a key. The distance of the feature starts at the start of the wall. */
export function withNewFeature(draft: Draft, sideKey: string, kind: FeatureKind): Draft {
  const numbers = draft.sides.flatMap((side) => side.features.map((feature) => Number(feature.key.slice(1)))).filter((value) => Number.isInteger(value));
  const feature: DraftFeature = { key: `f${String(Math.max(0, ...numbers) + 1)}`, kind, from: "start", offset: NO_TEXT, width: NO_TEXT, height: NO_TEXT, sill: NO_TEXT };
  return { ...draft, sides: draft.sides.map((side) => (side.key === sideKey ? { ...side, features: [...side.features, feature] } : side)) };
}

/** This function removes the feature with a key. */
export function withoutFeature(draft: Draft, key: string): Draft {
  return { ...draft, sides: draft.sides.map((side) => ({ ...side, features: side.features.filter((feature) => feature.key !== key) })) };
}

/** This function changes the fields of the feature with a key. */
export function withFeature(draft: Draft, key: string, change: Partial<Omit<DraftFeature, "key" | "kind">>): Draft {
  return { ...draft, sides: draft.sides.map((side) => ({ ...side, features: side.features.map((feature) => (feature.key === key ? { ...feature, ...change } : feature)) })) };
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
  /** The position of the wall that needs a value, or of the wall of the feature with a fault, from 0. */
  readonly side?: number | undefined;
  /** The key of the feature with a fault. */
  readonly feature?: string | undefined;
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
  return kind === "outlet" ? "height above the floor" : "height";
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
export function featureFaults(draft: Draft, result: SurveyResult): readonly FeatureFault[] {
  const placed = placedFeatures(draft);
  if (placed.length === 0) return [];
  const findings = new Map<string, Finding>();
  for (const finding of checkRoom(result.room)) {
    if ((finding.record === "opening" || finding.record === "outlet") && !findings.has(finding.at)) findings.set(finding.at, finding);
  }
  return placed.flatMap((item): FeatureFault[] => {
    const { side, feature, id, reading } = item;
    const name = `${FEATURE_WORDS[feature.kind]} ${String(item.number)}`;
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
  /** The near edge of the feature, as a part of the length of the wall from its start: a number from 0 to 1. */
  readonly from: number;
  /** The far edge of the feature. An outlet has the value of `from`. */
  readonly to: number;
  /** The corner of the wall where the distance of the feature starts. */
  readonly corner: FeatureEnd;
  /** The level of the fault of the place of the feature. */
  readonly fault: "error" | "warning" | undefined;
}

/** This function gives the place of each feature that has its numbers, on a wall that has a length. */
export function featureSpans(draft: Draft, faults: readonly FeatureFault[]): readonly FeatureSpan[] {
  const part = (value: number): number => Math.min(Math.max(value, 0), 1);
  return placedFeatures(draft).flatMap((item): FeatureSpan[] => {
    if (item.reading.state !== "ok" || !(item.wall > 0)) return [];
    const { start, width } = item.reading.numbers;
    const level = faults.find((fault) => fault.key === item.feature.key)?.level;
    return [
      {
        side: item.side,
        key: item.feature.key,
        kind: item.feature.kind,
        from: part(start / item.wall),
        to: part((start + width) / item.wall),
        corner: item.feature.from,
        fault: level === "error" || level === "warning" ? level : undefined,
      },
    ];
  });
}

/**
 * This function gives the message of the page about a draft and the result of its survey.
 * The message of a closed room tells the first fault of its features. `faults` is the result of `featureFaults`.
 */
export function statusOf(draft: Draft, result: SurveyResult, faults?: readonly FeatureFault[]): Status {
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

/** The rooms that the page keeps in the browser. */
export interface Store {
  readonly version: 1;
  readonly rooms: readonly Draft[];
  /** The position of the room that the page shows. */
  readonly active: number;
}

/** The largest number of characters of a text of the store, of walls of a room, of features of a wall, and of rooms. A larger store is not a store of this page. */
const LIMITS = { text: 80, sides: 200, features: 100, rooms: 100 };

const isObject = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === "object" && value !== null && !Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === "string" && value.length <= LIMITS.text;
const isOneOf = <T extends string>(list: readonly T[], value: unknown): value is T => typeof value === "string" && list.some((item) => item === value);

function typedFrom(value: unknown): TypedLength | undefined {
  return isObject(value) && isText(value["value"]) && isText(value["inches"]) ? { value: value["value"], inches: value["inches"] } : undefined;
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
  return { key, kind, from, offset, width, height, sill };
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
  return { key, length, corner, angle, features: list.filter((feature) => feature !== undefined) };
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
  return { name, mode, height, thickness, sides: walls };
}

/** This function reads the store from its text. A text that is not a store of this page gives `undefined`, and the page starts again. */
export function parseStore(text: string | null): Store | undefined {
  if (text === null) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (!isObject(value) || value["version"] !== 1) return undefined;
  const { rooms, active } = value;
  if (!Array.isArray(rooms) || rooms.length === 0 || rooms.length > LIMITS.rooms) return undefined;
  const list = rooms.map(draftFrom);
  if (list.some((room) => room === undefined)) return undefined;
  if (typeof active !== "number" || !Number.isInteger(active) || active < 0 || active >= list.length) return undefined;
  return { version: 1, rooms: list.filter((room) => room !== undefined), active };
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
  const words = draft.name.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return `${words.length === 0 ? "room" : words.join("-")}.${kind}.json`;
}

/** The largest number of rooms of a store. */
export const MOST_ROOMS: number = LIMITS.rooms;

/** This function gives the name of a room in the list of the rooms: its name, or its number when it has no name. */
export function roomName(draft: Draft, index: number): string {
  const name = draft.name.trim();
  return name === "" ? `Room ${String(index + 1)}` : name;
}

/** The state of a room in the list of the rooms. The state `fault` is a closed room with a fault of a feature. */
export type RoomState = StatusLevel | "fault";

/** This function gives the state of a room from its status. */
export function roomState(status: Status): RoomState {
  return status.level === "closed" && status.feature !== undefined ? "fault" : status.level;
}

/**
 * This function adds a room at the end of the rooms of a store, and the store shows it.
 * The example room is not a room of the visitor, so a store with only the example room gets the new room in its place.
 * With `overEmpty`, the same rule applies to a store with only an empty room. A store with the largest number of rooms does not change.
 */
export function withNewRoom(store: Store, room: Draft, overEmpty = false): Store {
  const only = store.rooms.length === 1 ? store.rooms[0] : undefined;
  if (only !== undefined && (sameDraft(only, exampleDraft(only.mode)) || (overEmpty && sameDraft(only, emptyDraft(only.mode))))) {
    return { ...store, rooms: [room], active: 0 };
  }
  if (store.rooms.length >= LIMITS.rooms) return store;
  return { ...store, rooms: [...store.rooms, room], active: store.rooms.length };
}

/**
 * This function removes the room at a position. The store then shows the room that follows, or the last room.
 * A store has one room or more, so the only room of a store becomes an empty room.
 */
export function withoutRoom(store: Store, index: number): Store {
  const room = store.rooms[index];
  if (room === undefined) return store;
  if (store.rooms.length === 1) return { ...store, rooms: [emptyDraft(room.mode)], active: 0 };
  const rooms = store.rooms.filter((_, position) => position !== index);
  const active = store.active > index ? store.active - 1 : Math.min(store.active, rooms.length - 1);
  return { ...store, rooms, active };
}

/** This function shows the room at a position. A position with no room gives the same store. */
export function withActive(store: Store, index: number): Store {
  return store.rooms[index] === undefined || index === store.active ? store : { ...store, active: index };
}
