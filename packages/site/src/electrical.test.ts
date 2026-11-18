import { ELECTRICAL_FORM } from "@mark1russell7/electrical/form";
import { checkForm, LEVEL_SCHEMA, SURVEY_SCHEMA, type Circuit, type FormRecord, type FormRecords, type FormSystem, type Level, type Survey, type SurveyObject } from "@mark1russell7/room-view";
import { describe, expect, it } from "vitest";
import { emptyDraft, storeOf, type DraftList, type LengthMode, type Store } from "./draft.ts";
import { circuitLists, type DraftCircuit } from "./electrical.fixture.ts";
import { circuitLimit, ELECTRICAL, ELECTRICAL_ADD_ON, electricalLevel, electricalRecords, electricalSurvey, wattText } from "./electrical.ts";
import { addFeatureText, addText, featuresLabel, filePartsText, hiddenOf, listSections, moreText, ownedSections, pointSteps, wallPartsText } from "./inputs.ts";
import { readSurvey, surveyParts } from "./layers.ts";
import { levelOf } from "./level.ts";

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

/** This function gives the record of an outlet on wall 1, 0.3 m above the floor. */
const at = (id: string, offset: number, values: FormRecord["values"] = {}): FormRecord => ({ id, anchor: { on: "wall", wall: "wall-1", face: "left", offset, height: 0.3 }, values });

const KITCHEN: Circuit = { id: "kitchen", name: "Kitchen", breaker: 20, voltage: 120, limit: 1920 };
const BARE: Circuit = { id: "bare", breaker: 15, voltage: 120, limit: 1440 };

/** The records of the electrical form: two circuits with a limit, three circuits with none, four outlets and four feeds. */
const RECORDS: FormRecords = {
  circuits: [
    { id: "kitchen", values: { name: "Kitchen", breaker: 20, voltage: 120 } },
    { id: "bare", values: { breaker: 15, voltage: 120 } },
    { id: "open", values: { name: "No numbers" } },
    { id: "zero", values: { breaker: 0, voltage: 120 } },
    { id: "text", values: { name: 5, breaker: "20", voltage: 120 } },
  ],
  outlets: [at("outlet-1", 1, { circuit: "kitchen" }), at("outlet-2", 2, { circuit: "open" }), at("outlet-3", 3, { circuit: "hall" }), at("outlet-4", 3.5)],
  feeds: [
    { id: "feed-1", values: { object: "desk-1", outlet: "outlet-2" } },
    { id: "feed-2", values: { object: "desk-1", outlet: "outlet-1" } },
    { id: "feed-3", values: { object: "lamp-1", outlet: "outlet-9" } },
    { id: "feed-4", values: { outlet: "outlet-1" } },
  ],
};

describe("the names of the electrical layer", () => {
  const fields = (name: string): readonly string[] | undefined => ELECTRICAL_FORM.collections.find((collection) => collection.name === name)?.fields.map((field) => field.name);

  it("are the names of the form of the add-on", () => {
    expect(checkForm(ELECTRICAL_FORM)).toEqual([]);
    expect(ELECTRICAL.layer).toBe(ELECTRICAL_FORM.schema);
    expect(ELECTRICAL_FORM.collections.map((collection) => collection.name)).toEqual([ELECTRICAL.circuits, ELECTRICAL.outlets, ELECTRICAL.feeds]);
    expect(fields(ELECTRICAL.circuits)).toEqual([ELECTRICAL.name, ELECTRICAL.breaker, ELECTRICAL.voltage]);
    expect(fields(ELECTRICAL.outlets)).toEqual([ELECTRICAL.circuit]);
    expect(fields(ELECTRICAL.feeds)?.slice(0, 2)).toEqual([ELECTRICAL.object, ELECTRICAL.outlet]);
  });

  it("is the add-on of the page, with its bridge", () => {
    expect(ELECTRICAL_ADD_ON.form).toBe(ELECTRICAL_FORM);
    expect(ELECTRICAL_ADD_ON.bridge).toEqual({ read: electricalRecords, survey: electricalSurvey, level: electricalLevel });
  });

  it("hides only the power of an object, and the power is a field of the form", () => {
    expect(ELECTRICAL_ADD_ON.hidden).toEqual({ feeds: ["watts"] });
    expect(fields(ELECTRICAL.feeds)).toEqual([ELECTRICAL.object, ELECTRICAL.outlet, ELECTRICAL.watts]);
    expect(hiddenOf(ELECTRICAL_ADD_ON, ELECTRICAL.feeds)).toEqual([ELECTRICAL.watts]);
    expect(hiddenOf(ELECTRICAL_ADD_ON, ELECTRICAL.outlets)).toEqual([]);
    expect(hiddenOf(ELECTRICAL_ADD_ON, ELECTRICAL.circuits)).toEqual([]);
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

describe("electricalSurvey", () => {
  it("adds the outlets, the circuits with a limit and the outlet of each object", () => {
    const survey = electricalSurvey(SURVEY, RECORDS, true);
    const { objects, ...rest } = SURVEY;
    expect(objects).toEqual([DESK, LAMP]);
    expect(survey).toEqual({
      ...rest,
      outlets: [
        { id: "outlet-1", wall: "wall-1", offset: 1, height: 0.3, circuit: "kitchen" },
        { id: "outlet-2", wall: "wall-1", offset: 2, height: 0.3 },
        { id: "outlet-3", wall: "wall-1", offset: 3, height: 0.3 },
        { id: "outlet-4", wall: "wall-1", offset: 3.5, height: 0.3 },
      ],
      circuits: [KITCHEN, BARE],
      // The first feed of an object with an outlet of the records is the feed of the object.
      objects: [{ ...DESK, outlet: "outlet-2" }, LAMP],
    });
    // An outlet names only a circuit with a limit. A circuit with no name has no name.
    expect(survey.outlets?.map((outlet) => "circuit" in outlet)).toEqual([true, false, false, false]);
    expect(survey.circuits?.map((circuit) => "name" in circuit)).toEqual([true, false]);
    expect(survey.objects?.map((object) => "outlet" in object)).toEqual([true, false]);
    // The objects come last.
    expect(Object.keys(survey)).toEqual(["schema", "unit", "height", "wallThickness", "sides", "outlets", "circuits", "objects"]);
  });

  it("lists no circuit for a room of a level, and each outlet names its circuit", () => {
    const survey = electricalSurvey(SURVEY, RECORDS, false);
    expect(survey).not.toHaveProperty("circuits");
    expect(survey.outlets?.map((outlet) => outlet.circuit)).toEqual(["kitchen", undefined, undefined, undefined]);
    expect(Object.keys(survey)).toEqual(["schema", "unit", "height", "wallThickness", "sides", "outlets", "objects"]);
  });

  it("adds no field for no record", () => {
    for (const records of [{}, { circuits: [], outlets: [], feeds: [] }, { circuits: (RECORDS["circuits"] ?? []).slice(2) }]) {
      const survey = electricalSurvey(SURVEY, records, true);
      expect(survey).toEqual(SURVEY);
      expect(Object.keys(survey)).toEqual(["schema", "unit", "height", "wallThickness", "sides", "objects"]);
    }
    const { objects, ...bare } = SURVEY;
    expect(objects).toHaveLength(2);
    expect(Object.keys(electricalSurvey(bare, { feeds: RECORDS["feeds"] ?? [] }, true))).toEqual(["schema", "unit", "height", "wallThickness", "sides"]);
  });

  it("has no outlet that is not on a wall, and no object names it", () => {
    const records: FormRecords = {
      outlets: [
        { id: "outlet-1", values: {} },
        { id: "outlet-2", anchor: { on: "floor", at: [1, 1] }, values: {} },
      ],
      feeds: [{ id: "feed-1", values: { object: "desk-1", outlet: "outlet-1" } }],
    };
    expect(electricalSurvey(SURVEY, records, true)).toEqual(SURVEY);
  });

  it("reads only the fields of the records", () => {
    const inherited = Object.create({ outlets: [at("outlet-1", 1)], circuits: RECORDS["circuits"] }) as FormRecords;
    expect(electricalSurvey(SURVEY, inherited, true)).toEqual(SURVEY);
    const values = Object.create({ circuit: "kitchen", name: "Other", breaker: 20, voltage: 120 }) as FormRecord["values"];
    const survey = electricalSurvey(SURVEY, { circuits: [{ id: "a", values }, ...(RECORDS["circuits"] ?? [])], outlets: [{ ...at("outlet-1", 1), values }] }, true);
    expect(survey.circuits).toEqual([KITCHEN, BARE]);
    expect(survey.outlets).toEqual([{ id: "outlet-1", wall: "wall-1", offset: 1, height: 0.3 }]);
  });
});

describe("electricalLevel", () => {
  it("adds the circuits with a limit", () => {
    expect(electricalLevel(LEVEL, RECORDS)).toEqual({ ...LEVEL, circuits: [KITCHEN, BARE] });
  });

  it("gives the same level for no circuit", () => {
    expect(electricalLevel(LEVEL, {})).toBe(LEVEL);
    expect(electricalLevel(LEVEL, { circuits: (RECORDS["circuits"] ?? []).slice(2), outlets: RECORDS["outlets"] ?? [] })).toBe(LEVEL);
  });
});

describe("electricalRecords", () => {
  const wired: Survey = {
    ...SURVEY,
    outlets: [
      { id: "outlet-1", wall: "wall-1", offset: 1, height: 0.3, circuit: "kitchen" },
      { id: "outlet-2", wall: "wall-3", offset: 2, height: 1.1 },
    ],
    circuits: [BARE],
    objects: [{ ...DESK, outlet: "outlet-1" }, LAMP, { ...DESK, outlet: "outlet-2" }],
  };

  it("gives the circuits of the level and of each survey, and the outlets and the feeds of each survey", () => {
    const level: Level = { ...LEVEL, rooms: [{ id: "a", survey: wired }, { id: "b", survey: SURVEY }], circuits: [KITCHEN] };
    expect(electricalRecords([wired, SURVEY], level, "imperial")).toEqual({
      lists: {
        circuits: [
          { id: "kitchen", values: { name: "Kitchen", breaker: 20, voltage: 120 } },
          { id: "bare", values: { breaker: 15, voltage: 120 } },
        ],
      },
      rooms: [
        {
          outlets: [
            { id: "outlet-1", anchor: { on: "wall", wall: "wall-1", face: "left", offset: 1, height: 0.3 }, values: { circuit: "kitchen" } },
            { id: "outlet-2", anchor: { on: "wall", wall: "wall-3", face: "left", offset: 2, height: 1.1 }, values: {} },
          ],
          // The first object of an id is the object of that id.
          feeds: [{ id: "feed-desk-1", values: { object: "desk-1", outlet: "outlet-1" } }],
        },
        { outlets: [], feeds: [] },
      ],
      more: false,
    });
  });

  it("gives no record for no survey, and no feed for a second object of an id", () => {
    expect(electricalRecords([], undefined, "metric")).toEqual({ lists: { circuits: [] }, rooms: [], more: false });
    expect(electricalRecords([{ ...SURVEY, objects: [DESK, { ...DESK, outlet: "outlet-2" }] }], undefined, "metric").rooms).toEqual([{ outlets: [], feeds: [] }]);
  });

  it("tells a limit that is not the limit of the breaker and the voltage", () => {
    const more = (circuit: Circuit, system: FormSystem = "imperial"): boolean => electricalRecords([{ ...SURVEY, circuits: [circuit] }], undefined, system).more;
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
    expect(electricalRecords([SURVEY], { ...LEVEL, circuits: [KITCHEN] }, "imperial").more).toBe(false);
    expect(electricalRecords([SURVEY], { ...LEVEL, circuits: [{ ...KITCHEN, limit: 1 }] }, "imperial").more).toBe(true);
    expect(electricalRecords([SURVEY, { ...SURVEY, circuits: [{ ...BARE, limit: 1 }] }], LEVEL, "imperial").more).toBe(true);
  });

  it("keeps each number of a circuit record, also a number that the form does not accept", () => {
    const read = electricalRecords([{ ...SURVEY, circuits: [{ id: "a", breaker: 0, voltage: -120, limit: 5 }, { id: "b", limit: 1440 }] }], undefined, "imperial");
    expect(read.lists).toEqual({ circuits: [{ id: "a", values: { breaker: 0, voltage: -120 } }, { id: "b", values: {} }] });
  });

  it("reads the survey of `electricalSurvey` again", () => {
    const read = electricalRecords([electricalSurvey(SURVEY, RECORDS, true)], undefined, "imperial");
    expect(read.lists).toEqual({ circuits: (RECORDS["circuits"] ?? []).slice(0, 2) });
    expect(read.rooms).toEqual([
      {
        outlets: [at("outlet-1", 1, { circuit: "kitchen" }), at("outlet-2", 2), at("outlet-3", 3), at("outlet-4", 3.5)],
        feeds: [{ id: "feed-desk-1", values: { object: "desk-1", outlet: "outlet-2" } }],
      },
    ]);
    expect(read.more).toBe(false);
    const again = electricalSurvey(SURVEY, { ...read.lists, ...read.rooms[0] }, true);
    expect(again).toEqual(electricalSurvey(SURVEY, RECORDS, true));
  });
});

/** This function gives a circuit of a store with the texts of a list. */
function circuit(key: string, name = "", breaker = "", voltage = ""): DraftCircuit {
  return { key, name, breaker, voltage };
}

describe("the circuits of a store", () => {
  /** This function gives a store with one room and the circuits of a list. */
  const store = (mode: LengthMode, circuits: readonly DraftCircuit[]): Store => ({ ...storeOf([emptyDraft(mode)]), lists: circuitLists(circuits) });

  it("gives each circuit an id from its name, and a circuit with a bad number has no record", () => {
    const level = levelOf(store("ft-in", [circuit("c1", "Kitchen", "20"), circuit("c2"), circuit("c3", "Kitchen", "0"), circuit("c4", "Kitchen")]));
    // The bad circuit c3 uses the id kitchen-2, so the id of c4 does not change when c3 is correct again.
    expect(level.circuits).toEqual([
      { id: "kitchen", name: "Kitchen", breaker: 20, voltage: 120, limit: 1920 },
      { id: "circuit-2", breaker: 15, voltage: 120, limit: 1440 },
      { id: "kitchen-3", name: "Kitchen", breaker: 15, voltage: 120, limit: 1440 },
    ]);
    expect(level.circuits?.[1]).not.toHaveProperty("name");
  });

  it("gives the usual breaker and voltage of the units of the first room", () => {
    expect(levelOf(store("m", [circuit("c1")])).circuits).toEqual([{ id: "circuit-1", breaker: 16, voltage: 230, limit: 2944 }]);
    expect(levelOf(store("cm", [circuit("c1", "", " 20 ", "240")])).circuits).toEqual([{ id: "circuit-1", breaker: 20, voltage: 240, limit: 3840 }]);
  });

  it("gives no records for no circuits", () => {
    expect(levelOf(store("m", []))).not.toHaveProperty("circuits");
    expect(levelOf(store("m", [circuit("c1", "", "x")]))).not.toHaveProperty("circuits");
  });
});

describe("the circuits of a file", () => {
  /** This function gives a circuit record of 15 A at 120 V. */
  const record = (id: string, more: Partial<Circuit> = {}): Circuit => ({ id, breaker: 15, voltage: 120, limit: 1440, ...more });
  /** This function reads the circuits of a survey record for a store. */
  const read = (circuits: readonly Circuit[], system: FormSystem = "imperial"): { readonly lists: readonly DraftList[]; readonly more: boolean } => {
    const parts = surveyParts([{ ...SURVEY, circuits }], undefined, system);
    return { lists: parts.lists, more: parts.more };
  };

  it("reads a circuit with no numbers with the usual numbers of the units of its survey", () => {
    const feet: Survey = { schema: SURVEY_SCHEMA, unit: "ft", height: 8, wallThickness: 0.5, sides: SURVEY.sides, circuits: [{ id: "a", limit: 1440 }] };
    expect(readSurvey(feet).more).toBe(false);
    expect(readSurvey({ ...feet, unit: "m" }).more).toBe(true);
    expect(readSurvey({ ...feet, unit: "m", circuits: [{ id: "a", limit: 2944 }] }).more).toBe(false);
  });

  it("gives the circuits of the records, with a text for each number", () => {
    expect(read([record("kitchen", { name: "Kitchen", breaker: 20, limit: 1920 }), record("circuit-2"), record("hall", { name: "Hall" })])).toEqual({
      lists: circuitLists([circuit("r1", "Kitchen", "20", "120"), circuit("r2", "", "15", "120"), circuit("r3", "Hall", "15", "120")]),
      more: false,
    });
    expect(read([])).toEqual({ lists: [], more: false });
  });

  it("keeps the first record of an id", () => {
    expect(read([record("a"), record("a")])).toEqual({ lists: circuitLists([circuit("r1", "", "15", "120")]), more: false });
    expect(read([record("a", { name: "One" }), record("a", { name: "Two" })])).toEqual({ lists: circuitLists([circuit("r1", "One", "15", "120")]), more: true });
  });

  it("gives no text for a number that the record does not have", () => {
    expect(read([{ id: "a", limit: 1440 }])).toEqual({ lists: circuitLists([circuit("r1")]), more: false });
    expect(read([{ id: "a", limit: 1440 }], "metric").more).toBe(true);
    expect(read([{ id: "a", limit: 2944 }], "metric")).toEqual({ lists: circuitLists([circuit("r1")]), more: false });
  });

  it("gives no text for a number that is not above 0, and tells it", () => {
    expect(read([record("a", { breaker: 0, voltage: -120 })])).toEqual({ lists: circuitLists([circuit("r1")]), more: true });
  });

  it("reads the circuits of a level and of a survey", () => {
    const parts = surveyParts([{ ...SURVEY, circuits: [record("b", { name: "B" })] }], { ...LEVEL, circuits: [record("a", { name: "A" })] }, "imperial");
    expect(parts.lists).toEqual(circuitLists([circuit("r1", "A", "15", "120"), circuit("r2", "B", "15", "120")]));
    expect(parts.more).toBe(false);
  });
});
