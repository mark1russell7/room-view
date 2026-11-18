import type { Circuit } from "@mark1russell7/electrical";
import { electrical } from "@mark1russell7/electrical/add-on";
import { ELECTRICAL_FORM } from "@mark1russell7/electrical/form";
import { checkForm, LEVEL_SCHEMA, SURVEY_SCHEMA, type FormSystem, type Level, type Survey, type SurveyObject } from "@mark1russell7/room-view";
import { readRecord } from "@mark1russell7/room-view/schema";
import { describe, expect, it } from "vitest";
import { CORE_ADD_ONS } from "./add-ons.ts";
import { emptyDraft, listedObjects, storeOf, withNewRooms, type DraftList, type LengthMode, type Store } from "./draft.ts";
import { circuitLists, circuitOf, isOutlet, outletOf, type DraftCircuit } from "./electrical.fixture.ts";
import { circuitLimit, ELECTRICAL, ELECTRICAL_ADD_ON, wattText } from "./electrical.ts";
import { addFeatureText, addText, featuresLabel, filePartsText, listSections, moreText, ownedSections, pointSteps, wallPartsText } from "./inputs.ts";
import { levelResult, readSurvey, roomResult, roomSurvey, storeLists, surveyParts } from "./layers.ts";
import { draftsOf, fileDrafts, levelOf, surveyDrafts, type LevelDrafts } from "./level.ts";

const DESK: SurveyObject = { id: "desk-1", kind: "desk", wall: "wall-1", offset: 1, width: 1.2, depth: 0.6, height: 0.75 };
const LAMP: SurveyObject = { id: "lamp-1", kind: "lamp", on: "desk-1", offset: 0.1, width: 0.2, depth: 0.2, height: 0.4 };

/** A room of 4 m by 3 m with a desk and a lamp, and with no electrical record. */
const SURVEY: Survey = {
  schema: SURVEY_SCHEMA,
  unit: "m",
  height: 2.4,
  wallThickness: 0.11,
  sides: [
    { id: "wall-1", length: 4, turn: "left" },
    { id: "wall-2", length: 3, turn: "left" },
    { id: "wall-3", length: 4, turn: "left" },
    { id: "wall-4", length: 3, turn: "left" },
  ],
  objects: [DESK, LAMP],
};

const LEVEL: Level = { schema: LEVEL_SCHEMA, unit: "m", rooms: [{ id: "a", survey: SURVEY }] };

const KITCHEN: Circuit = { id: "kitchen", name: "Kitchen", breaker: 20, voltage: 120, limit: 1920 };
const BARE: Circuit = { id: "bare", breaker: 15, voltage: 120, limit: 1440 };

/** This function gives a record with an electrical layer of these circuits. */
function wired<Given extends Survey | Level>(record: Given, circuits: readonly Circuit[]): Given {
  return { ...record, layers: { [ELECTRICAL.layer]: { schema: ELECTRICAL.layer, circuits } } };
}

/** This function reads a survey of an old file as the page does: `readRecord` of the core moves the old fields to a layer. */
function oldSurvey(value: unknown): Survey {
  const read = readRecord(value, CORE_ADD_ONS);
  if (!read.ok || read.kind !== "survey") throw new Error("The record is not a survey.");
  return read.record;
}

/** This function reads a level of an old file as the page does. */
function oldLevel(value: unknown): Level {
  const read = readRecord(value, CORE_ADD_ONS);
  if (!read.ok || read.kind !== "level") throw new Error("The record is not a level.");
  return read.record;
}

/** The room `SURVEY` with two outlets, two circuits and the outlet of each object, in the fields of a file of version 1. */
const OLD = {
  ...SURVEY,
  schema: "survey/1",
  outlets: [
    { id: "outlet-1", wall: "wall-1", offset: 1, height: 0.3, circuit: "kitchen" },
    { id: "outlet-2", wall: "wall-3", offset: 2, height: 1.1 },
  ],
  circuits: [KITCHEN, BARE],
  objects: [
    { ...DESK, outlet: "outlet-2" },
    { ...LAMP, outlet: "outlet-1" },
  ],
};

/** The circuits of the room `OLD` in a layer. The form does not keep a limit, and a circuit with no name gets an id from its position. */
const CIRCUITS = [
  { id: "kitchen", name: "Kitchen", breaker: 20, voltage: 120 },
  { id: "circuit-2", breaker: 15, voltage: 120 },
];

/** The electrical layer that the page writes for the room `OLD`. */
const LAYER = {
  schema: ELECTRICAL_FORM.schema,
  circuits: CIRCUITS,
  outlets: [
    { id: "outlet-1", anchor: { on: "wall", wall: "wall-1", face: "left", offset: 1, height: 0.3 }, circuit: "kitchen" },
    { id: "outlet-2", anchor: { on: "wall", wall: "wall-3", face: "left", offset: 2, height: 1.1 } },
  ],
  feeds: [
    { id: "feed-desk-1", object: "desk-1", outlet: "outlet-2" },
    { id: "feed-lamp-1", object: "lamp-1", outlet: "outlet-1" },
  ],
};

/** This function makes a store from the rooms of a file, as the page does when it opens the file. */
const storeFrom = (drafts: LevelDrafts): Store => withNewRooms(storeOf([emptyDraft("m")]), drafts.rooms, drafts.connections, true, drafts.lists);

/** This function gives the file of the first room of a store, as the page writes it for one room. */
const fileOf = (store: Store): Survey => roomSurvey(store.rooms[0] ?? emptyDraft("m"), storeLists(store), true);

describe("the names of the electrical layer", () => {
  const fields = (name: string): readonly string[] | undefined => ELECTRICAL_FORM.collections.find((collection) => collection.name === name)?.fields.map((field) => field.name);

  it("are the names of the form of the add-on", () => {
    expect(checkForm(ELECTRICAL_FORM)).toEqual([]);
    expect(ELECTRICAL.layer).toBe(ELECTRICAL_FORM.schema);
    expect(ELECTRICAL_FORM.collections.map((collection) => collection.name)).toEqual([ELECTRICAL.circuits, ELECTRICAL.outlets, ELECTRICAL.feeds]);
    expect(fields(ELECTRICAL.circuits)).toEqual([ELECTRICAL.name, ELECTRICAL.breaker, ELECTRICAL.voltage]);
    expect(fields(ELECTRICAL.outlets)).toEqual([ELECTRICAL.circuit]);
    expect(fields(ELECTRICAL.feeds)).toEqual([ELECTRICAL.object, ELECTRICAL.outlet, ELECTRICAL.watts]);
  });

  it("is the add-on of the page, with the add-on of the package", () => {
    expect(ELECTRICAL_ADD_ON.form).toBe(ELECTRICAL_FORM);
    expect(ELECTRICAL_ADD_ON.core).toBe(electrical);
    expect(electrical.schema).toBe(ELECTRICAL.layer);
  });

  it("reads no layer from an old record with no electrical field", () => {
    expect(oldSurvey({ ...SURVEY, schema: "survey/1" }).layers).toBeUndefined();
    expect(oldSurvey({ ...SURVEY, schema: "survey/1", outlets: [], circuits: [] }).layers).toBeUndefined();
    expect(oldLevel({ ...LEVEL, schema: "level/1" }).layers).toBeUndefined();
    expect(oldLevel({ ...LEVEL, schema: "level/1", circuits: [] }).layers).toBeUndefined();
  });
});

describe("the texts of the electrical add-on in the page", () => {
  const FORMS = [ELECTRICAL_FORM];
  const ADD_ONS = [ELECTRICAL_ADD_ON];

  it("has texts for the list of the circuits only", () => {
    const sections = listSections(ADD_ONS);
    expect(Object.keys(ELECTRICAL_ADD_ON.lists ?? {})).toEqual([ELECTRICAL.circuits]);
    expect(sections.map((section) => section.collection.name)).toEqual([ELECTRICAL.circuits]);
    expect(sections.map(addText)).toEqual(["Add a breaker"]);
    expect(sections[0]?.texts.aid).toBe("Each breaker of the electrical panel gives power to the outlets of one circuit. Add each breaker here. Then, at each outlet, select its circuit.");
    expect(ownedSections(ADD_ONS).map((section) => section.collection.name)).toEqual([ELECTRICAL.feeds]);
  });

  it("has two steps of help, and the second names the title of the list and its button", () => {
    const [section] = listSections(ADD_ONS);
    expect(section).toBeDefined();
    if (section === undefined) return;
    expect(ELECTRICAL_ADD_ON.steps).toEqual([
      "For the circuits, switch off one breaker of the electrical panel. Find each outlet with no power.",
      `Under ${section.collection.title}, select ${addText(section)}. Type the amperes on the handle of the breaker. Then, at each outlet with no power, select the circuit.`,
    ]);
  });

  it("tells the limit of a circuit for a continuous load", () => {
    const note = ELECTRICAL_ADD_ON.note;
    expect(note?.(ELECTRICAL.circuits, { breaker: 15, voltage: 120 })).toBe(`The limit for a continuous load is ${wattText(1440)} W.`);
    expect(note?.(ELECTRICAL.circuits, { name: "Kitchen", breaker: 20, voltage: 120 })).toBe(`The limit for a continuous load is ${wattText(1920)} W.`);
    expect(note?.(ELECTRICAL.circuits, { breaker: 3, voltage: 0.1 })).toBe(`The limit for a continuous load is ${wattText(0.24)} W.`);
  });

  it("tells no limit for a circuit with no limit, and for a record that is not a circuit", () => {
    const note = ELECTRICAL_ADD_ON.note;
    expect(note).toBeDefined();
    expect(note?.(ELECTRICAL.circuits, { breaker: 15 })).toBeUndefined();
    expect(note?.(ELECTRICAL.circuits, { voltage: 120 })).toBeUndefined();
    expect(note?.(ELECTRICAL.circuits, { breaker: 0, voltage: 120 })).toBeUndefined();
    expect(note?.(ELECTRICAL.circuits, { breaker: "15", voltage: 120 })).toBeUndefined();
    expect(note?.(ELECTRICAL.outlets, { breaker: 15, voltage: 120 })).toBeUndefined();
    expect(note?.(ELECTRICAL.feeds, { breaker: 15, voltage: 120 })).toBeUndefined();
  });

  it("gives the page its sentences for the electrical layer", () => {
    expect(wallPartsText(FORMS)).toBe("the doors, the windows, the outlets and the furniture");
    expect(addFeatureText(FORMS)).toBe("Add doors, windows or outlets");
    expect(featuresLabel(FORMS, "2")).toBe("Doors, windows and outlets of wall 2");
    expect(moreText(ADD_ONS)).toBe("Name, power and more distances");
    expect(filePartsText(ADD_ONS)).toBe("The page shows the walls, the doors, the windows, the outlets, the circuits and the furniture of the file. It does not keep the other data of the file yet.");
    expect(pointSteps(FORMS)).toEqual(["For each outlet of this wall, measure from a corner of the wall to its center. Then measure its height above the floor."]);
  });
});

describe("wattText", () => {
  it("gives a number of 100 or more with no decimal place", () => {
    expect(wattText(1440, "en-US")).toBe("1,440");
    expect(wattText(100, "en-US")).toBe("100");
    expect(wattText(1440.6, "en-US")).toBe("1,441");
    expect(wattText(100.4, "en-US")).toBe("100");
  });

  it("gives a number below 100 with one decimal place at most", () => {
    expect(wattText(57.6, "en-US")).toBe("57.6");
    expect(wattText(99.94, "en-US")).toBe("99.9");
    expect(wattText(0.24, "en-US")).toBe("0.2");
    expect(wattText(12, "en-US")).toBe("12");
  });

  it("uses the number format of a locale", () => {
    expect(wattText(2944, "de-DE")).toBe("2.944");
    expect(wattText(57.6, "de-DE")).toBe("57,6");
    expect(wattText(1440)).toBe(new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(1440));
  });
});

describe("circuitLimit", () => {
  it("gives 80% of the voltage times the rating of the breaker, in watts", () => {
    expect(circuitLimit(15, 120)).toBe(1440);
    expect(circuitLimit(20, 120)).toBe(1920);
    expect(circuitLimit(16, 230)).toBe(2944);
    // 10 × 0.1 × 0.8 is 0.8000000000000002 in floating point: the limit is a number of milliwatts.
    expect(circuitLimit(10, 0.1)).toBe(0.8);
    // 3 × 0.1 × 0.8 is 0.24000000000000005 in each sequence of the factors.
    expect(circuitLimit(3, 0.1)).toBe(0.24);
  });

  it("gives `undefined` for a value that is not a finite number", () => {
    expect(circuitLimit(Number.NaN, 120)).toBeUndefined();
    expect(circuitLimit(15, Number.POSITIVE_INFINITY)).toBeUndefined();
    // The product of two finite numbers can be too large for a number.
    expect(circuitLimit(Number.MAX_VALUE, Number.MAX_VALUE)).toBeUndefined();
  });
});

describe("the electrical layer of a file", () => {
  it("reads the electrical fields of an old file into the store", () => {
    const old = surveyDrafts(oldSurvey(OLD));
    expect(old.more).toBe(false);
    const store = storeFrom(old);
    expect(store.lists).toEqual(circuitLists([circuit("r1", "Kitchen", "20", "120"), circuit("r2", "", "15", "120")]));
    const room = store.rooms[0];
    const features = room?.sides.flatMap((side) => side.features) ?? [];
    expect(features.filter(isOutlet).map(circuitOf)).toEqual(["r1", undefined]);
    // The lamp is on the desk, so the list of the objects has the objects of each level.
    const objects = room === undefined ? [] : listedObjects(room).map((item) => item.object);
    expect(objects.map((item) => item.kind)).toEqual(["desk", "lamp"]);
    expect(objects.map(outletOf).filter((key) => key !== "")).toHaveLength(2);
  });

  it("writes the electrical records of a room as one layer, with no electrical field of an old file", () => {
    const survey = fileOf(storeFrom(surveyDrafts(oldSurvey(OLD))));
    expect(survey.layers).toEqual({ [ELECTRICAL.layer]: LAYER });
    expect(survey).not.toHaveProperty("outlets");
    expect(survey).not.toHaveProperty("circuits");
    expect(survey.objects?.map((object) => "outlet" in object)).toEqual([false, false]);
    // The add-on of the package reads the layer, and the expansion finds no fault in it.
    expect(electrical.parse(survey.layers?.[ELECTRICAL.layer]).ok).toBe(true);
    const result = roomResult(survey);
    expect(result.layerFindings).toEqual([]);
    expect(result.layers?.[ELECTRICAL.layer]).toEqual(LAYER);
  });

  it("reads an old file and a new file of a room as the same store, and loses no number", () => {
    const store = storeFrom(surveyDrafts(oldSurvey(OLD)));
    const survey = fileOf(store);
    const again = surveyDrafts(survey);
    expect(again.more).toBe(false);
    expect(storeFrom(again)).toEqual(store);
    expect(fileOf(storeFrom(again))).toEqual(survey);
  });

  it("reads an old file and a new file of a level as the same store, and loses no number", () => {
    const level = oldLevel({
      ...LEVEL,
      schema: "level/1",
      rooms: [
        { id: "a", survey: { ...OLD, circuits: [BARE] } },
        { id: "b", survey: { ...SURVEY, schema: "survey/1" } },
      ],
      circuits: [KITCHEN],
    });
    const old = draftsOf(level);
    expect(old.more).toBe(false);
    const store = storeFrom(old);
    const next = levelOf(store);
    expect(next).not.toHaveProperty("circuits");
    expect(next.layers).toEqual({ [ELECTRICAL.layer]: { schema: ELECTRICAL.layer, circuits: CIRCUITS } });
    // A room lists no circuit: its outlets name the circuits of the level.
    const { circuits, ...room } = LAYER;
    expect(circuits).toHaveLength(2);
    expect(next.rooms.map((item) => item.survey.layers)).toEqual([{ [ELECTRICAL.layer]: room }, undefined]);
    const again = draftsOf(next);
    expect(again.more).toBe(false);
    expect(storeFrom(again)).toEqual(store);
    expect(levelOf(storeFrom(again))).toEqual(next);
    expect(levelResult(next).layerFindings).toEqual([]);
  });

  it("tells the electrical fields of an old file next to a layer", () => {
    const survey = fileOf(storeFrom(surveyDrafts(oldSurvey(OLD))));
    const more = (value: unknown): boolean | undefined => fileDrafts(readRecord(value, CORE_ADD_ONS))?.drafts.more;
    expect(more({ ...survey, schema: "survey/1" })).toBe(false);
    expect(more({ ...survey, schema: "survey/1", outlets: OLD.outlets })).toBe(true);
    expect(more({ ...survey, schema: "survey/1", objects: OLD.objects })).toBe(true);
  });
});

describe("the limit of a circuit of a layer", () => {
  const more = (circuit: Circuit, system: FormSystem = "imperial"): boolean => surveyParts([wired(SURVEY, [circuit])], undefined, system).more;

  it("tells a limit that is not the limit of the breaker and the voltage", () => {
    expect(more(BARE)).toBe(false);
    expect(more({ ...BARE, limit: 1500 })).toBe(true);
    expect(more({ ...BARE, limit: Number.NaN })).toBe(true);
    // A part of a millionth of the limit is noise of the floating point.
    expect(more({ ...BARE, limit: 1440.001 })).toBe(false);
    expect(more({ ...BARE, limit: 1440.01 })).toBe(true);
    expect(more({ ...BARE, limit: 1439.99 })).toBe(true);
    // A limit below 1 W has the noise of 1 W.
    expect(more({ id: "a", breaker: 10, voltage: 0.1, limit: 0.8000009 })).toBe(false);
    expect(more({ id: "a", breaker: 10, voltage: 0.1, limit: 0.80001 })).toBe(true);
    // A record with no breaker or no voltage gets the usual numbers of the units of the file.
    expect(more({ id: "a", limit: 1440 })).toBe(false);
    expect(more({ id: "a", limit: 1440 }, "metric")).toBe(true);
    expect(more({ id: "a", limit: 2944 }, "metric")).toBe(false);
    expect(more({ id: "a", breaker: 20, limit: 1920 })).toBe(false);
    expect(more({ id: "a", voltage: 240, limit: 2880 })).toBe(false);
    // A number that the form does not accept gives no limit.
    expect(more({ id: "a", breaker: 0, voltage: 120, limit: 0 })).toBe(true);
    expect(more({ id: "a", breaker: 15, voltage: -120, limit: 1440 })).toBe(true);
  });

  it("tells a wrong limit of a circuit of the level", () => {
    expect(surveyParts([SURVEY], wired(LEVEL, [KITCHEN]), "imperial").more).toBe(false);
    expect(surveyParts([SURVEY], wired(LEVEL, [{ ...KITCHEN, limit: 1 }]), "imperial").more).toBe(true);
    expect(surveyParts([SURVEY, wired(SURVEY, [{ ...BARE, limit: 1 }])], LEVEL, "imperial").more).toBe(true);
  });
});

/** This function gives a circuit of a store with the texts of a list. */
function circuit(key: string, name = "", breaker = "", voltage = ""): DraftCircuit {
  return { key, name, breaker, voltage };
}

describe("the circuits of a store", () => {
  /** This function gives a store with one room and the circuits of a list. */
  const store = (mode: LengthMode, circuits: readonly DraftCircuit[]): Store => ({ ...storeOf([emptyDraft(mode)]), lists: circuitLists(circuits) });
  /** This function gives the circuits of the level record of a store. */
  const circuitsOf = (given: Store): unknown => levelOf(given).layers?.[ELECTRICAL.layer];

  it("gives each circuit an id from its name, and a circuit with a bad number has no record", () => {
    const level = levelOf(store("ft-in", [circuit("c1", "Kitchen", "20"), circuit("c2"), circuit("c3", "Kitchen", "0"), circuit("c4", "Kitchen")]));
    // The bad circuit c3 uses the id kitchen-2, so the id of c4 does not change when c3 is correct again.
    expect(level.layers).toEqual({
      [ELECTRICAL.layer]: {
        schema: ELECTRICAL.layer,
        circuits: [
          { id: "kitchen", name: "Kitchen", breaker: 20, voltage: 120 },
          { id: "circuit-2", breaker: 15, voltage: 120 },
          { id: "kitchen-3", name: "Kitchen", breaker: 15, voltage: 120 },
        ],
      },
    });
    expect(level).not.toHaveProperty("circuits");
  });

  it("gives the usual breaker and voltage of the units of the first room", () => {
    expect(circuitsOf(store("m", [circuit("c1")]))).toEqual({ schema: ELECTRICAL.layer, circuits: [{ id: "circuit-1", breaker: 16, voltage: 230 }] });
    expect(circuitsOf(store("cm", [circuit("c1", "", " 20 ", "240")]))).toEqual({ schema: ELECTRICAL.layer, circuits: [{ id: "circuit-1", breaker: 20, voltage: 240 }] });
  });

  it("gives no layer for no circuits", () => {
    expect(levelOf(store("m", []))).not.toHaveProperty("layers");
    expect(levelOf(store("m", [circuit("c1", "", "x")]))).not.toHaveProperty("layers");
  });
});

describe("the circuits of a file", () => {
  /** This function gives a circuit record of 15 A at 120 V. */
  const record = (id: string, more: Partial<Circuit> = {}): Circuit => ({ id, breaker: 15, voltage: 120, limit: 1440, ...more });
  /** This function reads the circuits of the layers of the survey records for a store. */
  const read = (...surveys: readonly (readonly Circuit[])[]): { readonly lists: readonly DraftList[]; readonly more: boolean } => {
    const parts = surveyParts(
      surveys.map((circuits) => wired(SURVEY, circuits)),
      undefined,
      "imperial",
    );
    return { lists: parts.lists, more: parts.more };
  };

  it("reads a circuit with no numbers with the usual numbers of the units of its survey", () => {
    const feet: Survey = { schema: SURVEY_SCHEMA, unit: "ft", height: 8, wallThickness: 0.5, sides: SURVEY.sides };
    expect(readSurvey(wired(feet, [{ id: "a", limit: 1440 }])).more).toBe(false);
    expect(readSurvey(wired({ ...feet, unit: "m" }, [{ id: "a", limit: 1440 }])).more).toBe(true);
    expect(readSurvey(wired({ ...feet, unit: "m" }, [{ id: "a", limit: 2944 }])).more).toBe(false);
  });

  it("gives the circuits of the records, with a text for each number", () => {
    expect(read([record("kitchen", { name: "Kitchen", breaker: 20, limit: 1920 }), record("circuit-2"), record("hall", { name: "Hall" })])).toEqual({
      lists: circuitLists([circuit("r1", "Kitchen", "20", "120"), circuit("r2", "", "15", "120"), circuit("r3", "Hall", "15", "120")]),
      more: false,
    });
    expect(read([])).toEqual({ lists: [], more: false });
  });

  it("keeps the first circuit of an id in one layer, and tells a second one", () => {
    expect(read([record("a"), record("a")])).toEqual({ lists: circuitLists([circuit("r1", "", "15", "120")]), more: true });
    expect(read([record("a", { name: "One" }), record("a", { name: "Two" })])).toEqual({ lists: circuitLists([circuit("r1", "One", "15", "120")]), more: true });
  });

  it("keeps the first circuit of an id in two surveys, and tells a different second one", () => {
    expect(read([record("a", { name: "One" })], [record("a", { name: "One" })])).toEqual({ lists: circuitLists([circuit("r1", "One", "15", "120")]), more: false });
    expect(read([record("a", { name: "One" })], [record("a", { name: "Two" })])).toEqual({ lists: circuitLists([circuit("r1", "One", "15", "120")]), more: true });
  });

  it("gives no text for a number that the record does not have", () => {
    expect(read([{ id: "a", limit: 1440 }])).toEqual({ lists: circuitLists([circuit("r1")]), more: false });
    expect(surveyParts([wired(SURVEY, [{ id: "a", limit: 1440 }])], undefined, "metric").more).toBe(true);
    const metric = surveyParts([wired(SURVEY, [{ id: "a", limit: 2944 }])], undefined, "metric");
    expect({ lists: metric.lists, more: metric.more }).toEqual({ lists: circuitLists([circuit("r1")]), more: false });
  });

  it("gives no text for a number that is not above 0, and tells it", () => {
    expect(read([record("a", { breaker: 0, voltage: -120 })])).toEqual({ lists: circuitLists([circuit("r1")]), more: true });
  });

  it("reads the circuits of a level and of a survey", () => {
    const parts = surveyParts([wired(SURVEY, [record("b", { name: "B" })])], wired(LEVEL, [record("a", { name: "A" })]), "imperial");
    expect(parts.lists).toEqual(circuitLists([circuit("r1", "A", "15", "120"), circuit("r2", "B", "15", "120")]));
    expect(parts.more).toBe(false);
  });
});
