import { regionArea } from "@mark1russell7/layout-contract";
import { expandLevel, expandSurvey, SCENE_SCHEMA, type LevelResult, type Room, type Scene, type SurveyResult } from "@mark1russell7/room-view";
import type { RoomViewer, ViewerTheme } from "@mark1russell7/room-view/three";
import { byId, copyText, h, setupTheme } from "@mark1russell7/site-pages/chrome";
import { isDark, onThemeChange } from "./dark.ts";
import {
  areaText,
  defaultMode,
  dimensionText,
  draftOf,
  emptyDraft,
  exampleDraft,
  FEATURE_FIELDS,
  FEATURE_KINDS,
  FEATURE_NAMES,
  featureFaults,
  featureOf,
  featureSpans,
  fieldsOf,
  fileName,
  hasMore,
  LENGTH_MODES,
  lengthText,
  MODE_NAMES,
  MOST_ROOMS,
  parseStore,
  placedFeatures,
  readLength,
  roomName,
  roomState,
  sameDraft,
  shownRoom,
  statusOf,
  storeOf,
  storeText,
  surveyOf,
  typedOf,
  usualOf,
  withActive,
  withConnection,
  withFeature,
  withMode,
  withNewFeature,
  withNewRoom,
  withNewRooms,
  withNewSide,
  withoutFeature,
  withoutRoom,
  withoutSide,
  withRoom,
  withSide,
  type Corner,
  type Draft,
  type DraftEnd,
  type DraftSide,
  type FeatureEnd,
  type FeatureFault,
  type FeatureField,
  type FeatureKind,
  type PlacedFeature,
  type RoomState,
  type Status,
  type StatusLevel,
  type Store,
  type TypedLength,
} from "./draft.ts";
import { drawLevel, type PlanInput } from "./floorplan.ts";
import { apartNote, apartRooms, draftsOf, joinChoices, jointsOf, levelOf, levelStatus, shownLevel, type Joint, type JointState, type LevelDrafts } from "./level.ts";
import { svg } from "./plan.ts";
import { drawWalk, pathOf, type PictureSize, type Pixel, type WalkFeature } from "./walk.ts";

// The page "Measure a room". A person types the length of each wall and the turn at each corner.
// The page keeps the text of each field in a draft, makes the survey record from it, and draws the result.
// With two rooms or more, a door of one room goes to a door of a different room, and the page draws the rooms together.

/** The key of the rooms in the storage of the browser. */
const STORE_KEY = "room-view:measure";

/** The largest size of a file of measurements that the page opens, in bytes. */
const LARGEST_FILE = 1_000_000;

function readStore(): Store | undefined {
  try {
    return parseStore(localStorage.getItem(STORE_KEY));
  } catch {
    return undefined;
  }
}

let store: Store = readStore() ?? storeOf([exampleDraft(defaultMode(navigator.language))]);
let draft: Draft = store.rooms[store.active] ?? exampleDraft("m");
/**
 * The draft with the numbers that the visitor typed. A change of the units converts this draft, and not the converted numbers.
 * Thus the first units show the typed numbers again, with no error from a second conversion.
 */
let typed: Draft = draft;
let result: SurveyResult = expandSurvey(surveyOf(draft));
/** The faults of the doors, the windows, the openings and the outlets. */
let faults: readonly FeatureFault[] = featureFaults(draft, result);
let status: Status = statusOf(draft, result, faults);

/** This function gives the status of a room that the page does not show. */
function statusFor(room: Draft): Status {
  return statusOf(room, expandSurvey(surveyOf(room)));
}

/** The status of each room of the store. A change of a room calculates only the status of that room. */
let statuses: Status[] = store.rooms.map(statusFor);

/**
 * The rooms of the store as one level.
 * It has the place of each room, the state of each door between two rooms, and the message about them.
 */
interface Whole {
  readonly result: LevelResult;
  readonly joints: readonly Joint[];
  readonly status: Status;
}

/** The level of the rooms of the store. A store with one room has no level. */
let whole: Whole | undefined;
/** The page shows one room with its fields, or the rooms together. */
let scope: "room" | "all" = "room";
/** The scope, the names, the states and the active room of the list of the rooms at its last drawing. */
let shownRooms = "";
/** The position of the wall whose field has the focus. */
let activeSide: number | undefined;
/** The key of the feature whose field has the focus. */
let activeFeature: string | undefined;
let view: "plan" | "room" = "plan";
let viewer: RoomViewer | undefined;
let themes: { readonly light: ViewerTheme; readonly dark: ViewerTheme } | undefined;
/** A browser with no WebGL 2 shows only the drawing. */
let noWebGl = false;
/** The level of the status at the last drawing. The floor of a room appears with a short motion when the walk closes. */
let lastLevel: StatusLevel | undefined;

const board = byId("board");
const form = byId<HTMLFormElement>("form");
const levelPanel = byId("level");
const sidesList = byId("sides");
const planBox = byId("plan-box");
const roomBox = byId("room-box");
const planButton = byId<HTMLButtonElement>("view-plan");
const roomButton = byId<HTMLButtonElement>("view-room");
const nameField = byId<HTMLInputElement>("name");
const modeField = byId<HTMLSelectElement>("mode");
const keepNote = byId("keep-note");
const roomList = byId("room-list");
const addRoom = byId<HTMLButtonElement>("add-room");

const SIGNS: Readonly<Record<StatusLevel, string>> = { typing: "…", open: "!", closed: "✓" };

/** The sign and the words of each state of a room in the list of the rooms. */
const ROOM_STATES: Readonly<Record<RoomState, readonly [sign: string, words: string]>> = {
  typing: ["…", "needs a number"],
  open: ["!", "the walk does not close"],
  fault: ["!", "a door, a window or an outlet is not ready"],
  closed: ["✓", "the walk closes"],
};

/**
 * This function shows one button for each room of the store, with the name and the state of the room.
 * A store with two rooms or more has a first button that shows the rooms together.
 * The function makes the buttons again only when the scope, a name, a state or the active room changes. Thus a button keeps the focus while a person types.
 */
function renderRooms(): void {
  const rooms = store.rooms.map((room, index) => ({ name: roomName(room, index), state: roomState(statuses[index] ?? status) }));
  const all = whole === undefined ? undefined : { level: whole.status.level, title: whole.status.title };
  const next = JSON.stringify([scope, store.active, rooms, all]);
  if (next === shownRooms) return;
  shownRooms = next;
  const focus = roomList.contains(document.activeElement);
  const items = rooms.map(({ name, state }, index) => {
    const [sign, words] = ROOM_STATES[state];
    const current = scope === "room" && index === store.active;
    const button = h(
      "button",
      { class: "room", type: "button", "data-room": String(index), "data-state": state, "aria-current": current ? "true" : null, "aria-label": `${name}: ${words}` },
      h("span", { class: "room-sign", "aria-hidden": "true" }, sign),
      h("span", { class: "room-name" }, name),
    );
    return h("li", {}, button);
  });
  if (all !== undefined) {
    const button = h(
      "button",
      { class: "room room-all", type: "button", "data-scope": "all", "data-state": all.level, "aria-current": scope === "all" ? "true" : null, "aria-label": `All rooms: ${all.title}` },
      h("span", { class: "room-sign", "aria-hidden": "true" }, SIGNS[all.level]),
      h("span", { class: "room-name" }, "All rooms"),
    );
    items.unshift(h("li", { class: "room-first" }, button));
  }
  roomList.replaceChildren(...items);
  addRoom.disabled = store.rooms.length >= MOST_ROOMS;
  if (focus) roomList.querySelector<HTMLElement>('button[aria-current="true"]')?.focus();
}

/**
 * This function gives the fields of a length to a box: feet and inches, or one number with its unit.
 * An empty field shows the usual value, which the page uses when a person types no number.
 */
function lengthFields(box: HTMLElement, typed: TypedLength, label: string, usual?: TypedLength): void {
  const field = (part: "value" | "inches", text: string, unit: string, name: string): HTMLElement => {
    const input = h("input", { class: "number-field", type: "text", inputmode: "decimal", enterkeyhint: "next", "data-part": part, "aria-label": name });
    input.value = text;
    if (usual !== undefined) input.placeholder = usual[part];
    return h("label", { class: "number" }, input, h("span", { class: "unit", "aria-hidden": "true" }, unit));
  };
  const fields =
    draft.mode === "ft-in"
      ? [field("value", typed.value, "ft", `${label}, feet`), field("inches", typed.inches, "in", `${label}, inches`)]
      : [field("value", typed.value, draft.mode, `${label}, in ${MODE_NAMES[draft.mode].toLowerCase()}`)];
  box.dataset["fields"] = String(fields.length);
  box.replaceChildren(...fields);
}

/** The name of each button that adds a feature to a wall. */
const ADD_NAMES: Readonly<Record<FeatureKind, string>> = { door: "Door", window: "Window", gap: "Opening with no door", outlet: "Outlet" };

/** The name of the number of the features of each kind, in the numbers of the room. */
const COUNT_NAMES: Readonly<Record<FeatureKind, string>> = { door: "Doors", window: "Windows", gap: "Openings", outlet: "Outlets" };

/** This function gives the sign of a kind of feature: its symbol in the drawing, on a short part of a wall. */
function featureSign(kind: FeatureKind): SVGSVGElement {
  const sign = svg("svg", { class: "sign", viewBox: "0 0 30 16", width: "30", height: "16", "aria-hidden": "true" });
  const stroke = (className: string, x1: number, y1: number, x2: number, y2: number): SVGLineElement =>
    svg("line", { class: className, x1: String(x1), y1: String(y1), x2: String(x2), y2: String(y2) });
  if (kind === "outlet") {
    sign.append(stroke("sign-wall", 1, 4, 29, 4), stroke("sign-thin", 15, 4, 15, 8), svg("circle", { class: "sign-outlet", cx: "15", cy: "11", r: "3" }));
    return sign;
  }
  sign.append(stroke("sign-wall", 1, 8, 8, 8), stroke("sign-wall", 22, 8, 29, 8), stroke("sign-thin", 8, 3, 8, 13), stroke("sign-thin", 22, 3, 22, 13));
  if (kind === "door") sign.append(stroke("sign-thin", 8, 8, 22, 8));
  if (kind === "window") sign.append(stroke("sign-thin", 8, 6, 22, 6), stroke("sign-thin", 8, 10, 22, 10));
  return sign;
}

/** This function gives the name of a length of a feature in the form. The distance along the wall has the name of the corner where it starts. */
function fieldName(kind: FeatureKind, field: FeatureField, side: number, end: FeatureEnd): string {
  if (field === "width") return "Width";
  if (field === "sill") return "Bottom above the floor";
  if (field === "height") return kind === "outlet" ? "Above the floor" : "Height";
  const count = draft.sides.length;
  if (count < 3) return end === "start" ? "From the start of the wall" : "From the end of the wall";
  // The corner at the start of a wall is the corner with the wall before it in the walk.
  const other = (side + (end === "start" ? count - 1 : 1)) % count;
  return `From the corner with wall ${String(other + 1)}`;
}

/** This function gives the fields of a door, a window, an opening or an outlet. */
function featureItem(item: PlacedFeature): HTMLLIElement {
  const { feature, side } = item;
  const title = `${FEATURE_NAMES[feature.kind]} ${String(item.number)}`;
  const name = title.toLowerCase();
  const remove = h("button", { class: "remove", type: "button", "data-action": "remove-feature", "aria-label": `Remove ${name}`, title: `Remove ${name}` }, "×");
  const rows = fieldsOf(feature.kind).map((field) => {
    const words = fieldName(feature.kind, field, side, feature.from);
    const usual = usualOf(feature.kind, field, draft.mode);
    const length = h("span", { class: "length", "data-of": field });
    lengthFields(length, feature[field], `${title}, ${words.toLowerCase()}`, usual === undefined ? undefined : typedOf(usual, draft.mode));
    if (field !== "offset") return h("div", { class: "field" }, h("span", { class: "field-name" }, words), length);
    const swap = h("button", { class: "swap", type: "button", "data-action": "swap", "aria-label": `Measure ${name} from the other corner of its wall` }, "Use the other corner");
    return h("div", { class: "field" }, h("span", { class: "field-name" }, words, swap), length);
  });
  const note = h("p", { class: "feature-note" });
  note.hidden = true;
  return h(
    "li",
    { class: "feature", "data-key": feature.key, "data-kind": feature.kind },
    h("div", { class: "feature-head" }, featureSign(feature.kind), h("span", { class: "feature-name" }, title), remove),
    rows,
    note,
    joinRows(item, title),
  );
}

/** The text of the choice of a door that goes to no room of the page. */
const NO_ROOM = "Outside, or a room that is not here";

/**
 * This function gives the field that tells where a door or an opening goes.
 * It goes to a door of a different room, or to no room of the page.
 * A page with one room has no such field, and a window and an outlet have none.
 */
function joinRows(item: PlacedFeature, title: string): readonly (HTMLElement | null)[] {
  const { kind, key } = item.feature;
  if (store.rooms.length < 2 || (kind !== "door" && kind !== "gap")) return [];
  const choices = joinChoices(store, { room: store.active, feature: key });
  const options = choices.map((choice) => {
    // The position of a room has no colon, so the first colon ends it.
    const option = h("option", { value: `${String(choice.end.room)}:${choice.end.feature}` }, choice.text);
    option.selected = choice.current;
    return option;
  });
  const select = h("select", { class: "text-field", "data-part": "join", "aria-label": `${title} goes to` }, h("option", { value: "" }, NO_ROOM), options);
  const word = FEATURE_NAMES[kind].toLowerCase();
  const aid = choices.length === 0 ? h("p", { class: "join-aid" }, `To join two rooms, add this ${word} to the other room too. Then select it here.`) : null;
  // `showJoins` gives the text of the note.
  const note = h("p", { class: "join-note" });
  note.hidden = true;
  return [h("div", { class: "field" }, h("span", { class: "field-name" }, "Goes to"), select), aid, note];
}

/** This function gives the control that adds a feature to a wall: one button that shows a button for each kind. */
function addControl(side: DraftSide, number: string): HTMLElement {
  const id = `kinds-${side.key}`;
  const open = h("button", { class: "feature-open", type: "button", "data-action": "features", "aria-expanded": "false", "aria-controls": id }, "Add a door, a window or an outlet");
  const kinds = h(
    "div",
    { id, class: "feature-kinds", role: "group", "aria-label": `Add to wall ${number}` },
    FEATURE_KINDS.map((kind) => h("button", { class: "tool", type: "button", "data-action": "add-feature", "data-kind": kind }, featureSign(kind), ADD_NAMES[kind])),
  );
  kinds.hidden = true;
  return h("div", { class: "feature-add" }, open, kinds);
}

function sideItem(side: DraftSide, index: number, placed: readonly PlacedFeature[]): HTMLLIElement {
  const number = String(index + 1);
  const features = placed.filter((item) => item.side === index);
  const length = h("span", { class: "length", "data-of": "side" });
  lengthFields(length, side.length, `Length of wall ${number}`);
  const remove = h("button", { class: "remove", type: "button", "data-action": "remove", "aria-label": `Remove wall ${number}`, title: `Remove wall ${number}` }, "×");
  remove.disabled = draft.sides.length <= 1;
  const choice = (corner: Corner, text: string): HTMLElement => {
    const input = h("input", { type: "radio", name: `corner-${side.key}`, value: corner, "data-part": "corner" });
    input.checked = side.corner === corner;
    return h("label", { class: "choice" }, input, h("span", {}, text));
  };
  const angle = h("input", {
    class: "number-field",
    type: "text",
    inputmode: "decimal",
    enterkeyhint: "next",
    "data-part": "angle",
    "aria-label": `Angle inside the room at the corner after wall ${number}, in degrees`,
  });
  angle.value = side.angle;
  const angleBox = h("label", { class: "number angle" }, angle, h("span", { class: "unit" }, "° inside the room"));
  angleBox.hidden = side.corner !== "angle";
  const last = index === draft.sides.length - 1;
  const turn = `turn-${side.key}`;
  return h(
    "li",
    { class: "side", "data-key": side.key, "data-side": String(index) },
    h("div", { class: "side-wall" }, h("span", { class: "side-name" }, `Wall ${number}`), length, remove),
    h(
      "div",
      { class: "corner" },
      h("span", { id: turn, class: "corner-name" }, last ? "Then turn to wall 1" : "Then turn"),
      h("div", { class: "choices", role: "radiogroup", "aria-labelledby": turn }, choice("left", "Left"), choice("right", "Right"), choice("angle", "Angle")),
      angleBox,
    ),
    // The features are below the corner, so the length and the turn of each wall stay together.
    features.length === 0 ? null : h("ul", { class: "features", "aria-label": `Doors, windows and outlets of wall ${number}` }, features.map(featureItem)),
    addControl(side, number),
  );
}

function renderSides(): void {
  const placed = placedFeatures(draft);
  sidesList.replaceChildren(...draft.sides.map((side, index) => sideItem(side, index, placed)));
  showFaults();
  showJoins();
}

/** This function shows, at each door that goes to a different room, if the two rooms fit at the door. */
function showJoins(): void {
  for (const item of sidesList.querySelectorAll<HTMLElement>("li.feature")) {
    const note = item.querySelector<HTMLElement>(".join-note");
    if (note === null) continue;
    const key = item.dataset["key"];
    const joint = whole?.joints.find(({ connection }) => [connection.from, connection.to].some((end) => end.room === store.active && end.feature === key));
    note.hidden = joint === undefined;
    note.textContent = joint?.text ?? "";
    if (joint === undefined) note.removeAttribute("data-state");
    else note.dataset["state"] = joint.state;
  }
}

/** This function shows the fault of the place of each feature at its fields. The status tells a field that needs a value. */
function showFaults(): void {
  for (const item of sidesList.querySelectorAll<HTMLElement>("li.feature")) {
    const fault = faults.find((entry) => entry.key === item.dataset["key"] && entry.level !== "typing");
    if (fault === undefined) item.removeAttribute("data-fault");
    else item.dataset["fault"] = fault.level;
    const note = item.querySelector<HTMLElement>(".feature-note");
    if (note === null) continue;
    note.hidden = fault === undefined;
    note.textContent = fault?.note ?? "";
  }
}

/** This function shows the draft in each field of the form. */
function renderForm(): void {
  nameField.value = draft.name;
  modeField.value = draft.mode;
  lengthFields(byId("height"), draft.height, "Height of the room");
  lengthFields(byId("thickness"), draft.thickness, "Thickness of a wall");
  byId("fractions").hidden = draft.mode !== "ft-in" && draft.mode !== "in";
  renderSides();
}

/** This function gives the first field of the length of a wall. */
function lengthField(index: number): HTMLInputElement | null {
  return sidesList.querySelector<HTMLInputElement>(`li[data-side="${String(index)}"] .length input`);
}

/** This function gives the first field of a feature. */
function featureField(key: string): HTMLInputElement | null {
  return sidesList.querySelector<HTMLInputElement>(`li.feature[data-key="${CSS.escape(key)}"] .length input`);
}

/** This function gives the rooms as one level when the page shows them together. */
function shownWhole(): Whole | undefined {
  return scope === "all" ? whole : undefined;
}

function showStatus(): void {
  const shown = shownWhole()?.status ?? status;
  const box = byId("status");
  box.dataset["level"] = shown.level;
  byId("status-sign").textContent = SIGNS[shown.level];
  byId("status-title").textContent = shown.title;
  byId("status-text").textContent = shown.text;
}

type Fact = readonly [name: string, value: string];

/** This function gives the numbers of the room that the page shows. */
function roomFacts(): readonly Fact[] {
  const lengths = draft.sides.map((side) => readLength(side.length, draft.mode));
  const around = lengths.reduce((sum, reading) => sum + (reading.state === "ok" ? reading.value : 0), 0);
  const ring = result.room.floors?.[0]?.ring;
  const rows: Fact[] = [
    ["Walls", String(draft.sides.length)],
    ["Around the room", around > 0 ? lengthText(around, draft.mode) : "No length yet"],
  ];
  if (status.level === "closed" && ring !== undefined) rows.push(["Floor area", areaText(regionArea({ kind: "polygon", points: ring }), draft.mode)]);
  const kinds = draft.sides.flatMap((side) => side.features.map((feature) => feature.kind));
  for (const kind of FEATURE_KINDS) {
    const count = kinds.filter((item) => item === kind).length;
    if (count > 0) rows.push([COUNT_NAMES[kind], String(count)]);
  }
  return rows;
}

/** This function gives the numbers of the rooms together. The floor area needs each room to close. */
function levelFacts(level: Whole): readonly Fact[] {
  const floors = level.result.room.floors ?? [];
  const rows: Fact[] = [["Rooms", String(store.rooms.length)]];
  if (floors.length === store.rooms.length) {
    const area = floors.reduce((sum, floor) => sum + regionArea({ kind: "polygon", points: floor.ring }), 0);
    // Each length of the level is in the unit of the first room.
    rows.push(["Floor area", areaText(area, store.rooms[0]?.mode ?? "m")]);
  }
  rows.push(["Doors between rooms", String(level.joints.length)]);
  return rows;
}

function showFacts(): void {
  const level = shownWhole();
  const rows = level === undefined ? roomFacts() : levelFacts(level);
  const facts = byId("facts");
  facts.setAttribute("aria-label", level === undefined ? "The room in numbers" : "The rooms in numbers");
  facts.replaceChildren(...rows.map(([name, value]) => h("div", {}, h("dt", {}, name), h("dd", {}, value))));
}

const number = (value: number): string => value.toFixed(1);

function line(className: string, from: Pixel, to: Pixel, side?: number): SVGLineElement {
  const element = svg("line", { class: className, x1: number(from[0]), y1: number(from[1]), x2: number(to[0]), y2: number(to[1]) });
  if (side !== undefined) element.dataset["side"] = String(side);
  return element;
}

function label(className: string, at: Pixel, anchor: string, text: string): SVGTextElement {
  const element = svg("text", { class: className, x: number(at[0]), y: number(at[1]), "text-anchor": anchor, "dominant-baseline": "central" });
  element.textContent = text;
  return element;
}

/** The arrow on the first wall, in pixels. `base` and `tip` are distances from the start of the walk, and `half` is half of its width. */
const ARROW = { base: 13, tip: 25, half: 5 };

/**
 * The sizes of the symbols of the features, in pixels. `jamb` is half of the line at each edge of an opening.
 * `glass` is half of the space between the two lines of a window.
 *
 * `outlet` is the distance from the wall to the center of an outlet, and `radius` is its radius.
 * `reach` is the distance from the wall to the line of the measured distance. `tick` is half of the line at each end of that line.
 * `touch` is the radius of the area that selects an outlet.
 */
const SYMBOL = { jamb: 5.5, glass: 2.25, outlet: 9, radius: 3.5, reach: 13, tick: 4, touch: 14 };

/**
 * This function draws a feature of a wall. An opening is a break in the line of the wall: a door has one thin line, and a window has two.
 * An outlet is a circle on the side of the room.
 */
function featureMark(feature: WalkFeature): SVGGElement {
  const group = svg("g", { class: "walk-feature", "data-key": feature.key, "data-kind": feature.kind });
  if (feature.fault !== undefined) group.dataset["fault"] = feature.fault;
  const [nx, ny] = feature.inner;
  const move = ([x, y]: Pixel, distance: number): Pixel => [x + nx * distance, y + ny * distance];
  // The measured distance, from the corner to the near edge. The page shows it for the feature whose field has the focus.
  const [corner, near] = feature.reach;
  group.append(
    line("walk-reach", move(corner, SYMBOL.reach), move(near, SYMBOL.reach)),
    line("walk-reach", move(corner, SYMBOL.reach - SYMBOL.tick), move(corner, SYMBOL.reach + SYMBOL.tick)),
    line("walk-reach", move(near, SYMBOL.reach - SYMBOL.tick), move(near, SYMBOL.reach + SYMBOL.tick)),
  );
  if (feature.kind === "outlet") {
    const center = move(feature.from, SYMBOL.outlet);
    group.append(
      line("walk-thin", feature.from, move(feature.from, SYMBOL.outlet - SYMBOL.radius)),
      svg("circle", { class: "walk-outlet", cx: number(center[0]), cy: number(center[1]), r: String(SYMBOL.radius) }),
    );
    return group;
  }
  group.append(line("walk-hole", feature.from, feature.to));
  for (const edge of [feature.from, feature.to]) group.append(line("walk-thin", move(edge, 0 - SYMBOL.jamb), move(edge, SYMBOL.jamb)));
  if (feature.kind === "door") group.append(line("walk-thin", feature.from, feature.to));
  if (feature.kind === "window") {
    group.append(line("walk-thin", move(feature.from, 0 - SYMBOL.glass), move(feature.to, 0 - SYMBOL.glass)), line("walk-thin", move(feature.from, SYMBOL.glass), move(feature.to, SYMBOL.glass)));
  }
  return group;
}

/** This function gives an area with no color above a feature, so that a finger can select the feature. */
function featureHit(feature: WalkFeature): SVGElement {
  const [x, y] = feature.from;
  const [nx, ny] = feature.inner;
  const hit =
    feature.kind === "outlet"
      ? svg("circle", { class: "walk-touch", cx: number(x + nx * SYMBOL.outlet), cy: number(y + ny * SYMBOL.outlet), r: String(SYMBOL.touch) })
      : line("walk-hit", feature.from, feature.to);
  hit.dataset["feature"] = feature.key;
  return hit;
}

/** The radius of the dot of a door between two rooms, in pixels. */
const TIE_RADIUS = 4;

/**
 * This function draws the rooms together. Each room is one group, and a click on a room opens it.
 * A dot marks a door between two rooms that fits. A broken line joins the two places of a door that does not fit.
 */
function levelPicture(level: Whole, size: PictureSize): SVGSVGElement {
  const inputs = store.rooms.map((room, index): PlanInput => {
    const placed = level.result.rooms[index];
    return { name: roomName(room, index), spans: placed === undefined ? [] : featureSpans(room, featureFaults(room, placed.result)) };
  });
  const drawing = drawLevel(level.result, size, inputs, level.joints);
  const picture = svg("svg", { class: "walk", viewBox: `0 0 ${String(size.width)} ${String(size.height)}`, width: String(size.width), height: String(size.height), role: "img" });
  picture.setAttribute("aria-label", `Drawing of the rooms together. ${level.status.title}`);
  for (const room of drawing.rooms) {
    const group = svg("g", { class: "plan-room", "data-open": String(room.room) });
    if (room.apart) group.dataset["apart"] = "true";
    const title = svg("title", {});
    title.textContent = room.name;
    group.append(title);
    if (room.drawing.floor !== undefined) group.append(svg("path", { class: "walk-floor", d: pathOf(room.drawing.floor, true) }));
    for (const wall of room.drawing.walls) group.append(line("walk-wall", wall.from, wall.to));
    for (const feature of room.drawing.features) group.append(featureMark(feature));
    if (room.drawing.gap !== undefined) group.append(line("walk-gap", room.drawing.gap.from, room.drawing.gap.to));
    if (room.label !== undefined) group.append(label("plan-name", room.label, "middle", room.name));
    // A wide line with no color above each wall, so that a finger can select a room that has no floor.
    for (const wall of room.drawing.walls) group.append(line("walk-hit", wall.from, wall.to));
    picture.append(group);
  }
  for (const tie of drawing.ties) {
    const group = svg("g", { class: "plan-tie", "data-state": tie.state });
    const dot = ([x, y]: Pixel): SVGCircleElement => svg("circle", { cx: number(x), cy: number(y), r: String(TIE_RADIUS) });
    if (tie.state === "fits" || tie.state === "near") group.append(dot([(tie.from[0] + tie.to[0]) / 2, (tie.from[1] + tie.to[1]) / 2]));
    else group.append(line("plan-tie-line", tie.from, tie.to), dot(tie.from), dot(tie.to));
    picture.append(group);
  }
  return picture;
}

/** This function draws the walk, or the rooms together, in the box of the drawing. */
function showDrawing(): void {
  const size = { width: planBox.clientWidth, height: planBox.clientHeight };
  if (size.width === 0 || size.height === 0) return;
  const level = shownWhole();
  if (level !== undefined) {
    planBox.replaceChildren(levelPicture(level, size));
    // The floor of a room appears with no motion after the drawing of the rooms.
    lastLevel = undefined;
    return;
  }
  const texts = draft.sides.map((side) => {
    const reading = readLength(side.length, draft.mode);
    return reading.state === "ok" && reading.value > 0 ? dimensionText(reading.value, draft.mode) : undefined;
  });
  const drawing = drawWalk(result, size, texts, featureSpans(draft, faults));
  const picture = svg("svg", { class: "walk", viewBox: `0 0 ${String(size.width)} ${String(size.height)}`, width: String(size.width), height: String(size.height), role: "img" });
  picture.setAttribute("aria-label", `Drawing of the walk around the room. ${status.title}`);

  if (drawing.floor !== undefined) {
    const floor = svg("path", { class: "walk-floor", d: pathOf(drawing.floor, true) });
    if (lastLevel !== undefined && lastLevel !== "closed") floor.classList.add("walk-floor-new");
    picture.append(floor);
  }
  // Each wall has a wide mark below its line. `showActive` shows the mark of the wall whose field has the focus.
  for (const wall of drawing.walls) picture.append(line("walk-mark", wall.from, wall.to, wall.side));
  for (const wall of drawing.walls) picture.append(line("walk-wall", wall.from, wall.to, wall.side));
  for (const feature of drawing.features) picture.append(featureMark(feature));
  if (drawing.gap !== undefined) picture.append(line("walk-gap", drawing.gap.from, drawing.gap.to), label("walk-gap-label", drawing.gap.at, "middle", "gap"));
  const corners = [...drawing.walls.map((wall) => wall.from), ...(drawing.floor === undefined ? drawing.walls.slice(-1).map((wall) => wall.to) : [])];
  for (const [x, y] of corners) picture.append(svg("circle", { class: "walk-corner", cx: number(x), cy: number(y), r: "3" }));
  if (drawing.heading !== undefined) {
    const [dx, dy] = drawing.heading;
    const [x, y] = drawing.start;
    const tip: Pixel = [x + dx * ARROW.tip, y + dy * ARROW.tip];
    const one: Pixel = [x + dx * ARROW.base - dy * ARROW.half, y + dy * ARROW.base + dx * ARROW.half];
    const two: Pixel = [x + dx * ARROW.base + dy * ARROW.half, y + dy * ARROW.base - dx * ARROW.half];
    picture.append(svg("path", { class: "walk-arrow", d: pathOf([tip, one, two], true) }));
  }
  picture.append(svg("circle", { class: "walk-start", cx: number(drawing.start[0]), cy: number(drawing.start[1]), r: "6.5" }));
  for (const item of drawing.labels) {
    const text = label("walk-label", item.at, item.anchor, item.text);
    text.dataset["side"] = String(item.side);
    picture.append(text);
  }
  // A wide line with no color above each wall, so that a finger can select the wall.
  for (const wall of drawing.walls) picture.append(line("walk-hit", wall.from, wall.to, wall.side));
  for (const feature of drawing.features) picture.append(featureHit(feature));

  planBox.replaceChildren(picture);
  lastLevel = status.level;
  showActive();
}

/**
 * This function marks the wall and the feature whose field has the focus. A feature with the focus shows its measured distance.
 * The function changes no element of the drawing, so a click on a wall keeps its target.
 */
function showActive(): void {
  const side = activeSide === undefined ? undefined : String(activeSide);
  for (const element of planBox.querySelectorAll<SVGElement>(".walk-mark, .walk-label")) element.classList.toggle("walk-on", element.dataset["side"] === side);
  for (const element of planBox.querySelectorAll<SVGElement>(".walk-feature")) element.classList.toggle("walk-on", activeFeature !== undefined && element.dataset["key"] === activeFeature);
}

// A click on a wall of the drawing goes to the field of its length. A click on a feature goes to its first field.
// A click on a room of the drawing of the rooms opens that room.
planBox.addEventListener("click", (event) => {
  const target = event.target instanceof SVGElement ? event.target : undefined;
  if (scope === "all") {
    const room = target?.closest<SVGElement>("[data-open]")?.dataset["open"];
    if (room !== undefined) openRoom(Number(room));
    return;
  }
  const feature = target?.dataset["feature"];
  const side = target?.dataset["side"];
  const field = feature !== undefined ? featureField(feature) : side !== undefined ? lengthField(Number(side)) : null;
  field?.focus();
  field?.select();
});

/**
 * This function gives the room record that the page shows and saves. It has no feature that has an error.
 * For the rooms together, it has each room that closes.
 */
function roomOf(): Room {
  const level = shownWhole();
  return level === undefined ? shownRoom(result.room, faults) : shownLevel(level.result);
}

function sceneOf(): Scene {
  return { schema: SCENE_SCHEMA, room: roomOf() };
}

/**
 * This function tells if the page has a room record to show in 3D and to save.
 * The page has one when the walk of the room closes, or when one of the rooms closes.
 */
function hasModel(): boolean {
  const level = shownWhole();
  return level === undefined ? status.level === "closed" : level.result.rooms.some((room) => room.result.closure.closed);
}

function showTheme(): void {
  if (themes !== undefined) viewer?.setTheme(isDark() ? themes.dark : themes.light);
}

/** The texts of the 3D view for one room and for the rooms together. */
const VIEW_TEXTS = {
  room: {
    button: "3D room",
    ready: "Select 3D room to see the walls with their height.",
    wait: "The 3D room is ready when the walk closes.",
    touch: "Drag to turn the room. Pinch to zoom.",
    mouse: "Drag to turn the room. Click it, then scroll to zoom.",
    fault: "The 3D room did not load. Select 3D room again.",
    label: "3D model of the room",
  },
  all: {
    button: "3D model",
    ready: "Select a room of the drawing to open it. Select 3D model to see the rooms with their height.",
    wait: "Select a room of the drawing to open it. The 3D model is ready when a room closes.",
    touch: "Drag to turn the model. Pinch to zoom.",
    mouse: "Drag to turn the model. Click it, then scroll to zoom.",
    fault: "The 3D model did not load. Select 3D model again.",
    label: "3D model of the rooms",
  },
};

/** This function shows the buttons of the views, the box of the selected view and the hint. */
function showView(): void {
  const ready = hasModel();
  const texts = VIEW_TEXTS[scope];
  if (view === "room" && !ready) leaveRoom();
  planButton.setAttribute("aria-pressed", String(view === "plan"));
  roomButton.setAttribute("aria-pressed", String(view === "room"));
  roomButton.disabled = !ready || noWebGl;
  roomButton.textContent = texts.button;
  planBox.hidden = view !== "plan";
  roomBox.hidden = view !== "room";
  byId("stage").dataset["view"] = view;
  // A small screen shows the hint of the drawing only when it tells a fault: the status has the same facts.
  const hint = byId("hint");
  hint.dataset["kind"] = noWebGl ? "fault" : view;
  if (noWebGl) hint.textContent = "This browser has no WebGL 2, so the page shows only the drawing.";
  else if (view === "room") hint.textContent = matchMedia("(pointer: coarse)").matches ? texts.touch : texts.mouse;
  else hint.textContent = ready ? texts.ready : texts.wait;
}

function leaveRoom(): void {
  viewer?.dispose();
  viewer = undefined;
  view = "plan";
}

/** This function loads the code of the viewer and shows the room in 3D. */
async function enterRoom(): Promise<void> {
  view = "room";
  showView();
  const three = await import("@mark1russell7/room-view/three");
  themes = { light: three.LIGHT_THEME, dark: three.DARK_THEME };
  // The room can change while the code loads.
  if (view !== "room" || !hasModel() || viewer !== undefined) return;
  viewer = three.createRoomViewer(roomBox, { scene: sceneOf(), theme: isDark() ? themes.dark : themes.light, label: VIEW_TEXTS[scope].label });
  if (viewer !== undefined) return;
  noWebGl = true;
  view = "plan";
  showView();
  showDrawing();
}

/** This function gives the rooms of the store as one level. A store with one room has no level. */
function wholeOf(): Whole | undefined {
  if (store.rooms.length < 2) return undefined;
  const level = expandLevel(levelOf(store));
  const joints = jointsOf(store, level);
  return { result: level, joints, status: levelStatus(store.rooms, statuses, level, joints) };
}

/** The sign of each state of a door between two rooms. */
const JOINT_SIGNS: Readonly<Record<JointState, string>> = { typing: "…", fits: "✓", near: "!", off: "!" };

/** This function gives a button with the name of a room. The button opens the room, at a feature of the room if it has one. */
function roomLink(room: number, feature?: string): HTMLButtonElement {
  const item = store.rooms[room];
  return h("button", { class: "open-room", type: "button", "data-open": String(room), "data-feature": feature }, item === undefined ? "" : roomName(item, room));
}

/** This function shows the list of the doors between rooms, and each room that no door joins to the first room. */
function renderLevel(level: Whole): void {
  const item = (state: string, sign: string, title: readonly (HTMLElement | string)[], text: string): HTMLLIElement =>
    h(
      "li",
      { class: "joint", "data-state": state },
      h("span", { class: "joint-sign", "aria-hidden": "true" }, sign),
      h("div", { class: "joint-words" }, h("p", { class: "joint-title" }, title), h("p", { class: "joint-text" }, text)),
    );
  const joints = level.joints.map((joint) => {
    const { from, to } = joint.connection;
    return item(joint.state, JOINT_SIGNS[joint.state], [roomLink(from.room, from.feature), " and ", roomLink(to.room, to.feature)], joint.text);
  });
  // With no door between rooms, each room but the first is apart, and one sentence tells it.
  const apart = joints.length === 0 ? [] : apartRooms(level.result).map((room) => item("apart", "…", [roomLink(room)], apartNote(store.rooms, level.joints, room)));
  byId("joints").replaceChildren(...joints, ...apart);
  byId("no-joints").hidden = joints.length > 0;
}

/** This function shows the fields of one room, or the list of the doors between the rooms. */
function showScope(): void {
  const level = shownWhole();
  form.hidden = level !== undefined;
  levelPanel.hidden = level === undefined;
  byId("clear").hidden = level !== undefined;
  // The drawing of the rooms together gets more of a small screen.
  byId("stage").dataset["scope"] = level === undefined ? "room" : "all";
  board.setAttribute("aria-label", level === undefined ? "The drawing of the room" : "The drawing of the rooms");
  if (level !== undefined) renderLevel(level);
}

/** This function calculates the room of the draft and the rooms together, and shows them. */
function refresh(): void {
  result = expandSurvey(surveyOf(draft));
  faults = featureFaults(draft, result);
  status = statusOf(draft, result, faults);
  statuses[store.active] = status;
  whole = wholeOf();
  // One room has no view of the rooms together.
  if (whole === undefined) scope = "room";
  renderRooms();
  showScope();
  showStatus();
  showFacts();
  showFaults();
  showJoins();
  showView();
  if (view === "room") viewer?.setScene(sceneOf());
  showDrawing();
  byId("example-note").hidden = !sameDraft(draft, exampleDraft(draft.mode));
  byId<HTMLButtonElement>("save-room").disabled = !hasModel();
}

/** This function keeps the store in the browser. */
function keep(): void {
  try {
    localStorage.setItem(STORE_KEY, storeText(store));
  } catch {
    // A browser with no storage keeps the rooms only while the page is open.
  }
}

/** This function makes a change of the draft: the page keeps it in the browser and shows it. */
function change(next: Draft): void {
  draft = next;
  typed = next;
  // A door that the room does not have now goes to no room.
  store = withRoom(store, store.active, next);
  keep();
  refresh();
}

/** This function replaces the room of the page. */
function load(next: Draft): void {
  change(next);
  renderForm();
}

/**
 * This function replaces the rooms of the page. It shows the active room of the new store, or the rooms together.
 * A change of the scope goes back to the drawing.
 */
function show(next: Store, to: "room" | "all" = scope): void {
  if (to !== scope) {
    leaveRoom();
    activeSide = undefined;
    activeFeature = undefined;
  }
  scope = to;
  store = next;
  statuses = store.rooms.map(statusFor);
  draft = store.rooms[store.active] ?? emptyDraft(draft.mode);
  typed = draft;
  keep();
  refresh();
  renderForm();
}

/** This function shows one room with its fields. With a feature, the first field of the feature gets the focus. */
function openRoom(index: number, feature?: string): void {
  const next = withActive(store, index);
  if (next !== store || scope !== "room") {
    closeConfirm();
    keepNote.textContent = "";
    show(next, "room");
  }
  const field = feature === undefined ? null : featureField(feature);
  if (field === null) {
    roomList.querySelector<HTMLElement>('button[aria-current="true"]')?.focus({ preventScroll: true });
    return;
  }
  field.focus();
  field.select();
}

/** This function shows the rooms together. */
function openAll(): void {
  if (whole === undefined || scope === "all") return;
  closeConfirm();
  keepNote.textContent = "";
  show(store, "all");
}

const keyOf = (element: Element): string | undefined => element.closest<HTMLElement>("li.side")?.dataset["key"];

form.addEventListener("submit", (event) => {
  event.preventDefault();
});

form.addEventListener("input", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || target.type !== "text") return;
  if (target === nameField) {
    change({ ...draft, name: target.value });
    return;
  }
  const part = target.dataset["part"];
  const key = keyOf(target);
  if (part === "angle" && key !== undefined) {
    change(withSide(draft, key, { angle: target.value }));
    return;
  }
  if (part !== "value" && part !== "inches") return;
  const of = target.closest<HTMLElement>(".length")?.dataset["of"];
  // A feature has a height too, so the page looks for a feature before the height of the room.
  const featureKey = target.closest<HTMLElement>("li.feature")?.dataset["key"];
  if (featureKey !== undefined) {
    const feature = featureOf(draft, featureKey);
    const field = FEATURE_FIELDS.find((item) => item === of);
    if (feature === undefined || field === undefined) return;
    const length: TypedLength = part === "value" ? { ...feature[field], value: target.value } : { ...feature[field], inches: target.value };
    change(withFeature(draft, featureKey, field === "offset" ? { offset: length } : field === "width" ? { width: length } : field === "height" ? { height: length } : { sill: length }));
    return;
  }
  if (of === "height" || of === "thickness") {
    change({ ...draft, [of]: { ...draft[of], [part]: target.value } });
    return;
  }
  const side = draft.sides.find((item) => item.key === key);
  if (side !== undefined) change(withSide(draft, side.key, { length: { ...side.length, [part]: target.value } }));
});

form.addEventListener("change", (event) => {
  const target = event.target;
  if (target === modeField) {
    const mode = LENGTH_MODES.find((item) => item === modeField.value);
    if (mode === undefined) return;
    // The example room and the empty room have round numbers in each unit. A room of the visitor keeps its lengths.
    const fresh = [exampleDraft, emptyDraft].find((make) => sameDraft(draft, make(draft.mode)));
    const origin = fresh === undefined ? typed : fresh(mode);
    load(withMode(origin, mode));
    typed = origin;
    return;
  }
  if (target instanceof HTMLSelectElement && target.dataset["part"] === "join") {
    const feature = target.closest<HTMLElement>("li.feature")?.dataset["key"];
    if (feature === undefined) return;
    // The value has the position of the room, a colon and the key of the feature. The empty value is no room.
    const cut = target.value.indexOf(":");
    const to: DraftEnd | undefined = cut < 0 ? undefined : { room: Number(target.value.slice(0, cut)), feature: target.value.slice(cut + 1) };
    store = withConnection(store, { room: store.active, feature }, to);
    keep();
    refresh();
    // A door that has a room now is not a choice of the other doors.
    renderSides();
    sidesList.querySelector<HTMLElement>(`li.feature[data-key="${CSS.escape(feature)}"] select`)?.focus();
    return;
  }
  if (!(target instanceof HTMLInputElement) || target.type !== "radio") return;
  const key = keyOf(target);
  const corner: Corner | undefined = target.value === "left" || target.value === "right" || target.value === "angle" ? target.value : undefined;
  if (key === undefined || corner === undefined) return;
  change(withSide(draft, key, { corner }));
  const angle = target.closest(".corner")?.querySelector<HTMLElement>(".angle");
  if (angle === null || angle === undefined) return;
  angle.hidden = corner !== "angle";
  if (corner === "angle") angle.querySelector("input")?.focus();
});

form.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target.closest<HTMLButtonElement>("button[data-action]") : null;
  const key = target === null ? undefined : keyOf(target);
  if (target === null || key === undefined) return;
  const action = target.dataset["action"];
  const feature = target.closest<HTMLElement>("li.feature")?.dataset["key"];
  if (action === "remove") {
    const index = draft.sides.findIndex((side) => side.key === key);
    change(withoutSide(draft, key));
    renderSides();
    lengthField(Math.min(index, draft.sides.length - 1))?.focus();
    return;
  }
  if (action === "features") {
    const kinds = target.parentElement?.querySelector<HTMLElement>(".feature-kinds");
    if (kinds === null || kinds === undefined) return;
    kinds.hidden = !kinds.hidden;
    target.setAttribute("aria-expanded", String(!kinds.hidden));
    if (!kinds.hidden) kinds.querySelector("button")?.focus();
    return;
  }
  if (action === "add-feature") {
    const kind = FEATURE_KINDS.find((item) => item === target.dataset["kind"]);
    if (kind === undefined) return;
    const before = new Set(draft.sides.flatMap((side) => side.features.map((item) => item.key)));
    change(withNewFeature(draft, key, kind));
    renderSides();
    const added = draft.sides.flatMap((side) => side.features).find((item) => !before.has(item.key));
    if (added !== undefined) featureField(added.key)?.focus();
    return;
  }
  if (feature === undefined) return;
  if (action === "remove-feature") {
    change(withoutFeature(draft, feature));
    renderSides();
    sidesList.querySelector<HTMLElement>(`li.side[data-key="${CSS.escape(key)}"] [data-action="features"]`)?.focus();
    return;
  }
  if (action === "swap") {
    // The typed number stays: only its corner changes.
    const from = featureOf(draft, feature)?.from;
    if (from === undefined) return;
    change(withFeature(draft, feature, { from: from === "start" ? "end" : "start" }));
    renderSides();
    const field = featureField(feature);
    field?.focus();
    field?.select();
  }
});

byId("add").addEventListener("click", () => {
  change(withNewSide(draft));
  renderSides();
  lengthField(draft.sides.length - 1)?.focus();
});

// The key Enter goes to the next field, so a person types a list of lengths with the number keys only.
form.addEventListener("keydown", (event) => {
  const target = event.target;
  if (event.key !== "Enter" || !(target instanceof HTMLInputElement) || target.type !== "text") return;
  event.preventDefault();
  const fields = [...form.querySelectorAll<HTMLElement>('input[type="text"], #add')].filter((field) => field.closest("[hidden]") === null);
  const next = fields[fields.indexOf(target) + 1];
  if (next === undefined) return;
  next.focus({ preventScroll: true });
  if (next instanceof HTMLInputElement) next.select();
  // The next wall or feature goes below the drawing, which stays at the top of a small screen.
  (next.closest("li.feature") ?? next.closest("li.side") ?? next).scrollIntoView({ block: "nearest" });
});

form.addEventListener("focusin", (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const side = target?.closest<HTMLElement>("li.side")?.dataset["side"];
  activeSide = side === undefined ? undefined : Number(side);
  activeFeature = target?.closest<HTMLElement>("li.feature")?.dataset["key"];
  showActive();
});

form.addEventListener("focusout", () => {
  activeSide = undefined;
  activeFeature = undefined;
  showActive();
});

planButton.addEventListener("click", () => {
  leaveRoom();
  showView();
  showDrawing();
});

roomButton.addEventListener("click", () => {
  if (view === "room") return;
  enterRoom().catch(() => {
    leaveRoom();
    showView();
    showDrawing();
    const hint = byId("hint");
    hint.dataset["kind"] = "fault";
    hint.textContent = VIEW_TEXTS[scope].fault;
  });
});

// A name of a room in the list of the doors opens that room, at its door.
levelPanel.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target.closest<HTMLElement>("button[data-open]") : null;
  if (target !== null) openRoom(Number(target.dataset["open"]), target.dataset["feature"]);
});

/** The name of the files of the rooms together. */
const LEVEL_FILE = "rooms";

/** This function gives the measurements as text: the survey record of the room, or the level record of the rooms together. */
const surveyText = (): string => JSON.stringify(shownWhole() === undefined ? surveyOf(draft) : levelOf(store), null, 2);

/** This function gives a text to the visitor as a file. */
function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const link = h("a", { href: url, download: name });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}

const copy = byId<HTMLButtonElement>("copy-survey");
copy.addEventListener("click", () => {
  void copyText(copy, surveyText());
});

byId("save-survey").addEventListener("click", () => {
  download(shownWhole() === undefined ? fileName(draft, "survey") : `${LEVEL_FILE}.level.json`, surveyText());
});

byId("save-room").addEventListener("click", () => {
  download(shownWhole() === undefined ? fileName(draft, "room") : `${LEVEL_FILE}.room.json`, JSON.stringify(roomOf(), null, 2));
});

/** The action that the visitor confirms. */
let confirmed: (() => void) | undefined;

/** This function makes a change that removes typed numbers. It asks first when the room has numbers of the visitor. */
function replaceRoom(question: string, yes: string, action: () => void): void {
  keepNote.textContent = "";
  if (sameDraft(draft, exampleDraft(draft.mode)) || sameDraft(draft, emptyDraft(draft.mode))) {
    action();
    return;
  }
  confirmed = action;
  byId("confirm-text").textContent = question;
  byId("confirm-yes").textContent = yes;
  byId("confirm").hidden = false;
  byId("confirm-no").focus();
}

function closeConfirm(): void {
  confirmed = undefined;
  byId("confirm").hidden = true;
}

byId("confirm-yes").addEventListener("click", () => {
  const action = confirmed;
  closeConfirm();
  action?.();
});

byId("confirm-no").addEventListener("click", closeConfirm);

byId("clear").addEventListener("click", () => {
  replaceRoom(`This removes the room "${roomName(draft, store.active)}" and each of its numbers from the page.`, "Remove the room", () => {
    const only = store.rooms.length === 1;
    show(withoutRoom(store, store.active));
    // The only room of the page becomes an empty room, and a person types its first wall.
    if (only) lengthField(0)?.focus();
    else roomList.querySelector<HTMLElement>('button[aria-current="true"]')?.focus();
  });
});

roomList.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target.closest<HTMLElement>("button[data-room], button[data-scope]") : null;
  if (target === null) return;
  if (target.dataset["scope"] === "all") openAll();
  else openRoom(Number(target.dataset["room"]));
});

addRoom.addEventListener("click", () => {
  closeConfirm();
  keepNote.textContent = "";
  show(withNewRoom(store, emptyDraft(draft.mode)), "room");
  nameField.focus();
});

const fileField = byId<HTMLInputElement>("open-file");

byId("open-survey").addEventListener("click", () => {
  fileField.click();
});

/**
 * This function adds rooms to the rooms of the page, with the doors between them. No room of the visitor goes away.
 * The page then shows the new room, or the rooms together when there are two new rooms or more.
 * When the page cannot keep each new room, the function tells it with the instruction `again`, and it gives `false`.
 */
function addRooms(drafts: LevelDrafts, again: string): boolean {
  const next = withNewRooms(store, drafts.rooms, drafts.connections, true);
  if (next === store) {
    keepNote.textContent = `The page keeps ${String(MOST_ROOMS)} rooms at most. ${again}`;
    return false;
  }
  closeConfirm();
  show(next, drafts.rooms.length > 1 ? "all" : "room");
  return true;
}

/** The instruction for a file with more rooms than the page can add. */
const FULL_FOR_FILE = "Remove a room, then open the file again.";

/** This function reads a file of measurements and adds its room, or its rooms, to the rooms of the page. */
async function openFile(file: File): Promise<void> {
  const refuse = "This file is not a file of measurements.";
  if (file.size > LARGEST_FILE) {
    keepNote.textContent = refuse;
    return;
  }
  let value: unknown;
  try {
    value = JSON.parse(await file.text());
  } catch {
    keepNote.textContent = refuse;
    return;
  }
  const { levelSchema, surveySchema } = await import("@mark1russell7/room-view/schema");
  const survey = surveySchema.safeParse(value);
  if (survey.success) {
    const more = hasMore(survey.data);
    if (!addRooms({ rooms: [draftOf(survey.data)], connections: [], more }, FULL_FOR_FILE)) return;
    keepNote.textContent = more ? "The page shows the walls, the doors, the windows and the outlets of the file. It does not keep the other data of the file yet." : "The page shows the room of the file.";
    return;
  }
  // A file from the rooms together has each room and the doors between them.
  const level = levelSchema.safeParse(value);
  if (!level.success || level.data.rooms.length === 0) {
    keepNote.textContent = refuse;
    return;
  }
  const drafts = draftsOf(level.data);
  if (!addRooms(drafts, FULL_FOR_FILE)) return;
  keepNote.textContent = drafts.more ? "The page shows the rooms of the file and the doors between them. It does not keep the other data of the file yet." : "The page shows the rooms of the file.";
}

/** This function adds the example apartment to the rooms of the page: four rooms with the doors between them. */
async function openExample(): Promise<void> {
  const { SAMPLE_LEVEL } = await import("@mark1russell7/room-view/sample");
  if (!addRooms(draftsOf(SAMPLE_LEVEL), "Remove rooms, then select the example again.")) return;
  keepNote.textContent = "The page shows the example apartment. Select a room to see its numbers.";
  roomList.querySelector<HTMLElement>('button[aria-current="true"]')?.focus();
}

for (const button of [byId("see-example"), byId("open-example")]) {
  button.addEventListener("click", () => {
    keepNote.textContent = "";
    openExample().catch(() => {
      keepNote.textContent = "The page did not load the example. Select it again.";
    });
  });
}

fileField.addEventListener("change", () => {
  const file = fileField.files?.[0];
  fileField.value = "";
  if (file === undefined) return;
  openFile(file).catch(() => {
    keepNote.textContent = "The page did not read the file. Open it again.";
  });
});

for (const mode of LENGTH_MODES) modeField.append(h("option", { value: mode }, MODE_NAMES[mode]));

setupTheme(byId<HTMLButtonElement>("theme"), "theme");
onThemeChange(showTheme);
new ResizeObserver(showDrawing).observe(planBox);

// The list of the walls leaves space for the drawing when the page scrolls to a wall.
new ResizeObserver(() => {
  document.documentElement.style.setProperty("--board", `${String(board.offsetHeight)}px`);
}).observe(board);

renderForm();
refresh();
