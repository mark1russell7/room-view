import { checkRoom, expandLevel, expandSurvey, LEVEL_SCHEMA, type Level, type LevelResult } from "@mark1russell7/room-view";
import { SAMPLE_LEVEL, SAMPLE_SURVEY } from "@mark1russell7/room-view/sample";
import { describe, expect, it } from "vitest";
import {
  emptyDraft,
  exampleDraft,
  listedObjects,
  statusOf,
  storeOf,
  surveyOf,
  withCircuit,
  withConnection,
  withNewCircuit,
  withNewRooms,
  withOutletCircuit,
  type Draft,
  type DraftEnd,
  type DraftFeature,
  type DraftObject,
  type DraftSide,
  type FeatureKind,
  type Status,
  type Store,
  type TypedLength,
} from "./draft.ts";
import { apartNote, apartRooms, draftsOf, joinChoices, jointsOf, levelOf, levelStatus, roomIds, shownLevel, shownLevelObjects, surveyDrafts, type Joint } from "./level.ts";

const typed = (text: string): TypedLength => ({ value: text, inches: "" });

/**
 * This function gives a room of 4 m by 3 m with a name. The walk goes to the left: wall 1 is the south wall, and wall 2 is the east wall.
 * `features` and `objects` have the features and the objects of a wall at its position, from 0. `lengths` replaces the lengths of the walls.
 */
function box(
  name: string,
  features: Readonly<Record<number, readonly DraftFeature[]>> = {},
  lengths: readonly string[] = ["4", "3", "4", "3"],
  objects: Readonly<Record<number, readonly DraftObject[]>> = {},
): Draft {
  return {
    ...emptyDraft("m"),
    name,
    sides: lengths.map((length, index): DraftSide => ({ key: `s${String(index + 1)}`, length: typed(length), corner: "left", angle: "", features: features[index] ?? [], objects: objects[index] ?? [] })),
  };
}

/** This function gives a door, or a feature of a different kind, with a distance from the start of its wall and a width. */
function hole(key: string, offset: string, width = "0.9", kind: FeatureKind = "door"): DraftFeature {
  return { key, kind, from: "start", offset: typed(offset), width: typed(width), height: typed(""), sill: typed("") };
}

const end = (room: number, feature: string): DraftEnd => ({ room, feature });

/** This function gives a cabinet of 1 m by 0.5 m by 1 m against a wall, with a distance from the start of its wall. `outlet` is the key of its outlet. */
function cabinet(key: string, offset: string, outlet = ""): DraftObject {
  return {
    key,
    kind: "cabinet",
    name: "",
    from: "start",
    offset: typed(offset),
    width: typed("1"),
    depth: typed("0.5"),
    height: typed("1"),
    gap: typed(""),
    lift: typed(""),
    outlet,
    holds: [],
  };
}

/** Room A has two doors on its east wall: door 1 from 0.2 m to 1.1 m above the south corner, and door 2 from 2 m to 2.9 m. */
const A = box("A", { 1: [hole("f1", "0.2"), hole("f2", "2")] });

/** Room B has the same two doors on its west wall. The walk goes down this wall, so its door 1 is door 2 of room A. */
const B = box("B", { 3: [hole("f1", "0.1"), hole("f2", "1.9")] });

const C = box("C", { 3: [hole("f1", "1")] });

/** Room A and room B, joined through door 1 of A. Room B is to the east of room A. */
const PAIR = withConnection(storeOf([A, B]), end(0, "f1"), end(1, "f2"));

/** The two rooms with their two doors joined. The second connection is a check of the first one. */
const TWICE = withConnection(PAIR, end(0, "f2"), end(1, "f1"));

const expand = (store: Store): LevelResult => expandLevel(levelOf(store));
const joints = (store: Store): readonly Joint[] => jointsOf(store, expand(store));
const statusFor = (draft: Draft): Status => statusOf(draft, expandSurvey(surveyOf(draft)));
const statusAll = (store: Store): Status => levelStatus(store.rooms, store.rooms.map(statusFor), expand(store), joints(store));

/** This function gives a store with a different room B. */
const withB = (store: Store, room: Draft): Store => ({ ...store, rooms: [A, room] });

/**
 * Two rooms with one outlet each, on the circuit `Kitchen` of 20 A. The second circuit has no name and no numbers.
 * The rooms are in meters, so each empty field gets its usual value: 16 A or 230 V.
 */
const WIRED: Store = (() => {
  const base = withNewCircuit(withNewCircuit(storeOf([box("A", { 0: [hole("f3", "1", "", "outlet")] }), box("B", { 2: [hole("f1", "2", "", "outlet")] })])));
  const named = withCircuit(base, "c1", { name: "Kitchen", breaker: "20" });
  return { ...named, rooms: named.rooms.map((room, index) => withOutletCircuit(room, index === 0 ? "f3" : "f1", "c1")) };
})();

/** This function gives the circuit of each feature of each room. */
const circuitsOf = (rooms: readonly Draft[]): readonly (readonly (string | undefined)[])[] => rooms.map((room) => room.sides.flatMap((side) => side.features.map((item) => item.circuit)));

describe("roomIds", () => {
  it("gives the words of each name, and a number to a room with no name", () => {
    expect(roomIds([box("Living room"), box(""), box("  Bath & WC ")])).toEqual(["living-room", "room-2", "bath-wc"]);
  });

  it("gives a different id to each room", () => {
    expect(roomIds([box("Room 2"), box(""), box("room-2"), box("Hall"), box("hall")])).toEqual(["room-2", "room-2-2", "room-2-3", "hall", "hall-2"]);
  });
});

describe("levelOf", () => {
  it("makes a level record with one room for each room of the store", () => {
    const level = levelOf(storeOf([A, { ...B, mode: "cm" }]));
    expect(level.schema).toBe(LEVEL_SCHEMA);
    expect(level.unit).toBe("m");
    expect(level.rooms.map((room) => room.id)).toEqual(["a", "b"]);
    expect(level.rooms.map((room) => room.survey.unit)).toEqual(["m", "cm"]);
    expect(Object.keys(level)).not.toContain("connections");
  });

  it("has the unit of the first room", () => {
    expect(levelOf(storeOf([exampleDraft("ft-in"), A])).unit).toBe("in");
  });

  it("lists the circuits of the store, and each outlet names the id of its circuit", () => {
    const level = levelOf(WIRED);
    expect(level.circuits).toEqual([
      { id: "kitchen", name: "Kitchen", breaker: 20, voltage: 230, limit: 3680 },
      { id: "circuit-2", breaker: 16, voltage: 230, limit: 2944 },
    ]);
    expect(level.rooms.map((room) => room.survey.outlets?.map((item) => item.circuit))).toEqual([["kitchen"], ["kitchen"]]);
    // The level lists the circuits, so the survey of a room lists none.
    expect(level.rooms.every((room) => !("circuits" in room.survey))).toBe(true);
    expect(Object.keys(levelOf(PAIR))).not.toContain("circuits");
    // The circuit of each outlet is a circuit of the level, so the room record of the level has no fault.
    expect(checkRoom(expandLevel(level).room).filter((finding) => finding.level === "error")).toEqual([]);
  });

  it("gives no outlet a circuit with a bad number", () => {
    const level = levelOf(withCircuit(WIRED, "c1", { breaker: "0" }));
    expect(level.circuits?.map((item) => item.id)).toEqual(["circuit-2"]);
    expect(level.rooms.map((room) => room.survey.outlets?.map((item) => item.circuit))).toEqual([[undefined], [undefined]]);
  });

  it("makes one connection for each connection of the store, with the ids of the openings", () => {
    expect(levelOf(TWICE).connections).toEqual([
      { id: "a/door-1", from: { room: "a", opening: "door-1" }, to: { room: "b", opening: "door-2" } },
      { id: "a/door-2", from: { room: "a", opening: "door-2" }, to: { room: "b", opening: "door-1" } },
    ]);
  });

  it("puts the second room at the door of the first one", () => {
    const result = expand(PAIR);
    expect(result.connections.map((item) => item.use)).toEqual(["place"]);
    expect(result.rooms.map((room) => room.place)).toEqual(["first", "connection"]);
    expect(result.rooms.map((room) => room.group)).toEqual([0, 0]);
    // Room B is to the east of room A, with one wall between them.
    const corner = result.rooms[1]?.result.corners[0];
    expect(corner?.[0]).toBeCloseTo(4.11, 6);
    expect(corner?.[1]).toBeCloseTo(0, 6);
  });
});

describe("draftsOf", () => {
  it("makes the rooms and the connections of the sample apartment", () => {
    const drafts = draftsOf(SAMPLE_LEVEL);
    expect(drafts.rooms.map((room) => room.name)).toEqual(["Living room", "Hall", "Bathroom", "Bedroom"]);
    expect(drafts.connections).toHaveLength(3);
    // The sample has a name and connections with a thickness. The page keeps its circuits.
    expect(drafts.more).toBe(true);
    // The circuit C of the level comes first. The survey of the living room lists the circuits A and B.
    expect(drafts.circuits).toEqual([
      { key: "c1", name: "Circuit C", breaker: "15", voltage: "120" },
      { key: "c2", name: "Circuit A", breaker: "15", voltage: "120" },
      { key: "c3", name: "Circuit B", breaker: "15", voltage: "120" },
    ]);
    expect(circuitsOf(drafts.rooms).map((list) => list.filter((item) => item !== undefined).sort())).toEqual([["c2", "c2", "c2", "c2", "c2", "c3", "c3"], ["c1"], ["c1"], ["c1", "c1", "c1"]]);
  });

  it("reads the circuits of the level record of a store again", () => {
    const drafts = draftsOf(levelOf(WIRED));
    expect(drafts.circuits).toEqual([
      { key: "c1", name: "Kitchen", breaker: "20", voltage: "230" },
      { key: "c2", name: "", breaker: "16", voltage: "230" },
    ]);
    expect(circuitsOf(drafts.rooms)).toEqual([["c1"], ["c1"]]);
    expect(drafts.more).toBe(false);
    expect(levelOf({ ...storeOf(drafts.rooms), circuits: drafts.circuits })).toEqual(levelOf(WIRED));
  });

  it("keeps the first circuit of an id, from the level or from a survey", () => {
    const level = levelOf(WIRED);
    const kitchen = level.circuits?.[0];
    const withSurvey = (circuits: Level["circuits"]): Level => ({ ...level, rooms: level.rooms.map((room, index) => (index === 1 ? { ...room, survey: { ...room.survey, circuits } } : room)) });
    const same = draftsOf(withSurvey([...(kitchen === undefined ? [] : [kitchen]), { id: "hall", limit: 2944 }]));
    expect(same.circuits.map((item) => [item.key, item.name])).toEqual([
      ["c1", "Kitchen"],
      ["c2", ""],
      ["c3", ""],
    ]);
    expect(same.more).toBe(false);
    const other = draftsOf(withSurvey([{ id: "kitchen", breaker: 15, voltage: 120, limit: 1440 }]));
    expect(other.circuits[0]).toEqual({ key: "c1", name: "Kitchen", breaker: "20", voltage: "230" });
    expect(other.more).toBe(true);
  });

  it("tells an outlet of a circuit that the level does not have", () => {
    const drafts = draftsOf({ ...levelOf(WIRED), circuits: [] });
    expect(drafts.circuits).toEqual([]);
    expect(circuitsOf(drafts.rooms)).toEqual([[undefined], [undefined]]);
    expect(drafts.more).toBe(true);
  });

  it("gives rooms that fit together", () => {
    const drafts = draftsOf(SAMPLE_LEVEL);
    const store = withNewRooms(storeOf([exampleDraft("m")]), drafts.rooms, drafts.connections, true);
    expect(store.rooms).toHaveLength(4);
    expect(roomIds(store.rooms)).toEqual(["living-room", "hall", "bathroom", "bedroom"]);
    const result = expand(store);
    expect(result.rooms.map((room) => room.result.closure.closed)).toEqual([true, true, true, true]);
    expect(result.rooms.map((room) => room.group)).toEqual([0, 0, 0, 0]);
    expect(result.connections.map((item) => item.fits)).toEqual([true, true, true]);
    expect(joints(store).map((joint) => joint.state)).toEqual(["fits", "fits", "fits"]);
    expect(apartRooms(result)).toEqual([]);
    expect(statusAll(store)).toMatchObject({ level: "closed", title: "The rooms fit together." });
    expect(shownLevel(result).floors?.map((floor) => floor.id)).toEqual(["living-room", "hall", "bathroom", "bedroom"]);
  });

  it("keeps the objects of each room", () => {
    const drafts = draftsOf(SAMPLE_LEVEL);
    expect(drafts.rooms.map((room) => listedObjects(room).length)).toEqual([9, 1, 1, 2]);
    const store = withNewRooms(storeOf([exampleDraft("m")]), drafts.rooms, drafts.connections, true);
    const result = expand(store);
    expect(result.objects).toHaveLength(13);
    expect(result.objects.filter((object) => object.id.startsWith("bedroom/")).map((object) => object.kind).sort()).toEqual(["bed", "cabinet"]);
    const objects = shownLevelObjects(result, shownLevel(result));
    expect(objects).toEqual(result.objects);
    // The tower and the four nodes of the rack have an outlet.
    expect(objects.filter((object) => object.outlet !== undefined)).toHaveLength(5);
  });

  it("reads the level record of a store again", () => {
    const drafts = draftsOf(levelOf(TWICE));
    expect(drafts.rooms.map((room) => room.name)).toEqual(["A", "B"]);
    expect(drafts.connections).toEqual(TWICE.connections);
    expect(drafts.more).toBe(false);
    expect(levelOf(storeOf(drafts.rooms)).rooms).toEqual(levelOf(TWICE).rooms);
  });

  it("removes a connection that the rooms cannot have", () => {
    const level = levelOf(TWICE);
    const from = { room: "a", opening: "door-1" };
    const bad: Level = {
      ...level,
      connections: [
        { id: "no-opening", from, to: { room: "b", opening: "door-9" } },
        { id: "no-room", from, to: { room: "z", opening: "door-1" } },
        { id: "good", from, to: { room: "b", opening: "door-2" } },
        { id: "second", from, to: { room: "b", opening: "door-1" } },
      ],
    };
    const drafts = draftsOf(bad);
    expect(drafts.connections).toEqual([{ from: end(0, "f1"), to: end(1, "f2") }]);
    expect(drafts.more).toBe(true);
  });

  it("tells the data that a draft does not keep", () => {
    const level = levelOf(PAIR);
    expect(draftsOf(level).more).toBe(false);
    expect(draftsOf({ ...level, name: "Home" }).more).toBe(true);
    // A circuit with no breaker and no voltage gets 16 A at 230 V in meters, so its limit is 2944 W, not 1440 W.
    expect(draftsOf({ ...level, circuits: [{ id: "c", limit: 1440 }] }).more).toBe(true);
    expect(draftsOf({ ...level, circuits: [{ id: "c", breaker: 16, voltage: 230, limit: 2944 }] }).more).toBe(false);
    expect(draftsOf({ ...level, connections: (level.connections ?? []).map((item) => ({ ...item, thickness: 0.2 })) }).more).toBe(true);
  });
});

describe("surveyDrafts", () => {
  it("makes one room with the circuits of a survey record", () => {
    const drafts = surveyDrafts(SAMPLE_SURVEY);
    expect(drafts.rooms.map((room) => room.name)).toEqual(["Sample room"]);
    expect(drafts.connections).toEqual([]);
    expect(drafts.circuits).toEqual([
      { key: "c1", name: "Circuit A", breaker: "15", voltage: "120" },
      { key: "c2", name: "Circuit B", breaker: "15", voltage: "120" },
    ]);
    expect(
      circuitsOf(drafts.rooms)
        .flat()
        .filter((item) => item !== undefined)
        .sort(),
    ).toEqual(["c1", "c1", "c1", "c1", "c1", "c2", "c2"]);
  });

  it("reads the survey of a room of a store again", () => {
    const records = { ids: new Map([["c1", "kitchen"]]), records: [{ id: "kitchen", name: "Kitchen", breaker: 20, voltage: 230, limit: 3680 }] };
    const drafts = surveyDrafts(surveyOf(WIRED.rooms[0] ?? A, records));
    expect(drafts.circuits).toEqual([{ key: "c1", name: "Kitchen", breaker: "20", voltage: "230" }]);
    expect(circuitsOf(drafts.rooms)).toEqual([["c1"]]);
    expect(drafts.more).toBe(false);
    // An outlet of a circuit that the survey does not list loses its circuit, and the page tells it.
    const lost = surveyDrafts(surveyOf(WIRED.rooms[0] ?? A, { ids: records.ids, records: [] }));
    expect(circuitsOf(lost.rooms)).toEqual([[undefined]]);
    expect(lost.more).toBe(true);
  });
});

describe("joinChoices", () => {
  const pane = hole("f3", "2.5", "1", "window");
  const socket = hole("f4", "3.5", "", "outlet");
  const base = storeOf([A, box("B", { 3: [hole("f1", "0.1"), hole("f2", "1.9")], 0: [pane, socket] }), C]);

  it("gives the doors of the other rooms", () => {
    const choices = joinChoices(base, end(0, "f1"));
    expect(choices.map((choice) => choice.text)).toEqual(["B: door 1 on wall 4", "B: door 2 on wall 4", "C: door 1 on wall 4"]);
    expect(choices.map((choice) => choice.end)).toEqual([end(1, "f1"), end(1, "f2"), end(2, "f1")]);
    expect(choices.map((choice) => choice.current)).toEqual([false, false, false]);
  });

  it("gives an opening with no door, and the number of a room with no name", () => {
    const store = storeOf([A, box("", { 2: [hole("f1", "1", "1.2", "gap")] })]);
    expect(joinChoices(store, end(0, "f1")).map((choice) => choice.text)).toEqual(["Room 2: opening 1 on wall 3"]);
  });

  it("marks the door that the feature goes to, and gives no door of a different connection", () => {
    const store = withConnection(base, end(0, "f1"), end(1, "f2"));
    expect(joinChoices(store, end(0, "f1")).map((choice) => [choice.text, choice.current])).toEqual([
      ["B: door 1 on wall 4", false],
      ["B: door 2 on wall 4", true],
      ["C: door 1 on wall 4", false],
    ]);
    expect(joinChoices(store, end(0, "f2")).map((choice) => choice.text)).toEqual(["B: door 1 on wall 4", "C: door 1 on wall 4"]);
    // From the other room, the doors of room A are the choices.
    expect(joinChoices(store, end(1, "f2")).map((choice) => [choice.text, choice.current])).toEqual([
      ["A: door 1 on wall 2", true],
      ["A: door 2 on wall 2", false],
      ["C: door 1 on wall 4", false],
    ]);
  });
});

describe("jointsOf", () => {
  it("tells a connection that puts a room at its place", () => {
    expect(joints(PAIR)).toEqual([{ connection: PAIR.connections[0], state: "fits", title: "A and B", text: "Door 1 of A is door 2 of B." }]);
  });

  it("tells a second door between two rooms that fits", () => {
    const result = expand(TWICE);
    expect(result.connections.map((item) => item.use)).toEqual(["place", "check"]);
    expect(result.connections[1]?.gap).toBeCloseTo(0, 6);
    expect(joints(TWICE).map((joint) => [joint.state, joint.text])).toEqual([
      ["fits", "Door 1 of A is door 2 of B."],
      ["fits", "Door 2 of A is door 1 of B."],
    ]);
  });

  it("tells the distance of a door that does not fit", () => {
    // Door 1 of room B is 0.5 m nearer to the south than door 2 of room A.
    const moved = withB(TWICE, box("B", { 3: [hole("f1", "0.6"), hole("f2", "1.9")] }));
    const joint = joints(moved)[1];
    expect(joint?.state).toBe("off");
    expect(joint?.text).toBe("Door 2 of A and door 1 of B are 0.5 m apart. A length is wrong in one of the rooms, or this door goes to a different room.");
    expect(statusAll(moved)).toEqual({ level: "open", title: "A and B do not fit at a door.", text: joint?.text });
  });

  it("tells the angle of two walls that are not parallel", () => {
    // Door 1 of room B is on its north wall.
    const turned = withB(TWICE, box("B", { 2: [hole("f1", "1")], 3: [hole("f2", "1.9")] }));
    const joint = joints(turned)[1];
    expect(joint?.state).toBe("off");
    expect(joint?.text).toContain("The walls of door 2 of A and door 1 of B make an angle of 90 degrees");
  });

  it("tells two widths of one door that differ", () => {
    const narrow = withB(PAIR, box("B", { 3: [hole("f1", "0.1"), hole("f2", "1.9", "0.8")] }));
    expect(joints(narrow)[0]).toMatchObject({ state: "near", text: "Door 1 of A is door 2 of B. Its width is 0.9 m in A and 0.8 m in B. Measure it again." });
    expect(statusAll(narrow)).toMatchObject({ level: "closed", title: "The rooms fit together.", text: joints(narrow)[0]?.text });
    // A difference of 2 cm is in the limit.
    expect(joints(withB(PAIR, box("B", { 3: [hole("f1", "0.1"), hole("f2", "1.9", "0.88")] })))[0]?.state).toBe("fits");
  });

  it("tells a door that needs its numbers", () => {
    const empty = withB(PAIR, box("B", { 3: [hole("f1", "0.1"), hole("f2", "1.9", "")] }));
    expect(expand(empty).connections[0]?.fault).toBe("opening");
    expect(joints(empty)[0]).toMatchObject({ state: "typing", text: "Door 2 of B needs its numbers." });
  });

  it("tells a wall of a door that needs its length", () => {
    const short = withB(PAIR, box("B", { 3: [hole("f1", "0.1"), hole("f2", "1.9")] }, ["4", "3", "4", ""]));
    expect(joints(short)[0]).toMatchObject({ state: "typing", text: "Wall 4 of B needs its length. Door 2 is on this wall." });
  });

  it("tells a door that does not fit in its wall", () => {
    const far = withB(PAIR, box("B", { 3: [hole("f1", "0.1"), hole("f2", "2.5")] }));
    expect(joints(far)[0]).toMatchObject({ state: "typing", text: "B: Door 2 does not fit in wall 4." });
    expect(statusAll(far)).toEqual({ level: "typing", title: "The door between A and B is not ready.", text: "B: Door 2 does not fit in wall 4." });
  });
});

describe("levelStatus", () => {
  it("tells first a room that needs a number", () => {
    const store = withB(TWICE, box("B", { 3: [hole("f1", "0.1"), hole("f2", "1.9")] }, ["4", "3", "", "3"]));
    expect(statusAll(store)).toEqual({ level: "typing", title: "B needs a number.", text: "Type the length of wall 3." });
  });

  it("tells a room that does not close", () => {
    const store = withB(PAIR, box("B", { 3: [hole("f1", "0.1"), hole("f2", "1.9")] }, ["4", "3", "4", "2"]));
    const status = statusAll(store);
    expect(status.level).toBe("open");
    expect(status.title).toBe("B does not close.");
    expect(status.text).toBe(statusFor(store.rooms[1] ?? A).title);
  });

  it("tells a connection that is not ready", () => {
    const store = withB(PAIR, box("B", { 3: [hole("f1", "0.1"), hole("f2", "1.9", "")] }));
    // The status of a room does not tell a field of a feature as a missing number of the room.
    expect(statusAll(store)).toEqual({ level: "typing", title: "The door between A and B is not ready.", text: "Door 2 of B needs its numbers." });
  });

  it("tells the rooms with no door to the other rooms", () => {
    const one = { ...PAIR, rooms: [A, B, C] };
    expect(apartRooms(expand(one))).toEqual([2]);
    expect(statusAll(one)).toMatchObject({ level: "typing", title: "C has no door to the other rooms yet." });
    expect(statusAll(storeOf([A, B, C]))).toMatchObject({ level: "typing", title: "B and C have no door to the other rooms yet." });
    expect(statusAll(storeOf([A, B, C, box("D")]))).toMatchObject({ level: "typing", title: "3 rooms have no door to the other rooms yet." });
  });

  it("tells a group of rooms that no door joins to the first room", () => {
    // Room B and room C have a door between them, and no door goes to room A. The walk goes down the west wall of room C.
    const group = withConnection(storeOf([box("A"), box("B", { 1: [hole("f1", "1.1")] }), C]), end(1, "f1"), end(2, "f1"));
    expect(apartRooms(expand(group))).toEqual([1, 2]);
    expect(statusAll(group)).toEqual({
      level: "typing",
      title: "No door joins B and C to A yet.",
      text: "Open one of these rooms. At one of its doors, select where the door goes. Until then, the drawing shows these rooms apart.",
    });
    expect(apartNote(group.rooms, joints(group), 1)).toBe("No door joins this room and its group to A yet, so the drawing shows it apart.");
    // A room with no connection comes first.
    const more = { ...group, rooms: [...group.rooms, box("D")] };
    expect(statusAll(more)).toMatchObject({ level: "typing", title: "D has no door to the other rooms yet." });
    expect(apartNote(more.rooms, joints(more), 3)).toBe("No door joins this room to a different room yet, so the drawing shows it apart.");
  });

  it("tells that the rooms fit, with the fault of a feature of a room", () => {
    expect(statusAll(TWICE)).toEqual({ level: "closed", title: "The rooms fit together.", text: "Each door between two rooms is at the same place from its two sides." });
    // An outlet at 5 m is not on a wall of 4 m.
    const store = withB(PAIR, box("B", { 3: [hole("f1", "0.1"), hole("f2", "1.9")], 0: [hole("f3", "5", "", "outlet")] }));
    const status = statusAll(store);
    expect(status.level).toBe("closed");
    expect(status.text).toBe(`B: ${statusFor(store.rooms[1] ?? A).text}`);
  });

  it("tells the fault of an object of a room", () => {
    // A cabinet of 1 m at 3.5 m on a wall of 4 m goes past the end of the wall.
    const store = withB(PAIR, box("B", { 3: [hole("f1", "0.1"), hole("f2", "1.9")] }, undefined, { 0: [cabinet("o1", "3.5")] }));
    const own = statusFor(store.rooms[1] ?? A);
    expect(own.object).toBe("o1");
    const status = statusAll(store);
    expect(status.level).toBe("closed");
    expect(status.text).toBe(`B: ${own.text}`);
  });
});

describe("shownLevel", () => {
  it("gives the room record of a level with no fault", () => {
    const result = expand(TWICE);
    expect(shownLevel(result)).toBe(result.room);
  });

  it("has no wall and no feature of a room that does not close", () => {
    const store = withB(PAIR, box("B", { 3: [hole("f1", "0.1"), hole("f2", "1.9")] }, ["4", "3", "4", "2"]));
    const result = expand(store);
    expect(result.room.walls.some((wall) => wall.id.startsWith("b/"))).toBe(true);
    const shown = shownLevel(result);
    expect(shown.walls.map((wall) => wall.id)).toEqual(["a/wall-1", "a/wall-2", "a/wall-3", "a/wall-4"]);
    expect(shown.openings?.map((item) => item.id)).toEqual(["a/door-1", "a/door-2"]);
    expect(shown.floors?.map((floor) => floor.id)).toEqual(["a"]);
  });

  it("has no feature with an error", () => {
    // An outlet at 5 m is not on a wall of 4 m.
    const store = withB(PAIR, box("B", { 3: [hole("f1", "0.1"), hole("f2", "1.9")], 0: [hole("f3", "5", "", "outlet")] }));
    const result = expand(store);
    expect(result.room.outlets?.map((item) => item.id)).toEqual(["b/outlet-1"]);
    const shown = shownLevel(result);
    expect(shown.outlets).toEqual([]);
    expect(shown.walls).toHaveLength(8);
    expect(shown.openings).toHaveLength(4);
  });
});

describe("shownLevelObjects", () => {
  it("gives the objects of a level with no fault", () => {
    const result = expand(withB(TWICE, box("B", { 3: [hole("f1", "0.1"), hole("f2", "1.9")] }, undefined, { 0: [cabinet("o1", "1")] })));
    expect(result.objects.map((object) => object.id)).toEqual(["b/cabinet-1"]);
    expect(shownLevelObjects(result, shownLevel(result))).toEqual(result.objects);
  });

  it("has no object of a room that does not close", () => {
    const one = box("A", { 1: [hole("f1", "0.2"), hole("f2", "2")] }, undefined, { 0: [cabinet("o1", "1")] });
    const two = box("B", { 3: [hole("f1", "0.1"), hole("f2", "1.9")] }, ["4", "3", "4", "2"], { 0: [cabinet("o1", "1")] });
    const result = expand(withConnection(storeOf([one, two]), end(0, "f1"), end(1, "f2")));
    expect(result.objects.map((object) => object.id)).toEqual(["a/cabinet-1", "b/cabinet-1"]);
    expect(shownLevelObjects(result, shownLevel(result)).map((object) => object.id)).toEqual(["a/cabinet-1"]);
  });

  it("removes an outlet with an error from an object", () => {
    // An outlet at 5 m is not on a wall of 4 m.
    const room = box("B", { 3: [hole("f1", "0.1"), hole("f2", "1.9")], 0: [hole("f3", "5", "", "outlet")] }, undefined, { 0: [cabinet("o1", "1", "f3")] });
    const result = expand(withB(PAIR, room));
    expect(result.objects.map((object) => object.outlet)).toEqual(["b/outlet-1"]);
    const objects = shownLevelObjects(result, shownLevel(result));
    expect(objects.map((object) => object.id)).toEqual(["b/cabinet-1"]);
    expect(objects[0]?.outlet).toBeUndefined();
  });
});
