import { metersPer, SURVEY_SCHEMA, type LengthUnit, type Survey, type SurveyResult, type SurveyTurn } from "@mark1russell7/room-view";

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

/** One wall of the draft, and the corner at its end. */
export interface DraftSide {
  /** The key of the wall in the page. It stays when a person removes a different wall. */
  readonly key: string;
  readonly length: TypedLength;
  readonly corner: Corner;
  /** The angle of a measured corner in degrees, as text. The angle is inside the room, between the two walls. */
  readonly angle: string;
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

/**
 * This function makes the survey record of a draft. It is total: a length with no valid number counts as 0.
 * A height or a thickness with no valid number gets a usual value.
 */
export function surveyOf(draft: Draft): Survey {
  const name = draft.name.trim();
  const toRight = walksRight(draft.sides);
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

/**
 * This function makes the draft of a survey record. It reads the name, the height, the thickness and the sides.
 * The draft has no openings, outlets, circuits or checks.
 */
export function draftOf(survey: Survey): Draft {
  const mode = modeOf(survey.unit);
  const factor = metersPer(survey.unit) / metersPer(unitOf(mode));
  const typed = (value: number): TypedLength => (Number.isFinite(value) && value > 0 ? typedOf(value * factor, mode) : { value: "", inches: "" });
  // The turns of a walk to the right make a negative sum.
  const toRight = survey.sides.reduce((sum, side) => sum + degreesOf(side.turn), 0) < 0;
  return {
    name: survey.name ?? "",
    mode,
    height: typed(survey.height),
    thickness: typed(survey.wallThickness),
    sides: survey.sides.map((side, index) => ({
      key: `s${String(index + 1)}`,
      length: typed(side.length),
      corner: typeof side.turn === "number" ? "angle" : side.turn,
      angle: typeof side.turn === "number" && Number.isFinite(side.turn) ? angleText(side.turn, toRight) : "",
    })),
  };
}

/** This function tells if a survey record has data that a draft does not keep. */
export function hasMoreThanWalls(survey: Survey): boolean {
  const lists = [survey.openings, survey.outlets, survey.circuits, survey.checks];
  return lists.some((list) => list !== undefined && list.length > 0);
}

/** The lengths of the example room in meters: a room of 12 ft by 10 ft, or of 3.6 m by 3 m. */
const EXAMPLE: Readonly<Record<"imperial" | "metric", { readonly sides: readonly number[]; readonly height: number; readonly thickness: number }>> = {
  imperial: { sides: [3.6576, 3.048, 3.6576, 3.048], height: 2.4384, thickness: 0.1143 },
  metric: { sides: [3.6, 3, 3.6, 3], height: 2.4, thickness: 0.11 },
};

function draftWith(mode: LengthMode, lengths: (meters: number) => TypedLength): Draft {
  const example = EXAMPLE[mode === "ft-in" || mode === "in" ? "imperial" : "metric"];
  return {
    name: "",
    mode,
    height: typedOf(example.height / metersPer(unitOf(mode)), mode),
    thickness: typedOf(example.thickness / metersPer(unitOf(mode)), mode),
    sides: example.sides.map((meters, index) => ({ key: `s${String(index + 1)}`, length: lengths(meters), corner: "left", angle: "" })),
  };
}

/** This function gives the example room: four walls with square corners. A person types the numbers of a real room over it. */
export function exampleDraft(mode: LengthMode): Draft {
  return draftWith(mode, (meters) => typedOf(meters / metersPer(unitOf(mode)), mode));
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
  return { ...draft, mode, height: convert(draft.height), thickness: convert(draft.thickness), sides: draft.sides.map((side) => ({ ...side, length: convert(side.length) })) };
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
  return { ...draft, sides: [...draft.sides, { key: freeKey(draft), length: { value: "", inches: "" }, corner, angle: "" }] };
}

/** This function removes the wall with a key. */
export function withoutSide(draft: Draft, key: string): Draft {
  return { ...draft, sides: draft.sides.filter((side) => side.key !== key) };
}

/** This function changes the fields of the wall with a key. */
export function withSide(draft: Draft, key: string, change: Partial<Omit<DraftSide, "key">>): Draft {
  return { ...draft, sides: draft.sides.map((side) => (side.key === key ? { ...side, ...change } : side)) };
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
  /** The position of the wall that needs a value, from 0. */
  readonly side?: number | undefined;
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

/** This function gives the message of the page about a draft and the result of its survey. */
export function statusOf(draft: Draft, result: SurveyResult): Status {
  const field = missing(draft);
  if (field !== undefined) return field;
  if (draft.sides.length < FEWEST_SIDES) return { level: "typing", title: "A room has 3 walls or more.", text: "Add the next wall of your walk." };
  const { closure } = result;
  const gap = lengthText(closure.gap, draft.mode);
  const part = rounded(closure.ratio * 100, 1);
  const percent = part === 0 ? "less than 0.1%" : `${String(part)}%`;
  if (closure.closed) {
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

/** The largest number of characters of a text of the store, of walls of a room, and of rooms. A larger store is not a store of this page. */
const LIMITS = { text: 80, sides: 200, rooms: 100 };

const isObject = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === "object" && value !== null && !Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === "string" && value.length <= LIMITS.text;
const isOneOf = <T extends string>(list: readonly T[], value: unknown): value is T => typeof value === "string" && list.some((item) => item === value);

function typedFrom(value: unknown): TypedLength | undefined {
  return isObject(value) && isText(value["value"]) && isText(value["inches"]) ? { value: value["value"], inches: value["inches"] } : undefined;
}

function sideFrom(value: unknown): DraftSide | undefined {
  if (!isObject(value)) return undefined;
  const { key, corner, angle } = value;
  const length = typedFrom(value["length"]);
  if (!isText(key) || length === undefined || !isOneOf(CORNERS, corner) || !isText(angle)) return undefined;
  return { key, length, corner, angle };
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
  return { name, mode, height, thickness, sides: list.filter((side) => side !== undefined) };
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
