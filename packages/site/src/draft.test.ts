import { expandSurvey, type Survey } from "@mark1russell7/room-view";
import { SAMPLE_SURVEY } from "@mark1russell7/room-view/sample";
import { describe, expect, it } from "vitest";
import {
  angleOf,
  areaText,
  convertTyped,
  defaultMode,
  dimensionText,
  draftOf,
  emptyDraft,
  exampleDraft,
  fileName,
  hasMoreThanWalls,
  LENGTH_MODES,
  lengthText,
  numberOf,
  parseStore,
  readLength,
  sameDraft,
  statusOf,
  storeText,
  surveyOf,
  turnOf,
  typedOf,
  walksRight,
  withMode,
  withNewSide,
  withoutSide,
  withSide,
  type Corner,
  type Draft,
  type DraftSide,
  type LengthMode,
  type Status,
  type Store,
} from "./draft.ts";

type Wall = Omit<DraftSide, "key">;

/** This function gives a wall with one number for its length. */
function wall(length: string, corner: Corner = "left", angle = ""): Wall {
  return { length: { value: length, inches: "" }, corner, angle };
}

/** This function gives a draft with the walls of a list. */
function room(mode: LengthMode, walls: readonly Wall[]): Draft {
  return { ...emptyDraft(mode), sides: walls.map((item, index) => ({ key: `s${String(index + 1)}`, ...item })) };
}

function statusFor(draft: Draft): Status {
  return statusOf(draft, expandSurvey(surveyOf(draft)));
}

/** A triangle with the sides 4, 3 and 5: its corners have 90 degrees, 53.13 degrees and 36.87 degrees. */
const TRIANGLE = [wall("4"), wall("3", "angle", "53.13"), wall("5", "angle", "36.87")];

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
    });
  });

  it("writes feet and inches as inches", () => {
    const survey = surveyOf(exampleDraft("ft-in"));
    expect(survey.unit).toBe("in");
    expect(survey.height).toBe(96);
    expect(survey.wallThickness).toBe(4.5);
    expect(survey.sides.map((side) => side.length)).toEqual([144, 120, 144, 120]);
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

  it("reads the walls of the sample survey, and tells that the survey has more than walls", () => {
    const draft = draftOf(SAMPLE_SURVEY);
    expect(draft.name).toBe("Sample room");
    expect(draft.sides.map((side) => side.length.value)).toEqual(["6", "3", "2", "2", "4", "5"]);
    expect(draft.sides.map((side) => side.corner)).toEqual(["left", "left", "right", "left", "left", "left"]);
    expect(hasMoreThanWalls(SAMPLE_SURVEY)).toBe(true);
    expect(hasMoreThanWalls(surveyOf(draft))).toBe(false);
    expect(statusFor(draft).level).toBe("closed");
  });

  it("gives an empty field for a number that is not a length", () => {
    const draft = draftOf({ schema: "survey/1", unit: "m", height: Number.NaN, wallThickness: -1, sides: [{ id: "a", length: 0, turn: Number.POSITIVE_INFINITY }] });
    expect(draft.height).toEqual({ value: "", inches: "" });
    expect(draft.thickness).toEqual({ value: "", inches: "" });
    expect(draft.sides[0]).toEqual({ key: "s1", length: { value: "", inches: "" }, corner: "angle", angle: "" });
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
    expect(withNewSide(right).sides.at(-1)).toEqual({ key: "s5", length: { value: "", inches: "" }, corner: "right", angle: "" });
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
});

describe("the store", () => {
  const store: Store = { version: 1, rooms: [exampleDraft("ft-in"), room("m", TRIANGLE)], active: 1 };

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
    expect(parseStore(text)).toEqual({ version: 1, rooms: [exampleDraft("m")], active: 0 });
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
