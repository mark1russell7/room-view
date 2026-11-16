import { checkRoom, expandSurvey, type Survey } from "@mark1russell7/room-view";
import { SAMPLE_SURVEY } from "@mark1russell7/room-view/sample";
import { describe, expect, it } from "vitest";
import {
  angleOf,
  areaText,
  circuitUse,
  convertTyped,
  defaultMode,
  dimensionText,
  draftKeys,
  draftOf,
  emptyDraft,
  exampleDraft,
  featureAt,
  featureFaults,
  featureOf,
  featureSpans,
  fieldsOf,
  fileName,
  hasFault,
  hasMore,
  isExample,
  joinedTo,
  LENGTH_MODES,
  lengthText,
  listedObjects,
  idsOf,
  MOST_CIRCUITS,
  MOST_LEVELS,
  MOST_ROOMS,
  nameWords,
  numberOf,
  objectFaults,
  objectMarks,
  objectOf,
  objectWords,
  parseStore,
  placedFeatures,
  readFeature,
  readObject,
  readLength,
  roomName,
  roomState,
  sameDraft,
  shownObjects,
  shownRoom,
  statusOf,
  storeOf,
  storeText,
  surveyOf,
  turnOf,
  typedOf,
  usualOf,
  usualSize,
  walksRight,
  withActive,
  withCircuit,
  withConnection,
  withExample,
  withFeature,
  withMode,
  withNewCircuit,
  withNewFeature,
  withNewObject,
  withNewRoom,
  withNewRooms,
  withNewSide,
  withObject,
  withoutCircuit,
  withoutFeature,
  withOutletCircuit,
  withoutObject,
  withoutRoom,
  withoutSide,
  withRoom,
  withSide,
  type Corner,
  type Draft,
  type DraftCircuit,
  type DraftConnection,
  type DraftEnd,
  type DraftFeature,
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

/** This function gives a feature with one number for each length of a list. Each other length has no text. */
function feature(key: string, kind: FeatureKind, lengths: Partial<Readonly<Record<FeatureField, string>>> = {}, from: FeatureEnd = "start"): DraftFeature {
  const typed = (text: string | undefined): TypedLength => ({ value: text ?? "", inches: "" });
  return { key, kind, from, offset: typed(lengths.offset), width: typed(lengths.width), height: typed(lengths.height), sill: typed(lengths.sill) };
}

/** This function gives a draft with the features of a list on the wall at a position, from 0. */
function onWall(draft: Draft, index: number, features: readonly DraftFeature[]): Draft {
  return { ...draft, sides: draft.sides.map((side, at) => (at === index ? { ...side, features } : side)) };
}

function statusFor(draft: Draft): Status {
  return statusOf(draft, expandSurvey(surveyOf(draft)));
}

function faultsFor(draft: Draft): readonly FeatureFault[] {
  return featureFaults(draft, expandSurvey(surveyOf(draft)));
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
    expect(surveyOf(exampleDraft("m"))).toEqual({
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
      outlets: [{ id: "outlet-1", wall: "wall-2", offset: 1.5, height: 0.3 }],
      objects: [
        { id: "rack-1", kind: "rack", wall: "wall-2", offset: 1.2, width: 0.6, depth: 0.9, height: 1.2, gap: 0.1, outlet: "outlet-1" },
        { id: "desk-1", kind: "desk", wall: "wall-3", offset: 1.05, width: 1.5, depth: 0.75, height: 0.75 },
        { id: "display-1", kind: "display", on: "desk-1", offset: 0.45, width: 0.6, depth: 0.2, height: 0.45, gap: 0.1 },
      ],
    });
  });

  it("writes feet and inches as inches", () => {
    const survey = surveyOf(exampleDraft("ft-in"));
    expect(survey.unit).toBe("in");
    expect(survey.height).toBe(96);
    expect(survey.wallThickness).toBe(4.5);
    expect(survey.sides.map((side) => side.length)).toEqual([144, 120, 144, 120]);
    expect(survey.openings?.[0]).toEqual({ id: "door-1", wall: "wall-1", kind: "door", offset: 6, width: 32, height: 80 });
    expect(survey.outlets).toEqual([{ id: "outlet-1", wall: "wall-2", offset: 60, height: 12 }]);
  });

  it("gives a closed room for the example of each mode", () => {
    for (const mode of LENGTH_MODES) expect(expandSurvey(surveyOf(exampleDraft(mode))).closure.closed, mode).toBe(true);
  });

  it("keeps a name with no space at its ends, and no empty name", () => {
    expect(surveyOf({ ...exampleDraft("m"), name: "  Bedroom " }).name).toBe("Bedroom");
    expect(surveyOf({ ...exampleDraft("m"), name: "   " })).not.toHaveProperty("name");
  });

  it("is total: a bad length counts as 0, and a bad height gets a usual value", () => {
    const draft = withSide({ ...exampleDraft("m"), height: { value: "tall", inches: "" }, thickness: { value: "0", inches: "" } }, "s2", { length: { value: "abc", inches: "" } });
    const survey = surveyOf(draft);
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
    const survey = surveyOf(draft);
    expect(survey.sides[1]?.turn).toBeCloseTo(126.87, 9);
    expect(survey.sides[2]?.turn).toBeCloseTo(143.13, 9);
    const result = expandSurvey(survey);
    expect(result.closure.closed).toBe(true);
    // The angles have 2 decimals, so the gap is some micrometers. The page tells no gap.
    expect(statusOf(draft, result)).toEqual({ level: "closed", title: "The room closes.", text: "The walk ends at its start." });
  });

  it("closes the same triangle in a walk to the right, with the walls on the left", () => {
    const draft = room("m", [wall("4", "right"), wall("3", "angle", "53.13"), wall("5", "angle", "36.87")]);
    expect(walksRight(draft.sides)).toBe(true);
    const survey = surveyOf(draft);
    expect(survey.sides[1]?.turn).toBeCloseTo(-126.87, 9);
    expect(survey.sides[2]?.turn).toBeCloseTo(-143.13, 9);
    const result = expandSurvey(survey);
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
    for (const mode of ["ft-in", "m", "cm"] as const) expect(draftOf(surveyOf(exampleDraft(mode))), mode).toEqual(exampleDraft(mode));
    expect(draftOf(surveyOf(room("m", TRIANGLE)))).toEqual(room("m", TRIANGLE));
  });

  it("shows a record in inches as feet and inches", () => {
    expect(draftOf(surveyOf(exampleDraft("in")))).toEqual(exampleDraft("ft-in"));
  });

  it("shows a record in feet as feet and inches, and a record in millimeters as centimeters", () => {
    const survey = (unit: Survey["unit"], height: number, wallThickness: number, length: number): Survey => ({
      schema: "survey/1",
      unit,
      height,
      wallThickness,
      sides: [{ id: "a", length, turn: "left" }],
    });
    const feet = draftOf(survey("ft", 8, 0.375, 12.5));
    expect(feet.mode).toBe("ft-in");
    expect(feet.height).toEqual({ value: "8", inches: "0" });
    expect(feet.thickness).toEqual({ value: "0", inches: "4.5" });
    expect(feet.sides[0]?.length).toEqual({ value: "12", inches: "6" });
    const millimeters = draftOf(survey("mm", 2400, 110, 3605));
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
    expect(corners(draftOf(survey(["left", 126.87, 143.13])))).toEqual([["left", ""], ["angle", "53.13"], ["angle", "36.87"]]);
    // The turns of a walk to the right are negative.
    expect(corners(draftOf(survey(["right", -126.87, -143.13])))).toEqual([["right", ""], ["angle", "53.13"], ["angle", "36.87"]]);
  });

  it("reads the walls of the sample survey, and tells that the survey has more data than the draft keeps", () => {
    const draft = draftOf(SAMPLE_SURVEY);
    expect(draft.name).toBe("Sample room");
    expect(draft.sides.map((side) => side.length.value)).toEqual(["6", "3", "2", "2", "4", "5"]);
    expect(draft.sides.map((side) => side.corner)).toEqual(["left", "left", "right", "left", "left", "left"]);
    expect(hasMore(SAMPLE_SURVEY)).toBe(true);
    expect(hasMore(surveyOf(draft))).toBe(false);
    expect(statusFor(draft)).toEqual({ level: "closed", title: "The room closes.", text: "The walk ends exactly at its start." });
  });

  it("reads the features of each wall of the sample survey, in the sequence of their distances", () => {
    const draft = draftOf(SAMPLE_SURVEY);
    expect(draft.sides.map((side) => side.features.map((item) => item.kind))).toEqual([
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
      { key: "f4", kind: "outlet", from: "start", offset: { value: "0.4", inches: "" }, width: NO_TEXT, height: { value: "0.3", inches: "" }, sill: NO_TEXT },
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
    const draft = draftOf(survey);
    expect(draft.sides.map((side) => side.features.map((item) => item.kind))).toEqual([["gap"], []]);
    expect(draft.sides[0]?.features[0]?.offset).toEqual({ value: "0", inches: "" });
    expect(hasMore(survey)).toBe(true);
  });

  it("gives an empty field for a number that is not a length", () => {
    const draft = draftOf({ schema: "survey/1", unit: "m", height: Number.NaN, wallThickness: -1, sides: [{ id: "a", length: 0, turn: Number.POSITIVE_INFINITY }] });
    expect(draft.height).toEqual({ value: "", inches: "" });
    expect(draft.thickness).toEqual({ value: "", inches: "" });
    expect(draft.sides[0]).toEqual({ key: "s1", length: { value: "", inches: "" }, corner: "angle", angle: "", features: [], objects: [] });
  });
});

describe("hasMore", () => {
  const survey = surveyOf(exampleDraft("m"));

  it("is false for the record of a draft", () => {
    expect(hasMore(survey)).toBe(false);
    expect(hasMore(surveyOf(BOX))).toBe(false);
  });

  it("is false for the circuits of the survey: the store keeps them, and `circuitDrafts` tells their data that it does not keep", () => {
    const circuits = [{ id: "a", name: "Circuit A", limit: 1440 }];
    expect(hasMore({ ...survey, circuits })).toBe(false);
    const outlets = [{ id: "outlet-1", wall: "wall-2", offset: 1, height: 0.3, circuit: "a" }];
    expect(hasMore({ ...survey, circuits, outlets })).toBe(false);
    expect(hasMore({ ...survey, circuits, outlets }, new Set())).toBe(true);
  });

  it("tells each kind of data that a draft does not keep", () => {
    const more: readonly Survey[] = [
      { ...survey, checks: [{ id: "diagonal", from: "wall-1", to: "wall-3", length: 4.7 }] },
      { ...survey, sides: survey.sides.map((side) => ({ ...side, height: 2 })) },
      { ...survey, sides: survey.sides.map((side) => ({ ...side, thickness: 0.2 })) },
      { ...survey, openings: [{ id: "door-1", wall: "wall-1", kind: "door", offset: 1, width: 0.8, sill: 0.1, height: 2 }] },
      { ...survey, openings: [{ id: "door-1", wall: "hall", kind: "door", offset: 1, width: 0.8, height: 2 }] },
      { ...survey, outlets: [{ id: "outlet-1", wall: "wall-2", offset: 1, height: 0.3, circuit: "a" }] },
      { ...survey, outlets: [{ id: "outlet-1", wall: "hall", offset: 1, height: 0.3 }] },
    ];
    for (const [index, item] of more.entries()) expect(hasMore(item), String(index)).toBe(true);
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
      expect(exampleDraft(mode).sides.map((side) => side.features.map((item) => `${item.key} ${item.kind}`)), mode).toEqual([["f1 door"], ["f2 outlet"], ["f3 window"], []]);
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
    expect(fieldsOf("outlet")).toEqual(["offset", "height"]);
  });
});

describe("usualOf", () => {
  it("gives a round number in each mode", () => {
    expect(usualOf("door", "height", "ft-in")).toBe(80);
    expect(usualOf("gap", "height", "in")).toBe(80);
    expect(usualOf("window", "height", "in")).toBe(48);
    expect(usualOf("window", "sill", "ft-in")).toBe(36);
    expect(usualOf("outlet", "height", "in")).toBe(12);
    expect(usualOf("door", "height", "m")).toBe(2.03);
    expect(usualOf("window", "height", "cm")).toBe(120);
    expect(usualOf("window", "sill", "cm")).toBe(90);
    expect(usualOf("outlet", "height", "m")).toBe(0.3);
  });

  it("gives no usual value for a distance, for a width, and for the bottom of a kind that is not a window", () => {
    expect(usualOf("door", "offset", "m")).toBeUndefined();
    expect(usualOf("window", "width", "m")).toBeUndefined();
    expect(usualOf("door", "sill", "m")).toBeUndefined();
    expect(usualOf("outlet", "sill", "ft-in")).toBeUndefined();
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
    const survey = surveyOf(onWall(onWall(BOX, 0, first), 1, second));
    expect(survey.openings).toEqual([
      { id: "door-1", wall: "wall-1", kind: "door", offset: 0.5, width: 0.9, height: 2.03 },
      { id: "window-1", wall: "wall-2", kind: "window", offset: 0.8, width: 1.2, sill: 0.8, height: 1 },
    ]);
    expect(survey.outlets).toEqual([{ id: "outlet-1", wall: "wall-1", offset: 2, height: 1.1 }]);
  });

  it("has no record of a feature that needs a value, and no record of a feature on a wall with no length", () => {
    const typing = surveyOf(onWall(BOX, 0, [feature("f1", "door", { offset: "0.5" }), feature("f2", "outlet", { offset: "far" })]));
    expect(typing).not.toHaveProperty("openings");
    expect(typing).not.toHaveProperty("outlets");
    const noWall = withSide(onWall(BOX, 0, [feature("f1", "door", { offset: "0.5", width: "0.9" })]), "s1", { length: NO_TEXT });
    expect(surveyOf(noWall)).not.toHaveProperty("openings");
  });

  it("keeps the number of a feature when a feature before it needs a value", () => {
    const draft = onWall(BOX, 0, [feature("f1", "door"), feature("f2", "door", { offset: "2", width: "0.9" })]);
    expect(surveyOf(draft).openings?.map((item) => item.id)).toEqual(["door-2"]);
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
    const result = expandSurvey(surveyOf(draft));
    expect(shownRoom(result.room, featureFaults(draft, result))).toBe(result.room);
  });

  it("removes each opening and each outlet with an error, and keeps a feature with a warning", () => {
    const draft = onWall(BOX, 0, [
      feature("f1", "door", { offset: "1", width: "1" }),
      feature("f2", "outlet", { offset: "1.5" }),
      feature("f3", "window", { offset: "3.5", width: "1" }),
      feature("f4", "outlet", { offset: "9" }),
    ]);
    const result = expandSurvey(surveyOf(draft));
    expect(result.room.openings?.map((item) => item.id)).toEqual(["door-1", "window-1"]);
    const shown = shownRoom(result.room, featureFaults(draft, result));
    expect(shown.openings?.map((item) => item.id)).toEqual(["door-1"]);
    expect(shown.outlets?.map((item) => item.id)).toEqual(["outlet-1"]);
    expect(checkRoom(shown).filter((finding) => finding.level === "error")).toEqual([]);
    expect(shown.walls).toBe(result.room.walls);
  });
});

describe("featureSpans", () => {
  it("gives the place of each feature as a part of the length of its wall", () => {
    const first = [feature("f1", "door", { offset: "1", width: "1" }), feature("f2", "outlet", { offset: "3" })];
    const second = [feature("f3", "window", { offset: "0.75", width: "1.5" }, "end")];
    expect(featureSpans(onWall(onWall(BOX, 0, first), 1, second), [])).toEqual([
      { side: 0, key: "f1", kind: "door", from: 0.25, to: 0.5, corner: "start", fault: undefined },
      { side: 0, key: "f2", kind: "outlet", from: 0.75, to: 0.75, corner: "start", fault: undefined },
      { side: 1, key: "f3", kind: "window", from: 0.25, to: 0.75, corner: "end", fault: undefined },
    ]);
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
    expect(withNewFeature(emptyDraft("m"), "s2", "outlet").sides.map((side) => side.features.map((item) => item.key))).toEqual([[], ["f1"], [], []]);
    expect(withNewFeature(draft, "s9", "door")).toEqual(draft);
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
    expect(statusOf(draft, expandSurvey(surveyOf(draft)), [])).toEqual({ level: "closed", title: "The room closes.", text: "The walk ends exactly at its start." });
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
    expect(store).toEqual({ version: 1, rooms: [exampleDraft("ft-in"), room("m", TRIANGLE)], connections: [], circuits: [], active: 1 });
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
      JSON.stringify({ ...store, version: 2 }),
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
    for (const [index, item] of rooms.entries()) expect(parseStore(JSON.stringify({ version: 1, rooms: [item], active: 0 })), String(index)).toBeUndefined();
    expect(parseStore(JSON.stringify({ version: 1, rooms: [withFirst([door])], active: 0 }))).toEqual(storeOf([onWall(BOX, 0, [door])]));
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
    const survey = surveyOf(onWall(onWall(BOX, 0, features), 2, [feature("d", "door", { offset: "1", width: "0.9" })]));
    const { draft, keys } = draftKeys(survey);
    expect(draft).toEqual(draftOf(survey));
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
    expect(fileName({ ...exampleDraft("m"), name: "Küche" }, "room")).toBe("küche.room.json");
  });

  it("gives a usual name to a room with no name", () => {
    expect(fileName(exampleDraft("m"), "survey")).toBe("room.survey.json");
    expect(fileName({ ...exampleDraft("m"), name: "../.." }, "room")).toBe("room.room.json");
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

/** This function gives an object with one number for each length of a list. Each other length has no text. */
function thing(key: string, kind: string, lengths: Partial<Readonly<Record<ObjectField, string>>> = {}, more: Partial<Pick<DraftObject, "name" | "from" | "outlet" | "holds">> = {}): DraftObject {
  const typed = (text: string | undefined): TypedLength => ({ value: text ?? "", inches: "" });
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
    outlet: "",
    holds: [],
    ...more,
  };
}

/** This function gives a draft with the objects of a list against the wall at a position, from 0. */
function against(draft: Draft, index: number, objects: readonly DraftObject[]): Draft {
  return { ...draft, sides: draft.sides.map((side, at) => (at === index ? { ...side, objects } : side)) };
}

function objectFaultsFor(draft: Draft): readonly ObjectFault[] {
  return objectFaults(draft, expandSurvey(surveyOf(draft)));
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
    expect(surveyOf(draft).objects).toEqual([
      { id: "desk-1", kind: "desk", name: "Standing desk", wall: "wall-1", offset: 0.5, width: 1.5, depth: 0.75, height: 0.75 },
      { id: "display-1", kind: "display", on: "desk-1", offset: 0.2, width: 0.6, depth: 0.2, height: 0.45 },
      { id: "computer-1", kind: "computer", on: "desk-1", offset: 1, width: 0.2, depth: 0.45, height: 0.45, lift: 0 },
      { id: "desk-2", kind: "desk", wall: "wall-1", offset: 2.25, width: 1.5, depth: 0.75, height: 0.75 },
      { id: "floor-lamp-1", kind: "Floor lamp", wall: "wall-3", offset: 0.2, width: 0.3, depth: 0.3, height: 1.6, gap: 0.1 },
    ]);
  });

  it("gives a place in the room to each object", () => {
    const result = expandSurvey(surveyOf(draft));
    expect(result.objects.map((item) => item.id)).toEqual(["desk-1", "display-1", "computer-1", "desk-2", "floor-lamp-1"]);
    expect(result.objects.map((item) => item.parent)).toEqual([undefined, "desk-1", "desk-1", undefined, undefined]);
    expect(objectFaultsFor(draft)).toEqual([]);
  });

  it("has no record of an object that needs a value, of an object on it, or of an object on a wall with no length", () => {
    const held = thing("o2", "display", { offset: "0.2" });
    expect(surveyOf(against(BOX, 0, [thing("o1", "desk", {}, { holds: [held] })])).objects).toBeUndefined();
    const noWall = against(withSide(BOX, "s1", { length: NO_TEXT }), 0, [thing("o1", "desk", { offset: "1" }, { holds: [held] })]);
    expect(surveyOf(noWall).objects).toBeUndefined();
    expect(listedObjects(noWall).map((item) => item.ready)).toEqual([false, false]);
  });

  it("keeps the number of an object when an object before it needs a value", () => {
    const two = against(BOX, 0, [thing("o1", "desk"), thing("o2", "desk", { offset: "2" })]);
    expect(surveyOf(two).objects?.map((item) => item.id)).toEqual(["desk-2"]);
  });

  it("gives the outlet of an object only when the record has that outlet", () => {
    const rack = thing("o1", "rack", { offset: "0.5" }, { outlet: "f1" });
    expect(surveyOf(against(onWall(BOX, 1, [feature("f1", "outlet", { offset: "1" })]), 0, [rack])).objects?.[0]?.outlet).toBe("outlet-1");
    expect(surveyOf(against(BOX, 0, [rack])).objects?.[0]).toEqual({ id: "rack-1", kind: "rack", wall: "wall-1", offset: 0.5, width: 0.6, depth: 0.9, height: 1.2 });
    // An outlet that needs a value is not in the record.
    expect(surveyOf(against(onWall(BOX, 1, [feature("f1", "outlet")]), 0, [rack])).objects?.[0]?.outlet).toBeUndefined();
    // A door is not an outlet.
    expect(surveyOf(against(onWall(BOX, 1, [feature("f1", "door", { offset: "1", width: "0.9" })]), 0, [rack])).objects?.[0]?.outlet).toBeUndefined();
  });
});

describe("the objects of the draft of a survey record", () => {
  const sizes = { offset: 0, width: 0.5, depth: 0.5, height: 0.5 };

  it("reads the objects of its own record", () => {
    // A record in inches gives a draft in feet and inches.
    for (const mode of LENGTH_MODES.filter((item) => item !== "in")) expect(draftOf(surveyOf(exampleDraft(mode))), mode).toEqual(exampleDraft(mode));
    expect(draftOf(surveyOf(exampleDraft("in")))).toEqual(exampleDraft("ft-in"));
  });

  it("sorts the objects of a wall by their distance, and gives each object its holder and its outlet", () => {
    const survey: Survey = {
      ...surveyOf(onWall(BOX, 1, [feature("f1", "outlet", { offset: "1" })])),
      objects: [
        { id: "b", kind: " Lamp ", wall: "wall-1", offset: 2, width: 0.3, depth: 0.3, height: 1.6, lift: 0 },
        { id: "a", kind: "desk", name: " Standing desk ", wall: "wall-1", offset: 0.5, width: 1.5, depth: 0.75, height: 0.75, gap: 0.05, outlet: "outlet-1" },
        { id: "c", kind: "display", on: "a", offset: 0.2, width: 0.6, depth: 0.2, height: 0.45 },
        { id: "d", kind: "", wall: "wall-3", offset: 0, width: 0, depth: 1, height: 1 },
      ],
    };
    const draft = draftOf(survey);
    expect(draft.sides.map((side) => side.objects.map((item) => `${item.key} ${item.kind}`))).toEqual([["o1 desk", "o3 Lamp"], [], ["o4 other"], []]);
    expect(objectOf(draft, "o1")).toMatchObject({ name: "Standing desk", from: "start", offset: { value: "0.5" }, gap: { value: "0.05" }, lift: NO_TEXT, outlet: "f1" });
    expect(objectOf(draft, "o1")?.holds.map((item) => `${item.key} ${item.kind}`)).toEqual(["o2 display"]);
    expect(objectOf(draft, "o3")).toMatchObject({ gap: NO_TEXT, lift: { value: "0" }, outlet: "" });
    // A size of 0 stays as text, so the page tells the fault.
    expect(objectOf(draft, "o4")).toMatchObject({ offset: { value: "0" }, width: { value: "0" } });
    expect(hasMore(survey)).toBe(false);
  });

  it("keeps the first object of a name, and no object that the room cannot have", () => {
    const base = surveyOf(BOX);
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
    expect(draftOf(survey).sides.map((side) => side.objects.map((item) => item.kind))).toEqual([["desk"], [], [], []]);
    expect(hasMore(survey)).toBe(true);
  });

  it("keeps the objects down to the last level", () => {
    const ids = ["a", "b", "c", "d", "e"];
    const objects = ids.map((id, index) => ({ id, kind: "shelf", ...(index === 0 ? { wall: "wall-1" } : { on: ids[index - 1] ?? "" }), ...sizes }));
    const survey: Survey = { ...surveyOf(BOX), objects };
    expect(listedObjects(draftOf(survey)).map((item) => item.level)).toEqual(Array.from({ length: MOST_LEVELS }, (_, index) => index + 1));
    expect(hasMore(survey)).toBe(true);
    expect(hasMore({ ...survey, objects: objects.slice(0, MOST_LEVELS) })).toBe(false);
  });

  it("tells the data of an object that a draft does not keep", () => {
    const base = surveyOf(exampleDraft("m"));
    const objects = base.objects ?? [];
    expect(objects).toHaveLength(3);
    const more: readonly Survey[] = [
      { ...base, objects: objects.map((item) => (item.id === "desk-1" ? { ...item, outlet: "outlet-9" } : item)) },
      { ...base, objects: objects.map((item) => ({ ...item, gap: -0.1 })) },
      { ...base, objects: objects.map((item) => ({ ...item, lift: -0.1 })) },
      // The outlet of the rack is on a wall that the survey does not have.
      { ...base, outlets: [{ id: "outlet-1", wall: "hall", offset: 1, height: 0.3 }] },
    ];
    for (const [index, item] of more.entries()) expect(hasMore(item), String(index)).toBe(true);
  });

  it("keeps 80 characters of a name", () => {
    const long = "n".repeat(100);
    const survey: Survey = { ...surveyOf(BOX), name: long, objects: [{ id: "a", kind: long, name: long, wall: "wall-1", ...sizes }] };
    const draft = draftOf(survey);
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
      expect(objectOf(example, "o1")?.outlet, mode).toBe("f2");
      expect(objectOf(example, "o2")?.holds.map((item) => `${item.key} ${item.kind}`), mode).toEqual(["o3 display"]);
      expect(objectFaultsFor(example), mode).toEqual([]);
      expect(expandSurvey(surveyOf(example)).objects, mode).toHaveLength(3);
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
    const sides = bare("m").sides.map(({ key, length, corner, angle, features }) => ({ key, length, corner, angle, features }));
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
    expect(objectOf(less, "o1")?.outlet).toBe("f1");
    expect(objectOf(less, "o2")?.outlet).toBe("");
    const none = withoutSide(draft, "s2");
    expect(objectOf(none, "o1")?.outlet).toBe("");
    expect(objectOf(none, "o2")?.outlet).toBe("");
    expect(withoutSide(draft, "s1").sides.flatMap((side) => side.objects)).toEqual([]);
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
  const read = (item: unknown): Store | undefined => parseStore(JSON.stringify({ version: 1, rooms: [item], active: 0 }));

  it("reads its own text with the objects of each level", () => {
    const store = storeOf([against(BOX, 0, [thing("o1", "desk", { offset: "1" }, { name: "Desk", holds: [thing("o2", "display", { offset: "0.2" }, { from: "end" })] })])]);
    expect(parseStore(storeText(store))).toEqual(store);
    expect(parseStore(storeText(storeOf([exampleDraft("ft-in")])))).toEqual(storeOf([exampleDraft("ft-in")]));
  });

  it("removes an outlet that the room does not have", () => {
    const rack = thing("o1", "rack", { offset: "0.5" }, { outlet: "f9" });
    expect(read(against(BOX, 0, [rack]))).toEqual(storeOf([against(BOX, 0, [{ ...rack, outlet: "" }])]));
    // A door is not an outlet.
    const door = against(onWall(BOX, 1, [feature("f9", "door", { offset: "1", width: "0.9" })]), 0, [rack]);
    expect(read(door)?.rooms[0]?.sides[0]?.objects[0]?.outlet).toBe("");
    const outlet = against(onWall(BOX, 1, [feature("f9", "outlet", { offset: "1" })]), 0, [rack]);
    expect(read(outlet)).toEqual(storeOf([outlet]));
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
      withFirst([{ ...desk, outlet: null }]),
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
    expect(statusOf(outside, expandSurvey(surveyOf(outside)), [], [])).toEqual({ level: "closed", title: "The room closes.", text: "The walk ends exactly at its start." });
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

describe("shownObjects", () => {
  it("removes an outlet that the shown room does not have", () => {
    const draft = against(onWall(BOX, 1, [feature("f1", "outlet", { offset: "1" })]), 0, [thing("o1", "rack", { offset: "0.5" }, { outlet: "f1" })]);
    const result = expandSurvey(surveyOf(draft));
    expect(result.objects[0]?.outlet).toBe("outlet-1");
    expect(shownObjects(result.room, result.objects)).toEqual(result.objects);
    const shown = shownObjects({ ...result.room, outlets: [] }, result.objects);
    expect(shown[0]?.outlet).toBeUndefined();
    expect(shown[0]).toMatchObject({ id: "rack-1", kind: "rack", size: result.objects[0]?.size });
  });
});

describe("the circuits of a store", () => {
  const circuit = (key: string, name = ""): DraftCircuit => ({ key, name, breaker: "", voltage: "" });
  const outlet = (key: string, offset: string): DraftFeature => feature(key, "outlet", { offset });
  /** Room A has two outlets on circuit `c1`. Room B has one outlet on circuit `c1` and a door. */
  const A = withOutletCircuit(withOutletCircuit(onWall(BOX, 0, [outlet("f1", "1"), outlet("f2", "2")]), "f1", "c1"), "f2", "c1");
  const B = withOutletCircuit(onWall(BOX, 1, [outlet("f1", "1"), feature("f2", "door", { offset: "2", width: "0.9" })]), "f1", "c1");
  const store: Store = { ...storeOf([A, B]), circuits: [circuit("c1", "Kitchen"), circuit("c2")] };
  const full: Store = { ...storeOf([BOX]), circuits: Array.from({ length: MOST_CIRCUITS }, (_, index) => circuit(`c${String(index + 1)}`)) };

  it("adds a circuit with a key that no circuit of the store has", () => {
    const one = withNewCircuit(storeOf([BOX]));
    expect(one.circuits).toEqual([circuit("c1")]);
    const two = withNewCircuit(one);
    expect(two.circuits.map((item) => item.key)).toEqual(["c1", "c2"]);
    expect(withNewCircuit(withoutCircuit(two, "c1")).circuits.map((item) => item.key)).toEqual(["c2", "c3"]);
    expect(withNewCircuit(full)).toBe(full);
  });

  it("changes the fields of one circuit", () => {
    expect(withCircuit(store, "c2", { name: "Hall", breaker: "20" }).circuits).toEqual([circuit("c1", "Kitchen"), { key: "c2", name: "Hall", breaker: "20", voltage: "" }]);
  });

  it("gives a circuit only to an outlet, and the empty key removes it", () => {
    expect(featureOf(A, "f1")).toMatchObject({ kind: "outlet", circuit: "c1" });
    expect(featureOf(withOutletCircuit(A, "f1", ""), "f1")).not.toHaveProperty("circuit");
    expect(featureOf(withOutletCircuit(B, "f2", "c1"), "f2")).not.toHaveProperty("circuit");
  });

  it("counts the outlets of a circuit and their rooms", () => {
    expect(circuitUse(store, "c1")).toEqual({ outlets: 3, rooms: 2 });
    expect(circuitUse(store, "c2")).toEqual({ outlets: 0, rooms: 0 });
  });

  it("removes a circuit from each outlet of each room", () => {
    const without = withoutCircuit(store, "c1");
    expect(without.circuits).toEqual([circuit("c2")]);
    expect(circuitUse(without, "c1")).toEqual({ outlets: 0, rooms: 0 });
    expect(featureOf(without.rooms[1] ?? BOX, "f1")).not.toHaveProperty("circuit");
    // A room with no outlet of the circuit stays the same draft.
    const second = withoutCircuit(store, "c2");
    expect(second.rooms[0]).toBe(store.rooms[0]);
    expect(withoutCircuit(store, "c9")).toBe(store);
  });

  it("keeps the circuits in its text, and removes each circuit that is not a circuit of the page", () => {
    expect(parseStore(storeText(store))).toEqual(store);
    const raw = JSON.parse(storeText(store)) as Record<string, unknown>;
    const circuits: readonly unknown[] = [
      { key: "c2", name: "A", breaker: "15", voltage: "" },
      { key: "c2", name: "B", breaker: "", voltage: "" },
      { key: "", name: "", breaker: "", voltage: "" },
      { key: "c3", name: 1, breaker: "", voltage: "" },
      { key: "c4", name: "", breaker: 15, voltage: "" },
      null,
    ];
    const parsed = parseStore(JSON.stringify({ ...raw, circuits }));
    expect(parsed?.circuits).toEqual([{ key: "c2", name: "A", breaker: "15", voltage: "" }]);
    // The circuit c1 is not in the store now, so no outlet keeps it.
    expect(parsed === undefined ? undefined : circuitUse(parsed, "c1")).toEqual({ outlets: 0, rooms: 0 });
  });

  it("reads a circuit of a feature: a text that is not a circuit refuses the store, and a door does not keep one", () => {
    const [first, ...others] = BOX.sides;
    const withFirst = (features: unknown): unknown => ({ version: 1, rooms: [{ ...BOX, sides: [{ ...first, features }, ...others] }], circuits: [circuit("c1")], active: 0 });
    expect(parseStore(JSON.stringify(withFirst([{ ...outlet("f1", "1"), circuit: 7 }])))).toBeUndefined();
    const door = feature("f1", "door", { offset: "1", width: "1" });
    expect(parseStore(JSON.stringify(withFirst([{ ...door, circuit: "c1" }])))?.rooms[0]).toEqual(onWall(BOX, 0, [door]));
  });

  it("adds the circuits of new rooms with new keys, and the outlets of the new rooms keep them", () => {
    const base = withNewCircuit(storeOf([BOX]));
    const room = withOutletCircuit(onWall(BOX, 0, [outlet("f1", "1")]), "f1", "c1");
    const next = withNewRooms(base, [room], [], false, [{ key: "c1", name: "Kitchen", breaker: "20", voltage: "" }]);
    expect(next.circuits).toEqual([circuit("c1"), { key: "c2", name: "Kitchen", breaker: "20", voltage: "" }]);
    expect(featureOf(next.rooms[1] ?? BOX, "f1")).toMatchObject({ circuit: "c2" });
    // An outlet of a circuit that the new rooms do not have gets no circuit.
    expect(featureOf(withNewRooms(base, [room], []).rooms[1] ?? BOX, "f1")).not.toHaveProperty("circuit");
    expect(withNewRooms(full, [room], [], false, [circuit("c1")])).toBe(full);
  });

  it("gives the survey record the circuits, and `draftKeys` gives the outlets their circuits again", () => {
    const records = { ids: new Map([["c1", "kitchen"]]), records: [{ id: "kitchen", name: "Kitchen", breaker: 20, voltage: 120, limit: 1920 }] };
    const survey = surveyOf(A, records);
    expect(survey.circuits).toEqual(records.records);
    expect(survey.outlets?.map((item) => item.circuit)).toEqual(["kitchen", "kitchen"]);
    expect(surveyOf(A)).not.toHaveProperty("circuits");
    expect(surveyOf(A).outlets?.map((item) => item.circuit)).toEqual([undefined, undefined]);
    expect(hasMore(survey)).toBe(false);
    const { draft } = draftKeys(survey, new Map([["kitchen", "c1"]]));
    expect(draft.sides[0]?.features.map((item) => item.circuit)).toEqual(["c1", "c1"]);
    expect(draftKeys(survey).draft.sides[0]?.features.map((item) => item.circuit)).toEqual([undefined, undefined]);
  });

  it("gives an id to each name, with a number for a name with no words and for a second name", () => {
    expect(idsOf(["Kitchen", "", "kitchen", " "], "circuit")).toEqual(["kitchen", "circuit-2", "kitchen-2", "circuit-4"]);
  });
});
