import { DEFAULT_NEAR_LOAD, ELECTRICAL_SCHEMA } from "@mark1russell7/electrical";
import { SAMPLE_ELECTRICAL_SCENE, SAMPLE_SCENE_LAYER } from "@mark1russell7/electrical/sample";
import { recordName, sceneSpace } from "@mark1russell7/room-view";
import type { ViewerPick, ViewerRecord, ViewerTheme } from "@mark1russell7/room-view/three";
import { levelShape, type Mark } from "@mark1russell7/visuals/marks";
import { byId, copyText, h, setupTheme } from "@mark1russell7/site-pages/chrome";
import { isDark, onThemeChange } from "./dark.ts";
import { circuitRows, detailsOf, legendRows, partGroups, partKey, partName, roomDetails, type PartRecord } from "./details.ts";
import { createPlanView, type RoomStage } from "./plan.ts";

// The sample room of the core, with the electrical layer of the add-on: its outlets, its circuits and its feeds.
const scene = SAMPLE_ELECTRICAL_SCENE;
const electrical = SAMPLE_SCENE_LAYER;
const circuits = circuitRows(electrical);

/** The part of each mark of the electrical add-on: an outlet gives its outlet, and a feed gives the object that it feeds. */
const markParts = new Map<string, PartRecord>([
  ...(electrical.outlets ?? []).map((outlet) => [recordName(ELECTRICAL_SCHEMA, outlet.id), { kind: "outlet", source: outlet.id }] as const),
  ...(electrical.feeds ?? []).map((feed) => [recordName(ELECTRICAL_SCHEMA, feed.id), { kind: "object", source: feed.object }] as const),
]);

/** This function gives the record of a part for the viewer. An outlet gives the name of its mark, and a part of the scene gives its solids. */
const stageRecord = (record: PartRecord): ViewerRecord | string => (record.kind === "outlet" ? recordName(ELECTRICAL_SCHEMA, record.source) : { kind: record.kind, source: record.source });

const viewerBox = byId("viewer");
const detailsBox = byId("details");
const readout = byId("readout");
const hint = byId("hint");

/** The viewer of the room: the 3D viewer, or the plan in a browser with no WebGL 2. The page has none until the code of the viewer loads. */
let stage: RoomStage | undefined;
/** The light colors and the dark colors of the viewer. */
let themes: { readonly light: ViewerTheme; readonly dark: ViewerTheme } | undefined;
/** The part whose details the page shows. */
let selected: PartRecord | undefined;
/** The parts under the pointer, or of the control under the pointer. */
let pointed: readonly PartRecord[] = [];
/** The circuit that a person selected. Its parts keep their marks. */
let pinned: string | undefined;

const partButtons = new Map<string, HTMLButtonElement>();
const circuitButtons = new Map<string, HTMLButtonElement>();

function showTheme(): void {
  if (themes !== undefined) stage?.setTheme(isDark() ? themes.dark : themes.light);
}

/** This function shows the marks: the parts under the pointer, else the parts of the selected circuit. */
function showMarks(): void {
  const marked = pointed.length > 0 ? pointed : (circuits.find((row) => row.id === pinned)?.records ?? []);
  stage?.highlight(marked.map(stageRecord));
  const [only] = pointed.length === 1 ? pointed : selected === undefined ? [] : [selected];
  readout.textContent = only === undefined ? "" : partName(scene, electrical, only);
}

function showDetails(): void {
  const found = selected === undefined ? undefined : detailsOf(scene, electrical, selected);
  const details = found ?? roomDetails(scene, electrical);
  const clear = h("button", { class: "tool", type: "button" }, "Clear the selection");
  clear.addEventListener("click", () => {
    select(undefined);
  });
  const parts = [
    h("h2", { class: "panel-title" }, details.title, details.kind === details.title ? null : h("span", { class: "panel-kind" }, details.kind)),
    h("dl", { class: "rows" }, details.rows.map((row) => h("div", {}, h("dt", {}, row.label), h("dd", {}, row.value)))),
    details.record === undefined ? null : h("h3", { class: "record-title" }, "Its record in the room data"),
    details.record === undefined ? null : h("pre", { class: "record" }, details.record),
    found === undefined ? h("p", { class: "panel-note" }, "Select a part of the room to see its measurements.") : clear,
  ];
  detailsBox.replaceChildren(...parts.filter((part) => part !== null));
}

function select(record: PartRecord | undefined): void {
  selected = record;
  stage?.select(record === undefined ? undefined : stageRecord(record));
  const key = record === undefined ? undefined : partKey(record);
  for (const [name, button] of partButtons) button.setAttribute("aria-pressed", String(name === key));
  showDetails();
  showMarks();
}

function point(records: readonly PartRecord[]): void {
  pointed = records;
  showMarks();
}

function pin(circuit: string | undefined): void {
  pinned = circuit;
  for (const [id, button] of circuitButtons) button.setAttribute("aria-pressed", String(id === circuit));
  showMarks();
}

/** This function gives a control the marks of its parts while the pointer or the keyboard is on it. */
function marksWhileOn(button: HTMLButtonElement, records: readonly PartRecord[]): void {
  button.addEventListener("pointerenter", (event) => {
    if (event.pointerType !== "touch") point(records);
  });
  button.addEventListener("pointerleave", () => {
    point([]);
  });
  button.addEventListener("focus", () => {
    if (button.matches(":focus-visible")) point(records);
  });
  button.addEventListener("blur", () => {
    point([]);
  });
}

function showCircuits(): void {
  const list = byId("circuits");
  for (const row of circuits) {
    const track = h("span", { class: "meter-track", "aria-hidden": "true" }, h("span", { class: "meter-fill" }), h("span", { class: "meter-tick" }));
    track.style.setProperty("--fill", String(row.fill));
    track.style.setProperty("--near", String(DEFAULT_NEAR_LOAD));
    const button = h(
      "button",
      { class: "meter", type: "button", "data-level": row.level, "data-circuit": row.id, "aria-pressed": "false" },
      h("span", { class: "meter-name" }, row.name),
      h("span", { class: "meter-status" }, h("span", { class: "level-mark", "data-shape": levelShape(row.level), "aria-hidden": "true" }), row.status),
      track,
      h("span", { class: "meter-figure" }, row.figure),
    );
    button.addEventListener("click", () => {
      pin(pinned === row.id ? undefined : row.id);
    });
    marksWhileOn(button, row.records);
    circuitButtons.set(row.id, button);
    list.append(h("li", {}, button));
  }
}

/** This function shows the legend of the outlets: the sign of each level, and the number of the outlets with the level. */
function showLegend(): void {
  const list = byId("legend");
  for (const row of legendRows(electrical)) {
    const mark = h("span", { class: "level-mark", "data-shape": row.shape, "aria-hidden": "true" });
    list.append(h("li", { class: "legend-item", "data-level": row.level, "data-count": String(row.count) }, mark, `${row.label}: ${String(row.count)}`));
  }
}

function showParts(): void {
  const box = byId("parts");
  for (const group of partGroups(scene, electrical)) {
    const chips = h("ul", { class: "chips" });
    for (const part of group.parts) {
      const key = partKey(part.record);
      const button = h("button", { class: "chip", type: "button", "data-record": key, "aria-pressed": "false" }, part.name);
      button.addEventListener("click", () => {
        select(selected !== undefined && partKey(selected) === key ? undefined : part.record);
      });
      marksWhileOn(button, [part.record]);
      partButtons.set(key, button);
      chips.append(h("li", {}, button));
    }
    box.append(h("section", { class: "group" }, h("h3", {}, group.title), chips));
  }
}

/** This function gives the part under the pointer: the part of a mark, else the part of a solid. */
function recordOf(pick: ViewerPick | undefined, mark: Mark | undefined): PartRecord | undefined {
  if (mark !== undefined) return markParts.get(mark.record);
  return pick === undefined ? undefined : { kind: pick.kind, source: pick.source };
}

/** This function loads the code of the viewer and the marks, and shows the room. The first paint of the page does not wait for them. */
async function showRoom(): Promise<void> {
  const [three, { electricalMarks }] = await Promise.all([import("@mark1russell7/room-view/three"), import("@mark1russell7/electrical/marks")]);
  themes = { light: three.LIGHT_THEME, dark: three.DARK_THEME };
  const options = {
    scene,
    marks: electricalMarks(electrical, sceneSpace(scene)),
    theme: isDark() ? themes.dark : themes.light,
    label: "3D model of the sample room",
    onHover: (pick: ViewerPick | undefined, mark?: Mark): void => {
      const record = recordOf(pick, mark);
      point(record === undefined ? [] : [record]);
    },
    onSelect: (pick: ViewerPick | undefined, mark?: Mark): void => {
      select(recordOf(pick, mark));
    },
  };
  const viewer = three.createRoomViewer(viewerBox, options);
  if (viewer === undefined) {
    stage = createPlanView(viewerBox, { ...options, label: "Plan of the sample room" });
    byId("views").hidden = true;
    hint.textContent = "This browser has no WebGL 2, so the page shows the plan of the room.";
  } else {
    stage = viewer;
    if (matchMedia("(pointer: coarse)").matches) hint.textContent = "Drag to turn the room. Pinch to zoom.";
    byId("view-home").addEventListener("click", () => {
      viewer.setView("home");
    });
    byId("view-top").addEventListener("click", () => {
      viewer.setView("top");
    });
  }
  stage.select(selected === undefined ? undefined : stageRecord(selected));
  showMarks();
}

setupTheme(byId<HTMLButtonElement>("theme"), "theme");
onThemeChange(showTheme);

const copy = byId<HTMLButtonElement>("copy");
copy.addEventListener("click", () => {
  void copyText(copy, byId("install").textContent ?? "");
});

showCircuits();
showLegend();
showParts();
showDetails();
showRoom().catch(() => {
  viewerBox.replaceChildren(h("p", { class: "viewer-note" }, "The viewer did not load. Load the page again."));
  byId("views").hidden = true;
  hint.textContent = "";
});
