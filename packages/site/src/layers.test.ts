import { checkForm, checkLayers, formLayer, formRecords, LEVEL_SCHEMA, SCENE_SCHEMA, type FormRecord, type FormRecords, type LayerForm, type Level, type PlacedObject, type Survey, type WallAnchor } from "@mark1russell7/room-view";
import { describe, expect, it } from "vitest";
import {
  draftKeys,
  emptyDraft,
  MOST_OWNED,
  MOST_RECORDS,
  MOST_TEXT,
  ownedOf,
  recordOf,
  storeOf,
  surveyOf,
  withNewRooms,
  type Corner,
  type Draft,
  type DraftFeature,
  type DraftList,
  type DraftObject,
  type DraftOwned,
  type DraftRecord,
  type LengthMode,
  type OwnedChange,
  type Store,
  type TypedLength,
} from "./draft.ts";
import { ELECTRICAL } from "./electrical.ts";
import { pageAddOn } from "./form-add-on.fixture.ts";
import { levelParts, levelResult, numberFrom, placeOf, readSurvey, roomRecords, roomResult, roomSurvey, shownLayers, storeLists, surveyParts, withLists, type LayerRecords, type LevelParts } from "./layers.ts";
import type { PageAddOn } from "./page-add-on.ts";

/**
 * A false add-on for the tests. The page has no code for it.
 * It has a list (stacks), points on a wall (taps), records of an object (drains and notes) and a collection with no place in the page (gullies).
 */
const PLUMBING: LayerForm = {
  schema: "plumbing/1",
  collections: [
    {
      name: "stacks",
      word: "stack",
      label: "Stack",
      title: "Stacks",
      idFrom: "name",
      fields: [
        { kind: "text", name: "name", label: "Name" },
        { kind: "number", name: "size", label: "Size", unit: "mm", above: 0, usual: { imperial: 100, metric: 110 } },
        { kind: "number", name: "slope", label: "Slope" },
        { kind: "record", name: "vent", label: "Vent", of: "stacks" },
      ],
    },
    {
      name: "taps",
      word: "Water tap",
      label: "Tap",
      title: "Taps",
      on: ["wall"],
      height: { imperial: 0.9144, metric: 0.9 },
      fields: [
        { kind: "text", name: "size", label: "Size" },
        { kind: "record", name: "stack", label: "Stack", of: "stacks" },
        { kind: "record", name: "next", label: "Next tap", of: "taps" },
      ],
    },
    {
      name: "drains",
      word: "drain",
      label: "Drain",
      title: "Drains",
      owner: "object",
      most: 2,
      fields: [
        { kind: "object", name: "object", label: "Object", needed: true },
        { kind: "record", name: "tap", label: "Tap", of: "taps" },
        { kind: "number", name: "flow", label: "Flow", least: 0 },
      ],
    },
    {
      name: "notes",
      word: "note",
      label: "Note",
      title: "Notes",
      owner: "object",
      fields: [
        { kind: "object", name: "object", label: "Object", needed: true },
        { kind: "text", name: "text", label: "Text" },
        { kind: "object", name: "near", label: "Near" },
      ],
    },
    { name: "gullies", word: "gully", label: "Gully", title: "Gullies", on: ["floor"], fields: [] },
  ],
};

/** A second false add-on: a list (meters) and points on a wall (valves). */
const GAS: LayerForm = {
  schema: "gas/1",
  collections: [
    { name: "meters", word: "meter", label: "Meter", title: "Meters", fields: [{ kind: "text", name: "name", label: "Name" }] },
    {
      name: "valves",
      word: "valve",
      label: "Valve",
      title: "Valves",
      on: ["wall"],
      height: { imperial: 0.3048, metric: 0.3 },
      fields: [
        { kind: "record", name: "meter", label: "Meter", of: "meters" },
        { kind: "record", name: "next", label: "Next valve", of: "valves" },
      ],
    },
  ],
};

const P = PLUMBING.schema;
const FORMS: readonly LayerForm[] = [PLUMBING, GAS];
/** The two false add-ons. Each one has a test add-on of the core, and it reads no old file. */
const ADD_ONS: readonly PageAddOn[] = [pageAddOn(PLUMBING), pageAddOn(GAS)];

const typed = (text = ""): TypedLength => ({ value: text, inches: "" });

/** This function gives a room of 4 by 3. The walk goes to the left, or to the right with the corner `right`. */
function box(mode: LengthMode = "m", corner: Corner = "left"): Draft {
  const lengths = ["4", "3", "4", "3"];
  return { ...emptyDraft(mode), sides: lengths.map((length, index) => ({ key: `s${String(index + 1)}`, length: typed(length), corner, angle: "", features: [], objects: [] })) };
}

/** This function gives a point of a collection, with its distance from the start of its wall. */
function point(key: string, offset: string, owned: DraftOwned, height = ""): DraftFeature {
  return { key, kind: "point", from: "start", offset: typed(offset), width: typed(), height: typed(height), sill: typed(), point: owned };
}

/** This function gives a tap with its fields. */
function tap(key: string, offset: string, fields: OwnedChange = {}, height = "0.9"): DraftFeature {
  return point(key, offset, ownedOf(P, "taps", fields), height);
}

/** This function gives a sink against a wall, with the records that it owns. */
function sink(key: string, offset: string, owns: readonly DraftOwned[] = [], width = "0.6"): DraftObject {
  return { key, kind: "sink", name: "", from: "start", offset: typed(offset), width: typed(width), depth: typed("0.5"), height: typed("0.9"), gap: typed(), lift: typed(), owns, holds: [] };
}

/** This function gives a draft with features and objects on the wall at a position, from 0. */
function onWall(draft: Draft, index: number, features: readonly DraftFeature[], objects: readonly DraftObject[] = []): Draft {
  return { ...draft, sides: draft.sides.map((side, at) => (at === index ? { ...side, features, objects } : side)) };
}

const drain = (fields: OwnedChange): DraftOwned => ownedOf(P, "drains", fields);
const stacks = (...records: readonly DraftRecord[]): readonly DraftList[] => [{ layer: P, collection: "stacks", records }];

/** This function gives the records of some collections. */
const pick = (records: FormRecords, names: readonly string[]): FormRecords => Object.fromEntries(names.map((name): [string, readonly FormRecord[]] => [name, records[name] ?? []]));

/** A room with two taps and a sink. Tap 1 names a stack and tap 2. The sink has two drains, one for each tap. */
const ROOM = onWall(
  box(),
  0,
  [tap("f1", "1", { values: { size: "15 mm" }, records: { stack: "r1" }, points: { next: "f2" } }), tap("f2", "2", {}, "1.2")],
  [sink("o1", "2.5", [drain({ values: { flow: "2" }, points: { tap: "f1" } }), drain({ points: { tap: "f2" } })])],
);

/** A store with the room, an empty room and two stacks. Stack 2 names stack 1. */
const STORE: Store = {
  ...storeOf([ROOM, box()]),
  lists: stacks(recordOf("r1", { values: { name: "Main", size: "110", slope: "-2" } }), recordOf("r2", { values: { name: "Vent" }, records: { vent: "r1" } })),
};

const WALL: WallAnchor = { on: "wall", wall: "wall-1", face: "left", offset: 1, height: 0.9 };

/** This function gives the records of the false add-on for a store: the lists, and the records of each room. */
function layerOf(store: Store, form: LayerForm = PLUMBING): LayerRecords {
  const lists = storeLists(store, ADD_ONS).get(form.schema);
  if (lists === undefined) throw new Error("the store has no lists for the form");
  const places = (place: string): readonly string[] => form.collections.filter((collection) => placeOf(collection) === place).map((collection) => collection.name);
  return {
    form,
    lists: pick(formRecords(form, formLayer(form, lists.records, { system: lists.system })).records, places("list")),
    rooms: store.rooms.map((room) => pick(roomRecords(form, room, lists, FORMS), [...places("point"), ...places("owned")])),
  };
}

describe("the false add-ons", () => {
  it("are valid forms", () => {
    expect(checkForm(PLUMBING)).toEqual([]);
    expect(checkForm(GAS)).toEqual([]);
  });
});

describe("placeOf", () => {
  const place = (name: string): string | undefined => {
    const collection = PLUMBING.collections.find((item) => item.name === name);
    return collection === undefined ? "none" : placeOf(collection);
  };

  it("gives the place of each kind of collection", () => {
    expect(place("stacks")).toBe("list");
    expect(place("taps")).toBe("point");
    expect(place("drains")).toBe("owned");
    expect(place("notes")).toBe("owned");
  });

  it("gives no place to a collection that is not on a wall, and to a collection that a record owns", () => {
    expect(place("gullies")).toBeUndefined();
    expect(placeOf({ name: "a", word: "a", label: "A", title: "A", on: ["floor", "wall"], fields: [] })).toBe("point");
    const owned = { name: "a", word: "a", label: "A", title: "A", owner: "stack" };
    expect(placeOf({ ...owned, fields: [{ kind: "record", name: "stack", label: "Stack", of: "stacks", needed: true }] })).toBeUndefined();
    expect(placeOf({ ...owned, fields: [] })).toBeUndefined();
  });
});

describe("numberFrom", () => {
  it("reads a number of 0 or more as `numberOf` does", () => {
    expect(numberFrom("")).toBeUndefined();
    expect(numberFrom("  ")).toBeUndefined();
    expect(numberFrom(" 3,5 ")).toBe(3.5);
    expect(numberFrom("x")).toBeNaN();
  });

  it("reads a number below 0", () => {
    expect(numberFrom("-2")).toBe(-2);
    expect(numberFrom(" -2.5 ")).toBe(-2.5);
    expect(numberFrom("-")).toBeNaN();
    expect(numberFrom("-x")).toBeNaN();
    expect(numberFrom("--2")).toBeNaN();
    expect(numberFrom("1e3")).toBeNaN();
  });
});

describe("storeLists", () => {
  it("gives each record of a list an id from its name, and its values as the form has them", () => {
    const lists = storeLists(STORE, ADD_ONS);
    expect([...lists.keys()]).toEqual([P, GAS.schema]);
    const plumbing = lists.get(P);
    expect(plumbing?.system).toBe("metric");
    expect([...(plumbing?.ids ?? [])]).toEqual([
      ["r1", "main"],
      ["r2", "vent"],
    ]);
    expect(plumbing?.records).toEqual({
      stacks: [
        { id: "main", values: { name: "Main", size: 110, slope: -2 } },
        { id: "vent", values: { name: "Vent", vent: "main" } },
      ],
    });
    expect(lists.get(GAS.schema)).toEqual({
      system: "metric",
      records: { meters: [] },
      ids: new Map(),
      outside: new Map([
        ["meters", new Set()],
        ["valves", new Set()],
      ]),
    });
  });

  it("gives the ids of the records that the form accepts, for the layer of a room", () => {
    const outside = (store: Store): readonly (readonly [string, readonly string[]])[] => [...(storeLists(store, ADD_ONS).get(P)?.outside ?? [])].map(([name, ids]) => [name, [...ids]]);
    expect(outside(STORE)).toEqual([
      ["stacks", ["main", "vent"]],
      ["taps", []],
      ["drains", []],
      ["notes", []],
      ["gullies", []],
    ]);
    // The form does not accept a size that is not a number, so a record of a room cannot name that stack.
    const bad: Store = { ...STORE, lists: stacks(recordOf("r1", { values: { name: "Main", size: "x" } }), recordOf("r2", { values: { name: "Vent" }, records: { vent: "r1" } })) };
    expect(outside(bad)[0]).toEqual(["stacks", ["vent"]]);
  });

  it("gives the word of the collection and a number to a record with no name, and a number to a second name", () => {
    const store: Store = { ...STORE, lists: stacks(recordOf("r1"), recordOf("r2", { values: { name: "Main" } }), recordOf("r3", { values: { name: "main" } })) };
    expect([...(storeLists(store, ADD_ONS).get(P)?.ids.values() ?? [])]).toEqual(["stack-1", "main", "main-2"]);
  });

  it("gives a different id to a record with the id of a record of a room", () => {
    const names = ["Water tap 1", "Drain sink 1", "Drain sink 1 2", "water tap 1"];
    const store: Store = { ...STORE, lists: stacks(...names.map((name, index) => recordOf(`r${String(index + 1)}`, { values: { name } }))) };
    // The second record with the name gets a number, and no record of a room has that id.
    expect([...(storeLists(store, ADD_ONS).get(P)?.ids.values() ?? [])]).toEqual(["stack-water-tap-1", "stack-drain-sink-1", "stack-drain-sink-1-2", "water-tap-1-2"]);
    // A store with no such record of a room keeps the words of the name.
    expect([...(storeLists({ ...store, rooms: [box()] }, ADD_ONS).get(P)?.ids.values() ?? [])]).toEqual(["water-tap-1", "drain-sink-1", "drain-sink-1-2", "water-tap-1-2"]);
  });

  it("gives a text that is not a number as `NaN`, so the form does not accept the record", () => {
    const store: Store = { ...STORE, lists: stacks(recordOf("r1", { values: { name: "Main", size: "x" } }), recordOf("r2", { values: { name: "Main" } })) };
    const lists = storeLists(store, ADD_ONS).get(P);
    expect(lists?.records["stacks"]?.map((record) => record.values["size"])).toEqual([Number.NaN, undefined]);
    // The id of the bad record stays its id, so the id of the next record does not change when the number is correct again.
    expect(roomRecords(PLUMBING, ROOM, lists, FORMS)["stacks"]).toEqual([{ id: "main-2", values: { name: "Main", size: 110 } }]);
    // A text of spaces is no number, so the field has its usual value.
    const spaces: Store = { ...STORE, lists: stacks(recordOf("r1", { values: { name: "Main", size: " " } })) };
    expect(roomRecords(PLUMBING, ROOM, storeLists(spaces, ADD_ONS).get(P), FORMS)["stacks"]).toEqual([{ id: "main", values: { name: "Main", size: 110 } }]);
  });

  it("gives the word `record` to the records of a collection with no letter and no digit in its word", () => {
    const form: LayerForm = { ...PLUMBING, collections: PLUMBING.collections.map((collection) => (collection.name === "stacks" || collection.name === "notes" ? { ...collection, word: "?" } : collection)) };
    expect([...(storeLists({ ...STORE, lists: stacks(recordOf("r1")) }, [pageAddOn(form)]).get(P)?.ids.values() ?? [])]).toEqual(["record-1"]);
    const noted = onWall(box(), 0, [], [sink("o1", "1", [ownedOf(P, "notes", { values: { text: "a" } })])]);
    expect(roomRecords(form, noted)["notes"]?.map((record) => record.id)).toEqual(["record-sink-1"]);
  });

  it("has the system of units of the first room", () => {
    const store: Store = { ...STORE, rooms: [box("ft-in"), ROOM] };
    const lists = storeLists(store, ADD_ONS).get(P);
    expect(lists?.system).toBe("imperial");
    expect(roomRecords(PLUMBING, ROOM, lists, FORMS)["stacks"]?.map((record) => record.values["size"])).toEqual([110, 100]);
  });

  it("makes the lists of a layer one time, from the form of its first add-on", () => {
    const lists = storeLists(STORE, [pageAddOn(PLUMBING), pageAddOn({ schema: P, collections: [] })]);
    expect([...lists.keys()]).toEqual([P]);
    expect(lists.get(P)).toEqual(storeLists(STORE, [pageAddOn(PLUMBING)]).get(P));
    expect(lists.get(P)?.records["stacks"]).toHaveLength(2);
  });
});

describe("roomRecords", () => {
  const lists = storeLists(STORE, ADD_ONS).get(P);

  it("gives the lists of the store, the points of the room and the records of its objects", () => {
    expect(roomRecords(PLUMBING, ROOM, lists, FORMS)).toEqual({
      stacks: [
        { id: "main", values: { name: "Main", size: 110, slope: -2 } },
        { id: "vent", values: { name: "Vent", size: 110, vent: "main" } },
      ],
      taps: [
        { id: "water-tap-1", anchor: { on: "wall", wall: "wall-1", face: "left", offset: 1, height: 0.9 }, values: { size: "15 mm", stack: "main", next: "water-tap-2" } },
        { id: "water-tap-2", anchor: { on: "wall", wall: "wall-1", face: "left", offset: 2, height: 1.2 }, values: {} },
      ],
      drains: [
        { id: "drain-sink-1", values: { object: "sink-1", tap: "water-tap-1", flow: 2 } },
        { id: "drain-sink-1-2", values: { object: "sink-1", tap: "water-tap-2" } },
      ],
      notes: [],
      gullies: [],
    });
  });

  it("names no record of a list when it has no lists", () => {
    const records = roomRecords(PLUMBING, ROOM);
    expect(records["stacks"]).toEqual([]);
    expect(records["taps"]?.map((record) => record.values)).toEqual([{ size: "15 mm", next: "water-tap-2" }, {}]);
    expect(records["drains"]).toHaveLength(2);
  });

  it("puts a point on the inner face of its wall, with the usual height of its collection", () => {
    const right = onWall(box("m", "right"), 1, [tap("f1", "1", {}, "")]);
    expect(roomRecords(PLUMBING, right)["taps"]?.map((record) => record.anchor)).toEqual([{ on: "wall", wall: "wall-2", face: "right", offset: 1, height: 0.9 }]);
    const inches = onWall(box("in"), 1, [tap("f1", "12", {}, "")]);
    expect(roomRecords(PLUMBING, inches)["taps"]?.map((record) => record.anchor)).toEqual([{ on: "wall", wall: "wall-2", face: "left", offset: 12, height: 36 }]);
  });

  it("has no point with a bad number or on a wall with no length, and no record names it", () => {
    const bad = onWall(box(), 0, [tap("f1", "x"), tap("f2", "2")], [sink("o1", "2.5", [drain({ values: { flow: "1" }, points: { tap: "f1" } })])]);
    const records = roomRecords(PLUMBING, bad);
    // The bad tap keeps its number, so the id of the next tap does not change when the number is correct again.
    expect(records["taps"]?.map((record) => record.id)).toEqual(["water-tap-2"]);
    expect(records["drains"]).toEqual([{ id: "drain-sink-1", values: { object: "sink-1", flow: 1 } }]);
    const open = { ...ROOM, sides: ROOM.sides.map((side, index) => (index === 0 ? { ...side, length: typed() } : side)) };
    expect(pick(roomRecords(PLUMBING, open), ["taps", "drains"])).toEqual({ taps: [], drains: [] });
  });

  it("has no record of an object that the survey record does not have", () => {
    const wide = onWall(box(), 0, [], [sink("o1", "1", [drain({ values: { flow: "1" } })], "x")]);
    expect(roomRecords(PLUMBING, wide)["drains"]).toEqual([]);
  });

  it("has no record with a value that its field does not accept", () => {
    const bad = onWall(box(), 0, [], [sink("o1", "1", [drain({ values: { flow: "-1" } }), drain({ values: { flow: "x" } }), drain({ values: { flow: "3" } })])]);
    // The bad records keep their ids, so the id of the third record does not change when a number is correct again.
    expect(roomRecords(PLUMBING, bad)["drains"]).toEqual([{ id: "drain-sink-1-3", values: { object: "sink-1", flow: 3 } }]);
  });

  it("has the largest number of records of one owner at most", () => {
    const three = onWall(box(), 0, [], [sink("o1", "1", [drain({ values: { flow: "1" } }), drain({ values: { flow: "2" } }), drain({ values: { flow: "3" } })]), sink("o2", "2", [drain({ values: { flow: "4" } })])]);
    expect(roomRecords(PLUMBING, three)["drains"]?.map((record) => [record.id, record.values["flow"]])).toEqual([
      ["drain-sink-1", 1],
      ["drain-sink-1-2", 2],
      ["drain-sink-2", 4],
    ]);
  });

  it("has only the records of its layer, and a field names only a point of its layer", () => {
    const outlet = point("f1", "1", ownedOf(ELECTRICAL.layer, ELECTRICAL.outlets), "0.3");
    const valve = point("f2", "2", ownedOf(GAS.schema, "valves"));
    const mixed = onWall(box(), 0, [outlet, valve, tap("f3", "3")], [sink("o1", "0.2", [drain({ points: { tap: "f2" } }), ownedOf(GAS.schema, "notes", { values: { text: "a" } }), ownedOf(P, "taps", { values: { size: "b" } })])]);
    expect(pick(roomRecords(PLUMBING, mixed, undefined, FORMS), ["taps", "drains", "notes"])).toEqual({
      taps: [{ id: "water-tap-1", anchor: { on: "wall", wall: "wall-1", face: "left", offset: 3, height: 0.9 }, values: {} }],
      drains: [{ id: "drain-sink-1", values: { object: "sink-1" } }],
      notes: [],
    });
    expect(roomRecords(GAS, mixed, undefined, FORMS)["valves"]?.map((record) => record.id)).toEqual(["valve-1"]);
  });

  it("gives an id that no point has to a record of an object", () => {
    // The kind of the object and the word of the taps make the id of a tap.
    const named: DraftObject = { ...sink("o1", "2.5", [ownedOf(P, "notes", { values: { text: "a" } })]), kind: "x" };
    const form: LayerForm = { ...PLUMBING, collections: PLUMBING.collections.map((collection) => (collection.name === "notes" ? { ...collection, word: "Water tap" } : collection.name === "taps" ? { ...collection, word: "water tap x" } : collection)) };
    const records = roomRecords(form, onWall(box(), 0, [tap("f1", "1")], [named]));
    expect(records["taps"]?.map((record) => record.id)).toEqual(["water-tap-x-1"]);
    expect(records["notes"]?.map((record) => record.id)).toEqual(["water-tap-x-1-2"]);
  });

  it("gives a value only to the object field of the owner", () => {
    const noted = onWall(box(), 0, [], [sink("o1", "1", [ownedOf(P, "notes", { values: { text: "a", near: "sink-1" } })])]);
    expect(roomRecords(PLUMBING, noted)["notes"]).toEqual([{ id: "note-sink-1", values: { object: "sink-1", text: "a" } }]);
  });

  it("has no record of a collection at a different place", () => {
    // A point of a list and of a collection of an object. A record of an object of a list and of the points.
    const points = [point("f1", "1", ownedOf(P, "stacks", { values: { name: "Side" } }), "0.5"), point("f2", "2", ownedOf(P, "notes", { values: { text: "a" } }), "0.5")];
    const wrong = onWall(box(), 0, points, [sink("o1", "2.5", [ownedOf(P, "stacks", { values: { name: "Low" } }), ownedOf(P, "taps", { values: { size: "b" } })])]);
    expect(roomRecords(PLUMBING, wrong, lists, FORMS)).toEqual(roomRecords(PLUMBING, box(), lists, FORMS));
  });
});

const TAP_1 = { id: "water-tap-1", anchor: { on: "wall", wall: "wall-1", face: "left", offset: 1, height: 0.9 }, size: "15 mm", stack: "main", next: "water-tap-2" };
const TAP_2 = { id: "water-tap-2", anchor: { on: "wall", wall: "wall-1", face: "left", offset: 2, height: 1.2 } };
/** The stacks of the store `STORE` in a layer. Each number with a usual value has a value. */
const STACKS = [
  { id: "main", name: "Main", size: 110, slope: -2 },
  { id: "vent", name: "Vent", size: 110, vent: "main" },
];
/** The records of the room `ROOM` in a layer, with the stacks of the store `STORE`. */
const ROOM_LAYER = {
  schema: P,
  taps: [TAP_1, TAP_2],
  drains: [
    { id: "drain-sink-1", object: "sink-1", tap: "water-tap-1", flow: 2 },
    { id: "drain-sink-1-2", object: "sink-1", tap: "water-tap-2" },
  ],
};
/** The layer of the false add-on for the room `ROOM`, with the stacks of the store `STORE`. */
const LAYER = { ...ROOM_LAYER, stacks: STACKS };

describe("roomSurvey", () => {
  const lists = storeLists(STORE, ADD_ONS);

  it("gives the records of each form as one layer of the survey record", () => {
    const survey = roomSurvey(ROOM, lists, true, ADD_ONS);
    // The second false add-on has no record, so the survey has no layer of it.
    expect(survey).toEqual({ ...surveyOf(ROOM, FORMS), layers: { [P]: LAYER } });
    expect(survey.layers?.[P]).toEqual(formLayer(PLUMBING, roomRecords(PLUMBING, ROOM, lists.get(P), FORMS), { system: "metric" }));
    // The layer is a layer of its form, with no data that the form does not keep.
    expect(formRecords(PLUMBING, survey.layers?.[P]).more).toBe(false);
  });

  it("has the records of the lists only with `listed`, and a record of the room names them", () => {
    const survey = roomSurvey(ROOM, lists, false, ADD_ONS);
    expect(survey.layers).toEqual({ [P]: ROOM_LAYER });
    // The layer names a stack of the level record, so its read needs the ids of those records.
    expect(formRecords(PLUMBING, survey.layers?.[P]).more).toBe(true);
    expect(formRecords(PLUMBING, survey.layers?.[P], { outside: lists.get(P)?.outside }).more).toBe(false);
  });

  it("names no record of a list with no lists", () => {
    const alone = { id: TAP_1.id, anchor: TAP_1.anchor, size: TAP_1.size, next: TAP_1.next };
    expect(roomSurvey(ROOM, undefined, false, ADD_ONS).layers).toEqual({ [P]: { ...ROOM_LAYER, taps: [alone, TAP_2] } });
    expect(roomSurvey(ROOM, undefined, true, ADD_ONS).layers).toEqual({ [P]: { ...ROOM_LAYER, taps: [alone, TAP_2] } });
  });

  it("names no record of a list that the form does not accept", () => {
    const bad = storeLists({ ...STORE, lists: stacks(recordOf("r1", { values: { name: "Main", size: "x" } })) }, ADD_ONS);
    for (const listed of [true, false]) {
      const read = formRecords(PLUMBING, roomSurvey(ROOM, bad, listed, ADD_ONS).layers?.[P]);
      expect(read.more, String(listed)).toBe(false);
      expect(read.records["stacks"], String(listed)).toEqual([]);
      expect(read.records["taps"]?.map((record) => record.values), String(listed)).toEqual([{ size: "15 mm", next: "water-tap-2" }, {}]);
    }
  });

  it("gives no layer for no record, and the survey record of the core for no add-on", () => {
    const empty = roomSurvey(box(), lists, false, ADD_ONS);
    expect(empty).toEqual(surveyOf(box(), FORMS));
    expect(empty).not.toHaveProperty("layers");
    // With `listed`, the lists of the store are records of the layer of each room.
    expect(roomSurvey(box(), lists, true, ADD_ONS).layers).toEqual({ [P]: { schema: P, stacks: STACKS } });
    const none = roomSurvey(ROOM, lists, true, []);
    expect(none).toEqual(surveyOf(ROOM, []));
    expect(none).not.toHaveProperty("layers");
  });

  it("makes the layer of a name one time, from the form of its first add-on", () => {
    const twice = roomSurvey(ROOM, lists, true, [pageAddOn(PLUMBING), pageAddOn({ schema: P, collections: [] }), pageAddOn(GAS)]);
    expect(twice.layers).toEqual({ [P]: LAYER });
  });

  it("numbers the points of two add-ons with one word together, as the survey record does", () => {
    const gas: LayerForm = { ...GAS, collections: GAS.collections.map((collection) => (collection.name === "valves" ? { ...collection, word: "water tap" } : collection)) };
    const mixed = onWall(box(), 0, [tap("f1", "1"), point("f2", "2", ownedOf(gas.schema, "valves")), tap("f3", "3")]);
    const layers = roomSurvey(mixed, undefined, false, [pageAddOn(PLUMBING), pageAddOn(gas)]).layers;
    const ids = (form: LayerForm, name: string): readonly string[] | undefined => formRecords(form, layers?.[form.schema]).records[name]?.map((record) => record.id);
    expect([ids(PLUMBING, "taps"), ids(gas, "valves")]).toEqual([["water-tap-1", "water-tap-3"], ["water-tap-2"]]);
  });
});

describe("withLists", () => {
  const level: Level = { schema: LEVEL_SCHEMA, unit: "m", rooms: [] };
  const lists = storeLists(STORE, ADD_ONS);

  it("gives the records of the lists of each form as one layer of the level record", () => {
    // The second false add-on has no record of a list, so the level record has no layer of it.
    expect(withLists(level, lists, ADD_ONS)).toEqual({ ...level, layers: { [P]: { schema: P, stacks: STACKS } } });
  });

  it("gives the same level record for no record of a list", () => {
    expect(withLists(level, new Map(), ADD_ONS)).toBe(level);
    expect(withLists(level, storeLists({ ...STORE, lists: [] }, ADD_ONS), ADD_ONS)).toBe(level);
    expect(withLists(level, lists, [])).toBe(level);
    // The form does not accept the only record of the lists.
    const bad: Store = { ...STORE, lists: stacks(recordOf("r1", { values: { size: "x" } })) };
    expect(withLists(level, storeLists(bad, ADD_ONS), ADD_ONS)).toBe(level);
  });

  it("keeps each different layer of the level record, and makes the layer of a form again", () => {
    const other = { schema: "other/1", marks: [] };
    const given: Level = { ...level, layers: { "other/1": other, [P]: { schema: P, stacks: [] } } };
    expect(withLists(given, lists, ADD_ONS).layers).toEqual({ "other/1": other, [P]: { schema: P, stacks: STACKS } });
  });
});

describe("roomResult and levelResult", () => {
  const lists = storeLists(STORE, ADD_ONS);
  const survey = roomSurvey(ROOM, lists, true, ADD_ONS);

  it("gives the layers of a survey record to the expansion, with the add-ons of the page", () => {
    const result = roomResult(survey, ADD_ONS);
    expect(result.layerFindings).toEqual([]);
    // The room is in meters and its walk closes, so each anchor keeps its numbers.
    expect(result.layers).toEqual({ [P]: LAYER });
  });

  it("gives no layer to the expansion with no add-on that reads it", () => {
    const result = roomResult(survey, []);
    expect(result.layers).toEqual({});
    expect(result.layerFindings.map((finding) => [finding.code, finding.layer])).toEqual([["layer-unknown", P]]);
    expect(roomResult(surveyOf(ROOM, FORMS), ADD_ONS)).not.toHaveProperty("layers");
  });

  it("gives the layer of a level record to the expansion, with the add-ons of the page", () => {
    const level = withLists({ schema: LEVEL_SCHEMA, unit: "m", rooms: [] }, lists, ADD_ONS);
    expect(levelResult(level, ADD_ONS).layers).toEqual({ [P]: { schema: P, stacks: STACKS } });
    expect(levelResult(level, ADD_ONS).layerFindings).toEqual([]);
    // The expansion keeps a layer of the level record that no add-on reads, as `checkLayers` keeps a layer of a scene.
    expect(levelResult(level, []).layers).toEqual({ [P]: { schema: P, stacks: STACKS } });
  });
});

describe("shownLayers", () => {
  const result = roomResult(roomSurvey(ROOM, storeLists(STORE, ADD_ONS), true, ADD_ONS), ADD_ONS);
  const shown = (layers: Readonly<Record<string, unknown>> | undefined, objects: readonly PlacedObject[] = result.objects): Readonly<Record<string, unknown>> | undefined =>
    shownLayers(result.room, objects, layers, "metric", ADD_ONS);

  it("gives the layers of an expansion with no fault as they are", () => {
    expect(result.objects.map((object) => object.id)).toEqual(["sink-1"]);
    expect(checkLayers({ schema: SCENE_SCHEMA, room: result.room, objects: result.objects, layers: { [P]: LAYER } }, ADD_ONS.map((addOn) => addOn.core))).toEqual([]);
    expect(shown(result.layers)).toEqual({ [P]: LAYER });
  });

  it("gives no layers for no layers, and for layers with no record", () => {
    expect(shown(undefined)).toBeUndefined();
    expect(shown({})).toBeUndefined();
    expect(shown({ [P]: { schema: P } })).toBeUndefined();
    expect(shown({ [P]: { schema: P, stacks: [], taps: [] } })).toBeUndefined();
  });

  it("has no record with an error of its anchor, and no field names such a record", () => {
    const layers = {
      [P]: {
        schema: P,
        taps: [
          { id: "far", anchor: { ...WALL, offset: 9 } },
          { id: "high", anchor: { ...WALL, height: 99 } },
          { id: "lost", anchor: { ...WALL, wall: "hall" } },
          { id: "near", anchor: WALL, next: "far" },
        ],
        drains: [
          { id: "d1", object: "sink-1", tap: "far", flow: 1 },
          { id: "d2", object: "sink-1", tap: "near" },
        ],
      },
    };
    expect(shown(layers)).toEqual({
      [P]: {
        schema: P,
        taps: [{ id: "near", anchor: WALL }],
        drains: [
          { id: "d1", object: "sink-1", flow: 1 },
          { id: "d2", object: "sink-1", tap: "near" },
        ],
      },
    });
    // A layer with only such records is not in the result.
    expect(shown({ [P]: { schema: P, taps: [{ id: "far", anchor: { ...WALL, offset: 9 } }] } })).toBeUndefined();
  });

  it("has no record of an object that the scene does not have", () => {
    expect(shown(result.layers, [])).toEqual({ [P]: { schema: P, stacks: STACKS, taps: [TAP_1, TAP_2] } });
    expect(shown({ [P]: { schema: P, drains: ROOM_LAYER.drains } }, [])).toBeUndefined();
    // A record that needs a record with an error of its anchor goes away too.
    const chain: LayerForm = {
      schema: P,
      collections: [
        { name: "taps", word: "tap", label: "Tap", title: "Taps", on: ["wall"], height: { imperial: 0.9144, metric: 0.9 }, fields: [] },
        {
          name: "drains",
          word: "drain",
          label: "Drain",
          title: "Drains",
          owner: "object",
          fields: [
            { kind: "object", name: "object", label: "Object", needed: true },
            { kind: "record", name: "tap", label: "Tap", of: "taps", needed: true },
          ],
        },
      ],
    };
    expect(checkForm(chain)).toEqual([]);
    const layers = { [P]: { schema: P, taps: [{ id: "far", anchor: { ...WALL, offset: 9 } }, { id: "near", anchor: WALL }], drains: [{ id: "d1", object: "sink-1", tap: "far" }, { id: "d2", object: "sink-1", tap: "near" }] } };
    expect(shownLayers(result.room, result.objects, layers, "metric", [pageAddOn(chain)])).toEqual({ [P]: { schema: P, taps: [{ id: "near", anchor: WALL }], drains: [{ id: "d2", object: "sink-1", tap: "near" }] } });
  });

  it("has no layer of an add-on that the page does not have", () => {
    expect(shown({ "other/1": { schema: "other/1", marks: [{ id: "a" }] } })).toBeUndefined();
    expect(shown({ ...result.layers, "other/1": { schema: "other/1" } })).toEqual({ [P]: LAYER });
    expect(shownLayers(result.room, result.objects, result.layers, "metric", [])).toBeUndefined();
  });

  it("gives each number with no value its usual value in the system of units", () => {
    const layers = { [P]: { schema: P, stacks: [{ id: "main", name: "Main" }] } };
    expect(shown(layers)).toEqual({ [P]: { schema: P, stacks: [{ id: "main", name: "Main", size: 110 }] } });
    expect(shownLayers(result.room, result.objects, layers, "imperial", ADD_ONS)).toEqual({ [P]: { schema: P, stacks: [{ id: "main", name: "Main", size: 100 }] } });
  });
});

/** This function gives a store with two rooms and the records of the two false add-ons. A valve names a meter, and a valve names a valve. */
function mixedStore(): Store {
  const valves = [point("f3", "0.5", ownedOf(GAS.schema, "valves", { records: { meter: "r3" } }), "0.3"), point("f4", "3.5", ownedOf(GAS.schema, "valves", { points: { next: "f3" } }), "0.3")];
  const first: Draft = { ...ROOM, sides: ROOM.sides.map((side, index) => (index === 0 ? { ...side, features: [...side.features, ...valves] } : side)) };
  const second = onWall(box(), 2, [tap("f1", "1", { records: { stack: "r2" } })], [sink("o1", "2", [ownedOf(P, "notes", { values: { text: "Old" } })])]);
  return { ...storeOf([first, second]), lists: [...STORE.lists, { layer: GAS.schema, collection: "meters", records: [recordOf("r3", { values: { name: "Main" } })] }] };
}

describe("levelParts", () => {
  const SURVEY = surveyOf(ROOM, FORMS);
  /** This function reads the lists and the records of one room of the false add-on. */
  const parts = (lists: FormRecords, room: FormRecords = {}): LevelParts => levelParts([{ form: PLUMBING, lists, rooms: [room] }], [SURVEY], "metric");
  const main: FormRecord = { id: "main", values: { name: "Main" } };
  const at = (id: string, values: FormRecord["values"] = {}, anchor: WallAnchor = WALL): FormRecord => ({ id, anchor, values });
  const owned = (id: string, values: FormRecord["values"]): FormRecord => ({ id, values: { object: "sink-1", ...values } });

  it("gives the records of a store again, with no data that the page does not keep", () => {
    const read = levelParts(
      [layerOf(STORE), layerOf(STORE, GAS)],
      STORE.rooms.map((room) => surveyOf(room, FORMS)),
      "metric",
    );
    expect(read.more).toBe(false);
    // The usual size of stack 2 is a number of the record, so the store keeps it as text.
    expect(read.lists).toEqual(stacks(recordOf("r1", { values: { name: "Main", size: "110", slope: "-2" } }), recordOf("r2", { values: { name: "Vent", size: "110" }, records: { vent: "r1" } })));
    expect(read.rooms[0]).toEqual({
      points: [
        { wall: "wall-1", offset: 1, height: 0.9, point: ownedOf(P, "taps", { values: { size: "15 mm" }, records: { stack: "r1" }, points: { next: "1" } }) },
        { wall: "wall-1", offset: 2, height: 1.2, point: ownedOf(P, "taps") },
      ],
      owned: new Map([["sink-1", [drain({ values: { flow: "2" }, points: { tap: "0" } }), drain({ points: { tap: "1" } })]]]),
    });
    expect(read.rooms[1]).toEqual({ points: [], owned: new Map() });
    expect(draftKeys(SURVEY, read.rooms[0]).draft.sides).toEqual(ROOM.sides);
  });

  it("gives a store with the same records, for two add-ons and two rooms", () => {
    const store = mixedStore();
    const layers = [layerOf(store), layerOf(store, GAS)];
    expect(layers[1]?.rooms[0]?.["valves"]?.map((record) => record.values)).toEqual([{ meter: "meter-1" }, { next: "valve-1" }]);
    const surveys = store.rooms.map((room) => surveyOf(room, FORMS));
    const read = levelParts(layers, surveys, "metric");
    expect(read.more).toBe(false);
    // The keys of the records of the lists are unique in the two layers.
    expect(read.lists.map((list) => [list.layer, list.collection, list.records.map((record) => record.key)])).toEqual([
      [P, "stacks", ["r1", "r2"]],
      [GAS.schema, "meters", ["r3"]],
    ]);
    // A valve names the position of its point in the points of the two layers.
    expect(read.rooms[0]?.points.map((item) => [item.point.collection, item.point.points])).toEqual([
      ["taps", { next: "1" }],
      ["taps", {}],
      ["valves", {}],
      ["valves", { next: "2" }],
    ]);
    const rooms = surveys.map((survey, index) => draftKeys(survey, read.rooms[index]).draft);
    const next = withNewRooms(storeOf([emptyDraft("m")]), rooms, [], true, read.lists);
    expect(next.rooms).toHaveLength(2);
    expect([layerOf(next), layerOf(next, GAS)]).toEqual(layers);
    // The store has the stacks before, so the new records get new keys, and each name follows.
    const again = withNewRooms(STORE, rooms, [], false, read.lists);
    expect(again.lists.map((list) => list.records.map((record) => record.key))).toEqual([["r1", "r2", "r3", "r4"], ["r5"]]);
    // The new stacks have the names of the stacks of the store, so each one gets a number in its id.
    expect(layerOf(again).lists["stacks"]?.map((record) => record.id)).toEqual(["main", "vent", "main-2", "vent-2"]);
    expect(layerOf(again).rooms.slice(2).map((room) => room["taps"]?.map((record) => record.values["stack"]))).toEqual([["main-2", undefined], ["vent-2"]]);
    expect(layerOf(again).rooms.slice(2).map((room) => [room["drains"], room["notes"]])).toEqual(layers[0]?.rooms.map((room) => [room["drains"], room["notes"]]));
    expect(layerOf(again, GAS).rooms.slice(2)).toEqual(layers[1]?.rooms);
  });

  it("gives no record for no record", () => {
    expect(parts({})).toEqual({ lists: [], rooms: [{ points: [], owned: new Map() }], more: false });
    expect(levelParts([], [SURVEY, SURVEY], "metric")).toEqual({ lists: [], rooms: [{ points: [], owned: new Map() }, { points: [], owned: new Map() }], more: false });
    expect(parts({ stacks: [], taps: [], pipes: [] }, { stacks: [], gullies: [], pipes: [] }).more).toBe(false);
  });

  it("tells a collection that the form does not have, and a collection in the wrong place", () => {
    expect(parts({ pipes: [main] }).more).toBe(true);
    expect(parts({ taps: [at("a")] })).toEqual({ lists: [], rooms: [{ points: [], owned: new Map() }], more: true });
    expect(parts({}, { pipes: [main] }).more).toBe(true);
    expect(parts({}, { stacks: [main] })).toEqual({ lists: [], rooms: [{ points: [], owned: new Map() }], more: true });
    expect(parts({}, { gullies: [{ id: "a", anchor: { on: "floor", at: [1, 1] }, values: {} }] }).more).toBe(true);
  });

  it("keeps the first record of an id in a list, and tells a second record with different data", () => {
    const same = parts({ stacks: [main, { id: "main", values: { name: "Main" } }] });
    expect(same).toMatchObject({ lists: stacks(recordOf("r1", { values: { name: "Main" } })), more: false });
    const other = parts({ stacks: [main, { id: "main", values: { name: "Other" } }, { id: "b", values: { vent: "main" } }] });
    expect(other).toMatchObject({ lists: stacks(recordOf("r1", { values: { name: "Main" } }), recordOf("r2", { records: { vent: "r1" } })), more: true });
  });

  it("keeps the largest number of records of a list, and tells the others", () => {
    const many = Array.from({ length: MOST_RECORDS + 1 }, (_, index): FormRecord => ({ id: `s-${String(index)}`, values: { vent: `s-${String(MOST_RECORDS)}` } }));
    const read = parts({ stacks: many });
    expect(read.lists[0]?.records).toHaveLength(MOST_RECORDS);
    expect(read.more).toBe(true);
    // The last record is not in the store, so no record names it.
    expect(read.lists[0]?.records[0]).toEqual(recordOf("r1"));
    const full = parts({ stacks: many.slice(0, MOST_RECORDS).map((record) => ({ ...record, values: { vent: "s-0" } })) });
    expect(full.more).toBe(false);
    expect(full.lists[0]?.records[MOST_RECORDS - 1]).toEqual(recordOf(`r${String(MOST_RECORDS)}`, { records: { vent: "r1" } }));
  });

  it("gives each value as the text that a person types", () => {
    const read = parts({ stacks: [{ id: "a", values: { name: "  Main  ", size: 110.5, slope: -2.5, vent: "b" } }, { id: "b", values: { name: "   ", slope: 0 } }] });
    expect(read).toMatchObject({ lists: stacks(recordOf("r1", { values: { name: "Main", size: "110.5", slope: "-2.5" }, records: { vent: "r2" } }), recordOf("r2", { values: { slope: "0" } })), more: false });
  });

  it("tells each value that the page does not keep", () => {
    const values: readonly FormRecord["values"][] = [
      { name: 5 },
      { size: "110" },
      { size: 0 },
      { size: Number.NaN },
      { slope: 1e21 },
      { slope: 1e-7 },
      { slope: Number.POSITIVE_INFINITY },
      { vent: "missing" },
      { vent: 3 },
      { color: "red" },
      { name: "x".repeat(MOST_TEXT + 1) },
    ];
    for (const [index, item] of values.entries()) {
      const read = parts({ stacks: [{ id: "a", values: item }] });
      expect(read.more, String(index)).toBe(true);
      // The record stays, with no field for the bad value.
      expect(read.lists, String(index)).toEqual(stacks(recordOf("r1", index === values.length - 1 ? { values: { name: "x".repeat(MOST_TEXT) } } : {})));
    }
    expect(parts({ stacks: [{ id: "a", values: { name: "x".repeat(MOST_TEXT) } }] }).more).toBe(false);
  });

  it("keeps each point on a wall of its survey, and tells each other point", () => {
    const read = parts({ stacks: [main] }, { taps: [at("a", { size: "15 mm", stack: "main", next: "b" }), at("b", {}, { ...WALL, wall: "wall-3", offset: 2, height: 1.2 })] });
    expect(read.more).toBe(false);
    expect(read.rooms[0]?.points).toEqual([
      { wall: "wall-1", offset: 1, height: 0.9, point: ownedOf(P, "taps", { values: { size: "15 mm" }, records: { stack: "r1" }, points: { next: "1" } }) },
      { wall: "wall-3", offset: 2, height: 1.2, point: ownedOf(P, "taps") },
    ]);
    const lost: readonly FormRecord[] = [{ id: "a", values: {} }, at("a", {}, { ...WALL, wall: "hall" }), { id: "a", anchor: { on: "floor", at: [1, 1] }, values: {} }];
    for (const [index, item] of lost.entries()) expect(parts({}, { taps: [item] }), String(index)).toEqual({ lists: [], rooms: [{ points: [], owned: new Map() }], more: true });
  });

  it("keeps two points with one id, and a name gives the first one", () => {
    const read = parts({}, { taps: [at("a"), at("a", { next: "a" }, { ...WALL, offset: 2 })] });
    expect(read.more).toBe(false);
    expect(read.rooms[0]?.points.map((item) => [item.offset, item.point.points])).toEqual([
      [1, {}],
      [2, { next: "0" }],
    ]);
  });

  it("tells a field of a point that names a record that is not there", () => {
    expect(parts({}, { taps: [at("a", { stack: "main" })] })).toMatchObject({ rooms: [{ points: [{ point: ownedOf(P, "taps") }] }], more: true });
    expect(parts({ stacks: [main] }, { taps: [at("a", { next: "main" })] })).toMatchObject({ rooms: [{ points: [{ point: ownedOf(P, "taps") }] }], more: true });
    expect(parts({ stacks: [main] }, { taps: [at("a", { stack: "main" })] }).more).toBe(false);
  });

  it("gives the records of an object to the object, with no field for the owner", () => {
    const read = parts({}, { taps: [at("a")], drains: [owned("d1", { tap: "a", flow: 2 }), owned("d2", { flow: 0 })], notes: [owned("n1", { text: " Old " })] });
    expect(read.more).toBe(false);
    expect(read.rooms[0]?.owned).toEqual(new Map([["sink-1", [drain({ values: { flow: "2" }, points: { tap: "0" } }), drain({ values: { flow: "0" } }), ownedOf(P, "notes", { values: { text: "Old" } })]]]));
  });

  it("tells a record of an object that the draft of the survey does not keep", () => {
    const lost: readonly FormRecord[] = [{ id: "d", values: { flow: 1 } }, { id: "d", values: { object: "bath-1", flow: 1 } }, { id: "d", values: { object: 1, flow: 1 } }];
    for (const [index, item] of lost.entries()) expect(parts({}, { drains: [item] }), String(index)).toEqual({ lists: [], rooms: [{ points: [], owned: new Map() }], more: true });
  });

  it("tells a record of an object with no field, and a record with a bad field", () => {
    expect(parts({}, { drains: [owned("d", {})] })).toEqual({ lists: [], rooms: [{ points: [], owned: new Map() }], more: true });
    expect(parts({}, { drains: [owned("d", { tap: "a" })] })).toEqual({ lists: [], rooms: [{ points: [], owned: new Map() }], more: true });
    expect(parts({}, { drains: [owned("d", { flow: -1 })] }).more).toBe(true);
    // A store keeps only the object that owns a record. A field that names a different object is data that the page does not keep.
    expect(parts({}, { notes: [owned("n", { text: "a", near: "sink-1" })] })).toMatchObject({ rooms: [{ owned: new Map([["sink-1", [ownedOf(P, "notes", { values: { text: "a" } })]]]) }], more: true });
    expect(parts({}, { notes: [owned("n", { text: "a" })] }).more).toBe(false);
    expect(parts({}, { drains: [owned("d", { tap: "a", flow: 1 })] })).toMatchObject({ rooms: [{ owned: new Map([["sink-1", [drain({ values: { flow: "1" } })]]]) }], more: true });
  });

  it("keeps the largest number of records of one owner, and tells the others", () => {
    const three = parts({}, { drains: [owned("a", { flow: 1 }), owned("b", { flow: 2 }), owned("c", { flow: 3 })] });
    expect(three.rooms[0]?.owned.get("sink-1")).toEqual([drain({ values: { flow: "1" } }), drain({ values: { flow: "2" } })]);
    expect(three.more).toBe(true);
    const notes = Array.from({ length: MOST_OWNED + 1 }, (_, index) => owned(`n-${String(index)}`, { text: String(index) }));
    const many = parts({}, { notes });
    expect(many.rooms[0]?.owned.get("sink-1")).toHaveLength(MOST_OWNED);
    expect(many.more).toBe(true);
    expect(parts({}, { notes: notes.slice(0, MOST_OWNED) }).more).toBe(false);
    // The records of the two collections of one object are in one list of the object.
    const both = parts({}, { drains: [owned("a", { flow: 1 })], notes: notes.slice(0, MOST_OWNED) });
    expect(both.rooms[0]?.owned.get("sink-1")).toHaveLength(MOST_OWNED);
    expect(both.more).toBe(true);
  });

  it("gives a room with no records to a survey with no records", () => {
    const read = levelParts([{ form: PLUMBING, lists: {}, rooms: [{ taps: [at("a")] }] }], [SURVEY, SURVEY], "metric");
    expect(read.rooms.map((room) => room.points.length)).toEqual([1, 0]);
    expect(read.more).toBe(false);
  });
});

/** A false add-on of lists only. A record of its second list needs a record of its first list, and a record of its third list needs one of the second. */
const CHAIN: LayerForm = {
  schema: "chain/1",
  collections: [
    { name: "firsts", word: "first", label: "First", title: "Firsts", fields: [{ kind: "text", name: "name", label: "Name" }] },
    { name: "seconds", word: "second", label: "Second", title: "Seconds", fields: [{ kind: "record", name: "first", label: "First", of: "firsts", needed: true }] },
    { name: "thirds", word: "third", label: "Third", title: "Thirds", fields: [{ kind: "record", name: "second", label: "Second", of: "seconds", needed: true }] },
  ],
};

describe("surveyParts", () => {
  const level: Level = { schema: LEVEL_SCHEMA, unit: "m", rooms: [] };
  const none = { points: [], owned: new Map() };
  const main = recordOf("r1", { values: { name: "Main", size: "110", slope: "-2" } });
  const vent = recordOf("r2", { values: { name: "Vent", size: "110" }, records: { vent: "r1" } });

  it("reads no record from a record with no layer", () => {
    expect(surveyParts([surveyOf(ROOM, FORMS)], undefined, "metric", ADD_ONS)).toEqual({ lists: [], rooms: [none], more: false });
    expect(surveyParts([surveyOf(ROOM, FORMS), surveyOf(box(), FORMS)], level, "metric", ADD_ONS)).toEqual({ lists: [], rooms: [none, none], more: false });
    expect(surveyParts([], undefined, "metric", ADD_ONS)).toEqual({ lists: [], rooms: [], more: false });
    expect(surveyParts([surveyOf(ROOM, FORMS)], undefined, "metric", [])).toEqual({ lists: [], rooms: [none], more: false });
  });

  it("reads the layers of a level record and of its surveys as the records of the store", () => {
    const lists = storeLists(STORE, ADD_ONS);
    const surveys = STORE.rooms.map((room) => roomSurvey(room, lists, false, ADD_ONS));
    const read = surveyParts(surveys, withLists(level, lists, ADD_ONS), "metric", ADD_ONS);
    expect(read).toEqual(
      levelParts(
        [layerOf(STORE), layerOf(STORE, GAS)],
        STORE.rooms.map((room) => surveyOf(room, FORMS)),
        "metric",
      ),
    );
    expect(read.more).toBe(false);
    expect(read.lists).toEqual(stacks(main, vent));
    expect(draftKeys(surveys[0] ?? surveyOf(box(), FORMS), read.rooms[0]).draft.sides).toEqual(ROOM.sides);
  });

  it("gives a store with the same layers, for two add-ons and two rooms", () => {
    const store = mixedStore();
    const lists = storeLists(store, ADD_ONS);
    const record = withLists(level, lists, ADD_ONS);
    const surveys = store.rooms.map((room) => roomSurvey(room, lists, false, ADD_ONS));
    expect(Object.keys(record.layers ?? {})).toEqual([P, GAS.schema]);
    expect(surveys.map((survey) => Object.keys(survey.layers ?? {}))).toEqual([[P, GAS.schema], [P]]);
    const read = surveyParts(surveys, record, "metric", ADD_ONS);
    expect(read.more).toBe(false);
    const rooms = surveys.map((survey, index) => draftKeys(survey, read.rooms[index]).draft);
    const next = withNewRooms(storeOf([emptyDraft("m")]), rooms, [], true, read.lists);
    const again = storeLists(next, ADD_ONS);
    expect(withLists(level, again, ADD_ONS)).toEqual(record);
    expect(next.rooms.map((room) => roomSurvey(room, again, false, ADD_ONS))).toEqual(surveys);
    // One file of one room has the lists in the layer of the room.
    const alone = roomSurvey(store.rooms[0] ?? box(), lists, true, ADD_ONS);
    const one = readSurvey(alone, ADD_ONS);
    expect(one.more).toBe(false);
    const single = withNewRooms(storeOf([emptyDraft("m")]), [one.draft], [], true, one.lists);
    expect(roomSurvey(single.rooms[0] ?? box(), storeLists(single, ADD_ONS), true, ADD_ONS)).toEqual(alone);
  });

  it("reads a name of a record of a list of a different record, in the two directions", () => {
    // A stack of the level record names a stack of the survey, and the other way. A tap of the survey names a stack of the level record.
    const top: Level = { ...level, layers: { [P]: { schema: P, stacks: [{ id: "top", name: "Top", size: 110, vent: "side" }] } } };
    const survey: Survey = { ...surveyOf(box(), FORMS), layers: { [P]: { schema: P, stacks: [{ id: "side", name: "Side", size: 110, vent: "top" }], taps: [{ id: "a", anchor: WALL, stack: "top" }] } } };
    const read = surveyParts([survey], top, "metric", ADD_ONS);
    expect(read.more).toBe(false);
    expect(read.lists).toEqual(stacks(recordOf("r1", { values: { name: "Top", size: "110" }, records: { vent: "r2" } }), recordOf("r2", { values: { name: "Side", size: "110" }, records: { vent: "r1" } })));
    expect(read.rooms[0]?.points).toEqual([{ wall: "wall-1", offset: 1, height: 0.9, point: ownedOf(P, "taps", { records: { stack: "r1" } }) }]);
    // With no level record, the names of the survey have no record.
    const alone = surveyParts([survey], undefined, "metric", ADD_ONS);
    expect(alone.more).toBe(true);
    expect(alone.lists).toEqual(stacks(recordOf("r1", { values: { name: "Side", size: "110" } })));
    expect(alone.rooms[0]?.points).toEqual([{ wall: "wall-1", offset: 1, height: 0.9, point: ownedOf(P, "taps") }]);
  });

  it("repeats the read until it finds no new record of a list", () => {
    expect(checkForm(CHAIN)).toEqual([]);
    const C = CHAIN.schema;
    const plain = surveyOf(box(), [CHAIN]);
    // The third needs the second, and the second needs the first. Each one is in a different record.
    const third: Survey = { ...plain, layers: { [C]: { schema: C, thirds: [{ id: "c", second: "b" }] } } };
    const second: Survey = { ...plain, layers: { [C]: { schema: C, seconds: [{ id: "b", first: "a" }] } } };
    const top: Level = { ...level, layers: { [C]: { schema: C, firsts: [{ id: "a", name: "One" }] } } };
    const read = surveyParts([third, second], top, "metric", [pageAddOn(CHAIN)]);
    expect(read).toEqual({
      lists: [
        { layer: C, collection: "firsts", records: [recordOf("r1", { values: { name: "One" } })] },
        { layer: C, collection: "seconds", records: [recordOf("r2", { records: { first: "r1" } })] },
        { layer: C, collection: "thirds", records: [recordOf("r3", { records: { second: "r2" } })] },
      ],
      rooms: [none, none],
      more: false,
    });
    // With no first record, the second one and the third one are not records of the form.
    expect(surveyParts([third, second], level, "metric", [pageAddOn(CHAIN)])).toEqual({ lists: [], rooms: [none, none], more: true });
  });

  it("tells a layer of no add-on of the page, and a layer with a fault in its form", () => {
    const plain = surveyOf(ROOM, FORMS);
    const other = { "other/1": { schema: "other/1" } };
    expect(surveyParts([{ ...plain, layers: other }], undefined, "metric", ADD_ONS)).toEqual({ lists: [], rooms: [none], more: true });
    expect(surveyParts([plain], { ...level, layers: other }, "metric", ADD_ONS)).toEqual({ lists: [], rooms: [none], more: true });
    // The test add-on of the core does not read a layer with a different name in it.
    expect(surveyParts([{ ...plain, layers: { [P]: { schema: "wrong", taps: [TAP_2] } } }], undefined, "metric", ADD_ONS)).toEqual({ lists: [], rooms: [none], more: true });
    // The page does not have the add-on of a layer of its own survey.
    const survey = roomSurvey(ROOM, storeLists(STORE, ADD_ONS), true, ADD_ONS);
    expect(surveyParts([survey], undefined, "metric", [pageAddOn(GAS)])).toEqual({ lists: [], rooms: [none], more: true });
  });

  it("reads the layer of each record, and a record with no layer of the form gives no record", () => {
    const given = { [P]: { schema: P, stacks: [{ id: "new", name: "New", size: 110 }] } };
    const read = stacks(recordOf("r1", { values: { name: "New", size: "110" } }));
    const survey: Survey = { ...surveyOf(box(), FORMS), layers: given };
    expect(surveyParts([survey], undefined, "metric", [pageAddOn(PLUMBING)])).toEqual({ lists: read, rooms: [none], more: false });
    // The level record has the layer, and the survey has none.
    expect(surveyParts([surveyOf(box(), FORMS)], { ...level, layers: given }, "metric", [pageAddOn(PLUMBING)])).toEqual({ lists: read, rooms: [none], more: false });
    expect(surveyParts([surveyOf(box(), FORMS)], level, "metric", [pageAddOn(PLUMBING)])).toEqual({ lists: [], rooms: [none], more: false });
  });

  it("gives each layer to the function `plain` of its add-on, with the system of units", () => {
    const seen: unknown[] = [];
    const addOn: PageAddOn = {
      ...pageAddOn(PLUMBING),
      plain: (layer, system) => {
        seen.push([layer, system]);
        return { schema: P, stacks: [{ id: "s", name: system }] };
      },
    };
    const given = { schema: P, stacks: [{ id: "a", name: "A" }] };
    // The second survey has no layer, so the function gets only the first one.
    const read = surveyParts([{ ...surveyOf(box(), FORMS), layers: { [P]: given } }, surveyOf(box(), FORMS)], undefined, "imperial", [addOn]);
    expect(seen).toEqual([[given, "imperial"]]);
    expect(read).toEqual({ lists: stacks(recordOf("r1", { values: { name: "imperial" } })), rooms: [none, none], more: false });
  });
});

describe("readSurvey", () => {
  const lists = storeLists(STORE, ADD_ONS);

  it("reads the survey record of a room of a store again", () => {
    const survey = roomSurvey(ROOM, lists, true, ADD_ONS);
    const read = readSurvey(survey, ADD_ONS);
    expect(read.more).toBe(false);
    expect(read.draft.sides).toEqual(ROOM.sides);
    expect(read.lists).toEqual(stacks(recordOf("r1", { values: { name: "Main", size: "110", slope: "-2" } }), recordOf("r2", { values: { name: "Vent", size: "110" }, records: { vent: "r1" } })));
    expect([...read.keys]).toEqual([]);
  });

  it("tells a name of a record of a list that the survey does not list", () => {
    const read = readSurvey(roomSurvey(ROOM, lists, false, ADD_ONS), ADD_ONS);
    expect(read.more).toBe(true);
    expect(read.lists).toEqual([]);
    expect(read.draft.sides[0]?.features[0]?.point).toEqual(ownedOf(P, "taps", { values: { size: "15 mm" }, points: { next: "f2" } }));
  });

  it("has the usual numbers of the units of the survey", () => {
    const feet = roomSurvey(box("ft-in"), storeLists({ ...storeOf([box("ft-in")]), lists: stacks(recordOf("r1", { values: { name: "Main" } })) }, ADD_ONS), true, ADD_ONS);
    expect(feet.layers).toEqual({ [P]: { schema: P, stacks: [{ id: "main", name: "Main", size: 100 }] } });
    expect(readSurvey(feet, ADD_ONS).lists).toEqual(stacks(recordOf("r1", { values: { name: "Main", size: "100" } })));
  });

  it("reads no record of an add-on from a survey with no layer, and tells the data that a draft does not keep", () => {
    const none = readSurvey(surveyOf(ROOM, FORMS), ADD_ONS);
    expect(none).toMatchObject({ lists: [], more: false });
    expect(none.draft.sides[0]?.features).toEqual([]);
    expect(none.draft.sides[0]?.objects.map((object) => object.owns)).toEqual([[]]);
    // The data that the core draft does not keep.
    expect(readSurvey({ ...surveyOf(ROOM, FORMS), checks: [{ id: "diagonal", from: "wall-1", to: "wall-3", length: 5 }] }, ADD_ONS).more).toBe(true);
    // A layer of no add-on of the page.
    expect(readSurvey({ ...surveyOf(ROOM, FORMS), layers: { "other/1": { schema: "other/1" } } }, ADD_ONS).more).toBe(true);
  });
});
