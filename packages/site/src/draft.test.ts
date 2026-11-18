import { ELECTRICAL_FORM } from "@mark1russell7/electrical/form";
import { checkForm, checkRoom, type LayerForm, type Survey } from "@mark1russell7/room-view";
import { SAMPLE_SURVEY } from "@mark1russell7/room-view/sample";
import { describe, expect, it } from "vitest";
import { collectionOf } from "./add-ons.ts";
import {
  angleOf,
  areaText,
  convertTyped,
  defaultMode,
  dimensionText,
  draftKeys,
  draftOf,
  emptyDraft,
  exampleDraft,
  featureAt,
  featureFaults,
  featureLabel,
  featureOf,
  featureSpans,
  featureTag,
  featureWord,
  fieldsOf,
  fileName,
  hasFault,
  hasMore,
  isExample,
  joinedTo,
  LENGTH_MODES,
  lengthText,
  listedObjects,
  listRecords,
  idsOf,
  MOST_LEVELS,
  MOST_RECORDS,
  MOST_ROOMS,
  nameWords,
  numberOf,
  objectFaults,
  objectMarks,
  objectOf,
  objectWords,
  ownedBy,
  ownedOf,
  parseStore,
  placedFeatures,
  pointKinds,
  readFeature,
  readObject,
  readLength,
  recordOf,
  recordUse,
  roomName,
  roomState,
  sameDraft,
  shownRoom,
  statusOf,
  storeOf,
  storeText,
  surveyOf,
  textOf,
  turnOf,
  typedOf,
  usualFor,
  usualOf,
  usualSize,
  walksRight,
  withActive,
  withConnection,
  withExample,
  withFeature,
  withMode,
  withNewFeature,
  withNewObject,
  withNewPoint,
  withNewRecord,
  withNewRoom,
  withNewRooms,
  withNewSide,
  withObject,
  withoutFeature,
  withoutObject,
  withoutRecord,
  withoutRoom,
  withoutSide,
  withOwned,
  withPoint,
  withRecord,
  withRoom,
  withSide,
  type Corner,
  type Draft,
  type DraftConnection,
  type DraftEnd,
  type DraftFeature,
  type DraftList,
  type DraftObject,
  type DraftSide,
  type FeatureEnd,
  type FeatureFault,
  type FeatureField,
  type FeatureKind,
  type LengthMode,
  type ObjectFault,
  type ObjectField,
  type Status,
  type Store,
  type TypedLength,
} from "./draft.ts";
import {
  circuitLists,
  circuitOf,
  circuitsOf,
  circuitUse,
  isOutlet,
  outletOf,
  withCircuit,
  withNewCircuit,
  withObjectOutlet,
  withoutCircuit,
  withOutletCircuit,
  wiring,
  type DraftCircuit,
} from "./electrical.fixture.ts";
import { ELECTRICAL } from "./electrical.ts";
import { readSurvey, roomResult, roomSurvey, shownLayers, storeLists } from "./layers.ts";

/** This function gives the draft of a survey record, with the records of the add-ons. A record names the key of a record of the lists of `readSurvey`. */
const roomDraft = (survey: Survey): Draft => readSurvey(survey).draft;

type Wall = Omit<DraftSide, "key">;

const NO_TEXT: TypedLength = { value: "", inches: "" };

/** This function gives a wall with one number for its length, and with no features. */
function wall(length: string, corner: Corner = "left", angle = ""): Wall {
  return { length: { value: length, inches: "" }, corner, angle, features: [], objects: [] };
}

/** This function gives a draft with the walls of a list. */
function room(mode: LengthMode, walls: readonly Wall[]): Draft {
  return { ...emptyDraft(mode), sides: walls.map((item, index) => ({ key: `s${String(index + 1)}`, ...item })) };
}

/** The kind of a feature of a test. An `outlet` is a point of the electrical layer. */
type TestKind = Exclude<FeatureKind, "point"> | "outlet";

/**
 * This function gives a feature with one number for each length of a list. Each other length has no text.
 * The kind `outlet` gives an outlet: a point of the collection of the outlets, with no circuit.
 */
function feature(key: string, kind: TestKind, lengths: Partial<Readonly<Record<FeatureField, string>>> = {}, from: FeatureEnd = "start"): DraftFeature {
  const typed = (text: string | undefined): TypedLength => ({ value: text ?? "", inches: "" });
  const base = { from, offset: typed(lengths.offset), width: typed(lengths.width), height: typed(lengths.height), sill: typed(lengths.sill) };
  if (kind === "outlet") return { key, kind: "point", ...base, point: ownedOf(ELECTRICAL.layer, ELECTRICAL.outlets) };
  return { key, kind, ...base };
}

/** This function gives a draft with the features of a list on the wall at a position, from 0. */
function onWall(draft: Draft, index: number, features: readonly DraftFeature[]): Draft {
  return { ...draft, sides: draft.sides.map((side, at) => (at === index ? { ...side, features } : side)) };
}

function statusFor(draft: Draft): Status {
  return statusOf(draft, roomResult(roomSurvey(draft)));
}

function faultsFor(draft: Draft): readonly FeatureFault[] {
  return featureFaults(draft, roomResult(roomSurvey(draft)));
}

/** A triangle with the sides 4, 3 and 5: its corners have 90 degrees, 53.13 degrees and 36.87 degrees. */
const TRIANGLE = [wall("4"), wall("3", "angle", "53.13"), wall("5", "angle", "36.87")];

/** A room of 4 m by 3 m. Its walls are 2.4 m high and 0.11 m thick. */
const BOX = room("m", [wall("4"), wall("3"), wall("4"), wall("3")]);

/** The sample room: wall 3 ends at a corner that points into the room, and wall 4 starts there. */
const NOOK = room("m", [wall("6"), wall("3"), wall("2", "right"), wall("2"), wall("4"), wall("5")]);

describe("numberOf", () => {
  it("gives no number for no text", () => {
    expect(numberOf("")).toBeUndefined();
    expect(numberOf("   ")).toBeUndefined();
  });

  it("reads a number with a point or a comma", () => {
    expect(numberOf("3.5")).toBe(3.5);
    expect(numberOf("3,5")).toBe(3.5);
    expect(numberOf(".5")).toBe(0.5);
    expect(numberOf("12.")).toBe(12);
    expect(numberOf(" 7 ")).toBe(7);
  });

  it("refuses each text that is not a number of 0 or more", () => {
    for (const text of ["-3", "1e3", "1.2.3", "abc", "3 m", "Infinity", "0x10"]) expect(numberOf(text), text).toBeNaN();
  });
});

describe("readLength", () => {
  it("adds the feet and the inches", () => {
    expect(readLength({ value: "12", inches: "3.5" }, "ft-in")).toEqual({ state: "ok", value: 147.5 });
    expect(readLength({ value: "12", inches: "" }, "ft-in")).toEqual({ state: "ok", value: 144 });
    expect(readLength({ value: "", inches: "6" }, "ft-in")).toEqual({ state: "ok", value: 6 });
  });

  it("reads one number in each other mode, and ignores the inches", () => {
    expect(readLength({ value: "3.74", inches: "9" }, "m")).toEqual({ state: "ok", value: 3.74 });
    expect(readLength({ value: "", inches: "9" }, "cm")).toEqual({ state: "empty" });
  });

  it("tells an empty length from a bad length", () => {
    expect(readLength({ value: "", inches: "" }, "ft-in")).toEqual({ state: "empty" });
    expect(readLength({ value: "x", inches: "3" }, "ft-in")).toEqual({ state: "bad" });
    expect(readLength({ value: "12", inches: "x" }, "ft-in")).toEqual({ state: "bad" });
    expect(readLength({ value: "x", inches: "" }, "m")).toEqual({ state: "bad" });
  });
});

describe("typedOf", () => {
  it("writes feet and inches", () => {
    expect(typedOf(147.5, "ft-in")).toEqual({ value: "12", inches: "3.5" });
    expect(typedOf(6, "ft-in")).toEqual({ value: "0", inches: "6" });
  });

  it("does not write 12 inches: a value that rounds to a full foot gives the next foot", () => {
    expect(typedOf(143.999, "ft-in")).toEqual({ value: "12", inches: "0" });
  });

  it("rounds to the decimals of each mode", () => {
    expect(typedOf(3.7449, "m")).toEqual({ value: "3.745", inches: "" });
    expect(typedOf(374.04, "cm")).toEqual({ value: "374", inches: "" });
    expect(typedOf(147.456, "in")).toEqual({ value: "147.46", inches: "" });
  });
});

describe("convertTyped", () => {
  it("keeps the length and changes the numbers", () => {
    expect(convertTyped({ value: "12", inches: "0" }, "ft-in", "m")).toEqual({ value: "3.658", inches: "" });
    expect(convertTyped({ value: "3", inches: "" }, "m", "cm")).toEqual({ value: "300", inches: "" });
    expect(convertTyped({ value: "3.048", inches: "" }, "m", "ft-in")).toEqual({ value: "10", inches: "0" });
    expect(convertTyped({ value: "120", inches: "" }, "in", "ft-in")).toEqual({ value: "10", inches: "0" });
  });

  it("keeps an empty length empty, and keeps a text that is not a number", () => {
    expect(convertTyped({ value: "", inches: "" }, "ft-in", "m")).toEqual({ value: "", inches: "" });
    expect(convertTyped({ value: "abc", inches: "2" }, "ft-in", "m")).toEqual({ value: "abc", inches: "" });
    expect(convertTyped({ value: "abc", inches: "" }, "m", "ft-in")).toEqual({ value: "abc", inches: "" });
  });
});

describe("surveyOf", () => {
  it("makes the survey record of the example room in meters", () => {
    expect(roomSurvey(exampleDraft("m"))).toEqual({
      schema: "survey/1",
      unit: "m",
      height: 2.4,
      wallThickness: 0.11,
      sides: [
        { id: "wall-1", length: 3.6, turn: "left" },
        { id: "wall-2", length: 3, turn: "left" },
        { id: "wall-3", length: 3.6, turn: "left" },
        { id: "wall-4", length: 3, turn: "left" },
      ],
      openings: [
        { id: "door-1", wall: "wall-1", kind: "door", offset: 0.15, width: 0.8, height: 2.03 },
        { id: "window-1", wall: "wall-3", kind: "window", offset: 1.2, width: 1.2, sill: 0.9, height: 1.2 },
      ],
      objects: [
        { id: "rack-1", kind: "rack", wall: "wall-2", offset: 1.2, width: 0.6, depth: 0.9, height: 1.2, gap: 0.1 },
        { id: "desk-1", kind: "desk", wall: "wall-3", offset: 1.05, width: 1.5, depth: 0.75, height: 0.75 },
        { id: "display-1", kind: "display", on: "desk-1", offset: 0.45, width: 0.6, depth: 0.2, height: 0.45, gap: 0.1 },
      ],
      layers: {
        [ELECTRICAL.layer]: {
          schema: ELECTRICAL.layer,
          outlets: [{ id: "outlet-1", anchor: { on: "wall", wall: "wall-2", face: "left", offset: 1.5, height: 0.3 } }],
          feeds: [{ id: "feed-rack-1", object: "rack-1", outlet: "outlet-1" }],
        },
      },
    });
  });

  it("writes feet and inches as inches", () => {
    const survey = roomSurvey(exampleDraft("ft-in"));
    expect(survey.unit).toBe("in");
    expect(survey.height).toBe(96);
    expect(survey.wallThickness).toBe(4.5);
    expect(survey.sides.map((side) => side.length)).toEqual([144, 120, 144, 120]);
    expect(survey.openings?.[0]).toEqual({ id: "door-1", wall: "wall-1", kind: "door", offset: 6, width: 32, height: 80 });
    expect(wiring(survey.layers)?.outlets).toEqual([{ id: "outlet-1", anchor: { on: "wall", wall: "wall-2", face: "left", offset: 60, height: 12 } }]);
  });

  it("gives a closed room for the example of each mode", () => {
    for (const mode of LENGTH_MODES) expect(roomResult(roomSurvey(exampleDraft(mode))).closure.closed, mode).toBe(true);
  });

  it("keeps a name with no space at its ends, and no empty name", () => {
    expect(roomSurvey({ ...exampleDraft("m"), name: "  Bedroom " }).name).toBe("Bedroom");
    expect(roomSurvey({ ...exampleDraft("m"), name: "   " })).not.toHaveProperty("name");
  });

  it("is total: a bad length counts as 0, and a bad height gets a usual value", () => {
    const draft = withSide({ ...exampleDraft("m"), height: { value: "tall", inches: "" }, thickness: { value: "0", inches: "" } }, "s2", { length: { value: "abc", inches: "" } });
    const survey = roomSurvey(draft);
    expect(survey.sides[1]?.length).toBe(0);
    expect(survey.height).toBe(2.4);
    expect(survey.wallThickness).toBe(0.11);
  });
});

describe("a measured corner", () => {
  it("has an angle above 0 and below 360 degrees", () => {
    const angle = (text: string): number | undefined => angleOf({ key: "s1", ...wall("1", "angle", text) });
    expect(angle("135")).toBe(135);
    expect(angle("270")).toBe(270);
    expect(angle("0")).toBeUndefined();
    expect(angle("360")).toBeUndefined();
    expect(angle("")).toBeUndefined();
    expect(angle("wide")).toBeUndefined();
  });

  it("turns left by 180 degrees minus the angle inside the room", () => {
    const side = (corner: Corner, angle = ""): DraftSide => ({ key: "s1", ...wall("1", corner, angle) });
    expect(turnOf(side("left"))).toBe("left");
    expect(turnOf(side("right"))).toBe("right");
    expect(turnOf(side("angle", "135"))).toBe(45);
    expect(turnOf(side("angle", "90"))).toBe(90);
    // A corner that points into the room has more than 180 degrees inside the room: the walk turns right.
    expect(turnOf(side("angle", "270"))).toBe(-90);
    expect(turnOf(side("angle", ""))).toBe(0);
    expect(turnOf(side("angle", "135"), true)).toBe(-45);
  });

  it("closes a triangle", () => {
    const draft = room("m", TRIANGLE);
    const survey = roomSurvey(draft);
    expect(survey.sides[1]?.turn).toBeCloseTo(126.87, 9);
    expect(survey.sides[2]?.turn).toBeCloseTo(143.13, 9);
    const result = roomResult(survey);
    expect(result.closure.closed).toBe(true);
    // The angles have 2 decimals, so the gap is some micrometers. The page tells no gap.
    expect(statusOf(draft, result)).toEqual({ level: "closed", title: "The room closes.", text: "The walk ends at its start." });
  });

  it("closes the same triangle in a walk to the right, with the walls on the left", () => {
    const draft = room("m", [wall("4", "right"), wall("3", "angle", "53.13"), wall("5", "angle", "36.87")]);
    expect(walksRight(draft.sides)).toBe(true);
    const survey = roomSurvey(draft);
    expect(survey.sides[1]?.turn).toBeCloseTo(-126.87, 9);
    expect(survey.sides[2]?.turn).toBeCloseTo(-143.13, 9);
    const result = roomResult(survey);
    expect(result.closure.closed).toBe(true);
    expect(result.room.walls[0]?.side).toBe("left");
  });

  it("takes the place of a square corner", () => {
    // The sample room, with its corner into the room as an angle of 270 degrees.
    const draft = room("m", [wall("6"), wall("3"), wall("2", "angle", "270"), wall("2"), wall("4"), wall("5")]);
    expect(walksRight(draft.sides)).toBe(false);
    expect(statusFor(draft)).toEqual({ level: "closed", title: "The room closes.", text: "The walk ends exactly at its start." });
  });
});

describe("walksRight", () => {
  it("tells the direction of a walk from its square corners", () => {
    expect(walksRight(exampleDraft("m").sides)).toBe(false);
    expect(walksRight(exampleDraft("m").sides.map((side) => ({ ...side, corner: "right" as const })))).toBe(true);
  });

  it("gives a walk to the left for no walls", () => {
    expect(walksRight([])).toBe(false);
  });
});

describe("draftOf", () => {
  it("gives the draft of its own survey record", () => {
    for (const mode of ["ft-in", "m", "cm"] as const) expect(roomDraft(roomSurvey(exampleDraft(mode))), mode).toEqual(exampleDraft(mode));
    expect(roomDraft(roomSurvey(room("m", TRIANGLE)))).toEqual(room("m", TRIANGLE));
  });

  it("shows a record in inches as feet and inches", () => {
    expect(roomDraft(roomSurvey(exampleDraft("in")))).toEqual(exampleDraft("ft-in"));
  });

  it("shows a record in feet as feet and inches, and a record in millimeters as centimeters", () => {
    const survey = (unit: Survey["unit"], height: number, wallThickness: number, length: number): Survey => ({
      schema: "survey/1",
      unit,
      height,
      wallThickness,
      sides: [{ id: "a", length, turn: "left" }],
    });
    const feet = roomDraft(survey("ft", 8, 0.375, 12.5));
    expect(feet.mode).toBe("ft-in");
    expect(feet.height).toEqual({ value: "8", inches: "0" });
    expect(feet.thickness).toEqual({ value: "0", inches: "4.5" });
    expect(feet.sides[0]?.length).toEqual({ value: "12", inches: "6" });
    const millimeters = roomDraft(survey("mm", 2400, 110, 3605));
    expect(millimeters.mode).toBe("cm");
    expect(millimeters.height).toEqual({ value: "240", inches: "" });
    expect(millimeters.sides[0]?.length).toEqual({ value: "360.5", inches: "" });
  });

  it("writes each turn that is a number as the angle inside the room", () => {
    const survey = (turns: readonly Survey["sides"][number]["turn"][]): Survey => ({
      schema: "survey/1",
      unit: "m",
      height: 2.4,
      wallThickness: 0.1,
      sides: turns.map((turn, index) => ({ id: `side-${String(index)}`, length: 1, turn })),
    });
    const corners = (draft: Draft): readonly (readonly [Corner, string])[] => draft.sides.map((side) => [side.corner, side.angle]);
    expect(corners(roomDraft(survey(["left", 126.87, 143.13])))).toEqual([["left", ""], ["angle", "53.13"], ["angle", "36.87"]]);
    // The turns of a walk to the right are negative.
    expect(corners(roomDraft(survey(["right", -126.87, -143.13])))).toEqual([["right", ""], ["angle", "53.13"], ["angle", "36.87"]]);
  });

  it("reads the walls of the sample survey, and tells that the survey has more data than the draft keeps", () => {
    const draft = roomDraft(SAMPLE_SURVEY);
    expect(draft.name).toBe("Sample room");
    expect(draft.sides.map((side) => side.length.value)).toEqual(["6", "3", "2", "2", "4", "5"]);
    expect(draft.sides.map((side) => side.corner)).toEqual(["left", "left", "right", "left", "left", "left"]);
    expect(readSurvey(SAMPLE_SURVEY).more).toBe(true);
    expect(readSurvey(roomSurvey(draft)).more).toBe(false);
    expect(statusFor(draft)).toEqual({ level: "closed", title: "The room closes.", text: "The walk ends exactly at its start." });
  });

  it("reads the features of each wall of the sample survey, in the sequence of their distances", () => {
    const draft = roomDraft(SAMPLE_SURVEY);
    expect(draft.sides.map((side) => side.features.map((item) => featureTag(item)))).toEqual([
      ["door", "outlet", "outlet"],
      ["outlet", "window"],
      [],
      ["outlet"],
      ["outlet", "outlet"],
      ["window", "outlet"],
    ]);
    expect(draft.sides.flatMap((side) => side.features.map((item) => item.key))).toEqual(["f1", "f2", "f3", "f4", "f5", "f6", "f7", "f8", "f9", "f10"]);
    expect(draft.sides[0]?.features[0]).toEqual({
      key: "f1",
      kind: "door",
      from: "start",
      offset: { value: "0.6", inches: "" },
      width: { value: "0.9", inches: "" },
      height: { value: "2.05", inches: "" },
      sill: NO_TEXT,
    });
    expect(draft.sides[1]?.features).toEqual([
      // The survey lists its circuits, so the outlet names the key of its circuit in the lists of `readSurvey`.
      { ...feature("f4", "outlet", { offset: "0.4", height: "0.3" }), point: ownedOf(ELECTRICAL.layer, ELECTRICAL.outlets, { records: { [ELECTRICAL.circuit]: "r1" } }) },
      { key: "f5", kind: "window", from: "start", offset: { value: "0.8", inches: "" }, width: { value: "1.4", inches: "" }, height: { value: "1.2", inches: "" }, sill: { value: "0.9", inches: "" } },
    ]);
    expect(faultsFor(draft)).toEqual([]);
  });

  it("gives the features of an id to the first side with that id", () => {
    const survey: Survey = {
      schema: "survey/1",
      unit: "m",
      height: 2.4,
      wallThickness: 0.1,
      sides: [
        { id: "a", length: 4, turn: "left" },
        { id: "a", length: 3, turn: "left" },
      ],
      openings: [{ id: "door", wall: "a", kind: "gap", offset: 0, width: 1, height: 2 }],
      outlets: [{ id: "outlet", wall: "b", offset: 1, height: 0.3 }],
    };
    const draft = roomDraft(survey);
    expect(draft.sides.map((side) => side.features.map((item) => item.kind))).toEqual([["gap"], []]);
    expect(draft.sides[0]?.features[0]?.offset).toEqual({ value: "0", inches: "" });
    expect(readSurvey(survey).more).toBe(true);
  });

  it("gives an empty field for a number that is not a length", () => {
    const draft = roomDraft({ schema: "survey/1", unit: "m", height: Number.NaN, wallThickness: -1, sides: [{ id: "a", length: 0, turn: Number.POSITIVE_INFINITY }] });
    expect(draft.height).toEqual({ value: "", inches: "" });
    expect(draft.thickness).toEqual({ value: "", inches: "" });
    expect(draft.sides[0]).toEqual({ key: "s1", length: { value: "", inches: "" }, corner: "angle", angle: "", features: [], objects: [] });
  });
});

describe("hasMore", () => {
  const survey = roomSurvey(exampleDraft("m"));
  /** The example room of an old file: its outlet is in the old field of the survey record, and the record has no layer. */
  const old: Survey = { ...surveyOf(exampleDraft("m")), outlets: [{ id: "outlet-1", wall: "wall-2", offset: 1.5, height: 0.3 }] };

  it("is false for the record of a draft", () => {
    expect(readSurvey(survey).more).toBe(false);
    expect(readSurvey(roomSurvey(BOX)).more).toBe(false);
    expect(readSurvey(old).more).toBe(false);
  });

  it("is false for the records of an add-on: `levelParts` tells their data that the page does not keep", () => {
    const circuits = [{ id: "a", name: "Circuit A", limit: 1440 }];
    const lost = [{ id: "outlet-1", wall: "hall", offset: 1, height: 0.3, circuit: "b" }];
    expect(hasMore({ ...old, circuits })).toBe(false);
    expect(hasMore({ ...old, circuits, outlets: lost })).toBe(false);
    // The limit of the circuit is not the limit of the usual breaker and voltage. The outlet is on no wall of the survey.
    expect(readSurvey({ ...old, circuits }).more).toBe(true);
    expect(readSurvey({ ...old, outlets: lost }).more).toBe(true);
    const good = [{ id: "a", name: "Circuit A", breaker: 16, voltage: 230, limit: 2944 }];
    const outlets = (old.outlets ?? []).map((outlet) => ({ ...outlet, circuit: "a" }));
    expect(outlets).not.toEqual([]);
    expect(readSurvey({ ...old, circuits: good, outlets }).more).toBe(false);
    // An outlet of a circuit that the survey does not list.
    expect(readSurvey({ ...old, outlets }).more).toBe(true);
    // The page reads the layer, so it does not keep the old fields next to the layer.
    expect(readSurvey({ ...survey, circuits: good }).more).toBe(true);
  });

  it("tells each kind of data that a draft does not keep", () => {
    const more: readonly Survey[] = [
      { ...survey, checks: [{ id: "diagonal", from: "wall-1", to: "wall-3", length: 4.7 }] },
      { ...survey, sides: survey.sides.map((side) => ({ ...side, height: 2 })) },
      { ...survey, sides: survey.sides.map((side) => ({ ...side, thickness: 0.2 })) },
      { ...survey, openings: [{ id: "door-1", wall: "wall-1", kind: "door", offset: 1, width: 0.8, sill: 0.1, height: 2 }] },
      { ...survey, openings: [{ id: "door-1", wall: "hall", kind: "door", offset: 1, width: 0.8, height: 2 }] },
      { ...old, outlets: [{ id: "outlet-1", wall: "wall-2", offset: 1, height: 0.3, circuit: "a" }] },
      { ...old, outlets: [{ id: "outlet-1", wall: "hall", offset: 1, height: 0.3 }] },
    ];
    for (const [index, item] of more.entries()) expect(readSurvey(item).more, String(index)).toBe(true);
  });
});

describe("the example room and the empty room", () => {
  it("have four walls with square corners", () => {
    for (const mode of LENGTH_MODES) {
      expect(exampleDraft(mode).sides.map((side) => side.corner), mode).toEqual(["left", "left", "left", "left"]);
      expect(emptyDraft(mode).sides.map((side) => side.length), mode).toEqual(Array.from({ length: 4 }, () => ({ value: "", inches: "" })));
    }
  });

  it("have round numbers in each mode", () => {
    expect(exampleDraft("ft-in").sides[0]?.length).toEqual({ value: "12", inches: "0" });
    expect(exampleDraft("in").sides[1]?.length).toEqual({ value: "120", inches: "" });
    expect(exampleDraft("m").sides[0]?.length).toEqual({ value: "3.6", inches: "" });
    expect(exampleDraft("cm").height).toEqual({ value: "240", inches: "" });
  });

  it("are equal only to a draft with the same text in each field", () => {
    expect(sameDraft(exampleDraft("m"), exampleDraft("m"))).toBe(true);
    expect(sameDraft(exampleDraft("m"), emptyDraft("m"))).toBe(false);
    expect(sameDraft(exampleDraft("m"), { ...exampleDraft("m"), name: "Bedroom" })).toBe(false);
    expect(sameDraft(exampleDraft("m"), withFeature(exampleDraft("m"), "f1", { from: "end" }))).toBe(false);
  });

  it("have a door, an outlet and a window in the example, and no feature in the empty room", () => {
    for (const mode of LENGTH_MODES) {
      expect(exampleDraft(mode).sides.map((side) => side.features.map((item) => `${item.key} ${featureTag(item)}`)), mode).toEqual([["f1 door"], ["f2 outlet"], ["f3 window"], []]);
      expect(emptyDraft(mode).sides.map((side) => side.features), mode).toEqual([[], [], [], []]);
    }
    expect(featureOf(exampleDraft("ft-in"), "f1")).toEqual({
      key: "f1",
      kind: "door",
      from: "start",
      offset: { value: "0", inches: "6" },
      width: { value: "2", inches: "8" },
      height: { value: "6", inches: "8" },
      sill: NO_TEXT,
    });
  });
});

describe("fieldsOf", () => {
  it("gives the lengths of each kind in the sequence of the form", () => {
    expect(fieldsOf("door")).toEqual(["offset", "width", "height"]);
    expect(fieldsOf("gap")).toEqual(["offset", "width", "height"]);
    expect(fieldsOf("window")).toEqual(["offset", "width", "sill", "height"]);
    expect(fieldsOf("point")).toEqual(["offset", "height"]);
  });
});

describe("usualOf", () => {
  it("gives a round number in each mode", () => {
    expect(usualOf("door", "height", "ft-in")).toBe(80);
    expect(usualOf("gap", "height", "in")).toBe(80);
    expect(usualOf("window", "height", "in")).toBe(48);
    expect(usualOf("window", "sill", "ft-in")).toBe(36);
    expect(usualOf("door", "height", "m")).toBe(2.03);
    expect(usualOf("window", "height", "cm")).toBe(120);
    expect(usualOf("window", "sill", "cm")).toBe(90);
  });

  it("gives no usual value for a distance, for a width, and for the bottom of a kind that is not a window", () => {
    expect(usualOf("door", "offset", "m")).toBeUndefined();
    expect(usualOf("window", "width", "m")).toBeUndefined();
    expect(usualOf("door", "sill", "m")).toBeUndefined();
    expect(usualOf("point", "sill", "ft-in")).toBeUndefined();
  });

  it("gives a point the usual height of its form, and no height with no form", () => {
    expect(usualOf("point", "height", "in", { imperial: 0.3048, metric: 0.3 })).toBe(12);
    expect(usualOf("point", "height", "cm", { imperial: 0.3048, metric: 0.3 })).toBe(30);
    expect(usualOf("point", "height", "in")).toBeUndefined();
    expect(usualOf("point", "offset", "m", { imperial: 0.3048, metric: 0.3 })).toBeUndefined();
  });
});

describe("usualFor", () => {
  it("gives an outlet the usual height of the form of the outlets", () => {
    expect(usualFor(feature("f1", "outlet"), "height", "in")).toBe(12);
    expect(usualFor(feature("f1", "outlet"), "height", "m")).toBe(0.3);
    expect(usualFor(feature("f1", "outlet"), "sill", "m")).toBeUndefined();
  });

  it("gives an opening the usual value of its kind", () => {
    expect(usualFor(feature("f1", "door"), "height", "m")).toBe(2.03);
    expect(usualFor(feature("f1", "window"), "sill", "ft-in")).toBe(36);
  });

  it("gives no usual height to a point of a layer that the forms do not have", () => {
    const stray: DraftFeature = { ...feature("f1", "outlet"), point: ownedOf("plumbing/1", "taps") };
    expect(usualFor(stray, "height", "m")).toBeUndefined();
    expect(usualFor(feature("f1", "outlet"), "height", "m", [])).toBeUndefined();
  });
});

describe("readFeature", () => {
  it("gives the numbers of a door, with the usual height for a height with no text", () => {
    expect(readFeature(feature("f1", "door", { offset: "0.5", width: "0.9" }), 4, "m")).toEqual({ state: "ok", numbers: { start: 0.5, width: 0.9, height: 2.03, sill: 0 } });
    expect(readFeature(feature("f1", "gap", { offset: "0", width: "0.9", height: "2.1" }), 4, "m")).toEqual({ state: "ok", numbers: { start: 0, width: 0.9, height: 2.1, sill: 0 } });
  });

  it("gives the numbers of a window and of an outlet", () => {
    expect(readFeature(feature("f1", "window", { offset: "1", width: "1.2" }), 4, "m")).toEqual({ state: "ok", numbers: { start: 1, width: 1.2, height: 1.2, sill: 0.9 } });
    expect(readFeature(feature("f1", "window", { offset: "1", width: "1.2", sill: "0", height: "2" }), 4, "m")).toEqual({ state: "ok", numbers: { start: 1, width: 1.2, height: 2, sill: 0 } });
    expect(readFeature(feature("f1", "outlet", { offset: "2" }), 4, "m")).toEqual({ state: "ok", numbers: { start: 2, width: 0, height: 0.3, sill: 0 } });
    // An outlet can be at the floor, and it has no width.
    expect(readFeature(feature("f1", "outlet", { offset: "0", width: "wide", height: "0" }), 4, "m")).toEqual({ state: "ok", numbers: { start: 0, width: 0, height: 0, sill: 0 } });
  });

  it("reads feet and inches", () => {
    const door: DraftFeature = { ...feature("f1", "door"), offset: { value: "1", inches: "6" }, width: { value: "2", inches: "8" } };
    expect(readFeature(door, 144, "ft-in")).toEqual({ state: "ok", numbers: { start: 18, width: 32, height: 80, sill: 0 } });
  });

  it("changes a distance from the end of the wall into a distance from its start", () => {
    expect(readFeature(feature("f1", "door", { offset: "0.5", width: "0.9" }, "end"), 4, "m")).toMatchObject({ state: "ok", numbers: { start: 2.6, width: 0.9 } });
    expect(readFeature(feature("f1", "outlet", { offset: "0.5" }, "end"), 4, "m")).toMatchObject({ state: "ok", numbers: { start: 3.5, width: 0 } });
  });

  it("tells the first field that needs a value", () => {
    expect(readFeature(feature("f1", "door"), 4, "m")).toEqual({ state: "empty", field: "offset" });
    expect(readFeature(feature("f1", "door", { offset: "1" }), 4, "m")).toEqual({ state: "empty", field: "width" });
    expect(readFeature(feature("f1", "door", { offset: "1", width: "wide" }), 4, "m")).toEqual({ state: "bad", field: "width" });
    expect(readFeature(feature("f1", "door", { offset: "1", width: "0" }), 4, "m")).toEqual({ state: "zero", field: "width" });
    expect(readFeature(feature("f1", "window", { offset: "1", width: "1", height: "0" }), 4, "m")).toEqual({ state: "zero", field: "height" });
    expect(readFeature(feature("f1", "window", { offset: "1", width: "1", sill: "low" }), 4, "m")).toEqual({ state: "bad", field: "sill" });
    expect(readFeature(feature("f1", "outlet"), 4, "m")).toEqual({ state: "empty", field: "offset" });
  });
});

describe("the features of a survey record", () => {
  it("names each feature by its kind and its number in the walk", () => {
    const first = [feature("f1", "door", { offset: "0.5", width: "0.9" }), feature("f2", "outlet", { offset: "2" })];
    const third = [feature("f3", "gap", { offset: "0.5", width: "1" }), feature("f4", "door", { offset: "2", width: "0.8" }), feature("f5", "window", { offset: "3", width: "0.5" })];
    const draft = onWall(onWall(BOX, 0, first), 2, third);
    expect(placedFeatures(draft).map((item) => [item.side, item.id, item.number, item.wall])).toEqual([
      [0, "door-1", 1, 4],
      [0, "outlet-1", 1, 4],
      [2, "opening-1", 1, 4],
      [2, "door-2", 2, 4],
      [2, "window-1", 1, 4],
    ]);
  });

  it("has the openings and the outlets of the walls, each with its distance from the start of its wall", () => {
    const first = [feature("f1", "door", { offset: "0.5", width: "0.9" }), feature("f2", "outlet", { offset: "2", height: "1.1" })];
    const second = [feature("f3", "window", { offset: "1", width: "1.2", sill: "0.8", height: "1" }, "end")];
    const survey = roomSurvey(onWall(onWall(BOX, 0, first), 1, second));
    expect(survey.openings).toEqual([
      { id: "door-1", wall: "wall-1", kind: "door", offset: 0.5, width: 0.9, height: 2.03 },
      { id: "window-1", wall: "wall-2", kind: "window", offset: 0.8, width: 1.2, sill: 0.8, height: 1 },
    ]);
    expect(wiring(survey.layers)?.outlets).toEqual([{ id: "outlet-1", anchor: { on: "wall", wall: "wall-1", face: "left", offset: 2, height: 1.1 } }]);
  });

  it("has no record of a feature that needs a value, and no record of a feature on a wall with no length", () => {
    const typing = roomSurvey(onWall(BOX, 0, [feature("f1", "door", { offset: "0.5" }), feature("f2", "outlet", { offset: "far" })]));
    expect(typing).not.toHaveProperty("openings");
    expect(typing).not.toHaveProperty("layers");
    const noWall = withSide(onWall(BOX, 0, [feature("f1", "door", { offset: "0.5", width: "0.9" })]), "s1", { length: NO_TEXT });
    expect(roomSurvey(noWall)).not.toHaveProperty("openings");
  });

  it("keeps the number of a feature when a feature before it needs a value", () => {
    const draft = onWall(BOX, 0, [feature("f1", "door"), feature("f2", "door", { offset: "2", width: "0.9" })]);
    expect(roomSurvey(draft).openings?.map((item) => item.id)).toEqual(["door-2"]);
  });
});

describe("featureFaults", () => {
  it("gives no fault for the example room, in each mode", () => {
    for (const mode of LENGTH_MODES) expect(faultsFor(exampleDraft(mode)), mode).toEqual([]);
  });

  it("asks for the first field of a feature that needs a value", () => {
    expect(faultsFor(onWall(BOX, 0, [feature("f1", "door")]))).toEqual([
      { side: 0, key: "f1", id: "door-1", level: "typing", field: "offset", text: "Type the distance from the corner of door 1 on wall 1.", note: "Type its distance from the corner." },
    ]);
    expect(faultsFor(onWall(BOX, 1, [feature("f1", "window", { offset: "1", width: "wide" })]))[0]).toMatchObject({
      side: 1,
      level: "typing",
      field: "width",
      text: "The width of window 1 on wall 2 is not a number.",
      note: "Its width is not a number.",
    });
    expect(faultsFor(onWall(BOX, 0, [feature("f1", "gap", { offset: "1", width: "1", height: "0" })]))[0]).toMatchObject({
      field: "height",
      text: "The height of opening 1 on wall 1 is 0.",
      note: "Its height is 0.",
    });
    expect(faultsFor(onWall(BOX, 0, [feature("f1", "outlet", { offset: "1", height: "low" })]))[0]).toMatchObject({
      field: "height",
      text: "The height above the floor of outlet 1 on wall 1 is not a number.",
    });
    expect(faultsFor(onWall(BOX, 0, [feature("f1", "window", { offset: "1", width: "1", sill: "low" })]))[0]).toMatchObject({
      field: "sill",
      text: "The height of the bottom of window 1 on wall 1 is not a number.",
    });
  });

  it("tells a door that does not fit in its wall", () => {
    expect(faultsFor(onWall(BOX, 0, [feature("f1", "door", { offset: "3.5", width: "0.9" })]))).toEqual([
      { side: 0, key: "f1", id: "door-1", level: "error", text: "Door 1 does not fit in wall 1.", note: "It does not fit in the wall." },
    ]);
    // The distance of this door starts at the end of the wall, so the door starts before the start of the wall.
    expect(faultsFor(onWall(BOX, 0, [feature("f1", "door", { offset: "3.5", width: "0.9" }, "end")]))[0]?.text).toBe("Door 1 does not fit in wall 1.");
  });

  it("tells a door that is too near a corner that points into the room", () => {
    // The walls are 0.11 m thick. At this corner, wall 3 covers the first 0.11 m of wall 4.
    expect(faultsFor(onWall(NOOK, 3, [feature("f1", "door", { offset: "0.05", width: "0.8" })]))).toEqual([
      { side: 3, key: "f1", id: "door-1", level: "error", text: "Door 1 on wall 4 is too near a corner.", note: "It is too near a corner: the other wall of the corner covers a part of it." },
    ]);
    expect(faultsFor(onWall(NOOK, 3, [feature("f1", "door", { offset: "0.2", width: "0.8" })]))).toEqual([]);
    // A corner of a room that does not point into the room covers no part of a wall.
    expect(faultsFor(onWall(BOX, 0, [feature("f1", "door", { offset: "0", width: "0.8" })]))).toEqual([]);
  });

  it("tells an opening that is higher than the wall", () => {
    expect(faultsFor(onWall(BOX, 0, [feature("f1", "window", { offset: "1", width: "1", sill: "1.5", height: "1" })]))[0]).toMatchObject({
      level: "error",
      text: "Window 1 on wall 1 is higher than the wall.",
      note: "It is higher than the wall.",
    });
  });

  it("tells the later of two openings that share a part of a wall", () => {
    const faults = faultsFor(onWall(BOX, 0, [feature("f1", "door", { offset: "1", width: "1" }), feature("f2", "window", { offset: "1.5", width: "1" })]));
    expect(faults).toEqual([
      { side: 0, key: "f2", id: "window-1", level: "error", text: "Window 1 on wall 1 is in the space of a different opening.", note: "It is in the space of a different opening of this wall." },
    ]);
  });

  it("tells an outlet that is not on its wall, and an outlet in an opening", () => {
    expect(faultsFor(onWall(BOX, 0, [feature("f1", "outlet", { offset: "5" })]))[0]).toMatchObject({ level: "error", text: "Outlet 1 is not on wall 1.", note: "It is not on the wall." });
    expect(faultsFor(onWall(BOX, 0, [feature("f1", "outlet", { offset: "1", height: "3" })]))[0]).toMatchObject({ level: "error", text: "Outlet 1 is not on wall 1." });
    expect(faultsFor(onWall(BOX, 0, [feature("f1", "door", { offset: "1", width: "1" }), feature("f2", "outlet", { offset: "1.5" })]))).toEqual([
      { side: 0, key: "f2", id: "outlet-1", level: "warning", text: "Outlet 1 on wall 1 is in an opening.", note: "It is in an opening of this wall." },
    ]);
  });

  it("gives no fault of its place to a feature on a wall with no length", () => {
    const draft = withSide(onWall(BOX, 0, [feature("f1", "door", { offset: "3.5", width: "0.9" })]), "s1", { length: NO_TEXT });
    expect(faultsFor(draft)).toEqual([]);
  });
});

describe("shownRoom", () => {
  it("gives the same room when no feature has an error", () => {
    const draft = exampleDraft("m");
    const result = roomResult(roomSurvey(draft));
    expect(shownRoom(result.room, featureFaults(draft, result))).toBe(result.room);
  });

  it("removes each opening with an error, and `shownLayers` removes each outlet with an error and keeps an outlet with a warning", () => {
    const draft = onWall(BOX, 0, [
      feature("f1", "door", { offset: "1", width: "1" }),
      feature("f2", "outlet", { offset: "1.5" }),
      feature("f3", "window", { offset: "3.5", width: "1" }),
      feature("f4", "outlet", { offset: "9" }),
    ]);
    const result = roomResult(roomSurvey(draft));
    expect(result.room.openings?.map((item) => item.id)).toEqual(["door-1", "window-1"]);
    const shown = shownRoom(result.room, featureFaults(draft, result));
    expect(shown.openings?.map((item) => item.id)).toEqual(["door-1"]);
    expect(checkRoom(shown).filter((finding) => finding.level === "error")).toEqual([]);
    // Outlet 1 is in the door: a warning. Outlet 2 is not on its wall: an error.
    expect(wiring(result.layers)?.outlets?.map((item) => item.id)).toEqual(["outlet-1", "outlet-2"]);
    expect(wiring(shownLayers(shown, result.objects, result.layers, "metric"))?.outlets?.map((item) => item.id)).toEqual(["outlet-1"]);
    expect(shown.walls).toBe(result.room.walls);
  });
});

describe("featureSpans", () => {
  it("gives the place of each feature as a part of the length of its wall", () => {
    const first = [feature("f1", "door", { offset: "1", width: "1" }), feature("f2", "outlet", { offset: "3" })];
    const second = [feature("f3", "window", { offset: "0.75", width: "1.5" }, "end")];
    expect(featureSpans(onWall(onWall(BOX, 0, first), 1, second), [])).toEqual([
      { side: 0, key: "f1", kind: "door", tag: "door", from: 0.25, to: 0.5, corner: "start", fault: undefined },
      { side: 0, key: "f2", kind: "point", tag: "outlet", from: 0.75, to: 0.75, corner: "start", fault: undefined },
      { side: 1, key: "f3", kind: "window", tag: "window", from: 0.25, to: 0.75, corner: "end", fault: undefined },
    ]);
  });

  it("gives a point of a layer that the forms do not have the tag of a point", () => {
    // The page has no usual height for such a point, so the point has a place only with a height.
    const stray: DraftFeature = { ...feature("f1", "outlet", { offset: "1", height: "0.5" }), point: ownedOf("plumbing/1", "taps") };
    expect(featureSpans(onWall(BOX, 0, [stray]), []).map((span) => span.tag)).toEqual(["point"]);
    expect(featureSpans(onWall(BOX, 0, [{ ...stray, height: NO_TEXT }]), [])).toEqual([]);
    expect(featureSpans(onWall(BOX, 0, [feature("f1", "outlet", { offset: "1", height: "0.5" })]), [], []).map((span) => span.tag)).toEqual(["point"]);
  });

  it("keeps each place in its wall, and tells the level of a fault of the place", () => {
    const draft = onWall(BOX, 0, [feature("f1", "door", { offset: "3.5", width: "1" }), feature("f2", "door", { offset: "1", width: "1" }), feature("f3", "outlet", { offset: "1.5" })]);
    expect(featureSpans(draft, faultsFor(draft)).map((span) => [span.key, span.from, span.to, span.fault])).toEqual([
      ["f1", 0.875, 1, "error"],
      ["f2", 0.25, 0.5, undefined],
      ["f3", 0.375, 0.375, "warning"],
    ]);
  });

  it("gives no place to a feature that needs a value, and no place on a wall with no length", () => {
    expect(featureSpans(onWall(BOX, 0, [feature("f1", "door", { offset: "1" })]), [])).toEqual([]);
    const noWall = withSide(onWall(BOX, 0, [feature("f1", "door", { offset: "1", width: "1" })]), "s1", { length: NO_TEXT });
    expect(featureSpans(noWall, [])).toEqual([]);
  });
});

describe("defaultMode", () => {
  it("gives feet and inches where people use them, and meters in each other place", () => {
    expect(defaultMode("en-US")).toBe("ft-in");
    expect(defaultMode("es-us")).toBe("ft-in");
    expect(defaultMode("en-GB")).toBe("m");
    expect(defaultMode("de")).toBe("m");
    expect(defaultMode(undefined)).toBe("m");
  });
});

describe("the changes of a draft", () => {
  it("changes the units and keeps each length", () => {
    const meters = withMode(exampleDraft("ft-in"), "m");
    expect(meters.mode).toBe("m");
    expect(meters.sides.map((side) => side.length.value)).toEqual(["3.658", "3.048", "3.658", "3.048"]);
    expect(meters.height).toEqual({ value: "2.438", inches: "" });
    expect(meters.sides.map((side) => side.key)).toEqual(["s1", "s2", "s3", "s4"]);
  });

  it("gives the same draft for the same units", () => {
    const draft = exampleDraft("cm");
    expect(withMode(draft, "cm")).toBe(draft);
  });

  it("adds a wall with no length and the corner of the wall before it", () => {
    const right = withSide(exampleDraft("m"), "s4", { corner: "right" });
    expect(withNewSide(right).sides.at(-1)).toEqual({ key: "s5", length: { value: "", inches: "" }, corner: "right", angle: "", features: [], objects: [] });
    const angle = withSide(exampleDraft("m"), "s4", { corner: "angle", angle: "135" });
    expect(withNewSide(angle).sides.at(-1)?.corner).toBe("left");
  });

  it("gives a new wall a key that no wall has", () => {
    const draft = withNewSide(withoutSide(exampleDraft("m"), "s2"));
    expect(draft.sides.map((side) => side.key)).toEqual(["s1", "s3", "s4", "s5"]);
    expect(withNewSide({ ...draft, sides: [] }).sides.map((side) => side.key)).toEqual(["s1"]);
  });

  it("changes only the wall with the key", () => {
    const draft = withSide(exampleDraft("m"), "s3", { length: { value: "4", inches: "" } });
    expect(draft.sides.map((side) => side.length.value)).toEqual(["3.6", "3", "4", "3"]);
    expect(withSide(draft, "s9", { angle: "1" })).toEqual(draft);
  });

  it("changes the units of each feature, and keeps a length with no text", () => {
    const door = featureOf(withMode(exampleDraft("ft-in"), "m"), "f1");
    expect(door).toEqual({
      key: "f1",
      kind: "door",
      from: "start",
      offset: { value: "0.152", inches: "" },
      width: { value: "0.813", inches: "" },
      height: { value: "2.032", inches: "" },
      sill: NO_TEXT,
    });
  });

  it("adds a feature with no lengths at the end of the features of a wall, with a key that no feature has", () => {
    const draft = withNewFeature(exampleDraft("m"), "s1", "window");
    expect(draft.sides[0]?.features.map((item) => item.key)).toEqual(["f1", "f4"]);
    expect(featureOf(draft, "f4")).toEqual({ key: "f4", kind: "window", from: "start", offset: NO_TEXT, width: NO_TEXT, height: NO_TEXT, sill: NO_TEXT });
    expect(withNewFeature(emptyDraft("m"), "s2", "gap").sides.map((side) => side.features.map((item) => item.key))).toEqual([[], ["f1"], [], []]);
    expect(withNewFeature(draft, "s9", "door")).toEqual(draft);
  });

  it("adds a point of a collection of a layer, with no lengths and no fields", () => {
    const draft = withNewPoint(exampleDraft("m"), "s1", ELECTRICAL.layer, ELECTRICAL.outlets);
    expect(draft.sides[0]?.features.map((item) => item.key)).toEqual(["f1", "f4"]);
    expect(featureOf(draft, "f4")).toEqual(feature("f4", "outlet"));
    expect(isOutlet(featureOf(draft, "f4") ?? feature("f4", "door"))).toBe(true);
    expect(withNewPoint(draft, "s9", ELECTRICAL.layer, ELECTRICAL.outlets)).toEqual(draft);
    // The store knows no topic: a point of each layer has a place in it.
    const tap = featureOf(withNewPoint(emptyDraft("m"), "s2", "plumbing/1", "taps"), "f1");
    expect(tap?.point).toEqual({ layer: "plumbing/1", collection: "taps", values: {}, records: {}, points: {} });
  });

  it("removes only the feature with the key, and changes only the feature with the key", () => {
    const draft = exampleDraft("m");
    expect(withoutFeature(draft, "f2").sides.map((side) => side.features.map((item) => item.key))).toEqual([["f1"], [], ["f3"], []]);
    expect(withoutFeature(draft, "f9")).toEqual(draft);
    const changed = withFeature(draft, "f3", { from: "end", width: { value: "1.5", inches: "" } });
    expect(featureOf(changed, "f3")).toMatchObject({ key: "f3", kind: "window", from: "end", width: { value: "1.5", inches: "" }, sill: { value: "0.9", inches: "" } });
    expect(featureOf(changed, "f1")).toEqual(featureOf(draft, "f1"));
    expect(featureOf(draft, "f9")).toBeUndefined();
    expect(withFeature(draft, "f9", { from: "end" })).toEqual(draft);
  });

  it("removes the features of a wall with the wall", () => {
    expect(withoutSide(exampleDraft("m"), "s1").sides.flatMap((side) => side.features.map((item) => item.key))).toEqual(["f2", "f3"]);
  });
});

describe("the text of a length", () => {
  it("writes a length as a person says it", () => {
    expect(lengthText(147.5, "ft-in")).toBe("12 ft 3.5 in");
    expect(lengthText(144, "ft-in")).toBe("12 ft");
    expect(lengthText(6, "ft-in")).toBe("6 in");
    expect(lengthText(0, "ft-in")).toBe("0 in");
    expect(lengthText(147.5, "in")).toBe("147.5 in");
    expect(lengthText(3.74, "m")).toBe("3.74 m");
    expect(lengthText(374, "cm")).toBe("374 cm");
  });

  it("writes a length as a drawing shows it", () => {
    expect(dimensionText(147.5, "ft-in")).toBe("12′ 3.5″");
    expect(dimensionText(144, "ft-in")).toBe("12′");
    expect(dimensionText(6, "ft-in")).toBe("6″");
    expect(dimensionText(147.5, "in")).toBe("147.5″");
    expect(dimensionText(3.74, "m")).toBe("3.74 m");
    expect(dimensionText(374, "cm")).toBe("374 cm");
  });

  it("writes an area in square feet or in square meters", () => {
    expect(areaText(144 * 120, "ft-in")).toBe("120 ft²");
    expect(areaText(144 * 120, "in")).toBe("120 ft²");
    expect(areaText(10.8, "m")).toBe("10.8 m²");
    expect(areaText(360 * 300, "cm")).toBe("10.8 m²");
  });
});

describe("statusOf", () => {
  it("tells that the example room closes, in each mode", () => {
    for (const mode of LENGTH_MODES) expect(statusFor(exampleDraft(mode)), mode).toEqual({ level: "closed", title: "The room closes.", text: "The walk ends exactly at its start." });
  });

  it("asks for the first length that is missing", () => {
    expect(statusFor(emptyDraft("m"))).toMatchObject({ level: "typing", title: "Type the length of wall 1.", side: 0 });
    const third = withSide(exampleDraft("ft-in"), "s3", { length: { value: "", inches: "" } });
    expect(statusFor(third)).toMatchObject({ level: "typing", title: "Type the length of wall 3.", side: 2 });
  });

  it("tells a length that is not a number, and a length of 0", () => {
    const bad = withSide(exampleDraft("m"), "s2", { length: { value: "3 m", inches: "" } });
    expect(statusFor(bad)).toMatchObject({ level: "typing", title: "The length of wall 2 is not a number.", side: 1 });
    const zero = withSide(exampleDraft("ft-in"), "s1", { length: { value: "0", inches: "0" } });
    expect(statusFor(zero)).toMatchObject({ level: "typing", title: "The length of wall 1 is 0.", side: 0 });
  });

  it("asks for the angle of a measured corner", () => {
    const draft = withSide(exampleDraft("m"), "s1", { corner: "angle" });
    expect(statusFor(draft)).toMatchObject({ level: "typing", title: "Type the angle of the corner after wall 1.", side: 0 });
    expect(statusFor(withSide(draft, "s1", { angle: "400" })).level).toBe("typing");
    expect(statusFor(withSide(draft, "s1", { angle: "90" })).level).toBe("closed");
  });

  it("asks for a third wall", () => {
    const status = statusFor(room("m", [wall("3"), wall("3")]));
    expect(status).toEqual({ level: "typing", title: "A room has 3 walls or more.", text: "Add the next wall of your walk." });
  });

  it("closes a room with a small gap, and tells the gap", () => {
    const status = statusFor(room("m", [wall("3.6"), wall("3"), wall("3.6"), wall("3.02")]));
    expect(status).toEqual({
      level: "closed",
      title: "The room closes.",
      text: "The walk ends 0.02 m from its start. This is 0.2% of its length, so the page shares the gap between the walls.",
    });
  });

  it("tells a gap above the limit", () => {
    const status = statusFor(room("m", [wall("3.6"), wall("3"), wall("3.6"), wall("4")]));
    expect(status).toEqual({
      level: "open",
      title: "The walk ends 1 m from its start.",
      text: "This is 7% of its length, and the limit is 1%. A length is wrong, or a wall is missing.",
    });
  });

  it("tells a gap in feet and inches", () => {
    const draft = withSide(exampleDraft("ft-in"), "s4", { length: { value: "11", inches: "6" } });
    expect(statusFor(draft).title).toBe("The walk ends 1 ft 6 in from its start.");
  });

  it("tells a wrong turn before a gap", () => {
    const status = statusFor(withSide(exampleDraft("m"), "s2", { corner: "right" }));
    expect(status).toEqual({
      level: "open",
      title: "The corners do not make a full turn.",
      text: "They make a turn of 180 degrees, and a room needs 360. Examine the corner after each wall.",
    });
  });

  it("tells a measured angle with a large error as a wrong turn", () => {
    const status = statusFor(room("m", [wall("4"), wall("3", "angle", "120"), wall("5", "angle", "36.87")]));
    expect(status.level).toBe("open");
    expect(status.title).toBe("The corners do not make a full turn.");
    expect(status.text).toContain("a turn of 293.1 degrees");
  });

  it("shares a small error of the measured angles, and then examines the gap", () => {
    // The angles have 1 degree too many together. Each measured corner gets a half of the error.
    const status = statusFor(room("m", [wall("4"), wall("3", "angle", "53.63"), wall("5", "angle", "37.37")]));
    expect(status.level).toBe("closed");
  });

  it("tells the first fault of the features of a closed room", () => {
    const typing = onWall(BOX, 1, [feature("f1", "door")]);
    expect(statusFor(typing)).toEqual({ level: "closed", title: "The room closes.", text: "Type the distance from the corner of door 1 on wall 2.", side: 1, feature: "f1" });
    const place = onWall(onWall(BOX, 0, [feature("f7", "door", { offset: "3.5", width: "0.9" })]), 2, [feature("f8", "outlet")]);
    expect(statusFor(place)).toEqual({ level: "closed", title: "The room closes.", text: "Door 1 does not fit in wall 1.", side: 0, feature: "f7" });
  });

  it("uses the faults that it gets", () => {
    const draft = onWall(BOX, 0, [feature("f1", "door")]);
    expect(statusOf(draft, roomResult(roomSurvey(draft)), [])).toEqual({ level: "closed", title: "The room closes.", text: "The walk ends exactly at its start." });
  });

  it("tells a wall that needs a value, and an open walk, before a fault of a feature", () => {
    const door = [feature("f1", "door")];
    expect(statusFor(withSide(onWall(BOX, 0, door), "s3", { length: NO_TEXT }))).toMatchObject({ level: "typing", title: "Type the length of wall 3.", side: 2 });
    const open = statusFor(withSide(onWall(BOX, 0, door), "s3", { length: { value: "6", inches: "" } }));
    expect(open.level).toBe("open");
    expect(open.feature).toBeUndefined();
  });
});

describe("the store", () => {
  const store: Store = storeOf([exampleDraft("ft-in"), room("m", TRIANGLE)], 1);

  it("starts with no connection", () => {
    expect(store).toEqual({ version: 2, rooms: [exampleDraft("ft-in"), room("m", TRIANGLE)], connections: [], lists: [], active: 1 });
    expect(storeOf([BOX]).active).toBe(0);
  });

  it("reads its own text", () => {
    expect(parseStore(storeText(store))).toEqual(store);
  });

  it("refuses each text that is not a store of the page", () => {
    const first = exampleDraft("m");
    const twoKeys = { ...first, sides: [first.sides[0], first.sides[0]] };
    const texts: readonly (string | null)[] = [
      null,
      "",
      "not json",
      "null",
      "[]",
      JSON.stringify({ ...store, version: 3 }),
      JSON.stringify({ ...store, version: "2" }),
      JSON.stringify({ ...store, rooms: [] }),
      JSON.stringify({ ...store, active: 2 }),
      JSON.stringify({ ...store, active: 0.5 }),
      JSON.stringify({ ...store, active: "0" }),
      JSON.stringify({ ...store, rooms: [{ ...first, mode: "yd" }], active: 0 }),
      JSON.stringify({ ...store, rooms: [{ ...first, name: "n".repeat(81) }], active: 0 }),
      JSON.stringify({ ...store, rooms: [{ ...first, height: "2.4" }], active: 0 }),
      JSON.stringify({ ...store, rooms: [{ ...first, sides: "none" }], active: 0 }),
      JSON.stringify({ ...store, rooms: [{ ...first, sides: [{ ...first.sides[0], corner: "up" }] }], active: 0 }),
      JSON.stringify({ ...store, rooms: [twoKeys], active: 0 }),
    ];
    for (const text of texts) expect(parseStore(text), String(text)).toBeUndefined();
  });

  it("keeps only the fields of a draft", () => {
    const text = JSON.stringify({ ...store, rooms: [{ ...exampleDraft("m"), more: true }], active: 0, other: 1 });
    expect(parseStore(text)).toEqual(storeOf([exampleDraft("m")]));
  });

  it("keeps the features of each wall", () => {
    const draft = onWall(BOX, 0, [feature("f1", "door", { offset: "1", width: "1" }, "end"), feature("f2", "outlet", { offset: "3" })]);
    const withFeatures = storeOf([draft]);
    expect(parseStore(storeText(withFeatures))).toEqual(withFeatures);
  });

  it("reads a room from before the features: each of its walls has no feature", () => {
    const sides = BOX.sides.map((side) => ({ key: side.key, length: side.length, corner: side.corner, angle: side.angle }));
    expect(parseStore(JSON.stringify({ version: 1, rooms: [{ ...BOX, sides }], active: 0 }))).toEqual(storeOf([BOX]));
  });

  it("refuses a feature that is not a feature of the page, and two features with one key", () => {
    const door = feature("f1", "door", { offset: "1", width: "1" });
    const [first, second, ...others] = BOX.sides;
    /** This function gives a room whose first wall has a list of features. */
    const withFirst = (features: unknown): unknown => ({ ...BOX, sides: [{ ...first, features }, second, ...others] });
    const rooms: readonly unknown[] = [
      withFirst("none"),
      withFirst([null]),
      withFirst([{ ...door, kind: "stairs" }]),
      withFirst([{ ...door, from: "middle" }]),
      withFirst([{ ...door, width: "1" }]),
      withFirst([{ ...door, key: 1 }]),
      withFirst([door, door]),
      // Two walls have a feature with the same key.
      { ...BOX, sides: [{ ...first, features: [door] }, { ...second, features: [door] }, ...others] },
      withFirst(Array.from({ length: 101 }, (_, index) => ({ ...door, key: `f${String(index)}` }))),
    ];
    for (const version of [1, 2]) {
      for (const [index, item] of rooms.entries()) expect(parseStore(JSON.stringify({ version, rooms: [item], active: 0 })), `${String(version)} ${String(index)}`).toBeUndefined();
      expect(parseStore(JSON.stringify({ version, rooms: [withFirst([door])], active: 0 })), String(version)).toEqual(storeOf([onWall(BOX, 0, [door])]));
    }
  });

  it("refuses a point with no valid record, and removes the record of a feature that is not a point", () => {
    const point = feature("f1", "outlet", { offset: "1" });
    const door = feature("f2", "door", { offset: "2", width: "1" });
    const [first, ...others] = BOX.sides;
    const read = (features: unknown): Store | undefined => parseStore(JSON.stringify({ version: 2, rooms: [{ ...BOX, sides: [{ ...first, features }, ...others] }], active: 0 }));
    expect(read([point])).toEqual(storeOf([onWall(BOX, 0, [point])]));
    const bad: readonly unknown[] = [
      { ...point, point: undefined },
      { ...point, point: null },
      { ...point, point: { ...point.point, layer: "" } },
      { ...point, point: { ...point.point, collection: 7 } },
      { ...point, point: { ...point.point, values: null } },
      { ...point, point: { ...point.point, values: { size: 7 } } },
      { ...point, point: { ...point.point, records: Object.fromEntries([["__proto__", "r1"]]) } },
      { ...point, point: { layer: ELECTRICAL.layer, collection: ELECTRICAL.outlets, values: {}, records: {} } },
      { ...point, point: { ...point.point, values: { note: "n".repeat(81) } } },
      { ...point, point: { ...point.point, values: Object.fromEntries(Array.from({ length: 41 }, (_, index) => [`n${String(index)}`, "1"])) } },
    ];
    for (const [index, item] of bad.entries()) expect(read([item]), String(index)).toBeUndefined();
    expect(read([{ ...door, point: point.point }])).toEqual(storeOf([onWall(BOX, 0, [door])]));
  });
});

describe("the connections of a store", () => {
  const door = (key: string): DraftFeature => feature(key, "door", { offset: "1", width: "0.9" });
  const named = (name: string, features: readonly DraftFeature[]): Draft => ({ ...onWall(BOX, 0, features), name });
  // Room A has two doors and an outlet. Room B has a door and a window. Room C has one door.
  const A = named("A", [door("f1"), door("f2"), feature("f3", "outlet", { offset: "3.5" })]);
  const B = named("B", [door("f1"), feature("f2", "window", { offset: "2.5", width: "1" })]);
  const C = named("C", [door("f1")]);
  const end = (at: number, key: string): DraftEnd => ({ room: at, feature: key });
  const tie = (from: DraftEnd, to: DraftEnd): DraftConnection => ({ from, to });
  const base = storeOf([A, B, C]);
  const joined = withConnection(base, end(0, "f1"), end(1, "f1"));

  it("gives the door, the window or the opening at an end, and nothing for an outlet", () => {
    expect(featureAt(base.rooms, end(0, "f2"))).toEqual(door("f2"));
    expect(featureAt(base.rooms, end(1, "f2"))?.kind).toBe("window");
    expect(featureAt(base.rooms, end(0, "f3"))).toBeUndefined();
    expect(featureAt(base.rooms, end(0, "f9"))).toBeUndefined();
    expect(featureAt(base.rooms, end(3, "f1"))).toBeUndefined();
  });

  it("joins two features of two rooms, and gives each end from the other", () => {
    expect(joined.connections).toEqual([tie(end(0, "f1"), end(1, "f1"))]);
    expect(joined.rooms).toBe(base.rooms);
    expect(joinedTo(joined, end(0, "f1"))).toEqual(end(1, "f1"));
    expect(joinedTo(joined, end(1, "f1"))).toEqual(end(0, "f1"));
    expect(joinedTo(joined, end(0, "f2"))).toBeUndefined();
    expect(joinedTo(base, end(0, "f1"))).toBeUndefined();
  });

  it("removes the old connection of each of the two features", () => {
    expect(withConnection(joined, end(0, "f1"), end(2, "f1")).connections).toEqual([tie(end(0, "f1"), end(2, "f1"))]);
    expect(withConnection(joined, end(2, "f1"), end(1, "f1")).connections).toEqual([tie(end(2, "f1"), end(1, "f1"))]);
    const two = withConnection(joined, end(0, "f2"), end(2, "f1"));
    expect(two.connections).toHaveLength(2);
    expect(withConnection(two, end(0, "f1"), end(2, "f1")).connections).toEqual([tie(end(0, "f1"), end(2, "f1"))]);
  });

  it("removes the connection of a feature when it gets no other end", () => {
    expect(withConnection(joined, end(1, "f1")).connections).toEqual([]);
    expect(withConnection(joined, end(0, "f1")).connections).toEqual([]);
    expect(withConnection(joined, end(0, "f2"))).toBe(joined);
  });

  it("does not join a feature to its own room, to an outlet or to nothing", () => {
    const ends: readonly DraftEnd[] = [end(0, "f2"), end(0, "f3"), end(1, "f9"), end(5, "f1"), end(-1, "f1")];
    for (const to of ends) expect(withConnection(base, end(0, "f1"), to).connections, JSON.stringify(to)).toEqual([]);
    expect(withConnection(base, end(0, "f3"), end(1, "f1")).connections).toEqual([]);
    // A door can go to a window: the page gives the choices, and the store keeps each hole.
    expect(withConnection(base, end(0, "f1"), end(1, "f2")).connections).toHaveLength(1);
  });

  it("reads its own text", () => {
    const two = withConnection(joined, end(0, "f2"), end(2, "f1"));
    expect(parseStore(storeText(two))).toEqual(two);
  });

  it("reads a store with a connection that its rooms cannot have, without that connection", () => {
    const good = tie(end(0, "f1"), end(1, "f1"));
    const others: readonly unknown[] = [
      null,
      "f1",
      { from: end(0, "f1") },
      { from: end(0, "f2"), to: { room: "2", feature: "f1" } },
      { from: end(0, "f2"), to: { room: 0.5, feature: "f1" } },
      { from: end(0, "f2"), to: { room: 2, feature: 1 } },
      tie(end(0, "f2"), end(0, "f1")),
      tie(end(0, "f3"), end(2, "f1")),
      tie(end(0, "f2"), end(3, "f1")),
      tie(end(0, "f2"), end(2, "f9")),
      // The door of room B has a connection already.
      tie(end(2, "f1"), end(1, "f1")),
    ];
    for (const [index, other] of others.entries()) {
      const text = JSON.stringify({ ...base, connections: [good, other] });
      expect(parseStore(text), String(index)).toEqual(joined);
    }
    expect(parseStore(JSON.stringify({ ...base, connections: "none" }))).toEqual(base);
    expect(parseStore(JSON.stringify({ ...base, connections: [{ ...good, more: true }] }))).toEqual(joined);
  });

  it("replaces a room, and removes the connection of a feature that the new room does not have", () => {
    const wider = withFeature(A, "f1", { width: { value: "1", inches: "" } });
    const kept = withRoom(joined, 0, wider);
    expect(kept.rooms).toEqual([wider, B, C]);
    expect(kept.connections).toBe(joined.connections);
    expect(kept.active).toBe(0);
    expect(withRoom(joined, 0, withoutFeature(A, "f1")).connections).toEqual([]);
    expect(withRoom(joined, 2, emptyDraft("m")).connections).toBe(joined.connections);
    for (const position of [3, -1, 0.5]) expect(withRoom(joined, position, C), String(position)).toBe(joined);
  });

  it("removes a room with its connections, and moves the positions of the rooms after it", () => {
    const two = withConnection(joined, end(0, "f2"), end(2, "f1"));
    expect(withoutRoom(two, 1)).toEqual({ ...storeOf([A, C]), connections: [tie(end(0, "f2"), end(1, "f1"))] });
    expect(withoutRoom(two, 0)).toEqual(storeOf([B, C]));
    expect(withoutRoom(two, 2)).toEqual({ ...storeOf([A, B]), connections: [tie(end(0, "f1"), end(1, "f1"))] });
    expect(withoutRoom({ ...storeOf([A]), connections: [] }, 0).connections).toEqual([]);
  });

  it("adds rooms with the connections between them, and shows the first of them", () => {
    const next = withNewRooms(joined, [B, C], [tie(end(0, "f1"), end(1, "f1"))]);
    expect(next.rooms).toEqual([A, B, C, B, C]);
    expect(next.active).toBe(3);
    expect(next.connections).toEqual([tie(end(0, "f1"), end(1, "f1")), tie(end(3, "f1"), end(4, "f1"))]);
    // A connection that the new rooms cannot have does not go into the store.
    expect(withNewRooms(base, [B, C], [tie(end(0, "f1"), end(2, "f1"))]).connections).toEqual([]);
    expect(withNewRooms(joined, [], [])).toBe(joined);
  });

  it("puts new rooms in the place of the example room or of the only empty room", () => {
    const fresh = withNewRooms(storeOf([exampleDraft("ft-in")]), [A, B], [tie(end(0, "f1"), end(1, "f1"))]);
    expect(fresh).toEqual({ ...storeOf([A, B]), connections: [tie(end(0, "f1"), end(1, "f1"))] });
    expect(withNewRooms(storeOf([emptyDraft("m")]), [A, B], []).rooms).toHaveLength(3);
    expect(withNewRooms(storeOf([emptyDraft("m")]), [A, B], [], true)).toEqual(storeOf([A, B]));
  });

  it("does not add rooms to a store that cannot keep each of them", () => {
    const most = storeOf(Array.from({ length: MOST_ROOMS - 1 }, () => C));
    expect(withNewRooms(most, [A, B], [])).toBe(most);
    expect(withNewRooms(most, [A], []).rooms).toHaveLength(MOST_ROOMS);
  });
});

describe("draftKeys", () => {
  it("gives the feature of the draft for each opening of the survey, and no key for an outlet", () => {
    const features = [feature("a", "window", { offset: "2.5", width: "1" }), feature("b", "outlet", { offset: "2" }), feature("c", "door", { offset: "0.5", width: "0.9" })];
    const survey = roomSurvey(onWall(onWall(BOX, 0, features), 2, [feature("d", "door", { offset: "1", width: "0.9" })]));
    const { draft, keys } = readSurvey(survey);
    expect(draft).toEqual(roomDraft(survey));
    expect(draft.sides[0]?.features.map((item) => item.kind)).toEqual(["door", "point", "window"]);
    // The core function reads no record of an add-on, so its draft has no outlet.
    expect(draftKeys(survey).draft.sides[0]?.features.map((item) => item.kind)).toEqual(["door", "window"]);
    expect([...draftKeys(survey).keys.keys()].sort()).toEqual(["door-1", "door-2", "window-1"]);
    expect([...keys.keys()].sort()).toEqual(["door-1", "door-2", "window-1"]);
    const at = (id: string): DraftFeature | undefined => featureOf(draft, keys.get(id) ?? "");
    expect(at("window-1")).toMatchObject({ kind: "window", offset: { value: "2.5" } });
    expect(at("door-1")).toMatchObject({ kind: "door", offset: { value: "0.5" } });
    expect(at("door-2")).toMatchObject({ kind: "door", offset: { value: "1" } });
    expect(draft.sides[2]?.features.map((item) => item.key)).toEqual([keys.get("door-2")]);
  });

  it("gives the first of two openings with one name", () => {
    const first = SAMPLE_SURVEY.openings?.[0];
    if (first === undefined) throw new Error("the sample survey has no opening");
    const survey: Survey = { ...SAMPLE_SURVEY, openings: [first, { ...first, offset: first.offset + first.width }] };
    const { draft, keys } = draftKeys(survey);
    expect(keys.size).toBe(1);
    const key = keys.get(first.id) ?? "";
    const side = draft.sides.find((item) => item.features.some((entry) => entry.key === key));
    expect(side?.features[0]?.key).toBe(key);
  });
});

describe("nameWords", () => {
  it("gives the groups of letters and digits of a name in small letters", () => {
    expect(nameWords("Main Bedroom #2")).toEqual(["main", "bedroom", "2"]);
    expect(nameWords("Küche")).toEqual(["küche"]);
    expect(nameWords(" ../.. ")).toEqual([]);
    expect(nameWords("")).toEqual([]);
  });
});

describe("fileName", () => {
  it("makes a name from the letters and the digits of the name of the room", () => {
    expect(fileName({ ...exampleDraft("m"), name: "Main Bedroom #2" }, "survey")).toBe("main-bedroom-2.survey.json");
    expect(fileName({ ...exampleDraft("m"), name: "Küche" }, "scene")).toBe("küche.scene.json");
  });

  it("gives a usual name to a room with no name", () => {
    expect(fileName(exampleDraft("m"), "survey")).toBe("room.survey.json");
    expect(fileName({ ...exampleDraft("m"), name: "../.." }, "scene")).toBe("room.scene.json");
  });
});

describe("the rooms of a store", () => {
  const named = (name: string): Draft => ({ ...BOX, name });
  const names = (store: Store): string[] => store.rooms.map((item) => item.name);

  it("names a room by its name, or by its number", () => {
    expect(roomName(named("  Kitchen "), 0)).toBe("Kitchen");
    expect(roomName(named(" "), 2)).toBe("Room 3");
    expect(roomName(exampleDraft("m"), 0)).toBe("Room 1");
  });

  it("gives the state of a room from its status", () => {
    expect(roomState(statusFor(emptyDraft("m")))).toBe("typing");
    expect(roomState(statusFor(BOX))).toBe("closed");
    expect(roomState(statusFor(exampleDraft("ft-in")))).toBe("closed");
    expect(roomState(statusFor(withSide(BOX, "s3", { length: { value: "6", inches: "" } })))).toBe("open");
    // A feature that needs a number, and a feature with a wrong place.
    expect(roomState(statusFor(onWall(BOX, 0, [feature("f1", "door")])))).toBe("fault");
    expect(roomState(statusFor(onWall(BOX, 0, [feature("f1", "door", { offset: "3.5", width: "0.9" })])))).toBe("fault");
    // An open walk comes before a fault of a feature.
    expect(roomState(statusFor(withSide(onWall(BOX, 0, [feature("f1", "door")]), "s3", { length: { value: "6", inches: "" } })))).toBe("open");
  });

  it("adds a room after the rooms, and shows it", () => {
    const next = withNewRoom(storeOf([named("A"), named("B")], 0), named("C"));
    expect(names(next)).toEqual(["A", "B", "C"]);
    expect(next.active).toBe(2);
  });

  it("puts a new room in the place of the example room, which is not a room of the visitor", () => {
    expect(withNewRoom(storeOf([exampleDraft("ft-in")]), named("A"))).toEqual(storeOf([named("A")]));
    // The example room stays when the store has a room of the visitor too.
    expect(withNewRoom(storeOf([exampleDraft("m"), named("A")], 1), named("B"))).toEqual(storeOf([exampleDraft("m"), named("A"), named("B")], 2));
  });

  it("puts a room in the place of the only empty room only with overEmpty", () => {
    expect(withNewRoom(storeOf([emptyDraft("m")]), named("A"))).toEqual(storeOf([emptyDraft("m"), named("A")], 1));
    expect(withNewRoom(storeOf([emptyDraft("m")]), named("A"), true)).toEqual(storeOf([named("A")]));
    expect(names(withNewRoom(storeOf([named("A")]), named("B"), true))).toEqual(["A", "B"]);
    expect(names(withNewRoom(storeOf([emptyDraft("m"), named("A")]), named("B"), true))).toEqual(["", "A", "B"]);
  });

  it("does not add a room to a store with the largest number of rooms", () => {
    const full = storeOf(Array.from({ length: MOST_ROOMS }, (_, index) => named(String(index))), 4);
    expect(withNewRoom(full, named("more"))).toBe(full);
    expect(withNewRoom(full, named("more"), true)).toBe(full);
    // The page reads the largest store that it writes.
    expect(parseStore(storeText(full))).toEqual(full);
    const last = withNewRoom(storeOf(full.rooms.slice(1)), named("last"));
    expect(last.rooms).toHaveLength(MOST_ROOMS);
    expect(last.active).toBe(MOST_ROOMS - 1);
  });

  it("removes a room, and shows the room that follows or the last room", () => {
    const three = [named("A"), named("B"), named("C")];
    expect(withoutRoom(storeOf(three, 1), 1)).toEqual(storeOf([named("A"), named("C")], 1));
    expect(withoutRoom(storeOf(three, 2), 2)).toEqual(storeOf([named("A"), named("B")], 1));
    expect(withoutRoom(storeOf(three, 0), 0)).toEqual(storeOf([named("B"), named("C")], 0));
  });

  it("keeps the shown room when a different room goes away", () => {
    const three = [named("A"), named("B"), named("C")];
    expect(withoutRoom(storeOf(three, 2), 0)).toEqual(storeOf([named("B"), named("C")], 1));
    expect(withoutRoom(storeOf(three, 0), 2)).toEqual(storeOf([named("A"), named("B")], 0));
    expect(withoutRoom(storeOf(three, 1), 2)).toEqual(storeOf([named("A"), named("B")], 1));
  });

  it("makes the only room of a store empty, in the units of the room", () => {
    expect(withoutRoom(storeOf([exampleDraft("ft-in")]), 0)).toEqual(storeOf([emptyDraft("ft-in")]));
    expect(withoutRoom(storeOf([named("A")]), 0)).toEqual(storeOf([emptyDraft("m")]));
  });

  it("gives the same store for a position with no room, and for the shown room", () => {
    const store = storeOf([named("A"), named("B")], 1);
    for (const position of [2, -1, 0.5, Number.NaN]) {
      expect(withoutRoom(store, position), String(position)).toBe(store);
      expect(withActive(store, position), String(position)).toBe(store);
    }
    expect(withActive(store, 1)).toBe(store);
    expect(withActive(store, 0)).toEqual(storeOf([named("A"), named("B")], 0));
  });
});

/** The parts of an object of a test that are not lengths. `outlet` is the key of the outlet that gives power to the object. */
type ThingParts = Partial<Pick<DraftObject, "name" | "from" | "holds">> & { readonly outlet?: string };

/**
 * This function gives an object with one number for each length of a list. Each other length has no text.
 * An object with an `outlet` has one record of the electrical layer: its feed, which names the outlet.
 */
function thing(key: string, kind: string, lengths: Partial<Readonly<Record<ObjectField, string>>> = {}, parts: ThingParts = {}): DraftObject {
  const typed = (text: string | undefined): TypedLength => ({ value: text ?? "", inches: "" });
  const { outlet, ...more } = parts;
  return {
    key,
    kind,
    name: "",
    from: "start",
    offset: typed(lengths.offset),
    width: typed(lengths.width),
    depth: typed(lengths.depth),
    height: typed(lengths.height),
    gap: typed(lengths.gap),
    lift: typed(lengths.lift),
    owns: outlet === undefined || outlet === "" ? [] : [ownedOf(ELECTRICAL.layer, ELECTRICAL.feeds, { points: { [ELECTRICAL.outlet]: outlet } })],
    holds: [],
    ...more,
  };
}

/** This function gives the key of the outlet of an object of a draft. An object with no outlet gives the empty text. */
function powerOf(draft: Draft, key: string): string | undefined {
  const object = objectOf(draft, key);
  return object === undefined ? undefined : outletOf(object);
}

/** This function gives the key of the circuit of an outlet of a draft. An outlet with no circuit gives `none`. */
function circuitAt(draft: Draft | undefined, key: string): string | undefined {
  const outlet = draft === undefined ? undefined : featureOf(draft, key);
  return outlet === undefined ? undefined : (circuitOf(outlet) ?? "none");
}

/** This function gives a draft with the objects of a list against the wall at a position, from 0. */
function against(draft: Draft, index: number, objects: readonly DraftObject[]): Draft {
  return { ...draft, sides: draft.sides.map((side, at) => (at === index ? { ...side, objects } : side)) };
}

function objectFaultsFor(draft: Draft): readonly ObjectFault[] {
  return objectFaults(draft, roomResult(roomSurvey(draft)));
}

/** This function gives the example room of the page from before the furniture. */
function bare(mode: LengthMode): Draft {
  const example = exampleDraft(mode);
  return { ...example, sides: example.sides.map((side) => ({ ...side, objects: [] })) };
}

describe("the kinds of objects", () => {
  it("gives the words of a kind for a message", () => {
    expect(objectWords("desk")).toBe("desk");
    expect(objectWords("shelf")).toBe("shelves");
    expect(objectWords("other")).toBe("object");
    expect(objectWords("Floor lamp #2")).toBe("floor lamp 2");
    expect(objectWords(" ? ")).toBe("object");
  });

  it("gives the usual size of a kind in the unit of the mode", () => {
    expect(usualSize("desk", "width", "m")).toBe(1.5);
    expect(usualSize("desk", "depth", "cm")).toBe(75);
    expect(usualSize("desk", "width", "ft-in")).toBe(60);
    expect(usualSize("rack", "height", "in")).toBe(48);
    expect(usualSize("Floor lamp", "width", "m")).toBe(0.6);
    expect(usualSize("desk", "gap", "m")).toBe(0);
    expect(usualSize("desk", "offset", "m")).toBeUndefined();
    expect(usualSize("desk", "lift", "m")).toBeUndefined();
  });
});

describe("readObject", () => {
  it("gives the numbers of an object, with the usual size for a field with no text", () => {
    expect(readObject(thing("o1", "desk", { offset: "1" }), 4, "m")).toEqual({ state: "ok", numbers: { start: 1, width: 1.5, depth: 0.75, height: 0.75, gap: 0, lift: undefined } });
    const typed = thing("o1", "desk", { offset: "0", width: "2", depth: "1", height: "0.7", gap: "0.05", lift: "0.1" });
    expect(readObject(typed, 4, "m")).toEqual({ state: "ok", numbers: { start: 0, width: 2, depth: 1, height: 0.7, gap: 0.05, lift: 0.1 } });
  });

  it("measures from the far end of the wall, or of the holder", () => {
    expect(readObject(thing("o1", "desk", { offset: "0.5" }, { from: "end" }), 4, "m")).toMatchObject({ state: "ok", numbers: { start: 2 } });
    expect(readObject(thing("o1", "display", { offset: "0.1" }, { from: "end" }), 1.5, "m")).toMatchObject({ state: "ok", numbers: { start: 0.8 } });
  });

  it("tells the first field that needs a value", () => {
    expect(readObject(thing("o1", "desk"), 4, "m")).toEqual({ state: "empty", field: "offset" });
    expect(readObject(thing("o1", "desk", { offset: "1", width: "wide" }), 4, "m")).toEqual({ state: "bad", field: "width" });
    expect(readObject(thing("o1", "desk", { offset: "1", depth: "0" }), 4, "m")).toEqual({ state: "zero", field: "depth" });
    expect(readObject(thing("o1", "desk", { offset: "1", lift: "up" }), 4, "m")).toEqual({ state: "bad", field: "lift" });
  });
});

describe("the objects of a survey record", () => {
  const desk = thing("o1", "desk", { offset: "0.5" }, { name: " Standing desk ", holds: [thing("o2", "display", { offset: "0.2" }), thing("o3", "computer", { offset: "1", lift: "0" })] });
  const lamp = thing("o5", "Floor lamp", { offset: "0.2", width: "0.3", depth: "0.3", height: "1.6", gap: "0.1" });
  const draft = against(against(BOX, 0, [desk, thing("o4", "desk", { offset: "0.25" }, { from: "end" })]), 2, [lamp]);

  it("lists each object with its wall, its holder, its level and its name", () => {
    const listed = listedObjects(draft);
    expect(listed.map((item) => item.id)).toEqual(["desk-1", "display-1", "computer-1", "desk-2", "floor-lamp-1"]);
    expect(listed.map((item) => item.words)).toEqual(["desk 1", "display 1", "computer 1", "desk 2", "floor lamp 1"]);
    expect(listed.map((item) => item.level)).toEqual([1, 2, 2, 1, 1]);
    expect(listed.map((item) => item.side)).toEqual([0, 0, 0, 0, 2]);
    expect(listed.map((item) => item.holder?.id)).toEqual([undefined, "desk-1", "desk-1", undefined, undefined]);
    expect(listed.map((item) => item.base)).toEqual([4, 1.5, 1.5, 4, 4]);
    expect(listed.map((item) => item.ready)).toEqual([true, true, true, true, true]);
  });

  it("has each object against its wall, or on its holder", () => {
    expect(roomSurvey(draft).objects).toEqual([
      { id: "desk-1", kind: "desk", name: "Standing desk", wall: "wall-1", offset: 0.5, width: 1.5, depth: 0.75, height: 0.75 },
      { id: "display-1", kind: "display", on: "desk-1", offset: 0.2, width: 0.6, depth: 0.2, height: 0.45 },
      { id: "computer-1", kind: "computer", on: "desk-1", offset: 1, width: 0.2, depth: 0.45, height: 0.45, lift: 0 },
      { id: "desk-2", kind: "desk", wall: "wall-1", offset: 2.25, width: 1.5, depth: 0.75, height: 0.75 },
      { id: "floor-lamp-1", kind: "Floor lamp", wall: "wall-3", offset: 0.2, width: 0.3, depth: 0.3, height: 1.6, gap: 0.1 },
    ]);
  });

  it("gives a place in the room to each object", () => {
    const result = roomResult(roomSurvey(draft));
    expect(result.objects.map((item) => item.id)).toEqual(["desk-1", "display-1", "computer-1", "desk-2", "floor-lamp-1"]);
    expect(result.objects.map((item) => item.parent)).toEqual([undefined, "desk-1", "desk-1", undefined, undefined]);
    expect(objectFaultsFor(draft)).toEqual([]);
  });

  it("has no record of an object that needs a value, of an object on it, or of an object on a wall with no length", () => {
    const held = thing("o2", "display", { offset: "0.2" });
    expect(roomSurvey(against(BOX, 0, [thing("o1", "desk", {}, { holds: [held] })])).objects).toBeUndefined();
    const noWall = against(withSide(BOX, "s1", { length: NO_TEXT }), 0, [thing("o1", "desk", { offset: "1" }, { holds: [held] })]);
    expect(roomSurvey(noWall).objects).toBeUndefined();
    expect(listedObjects(noWall).map((item) => item.ready)).toEqual([false, false]);
  });

  it("keeps the number of an object when an object before it needs a value", () => {
    const two = against(BOX, 0, [thing("o1", "desk"), thing("o2", "desk", { offset: "2" })]);
    expect(roomSurvey(two).objects?.map((item) => item.id)).toEqual(["desk-2"]);
  });

  it("gives the feed of an object only when the record has its outlet", () => {
    const rack = thing("o1", "rack", { offset: "0.5" }, { outlet: "f1" });
    expect(wiring(roomSurvey(against(onWall(BOX, 1, [feature("f1", "outlet", { offset: "1" })]), 0, [rack])).layers)?.feeds).toEqual([{ id: "feed-rack-1", object: "rack-1", outlet: "outlet-1" }]);
    expect(roomSurvey(against(BOX, 0, [rack])).objects?.[0]).toEqual({ id: "rack-1", kind: "rack", wall: "wall-1", offset: 0.5, width: 0.6, depth: 0.9, height: 1.2 });
    // The feed needs its outlet, so a record with no outlet has no feed and no layer.
    expect(roomSurvey(against(BOX, 0, [rack]))).not.toHaveProperty("layers");
    // An outlet that needs a value is not in the record.
    expect(roomSurvey(against(onWall(BOX, 1, [feature("f1", "outlet")]), 0, [rack]))).not.toHaveProperty("layers");
    // A door is not an outlet.
    expect(roomSurvey(against(onWall(BOX, 1, [feature("f1", "door", { offset: "1", width: "0.9" })]), 0, [rack]))).not.toHaveProperty("layers");
  });
});

describe("the objects of the draft of a survey record", () => {
  const sizes = { offset: 0, width: 0.5, depth: 0.5, height: 0.5 };

  it("reads the objects of its own record", () => {
    // A record in inches gives a draft in feet and inches.
    for (const mode of LENGTH_MODES.filter((item) => item !== "in")) expect(roomDraft(roomSurvey(exampleDraft(mode))), mode).toEqual(exampleDraft(mode));
    expect(roomDraft(roomSurvey(exampleDraft("in")))).toEqual(exampleDraft("ft-in"));
  });

  it("sorts the objects of a wall by their distance, and gives each object its holder and its outlet", () => {
    const base = roomSurvey(onWall(BOX, 1, [feature("f1", "outlet", { offset: "1" })]));
    const survey: Survey = {
      ...base,
      layers: { [ELECTRICAL.layer]: { schema: ELECTRICAL.layer, outlets: wiring(base.layers)?.outlets, feeds: [{ id: "feed-a", object: "a", outlet: "outlet-1" }] } },
      objects: [
        { id: "b", kind: " Lamp ", wall: "wall-1", offset: 2, width: 0.3, depth: 0.3, height: 1.6, lift: 0 },
        { id: "a", kind: "desk", name: " Standing desk ", wall: "wall-1", offset: 0.5, width: 1.5, depth: 0.75, height: 0.75, gap: 0.05 },
        { id: "c", kind: "display", on: "a", offset: 0.2, width: 0.6, depth: 0.2, height: 0.45 },
        { id: "d", kind: "", wall: "wall-3", offset: 0, width: 0, depth: 1, height: 1 },
      ],
    };
    const draft = roomDraft(survey);
    expect(draft.sides.map((side) => side.objects.map((item) => `${item.key} ${item.kind}`))).toEqual([["o1 desk", "o3 Lamp"], [], ["o4 other"], []]);
    expect(objectOf(draft, "o1")).toMatchObject({ name: "Standing desk", from: "start", offset: { value: "0.5" }, gap: { value: "0.05" }, lift: NO_TEXT });
    expect(powerOf(draft, "o1")).toBe("f1");
    expect(objectOf(draft, "o1")?.holds.map((item) => `${item.key} ${item.kind}`)).toEqual(["o2 display"]);
    expect(objectOf(draft, "o3")).toMatchObject({ gap: NO_TEXT, lift: { value: "0" }, owns: [] });
    expect(powerOf(draft, "o3")).toBe("");
    // A size of 0 stays as text, so the page tells the fault.
    expect(objectOf(draft, "o4")).toMatchObject({ offset: { value: "0" }, width: { value: "0" } });
    expect(readSurvey(survey).more).toBe(false);
  });

  it("keeps the first object of a name, and no object that the room cannot have", () => {
    const base = roomSurvey(BOX);
    const survey: Survey = {
      ...base,
      objects: [
        { id: "a", kind: "desk", wall: "wall-1", ...sizes },
        { id: "a", kind: "sofa", wall: "wall-2", ...sizes },
        { id: "b", kind: "rack", wall: "hall", ...sizes },
        { id: "c", kind: "display", on: "b", ...sizes },
        { id: "d", kind: "chair", on: "e", ...sizes },
        { id: "e", kind: "chair", on: "d", ...sizes },
        { id: "f", kind: "bed", ...sizes },
      ],
    };
    expect(roomDraft(survey).sides.map((side) => side.objects.map((item) => item.kind))).toEqual([["desk"], [], [], []]);
    expect(readSurvey(survey).more).toBe(true);
  });

  it("keeps the objects down to the last level", () => {
    const ids = ["a", "b", "c", "d", "e"];
    const objects = ids.map((id, index) => ({ id, kind: "shelf", ...(index === 0 ? { wall: "wall-1" } : { on: ids[index - 1] ?? "" }), ...sizes }));
    const survey: Survey = { ...surveyOf(BOX), objects };
    expect(listedObjects(roomDraft(survey)).map((item) => item.level)).toEqual(Array.from({ length: MOST_LEVELS }, (_, index) => index + 1));
    expect(readSurvey(survey).more).toBe(true);
    expect(readSurvey({ ...survey, objects: objects.slice(0, MOST_LEVELS) }).more).toBe(false);
  });

  it("tells the data of an object that a draft does not keep", () => {
    const base = roomSurvey(exampleDraft("m"));
    const objects = base.objects ?? [];
    expect(objects).toHaveLength(3);
    const layer = wiring(base.layers);
    expect(layer?.feeds).toHaveLength(1);
    /** This function gives the record with new collections in its electrical layer. */
    const withLayer = (next: Readonly<Record<string, unknown>>): Survey => ({ ...base, layers: { [ELECTRICAL.layer]: { ...layer, ...next } } });
    const more: readonly Survey[] = [
      withLayer({ feeds: [...(layer?.feeds ?? []), { id: "feed-desk-1", object: "desk-1", outlet: "outlet-9" }] }),
      { ...base, objects: objects.map((item) => ({ ...item, gap: -0.1 })) },
      { ...base, objects: objects.map((item) => ({ ...item, lift: -0.1 })) },
      // The outlet of the rack is on a wall that the survey does not have.
      withLayer({ outlets: (layer?.outlets ?? []).map((item) => ({ ...item, anchor: { on: "wall", wall: "hall", face: "left", offset: 1, height: 0.3 } })) }),
    ];
    for (const [index, item] of more.entries()) expect(readSurvey(item).more, String(index)).toBe(true);
  });

  it("keeps 80 characters of a name", () => {
    const long = "n".repeat(100);
    const survey: Survey = { ...surveyOf(BOX), name: long, objects: [{ id: "a", kind: long, name: long, wall: "wall-1", ...sizes }] };
    const draft = roomDraft(survey);
    expect(draft.name).toHaveLength(80);
    expect(objectOf(draft, "o1")?.kind).toHaveLength(80);
    expect(objectOf(draft, "o1")?.name).toHaveLength(80);
    expect(parseStore(storeText(storeOf([draft])))).toEqual(storeOf([draft]));
  });
});

describe("the example room with furniture", () => {
  it("has a rack at the outlet, and a desk with a display", () => {
    for (const mode of LENGTH_MODES) {
      const example = exampleDraft(mode);
      expect(example.sides.map((side) => side.objects.map((item) => `${item.key} ${item.kind}`)), mode).toEqual([[], ["o1 rack"], ["o2 desk"], []]);
      expect(powerOf(example, "o1"), mode).toBe("f2");
      expect(objectOf(example, "o2")?.owns, mode).toEqual([]);
      expect(objectOf(example, "o2")?.holds.map((item) => `${item.key} ${item.kind}`), mode).toEqual(["o3 display"]);
      expect(objectFaultsFor(example), mode).toEqual([]);
      expect(roomResult(roomSurvey(example)).objects, mode).toHaveLength(3);
    }
  });

  it("is the example with its furniture or with no furniture, and no other room", () => {
    for (const mode of LENGTH_MODES) {
      expect(isExample(exampleDraft(mode)), mode).toBe(true);
      expect(isExample(bare(mode)), mode).toBe(true);
      expect(isExample(emptyDraft(mode)), mode).toBe(false);
      expect(isExample(withObject(exampleDraft(mode), "o1", { name: "Rack" })), mode).toBe(false);
      expect(isExample(withoutObject(exampleDraft(mode), "o3")), mode).toBe(false);
      expect(isExample({ ...bare(mode), name: "Office" }), mode).toBe(false);
    }
  });

  it("replaces the example of the page from before the furniture", () => {
    // The old store has an outlet as a kind of feature, and its walls have no list of objects.
    const sides = bare("m").sides.map(({ key, length, corner, angle, features }) => ({
      key,
      length,
      corner,
      angle,
      features: features.map(({ point, ...rest }) => (point === undefined ? rest : { ...rest, kind: "outlet" })),
    }));
    expect(sides.flatMap((side) => side.features.map((item) => item.kind))).toEqual(["door", "outlet", "window"]);
    const old = parseStore(JSON.stringify({ version: 1, rooms: [{ ...bare("m"), sides }], active: 0 }));
    if (old === undefined) throw new Error("the page does not read the old store");
    expect(old).toEqual(storeOf([bare("m")]));
    expect(withExample(old)).toEqual(storeOf([exampleDraft("m")]));
  });

  it("keeps each other store", () => {
    const stores: readonly Store[] = [storeOf([exampleDraft("m")]), storeOf([{ ...bare("m"), name: "Office" }]), storeOf([bare("m"), bare("m")]), storeOf([emptyDraft("m")])];
    for (const [index, store] of stores.entries()) expect(withExample(store), String(index)).toBe(store);
  });

  it("gets a new room in its place, with or without its furniture", () => {
    expect(withNewRoom(storeOf([exampleDraft("m")]), BOX).rooms).toEqual([BOX]);
    expect(withNewRoom(storeOf([bare("m")]), BOX).rooms).toEqual([BOX]);
  });
});

describe("the changes of the objects of a draft", () => {
  it("adds an object with no lengths against a wall, with a key that no object has", () => {
    const one = withNewObject(BOX, { side: "s2" }, "desk");
    expect(one.sides[1]?.objects).toEqual([thing("o1", "desk")]);
    const two = withNewObject(one, { side: "s2" }, "rack");
    expect(two.sides[1]?.objects.map((item) => `${item.key} ${item.kind}`)).toEqual(["o1 desk", "o2 rack"]);
    expect(withNewObject(withoutObject(two, "o1"), { side: "s1" }, "desk").sides[0]?.objects[0]?.key).toBe("o3");
    expect(withNewObject(BOX, { side: "none" }, "desk")).toEqual(BOX);
  });

  it("adds an object on an object, down to the last level", () => {
    let draft = withNewObject(BOX, { side: "s1" }, "shelf");
    for (let level = 1; level < MOST_LEVELS; level += 1) draft = withNewObject(draft, { holder: `o${String(level)}` }, "other");
    expect(listedObjects(draft).map((item) => `${item.object.key} ${String(item.level)}`)).toEqual(Array.from({ length: MOST_LEVELS }, (_, index) => `o${String(index + 1)} ${String(index + 1)}`));
    expect(withNewObject(draft, { holder: `o${String(MOST_LEVELS)}` }, "other")).toBe(draft);
    expect(withNewObject(draft, { holder: "o99" }, "other")).toBe(draft);
  });

  it("does not add an object to a room with the largest number of objects", () => {
    let draft = BOX;
    for (let count = 0; count < 200; count += 1) draft = withNewObject(draft, { side: count % 2 === 0 ? "s1" : "s3" }, "chair");
    expect(draft.sides.flatMap((side) => side.objects)).toHaveLength(200);
    expect(withNewObject(draft, { side: "s1" }, "chair")).toBe(draft);
    expect(withNewObject(draft, { holder: "o1" }, "chair")).toBe(draft);
    expect(parseStore(storeText(storeOf([draft])))).toEqual(storeOf([draft]));
  });

  it("changes and removes an object at each level", () => {
    const draft = against(BOX, 0, [thing("o1", "desk", { offset: "1" }, { holds: [thing("o2", "display", { offset: "0.2" })] })]);
    const named = withObject(draft, "o2", { name: "Left display", from: "end" });
    expect(objectOf(named, "o2")).toMatchObject({ name: "Left display", from: "end", offset: { value: "0.2" } });
    expect(objectOf(named, "o1")).toMatchObject({ kind: "desk", offset: { value: "1" } });
    expect(withObject(draft, "o9", { name: "x" })).toBe(draft);
    expect(objectOf(withoutObject(draft, "o2"), "o1")?.holds).toEqual([]);
    expect(withoutObject(draft, "o1").sides[0]?.objects).toEqual([]);
    expect(objectOf(withoutObject(draft, "o1"), "o2")).toBeUndefined();
    expect(withoutObject(draft, "o9")).toBe(draft);
  });

  it("removes the outlet of an object with its feature, and with the wall of its feature", () => {
    const outlets = [feature("f1", "outlet", { offset: "1" }), feature("f2", "outlet", { offset: "2" })];
    const draft = against(onWall(BOX, 1, outlets), 0, [thing("o1", "rack", { offset: "0.5" }, { outlet: "f1", holds: [thing("o2", "computer", { offset: "0.1" }, { outlet: "f2" })] })]);
    const less = withoutFeature(draft, "f2");
    expect(powerOf(less, "o1")).toBe("f1");
    expect(powerOf(less, "o2")).toBe("");
    // The feed of the computer had only the name of its outlet, so the feed goes away with the outlet.
    expect(objectOf(less, "o2")?.owns).toEqual([]);
    const none = withoutSide(draft, "s2");
    expect(powerOf(none, "o1")).toBe("");
    expect(powerOf(none, "o2")).toBe("");
    expect(listedObjects(none).map((item) => item.object.owns)).toEqual([[], []]);
    expect(withoutSide(draft, "s1").sides.flatMap((side) => side.objects)).toEqual([]);
  });

  it("gives an object its outlet, and removes the feed with its last field", () => {
    const draft = against(onWall(BOX, 1, [feature("f1", "outlet", { offset: "1" })]), 0, [thing("o1", "rack", { offset: "0.5" })]);
    const fed = withObjectOutlet(draft, "o1", "f1");
    expect(objectOf(fed, "o1")).toEqual(thing("o1", "rack", { offset: "0.5" }, { outlet: "f1" }));
    expect(withObjectOutlet(fed, "o1", "f1")).toBe(fed);
    expect(withObjectOutlet(fed, "o1", "")).toEqual(draft);
    expect(withObjectOutlet(draft, "o9", "f1")).toBe(draft);
    // A feed with a second field stays when it loses its outlet.
    const watts = withOwned(fed, "o1", ELECTRICAL.layer, ELECTRICAL.feeds, { values: { watts: "300" } });
    const feed = ownedBy(objectOf(withObjectOutlet(watts, "o1", ""), "o1") ?? thing("o1", "rack"), ELECTRICAL.layer, ELECTRICAL.feeds);
    expect(feed).toEqual(ownedOf(ELECTRICAL.layer, ELECTRICAL.feeds, { values: { watts: "300" } }));
    expect(objectOf(withoutFeature(watts, "f1"), "o1")?.owns).toEqual([feed]);
  });

  it("keeps each length of an object in a different mode", () => {
    const draft = against(BOX, 0, [thing("o1", "desk", { offset: "1", width: "1.5" }, { holds: [thing("o2", "display", { offset: "0.25", lift: "0.1" })] })]);
    const inches = withMode(draft, "in");
    expect(objectOf(inches, "o1")).toMatchObject({ offset: { value: "39.37" }, width: { value: "59.06" }, depth: NO_TEXT });
    expect(objectOf(inches, "o2")).toMatchObject({ offset: { value: "9.84" }, lift: { value: "3.94" } });
  });
});

describe("the objects of a store", () => {
  const desk = thing("o1", "desk", { offset: "1" });
  const [first, second, ...others] = BOX.sides;
  /** This function gives a room whose first wall has a list of objects. */
  const withFirst = (objects: unknown): unknown => ({ ...BOX, sides: [{ ...first, objects }, second, ...others] });
  /** This function gives an object with a number of levels of objects on it. */
  const stack = (levels: number, from = 1): DraftObject => thing(`o${String(from)}`, "other", { offset: "0" }, levels > 1 ? { holds: [stack(levels - 1, from + 1)] } : {});
  /** This function gives a number of objects with keys from a number. */
  const many = (from: number, count: number): DraftObject[] => Array.from({ length: count }, (_, index) => ({ ...desk, key: `o${String(from + index)}` }));
  const read = (item: unknown): Store | undefined => parseStore(JSON.stringify({ version: 2, rooms: [item], active: 0 }));

  it("reads its own text with the objects of each level", () => {
    const store = storeOf([against(BOX, 0, [thing("o1", "desk", { offset: "1" }, { name: "Desk", holds: [thing("o2", "display", { offset: "0.2" }, { from: "end" })] })])]);
    expect(parseStore(storeText(store))).toEqual(store);
    expect(parseStore(storeText(storeOf([exampleDraft("ft-in")])))).toEqual(storeOf([exampleDraft("ft-in")]));
  });

  it("removes an outlet that the room does not have", () => {
    const rack = thing("o1", "rack", { offset: "0.5" }, { outlet: "f9" });
    // The feed has only the name of its outlet, so the feed goes away with the name.
    expect(read(against(BOX, 0, [rack]))).toEqual(storeOf([against(BOX, 0, [thing("o1", "rack", { offset: "0.5" })])]));
    // A door is not a point.
    const door = against(onWall(BOX, 1, [feature("f9", "door", { offset: "1", width: "0.9" })]), 0, [rack]);
    expect(read(door)?.rooms[0]?.sides[0]?.objects[0]?.owns).toEqual([]);
    const outlet = against(onWall(BOX, 1, [feature("f9", "outlet", { offset: "1" })]), 0, [rack]);
    expect(read(outlet)).toEqual(storeOf([outlet]));
    // A point of a different layer is not a point of the layer of the feed.
    const tap: DraftFeature = { ...feature("f9", "outlet", { offset: "1" }), point: ownedOf("plumbing/1", "taps") };
    expect(read(against(onWall(BOX, 1, [tap]), 0, [rack]))?.rooms[0]?.sides[0]?.objects[0]?.owns).toEqual([]);
  });

  it("keeps a record of an object as given: a record with no field stays, and a field with no form stays", () => {
    const empty = ownedOf(ELECTRICAL.layer, ELECTRICAL.feeds);
    const other = ownedOf("plumbing/1", "drains", { values: { size: "40 mm" }, records: { stack: "r7" } });
    const desk2: DraftObject = { ...desk, owns: [empty, other] };
    const store = read(withFirst([desk2]));
    expect(store?.rooms[0]?.sides[0]?.objects[0]?.owns).toEqual([empty, ownedOf("plumbing/1", "drains", { values: { size: "40 mm" } })]);
    // The store has no list with the record `r7`, so its name goes away. The value stays.
    expect(storeText(store ?? storeOf([BOX]))).toContain("40 mm");
    expect(storeText(store ?? storeOf([BOX]))).not.toContain("r7");
  });

  it("refuses an object that is not an object of the page", () => {
    const rooms: readonly unknown[] = [
      withFirst("none"),
      withFirst([null]),
      withFirst([{ ...desk, from: "middle" }]),
      withFirst([{ ...desk, width: "1" }]),
      withFirst([{ ...desk, key: 1 }]),
      withFirst([{ ...desk, kind: "k".repeat(81) }]),
      withFirst([{ ...desk, name: 5 }]),
      withFirst([{ ...desk, owns: null }]),
      withFirst([{ ...desk, owns: undefined }]),
      withFirst([{ ...desk, owns: [null] }]),
      withFirst([{ ...desk, owns: [{ layer: ELECTRICAL.layer, collection: ELECTRICAL.feeds }] }]),
      withFirst([{ ...desk, owns: Array.from({ length: 21 }, () => ownedOf(ELECTRICAL.layer, ELECTRICAL.feeds)) }]),
      withFirst([{ ...desk, holds: "none" }]),
      withFirst([{ ...desk, holds: [{ ...desk, key: "o2", lift: 0 }] }]),
      withFirst([desk, desk]),
      // An object has the key of the object that holds it.
      withFirst([{ ...desk, holds: [desk] }]),
      // Two walls have an object with the same key.
      { ...BOX, sides: [{ ...first, objects: [desk] }, { ...second, objects: [desk] }, ...others] },
      withFirst([stack(MOST_LEVELS + 1)]),
      withFirst(many(0, 201)),
      // Each wall has a permitted number of objects, and the room has too many.
      { ...BOX, sides: [{ ...first, objects: many(0, 150) }, { ...second, objects: many(150, 51) }, ...others] },
    ];
    for (const [index, item] of rooms.entries()) expect(read(item), String(index)).toBeUndefined();
    expect(read(withFirst([stack(MOST_LEVELS)]))).toEqual(storeOf([against(BOX, 0, [stack(MOST_LEVELS)])]));
    expect(read({ ...BOX, sides: [{ ...first, objects: many(0, 150) }, { ...second, objects: many(150, 50) }, ...others] })?.rooms[0]?.sides[1]?.objects).toHaveLength(50);
  });
});

describe("objectFaults", () => {
  it("asks for the first field of an object that needs a value", () => {
    expect(objectFaultsFor(against(BOX, 0, [thing("o1", "desk")]))).toEqual([
      { side: 0, key: "o1", id: "desk-1", level: "typing", field: "offset", text: "Type the distance from the corner of desk 1 on wall 1.", note: "Type its distance from the corner." },
    ]);
    expect(objectFaultsFor(against(BOX, 1, [thing("o1", "rack", { offset: "1", width: "wide" })]))[0]).toMatchObject({
      side: 1,
      level: "typing",
      field: "width",
      text: "The width of rack 1 on wall 2 is not a number.",
      note: "Its width is not a number.",
    });
    expect(objectFaultsFor(against(BOX, 0, [thing("o1", "desk", { offset: "1", depth: "0" })]))[0]).toMatchObject({ field: "depth", text: "The depth of desk 1 on wall 1 is 0.", note: "Its depth is 0." });
    expect(objectFaultsFor(against(BOX, 0, [thing("o1", "desk", { offset: "1", gap: "far" })]))[0]).toMatchObject({ field: "gap", text: "The distance from the wall of desk 1 on wall 1 is not a number." });
    expect(objectFaultsFor(against(BOX, 0, [thing("o1", "desk", { offset: "1", lift: "up" })]))[0]).toMatchObject({ field: "lift", text: "The height of the bottom of desk 1 on wall 1 is not a number." });
  });

  it("uses the words of an object on a holder", () => {
    const faults = objectFaultsFor(against(BOX, 0, [thing("o1", "desk", { offset: "1" }, { holds: [thing("o2", "display"), thing("o3", "display", { offset: "1", gap: "back" })] })]));
    expect(faults).toHaveLength(2);
    expect(faults[0]).toMatchObject({ side: 0, key: "o2", id: "display-1", field: "offset", text: "Type the distance from the edge of display 1 on desk 1.", note: "Type its distance from the edge." });
    expect(faults[1]).toMatchObject({ side: 0, key: "o3", id: "display-2", field: "gap", text: "The distance from the back of display 2 on desk 1 is not a number." });
  });

  it("tells an object that is not in the room", () => {
    expect(objectFaultsFor(against(BOX, 0, [thing("o1", "desk", { offset: "5" })]))).toEqual([
      { side: 0, key: "o1", id: "desk-1", level: "warning", text: "Desk 1 on wall 1 is not in the room.", note: "It is not in the room. Examine its distances." },
    ]);
  });

  it("tells an object in the space of a wall", () => {
    expect(objectFaultsFor(against(BOX, 0, [thing("o1", "desk", { offset: "3" })]))).toEqual([
      { side: 0, key: "o1", id: "desk-1", level: "warning", text: "Desk 1 on wall 1 is in the space of wall 2.", note: "It is in the space of wall 2." },
    ]);
  });

  it("tells each of two objects that share a space, and not a holder with the object on it", () => {
    const draft = against(BOX, 0, [thing("o1", "desk", { offset: "1" }, { holds: [thing("o2", "display", { offset: "0.2" })] }), thing("o3", "cabinet", { offset: "2" })]);
    expect(objectFaultsFor(draft).map((fault) => `${fault.key} ${fault.level}: ${fault.text}`)).toEqual([
      "o1 warning: Desk 1 on wall 1 is in the space of cabinet 1.",
      "o3 warning: Cabinet 1 on wall 1 is in the space of desk 1.",
    ]);
    expect(objectFaultsFor(draft).map((fault) => fault.note)).toEqual(["It is in the space of cabinet 1.", "It is in the space of desk 1."]);
  });

  it("gives no fault of its place to an object in a room that does not close, or on a wall with no length", () => {
    const open = against(room("m", [wall("4"), wall("3"), wall("4"), wall("1")]), 0, [thing("o1", "desk", { offset: "9" })]);
    expect(objectFaultsFor(open)).toEqual([]);
    const noWall = against(withSide(BOX, "s1", { length: NO_TEXT }), 0, [thing("o1", "desk", { offset: "9" }, { holds: [thing("o2", "display", { offset: "9" })] })]);
    expect(objectFaultsFor(noWall)).toEqual([]);
  });
});

describe("the status of a room with objects", () => {
  const outside = against(BOX, 0, [thing("o1", "desk", { offset: "5" })]);

  it("tells the first fault of the objects of a closed room", () => {
    expect(statusFor(outside)).toEqual({ level: "closed", title: "The room closes.", text: "Desk 1 on wall 1 is not in the room.", side: 0, object: "o1" });
    expect(hasFault(statusFor(outside))).toBe(true);
    expect(roomState(statusFor(outside))).toBe("fault");
    expect(hasFault(statusFor(BOX))).toBe(false);
    const typing = against(BOX, 2, [thing("o1", "sofa")]);
    expect(statusFor(typing)).toEqual({ level: "closed", title: "The room closes.", text: "Type the distance from the corner of sofa 1 on wall 3.", side: 2, object: "o1" });
  });

  it("tells a fault of a feature before a fault of an object", () => {
    const both = onWall(outside, 1, [feature("f1", "door")]);
    expect(statusFor(both)).toMatchObject({ side: 1, feature: "f1" });
    expect(statusFor(both).object).toBeUndefined();
  });

  it("uses the faults that it gets", () => {
    expect(statusOf(outside, roomResult(roomSurvey(outside)), [], [])).toEqual({ level: "closed", title: "The room closes.", text: "The walk ends exactly at its start." });
  });

  it("tells a wall that needs a value before a fault of an object", () => {
    expect(statusFor(withSide(outside, "s2", { length: NO_TEXT }))).toMatchObject({ level: "typing", side: 1 });
  });
});

describe("objectMarks", () => {
  it("gives each object of the record with the level of the fault of its place", () => {
    const draft = against(BOX, 0, [thing("o1", "desk", { offset: "0.2" }, { holds: [thing("o2", "display", { offset: "0.2" })] }), thing("o3", "cabinet", { offset: "5" }), thing("o4", "chair")]);
    expect(objectMarks(draft, objectFaultsFor(draft))).toEqual([
      { side: 0, key: "o1", id: "desk-1", kind: "desk", level: 1, fault: undefined },
      { side: 0, key: "o2", id: "display-1", kind: "display", level: 2, fault: undefined },
      { side: 0, key: "o3", id: "cabinet-1", kind: "cabinet", level: 1, fault: "warning" },
    ]);
  });
});

describe("the circuits of a store", () => {
  const circuit = (key: string, name = ""): DraftCircuit => ({ key, name, breaker: "", voltage: "" });
  const outlet = (key: string, offset: string): DraftFeature => feature(key, "outlet", { offset });
  /** Room A has two outlets on circuit `c1`. Room B has one outlet on circuit `c1` and a door. */
  const A = withOutletCircuit(withOutletCircuit(onWall(BOX, 0, [outlet("f1", "1"), outlet("f2", "2")]), "f1", "c1"), "f2", "c1");
  const B = withOutletCircuit(onWall(BOX, 1, [outlet("f1", "1"), feature("f2", "door", { offset: "2", width: "0.9" })]), "f1", "c1");
  const store: Store = { ...storeOf([A, B]), lists: circuitLists([circuit("c1", "Kitchen"), circuit("c2")]) };
  const full: Store = { ...storeOf([BOX]), lists: circuitLists(Array.from({ length: MOST_RECORDS }, (_, index) => circuit(`c${String(index + 1)}`))) };

  it("adds a circuit with a key that no record of the store has", () => {
    const one = withNewCircuit(storeOf([BOX]));
    expect(circuitsOf(one)).toEqual([circuit("r1")]);
    const two = withNewCircuit(one);
    expect(circuitsOf(two).map((item) => item.key)).toEqual(["r1", "r2"]);
    expect(circuitsOf(withNewCircuit(withoutCircuit(two, "r1"))).map((item) => item.key)).toEqual(["r2", "r3"]);
    // The keys of an old store stay, and a new key comes after the largest number.
    expect(circuitsOf(withNewCircuit(store)).map((item) => item.key)).toEqual(["c1", "c2", "r3"]);
    expect(withNewCircuit(full)).toBe(full);
  });

  it("gives the circuits as the records of one list, and no circuit gives no list", () => {
    expect(circuitLists([])).toEqual([]);
    expect(storeOf([BOX]).lists).toEqual([]);
    expect(circuitsOf(storeOf([BOX]))).toEqual([]);
    expect(store.lists).toEqual([{ layer: ELECTRICAL.layer, collection: ELECTRICAL.circuits, records: [recordOf("c1", { values: { name: "Kitchen" } }), recordOf("c2")] }]);
    expect(circuitsOf(store)).toEqual([circuit("c1", "Kitchen"), circuit("c2")]);
  });

  it("changes the fields of one circuit", () => {
    expect(circuitsOf(withCircuit(store, "c2", { name: "Hall", breaker: "20" }))).toEqual([circuit("c1", "Kitchen"), { key: "c2", name: "Hall", breaker: "20", voltage: "" }]);
    // An empty text removes the field of the record.
    expect(listRecords(withCircuit(store, "c1", { name: "" }), ELECTRICAL.layer, ELECTRICAL.circuits)[0]).toEqual(recordOf("c1"));
    // A store with no change stays the same store.
    expect(withCircuit(store, "c1", { name: "Kitchen" })).toBe(store);
    expect(withCircuit(store, "c9", { name: "Hall" })).toBe(store);
  });

  it("gives a circuit only to an outlet, and the empty key removes it", () => {
    expect(circuitAt(A, "f1")).toBe("c1");
    expect(circuitAt(withOutletCircuit(A, "f1", ""), "f1")).toBe("none");
    expect(withOutletCircuit(A, "f1", "c1")).toBe(A);
    // A door has no circuit.
    expect(withOutletCircuit(B, "f2", "c1")).toBe(B);
    expect(featureOf(B, "f2")).not.toHaveProperty("point");
  });

  it("counts the outlets of a circuit and their rooms", () => {
    expect(circuitUse(store, "c1")).toEqual({ outlets: 3, rooms: 2 });
    expect(circuitUse(store, "c2")).toEqual({ outlets: 0, rooms: 0 });
  });

  it("removes a circuit from each outlet of each room", () => {
    const without = withoutCircuit(store, "c1");
    expect(circuitsOf(without)).toEqual([circuit("c2")]);
    expect(circuitUse(without, "c1")).toEqual({ outlets: 0, rooms: 0 });
    expect(circuitAt(without.rooms[0], "f2")).toBe("none");
    expect(circuitAt(without.rooms[1], "f1")).toBe("none");
    // A room with no outlet of the circuit stays the same draft.
    const second = withoutCircuit(store, "c2");
    expect(second.rooms[0]).toBe(store.rooms[0]);
    expect(circuitsOf(second)).toEqual([circuit("c1", "Kitchen")]);
    expect(withoutCircuit(store, "c9")).toBe(store);
    // The list goes away with its last record.
    expect(withoutCircuit(second, "c1").lists).toEqual([]);
  });

  it("keeps the circuits in its text, and removes each record that is not a record of a list", () => {
    expect(parseStore(storeText(store))).toEqual(store);
    const raw = JSON.parse(storeText(store)) as Record<string, unknown>;
    const records: readonly unknown[] = [
      { key: "c2", values: { name: "A", breaker: "15" }, records: {} },
      { key: "c2", values: { name: "B" }, records: {} },
      { key: "", values: {}, records: {} },
      { key: "c3", values: { name: 1 }, records: {} },
      { key: "c4", values: {} },
      { key: "c5", values: { name: "n".repeat(81) }, records: {} },
      null,
    ];
    const parsed = parseStore(JSON.stringify({ ...raw, lists: [{ layer: ELECTRICAL.layer, collection: ELECTRICAL.circuits, records }] }));
    expect(parsed === undefined ? undefined : circuitsOf(parsed)).toEqual([{ key: "c2", name: "A", breaker: "15", voltage: "" }]);
    // The store does not have the circuit c1, so no outlet keeps it.
    expect(parsed === undefined ? undefined : circuitUse(parsed, "c1")).toEqual({ outlets: 0, rooms: 0 });
    expect(circuitAt(parsed?.rooms[0], "f1")).toBe("none");
  });

  it("adds the circuits of new rooms with new keys, and the outlets of the new rooms keep them", () => {
    const base = withNewCircuit(storeOf([BOX]));
    const room = withOutletCircuit(onWall(BOX, 0, [outlet("f1", "1")]), "f1", "c1");
    const next = withNewRooms(base, [room], [], false, circuitLists([{ key: "c1", name: "Kitchen", breaker: "20", voltage: "" }]));
    expect(circuitsOf(next)).toEqual([circuit("r1"), { key: "r2", name: "Kitchen", breaker: "20", voltage: "" }]);
    expect(circuitAt(next.rooms[1], "f1")).toBe("r2");
    // An outlet of a circuit that the new rooms do not have gets no circuit.
    expect(circuitAt(withNewRooms(base, [room], []).rooms[1], "f1")).toBe("none");
    expect(withNewRooms(full, [room], [], false, circuitLists([circuit("c1")]))).toBe(full);
    // A new circuit with the key of a circuit of the store gets a new key. The rooms of the store keep their circuit.
    const joined = withNewRooms(store, [room], [], false, circuitLists([circuit("c1", "Garage")]));
    expect(circuitsOf(joined).map((item) => [item.key, item.name])).toEqual([
      ["c1", "Kitchen"],
      ["c2", ""],
      ["r3", "Garage"],
    ]);
    expect(circuitAt(joined.rooms[0], "f1")).toBe("c1");
    expect(circuitAt(joined.rooms[2], "f1")).toBe("r3");
  });

  it("gives the survey record the circuits, and `readSurvey` gives the outlets their circuits again", () => {
    /** This function gives the circuit of each outlet of a survey record. */
    const outletCircuits = (record: Survey): readonly (string | undefined)[] | undefined => wiring(record.layers)?.outlets?.map((item) => item.circuit);
    const survey = roomSurvey(A, storeLists(store), true);
    expect(wiring(survey.layers)?.circuits).toEqual([
      { id: "kitchen", name: "Kitchen", breaker: 16, voltage: 230 },
      { id: "circuit-2", breaker: 16, voltage: 230 },
    ]);
    expect(outletCircuits(survey)).toEqual(["kitchen", "kitchen"]);
    expect(wiring(roomSurvey(A).layers)?.circuits).toBeUndefined();
    expect(outletCircuits(roomSurvey(A))).toEqual([undefined, undefined]);
    // The survey of a room of a level names the circuits, and it lists none.
    expect(wiring(roomSurvey(A, storeLists(store)).layers)?.circuits).toBeUndefined();
    expect(outletCircuits(roomSurvey(A, storeLists(store)))).toEqual(["kitchen", "kitchen"]);
    const read = readSurvey(survey);
    expect(read.more).toBe(false);
    expect(read.lists).toEqual(circuitLists([{ key: "r1", name: "Kitchen", breaker: "16", voltage: "230" }, { key: "r2", name: "", breaker: "16", voltage: "230" }]));
    expect(read.draft.sides[0]?.features.map((item) => circuitOf(item))).toEqual(["r1", "r1"]);
    // The core functions read no record of an add-on.
    expect(surveyOf(A)).not.toHaveProperty("layers");
    expect(draftKeys(survey).draft.sides[0]?.features).toEqual([]);
    expect(draftOf(survey).sides[0]?.features).toEqual([]);
    expect(hasMore(survey)).toBe(false);
  });

  it("gives an id to each name, with a number for a name with no words and for a second name", () => {
    expect(idsOf(["Kitchen", "", "kitchen", " "], "circuit")).toEqual(["kitchen", "circuit-2", "kitchen-2", "circuit-4"]);
  });
});

describe("a store of version 1", () => {
  const typed = (value: string): TypedLength => ({ value, inches: "" });
  const [first, ...others] = BOX.sides;
  /** An outlet of circuit `c1`, as version 1 of the page kept it. */
  const outletV1 = { key: "f1", kind: "outlet", from: "start", offset: typed("1"), width: NO_TEXT, height: typed("0.3"), sill: NO_TEXT, circuit: "c1" };
  /** A rack with its power from the outlet `f1`, as version 1 of the page kept it. */
  const rackV1 = { key: "o1", kind: "rack", name: "Rack", from: "start", offset: typed("0.5"), width: typed("0.6"), depth: typed("1"), height: typed("2"), gap: NO_TEXT, lift: NO_TEXT, outlet: "f1", holds: [] };
  const circuitsV1 = [
    { key: "c1", name: "Kitchen", breaker: "20", voltage: "120" },
    { key: "c2", name: "", breaker: "", voltage: "" },
  ];
  /**
   * This function gives the text of a store of version 1 with one room. The first wall of the room has the features and the objects.
   * `more` replaces fields of the store.
   */
  const textV1 = (features: readonly unknown[], objects: readonly unknown[] = [], more: Readonly<Record<string, unknown>> = {}): string =>
    JSON.stringify({ version: 1, rooms: [{ ...BOX, sides: [{ ...first, features, objects }, ...others] }], circuits: circuitsV1, active: 0, ...more });

  it("reads the circuits, the circuit of an outlet and the outlet of an object, and each key stays", () => {
    const bare = { ...outletV1, key: "f2", from: "end", offset: typed("2"), height: NO_TEXT, circuit: "" };
    const parsed = parseStore(textV1([outletV1, bare], [rackV1]));
    expect(parsed?.version).toBe(2);
    expect(parsed === undefined ? undefined : circuitsOf(parsed)).toEqual(circuitsV1);
    const outlets = [feature("f1", "outlet", { offset: "1", height: "0.3" }), feature("f2", "outlet", { offset: "2" }, "end")];
    const rack = thing("o1", "rack", { offset: "0.5", width: "0.6", depth: "1", height: "2" }, { name: "Rack", outlet: "f1" });
    expect(parsed?.rooms[0]).toEqual(against(withOutletCircuit(onWall(BOX, 0, outlets), "f1", "c1"), 0, [rack]));
    expect(circuitAt(parsed?.rooms[0], "f1")).toBe("c1");
    expect(circuitAt(parsed?.rooms[0], "f2")).toBe("none");
    expect(parsed === undefined ? undefined : circuitUse(parsed, "c1")).toEqual({ outlets: 1, rooms: 1 });
    // The text of the new store gives the same store.
    expect(parsed === undefined ? undefined : parseStore(storeText(parsed))).toEqual(parsed);
  });

  it("refuses a store with a circuit of an outlet, or an outlet of an object, that is not a text", () => {
    expect(parseStore(textV1([outletV1], [rackV1]))).toBeDefined();
    expect(parseStore(textV1([{ ...outletV1, circuit: 7 }]))).toBeUndefined();
    expect(parseStore(textV1([{ ...outletV1, circuit: null }]))).toBeUndefined();
    expect(parseStore(textV1([outletV1], [{ ...rackV1, outlet: null }]))).toBeUndefined();
    // An object of version 1 has a text for its outlet. An object with no outlet has the empty text.
    expect(parseStore(textV1([outletV1], [{ ...rackV1, outlet: undefined }]))).toBeUndefined();
    expect(parseStore(textV1([outletV1], [{ ...rackV1, outlet: "" }]))?.rooms[0]?.sides[0]?.objects[0]?.owns).toEqual([]);
  });

  it("removes a name with no record: a circuit that the store does not have, and an outlet that the room does not have", () => {
    const door = feature("f3", "door", { offset: "1", width: "1" });
    const parsed = parseStore(
      textV1(
        [
          { ...outletV1, circuit: "c9" },
          { ...door, circuit: "c1" },
        ],
        [
          { ...rackV1, outlet: "f9" },
          { ...rackV1, key: "o2", outlet: "f3" },
        ],
      ),
    );
    const room = parsed?.rooms[0];
    expect(circuitAt(room, "f1")).toBe("none");
    // A door of version 1 with a circuit loses it, and a door is not an outlet.
    expect(room === undefined ? undefined : featureOf(room, "f3")).toEqual(door);
    expect(room?.sides[0]?.objects.map((object) => object.owns)).toEqual([[], []]);
  });

  it("removes each circuit that is not a circuit of the page, and the rooms stay", () => {
    const circuits: readonly unknown[] = [
      { key: "c2", name: "A", breaker: "15", voltage: "" },
      { key: "c2", name: "B", breaker: "", voltage: "" },
      { key: "", name: "", breaker: "", voltage: "" },
      { key: "c3", name: 1, breaker: "", voltage: "" },
      { key: "c4", name: "", breaker: 15, voltage: "" },
      { key: "c5", name: "" },
      null,
    ];
    const parsed = parseStore(textV1([outletV1], [], { circuits }));
    expect(parsed === undefined ? undefined : circuitsOf(parsed)).toEqual([{ key: "c2", name: "A", breaker: "15", voltage: "" }]);
    // The store does not have the circuit c1, so the outlet does not keep it.
    expect(circuitAt(parsed?.rooms[0], "f1")).toBe("none");
    expect(parsed?.rooms[0]).toEqual(onWall(BOX, 0, [feature("f1", "outlet", { offset: "1", height: "0.3" })]));
    // A store from before the circuits has no list.
    expect(parseStore(textV1([outletV1], [], { circuits: undefined }))?.lists).toEqual([]);
    expect(parseStore(textV1([outletV1], [], { circuits: "c1" }))?.lists).toEqual([]);
  });
});

describe("the fields of a record of an add-on", () => {
  it("keeps the texts by name in one form: the names in sequence, with no empty text", () => {
    const owned = ownedOf("plumbing/1", "taps", { values: { size: "15 mm", flow: "", brand: "Acme" }, records: { stack: "r1" }, points: { drain: "f2" } });
    expect(JSON.stringify(owned)).toBe('{"layer":"plumbing/1","collection":"taps","values":{"brand":"Acme","size":"15 mm"},"records":{"stack":"r1"},"points":{"drain":"f2"}}');
    expect(JSON.stringify(recordOf("r1", { values: { b: "2", a: "1" } }))).toBe('{"key":"r1","values":{"a":"1","b":"2"},"records":{}}');
    expect(recordOf("r1")).toEqual({ key: "r1", values: {}, records: {} });
    expect(ownedOf("plumbing/1", "taps")).toEqual({ layer: "plumbing/1", collection: "taps", values: {}, records: {}, points: {} });
  });

  it("keeps only the names and the texts that a store can have", () => {
    expect(ownedOf("plumbing/1", "taps", { values: { note: "n".repeat(90) } }).values["note"]).toHaveLength(80);
    expect(Object.keys(ownedOf("plumbing/1", "taps", { values: Object.fromEntries([["__proto__", "x"]]) }).values)).toEqual([]);
    expect(Object.keys(recordOf("r1", { records: { ["n".repeat(81)]: "r2" } }).records)).toEqual([]);
  });

  it("gives the text of a name, and no text for a name with no field", () => {
    const { values } = ownedOf("plumbing/1", "taps", { values: { size: "15 mm" } });
    expect(textOf(values, "size")).toBe("15 mm");
    expect(textOf(values, "flow")).toBeUndefined();
    // A name of the base of each object is not a field.
    expect(textOf(values, "toString")).toBeUndefined();
  });

  it("changes the fields of the record of a point, and an empty text removes its field", () => {
    const draft = onWall(BOX, 0, [feature("f1", "outlet", { offset: "1" }), feature("f2", "door", { offset: "2", width: "0.9" })]);
    const rated = withPoint(draft, "f1", { values: { rating: "20 A", note: "" } });
    expect(featureOf(rated, "f1")?.point).toEqual(ownedOf(ELECTRICAL.layer, ELECTRICAL.outlets, { values: { rating: "20 A" } }));
    expect(featureOf(withPoint(rated, "f1", { values: { rating: "" } }), "f1")?.point).toEqual(ownedOf(ELECTRICAL.layer, ELECTRICAL.outlets));
    // The store has no form, so a field that the form does not have stays in its text.
    expect(parseStore(storeText(storeOf([rated])))?.rooms[0]).toEqual(rated);
    // A change with no effect gives the same draft. A door has no record, and a key with no feature changes no feature.
    expect(withPoint(rated, "f1", { values: { rating: "20 A" } })).toBe(rated);
    expect(withPoint(rated, "f1", {})).toBe(rated);
    expect(withPoint(rated, "f2", { values: { rating: "20 A" } })).toBe(rated);
    expect(withPoint(rated, "f9", { values: { rating: "20 A" } })).toBe(rated);
    // A record keeps a limited number of fields in each group.
    const many = Object.fromEntries(Array.from({ length: 41 }, (_, index) => [`n${String(index)}`, "x"]));
    expect(withPoint(draft, "f1", { values: many })).toBe(draft);
  });
});

describe("the names of the electrical add-on", () => {
  it("has the names of the form of the add-on", () => {
    expect(checkForm(ELECTRICAL_FORM)).toEqual([]);
    expect(ELECTRICAL.layer).toBe(ELECTRICAL_FORM.schema);
    const fields = (collection: string): readonly string[] | undefined => collectionOf(ELECTRICAL.layer, collection)?.fields.map((field) => field.name);
    expect(fields(ELECTRICAL.circuits)).toEqual([ELECTRICAL.name, ELECTRICAL.breaker, ELECTRICAL.voltage]);
    expect(fields(ELECTRICAL.outlets)).toEqual([ELECTRICAL.circuit]);
    expect(fields(ELECTRICAL.feeds)).toContain(ELECTRICAL.outlet);
    expect(collectionOf(ELECTRICAL.layer, ELECTRICAL.feeds)?.owner).toBe(ELECTRICAL.object);
  });

  it("names the list of each field that names a record", () => {
    const field = (collection: string, name: string): unknown => collectionOf(ELECTRICAL.layer, collection)?.fields.find((item) => item.name === name);
    expect(field(ELECTRICAL.outlets, ELECTRICAL.circuit)).toMatchObject({ kind: "record", of: ELECTRICAL.circuits });
    expect(field(ELECTRICAL.feeds, ELECTRICAL.outlet)).toMatchObject({ kind: "record", of: ELECTRICAL.outlets });
  });

  it("gives no collection for a name that the forms do not have", () => {
    expect(collectionOf(ELECTRICAL.layer, "taps")).toBeUndefined();
    expect(collectionOf("plumbing/1", ELECTRICAL.outlets)).toBeUndefined();
    expect(collectionOf(ELECTRICAL.layer, ELECTRICAL.outlets, [])).toBeUndefined();
  });

  it("gives one kind of point: the outlets", () => {
    expect(pointKinds().map((kind) => [kind.layer, kind.collection.name, kind.tag])).toEqual([[ELECTRICAL.layer, ELECTRICAL.outlets, "outlet"]]);
    expect(pointKinds([])).toEqual([]);
  });
});

/** A false add-on for the tests: taps on a wall, and stacks in a list. The page has no code for it. */
const PLUMBING_FORM: LayerForm = {
  schema: "plumbing/1",
  collections: [
    { name: "stacks", word: "stack", label: "Stack", title: "Stacks", fields: [{ kind: "text", name: "name", label: "Name" }] },
    {
      name: "taps",
      word: "Water tap",
      label: "Tap",
      title: "Taps",
      on: ["wall"],
      height: { imperial: 0.9144, metric: 0.9 },
      fields: [{ kind: "record", name: "stack", label: "Stack", of: "stacks" }],
    },
  ],
};

describe("the points of a second add-on", () => {
  const forms = [ELECTRICAL_FORM, PLUMBING_FORM];
  const tap: DraftFeature = { ...feature("f1", "outlet", { offset: "1" }), point: ownedOf("plumbing/1", "taps") };
  const draft = onWall(BOX, 0, [tap, feature("f2", "outlet", { offset: "2" }), { ...tap, key: "f3", offset: { value: "3", inches: "" } }]);

  it("is a valid form with one kind of point", () => {
    expect(checkForm(PLUMBING_FORM)).toEqual([]);
    expect(pointKinds(forms).map((kind) => [kind.layer, kind.collection.name, kind.tag])).toEqual([
      [ELECTRICAL.layer, ELECTRICAL.outlets, "outlet"],
      ["plumbing/1", "taps", "water-tap"],
    ]);
  });

  it("gives a point the word, the label and the tag of its collection", () => {
    expect([featureWord(tap, forms), featureLabel(tap, forms), featureTag(tap, forms)]).toEqual(["water tap", "Tap", "water-tap"]);
    // The page does not know the add-on, so the point is a point with no kind.
    expect([featureWord(tap), featureLabel(tap), featureTag(tap)]).toEqual(["point", "Point", "point"]);
    expect(isOutlet(tap)).toBe(false);
    // The records of a collection that is not on a wall are not points.
    const stack: DraftFeature = { ...tap, point: ownedOf("plumbing/1", "stacks") };
    expect([featureWord(stack, forms), featureLabel(stack, forms), featureTag(stack, forms)]).toEqual(["point", "Point", "point"]);
  });

  it("gives each point a number in the points with its word", () => {
    expect(placedFeatures(draft, forms).map((item) => item.id)).toEqual(["water-tap-1", "outlet-1", "water-tap-2"]);
    expect(placedFeatures(draft).map((item) => item.id)).toEqual(["point-1", "outlet-1", "point-2"]);
  });

  it("gives a point the usual height of its collection", () => {
    expect(usualFor(tap, "height", "m", forms)).toBe(0.9);
    expect(usualFor(tap, "height", "in", forms)).toBe(36);
    expect(usualFor(tap, "height", "m")).toBeUndefined();
    expect(readFeature(tap, 4, "m", forms)).toEqual({ state: "ok", numbers: { start: 1, width: 0, height: 0.9, sill: 0 } });
    expect(readFeature(tap, 4, "m")).toEqual({ state: "empty", field: "height" });
  });

  it("gives the place and the faults of a point with the word of its collection", () => {
    expect(featureSpans(draft, [], forms).map((span) => [span.key, span.kind, span.tag, span.from])).toEqual([
      ["f1", "point", "water-tap", 0.25],
      ["f2", "point", "outlet", 0.5],
      ["f3", "point", "water-tap", 0.75],
    ]);
    expect(featureSpans(draft, []).map((span) => span.key)).toEqual(["f2"]);
    const blank = onWall(BOX, 0, [{ ...tap, key: "f4", offset: NO_TEXT }]);
    const result = roomResult(roomSurvey(blank));
    expect(featureFaults(blank, result, forms)).toEqual([
      { side: 0, key: "f4", id: "water-tap-1", level: "typing", field: "offset", text: "Type the distance from the corner of water tap 1 on wall 1.", note: "Type its distance from the corner." },
    ]);
    expect(featureFaults(blank, result).map((fault) => fault.text)).toEqual(["Type the distance from the corner of point 1 on wall 1."]);
  });

  it("keeps the points in the text of a store, and the survey record has only the outlets", () => {
    const sized = withPoint(draft, "f1", { values: { size: "15 mm" } });
    expect(parseStore(storeText(storeOf([sized])))?.rooms[0]).toEqual(sized);
    expect(storeText(storeOf([sized]))).toContain("15 mm");
    expect(wiring(roomSurvey(sized).layers)?.outlets?.map((item) => item.id)).toEqual(["outlet-1"]);
    expect(Object.keys(roomSurvey(sized).layers ?? {})).toEqual([ELECTRICAL.layer]);
    expect(roomSurvey(sized)).not.toHaveProperty("openings");
  });
});

describe("the lists of a store", () => {
  const base = storeOf([BOX]);
  const tap: DraftFeature = { ...feature("f1", "outlet", { offset: "1" }), point: ownedOf("plumbing/1", "taps", { records: { stack: "r1" } }) };

  it("adds a record to the list of a collection, and makes the list for its first record", () => {
    const one = withNewRecord(base, "plumbing/1", "stacks");
    expect(one.lists).toEqual([{ layer: "plumbing/1", collection: "stacks", records: [recordOf("r1")] }]);
    // Each record of a store has its own key, in all the lists.
    const two = withNewRecord(withNewRecord(one, ELECTRICAL.layer, ELECTRICAL.circuits), "plumbing/1", "stacks");
    expect(two.lists.map((list) => [list.collection, ...list.records.map((record) => record.key)])).toEqual([
      ["stacks", "r1", "r3"],
      [ELECTRICAL.circuits, "r2"],
    ]);
    expect(listRecords(two, "plumbing/1", "stacks").map((record) => record.key)).toEqual(["r1", "r3"]);
    expect(listRecords(two, "plumbing/1", "taps")).toEqual([]);
    // A name that a layer or a collection cannot have makes no list.
    expect(withNewRecord(base, "", "stacks")).toBe(base);
    expect(withNewRecord(base, "plumbing/1", "__proto__")).toBe(base);
  });

  it("keeps a limited number of records in a list, and a limited number of lists", () => {
    const records = Array.from({ length: MOST_RECORDS }, (_, index) => recordOf(`r${String(index + 1)}`));
    const fullList: Store = { ...base, lists: [{ layer: "plumbing/1", collection: "stacks", records }] };
    expect(withNewRecord(fullList, "plumbing/1", "stacks")).toBe(fullList);
    // A different list of the same store gets a record.
    expect(listRecords(withNewRecord(fullList, "plumbing/1", "valves"), "plumbing/1", "valves")).toEqual([recordOf(`r${String(MOST_RECORDS + 1)}`)]);
    // The reader keeps the first records of a list.
    const long = { layer: "plumbing/1", collection: "stacks", records: [...records, recordOf("r999")] };
    expect(parseStore(JSON.stringify({ ...base, lists: [long] }))?.lists[0]?.records).toEqual(records);
    // A store has 50 lists at most.
    const lists: readonly DraftList[] = Array.from({ length: 50 }, (_, index) => ({ layer: "plumbing/1", collection: `c${String(index)}`, records: [recordOf(`r${String(index + 1)}`)] }));
    const fullStore: Store = { ...base, lists };
    expect(withNewRecord(fullStore, "plumbing/1", "stacks")).toBe(fullStore);
    expect(withNewRecord(fullStore, "plumbing/1", "c0").lists[0]?.records.map((record) => record.key)).toEqual(["r1", "r51"]);
    expect(parseStore(storeText(fullStore))).toEqual(fullStore);
    // New rooms with a record of a new collection do not come in. New rooms with a record of a list of the store come in.
    const stack = (collection: string): readonly DraftList[] => [{ layer: "plumbing/1", collection, records: [recordOf("r1")] }];
    expect(withNewRooms(fullStore, [BOX], [], false, stack("stacks"))).toBe(fullStore);
    expect(withNewRooms(fullStore, [BOX], [], false, stack("c0")).lists[0]?.records.map((record) => record.key)).toEqual(["r1", "r51"]);
    // The reader keeps the first lists.
    const over = [...lists, { layer: "plumbing/1", collection: "stacks", records: [recordOf("r99")] }];
    expect(parseStore(JSON.stringify({ ...base, lists: over }))?.lists).toEqual(lists);
  });

  it("changes and removes a record, and no record keeps the name of a removed record", () => {
    const drain = ownedOf("plumbing/1", "drains", { values: { size: "40 mm" }, records: { stack: "r1" } });
    const sink: DraftObject = { ...thing("o1", "other"), owns: [drain, ownedOf("plumbing/1", "vents", { records: { stack: "r1" } })] };
    const draft = against(onWall(BOX, 0, [tap]), 1, [sink]);
    const lists: readonly DraftList[] = [
      { layer: "plumbing/1", collection: "stacks", records: [recordOf("r1", { values: { name: "North" } }), recordOf("r2")] },
      { layer: "plumbing/1", collection: "valves", records: [recordOf("r3", { records: { stack: "r1" } })] },
    ];
    const store: Store = { ...storeOf([draft, BOX]), lists };
    expect(parseStore(storeText(store))).toEqual(store);
    // The point of the tap comes first, then the records of the sink in their sequence.
    expect(recordUse(store, "r1")).toEqual({ users: [tap.point, drain, ownedOf("plumbing/1", "vents", { records: { stack: "r1" } })], rooms: 1 });
    expect(recordUse(store, "r2")).toEqual({ users: [], rooms: 0 });

    const named = withRecord(store, "r2", { values: { name: "South", note: "" }, records: { next: "r1" } });
    expect(listRecords(named, "plumbing/1", "stacks")[1]).toEqual(recordOf("r2", { values: { name: "South" }, records: { next: "r1" } }));
    expect(named.rooms).toBe(store.rooms);
    expect(withRecord(store, "r1", { values: { name: "North" } })).toBe(store);
    expect(withRecord(store, "r9", { values: { name: "East" } })).toBe(store);

    const without = withoutRecord(store, "r1");
    expect(without.lists).toEqual([
      { layer: "plumbing/1", collection: "stacks", records: [recordOf("r2")] },
      { layer: "plumbing/1", collection: "valves", records: [recordOf("r3")] },
    ]);
    expect(recordUse(without, "r1")).toEqual({ users: [], rooms: 0 });
    // The tap stays with no stack. The drain keeps its size, and the vent goes away with its last field.
    expect(featureOf(without.rooms[0] ?? BOX, "f1")?.point).toEqual(ownedOf("plumbing/1", "taps"));
    expect(objectOf(without.rooms[0] ?? BOX, "o1")?.owns).toEqual([ownedOf("plumbing/1", "drains", { values: { size: "40 mm" } })]);
    // A room with no name of the record stays the same draft.
    expect(without.rooms[1]).toBe(store.rooms[1]);
    expect(withoutRecord(store, "r9")).toBe(store);
  });

  it("reads the lists of a store: a list that is not valid goes away, and the rooms stay", () => {
    const first = { layer: ELECTRICAL.layer, collection: ELECTRICAL.circuits, records: [recordOf("c1", { values: { name: "Kitchen" } })] };
    const lists: readonly unknown[] = [
      first,
      // The second list of a collection.
      { ...first, records: [recordOf("c7")] },
      { layer: "", collection: "taps", records: [recordOf("r1")] },
      { layer: "plumbing/1", collection: "__proto__", records: [recordOf("r2")] },
      { layer: "plumbing/1", collection: "stacks", records: null },
      // A list with no record.
      { layer: "plumbing/1", collection: "taps", records: [] },
      // The record c1 has the key of a record of a different list. The record r3 names a record that no list has, and a record of a different layer.
      { layer: "plumbing/1", collection: "drains", records: [recordOf("c1"), recordOf("r3", { values: { size: "40 mm" }, records: { stack: "r9", circuit: "c1" } })] },
      null,
      7,
    ];
    const room = withOutletCircuit(onWall(BOX, 0, [feature("f1", "outlet", { offset: "1" })]), "f1", "c1");
    const parsed = parseStore(JSON.stringify({ ...storeOf([room]), lists }));
    expect(parsed?.lists).toEqual([first, { layer: "plumbing/1", collection: "drains", records: [recordOf("r3", { values: { size: "40 mm" } })] }]);
    expect(parsed?.rooms).toEqual([room]);
    // A store from before the lists has none.
    expect(parseStore(JSON.stringify({ ...storeOf([BOX]), lists: undefined }))?.lists).toEqual([]);
  });

  it("gives new keys to the records of new rooms, and each name follows its record", () => {
    const room = withOutletCircuit(onWall(BOX, 0, [tap, feature("f2", "outlet", { offset: "2" })]), "f2", "r1");
    const added: readonly DraftList[] = [
      { layer: "plumbing/1", collection: "stacks", records: [recordOf("r1", { values: { name: "North" } }), recordOf("r1", { values: { name: "Twice" } })] },
      { layer: "plumbing/1", collection: "valves", records: [recordOf("r2", { records: { stack: "r1", main: "r7" } })] },
    ];
    const present = withNewRecord(withNewRecord(base, "plumbing/1", "stacks"), "plumbing/1", "stacks");
    const next = withNewRooms(present, [room], [], false, added);
    // The second new record of a key does not come in. The name of a record that did not come in goes away.
    expect(next.lists).toEqual([
      { layer: "plumbing/1", collection: "stacks", records: [recordOf("r1"), recordOf("r2"), recordOf("r3", { values: { name: "North" } })] },
      { layer: "plumbing/1", collection: "valves", records: [recordOf("r4", { records: { stack: "r3" } })] },
    ]);
    expect(next.active).toBe(1);
    // The tap names the new record, not the record of the store with its old key.
    expect(featureOf(next.rooms[1] ?? BOX, "f1")?.point).toEqual(ownedOf("plumbing/1", "taps", { records: { stack: "r3" } }));
    // A record keeps only the name of a record of its layer.
    expect(circuitAt(next.rooms[1], "f2")).toBe("none");
  });
});
