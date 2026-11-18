import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Anchor } from "./anchors.ts";
import { checkRoom, checkScene } from "./check.ts";
import { markAddOn, type MarkLayer } from "./layers.fixture.ts";
import { checkLayers } from "./layers.ts";
import type { PlacedObject, PlanPoint, Wall } from "./room.ts";
import { SAMPLE_ROOM, SAMPLE_SCENE, SAMPLE_SURVEY } from "./sample.ts";
import { objectTransforms, sceneSolids, solidCorners } from "./solids.ts";
import {
  CLOSURE_LIMIT,
  convertSurvey,
  expandSurvey,
  resultScene,
  SQUARE_TURNS,
  SURVEY_FLOOR,
  SURVEY_SCHEMA,
  surveyAnchor,
  type Survey,
  type SurveyFrame,
  type SurveyObject,
  type SurveyResult,
  type SurveySide,
  type SurveyTurn,
} from "./survey.ts";
import { LENGTH_UNITS, metersPer, unitsPer } from "./units.ts";

/** The sides `s0`, `s1` and so on, from a list of lengths and a list of turns. */
function sides(lengths: readonly number[], turns: readonly SurveyTurn[]): SurveySide[] {
  return lengths.map((length, index) => ({ id: `s${index}`, length, turn: turns[index]! }));
}

/** A survey in meters with the sides of the argument, and a change. */
function survey(list: readonly SurveySide[], change: Partial<Survey> = {}): Survey {
  return { schema: "survey/2", unit: "m", height: 2.5, wallThickness: 0.15, sides: list, ...change };
}

const LEFT4: readonly SurveyTurn[] = ["left", "left", "left", "left"];
const RIGHT4: readonly SurveyTurn[] = ["right", "right", "right", "right"];

/** The line and the side of each wall. */
function lines(walls: readonly Wall[]): unknown {
  return walls.map((wall) => [wall.from, wall.to, wall.side]);
}

/** The turns of a triangle with the sides 4, 3 and 5: a square corner, then two measured angles in degrees. */
const AT_TOP = 180 - (Math.atan2(4, 3) * 180) / Math.PI;
const AT_START = 180 - (Math.atan2(3, 4) * 180) / Math.PI;

function expectPoint(point: PlanPoint | undefined, x: number, y: number, digits = 9): void {
  expect(point?.[0]).toBeCloseTo(x, digits);
  expect(point?.[1]).toBeCloseTo(y, digits);
}

describe("expandSurvey, a walk with square corners", () => {
  it("has the names of the format", () => {
    expect(SURVEY_SCHEMA).toBe("survey/2");
    expect(SQUARE_TURNS).toEqual(["left", "right"]);
    expect(CLOSURE_LIMIT).toBe(0.01);
  });

  it("makes a rectangle with exact corners from four lengths and four turns to the left", () => {
    const result = expandSurvey(survey(sides([4, 3, 4, 3], LEFT4)));
    expect(result.corners).toEqual([
      [0, 0],
      [4, 0],
      [4, 3],
      [0, 3],
    ]);
    expect(result.walk).toEqual([...result.corners, [0, 0]]);
    expect(result.closure).toEqual({ gap: 0, ratio: 0, turn: 0, closed: true });
    expect(result.room).toEqual({
      schema: "room/2",
      unit: "m",
      height: 2.5,
      wallThickness: 0.15,
      walls: [
        { id: "s0", from: [0, 0], to: [4, 0], side: "right" },
        { id: "s1", from: [4, 0], to: [4, 3], side: "right" },
        { id: "s2", from: [4, 3], to: [0, 3], side: "right" },
        { id: "s3", from: [0, 3], to: [0, 0], side: "right" },
      ],
      floors: [{ id: "floor", ring: result.corners }],
    });
    expect(result.checks).toEqual([]);
    expect(checkRoom(result.room)).toEqual([]);
  });

  it("puts each wall on the other side for a walk to the right, and keeps a counter-clockwise floor", () => {
    const layers = { "mark/1": marks({ on: "wall", wall: "s0", face: "left", offset: 1, height: 0.3 }) };
    const result = expandSurvey(survey(sides([4, 3, 4, 3], RIGHT4), { layers }), { addOns: [MARK] });
    expect(result.corners).toEqual([
      [0, 0],
      [4, 0],
      [4, -3],
      [0, -3],
    ]);
    expect(result.closure).toEqual({ gap: 0, ratio: 0, turn: 0, closed: true });
    expect(result.room.walls.map((wall) => wall.side)).toEqual(["left", "left", "left", "left"]);
    expect(result.room.floors?.[0]?.ring).toEqual([
      [0, -3],
      [4, -3],
      [4, 0],
      [0, 0],
    ]);
    // A mark on a wall is on the face in the room.
    expect(anchorsOf(result.layers)).toEqual([{ on: "wall", wall: "s0", face: "right", offset: 1, height: 0.3 }]);
    expect(checkRoom(result.room)).toEqual([]);
  });

  it("makes the outer walls of the sample room from six lengths and six turns", () => {
    const result = expandSurvey(survey(sides([6, 3, 2, 2, 4, 5], ["left", "left", "right", "left", "left", "left"])));
    expect(result.closure.closed).toBe(true);
    expect(lines(result.room.walls)).toEqual(lines(SAMPLE_ROOM.walls.slice(0, 6)));
    expect(checkRoom(result.room)).toEqual([]);
  });

  it("makes the sample room, with no nook, from the sample survey", () => {
    const result = expandSurvey(SAMPLE_SURVEY);
    expect(result.closure).toEqual({ gap: 0, ratio: 0, turn: 0, closed: true });
    expect(result.room.walls).toEqual(SAMPLE_ROOM.walls.slice(0, 6));
    expect(result.room.openings).toEqual(SAMPLE_ROOM.openings);
    expect(result.room.floors?.[0]?.ring).toEqual(SAMPLE_ROOM.walls.slice(0, 6).map((wall) => wall.from));
    expect(result.checks).toEqual([{ id: "diagonal", measured: 5, model: 5, difference: 0 }]);
    expect(checkRoom(result.room)).toEqual([]);
  });

  it("starts at `start` in the direction `heading`", () => {
    const result = expandSurvey(survey(sides([4, 3, 4, 3], LEFT4), { start: [10, 20], heading: 90 }));
    expect(result.corners).toEqual([
      [10, 20],
      [10, 24],
      [7, 24],
      [7, 20],
    ]);
    const turned = expandSurvey(survey(sides([4, 3, 4, 3], LEFT4), { heading: 45 }));
    expect(turned.closure.closed).toBe(true);
    expectPoint(turned.corners[1], Math.sqrt(8), Math.sqrt(8));
    expectPoint(turned.corners[3], 0 - Math.sqrt(4.5), Math.sqrt(4.5));
  });

  it("keeps the unit of the survey", () => {
    const result = expandSurvey(survey(sides([160, 120, 160, 120], LEFT4), { unit: "in", height: 96, wallThickness: 5 }));
    expect(result.room.unit).toBe("in");
    expect(result.corners[2]).toEqual([160, 120]);
    expect(result.closure.closed).toBe(true);
  });
});

describe("expandSurvey, the gap of a walk", () => {
  it("shares the gap between the sides of each axis, so a room with square corners keeps them", () => {
    const result = expandSurvey(survey(sides([4.02, 3, 4, 3], LEFT4)));
    expect(result.closure.closed).toBe(true);
    expect(result.closure.gap).toBeCloseTo(0.02, 12);
    expect(result.closure.ratio).toBeCloseTo(0.02 / 14.02, 12);
    // The two sides along the x axis get one length: the longer side loses the part that the shorter side gets.
    const width = 4.02 * (1 - 0.02 / 8.02);
    expect(width).toBeCloseTo(4 * (1 + 0.02 / 8.02), 12);
    expectPoint(result.corners[1], width, 0, 12);
    expect(result.corners[1]?.[1]).toBe(0);
    expect(result.corners[2]?.[0]).toBe(result.corners[1]?.[0]);
    expect(result.corners[2]?.[1]).toBe(3);
    expect(result.corners[3]).toEqual([0, 3]);
    // The walk is the measurement, with no correction.
    expect(result.walk[1]).toEqual([4.02, 0]);
    expectPoint(result.walk[4], 0.02, 0, 12);
    // The last wall ends at the first corner.
    expect(result.room.walls[3]?.to).toBe(result.corners[0]);
    expect(result.room.floors?.[0]?.ring).toBe(result.corners);
    expect(checkRoom(result.room)).toEqual([]);
  });

  it("does not close a walk with a gap above the limit", () => {
    const list = sides([4.02, 3, 4, 3], LEFT4);
    expect(expandSurvey(survey(list), { limit: 0.001 }).closure.closed).toBe(false);
    expect(expandSurvey(survey(list), { limit: 0.002 }).closure.closed).toBe(true);
    const far = expandSurvey(survey(sides([4.5, 3, 4, 3], LEFT4)));
    expect(far.closure.closed).toBe(false);
    expect(far.room.floors).toBeUndefined();
    expect(far.corners).toEqual(far.walk.slice(0, 4));
  });

  it("uses the default limit for a limit that is not a number of 0 or more", () => {
    const list = sides([4.02, 3, 4, 3], LEFT4);
    for (const limit of [Number.NaN, -1, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY]) {
      expect(expandSurvey(survey(list), { limit }).closure.closed, String(limit)).toBe(true);
    }
    expect(expandSurvey(survey(sides([4, 3, 4, 3], LEFT4)), { limit: 0 }).closure.closed).toBe(true);
    expect(expandSurvey(survey(list), { limit: 0 }).closure.closed).toBe(false);
  });

  it("shows a walk in progress: the walls follow the walk, and the room has no floor", () => {
    const result = expandSurvey(survey(sides([4, 3], ["left", "left"])));
    expect(result.closure).toEqual({ gap: 5, ratio: 5 / 7, turn: -180, closed: false });
    expect(lines(result.room.walls)).toEqual([
      [[0, 0], [4, 0], "right"],
      [[4, 0], [4, 3], "right"],
    ]);
    expect("floors" in result.room).toBe(false);
    expect(result.walk).toEqual([
      [0, 0],
      [4, 0],
      [4, 3],
    ]);
  });

  it("does not close a walk with a wrong square turn", () => {
    const wrong = expandSurvey(survey(sides([4, 3, 4, 3], ["left", "left", "right", "left"])));
    expect(wrong.closure).toEqual({ gap: 6, ratio: 6 / 14, turn: -180, closed: false });
    // The last turn does not move a corner, but a wrong last turn is a mistake too.
    const last = expandSurvey(survey(sides([4, 3, 4, 3], ["left", "left", "left", "right"])));
    expect(last.closure).toEqual({ gap: 0, ratio: 0, turn: -180, closed: false });
    expect(last.room.floors).toBeUndefined();
  });

  it("does not close a survey with fewer than 3 sides, or with no length", () => {
    expect(expandSurvey(survey([])).closure.closed).toBe(false);
    expect(expandSurvey(survey([])).walk).toEqual([[0, 0]]);
    expect(expandSurvey(survey(sides([4, 4], [180, 180]))).closure).toEqual({ gap: 0, ratio: 0, turn: 0, closed: false });
    expect(expandSurvey(survey(sides([0, 0, 0, 0], LEFT4))).closure).toEqual({ gap: 0, ratio: 0, turn: 0, closed: false });
  });
});

describe("expandSurvey, measured angles", () => {
  it("closes a triangle with exact angles", () => {
    const result = expandSurvey(survey(sides([4, 3, 5], ["left", AT_TOP, AT_START])));
    expect(result.closure.closed).toBe(true);
    expect(result.closure.gap).toBeCloseTo(0, 12);
    expectPoint(result.corners[1], 4, 0, 12);
    expectPoint(result.corners[2], 4, 3, 12);
    expect(result.room.floors?.[0]?.ring).toHaveLength(3);
  });

  it("gives each measured turn an equal part of a small error of the sum", () => {
    const result = expandSurvey(survey(sides([4, 3, 5], [90, AT_TOP + 1, AT_START])));
    expect(result.closure.turn).toBeCloseTo(1, 9);
    expect(result.closure.closed).toBe(true);
    // Each of the three turns loses a third of a degree, so the second side is not exactly along the y axis.
    const angle = ((90 - 1 / 3) * Math.PI) / 180;
    expectPoint(result.walk[2], 4 + 3 * Math.cos(angle), 3 * Math.sin(angle), 12);
    expect(result.closure.ratio).toBeLessThan(0.005);
  });

  it("keeps a square turn exact, and corrects only the measured turns", () => {
    const result = expandSurvey(survey(sides([4, 3, 5], ["left", AT_TOP + 1, AT_START])));
    expect(result.closure.turn).toBeCloseTo(1, 9);
    expect(result.closure.closed).toBe(true);
    // The side after the square corner stays along the y axis, in the walk and in the room record.
    expect(result.walk[2]).toEqual([4, 3]);
    expect(result.corners[1]?.[1]).toBe(0);
    expect(result.corners[2]?.[0]).toBe(result.corners[1]?.[0]);
    expectPoint(result.corners[2], 4, 3, 1);
  });

  it("accepts angles from a protractor with whole degrees", () => {
    const result = expandSurvey(survey(sides([4, 3, 5], ["left", 127, 143])));
    expect(result.closure.turn).toBe(0);
    expect(result.closure.closed).toBe(true);
    expect(result.closure.ratio).toBeLessThan(0.001);
    expectPoint(result.corners[2], 4, 3, 2);
  });

  it("does not correct a large error of the sum, because it is a mistake", () => {
    const large = expandSurvey(survey(sides([4, 3, 5], [90, AT_TOP + 50, AT_START])));
    expect(large.closure.turn).toBeCloseTo(50, 9);
    expect(large.closure.closed).toBe(false);
    expect(large.walk[2]).toEqual([4, 3]);
    // An error below 45 degrees gets a correction, but then the gap tells the mistake.
    const medium = expandSurvey(survey(sides([4, 3, 5], ["left", AT_TOP + 44, AT_START])));
    expect(medium.closure.closed).toBe(false);
    expect(medium.closure.ratio).toBeGreaterThan(0.1);
  });

  it("gives one measured turn the full error, when each other turn is square", () => {
    // The fourth corner of a rectangle has only one possible turn.
    const result = expandSurvey(survey(sides([4, 3, 4, 3], ["left", "left", "left", 80])));
    expect(result.closure.turn).toBe(-10);
    expect(result.closure.closed).toBe(true);
    expect(result.corners[3]).toEqual([0, 3]);
  });
});

describe("expandSurvey, the records of a survey", () => {
  it("gives the distance of each check in the room record, and the difference", () => {
    const result = expandSurvey(
      survey(sides([4, 3, 4, 3], LEFT4), {
        checks: [
          { id: "d1", from: "s0", to: "s2", length: 5 },
          { id: "d2", from: "s1", to: "s3", length: 5.02 },
          { id: "d3", from: "s0", to: "s9", length: 5 },
          { id: "d4", from: "s9", to: "s0", length: 5 },
        ],
      }),
    );
    expect(result.checks[0]).toEqual({ id: "d1", measured: 5, model: 5, difference: 0 });
    expect(result.checks[1]?.model).toBe(5);
    expect(result.checks[1]?.difference).toBeCloseTo(0.02, 12);
    expect(result.checks[2]).toEqual({ id: "d3", measured: 5, model: undefined, difference: undefined });
    expect(result.checks[3]).toEqual({ id: "d4", measured: 5, model: undefined, difference: undefined });
  });

  it("uses the first side of an `id` for a check", () => {
    const list = sides([4, 3, 4, 3], LEFT4).map((side, index) => (index === 3 ? { ...side, id: "s0" } : side));
    const result = expandSurvey(survey(list, { checks: [{ id: "d", from: "s0", to: "s2", length: 5 }] }));
    expect(result.checks[0]?.model).toBe(5);
  });

  it("passes the openings and the name", () => {
    const openings = [{ id: "door", wall: "s0", kind: "door", offset: 0.6, width: 0.9, height: 2.05 }] as const;
    const result = expandSurvey(survey(sides([4, 3, 4, 3], LEFT4), { name: "Study", openings }));
    expect(result.room.name).toBe("Study");
    expect(result.room.openings).toBe(openings);
    expect(result.room.floors?.[0]).toEqual({ id: "floor", name: "Study", ring: result.corners });
    expect(checkRoom(result.room)).toEqual([]);
  });

  it("keeps each opening at its place on a side that shares the gap", () => {
    const openings = [
      // The first opening ends at the end of its side, and the second opening has the full length of its side.
      { id: "end", wall: "s0", kind: "gap", offset: 3.12, width: 0.9, height: 2 },
      { id: "full", wall: "s2", kind: "gap", offset: 0, width: 4, height: 2 },
      { id: "same", wall: "s1", kind: "door", offset: 1, width: 0.9, height: 2 },
    ] as const;
    const result = expandSurvey(survey(sides([4.02, 3, 4, 3], LEFT4), { openings }));
    const width = 4.02 * (1 - 0.02 / 8.02);
    const [end, full, same] = result.room.openings ?? [];
    expect((end?.offset ?? 0) + (end?.width ?? 0)).toBeCloseTo(width, 12);
    expect(end?.width).toBeCloseTo((0.9 * width) / 4.02, 12);
    expect(full?.offset).toBe(0);
    expect(full?.width).toBeCloseTo(width, 12);
    // A side along the y axis has no gap to share, so its opening does not change.
    expect(same).toBe(openings[2]);
    expect(checkRoom(result.room)).toEqual([]);
    // A walk with no gap keeps the measured numbers, and an open walk also keeps them.
    expect(expandSurvey(survey(sides([4, 3, 4, 3], LEFT4), { openings })).room.openings).toBe(openings);
    expect(expandSurvey(survey(sides([4.5, 3, 4, 3], LEFT4), { openings })).room.openings).toBe(openings);
  });

  it("has no optional list that the survey does not have", () => {
    const room = expandSurvey(survey(sides([4, 3, 4, 3], LEFT4))).room;
    for (const field of ["name", "openings"]) expect(field in room, field).toBe(false);
    expect("name" in (room.floors?.[0] ?? {})).toBe(false);
  });

  it("passes the thickness and the height of a side to its wall", () => {
    const list = sides([4, 3, 4, 3], LEFT4).map((side, index) => (index === 1 ? { ...side, thickness: 0.3, height: 2.2 } : side));
    const walls = expandSurvey(survey(list)).room.walls;
    expect(walls[1]).toEqual({ id: "s1", from: [4, 0], to: [4, 3], side: "right", thickness: 0.3, height: 2.2 });
    expect("thickness" in walls[0]!).toBe(false);
    expect("height" in walls[0]!).toBe(false);
  });
});

/** Each number of a result, for a check that it is finite. */
function numbersOf(result: SurveyResult): number[] {
  const walls = result.room.walls.flatMap((wall) => [...wall.from, ...wall.to]);
  const floors = (result.room.floors ?? []).flatMap((floor) => floor.ring.flat());
  return [...result.corners.flat(), ...result.walk.flat(), ...walls, ...floors, result.closure.gap, result.closure.ratio, result.closure.turn];
}

describe("expandSurvey, values that are not possible", () => {
  it("counts a length that is not a finite number above 0 as 0", () => {
    const result = expandSurvey(survey(sides([Number.NaN, 3, -1, Number.POSITIVE_INFINITY, 2], ["left", "left", "left", "left", "left"])));
    expect(result.walk).toEqual([
      [0, 0],
      [0, 0],
      [0, 3],
      [0, 3],
      [0, 3],
      [2, 3],
    ]);
    expect(result.closure.closed).toBe(false);
  });

  it("counts a length above the range of the model as 0", () => {
    // 1 000 km is 39 370 079 inches.
    expect(expandSurvey(survey(sides([5e7, 3], ["left", "left"]), { unit: "in" })).walk[1]).toEqual([0, 0]);
    expect(expandSurvey(survey(sides([3e7, 3], ["left", "left"]), { unit: "in" })).walk[1]).toEqual([3e7, 0]);
  });

  it("counts a turn that is not a number from -360 to 360 as 0", () => {
    for (const turn of [Number.NaN, Number.POSITIVE_INFINITY, 361, -1e308, "up" as unknown as SurveyTurn]) {
      const result = expandSurvey(survey(sides([4, 3], [turn, "left"])));
      expect(result.walk, String(turn)).toEqual([
        [0, 0],
        [4, 0],
        [7, 0],
      ]);
      expect(result.closure.turn, String(turn)).toBe(-270);
    }
  });

  it("uses the default for a `start` or a `heading` that is not a finite number", () => {
    const list = sides([4, 3, 4, 3], LEFT4);
    const expected = expandSurvey(survey(list)).corners;
    expect(expandSurvey(survey(list, { start: [Number.NaN, 5] })).corners).toEqual(expected);
    expect(expandSurvey(survey(list, { start: [5, 1e12] })).corners).toEqual(expected);
    expect(expandSurvey(survey(list, { heading: Number.POSITIVE_INFINITY })).corners).toEqual(expected);
    expect(expandSurvey(survey(list, { heading: Number.NaN })).corners).toEqual(expected);
  });
});

const turnArbitrary: fc.Arbitrary<SurveyTurn> = fc.oneof(fc.constantFrom<SurveyTurn>("left", "right"), fc.double(), fc.double({ min: -180, max: 180, noNaN: true }));
const sidesArbitrary = fc
  .array(fc.record({ length: fc.oneof(fc.double(), fc.double({ min: 0, max: 100, noNaN: true })), turn: turnArbitrary }), { maxLength: 12 })
  .map((list) => list.map((side, index): SurveySide => ({ id: `s${index}`, ...side })));

describe("expandSurvey, the laws", () => {
  it("gives finite numbers for each survey, and a closed room for each closed walk", () => {
    fc.assert(
      fc.property(sidesArbitrary, fc.option(fc.double(), { nil: undefined }), fc.constantFrom("m", "mm", "ft"), (list, heading, unit) => {
        const result = expandSurvey(survey(list, { unit, heading }));
        for (const value of numbersOf(result)) expect(Number.isFinite(value)).toBe(true);
        const walls = result.room.walls;
        expect(walls).toHaveLength(list.length);
        expect(result.corners).toHaveLength(list.length);
        expect(result.walk).toHaveLength(list.length + 1);
        walls.forEach((wall, index) => {
          expect(wall.from).toBe(result.corners[index]);
          expect(wall.to).toBe(result.closure.closed ? result.corners[(index + 1) % list.length] : result.walk[index + 1]);
        });
        expect(result.room.floors === undefined).toBe(!result.closure.closed);
        if (result.closure.closed) expect(result.room.floors?.[0]?.ring).toHaveLength(list.length);
      }),
    );
  });

  it("closes each rectangle, in the two directions of the walk and with each first side", () => {
    const length = fc.double({ min: 0.5, max: 50, noNaN: true });
    fc.assert(
      fc.property(length, length, fc.boolean(), fc.double({ min: -360, max: 360, noNaN: true }), (width, depth, toLeft, heading) => {
        const turn = toLeft ? "left" : "right";
        const result = expandSurvey(survey(sides([width, depth, width, depth], [turn, turn, turn, turn]), { heading }));
        expect(result.closure.closed).toBe(true);
        expect(result.closure.ratio).toBeLessThan(1e-12);
        expect(result.room.walls.every((wall) => wall.side === (toLeft ? "right" : "left"))).toBe(true);
        expect(checkRoom(result.room).filter((finding) => finding.level === "error")).toEqual([]);
      }),
    );
  });

  it("gives the same room at two times the size for two times each length", () => {
    const length = fc.double({ min: 0.5, max: 50, noNaN: true });
    const turn = fc.oneof(fc.constantFrom<SurveyTurn>("left", "right"), fc.double({ min: -180, max: 180, noNaN: true }));
    const list = fc.array(fc.record({ length, turn }), { minLength: 1, maxLength: 10 });
    fc.assert(
      fc.property(list, (records) => {
        const small = expandSurvey(survey(records.map((side, index) => ({ id: `s${index}`, ...side }))));
        const large = expandSurvey(survey(records.map((side, index) => ({ id: `s${index}`, length: side.length * 2, turn: side.turn }))));
        expect(large.closure.closed).toBe(small.closure.closed);
        expect(large.closure.ratio).toBe(small.closure.ratio);
        expect(large.corners).toEqual(small.corners.map(([x, y]) => [x * 2, y * 2]));
      }),
    );
  });
});

describe("convertSurvey", () => {
  it("has the factor between two units", () => {
    expect(unitsPer("ft", "in")).toBe(12);
    expect(unitsPer("m", "mm")).toBe(1000);
    expect(unitsPer("in", "mm")).toBe(25.4);
    expect(unitsPer("m", "m")).toBe(1);
    for (const unit of LENGTH_UNITS) expect(unitsPer(unit, "m"), unit).toBe(metersPer(unit));
  });

  it("gives the same record for the same unit", () => {
    expect(convertSurvey(SAMPLE_SURVEY, "m")).toBe(SAMPLE_SURVEY);
  });

  it("changes each length, and keeps each turn, each angle and each `id`", () => {
    const feet = survey(
      [
        { id: "a", length: 12.5, turn: "left", thickness: 0.5, height: 7.5 },
        { id: "b", length: 6.5, turn: 60 },
      ],
      {
        name: "Study",
        unit: "ft",
        height: 8,
        wallThickness: 0.5,
        start: [1.5, -2],
        heading: 30,
        checks: [{ id: "d", from: "a", to: "b", length: 0.75 }],
        openings: [
          { id: "w", wall: "a", kind: "window", offset: 1.5, width: 3, sill: 2.5, height: 4 },
          { id: "g", wall: "b", kind: "gap", offset: 0.5, width: 3, height: 6.5 },
        ],
      },
    );
    expect(convertSurvey(feet, "in")).toEqual({
      schema: "survey/2",
      name: "Study",
      unit: "in",
      height: 96,
      wallThickness: 6,
      sides: [
        { id: "a", length: 150, turn: "left", thickness: 6, height: 90 },
        { id: "b", length: 78, turn: 60 },
      ],
      start: [18, -24],
      heading: 30,
      checks: [{ id: "d", from: "a", to: "b", length: 9 }],
      openings: [
        { id: "w", wall: "a", kind: "window", offset: 18, width: 36, sill: 30, height: 48 },
        { id: "g", wall: "b", kind: "gap", offset: 6, width: 36, height: 78 },
      ],
    });
  });

  it("does not add a field that the survey does not have", () => {
    const small = survey(sides([3, 3], ["left", "left"]));
    const changed = convertSurvey(small, "cm");
    expect(Object.keys(changed)).toEqual(Object.keys(small));
    expect(Object.keys(changed.sides[0] ?? {})).toEqual(["id", "length", "turn"]);
    expect(changed.sides.map((side) => side.length)).toEqual([300, 300]);
  });

  it("does not change the survey", () => {
    const text = JSON.stringify(SAMPLE_SURVEY);
    convertSurvey(SAMPLE_SURVEY, "in");
    expect(JSON.stringify(SAMPLE_SURVEY)).toBe(text);
  });

  it("gives the same room in the different unit", () => {
    const own = expandSurvey(SAMPLE_SURVEY);
    const other = expandSurvey(convertSurvey(SAMPLE_SURVEY, "mm"));
    expect(other.room.unit).toBe("mm");
    expect(other.closure.closed).toBe(true);
    expect(other.corners).toHaveLength(own.corners.length);
    own.corners.forEach(([x, y], index) => expectPoint(other.corners[index], x * 1000, y * 1000, 6));
    expect(checkRoom(other.room)).toEqual([]);
  });
});

/** An object of a survey with a width of 1, a depth of 0.5 and a height of 0.8, and a change. */
function box(id: string, change: Partial<SurveyObject> = {}): SurveyObject {
  return { id, kind: "desk", offset: 0, width: 1, depth: 0.5, height: 0.8, ...change };
}

/** The placed objects of a room of 4 by 3. */
function placedIn(turns: readonly SurveyTurn[], objects: readonly SurveyObject[]): readonly PlacedObject[] {
  return expandSurvey(survey(sides([4, 3, 4, 3], turns), { objects })).objects;
}

/** The limits of a placed object in the model, in the frame of a side: along the side from its first corner, into the room from its face, and up. */
function limits(result: SurveyResult, id: string, side: number, toLeft = true): Record<"near" | "far" | "back" | "front" | "bottom" | "top", number> {
  const solid = sceneSolids({ schema: "scene/2", room: result.room, objects: result.objects }).find((item) => item.kind === "object" && item.source === id);
  const wall = result.room.walls[side]!;
  const length = Math.hypot(wall.to[0] - wall.from[0], wall.to[1] - wall.from[1]);
  const along: PlanPoint = [(wall.to[0] - wall.from[0]) / length, (wall.to[1] - wall.from[1]) / length];
  const inward: PlanPoint = toLeft ? [0 - along[1], along[0]] : [along[1], 0 - along[0]];
  const corners = solid === undefined ? [] : solidCorners(solid);
  const a = corners.map((corner) => (corner.x - wall.from[0]) * along[0] + (corner.y - wall.from[1]) * along[1]);
  const b = corners.map((corner) => (corner.x - wall.from[0]) * inward[0] + (corner.y - wall.from[1]) * inward[1]);
  const z = corners.map((corner) => corner.z);
  return { near: Math.min(...a), far: Math.max(...a), back: Math.min(...b), front: Math.max(...b), bottom: Math.min(...z), top: Math.max(...z) };
}

function expectLimits(given: ReturnType<typeof limits>, near: number, far: number, back: number, front: number, bottom: number, top: number, digits = 9): void {
  expect(given.near).toBeCloseTo(near, digits);
  expect(given.far).toBeCloseTo(far, digits);
  expect(given.back).toBeCloseTo(back, digits);
  expect(given.front).toBeCloseTo(front, digits);
  expect(given.bottom).toBeCloseTo(bottom, digits);
  expect(given.top).toBeCloseTo(top, digits);
}

describe("expandSurvey, the objects of a survey", () => {
  it("gives no object for a survey with no object", () => {
    expect(expandSurvey(survey(sides([4, 3, 4, 3], LEFT4))).objects).toEqual([]);
    expect(placedIn(LEFT4, [])).toEqual([]);
    expect(expandSurvey(survey([], { objects: [box("a", { wall: "s0" })] })).objects).toEqual([]);
  });

  it("puts an object at the inner face of each side of a walk to the left, with its x axis along the side", () => {
    const objects = [0, 1, 2, 3].map((side) => box(`o${side}`, { wall: `s${side}`, offset: 0.5 }));
    expect(placedIn(LEFT4, objects)).toEqual([
      { id: "o0", kind: "desk", size: [1, 0.5, 0.8], at: [1, 0.25] },
      { id: "o1", kind: "desk", size: [1, 0.5, 0.8], at: [3.75, 1], turn: 90 },
      { id: "o2", kind: "desk", size: [1, 0.5, 0.8], at: [3, 2.75], turn: 180 },
      { id: "o3", kind: "desk", size: [1, 0.5, 0.8], at: [0.25, 2], turn: 270 },
    ]);
  });

  it("puts an object in the room of a walk to the right, with its x axis against the side", () => {
    const objects = [0, 1, 2, 3].map((side) => box(`o${side}`, { wall: `s${side}`, offset: 0.5 }));
    // The room is below the first side. The y axis of each object points into the room.
    expect(placedIn(RIGHT4, objects)).toEqual([
      { id: "o0", kind: "desk", size: [1, 0.5, 0.8], at: [1, -0.25], turn: 180 },
      { id: "o1", kind: "desk", size: [1, 0.5, 0.8], at: [3.75, -1], turn: 90 },
      { id: "o2", kind: "desk", size: [1, 0.5, 0.8], at: [3, -2.75] },
      { id: "o3", kind: "desk", size: [1, 0.5, 0.8], at: [0.25, -2], turn: 270 },
    ]);
    const result = expandSurvey(survey(sides([4, 3, 4, 3], RIGHT4), { objects }));
    expect(checkScene({ schema: "scene/2", room: result.room, objects: result.objects })).toEqual([]);
    [0, 1, 2, 3].forEach((side) => expectLimits(limits(result, `o${side}`, side, false), 0.5, 1.5, 0, 0.5, 0, 0.8));
  });

  it("moves an object out from the face by its gap, and up by its lift", () => {
    const result = expandSurvey(survey(sides([4, 3, 4, 3], LEFT4), { objects: [box("a", { wall: "s1", offset: 1, gap: 0.2, lift: 1.1 })] }));
    expect(result.objects).toEqual([{ id: "a", kind: "desk", size: [1, 0.5, 0.8], at: [3.55, 1.5], lift: 1.1, turn: 90 }]);
    expectLimits(limits(result, "a", 1), 1, 2, 0.2, 0.7, 1.1, 1.9);
  });

  it("passes the class and the name, and adds no field", () => {
    const [named, plain] = placedIn(LEFT4, [box("a", { kind: "rack", name: "Rack", wall: "s0", lift: 0 }), box("b", { wall: "s0", offset: 2 })]);
    expect(named).toEqual({ id: "a", kind: "rack", name: "Rack", size: [1, 0.5, 0.8], at: [0.5, 0.25], lift: 0 });
    expect(Object.keys(plain ?? {})).toEqual(["id", "kind", "size", "at"]);
  });

  it("puts an object on its holder: its place is relative to the holder, and its bottom is on the top of the holder", () => {
    const desk = box("desk", { wall: "s0", offset: 1, width: 1.6, depth: 0.8, height: 0.75 });
    const display = box("display", { kind: "display", on: "desk", offset: 0.2, width: 0.6, depth: 0.2, height: 0.4, gap: 0.1 });
    const result = expandSurvey(survey(sides([4, 3, 4, 3], LEFT4), { objects: [desk, display] }));
    const placed = result.objects[1];
    expect(placed?.parent).toBe("desk");
    expect(placed?.lift).toBe(0.75);
    expect(placed?.turn).toBeUndefined();
    expectPoint(placed?.at, -0.3, -0.2, 12);
    // The near edge of the display is 0.2 from the near edge of the desk, and its back is 0.1 from the back of the desk.
    expectLimits(limits(result, "display", 0), 1.2, 1.8, 0.1, 0.3, 0.75, 1.15);
    expect(checkScene({ schema: "scene/2", room: result.room, objects: result.objects })).toEqual([]);
  });

  it("measures an object on its holder from the near edge of the holder for each side and each direction of the walk", () => {
    for (const turns of [LEFT4, RIGHT4]) {
      const toLeft = turns === LEFT4;
      for (const side of [0, 1, 2, 3]) {
        const rack = box("rack", { wall: `s${side}`, offset: 0.4, width: 0.6, depth: 0.8, height: 1.2, gap: 0.1 });
        const node = box("node", { on: "rack", offset: 0.05, width: 0.4, depth: 0.6, height: 0.2, gap: 0.15, lift: 0.3 });
        const result = expandSurvey(survey(sides([4, 3, 4, 3], turns), { objects: [rack, node] }));
        expectLimits(limits(result, "rack", side, toLeft), 0.4, 1, 0.1, 0.9, 0, 1.2);
        expectLimits(limits(result, "node", side, toLeft), 0.45, 0.85, 0.25, 0.85, 0.3, 0.5);
      }
    }
  });

  it("follows each holder of a holder, and gives the objects in the sequence of the survey", () => {
    const node = box("node", { on: "rack", offset: 0.1, width: 0.4, depth: 0.4, height: 0.2, lift: 0.5 });
    const rack = box("rack", { on: "base", offset: 0.2, width: 0.6, depth: 0.5, height: 1.2 });
    const base = box("base", { wall: "s2", offset: 1, width: 1, depth: 0.5, height: 0.1 });
    const result = expandSurvey(survey(sides([4, 3, 4, 3], LEFT4), { objects: [node, rack, base] }));
    expect(result.objects.map((object) => [object.id, object.parent, object.lift])).toEqual([
      ["node", "rack", 0.5],
      ["rack", "base", 0.1],
      ["base", undefined, undefined],
    ]);
    expectLimits(limits(result, "base", 2), 1, 2, 0, 0.5, 0, 0.1);
    expectLimits(limits(result, "rack", 2), 1.2, 1.8, 0, 0.5, 0.1, 1.3);
    expectLimits(limits(result, "node", 2), 1.3, 1.7, 0, 0.4, 0.6, 0.8);
  });

  it("uses the holder when an object has a holder and a side", () => {
    const [, placed] = placedIn(LEFT4, [box("desk", { wall: "s0" }), box("lamp", { wall: "s2", on: "desk", width: 0.2, depth: 0.2 })]);
    expect(placed?.parent).toBe("desk");
    expect(placed?.turn).toBeUndefined();
    expectPoint(placed?.at, -0.4, -0.15, 12);
  });

  it("uses the first side of an `id` and the first object of an `id`", () => {
    const list = sides([4, 3, 4, 3], LEFT4).map((side, index) => (index === 2 ? { ...side, id: "s0" } : side));
    const objects = [box("a", { wall: "s0", width: 2 }), box("a", { wall: "s1", width: 1 }), box("b", { on: "a", width: 0.5 })];
    const result = expandSurvey(survey(list, { objects })).objects;
    expect(result.map((object) => object.at)).toEqual([
      [1, 0.25],
      [3.75, 0.5],
      [-0.75, 0],
    ]);
  });

  it("gives no place to an object with no side, no holder, or a ring of holders", () => {
    const objects = [
      box("no-side", { wall: "s9" }),
      box("nothing"),
      box("no-holder", { on: "s0" }),
      box("self", { on: "self" }),
      box("ring-1", { on: "ring-2" }),
      box("ring-2", { on: "ring-3" }),
      box("ring-3", { on: "ring-1" }),
      box("on-ring", { on: "ring-1" }),
      box("on-nothing", { on: "nothing" }),
      box("good", { wall: "s0" }),
      box("on-good", { on: "good", width: 0.5 }),
    ];
    expect(placedIn(LEFT4, objects).map((object) => object.id)).toEqual(["good", "on-good"]);
  });

  it("gives no place to an object with a size or a distance that is not possible", () => {
    const bad: Partial<SurveyObject>[] = [
      { width: 0 },
      { depth: -1 },
      { height: Number.NaN },
      { width: Number.POSITIVE_INFINITY },
      { depth: 2e6 },
      { offset: Number.NaN },
      { offset: 2e6 },
      { gap: Number.NEGATIVE_INFINITY },
      { lift: Number.NaN },
    ];
    const objects = bad.flatMap((change, index) => [box(`wall-${index}`, { wall: "s0", ...change }), box(`held-${index}`, { on: "good", ...change })]);
    expect(placedIn(LEFT4, [box("good", { wall: "s0" }), ...objects]).map((object) => object.id)).toEqual(["good"]);
    // A distance below 0 is possible: the object goes past the corner or into the wall, and `checkScene` tells it.
    const past = expandSurvey(survey(sides([4, 3, 4, 3], LEFT4), { objects: [box("past", { wall: "s0", offset: -0.5, gap: -0.25 })] }));
    expect(past.objects).toEqual([{ id: "past", kind: "desk", size: [1, 0.5, 0.8], at: [0, 0] }]);
    expect(checkScene({ schema: "scene/2", room: past.room, objects: past.objects }).map((finding) => finding.code)).toContain("object-in-wall");
  });

  it("gives no place to an object on a side with no length", () => {
    const list = sides([4, Number.NaN, 0, 3], LEFT4);
    const objects = [0, 1, 2, 3].map((side) => box(`o${side}`, { wall: `s${side}` }));
    expect(expandSurvey(survey(list, { objects })).objects.map((object) => object.id)).toEqual(["o0", "o3"]);
  });

  it("keeps the size of an object on a side that shares the gap, and the touch of each corner", () => {
    const objects = [
      box("first", { wall: "s0", offset: 0 }),
      box("middle", { wall: "s0", offset: 1.51 }),
      box("last", { wall: "s0", offset: 3.02 }),
      box("short-last", { wall: "s2", offset: 3 }),
      box("long", { wall: "s0", offset: 0.5, width: 5 }),
      box("on-last", { on: "last", offset: 0.25, width: 0.5 }),
    ];
    const result = expandSurvey(survey(sides([4.02, 3, 4, 3], LEFT4), { objects }));
    const line = result.corners[1]![0];
    expect(result.closure.closed).toBe(true);
    expect(line).toBeLessThan(4.02);
    expect(line).toBeGreaterThan(4);
    expectLimits(limits(result, "first", 0), 0, 1, 0, 0.5, 0, 0.8, 12);
    // The object in the middle of the free length stays in the middle.
    expectLimits(limits(result, "middle", 0), (line - 1) / 2, (line + 1) / 2, 0, 0.5, 0, 0.8, 12);
    expectLimits(limits(result, "last", 0), line - 1, line, 0, 0.5, 0, 0.8, 12);
    expectLimits(limits(result, "short-last", 2), line - 1, line, 0, 0.5, 0, 0.8, 12);
    // An object that is longer than its side has no free length. Its near edge moves as the near edge of an opening.
    expectLimits(limits(result, "long", 0), (0.5 * line) / 4.02, (0.5 * line) / 4.02 + 5, 0, 0.5, 0, 0.8, 12);
    expectLimits(limits(result, "on-last", 0), line - 0.75, line - 0.25, 0, 0.5, 0.8, 1.6, 12);
    for (const object of result.objects) expect(object.size[0], object.id).toBe(object.id === "long" ? 5 : object.id === "on-last" ? 0.5 : 1);
  });

  it("puts an object at its measured offset when the walk is not closed", () => {
    const result = expandSurvey(survey(sides([4.5, 3, 4, 3], LEFT4), { objects: [box("a", { wall: "s2", offset: 3 }), box("b", { wall: "s0", offset: 3.5 })] }));
    expect(result.closure.closed).toBe(false);
    expectLimits(limits(result, "a", 2), 3, 4, 0, 0.5, 0, 0.8, 12);
    expectLimits(limits(result, "b", 0), 3.5, 4.5, 0, 0.5, 0, 0.8, 12);
  });

  it("gives the objects of the sample scene from the measurements of the sample survey", () => {
    const result = expandSurvey(SAMPLE_SURVEY);
    const scene = { schema: "scene/2", room: result.room, objects: result.objects } as const;
    expect(result.objects.map((object) => [object.id, object.kind, object.name, object.parent])).toEqual(
      (SAMPLE_SCENE.objects ?? []).map((object) => [object.id, object.kind, object.name, object.parent]),
    );
    expect(checkScene(scene)).toEqual([]);
    const own = objectTransforms(scene);
    const sample = objectTransforms(SAMPLE_SCENE);
    for (const object of SAMPLE_SCENE.objects ?? []) {
      const position = own.get(object.id)?.position;
      const expected = sample.get(object.id)?.position;
      expect(position?.x, object.id).toBeCloseTo(expected?.x ?? Number.NaN, 12);
      expect(position?.y, object.id).toBeCloseTo(expected?.y ?? Number.NaN, 12);
      expect(position?.z, object.id).toBeCloseTo(expected?.z ?? Number.NaN, 12);
      expect(result.objects.find((item) => item.id === object.id)?.size, object.id).toEqual(object.size);
    }
  });

  it("does not change the survey", () => {
    const text = JSON.stringify(SAMPLE_SURVEY);
    expandSurvey(SAMPLE_SURVEY);
    expect(JSON.stringify(SAMPLE_SURVEY)).toBe(text);
  });
});

describe("expandSurvey, the laws of the objects", () => {
  const length = fc.double({ min: 2, max: 50, noNaN: true });
  const part = fc.double({ min: 0, max: 1, noNaN: true });
  const heading = fc.double({ min: -360, max: 360, noNaN: true });

  it("puts each object at its measurements from its side, for each rectangle, each direction and each heading", () => {
    fc.assert(
      fc.property(length, length, fc.boolean(), heading, fc.nat({ max: 3 }), fc.tuple(part, part, part, part, part), (width, depth, toLeft, turned, side, [p1, p2, p3, p4, p5]) => {
        const turn = toLeft ? "left" : "right";
        const lengths = [width, depth, width, depth];
        const along = lengths[side]!;
        const across = lengths[(side + 1) % 4]!;
        const object = box("a", { wall: `s${side}`, width: along * (0.1 + 0.8 * p1), depth: across * (0.1 + 0.8 * p3), lift: 1.5 * p5 });
        const offset = (along - object.width) * p2;
        const gap = (across - object.depth) * p4;
        const result = expandSurvey(survey(sides(lengths, [turn, turn, turn, turn]), { heading: turned, objects: [{ ...object, offset, gap }] }));
        expect(result.objects).toHaveLength(1);
        expectLimits(limits(result, "a", side, toLeft), offset, offset + object.width, gap, gap + object.depth, 1.5 * p5, 1.5 * p5 + 0.8);
        // The object is in the room: it is on the floor, and it is in no wall.
        expect(checkScene({ schema: "scene/2", room: result.room, objects: result.objects })).toEqual([]);
      }),
    );
  });

  it("puts each object on a holder at its measurements from the holder", () => {
    fc.assert(
      fc.property(length, length, fc.boolean(), heading, fc.nat({ max: 3 }), fc.tuple(part, part, part, part), fc.option(part, { nil: undefined }), (width, depth, toLeft, turned, side, [p1, p2, p3, p4], lift) => {
        const turn = toLeft ? "left" : "right";
        const holder = box("holder", { wall: `s${side}`, offset: 0.3, width: 1.2, depth: 0.9, height: 0.7, gap: 0.2, lift: 0.1 });
        const held = box("held", { on: "holder", width: 1.2 * (0.1 + 0.8 * p1), depth: 0.9 * (0.1 + 0.8 * p3), height: 0.3, ...(lift === undefined ? {} : { lift }) });
        const offset = (1.2 - held.width) * p2;
        const gap = (0.9 - held.depth) * p4;
        const result = expandSurvey(survey(sides([width, depth, width, depth], [turn, turn, turn, turn]), { heading: turned, objects: [{ ...held, offset, gap }, holder] }));
        expect(result.objects.map((object) => object.id)).toEqual(["held", "holder"]);
        const bottom = 0.1 + (lift ?? 0.7);
        expectLimits(limits(result, "holder", side, toLeft), 0.3, 1.5, 0.2, 1.1, 0.1, 0.8);
        expectLimits(limits(result, "held", side, toLeft), 0.3 + offset, 0.3 + offset + held.width, 0.2 + gap, 0.2 + gap + held.depth, bottom, bottom + 0.3);
      }),
    );
  });

  it("gives finite numbers for the objects of each survey", () => {
    const value = fc.oneof(fc.double(), fc.double({ min: -5, max: 5, noNaN: true }));
    const name = fc.constantFrom("s0", "s1", "s2", "s9", "a", "b", "c");
    const object = fc.record({
      id: fc.constantFrom("a", "b", "c"),
      wall: fc.option(name, { nil: undefined }),
      on: fc.option(name, { nil: undefined }),
      offset: value,
      width: value,
      depth: value,
      height: value,
      gap: fc.option(value, { nil: undefined }),
      lift: fc.option(value, { nil: undefined }),
    });
    fc.assert(
      fc.property(sidesArbitrary, fc.array(object, { maxLength: 6 }), (list, objects) => {
        const given = objects.map((item): SurveyObject => ({ kind: "desk", ...item }));
        const result = expandSurvey(survey(list, { objects: given }));
        expect(result.objects.length).toBeLessThanOrEqual(given.length);
        for (const placed of result.objects) {
          for (const number of [...placed.size, ...placed.at, placed.lift ?? 0, placed.turn ?? 0]) expect(Number.isFinite(number)).toBe(true);
          expect(placed.size.every((size) => size > 0)).toBe(true);
          expect(placed.turn === undefined || (placed.turn > 0 && placed.turn < 360)).toBe(true);
          // A parent is an object of the result. Thus the model has each object of the result.
          if (placed.parent !== undefined) expect(result.objects.some((other) => other.id === placed.parent)).toBe(true);
        }
        const solids = sceneSolids({ schema: "scene/2", room: result.room, objects: result.objects }).filter((solid) => solid.kind === "object");
        expect(solids.length).toBeLessThanOrEqual(result.objects.length);
      }),
    );
  });
});

describe("convertSurvey, the objects of a survey", () => {
  it("changes each length of an object, and adds no field", () => {
    const feet = survey(sides([12, 10, 12, 10], LEFT4), {
      unit: "ft",
      objects: [
        { id: "desk", kind: "desk", name: "Desk", wall: "s0", offset: 1.5, width: 5, depth: 2.5, height: 2.5, gap: 0.25, lift: 0.5 },
        { id: "lamp", kind: "lamp", on: "desk", offset: 0.5, width: 1, depth: 0.75, height: 1.5 },
      ],
    });
    expect(convertSurvey(feet, "in").objects).toEqual([
      { id: "desk", kind: "desk", name: "Desk", wall: "s0", offset: 18, width: 60, depth: 30, height: 30, gap: 3, lift: 6 },
      { id: "lamp", kind: "lamp", on: "desk", offset: 6, width: 12, depth: 9, height: 18 },
    ]);
    expect(Object.keys(convertSurvey(feet, "in").objects?.[1] ?? {})).toEqual(Object.keys(feet.objects?.[1] ?? {}));
  });

  it("gives the same objects in the different unit", () => {
    const own = expandSurvey(SAMPLE_SURVEY).objects;
    const other = expandSurvey(convertSurvey(SAMPLE_SURVEY, "mm")).objects;
    expect(other).toHaveLength(own.length);
    own.forEach((object, index) => {
      const same = other[index];
      expect(same?.id).toBe(object.id);
      expect(same?.parent).toBe(object.parent);
      expect(same?.turn).toBe(object.turn);
      expectPoint(same?.at, object.at[0] * 1000, object.at[1] * 1000, 6);
      expect(same?.lift ?? 0).toBeCloseTo((object.lift ?? 0) * 1000, 6);
      object.size.forEach((size, axis) => expect(same?.size[axis]).toBeCloseTo(size * 1000, 6));
    });
  });
});

/** A layer of the test add-on with one mark at each anchor. The marks have the ids `m0`, `m1` and so on. */
function marks(...anchors: readonly Anchor[]): MarkLayer {
  return { marks: anchors.map((anchor, index) => ({ id: `m${index}`, anchor, size: 1 })) };
}

/** The anchors of the layer `mark/1` of a record of layers, in the order of the marks. */
function anchorsOf(layers: Readonly<Record<string, unknown>> | undefined): readonly Anchor[] {
  return ((layers?.["mark/1"] as MarkLayer | undefined)?.marks ?? []).map((mark) => mark.anchor);
}

const MARK = markAddOn("mark/1");

describe("surveyAnchor", () => {
  const frame: SurveyFrame = { face: "right", start: [10, 20], heading: 90, factors: { s0: 0.5 } };

  it("gives an anchor on a wall the face of the frame, and its offset times the factor of its side", () => {
    expect(surveyAnchor({ on: "wall", wall: "s0", face: "left", offset: 4, height: 1.2 }, frame)).toEqual({ on: "wall", wall: "s0", face: "right", offset: 2, height: 1.2 });
  });

  it("keeps the offset on a side with no factor", () => {
    expect(surveyAnchor({ on: "wall", wall: "s1", face: "left", offset: 4, height: 1.2 }, frame)).toEqual({ on: "wall", wall: "s1", face: "right", offset: 4, height: 1.2 });
    // A name of the object prototype is not a side with a factor.
    expect(surveyAnchor({ on: "wall", wall: "constructor", face: "left", offset: 4, height: 0 }, frame)).toEqual({ on: "wall", wall: "constructor", face: "right", offset: 4, height: 0 });
  });

  it("puts a point of the floor and of the ceiling at its place in the plan", () => {
    // The heading of 90 degrees turns the point (1, 2) to (-2, 1), and the start moves it by (10, 20).
    expect(surveyAnchor({ on: "floor", at: [1, 2], floor: "floor" }, frame)).toEqual({ on: "floor", at: [8, 21], floor: "floor" });
    const ceiling = surveyAnchor({ on: "ceiling", at: [3, 0] }, { ...frame, heading: 30 });
    expect(ceiling.on).toBe("ceiling");
    expectPoint(ceiling.on === "ceiling" ? ceiling.at : undefined, 10 + 3 * Math.cos(Math.PI / 6), 20 + 3 * Math.sin(Math.PI / 6));
    expect("floor" in ceiling).toBe(false);
    // A frame with no start and no heading keeps the point.
    expect(surveyAnchor({ on: "floor", at: [1, 2] }, { face: "left", start: [0, 0], heading: 0, factors: {} })).toEqual({ on: "floor", at: [1, 2] });
  });

  it("gives the same anchor for an anchor on an object", () => {
    const anchor: Anchor = { on: "object", object: "desk", at: [0, 0, 0.8] };
    expect(surveyAnchor(anchor, frame)).toBe(anchor);
  });
});

describe("expandSurvey, the layers of a survey", () => {
  const room = sides([4, 3, 4, 3], LEFT4);

  it("gives the frame of the walk", () => {
    expect(expandSurvey(survey(room)).frame).toEqual({ face: "left", start: [0, 0], heading: 0, factors: {} });
    expect(expandSurvey(survey(sides([4, 3, 4, 3], RIGHT4))).frame.face).toBe("right");
    expect(expandSurvey(survey(room, { start: [2, -1], heading: 90 })).frame).toEqual({ face: "left", start: [2, -1], heading: 90, factors: {} });
    expect(expandSurvey(survey(room, { heading: Number.NaN })).frame.heading).toBe(0);
  });

  it("gives the factor of each side of a walk that shares its gap", () => {
    const factors = expandSurvey(survey(sides([4.02, 3, 4, 3], LEFT4))).frame.factors;
    const width = 4.02 * (1 - 0.02 / 8.02);
    expect(Object.keys(factors)).toEqual(["s0", "s1", "s2", "s3"]);
    expect(factors["s0"]).toBeCloseTo(width / 4.02, 12);
    expect(factors["s2"]).toBeCloseTo(width / 4, 12);
    expect(factors["s1"]).toBe(1);
    expect(factors["s3"]).toBe(1);
    // An open walk shares no gap, so it has no factor.
    expect(expandSurvey(survey(sides([4.5, 3, 4, 3], LEFT4))).frame.factors).toEqual({});
  });

  it("has no layers and no layer finding for a survey with no layers", () => {
    const result = expandSurvey(survey(room), { addOns: [MARK] });
    expect("layers" in result).toBe(false);
    expect(result.layerFindings).toEqual([]);
  });

  it("moves each anchor of a layer to the room record", () => {
    const layer = marks(
      { on: "wall", wall: "s1", face: "right", offset: 1, height: 0.3 },
      { on: "floor", at: [1, 2], floor: SURVEY_FLOOR },
      { on: "ceiling", at: [3, 1] },
      { on: "object", object: "desk" },
    );
    const record = survey(room, { start: [10, 20], heading: 90, objects: [box("desk", { wall: "s0" })], layers: { "mark/1": layer } });
    const result = expandSurvey(record, { addOns: [MARK] });
    expect(anchorsOf(result.layers)).toEqual([
      { on: "wall", wall: "s1", face: "left", offset: 1, height: 0.3 },
      { on: "floor", at: [8, 21], floor: "floor" },
      { on: "ceiling", at: [9, 23] },
      { on: "object", object: "desk" },
    ]);
    expect(result.layerFindings).toEqual([]);
    // Each anchor is on the room record of the result: the wall, the floor and the object are there.
    expect(checkLayers(resultScene(result), [MARK])).toEqual([]);
    // The anchors of the survey are not on the room record: the point (1, 2) is not on its floor.
    expect(checkLayers({ ...resultScene(result), layers: record.layers }, [MARK]).map((finding) => finding.at)).toContain("m1");
  });

  it("puts a mark on a side that shares the gap at its part of the side, on the face in the room", () => {
    const record = survey(sides([4.02, 3, 4, 3], LEFT4), {
      layers: { "mark/1": marks({ on: "wall", wall: "s0", face: "right", offset: 4.02, height: 0.3 }) },
    });
    const result = expandSurvey(record, { addOns: [MARK] });
    expect(anchorsOf(result.layers)).toEqual([{ on: "wall", wall: "s0", face: "left", offset: expect.closeTo(4.02 * (1 - 0.02 / 8.02), 12), height: 0.3 }]);
    expect(checkLayers(resultScene(result), [MARK])).toEqual([]);
  });

  it("does not carry a layer with no add-on of the options, and tells the layer", () => {
    const record = survey(room, { layers: { "pipe/1": { taps: [] }, "mark/1": marks() } });
    const text = JSON.stringify(record);
    const result = expandSurvey(record, { addOns: [MARK] });
    expect(result.layers).toEqual({ "mark/1": { marks: [] } });
    expect(result.layerFindings).toEqual([
      { level: "error", code: "layer-unknown", layer: "pipe/1", at: "", message: `No add-on of the list reads the layer "pipe/1". The result does not have the layer.` },
    ]);
    // The survey keeps each layer.
    expect(JSON.stringify(record)).toBe(text);
    // With no add-on, the result has no layer, and a finding tells each layer of the survey.
    const bare = expandSurvey(record);
    expect(bare.layers).toEqual({});
    expect(bare.layerFindings.map((finding) => [finding.code, finding.layer])).toEqual([
      ["layer-unknown", "mark/1"],
      ["layer-unknown", "pipe/1"],
    ]);
  });
});

describe("resultScene", () => {
  it("gives the scene of a result, with its name and its layers", () => {
    const record = survey(sides([4, 3, 4, 3], LEFT4), { name: "Study", objects: [box("desk", { wall: "s0" })], layers: { "mark/1": marks({ on: "object", object: "desk" }) } });
    const result = expandSurvey(record, { addOns: [MARK] });
    expect(resultScene(result)).toEqual({ schema: "scene/2", name: "Study", room: result.room, objects: result.objects, layers: { "mark/1": marks({ on: "object", object: "desk" }) } });
    expect(resultScene(result).room).toBe(result.room);
  });

  it("gives a scene with no name and no layers for a result with none", () => {
    const result = expandSurvey(survey(sides([4, 3, 4, 3], LEFT4)));
    const scene = resultScene(result);
    expect(scene).toEqual({ schema: "scene/2", room: result.room, objects: [] });
    expect("name" in scene).toBe(false);
    expect("layers" in scene).toBe(false);
  });
});

describe("convertSurvey, the layers of a survey", () => {
  const record = survey(sides([4, 3, 4, 3], LEFT4), {
    layers: {
      "mark/1": marks({ on: "wall", wall: "s0", face: "left", offset: 1, height: 0.5 }, { on: "floor", at: [1, 2] }, { on: "object", object: "desk", at: [0, 0.25, 0.75], out: [0, 1, 0] }),
      "pipe/1": { taps: [] },
    },
  });

  it("changes the lengths of each anchor through the add-on of the layer", () => {
    const next = convertSurvey(record, "mm", [MARK]);
    expect(next.layers).toEqual({
      "mark/1": marks({ on: "wall", wall: "s0", face: "left", offset: 1000, height: 500 }, { on: "floor", at: [1000, 2000] }, { on: "object", object: "desk", at: [0, 250, 750], out: [0, 1, 0] }),
    });
    expect(next.unit).toBe("mm");
    expect(next.sides[0]?.length).toBe(4000);
  });

  it("does not carry a layer with no add-on of the list", () => {
    expect(Object.keys(convertSurvey(record, "mm", [MARK]).layers ?? {})).toEqual(["mark/1"]);
    expect(convertSurvey(record, "mm").layers).toEqual({});
  });

  it("gives the same record for the same unit, and no layers for a survey with no layers", () => {
    expect(convertSurvey(record, "m", [MARK])).toBe(record);
    expect(convertSurvey(record, "m")).toBe(record);
    expect("layers" in convertSurvey(survey(sides([4, 3, 4, 3], LEFT4)), "mm", [MARK])).toBe(false);
  });

  it("gives the anchors of the first unit again after a change to a second unit and back", () => {
    const back = convertSurvey(convertSurvey(record, "mm", [MARK]), "m", [MARK]);
    expect(back.layers).toEqual({ "mark/1": (record.layers ?? {})["mark/1"] });
  });
});

describe("the laws of the layers of a survey", () => {
  it("puts a mark on a side at the place of an opening with the same offset, on the face in the room, for each survey", () => {
    const length = fc.double({ min: 0, max: 100, noNaN: true });
    fc.assert(
      fc.property(sidesArbitrary, fc.nat({ max: 12 }), length, length, fc.option(fc.double(), { nil: undefined }), (list, index, offset, height, heading) => {
        const wall = `s${index}`;
        const layer = marks({ on: "wall", wall, face: "left", offset, height });
        const openings = [{ id: "o", wall, kind: "gap", offset, width: 0, height: 1 }] as const;
        const result = expandSurvey(survey(list, { heading, openings, layers: { "mark/1": layer } }), { addOns: [MARK] });
        const opening = result.room.openings?.[0];
        expect(opening).toBeDefined();
        expect(anchorsOf(result.layers)).toEqual([{ on: "wall", wall, face: result.frame.face, offset: opening?.offset, height }]);
        expect(result.layerFindings).toEqual([]);
      }),
    );
  });

  it("puts a point of the floor at its place in the plan, for each start and each heading", () => {
    const turn = fc.oneof(fc.constantFrom<SurveyTurn>("left", "right"), fc.double({ min: -180, max: 180, noNaN: true }));
    const list = fc
      .array(fc.record({ length: fc.double({ min: 0.5, max: 50, noNaN: true }), turn }), { minLength: 1, maxLength: 8 })
      .map((items) => items.map((item, index): SurveySide => ({ id: `s${index}`, ...item })));
    const place = fc.double({ min: -100, max: 100, noNaN: true });
    const heading = fc.oneof(fc.constantFrom(0, 90, 180, 270), fc.double({ min: -360, max: 360, noNaN: true }));
    fc.assert(
      fc.property(list, place, place, heading, (items, x, y, angle) => {
        // The points of the walk with no place are points in the space of the survey.
        const points = expandSurvey(survey(items)).walk;
        const layer = marks(...points.map((at): Anchor => ({ on: "floor", at })));
        const result = expandSurvey(survey(items, { start: [x, y], heading: angle, layers: { "mark/1": layer } }), { addOns: [MARK] });
        const anchors = anchorsOf(result.layers);
        expect(anchors).toHaveLength(points.length);
        anchors.forEach((anchor, index) => {
          const to = result.walk[index];
          expectPoint(anchor.on === "floor" ? anchor.at : undefined, to?.[0] ?? Number.NaN, to?.[1] ?? Number.NaN, 6);
        });
      }),
    );
  });
});
