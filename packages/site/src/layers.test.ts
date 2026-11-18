import { checkForm, formLayer, formRecords, LEVEL_SCHEMA, type FormRecord, type FormRecords, type LayerForm, type Level, type Survey, type WallAnchor } from "@mark1russell7/room-view";
import { describe, expect, it } from "vitest";
import type { AddOnBridge, PageAddOn } from "./bridge.ts";
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
import { levelParts, numberFrom, placeOf, readSurvey, roomRecords, roomSurvey, storeLists, surveyParts, withLists, type LayerRecords, type LevelParts } from "./layers.ts";

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
/** The two false add-ons, with no bridge. */
const ADD_ONS: readonly PageAddOn[] = [{ form: PLUMBING }, { form: GAS }];

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
    expect(lists.get(GAS.schema)).toEqual({ system: "metric", records: { meters: [] }, ids: new Map() });
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
    expect([...(storeLists({ ...STORE, lists: stacks(recordOf("r1")) }, [{ form }]).get(P)?.ids.values() ?? [])]).toEqual(["record-1"]);
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
    const lists = storeLists(STORE, [{ form: PLUMBING }, { form: { schema: P, collections: [] } }]);
    expect([...lists.keys()]).toEqual([P]);
    expect(lists.get(P)).toEqual(storeLists(STORE, [{ form: PLUMBING }]).get(P));
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

describe("roomSurvey", () => {
  it("adds nothing for an add-on with no bridge", () => {
    expect(roomSurvey(ROOM, storeLists(STORE, ADD_ONS), true, ADD_ONS)).toEqual(surveyOf(ROOM, FORMS));
    expect(roomSurvey(ROOM, undefined, false, [])).toEqual(surveyOf(ROOM, []));
  });

  it("gives the records of each add-on to its bridge", () => {
    const calls: unknown[] = [];
    const bridge: AddOnBridge = {
      read: (surveys) => ({ lists: {}, rooms: surveys.map(() => ({})), more: false }),
      survey: (survey, records, listed) => {
        calls.push({ records, listed });
        return { ...survey, name: `${survey.name ?? ""}+` };
      },
      level: (level) => level,
    };
    const addOns: readonly PageAddOn[] = [{ form: PLUMBING, bridge }, { form: GAS }, { form: GAS, bridge }];
    const lists = storeLists(STORE, addOns);
    const survey = roomSurvey({ ...ROOM, name: "Bath" }, lists, true, addOns);
    expect(survey).toEqual({ ...surveyOf({ ...ROOM, name: "Bath" }, FORMS), name: "Bath++" });
    expect(calls).toEqual([
      { records: roomRecords(PLUMBING, ROOM, lists.get(P), FORMS), listed: true },
      { records: roomRecords(GAS, ROOM, lists.get(GAS.schema), FORMS), listed: true },
    ]);
    calls.length = 0;
    roomSurvey(ROOM, undefined, undefined, addOns);
    expect(calls).toEqual([
      { records: roomRecords(PLUMBING, ROOM, undefined, FORMS), listed: false },
      { records: roomRecords(GAS, ROOM, undefined, FORMS), listed: false },
    ]);
  });

  it("numbers the points of two add-ons with one word together, as the survey record does", () => {
    const seen: FormRecords[] = [];
    const bridge: AddOnBridge = {
      read: (surveys) => ({ lists: {}, rooms: surveys.map(() => ({})), more: false }),
      survey: (survey, records) => {
        seen.push(records);
        return survey;
      },
      level: (level) => level,
    };
    const gas: LayerForm = { ...GAS, collections: GAS.collections.map((collection) => (collection.name === "valves" ? { ...collection, word: "water tap" } : collection)) };
    const mixed = onWall(box(), 0, [tap("f1", "1"), point("f2", "2", ownedOf(gas.schema, "valves")), tap("f3", "3")]);
    roomSurvey(mixed, undefined, false, [{ form: PLUMBING, bridge }, { form: gas, bridge }]);
    expect(seen.map((records) => [...(records["taps"] ?? []), ...(records["valves"] ?? [])].map((record) => record.id))).toEqual([["water-tap-1", "water-tap-3"], ["water-tap-2"]]);
  });
});

describe("withLists", () => {
  const level: Level = { schema: LEVEL_SCHEMA, unit: "m", rooms: [] };

  it("gives the records of the lists of each add-on to its bridge", () => {
    const bridge: AddOnBridge = {
      read: (surveys) => ({ lists: {}, rooms: surveys.map(() => ({})), more: false }),
      survey: (survey) => survey,
      level: (given, records) => ({ ...given, name: `${given.name ?? ""}${JSON.stringify(records)}` }),
    };
    const lists = storeLists(STORE, ADD_ONS);
    expect(withLists(level, lists, ADD_ONS)).toBe(level);
    expect(withLists(level, new Map(), [{ form: PLUMBING, bridge }])).toBe(level);
    const expected = formRecords(PLUMBING, formLayer(PLUMBING, lists.get(P)?.records ?? {}, { system: "metric" })).records;
    expect(expected["stacks"]?.map((record) => record.values["size"])).toEqual([110, 110]);
    expect(withLists(level, lists, [{ form: PLUMBING, bridge }]).name).toBe(JSON.stringify(expected));
  });
});

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
    const valves = [point("f3", "0.5", ownedOf(GAS.schema, "valves", { records: { meter: "r3" } }), "0.3"), point("f4", "3.5", ownedOf(GAS.schema, "valves", { points: { next: "f3" } }), "0.3")];
    const first: Draft = { ...ROOM, sides: ROOM.sides.map((side, index) => (index === 0 ? { ...side, features: [...side.features, ...valves] } : side)) };
    const second = onWall(box(), 2, [tap("f1", "1", { records: { stack: "r2" } })], [sink("o1", "2", [ownedOf(P, "notes", { values: { text: "Old" } })])]);
    const store: Store = { ...storeOf([first, second]), lists: [...STORE.lists, { layer: GAS.schema, collection: "meters", records: [recordOf("r3", { values: { name: "Main" } })] }] };
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

/**
 * This function gives a false add-on with a bridge that keeps the records of each survey in memory.
 * The fields of a survey record have no place for the records of a false add-on.
 */
function kept(form: LayerForm): PageAddOn {
  const memory = new WeakMap<Survey, { readonly records: FormRecords; readonly listed: boolean }>();
  const places = (place: string): readonly string[] => form.collections.filter((collection) => placeOf(collection) === place).map((collection) => collection.name);
  return {
    form,
    bridge: {
      read: (surveys) => ({
        lists: Object.assign({}, ...surveys.map((survey) => (memory.get(survey)?.listed === true ? pick(memory.get(survey)?.records ?? {}, places("list")) : {}))) as FormRecords,
        rooms: surveys.map((survey) => pick(memory.get(survey)?.records ?? {}, [...places("point"), ...places("owned")])),
        more: surveys.some((survey) => survey.name === "More"),
      }),
      survey: (survey, records, listed) => {
        const next = { ...survey };
        memory.set(next, { records, listed });
        return next;
      },
      level: (level) => level,
    },
  };
}

describe("readSurvey", () => {
  const addOns: readonly PageAddOn[] = [kept(PLUMBING), { form: GAS }];

  it("reads the survey record of a room of a store again", () => {
    const survey = roomSurvey(ROOM, storeLists(STORE, addOns), true, addOns);
    const read = readSurvey(survey, addOns);
    expect(read.more).toBe(false);
    expect(read.draft.sides).toEqual(ROOM.sides);
    expect(read.lists).toEqual(stacks(recordOf("r1", { values: { name: "Main", size: "110", slope: "-2" } }), recordOf("r2", { values: { name: "Vent", size: "110" }, records: { vent: "r1" } })));
    expect([...read.keys]).toEqual([]);
  });

  it("tells a name of a record of a list that the survey does not list", () => {
    const read = readSurvey(roomSurvey(ROOM, storeLists(STORE, addOns), false, addOns), addOns);
    expect(read.more).toBe(true);
    expect(read.lists).toEqual([]);
    expect(read.draft.sides[0]?.features[0]?.point).toEqual(ownedOf(P, "taps", { values: { size: "15 mm" }, points: { next: "f2" } }));
  });

  it("reads no record of an add-on with no bridge, and tells the data that a bridge does not keep", () => {
    const none = readSurvey(roomSurvey(ROOM, storeLists(STORE, ADD_ONS), true, ADD_ONS), ADD_ONS);
    expect(none).toMatchObject({ lists: [], more: false });
    expect(none.draft.sides[0]?.features).toEqual([]);
    expect(none.draft.sides[0]?.objects.map((object) => object.owns)).toEqual([[]]);
    expect(surveyParts([surveyOf(ROOM)], undefined, "metric", ADD_ONS)).toEqual({ lists: [], rooms: [{ points: [], owned: new Map() }], more: false });
    expect(readSurvey(roomSurvey({ ...ROOM, name: "More" }, undefined, false, addOns), addOns).more).toBe(true);
    // The data that the core draft does not keep.
    expect(readSurvey({ ...surveyOf(ROOM), checks: [{ id: "diagonal", from: "wall-1", to: "wall-3", length: 5 }] }, addOns).more).toBe(true);
  });
});
