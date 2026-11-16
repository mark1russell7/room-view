import { regionArea } from "@mark1russell7/layout-contract";
import { expandSurvey, SCENE_SCHEMA, type Scene, type SurveyResult } from "@mark1russell7/room-view";
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
  fileName,
  hasMoreThanWalls,
  LENGTH_MODES,
  lengthText,
  MODE_NAMES,
  parseStore,
  readLength,
  sameDraft,
  statusOf,
  storeText,
  surveyOf,
  withMode,
  withNewSide,
  withoutSide,
  withSide,
  type Corner,
  type Draft,
  type DraftSide,
  type Status,
  type StatusLevel,
  type Store,
  type TypedLength,
} from "./draft.ts";
import { svg } from "./plan.ts";
import { drawWalk, pathOf, type Pixel } from "./walk.ts";

// The page "Measure a room". A person types the length of each wall and the turn at each corner.
// The page keeps the text of each field in a draft, makes the survey record from it, and draws the result.

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

let store: Store = readStore() ?? { version: 1, rooms: [exampleDraft(defaultMode(navigator.language))], active: 0 };
let draft: Draft = store.rooms[store.active] ?? exampleDraft("m");
/**
 * The draft with the numbers that the visitor typed. A change of the units converts this draft, and not the converted numbers.
 * Thus the first units show the typed numbers again, with no error from a second conversion.
 */
let typed: Draft = draft;
let result: SurveyResult = expandSurvey(surveyOf(draft));
let status: Status = statusOf(draft, result);
/** The position of the wall whose field has the focus. */
let activeSide: number | undefined;
let view: "plan" | "room" = "plan";
let viewer: RoomViewer | undefined;
let themes: { readonly light: ViewerTheme; readonly dark: ViewerTheme } | undefined;
/** A browser with no WebGL 2 shows only the drawing. */
let noWebGl = false;
/** The level of the status at the last drawing. The floor of a room appears with a short motion when the walk closes. */
let lastLevel: StatusLevel | undefined;

const form = byId<HTMLFormElement>("form");
const sidesList = byId("sides");
const planBox = byId("plan-box");
const roomBox = byId("room-box");
const planButton = byId<HTMLButtonElement>("view-plan");
const roomButton = byId<HTMLButtonElement>("view-room");
const nameField = byId<HTMLInputElement>("name");
const modeField = byId<HTMLSelectElement>("mode");
const keepNote = byId("keep-note");

const SIGNS: Readonly<Record<StatusLevel, string>> = { typing: "…", open: "!", closed: "✓" };

/** This function gives the fields of a length to a box: feet and inches, or one number with its unit. */
function lengthFields(box: HTMLElement, typed: TypedLength, label: string): void {
  const field = (part: "value" | "inches", text: string, unit: string, name: string): HTMLElement => {
    const input = h("input", { class: "number-field", type: "text", inputmode: "decimal", enterkeyhint: "next", "data-part": part, "aria-label": name });
    input.value = text;
    return h("label", { class: "number" }, input, h("span", { class: "unit", "aria-hidden": "true" }, unit));
  };
  const fields =
    draft.mode === "ft-in"
      ? [field("value", typed.value, "ft", `${label}, feet`), field("inches", typed.inches, "in", `${label}, inches`)]
      : [field("value", typed.value, draft.mode, `${label}, in ${MODE_NAMES[draft.mode].toLowerCase()}`)];
  box.dataset["fields"] = String(fields.length);
  box.replaceChildren(...fields);
}

function sideItem(side: DraftSide, index: number): HTMLLIElement {
  const number = String(index + 1);
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
  );
}

function renderSides(): void {
  sidesList.replaceChildren(...draft.sides.map(sideItem));
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

function showStatus(): void {
  const box = byId("status");
  box.dataset["level"] = status.level;
  byId("status-sign").textContent = SIGNS[status.level];
  byId("status-title").textContent = status.title;
  byId("status-text").textContent = status.text;
}

function showFacts(): void {
  const lengths = draft.sides.map((side) => readLength(side.length, draft.mode));
  const around = lengths.reduce((sum, reading) => sum + (reading.state === "ok" ? reading.value : 0), 0);
  const ring = result.room.floors?.[0]?.ring;
  const rows: (readonly [string, string])[] = [
    ["Walls", String(draft.sides.length)],
    ["Around the room", around > 0 ? lengthText(around, draft.mode) : "No length yet"],
  ];
  if (status.level === "closed" && ring !== undefined) rows.push(["Floor area", areaText(regionArea({ kind: "polygon", points: ring }), draft.mode)]);
  byId("facts").replaceChildren(...rows.map(([label, value]) => h("div", {}, h("dt", {}, label), h("dd", {}, value))));
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

/** This function draws the walk in the box of the drawing. */
function showDrawing(): void {
  const size = { width: planBox.clientWidth, height: planBox.clientHeight };
  if (size.width === 0 || size.height === 0) return;
  const texts = draft.sides.map((side) => {
    const reading = readLength(side.length, draft.mode);
    return reading.state === "ok" && reading.value > 0 ? dimensionText(reading.value, draft.mode) : undefined;
  });
  const drawing = drawWalk(result, size, texts);
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

  planBox.replaceChildren(picture);
  lastLevel = status.level;
  showActive();
}

/** This function marks the wall whose field has the focus. It changes no element of the drawing, so a click on a wall keeps its target. */
function showActive(): void {
  const side = activeSide === undefined ? undefined : String(activeSide);
  for (const element of planBox.querySelectorAll<SVGElement>(".walk-mark, .walk-label")) element.classList.toggle("walk-on", element.dataset["side"] === side);
}

// A click on a wall of the drawing goes to the field of its length.
planBox.addEventListener("click", (event) => {
  const side = event.target instanceof SVGElement ? event.target.dataset["side"] : undefined;
  if (side === undefined) return;
  const field = lengthField(Number(side));
  field?.focus();
  field?.select();
});

function sceneOf(): Scene {
  return { schema: SCENE_SCHEMA, room: result.room };
}

function showTheme(): void {
  if (themes !== undefined) viewer?.setTheme(isDark() ? themes.dark : themes.light);
}

/** This function shows the buttons of the views, the box of the selected view and the hint. */
function showView(): void {
  const closed = status.level === "closed";
  if (view === "room" && !closed) leaveRoom();
  planButton.setAttribute("aria-pressed", String(view === "plan"));
  roomButton.setAttribute("aria-pressed", String(view === "room"));
  roomButton.disabled = !closed || noWebGl;
  planBox.hidden = view !== "plan";
  roomBox.hidden = view !== "room";
  byId("stage").dataset["view"] = view;
  // A small screen shows the hint of the drawing only when it tells a fault: the status has the same facts.
  const hint = byId("hint");
  hint.dataset["kind"] = noWebGl ? "fault" : view;
  if (noWebGl) hint.textContent = "This browser has no WebGL 2, so the page shows only the drawing.";
  else if (view === "room") hint.textContent = matchMedia("(pointer: coarse)").matches ? "Drag to turn the room. Pinch to zoom." : "Drag to turn the room. Click it, then scroll to zoom.";
  else hint.textContent = closed ? "Select 3D room to see the walls with their height." : "The 3D room is ready when the walk closes.";
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
  if (view !== "room" || status.level !== "closed" || viewer !== undefined) return;
  viewer = three.createRoomViewer(roomBox, { scene: sceneOf(), theme: isDark() ? themes.dark : themes.light, label: "3D model of the room" });
  if (viewer !== undefined) return;
  noWebGl = true;
  view = "plan";
  showView();
  showDrawing();
}

/** This function calculates the room of the draft and shows it. */
function refresh(): void {
  result = expandSurvey(surveyOf(draft));
  status = statusOf(draft, result);
  showStatus();
  showFacts();
  showView();
  if (view === "room") viewer?.setScene(sceneOf());
  showDrawing();
  byId("example-note").hidden = !sameDraft(draft, exampleDraft(draft.mode));
  byId<HTMLButtonElement>("save-room").disabled = status.level !== "closed";
}

/** This function makes a change of the draft: the page keeps it in the browser and shows it. */
function change(next: Draft): void {
  draft = next;
  typed = next;
  store = { ...store, rooms: store.rooms.map((room, index) => (index === store.active ? next : room)) };
  try {
    localStorage.setItem(STORE_KEY, storeText(store));
  } catch {
    // A browser with no storage keeps the room only while the page is open.
  }
  refresh();
}

/** This function replaces the room of the page. */
function load(next: Draft): void {
  change(next);
  renderForm();
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
  const target = event.target;
  if (!(target instanceof HTMLButtonElement) || target.dataset["action"] !== "remove") return;
  const key = keyOf(target);
  if (key === undefined) return;
  const index = draft.sides.findIndex((side) => side.key === key);
  change(withoutSide(draft, key));
  renderSides();
  lengthField(Math.min(index, draft.sides.length - 1))?.focus();
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
  // The next wall goes below the drawing, which stays at the top of a small screen.
  (next.closest("li.side") ?? next).scrollIntoView({ block: "nearest" });
});

form.addEventListener("focusin", (event) => {
  const item = event.target instanceof Element ? event.target.closest<HTMLElement>("li.side") : null;
  const side = item?.dataset["side"];
  activeSide = side === undefined ? undefined : Number(side);
  showActive();
});

form.addEventListener("focusout", () => {
  activeSide = undefined;
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
    hint.textContent = "The 3D room did not load. Select 3D room again.";
  });
});

const surveyText = (): string => JSON.stringify(surveyOf(draft), null, 2);

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
  download(fileName(draft, "survey"), surveyText());
});

byId("save-room").addEventListener("click", () => {
  download(fileName(draft, "room"), JSON.stringify(result.room, null, 2));
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
  replaceRoom("This removes each number of the room from the page.", "Remove the numbers", () => {
    load(emptyDraft(draft.mode));
    lengthField(0)?.focus();
  });
});

const fileField = byId<HTMLInputElement>("open-file");

byId("open-survey").addEventListener("click", () => {
  fileField.click();
});

/** This function reads a file of measurements and shows its room. */
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
  const { surveySchema } = await import("@mark1russell7/room-view/schema");
  const parsed = surveySchema.safeParse(value);
  if (!parsed.success) {
    keepNote.textContent = refuse;
    return;
  }
  const survey = parsed.data;
  replaceRoom("This replaces the room of the page with the room of the file.", "Replace the room", () => {
    load(draftOf(survey));
    keepNote.textContent = hasMoreThanWalls(survey) ? "The page shows the walls of the file. It does not keep openings, outlets and checks yet." : "The page shows the room of the file.";
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
const board = byId("board");
new ResizeObserver(() => {
  document.documentElement.style.setProperty("--board", `${String(board.offsetHeight)}px`);
}).observe(board);

renderForm();
refresh();
