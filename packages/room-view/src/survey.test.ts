import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { checkRoom } from "./check.ts";
import type { PlanPoint, Wall } from "./room.ts";
import { SAMPLE_ROOM, SAMPLE_SURVEY } from "./sample.ts";
import { CLOSURE_LIMIT, convertSurvey, expandSurvey, SQUARE_TURNS, SURVEY_SCHEMA, type Survey, type SurveyResult, type SurveySide, type SurveyTurn } from "./survey.ts";
import { LENGTH_UNITS, metersPer, unitsPer } from "./units.ts";

/** The sides `s0`, `s1` and so on, from a list of lengths and a list of turns. */
function sides(lengths: readonly number[], turns: readonly SurveyTurn[]): SurveySide[] {
  return lengths.map((length, index) => ({ id: `s${index}`, length, turn: turns[index]! }));
}

/** A survey in meters with the sides of the argument, and a change. */
function survey(list: readonly SurveySide[], change: Partial<Survey> = {}): Survey {
  return { schema: "survey/1", unit: "m", height: 2.5, wallThickness: 0.15, sides: list, ...change };
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
    expect(SURVEY_SCHEMA).toBe("survey/1");
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
      schema: "room/1",
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
    const result = expandSurvey(survey(sides([4, 3, 4, 3], RIGHT4), { outlets: [{ id: "o", wall: "s0", offset: 1, height: 0.3 }] }));
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
    expect(result.room.outlets).toEqual([{ id: "o", wall: "s0", offset: 1, height: 0.3, face: "right" }]);
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
    expect(result.room.outlets).toEqual(SAMPLE_ROOM.outlets);
    expect(result.room.circuits).toEqual(SAMPLE_ROOM.circuits);
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

  it("passes the openings, the circuits and the name, and gives each outlet the inner face", () => {
    const openings = [{ id: "door", wall: "s0", kind: "door", offset: 0.6, width: 0.9, height: 2.05 }] as const;
    const circuits = [{ id: "a", name: "Circuit A", limit: 1440 }];
    const result = expandSurvey(
      survey(sides([4, 3, 4, 3], LEFT4), {
        name: "Study",
        openings,
        outlets: [
          { id: "o1", wall: "s1", offset: 1, height: 0.3, circuit: "a" },
          { id: "o2", wall: "s3", offset: 2, height: 1.1 },
        ],
        circuits,
      }),
    );
    expect(result.room.name).toBe("Study");
    expect(result.room.openings).toBe(openings);
    expect(result.room.circuits).toBe(circuits);
    expect(result.room.outlets).toEqual([
      { id: "o1", wall: "s1", offset: 1, height: 0.3, circuit: "a", face: "left" },
      { id: "o2", wall: "s3", offset: 2, height: 1.1, face: "left" },
    ]);
    expect(result.room.floors?.[0]).toEqual({ id: "floor", name: "Study", ring: result.corners });
    expect(checkRoom(result.room)).toEqual([]);
  });

  it("keeps each opening and each outlet at its place on a side that shares the gap", () => {
    const openings = [
      // The first opening ends at the end of its side, and the second opening has the full length of its side.
      { id: "end", wall: "s0", kind: "gap", offset: 3.12, width: 0.9, height: 2 },
      { id: "full", wall: "s2", kind: "gap", offset: 0, width: 4, height: 2 },
      { id: "same", wall: "s1", kind: "door", offset: 1, width: 0.9, height: 2 },
    ] as const;
    // The outlet is at the end of its side, above the opening.
    const result = expandSurvey(survey(sides([4.02, 3, 4, 3], LEFT4), { openings, outlets: [{ id: "o", wall: "s0", offset: 4.02, height: 2.2 }] }));
    const width = 4.02 * (1 - 0.02 / 8.02);
    const [end, full, same] = result.room.openings ?? [];
    expect((end?.offset ?? 0) + (end?.width ?? 0)).toBeCloseTo(width, 12);
    expect(end?.width).toBeCloseTo((0.9 * width) / 4.02, 12);
    expect(full?.offset).toBe(0);
    expect(full?.width).toBeCloseTo(width, 12);
    // A side along the y axis has no gap to share, so its opening does not change.
    expect(same).toBe(openings[2]);
    expect(result.room.outlets?.[0]?.offset).toBeCloseTo(width, 12);
    expect(checkRoom(result.room)).toEqual([]);
    // A walk with no gap keeps the measured numbers, and an open walk also keeps them.
    expect(expandSurvey(survey(sides([4, 3, 4, 3], LEFT4), { openings })).room.openings).toBe(openings);
    expect(expandSurvey(survey(sides([4.5, 3, 4, 3], LEFT4), { openings })).room.openings).toBe(openings);
  });

  it("has no optional list that the survey does not have", () => {
    const room = expandSurvey(survey(sides([4, 3, 4, 3], LEFT4))).room;
    for (const field of ["name", "openings", "outlets", "circuits"]) expect(field in room, field).toBe(false);
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

  it("changes each length, and keeps each turn, each angle, each `id` and each circuit", () => {
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
        outlets: [{ id: "o", wall: "a", offset: 2, height: 1.5, circuit: "c" }],
        circuits: [{ id: "c", name: "C", limit: 1800 }],
      },
    );
    expect(convertSurvey(feet, "in")).toEqual({
      schema: "survey/1",
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
      outlets: [{ id: "o", wall: "a", offset: 24, height: 18, circuit: "c" }],
      circuits: [{ id: "c", name: "C", limit: 1800 }],
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
