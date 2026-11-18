import { checkForm, type FormCollection, type LayerForm } from "@mark1russell7/room-view";
import { describe, expect, it } from "vitest";
import type { PageAddOn } from "./bridge.ts";
import { emptyDraft, ownedOf, recordOf, storeOf, type Draft, type DraftFeature, type DraftObject, type DraftOwned, type OwnedChange, type Store, type TypedLength } from "./draft.ts";
import {
  addFeatureText,
  addText,
  changeOf,
  featuresLabel,
  filePartsText,
  hiddenOf,
  INPUT_GROUPS,
  layerChoices,
  listCounts,
  listItems,
  listSections,
  lowerFirst,
  moreText,
  ownedSections,
  pointSteps,
  recordInputs,
  recordName,
  recordProblem,
  useNote,
  wallPartsText,
  wordsOf,
  type Choice,
  type RecordInput,
} from "./inputs.ts";
import { storeLists, type LayerLists } from "./layers.ts";

/**
 * A false add-on for the tests. The page has no code for it.
 * It has a list (loops), points on a wall (valves), records of an object (panels) and a collection with no place in the page (vents).
 */
const HEAT: LayerForm = {
  schema: "heat/1",
  collections: [
    {
      name: "loops",
      word: "loop",
      label: "Loop",
      title: "Loops",
      idFrom: "name",
      fields: [
        { kind: "text", name: "name", label: "Name" },
        { kind: "number", name: "flow", label: "Flow", unit: "l/min", above: 0, usual: { imperial: 4, metric: 15 }, fault: "Type the flow as a number above 0." },
        { kind: "number", name: "drop", label: "Drop" },
        { kind: "record", name: "after", label: "After", of: "loops" },
        { kind: "record", name: "valve", label: "Valve", of: "valves" },
        { kind: "text", name: "tag", label: "Tag", needed: true },
      ],
    },
    {
      name: "valves",
      word: "Wall valve",
      label: "Valve",
      title: "Valves",
      on: ["wall"],
      height: { imperial: 0.3048, metric: 0.3 },
      fields: [
        { kind: "text", name: "size", label: "Size" },
        { kind: "record", name: "loop", label: "Loop", of: "loops", none: "Not known yet", aid: "Add the loop in Loops first." },
        { kind: "record", name: "next", label: "Next valve", of: "valves" },
      ],
    },
    {
      name: "panels",
      word: "panel",
      label: "Panel",
      title: "Panels",
      owner: "object",
      most: 1,
      fields: [
        { kind: "object", name: "object", label: "Object", needed: true },
        { kind: "record", name: "valve", label: "Valve", of: "valves", needed: true, none: "No valve", aid: "Add a valve to a wall first." },
        { kind: "number", name: "watts", label: "Power", unit: "W", least: 0 },
        { kind: "record", name: "loop", label: "Loop", of: "loops" },
        { kind: "record", name: "twin", label: "Twin", of: "panels" },
      ],
    },
    { name: "vents", word: "vent", label: "Vent", title: "Vents", on: ["floor"], fields: [] },
  ],
};

/** A second false add-on: a list that no record names (ducts), and points on a wall (grilles). */
const AIR: LayerForm = {
  schema: "air/1",
  collections: [
    { name: "ducts", word: "duct", label: "Duct", title: "Ducts", fields: [{ kind: "text", name: "name", label: "Name" }] },
    { name: "grilles", word: "grille", label: "Grille", title: "Grilles", on: ["wall"], height: { imperial: 0.3048, metric: 0.3 }, fields: [] },
  ],
};

const H = HEAT.schema;
const FORMS: readonly LayerForm[] = [HEAT, AIR];

/** The add-on of the first form, with each text that an add-on can give to the page. */
const HEAT_ADD_ON: PageAddOn = {
  form: HEAT,
  hidden: { panels: ["watts"] },
  lists: { loops: { aid: "A loop is one pipe of the floor.", add: "Add a loop" } },
  steps: ["Find each loop at the manifold."],
  note: (collection, values) => (collection === "loops" && typeof values["flow"] === "number" ? `The flow is ${String(values["flow"])}.` : undefined),
};
const AIR_ADD_ON: PageAddOn = { form: AIR };
const ADD_ONS: readonly PageAddOn[] = [HEAT_ADD_ON, AIR_ADD_ON];

/** This function gives a collection of a form. */
function of(form: LayerForm, name: string): FormCollection {
  const collection = form.collections.find((item) => item.name === name);
  if (collection === undefined) throw new Error(`the form has no collection ${name}`);
  return collection;
}

const LOOPS = of(HEAT, "loops");
const VALVES = of(HEAT, "valves");
const PANELS = of(HEAT, "panels");
const DUCTS = of(AIR, "ducts");

const typed = (text = ""): TypedLength => ({ value: text, inches: "" });

/** This function gives a room of 4 by 3, with features and objects on its walls. Each wall has a list of features and a list of objects. */
function room(features: readonly (readonly DraftFeature[])[] = [], objects: readonly (readonly DraftObject[])[] = []): Draft {
  const lengths = ["4", "3", "4", "3"];
  return {
    ...emptyDraft("m"),
    sides: lengths.map((length, index) => ({ key: `s${String(index + 1)}`, length: typed(length), corner: "left", angle: "", features: features[index] ?? [], objects: objects[index] ?? [] })),
  };
}

/** This function gives a point of a collection, with its distance from the start of its wall. */
function point(key: string, offset: string, owned: DraftOwned): DraftFeature {
  return { key, kind: "point", from: "start", offset: typed(offset), width: typed(), height: typed("0.3"), sill: typed(), point: owned };
}

const valve = (key: string, offset: string, fields: OwnedChange = {}): DraftFeature => point(key, offset, ownedOf(H, "valves", fields));
const door = (key: string, offset: string): DraftFeature => ({ key, kind: "door", from: "start", offset: typed(offset), width: typed("0.8"), height: typed("2"), sill: typed() });
const panel = (fields: OwnedChange = {}): DraftOwned => ownedOf(H, "panels", fields);

/** This function gives a heater against a wall, with the records that it owns. */
function heater(key: string, offset: string, owns: readonly DraftOwned[]): DraftObject {
  return { key, kind: "heater", name: "", from: "start", offset: typed(offset), width: typed("0.6"), depth: typed("0.1"), height: typed("0.6"), gap: typed(), lift: typed(), owns, holds: [] };
}

/** The record of the heater of the first room: it names valve 1 and loop 1. */
const PANEL = panel({ values: { watts: "600" }, records: { loop: "r1" }, points: { valve: "f1" } });

/** A room with a door and two valves on wall 1, a grille on wall 2 and a valve on wall 3. Valve 1 names loop 1 and valve 2. */
const ROOM = room(
  [[door("d1", "0.2"), valve("f1", "1.5", { records: { loop: "r1" }, points: { next: "f2" } }), valve("f2", "2.5")], [point("g1", "1", ownedOf(AIR.schema, "grilles"))], [valve("f3", "1")]],
  [[heater("o1", "3", [PANEL])]],
);

/** A second room, with one valve on loop 1. */
const SECOND = room([[valve("f1", "1", { records: { loop: "r1" } })]]);

/**
 * A store with the two rooms, four loops and one duct.
 * Loop 2 has a flow that is not a number. Loop 3 has no tag. Loop 4 comes after loop 1.
 */
const STORE: Store = {
  ...storeOf([ROOM, SECOND]),
  lists: [
    {
      layer: H,
      collection: "loops",
      records: [
        recordOf("r1", { values: { name: " Floor ", flow: "12", tag: "A" } }),
        recordOf("r2", { values: { flow: "x" } }),
        recordOf("r3", { values: { name: "Wall" } }),
        recordOf("r4", { values: { name: "Roof", tag: "B" }, records: { after: "r1" } }),
      ],
    },
    { layer: AIR.schema, collection: "ducts", records: [recordOf("k1", { values: { name: "Main" } })] },
  ],
};

/** The choices of the loops and of the valves of the first room. */
const LOOP_CHOICES: readonly Choice[] = [
  { key: "r1", text: "Floor" },
  { key: "r2", text: "Loop 2" },
  { key: "r3", text: "Wall" },
  { key: "r4", text: "Roof" },
];
const VALVE_CHOICES: readonly Choice[] = [
  { key: "f1", text: "Valve 1, wall 1" },
  { key: "f2", text: "Valve 2, wall 1" },
  { key: "f3", text: "Valve 3, wall 3" },
];

const CHOICES = layerChoices(HEAT, STORE, ROOM, FORMS);

/** This function gives the lists of a store for the first form, as the page reads them. */
function listsOf(store: Store): LayerLists {
  const lists = storeLists(store, ADD_ONS).get(H);
  if (lists === undefined) throw new Error("the store has no lists for the form");
  return lists;
}

/** This function gives one input of a list of inputs. */
function input(inputs: readonly RecordInput[], name: string): RecordInput {
  const found = inputs.find((item) => item.name === name);
  if (found === undefined) throw new Error(`no input ${name}`);
  return found;
}

/** This function gives the inputs of a loop with the values of its texts and numbers. */
const loopInputs = (values: Readonly<Record<string, string>>, system: "metric" | "imperial" = "metric"): readonly RecordInput[] => recordInputs(HEAT, LOOPS, { values, records: {} }, system, CHOICES);

describe("the false add-ons", () => {
  it("are valid forms", () => {
    expect(checkForm(HEAT)).toEqual([]);
    expect(checkForm(AIR)).toEqual([]);
  });
});

describe("lowerFirst", () => {
  it("makes the first letter small", () => {
    expect(lowerFirst("Outlets")).toBe("outlets");
    expect(lowerFirst("Water taps")).toBe("water taps");
    expect(lowerFirst("A")).toBe("a");
    expect(lowerFirst("Main Hall")).toBe("main Hall");
    expect(lowerFirst("Éclairs")).toBe("éclairs");
  });

  it("keeps a text that starts with two capital letters, and an empty text", () => {
    expect(lowerFirst("TV sets")).toBe("TV sets");
    expect(lowerFirst("already small")).toBe("already small");
    expect(lowerFirst("")).toBe("");
  });
});

describe("wordsOf", () => {
  it("gives the words of the word of a collection, in small letters", () => {
    expect(wordsOf(LOOPS)).toBe("loop");
    expect(wordsOf(VALVES)).toBe("wall valve");
    expect(wordsOf({ ...LOOPS, word: " Shut-off  VALVE " })).toBe("shut off valve");
  });

  it("gives `record` for no collection, and for a collection with no word", () => {
    expect(wordsOf(undefined)).toBe("record");
    expect(wordsOf({ ...LOOPS, word: "" })).toBe("record");
    expect(wordsOf({ ...LOOPS, word: " - " })).toBe("record");
  });
});

describe("changeOf", () => {
  it("gives the change of one text in its group", () => {
    expect(INPUT_GROUPS).toEqual(["values", "records", "points"]);
    expect(changeOf("values", "flow", "12")).toEqual({ values: { flow: "12" } });
    expect(changeOf("records", "loop", "r1")).toEqual({ records: { loop: "r1" } });
    expect(changeOf("points", "valve", "")).toEqual({ points: { valve: "" } });
  });

  it("keeps a name that an object has by itself as a field", () => {
    const change = changeOf("values", "__proto__", "x");
    expect(Object.hasOwn(change.values ?? {}, "__proto__")).toBe(true);
    expect(Object.keys(change)).toEqual(["values"]);
  });
});

describe("recordName", () => {
  it("gives the text of the name field, with no space at its ends", () => {
    expect(recordName(LOOPS, recordOf("r1", { values: { name: " Floor " } }), 0)).toBe("Floor");
  });

  it("gives the label and the position for a record with no name", () => {
    expect(recordName(LOOPS, recordOf("r2"), 1)).toBe("Loop 2");
    expect(recordName(LOOPS, recordOf("r2", { values: { name: "  " } }), 4)).toBe("Loop 5");
  });

  it("gives the label and the position for a collection with no name field", () => {
    expect(recordName(DUCTS, recordOf("k1", { values: { name: "Main" } }), 0)).toBe("Duct 1");
  });
});

describe("layerChoices", () => {
  it("gives the records of each list, and the points of the room for each collection of points", () => {
    expect([...CHOICES.keys()]).toEqual(["loops", "valves"]);
    expect(CHOICES.get("loops")).toEqual(LOOP_CHOICES);
    expect(CHOICES.get("valves")).toEqual(VALVE_CHOICES);
  });

  it("gives only the points of its own layer", () => {
    const air = layerChoices(AIR, STORE, ROOM, FORMS);
    expect(air.get("ducts")).toEqual([{ key: "k1", text: "Duct 1" }]);
    expect(air.get("grilles")).toEqual([{ key: "g1", text: "Grille 1, wall 2" }]);
    // A point of a different layer is not a choice, with the same name of collection also.
    const mixed = room([[valve("f1", "1"), point("x1", "2", ownedOf(AIR.schema, "valves"))]]);
    expect(layerChoices(HEAT, STORE, mixed, FORMS).get("valves")).toEqual([{ key: "f1", text: "Valve 1, wall 1" }]);
  });

  it("gives the points of each collection of a form with two collections of points", () => {
    const two: LayerForm = { ...AIR, collections: [...AIR.collections, { ...of(AIR, "grilles"), name: "fans", word: "fan", label: "Fan", title: "Fans" }] };
    expect(checkForm(two)).toEqual([]);
    const choices = layerChoices(two, STORE, ROOM, [HEAT, two]);
    expect(choices.get("grilles")).toEqual([{ key: "g1", text: "Grille 1, wall 2" }]);
    expect(choices.get("fans")).toEqual([]);
  });

  it("gives no point with no room, and the points of the room that it gets", () => {
    expect(layerChoices(HEAT, STORE, undefined, FORMS).get("valves")).toEqual([]);
    expect(layerChoices(HEAT, STORE, undefined, FORMS).get("loops")).toEqual(LOOP_CHOICES);
    expect(layerChoices(HEAT, STORE, SECOND, FORMS).get("valves")).toEqual([{ key: "f1", text: "Valve 1, wall 1" }]);
  });
});

describe("hiddenOf", () => {
  it("gives the hidden fields of a collection", () => {
    expect(hiddenOf(HEAT_ADD_ON, "panels")).toEqual(["watts"]);
  });

  it("gives no field for a different collection, and for an add-on with no hidden field", () => {
    expect(hiddenOf(HEAT_ADD_ON, "loops")).toEqual([]);
    expect(hiddenOf(HEAT_ADD_ON, "toString")).toEqual([]);
    expect(hiddenOf(AIR_ADD_ON, "panels")).toEqual([]);
  });
});

describe("recordInputs", () => {
  it("gives the inputs of a record of a list, in the sequence of the form", () => {
    expect(recordInputs(HEAT, LOOPS, { values: { name: " Floor ", flow: "12", tag: "A" }, records: {} }, "metric", CHOICES)).toEqual([
      { kind: "text", name: "name", label: "Name", needed: false, group: "values", text: " Floor ", state: "ok" },
      { kind: "number", name: "flow", label: "Flow", needed: false, group: "values", text: "12", unit: "l/min", usual: "15", fault: "Type the flow as a number above 0.", state: "ok" },
      { kind: "number", name: "drop", label: "Drop", needed: false, group: "values", text: "", unit: undefined, usual: undefined, fault: 'Type a number for "Drop".', state: "ok" },
      { kind: "choice", name: "after", label: "After", needed: false, group: "records", key: "", none: "None", choices: LOOP_CHOICES, aid: undefined, state: "ok" },
      { kind: "text", name: "tag", label: "Tag", needed: true, group: "values", text: "A", state: "ok" },
    ]);
  });

  it("gives a record of a list no input for a point", () => {
    const names = loopInputs({}).map((item) => item.name);
    expect(names).toEqual(["name", "flow", "drop", "after", "tag"]);
    // The same field is an input in a record of a room.
    expect(recordInputs(HEAT, { ...PANELS, fields: LOOPS.fields }, { values: {}, records: {} }, "metric", CHOICES).map((item) => item.name)).toContain("valve");
  });

  it("gives the usual value of the system of units", () => {
    expect(input(loopInputs({}, "metric"), "flow")).toMatchObject({ usual: "15", text: "", state: "ok" });
    expect(input(loopInputs({}, "imperial"), "flow")).toMatchObject({ usual: "4", text: "", state: "ok" });
  });

  it("tells a number that the form does not accept", () => {
    const state = (values: Readonly<Record<string, string>>, name: string): string => input(loopInputs(values), name).state;
    expect(state({ flow: "x" }, "flow")).toBe("bad");
    expect(state({ flow: "0" }, "flow")).toBe("bad");
    expect(state({ flow: "-1" }, "flow")).toBe("bad");
    expect(state({ flow: "0,5" }, "flow")).toBe("ok");
    expect(state({ flow: " 12 " }, "flow")).toBe("ok");
    // A number with no limit accepts each number, and no text that is not a number.
    expect(state({ drop: "-1" }, "drop")).toBe("ok");
    expect(state({ drop: "1e3x" }, "drop")).toBe("bad");
    // A number with a least value accepts that value.
    const watts = (text: string): string => input(recordInputs(HEAT, PANELS, { values: { watts: text }, records: {} }, "metric", CHOICES), "watts").state;
    expect(watts("0")).toBe("ok");
    expect(watts("-0.5")).toBe("bad");
  });

  it("tells a text that the form needs and that has no value", () => {
    expect(input(loopInputs({}), "tag").state).toBe("empty");
    expect(input(loopInputs({ tag: "  " }), "tag").state).toBe("empty");
    expect(input(loopInputs({ tag: " A " }), "tag").state).toBe("ok");
    // A text that the form does not need is good with no value.
    expect(input(loopInputs({}), "name").state).toBe("ok");
  });

  it("gives the inputs of the record of a point: a text, a record of a list and a point of the room", () => {
    expect(recordInputs(HEAT, VALVES, ownedOf(H, "valves", { records: { loop: "r1" }, points: { next: "f2" } }), "metric", CHOICES)).toEqual([
      { kind: "text", name: "size", label: "Size", needed: false, group: "values", text: "", state: "ok" },
      { kind: "choice", name: "loop", label: "Loop", needed: false, group: "records", key: "r1", none: "Not known yet", choices: LOOP_CHOICES, aid: undefined, state: "ok" },
      { kind: "choice", name: "next", label: "Next valve", needed: false, group: "points", key: "f2", none: "None", choices: VALVE_CHOICES, aid: undefined, state: "ok" },
    ]);
  });

  it("reads the name of a record of a list from the records, and the name of a point from the points", () => {
    // The two groups are different, so a key in the wrong group is no name.
    const inputs = recordInputs(HEAT, VALVES, ownedOf(H, "valves", { records: { next: "f2" }, points: { loop: "r1" } }), "metric", CHOICES);
    expect(input(inputs, "loop")).toMatchObject({ key: "" });
    expect(input(inputs, "next")).toMatchObject({ key: "" });
    // A record with no group of points names no point.
    expect(input(recordInputs(HEAT, VALVES, { values: {}, records: {} }, "metric", CHOICES), "next")).toMatchObject({ key: "", group: "points" });
  });

  it("gives no record for a name with no record", () => {
    const inputs = recordInputs(HEAT, VALVES, ownedOf(H, "valves", { records: { loop: "r9" }, points: { next: "f9" } }), "metric", CHOICES);
    expect(input(inputs, "loop")).toMatchObject({ key: "", choices: LOOP_CHOICES, aid: undefined });
    expect(input(inputs, "next")).toMatchObject({ key: "", choices: VALVE_CHOICES });
  });

  it("gives the aid of the form in place of the choices when there is no record to name", () => {
    const none = layerChoices(HEAT, storeOf([room()]), room(), FORMS);
    const inputs = recordInputs(HEAT, VALVES, ownedOf(H, "valves", { records: { loop: "r1" } }), "metric", none);
    expect(input(inputs, "loop")).toMatchObject({ key: "", choices: [], aid: "Add the loop in Loops first.", state: "ok" });
    // A field with no aid in its form has none.
    expect(input(inputs, "next")).toMatchObject({ key: "", choices: [], aid: undefined });
    // No choices at all is no record to name.
    expect(input(recordInputs(HEAT, VALVES, ownedOf(H, "valves"), "metric", new Map()), "loop")).toMatchObject({ choices: [], aid: "Add the loop in Loops first." });
  });

  it("gives the inputs of a record that an object owns, with no input for the object and for a record of an object", () => {
    expect(recordInputs(HEAT, PANELS, PANEL, "metric", CHOICES)).toEqual([
      { kind: "choice", name: "valve", label: "Valve", needed: true, group: "points", key: "f1", none: "No valve", choices: VALVE_CHOICES, aid: undefined, state: "ok" },
      { kind: "number", name: "watts", label: "Power", needed: false, group: "values", text: "600", unit: "W", usual: undefined, fault: 'Type a number for "Power".', state: "ok" },
      { kind: "choice", name: "loop", label: "Loop", needed: false, group: "records", key: "r1", none: "None", choices: LOOP_CHOICES, aid: undefined, state: "ok" },
    ]);
  });

  it("gives no input for a hidden field", () => {
    expect(recordInputs(HEAT, PANELS, PANEL, "metric", CHOICES, ["watts"]).map((item) => item.name)).toEqual(["valve", "loop"]);
    expect(recordInputs(HEAT, PANELS, PANEL, "metric", CHOICES, ["valve", "loop", "other"]).map((item) => item.name)).toEqual(["watts"]);
  });

  it("tells a choice that the form needs and that names no record", () => {
    expect(input(recordInputs(HEAT, PANELS, panel(), "metric", CHOICES), "valve")).toMatchObject({ key: "", state: "empty" });
    expect(input(recordInputs(HEAT, PANELS, panel({ points: { valve: "f9" } }), "metric", CHOICES), "valve")).toMatchObject({ key: "", state: "empty" });
    expect(input(recordInputs(HEAT, PANELS, panel(), "metric", CHOICES), "loop")).toMatchObject({ key: "", state: "ok" });
  });

  it("gives no input for a field that names a collection that the form does not have", () => {
    const collection: FormCollection = { ...VALVES, fields: [{ kind: "record", name: "pump", label: "Pump", of: "pumps" }] };
    expect(recordInputs(HEAT, collection, ownedOf(H, "valves"), "metric", CHOICES)).toEqual([]);
  });
});

describe("recordProblem", () => {
  it("gives no problem for a good record", () => {
    expect(recordProblem(LOOPS, loopInputs({ flow: "12", tag: "A" }))).toBeUndefined();
    expect(recordProblem(LOOPS, [])).toBeUndefined();
  });

  it("gives the sentence of the form for a number that the form does not accept", () => {
    expect(recordProblem(LOOPS, loopInputs({ flow: "x", tag: "A" }))).toEqual({ level: "error", field: "flow", text: "Type the flow as a number above 0." });
    expect(recordProblem(LOOPS, loopInputs({ drop: "x", tag: "A" }))).toEqual({ level: "error", field: "drop", text: 'Type a number for "Drop".' });
    // The first such number gives the sentence.
    expect(recordProblem(LOOPS, loopInputs({ flow: "0", drop: "x" }))?.field).toBe("flow");
  });

  it("tells the first field that needs a value", () => {
    expect(recordProblem(LOOPS, loopInputs({ flow: "12" }))).toEqual({ level: "lack", field: "tag", text: 'This loop is not in a file yet, because "Tag" has no value.' });
    expect(recordProblem(PANELS, recordInputs(HEAT, PANELS, panel(), "metric", CHOICES))).toEqual({
      level: "lack",
      field: "valve",
      text: 'This panel is not in a file yet, because "Valve" has no value.',
    });
  });

  it("tells a number that the form does not accept before a field with no value", () => {
    const collection: FormCollection = { ...LOOPS, fields: [...LOOPS.fields].reverse() };
    const inputs = recordInputs(HEAT, collection, { values: { flow: "x" }, records: {} }, "metric", CHOICES);
    expect(inputs.map((item) => item.name)).toEqual(["tag", "after", "drop", "flow", "name"]);
    expect(recordProblem(collection, inputs)).toMatchObject({ level: "error", field: "flow" });
  });

  it("tells the first of two fields that need a value", () => {
    const collection: FormCollection = {
      ...LOOPS,
      fields: [
        { kind: "text", name: "a", label: "A", needed: true },
        { kind: "text", name: "b", label: "B", needed: true },
      ],
    };
    const inputs = recordInputs(HEAT, collection, { values: {}, records: {} }, "metric", CHOICES);
    expect(inputs.map((item) => item.state)).toEqual(["empty", "empty"]);
    expect(recordProblem(collection, inputs)).toMatchObject({ level: "lack", field: "a" });
  });
});

describe("useNote", () => {
  it("counts the records of the rooms that name a record, by their collection, and the rooms", () => {
    expect(useNote(STORE, "r1", HEAT, LOOPS, FORMS)).toBe("2 wall valves and 1 panel in 2 rooms use this loop.");
  });

  it("tells one record in one room", () => {
    const store: Store = { ...STORE, rooms: [SECOND, room()] };
    expect(useNote(store, "r1", HEAT, LOOPS, FORMS)).toBe("1 wall valve in 1 room uses this loop.");
  });

  it("tells the collections that can name a record with no use", () => {
    expect(useNote(STORE, "r2", HEAT, LOOPS, FORMS)).toBe("No wall valve or panel uses this loop yet.");
    // A record of a list that names the record is not a use in a room.
    expect(useNote(STORE, "r4", HEAT, LOOPS, FORMS)).toBe("No wall valve or panel uses this loop yet.");
  });

  it("gives no text when no record of a room can name the record", () => {
    expect(useNote(STORE, "k1", AIR, DUCTS, FORMS)).toBe("");
    // A field of a list is not a field of a record of a room.
    const form: LayerForm = { ...HEAT, collections: [LOOPS] };
    expect(useNote(STORE, "r2", form, LOOPS, [form])).toBe("");
  });

  it("gives no text for a list that no record names, in a form with records that name a different list", () => {
    const pumps: FormCollection = { name: "pumps", word: "pump", label: "Pump", title: "Pumps", fields: [] };
    const form: LayerForm = { ...HEAT, collections: [...HEAT.collections, pumps] };
    expect(checkForm(form)).toEqual([]);
    expect(useNote(STORE, "p1", form, pumps, [form, AIR])).toBe("");
  });

  it("uses the word `record` for a collection that the forms do not have", () => {
    expect(useNote(STORE, "r1", HEAT, LOOPS, [])).toBe("3 records in 2 rooms use this loop.");
  });
});

describe("listItems", () => {
  const items = listItems(HEAT_ADD_ON, LOOPS, STORE, listsOf(STORE), FORMS);

  it("gives each record of the list with its key, its title and its inputs", () => {
    expect(items.map((item) => [item.key, item.title])).toEqual([
      ["r1", "Loop 1"],
      ["r2", "Loop 2"],
      ["r3", "Loop 3"],
      ["r4", "Loop 4"],
    ]);
    expect(items[0]?.inputs).toEqual(recordInputs(HEAT, LOOPS, { values: { name: " Floor ", flow: "12", tag: "A" }, records: {} }, "metric", layerChoices(HEAT, STORE, undefined, FORMS)));
    expect(input(items[3]?.inputs ?? [], "after")).toMatchObject({ key: "r1" });
  });

  it("gives the sentence of the add-on and the use of a good record", () => {
    expect(items[0]?.note).toEqual({ level: "note", field: undefined, text: "The flow is 12. 2 wall valves and 1 panel in 2 rooms use this loop." });
    // The add-on gets the usual value of a number with no text.
    expect(items[3]?.note).toEqual({ level: "note", field: undefined, text: "The flow is 15. No wall valve or panel uses this loop yet." });
  });

  it("gives the problem of a record in place of the other sentences", () => {
    expect(items[1]?.note).toEqual({ level: "error", field: "flow", text: "Type the flow as a number above 0." });
    expect(items[2]?.note).toEqual({ level: "lack", field: "tag", text: 'This loop is not in a file yet, because "Tag" has no value.' });
  });

  it("uses the system of units of the lists", () => {
    const imperial = listItems(HEAT_ADD_ON, LOOPS, STORE, { ...listsOf(STORE), system: "imperial" }, FORMS);
    expect(input(imperial[3]?.inputs ?? [], "flow")).toMatchObject({ usual: "4" });
  });

  it("gives only the use for an add-on with no sentence, and no text for a list that no record names", () => {
    const plain = listItems({ form: HEAT }, LOOPS, STORE, listsOf(STORE), FORMS);
    expect(plain[0]?.note.text).toBe("2 wall valves and 1 panel in 2 rooms use this loop.");
    const lists = storeLists(STORE, ADD_ONS).get(AIR.schema);
    expect(lists === undefined ? undefined : listItems(AIR_ADD_ON, DUCTS, STORE, lists, FORMS)).toEqual([
      { key: "k1", title: "Duct 1", inputs: [{ kind: "text", name: "name", label: "Name", needed: false, group: "values", text: "Main", state: "ok" }], note: { level: "note", field: undefined, text: "" } },
    ]);
  });

  it("does not show a hidden field", () => {
    const hidden = listItems({ ...HEAT_ADD_ON, hidden: { loops: ["drop", "after"] } }, LOOPS, STORE, listsOf(STORE), FORMS);
    expect(hidden[0]?.inputs.map((item) => item.name)).toEqual(["name", "flow", "tag"]);
  });

  it("gives no record for a store with no record in the list", () => {
    const store = storeOf([room()]);
    expect(listItems(HEAT_ADD_ON, LOOPS, store, listsOf(store), FORMS)).toEqual([]);
  });
});

describe("the sections of the page", () => {
  const sections = listSections(ADD_ONS);

  it("has a section for each list, with the texts of its add-on", () => {
    expect(sections).toEqual([
      { addOn: HEAT_ADD_ON, collection: LOOPS, texts: { aid: "A loop is one pipe of the floor.", add: "Add a loop" } },
      { addOn: AIR_ADD_ON, collection: DUCTS, texts: {} },
    ]);
    expect(listSections([])).toEqual([]);
    // A name that each object has is not a text of an add-on.
    expect(listSections([{ form: { ...AIR, collections: [{ ...DUCTS, name: "constructor" }] }, lists: {} }])[0]?.texts).toEqual({});
    // A text of a different collection is not a text of the list.
    expect(listSections([{ form: HEAT, lists: { valves: { add: "Add a valve" } } }])).toEqual([{ addOn: { form: HEAT, lists: { valves: { add: "Add a valve" } } }, collection: LOOPS, texts: {} }]);
  });

  it("has the collections with records of an object", () => {
    expect(ownedSections(ADD_ONS)).toEqual([{ addOn: HEAT_ADD_ON, collection: PANELS }]);
    expect(ownedSections([AIR_ADD_ON])).toEqual([]);
  });

  it("gives the text of the button that adds a record", () => {
    expect(sections.map(addText)).toEqual(["Add a loop", "New duct"]);
    expect(addText({ addOn: AIR_ADD_ON, collection: { ...DUCTS, word: "" }, texts: {} })).toBe("New record");
    expect(addText({ addOn: { form: HEAT }, collection: VALVES, texts: {} })).toBe("New wall valve");
  });
});

describe("listCounts", () => {
  const sections = listSections(ADD_ONS);

  it("counts the records of each list of the store", () => {
    expect(listCounts(STORE, sections)).toEqual([
      ["Loops", 4],
      ["Ducts", 1],
    ]);
  });

  it("gives no number for a list with no record", () => {
    expect(listCounts({ ...STORE, lists: STORE.lists.slice(1) }, sections)).toEqual([["Ducts", 1]]);
    expect(listCounts(storeOf([room()]), sections)).toEqual([]);
    expect(listCounts(STORE, [])).toEqual([]);
  });

  it("counts, for a room, the records that the records of the room name", () => {
    expect(listCounts(STORE, sections, ROOM)).toEqual([["Loops", 1]]);
    expect(listCounts(STORE, sections, room())).toEqual([]);
    const two = room([[valve("f1", "1", { records: { loop: "r4" } }), valve("f2", "2", { records: { loop: "r1" } }), valve("f3", "3", { records: { loop: "r4" } })]]);
    expect(listCounts(STORE, sections, two)).toEqual([["Loops", 2]]);
  });

  it("counts for the room that it gets, and not for the rooms of the store", () => {
    // The room is not a room of the store, and the rooms of the store name loop 1.
    const other = room([[valve("f1", "1", { records: { loop: "r3" } })]]);
    expect(listCounts(STORE, sections, other)).toEqual([["Loops", 1]]);
    expect(listCounts({ ...STORE, rooms: [] }, sections, other)).toEqual([["Loops", 1]]);
  });
});

describe("the texts of the page", () => {
  it("names the points of the add-ons with the parts of a wall", () => {
    expect(wallPartsText([])).toBe("the doors, the windows and the furniture");
    expect(wallPartsText(FORMS)).toBe("the doors, the windows, the valves, the grilles and the furniture");
  });

  it("names the points in the button that adds a feature", () => {
    expect(addFeatureText([])).toBe("Add doors or windows");
    expect(addFeatureText([AIR])).toBe("Add doors, windows or grilles");
    expect(addFeatureText(FORMS)).toBe("Add doors, windows, valves or grilles");
  });

  it("names the points in the label of the features of a wall", () => {
    expect(featuresLabel([], "2")).toBe("Doors and windows of wall 2");
    expect(featuresLabel(FORMS, "3")).toBe("Doors, windows, valves and grilles of wall 3");
  });

  it("names the records of an object in the title of the box More", () => {
    expect(moreText([])).toBe("Name and more distances");
    expect(moreText([AIR_ADD_ON])).toBe("Name and more distances");
    expect(moreText(ADD_ONS)).toBe("Name, panels and more distances");
  });

  it("tells the parts of a file that the page shows", () => {
    expect(filePartsText([])).toBe("The page shows the walls, the doors, the windows and the furniture of the file. It does not keep the other data of the file yet.");
    expect(filePartsText(ADD_ONS)).toBe(
      "The page shows the walls, the doors, the windows, the valves, the grilles, the loops, the ducts and the furniture of the file. It does not keep the other data of the file yet.",
    );
  });

  it("gives a step of the help for each collection of points", () => {
    expect(pointSteps([])).toEqual([]);
    expect(pointSteps(FORMS)).toEqual([
      "For each wall valve of this wall, measure from a corner of the wall to its center. Then measure its height above the floor.",
      "For each grille of this wall, measure from a corner of the wall to its center. Then measure its height above the floor.",
    ]);
  });
});
