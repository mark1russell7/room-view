import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Anchor } from "./anchors.ts";
import { checkRoom, checkScene } from "./check.ts";
import { joinAddOn, markAddOn, type MarkLayer } from "./layers.fixture.ts";
import { checkLayers } from "./layers.ts";
import {
  CONNECTION_FAULTS,
  CONNECTION_TURN_LIMIT,
  CONNECTION_USES,
  expandLevel,
  LEVEL_SCHEMA,
  ROOM_PLACES,
  type Level,
  type LevelConnection,
  type LevelResult,
  type LevelRoom,
} from "./level.ts";
import type { Opening, PlanPoint, Room } from "./room.ts";
import { SAMPLE_LEVEL, SAMPLE_SURVEY } from "./sample.ts";
import { expandSurvey, resultScene, type Survey, type SurveyObject, type SurveySide, type SurveyTurn } from "./survey.ts";

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

function door(id: string, wall: string, offset: number, width = 0.9): Opening {
  return { id, wall, kind: "door", offset, width, height: 2.05 };
}

/** A connection between two openings. Each end is the `id` of a room and the `id` of an opening. */
function connection(id: string, from: readonly [string, string], to: readonly [string, string], thickness?: number): LevelConnection {
  return { id, from: { room: from[0], opening: from[1] }, to: { room: to[0], opening: to[1] }, ...(thickness === undefined ? {} : { thickness }) };
}

/** A level in meters. */
function level(rooms: readonly LevelRoom[], connections: readonly LevelConnection[] = [], change: Partial<Level> = {}): Level {
  return { schema: "level/1", unit: "m", rooms, connections, ...change };
}

/** Room A is 4 m by 3 m, with a door on its east wall. The center of the door is 1.45 m from the south wall. */
const A = survey(sides([4, 3, 4, 3], LEFT4), { name: "A", openings: [door("d", "s1", 1)] });
/** Room B is 3 m by 3 m, with a door on its west wall. The center of the door is 1.9 m from the south wall. */
const B = survey(sides([3, 3, 3, 3], LEFT4), { name: "B", openings: [door("d", "s3", 0.65)] });
const AB = connection("ab", ["a", "d"], ["b", "d"]);
const TWO = level(
  [
    { id: "a", survey: A },
    { id: "b", survey: B },
  ],
  [AB],
);

/** A level with room A and a different room B. */
function withB(b: Survey, connections: readonly LevelConnection[] = [AB]): Level {
  return level(
    [
      { id: "a", survey: A },
      { id: "b", survey: b },
    ],
    connections,
  );
}

/** The place of each room: its `id`, the source of the place, the group, the first corner and the direction. */
function places(result: LevelResult): unknown {
  return result.rooms.map((room) => [room.id, room.place, room.group, room.survey.start, room.survey.heading]);
}

/** The thickness of each wall that has its own thickness. */
function thick(room: Room): Record<string, number> {
  return Object.fromEntries(room.walls.flatMap((wall): [string, number][] => (wall.thickness === undefined ? [] : [[wall.id, wall.thickness]])));
}

/** The codes of the findings of a room record. */
function codes(room: Room): string[] {
  return checkRoom(room).map((finding) => finding.code);
}

/** The center of an opening on the face of its wall, and the unit vector from the room through the wall. */
function hole(room: Room, id: string): { readonly center: PlanPoint; readonly out: PlanPoint } {
  const opening = room.openings!.find((item) => item.id === id)!;
  const wall = room.walls.find((item) => item.id === opening.wall)!;
  const length = Math.hypot(wall.to[0] - wall.from[0], wall.to[1] - wall.from[1]);
  const along: PlanPoint = [(wall.to[0] - wall.from[0]) / length, (wall.to[1] - wall.from[1]) / length];
  const at = opening.offset + opening.width / 2;
  return {
    center: [wall.from[0] + along[0] * at, wall.from[1] + along[1] * at],
    out: wall.side === "left" ? [0 - along[1], along[0]] : [along[1], 0 - along[0]],
  };
}

function expectPoint(point: PlanPoint | undefined, x: number, y: number, digits = 9): void {
  expect(point?.[0]).toBeCloseTo(x, digits);
  expect(point?.[1]).toBeCloseTo(y, digits);
}

/** Each number of the places and of the room record of a result. */
function numbersOf(result: LevelResult): number[] {
  const room = result.room;
  const walls = room.walls.flatMap((wall) => [...wall.from, ...wall.to, wall.thickness ?? 0, wall.height ?? 0]);
  const floors = (room.floors ?? []).flatMap((floor) => floor.ring.flat());
  const starts = result.rooms.flatMap((item) => [...(item.survey.start ?? []), item.survey.heading ?? 0]);
  const measures = result.connections.flatMap((item) => [item.gap ?? 0, item.ratio ?? 0, item.turn ?? 0, item.width ?? 0]);
  return [room.height, room.wallThickness, ...walls, ...floors, ...starts, ...measures];
}

describe("expandLevel, one room", () => {
  it("has the names of the format", () => {
    expect(LEVEL_SCHEMA).toBe("level/1");
    expect(ROOM_PLACES).toEqual(["first", "connection", "apart"]);
    expect(CONNECTION_USES).toEqual(["place", "check", "none"]);
    expect(CONNECTION_FAULTS).toEqual(["room", "opening", "one-room"]);
    expect(CONNECTION_TURN_LIMIT).toBe(2);
  });

  it("gives a room record with no wall for a level with no room", () => {
    expect(expandLevel({ schema: "level/1", unit: "m", rooms: [] })).toEqual({
      room: { schema: "room/1", unit: "m", height: 1, wallThickness: 1, walls: [] },
      rooms: [],
      connections: [],
      objects: [],
      layerFindings: [],
    });
    expect(expandLevel({ schema: "level/1", name: "Home", unit: "ft", rooms: [] }).room).toEqual({ schema: "room/1", name: "Home", unit: "ft", height: 1, wallThickness: 1, walls: [] });
  });

  it("gives the room of the survey, with the `id` of the room before each `id`", () => {
    const own = expandSurvey(SAMPLE_SURVEY).room;
    const result = expandLevel(level([{ id: "living", survey: SAMPLE_SURVEY }], [], { name: "Home" }));
    expect(places(result)).toEqual([["living", "first", 0, [0, 0], 0]]);
    expect(result.connections).toEqual([]);
    expect(result.rooms[0]?.result.room).toEqual(own);
    expect(result.room).toEqual({
      schema: "room/1",
      name: "Home",
      unit: "m",
      height: 2.5,
      wallThickness: 0.15,
      walls: own.walls.map((wall) => ({ ...wall, id: `living/${wall.id}` })),
      openings: own.openings?.map((opening) => ({ ...opening, id: `living/${opening.id}`, wall: `living/${opening.wall}` })),
      floors: [{ id: "living", name: "Sample room", ring: own.floors?.[0]?.ring }],
      outlets: own.outlets?.map((outlet) => ({ ...outlet, id: `living/${outlet.id}`, wall: `living/${outlet.wall}` })),
      circuits: own.circuits,
    });
    expect(checkRoom(result.room)).toEqual([]);
  });

  it("leaves out each list with no item, and the name of a floor of a room with no name", () => {
    const result = expandLevel(level([{ id: "a", survey: survey(sides([4, 3, 4, 3], LEFT4)) }]));
    expect(Object.keys(result.room)).toEqual(["schema", "unit", "height", "wallThickness", "walls", "floors"]);
    expect(Object.keys(result.room.floors?.[0] ?? {})).toEqual(["id", "ring"]);
    expect(Object.keys(result.room.walls[0] ?? {})).toEqual(["id", "from", "to", "side"]);
  });

  it("keeps the `start` and the `heading` of the first room", () => {
    const first = survey(sides([4, 3, 4, 3], LEFT4), { start: [2, 1], heading: 90, openings: [door("d", "s1", 1)] });
    const result = expandLevel(
      level(
        [
          { id: "a", survey: first },
          { id: "b", survey: B },
        ],
        [AB],
      ),
    );
    expect(result.rooms[0]?.result.corners).toEqual(expandSurvey(first).corners);
    expect(result.rooms[0]?.result.corners).toEqual([
      [2, 1],
      [2, 5],
      [-1, 5],
      [-1, 1],
    ]);
    // The east wall of A is now its top wall, so B is above A.
    expect(result.rooms[1]?.survey.heading).toBe(90);
    expectPoint(result.rooms[1]?.survey.start, 2.45, 5.15);
    expect(checkRoom(result.room)).toEqual([]);
  });
});

describe("expandLevel, the place of a room from a connection", () => {
  it("puts two rooms back to back at a door, with the centers of the two openings opposite", () => {
    const result = expandLevel(TWO);
    expect(places(result)).toEqual([
      ["a", "first", 0, [0, 0], 0],
      ["b", "connection", 0, [4.15, -0.45], 0],
    ]);
    expect(result.connections).toEqual([{ id: "ab", use: "place", gap: 0, ratio: 0, turn: 0, width: 0, fits: true }]);
    expect(result.rooms[1]?.result.corners).toEqual([
      [4.15, -0.45],
      [7.15, -0.45],
      [7.15, 2.55],
      [4.15, 2.55],
    ]);
    const from = hole(result.room, "a/d");
    const to = hole(result.room, "b/d");
    expect(from.out).toEqual([1, 0]);
    expect(to.out).toEqual([-1, 0]);
    expectPoint(from.center, 4, 1.45);
    expectPoint(to.center, 4.15, 1.45);
    expect(result.room.floors).toEqual([
      { id: "a", name: "A", ring: result.rooms[0]?.result.corners },
      { id: "b", name: "B", ring: result.rooms[1]?.result.corners },
    ]);
  });

  it("gives one half of the wall between two rooms to each room", () => {
    const result = expandLevel(TWO);
    // Without this rule, the two walls of 0.15 m are in the same 0.15 m.
    expect(thick(result.room)).toEqual({ "a/s1": 0.075, "b/s3": 0.075 });
    expect(checkRoom(result.room)).toEqual([]);
  });

  it("gives the same places for a connection in the opposite direction", () => {
    const result = expandLevel(withB(B, [connection("ba", ["b", "d"], ["a", "d"])]));
    expect(places(result)).toEqual(places(expandLevel(TWO)));
    expect(result.connections).toEqual([{ id: "ba", use: "place", gap: 0, ratio: 0, turn: 0, width: 0, fits: true }]);
  });

  it("turns a room whose door is on a different side", () => {
    // The door of B is on its first side. That side is back to back with the east wall of A, so B turns by 270 degrees.
    const result = expandLevel(withB(survey(sides([3, 3, 3, 3], LEFT4), { openings: [door("d", "s0", 1)] })));
    expect(result.rooms[1]?.survey.heading).toBe(270);
    expect(result.rooms[1]?.survey.start).toEqual([4.15, 2.9]);
    const corners = result.rooms[1]?.result.corners ?? [];
    expectPoint(corners[0], 4.15, 2.9);
    expectPoint(corners[1], 4.15, -0.1);
    expectPoint(corners[2], 7.15, -0.1);
    expectPoint(corners[3], 7.15, 2.9);
    expect(thick(result.room)).toEqual({ "a/s1": 0.075, "b/s0": 0.075 });
    expect(checkRoom(result.room)).toEqual([]);
  });

  it("puts a room with a walk to the right, and does not use the `start` or the `heading` of its survey", () => {
    const clockwise = survey(sides([3, 3, 3, 3], RIGHT4), { start: [50, 60], heading: 45, openings: [door("d", "s0", 1.45)] });
    const result = expandLevel(withB(clockwise));
    expect(result.rooms[1]?.survey.heading).toBe(90);
    expect(result.rooms[1]?.survey.start).toEqual([4.15, -0.45]);
    expect(result.rooms[1]?.result.corners).toEqual([
      [4.15, -0.45],
      [4.15, 2.55],
      [7.15, 2.55],
      [7.15, -0.45],
    ]);
    expect(result.room.walls.filter((wall) => wall.id.startsWith("b/")).map((wall) => wall.side)).toEqual(["left", "left", "left", "left"]);
    expect(thick(result.room)).toEqual({ "a/s1": 0.075, "b/s0": 0.075 });
    expect(checkRoom(result.room)).toEqual([]);
  });

  it("uses the thickness of a connection as the distance between the two faces", () => {
    const result = expandLevel(withB(B, [connection("ab", ["a", "d"], ["b", "d"], 0.4)]));
    expect(result.rooms[1]?.survey.start).toEqual([4.4, -0.45]);
    expect(thick(result.room)).toEqual({ "a/s1": 0.2, "b/s3": 0.2 });
    expect(checkRoom(result.room)).toEqual([]);
  });

  it("uses the thickness of the wall of `from` for a connection with no thickness", () => {
    const thickWall = { ...A, sides: A.sides.map((side) => (side.id === "s1" ? { ...side, thickness: 0.3 } : side)) };
    const rooms: LevelRoom[] = [
      { id: "a", survey: thickWall },
      { id: "b", survey: B },
    ];
    const forward = expandLevel(level(rooms, [AB]));
    expect(forward.rooms[1]?.survey.start).toEqual([4.3, -0.45]);
    expect(thick(forward.room)).toEqual({ "a/s1": 0.15, "b/s3": 0.15 });
    const back = expandLevel(level(rooms, [connection("ba", ["b", "d"], ["a", "d"])]));
    expect(back.rooms[1]?.survey.start).toEqual([4.15, -0.45]);
    expect(thick(back.room)).toEqual({ "a/s1": 0.075, "b/s3": 0.075 });
  });

  it("uses the default for a thickness that is not a length above 0", () => {
    for (const thickness of [Number.NaN, 0, -0.2, Number.POSITIVE_INFINITY, 1e12]) {
      const result = expandLevel(withB(B, [connection("ab", ["a", "d"], ["b", "d"], thickness)]));
      expect(result.rooms[1]?.survey.start, String(thickness)).toEqual([4.15, -0.45]);
    }
  });

  it("gives a place to a room with an open walk, and no floor", () => {
    const open = survey(sides([3, 3, 3], ["left", "left", "left"]), { name: "B", openings: [door("d", "s0", 1)] });
    const result = expandLevel(withB(open));
    expect(result.rooms[1]?.place).toBe("connection");
    expect(result.rooms[1]?.survey.start).toEqual([4.15, 2.9]);
    expect(result.rooms[1]?.result.closure.closed).toBe(false);
    expect(result.room.floors?.map((floor) => floor.id)).toEqual(["a"]);
    expect(result.room.walls.map((wall) => wall.id)).toEqual(["a/s0", "a/s1", "a/s2", "a/s3", "b/s0", "b/s1", "b/s2"]);
  });
});

/** A room of 3 m by 3 m with doors. The walls are `s0` (south), `s1` (east), `s2` (north) and `s3` (west). */
function square(openings: readonly Opening[]): Survey {
  return survey(sides([3, 3, 3, 3], LEFT4), { openings });
}

/**
 * Four rooms around one point, with a door between each two neighbors. C is above A, and D is above B.
 * The doors of A and B, A and C, and B and D give the places. The door of C and D examines them.
 */
function loop(southOfD = 1.1, last: LevelConnection = connection("cd", ["c", "east"], ["d", "west"])): Level {
  return level(
    [
      { id: "a", survey: square([door("east", "s1", 1), door("north", "s2", 1)]) },
      { id: "b", survey: square([door("west", "s3", 1.1), door("north", "s2", 1)]) },
      { id: "c", survey: square([door("south", "s0", 1.1), door("east", "s1", 1)]) },
      { id: "d", survey: square([door("south", "s0", southOfD), door("west", "s3", 1.1)]) },
    ],
    [connection("ab", ["a", "east"], ["b", "west"]), connection("ac", ["a", "north"], ["c", "south"]), connection("bd", ["b", "north"], ["d", "south"]), last],
  );
}

describe("expandLevel, a connection that examines the measurements", () => {
  it("examines a connection between two rooms that have a place", () => {
    const result = expandLevel(loop());
    expect(places(result)).toEqual([
      ["a", "first", 0, [0, 0], 0],
      ["b", "connection", 0, [3.15, 0], 0],
      ["c", "connection", 0, [0, 3.15], 0],
      ["d", "connection", 0, [3.15, 3.15], 0],
    ]);
    expect(result.connections.map((item) => [item.id, item.use, item.fits])).toEqual([
      ["ab", "place", true],
      ["ac", "place", true],
      ["bd", "place", true],
      ["cd", "check", true],
    ]);
    const check = result.connections[3];
    expect(check?.gap).toBeCloseTo(0, 9);
    expect(check?.ratio).toBeCloseTo(0, 9);
    expect(check?.turn).toBe(0);
    expect(check?.width).toBe(0);
    expect(thick(result.room)).toEqual({ "a/s1": 0.075, "a/s2": 0.075, "b/s2": 0.075, "b/s3": 0.075, "c/s0": 0.075, "c/s1": 0.075, "d/s0": 0.075, "d/s3": 0.075 });
    expect(checkRoom(result.room)).toEqual([]);
  });

  it("tells a mistake in a measurement as a gap", () => {
    // The door of D is 0.3 m too far along its south wall, so D is 0.3 m to the left, in room C.
    const mistake = loop(1.4);
    const result = expandLevel(mistake);
    expect(result.rooms[3]?.survey.start).toEqual([2.85, 3.15]);
    const check = result.connections[3];
    expect(check?.use).toBe("check");
    expect(check?.gap).toBeCloseTo(0.3, 9);
    // The walks of the two rooms have a length of 24 m.
    expect(check?.ratio).toBeCloseTo(0.3 / 24, 9);
    expect(check?.turn).toBe(0);
    expect(check?.fits).toBe(false);
    expect(codes(result.room)).toContain("wall-overlap");
    // A connection that does not fit gives no shared wall.
    expect(thick(result.room)["c/s1"]).toBeUndefined();
    expect(expandLevel(mistake, { limit: 0.02 }).connections[3]?.fits).toBe(true);
    expect(expandLevel(mistake, { limit: Number.NaN }).connections[3]?.fits).toBe(false);
  });

  it("tells two walls that are not back to back as a turn", () => {
    // The door of C goes to the wrong door of D: the south wall of D is at a square angle to the east wall of C.
    const result = expandLevel(loop(1.1, connection("cd", ["c", "east"], ["d", "south"])));
    const check = result.connections[3];
    expect(check?.use).toBe("check");
    expect(check?.turn).toBe(90);
    expect(check?.gap).toBeCloseTo(Math.hypot(1.55, 1.45), 9);
    expect(check?.fits).toBe(false);
  });

  it("gives the difference between the widths of the two openings", () => {
    const wide = survey(sides([3, 3, 3, 3], LEFT4), { openings: [door("d", "s3", 0.6, 1)] });
    const result = expandLevel(withB(wide));
    expect(result.connections[0]?.width).toBeCloseTo(0.1, 12);
    // The centers are opposite, so the place is the same as for the door of 0.9 m at 0.65 m.
    expect(result.rooms[1]?.survey.start).toEqual([4.15, -0.45]);
  });
});

describe("expandLevel, faults and rooms with no connection", () => {
  const C = square([]);
  const E = survey(sides([2, 2], ["left", "left"]));
  const rooms: LevelRoom[] = [
    { id: "a", survey: A },
    { id: "b", survey: B },
    { id: "c", survey: C },
    { id: "e", survey: E },
  ];

  it("does not use a connection with a fault", () => {
    const result = expandLevel(level(rooms, [connection("no-room", ["a", "d"], ["x", "d"]), connection("no-opening", ["a", "d"], ["c", "d"]), connection("one-room", ["a", "d"], ["a", "d"]), AB]));
    expect(result.connections).toEqual([
      { id: "no-room", use: "none", fault: "room", fits: false },
      { id: "no-opening", use: "none", fault: "opening", fits: false },
      { id: "one-room", use: "none", fault: "one-room", fits: false },
      { id: "ab", use: "place", gap: 0, ratio: 0, turn: 0, width: 0, fits: true },
    ]);
    expect(Object.keys(result.connections[0] ?? {})).toEqual(["id", "use", "fault", "gap", "ratio", "turn", "width", "fits"]);
    expect(Object.keys(result.connections[3] ?? {})).toEqual(["id", "use", "gap", "ratio", "turn", "width", "fits"]);
  });

  it("puts each group of rooms with no connection to the right, with a distance of 1 m", () => {
    const result = expandLevel(level(rooms, [AB]));
    // The outer faces of A and B end at x = 7.3. The bottom of the first group is the outer face of B, at y = -0.6.
    expect(places(result)).toEqual([
      ["a", "first", 0, [0, 0], 0],
      ["b", "connection", 0, [4.15, -0.45], 0],
      ["c", "apart", 1, [8.45, -0.45], 0],
      ["e", "apart", 2, [12.75, -0.45], 0],
    ]);
    expect(result.room.floors?.map((floor) => floor.id)).toEqual(["a", "b", "c"]);
    expect(checkRoom(result.room)).toEqual([]);
  });

  it("uses the option `groupGap`, and the default for a value that is not a length of 0 or more", () => {
    const start = (groupGap: number | undefined): unknown => expandLevel(level(rooms, [AB]), { groupGap }).rooms[2]?.survey.start;
    expect(start(2)).toEqual([9.45, -0.45]);
    expect(start(0)).toEqual([7.45, -0.45]);
    for (const value of [undefined, Number.NaN, -1, Number.POSITIVE_INFINITY, 1e12]) expect(start(value), String(value)).toEqual([8.45, -0.45]);
  });

  it("has a default distance of 1 m in each unit", () => {
    const result = expandLevel(
      level(
        [
          { id: "a", survey: A },
          { id: "c", survey: C },
        ],
        [],
        { unit: "ft" },
      ),
    );
    expect(result.rooms[1]?.survey.unit).toBe("ft");
    // In meters: the outer face of A at 4.15, the distance of 1, and the wall of C of 0.15.
    expect(result.rooms[1]?.survey.start?.[0]).toBeCloseTo(5.3 / 0.3048, 6);
    expect(result.rooms[1]?.survey.start?.[1]).toBeCloseTo(0, 6);
  });

  it("keeps the direction of the survey of a room with no connection, and not its `start`", () => {
    const turned = survey(sides([3, 3, 3, 3], LEFT4), { start: [100, 100], heading: 90 });
    const result = expandLevel(
      level([
        { id: "a", survey: A },
        { id: "c", survey: turned },
      ]),
    );
    expect(result.rooms[1]?.place).toBe("apart");
    expect(result.rooms[1]?.survey.heading).toBe(90);
    // The room goes from its first corner up and to the left, so its first corner is at its right.
    expectPoint(result.rooms[1]?.survey.start, 4.15 + 1 + 0.15 + 3, 0);
    expect(checkRoom(result.room)).toEqual([]);
  });

  it("gives the fault `opening` for an opening on a wall with no length, and for an opening with no position", () => {
    const flat = survey(sides([3, 0, 3, 3], LEFT4), { openings: [door("d", "s1", 0)] });
    expect(expandLevel(withB(flat)).connections[0]?.fault).toBe("opening");
    const lost = survey(sides([3, 3, 3, 3], LEFT4), { openings: [door("d", "s3", Number.NaN)] });
    expect(expandLevel(withB(lost)).connections[0]?.fault).toBe("opening");
    expect(expandLevel(withB(lost)).rooms[1]?.place).toBe("apart");
  });

  it("uses the first room of an `id`, and the checks tell the second one", () => {
    const result = expandLevel(
      level(
        [
          { id: "a", survey: A },
          { id: "b", survey: B },
          { id: "b", survey: C },
        ],
        [AB],
      ),
    );
    expect(result.rooms.map((room) => room.place)).toEqual(["first", "connection", "apart"]);
    expect(codes(result.room)).toContain("id-duplicate");
  });
});

describe("expandLevel, the records of a level", () => {
  it("changes a survey in a different unit to the unit of the level", () => {
    // B is 10 ft by 10 ft, with walls of 0.5 ft and a door of 3 ft whose center is 5.5 ft from its south wall.
    const feet = survey(sides([10, 10, 10, 10], LEFT4), { unit: "ft", height: 8, wallThickness: 0.5, openings: [{ ...door("d", "s3", 3, 3), height: 6.5 }] });
    const result = expandLevel(withB(feet));
    expect(result.rooms[1]?.survey.unit).toBe("m");
    expectPoint(result.rooms[1]?.survey.start, 4.15, 1.45 - 5.5 * 0.3048);
    const walls = result.room.walls.filter((wall) => wall.id.startsWith("b/"));
    expect(walls.map((wall) => wall.id)).toEqual(["b/s0", "b/s1", "b/s2", "b/s3"]);
    // The room record has the height and the wall thickness of A, so each wall of B has its own values.
    for (const wall of walls) expect(wall.height).toBeCloseTo(8 * 0.3048, 12);
    for (const wall of walls.slice(0, 3)) expect(wall.thickness).toBeCloseTo(0.5 * 0.3048, 12);
    expect(walls[3]?.thickness).toBe(0.075);
    expect(result.room.openings?.[1]?.width).toBeCloseTo(3 * 0.3048, 12);
    expect(result.room.height).toBe(2.5);
    expect(result.room.wallThickness).toBe(0.15);
    expect(checkRoom(result.room)).toEqual([]);
  });

  it("gives a level in a different unit than its surveys", () => {
    const result = expandLevel({ ...TWO, unit: "cm" });
    expect(result.room.unit).toBe("cm");
    expect(result.room.height).toBeCloseTo(250, 9);
    expectPoint(result.rooms[1]?.survey.start, 415, -45, 6);
    expect(thick(result.room)["a/s1"]).toBeCloseTo(7.5, 9);
    expect(checkRoom(result.room)).toEqual([]);
  });

  it("joins the circuits of the level and of the surveys: the first circuit of an `id` stays", () => {
    const first = { ...A, circuits: [{ id: "a", limit: 1440 }, { id: "b", name: "B of the first room", limit: 1800 }] };
    const second = { ...B, circuits: [{ id: "b", limit: 99 }, { id: "c", limit: 2400 }] };
    const result = expandLevel(
      level(
        [
          { id: "a", survey: first },
          { id: "b", survey: second },
        ],
        [AB],
        { circuits: [{ id: "a", name: "A of the level", limit: 1000 }] },
      ),
    );
    expect(result.room.circuits).toEqual([
      { id: "a", name: "A of the level", limit: 1000 },
      { id: "b", name: "B of the first room", limit: 1800 },
      { id: "c", limit: 2400 },
    ]);
  });

  it("keeps the circuit of an outlet, and puts the `id` of the room before the `id` of its wall", () => {
    const first = { ...A, outlets: [{ id: "o", wall: "s0", offset: 1, height: 0.3, circuit: "x" }] };
    const second = { ...B, outlets: [{ id: "o", wall: "s1", offset: 2, height: 0.3 }] };
    const result = expandLevel(
      level(
        [
          { id: "a", survey: first },
          { id: "b", survey: second },
        ],
        [AB],
      ),
    );
    expect(result.room.outlets).toEqual([
      { id: "a/o", wall: "a/s0", face: "left", offset: 1, height: 0.3, circuit: "x" },
      { id: "b/o", wall: "b/s1", face: "left", offset: 2, height: 0.3 },
    ]);
    // The circuit "x" is not in the level, and the checks tell it.
    expect(codes(result.room).length).toBeGreaterThan(0);
  });

  it("does not change the level record", () => {
    const text = JSON.stringify(TWO);
    expandLevel(TWO);
    expect(JSON.stringify(TWO)).toBe(text);
  });
});

describe("expandLevel, the laws", () => {
  const size = fc.double({ min: 2, max: 12, noNaN: true });
  const part = fc.double({ min: 0.1, max: 0.9, noNaN: true });
  const wallOf = fc.integer({ min: 0, max: 3 });

  /** A rectangle with a door of 0.8 m on one wall. `part` is the place of the door along the wall. */
  function rectangle(width: number, depth: number, toLeft: boolean, wall: number, at: number): Survey {
    const turn = toLeft ? "left" : "right";
    const length = wall % 2 === 0 ? width : depth;
    return survey(sides([width, depth, width, depth], [turn, turn, turn, turn]), { openings: [door("d", `s${wall}`, at * (length - 0.8), 0.8)] });
  }

  it("puts the two openings of a connection opposite, for each wall, each direction of the walk and each angle of the first room", () => {
    const room = fc.tuple(size, size, fc.boolean(), wallOf, part);
    const heading = fc.oneof(fc.constantFrom(0, 90, 180, 270), fc.double({ min: -360, max: 360, noNaN: true }));
    const thickness = fc.option(fc.double({ min: 0.05, max: 0.6, noNaN: true }), { nil: undefined });
    fc.assert(
      fc.property(room, room, heading, thickness, (first, second, angle, depth) => {
        const result = expandLevel(
          level(
            [
              { id: "a", survey: { ...rectangle(...first), heading: angle } },
              { id: "b", survey: rectangle(...second) },
            ],
            [connection("ab", ["a", "d"], ["b", "d"], depth)],
          ),
        );
        expect(result.rooms[1]?.place).toBe("connection");
        const from = hole(result.room, "a/d");
        const to = hole(result.room, "b/d");
        const distance = depth ?? 0.15;
        expect(from.out[0] * to.out[0] + from.out[1] * to.out[1]).toBeCloseTo(-1, 9);
        expectPoint(to.center, from.center[0] + from.out[0] * distance, from.center[1] + from.out[1] * distance, 6);
        const findings = checkRoom(result.room);
        expect(findings.filter((finding) => finding.level === "error" || finding.code === "wall-overlap")).toEqual([]);
      }),
    );
  });

  it("gives the same place for each `start` and each `heading` of the survey of a room with a connection", () => {
    const expected = expandLevel(TWO).rooms[1]?.survey;
    fc.assert(
      fc.property(fc.double(), fc.double(), fc.double(), (x, y, heading) => {
        const moved = expandLevel(withB({ ...B, start: [x, y], heading })).rooms[1]?.survey;
        expect(moved?.start).toEqual(expected?.start);
        expect(moved?.heading).toBe(expected?.heading);
      }),
    );
  });

  it("gives finite numbers for values that are not possible", () => {
    const any = fc.double();
    fc.assert(
      fc.property(any, any, any, any, any, any, (x, y, heading, thickness, groupGap, offset) => {
        const first = { ...A, start: [x, y] as const, heading };
        const second = survey(sides([3, 3, 3, 3], LEFT4), { heading, openings: [door("d", "s3", offset)] });
        const result = expandLevel(
          level(
            [
              { id: "a", survey: first },
              { id: "b", survey: second },
              { id: "c", survey: second },
            ],
            [connection("ab", ["a", "d"], ["b", "d"], thickness)],
          ),
          { groupGap },
        );
        for (const value of numbersOf(result)) expect(Number.isFinite(value)).toBe(true);
        expect(result.room.walls).toHaveLength(12);
      }),
    );
  });
});

describe("expandLevel, the objects of a level", () => {
  const desk: SurveyObject = { id: "desk", kind: "desk", wall: "s0", offset: 0.5, width: 1, depth: 0.5, height: 0.8 };
  const lamp: SurveyObject = { id: "lamp", kind: "lamp", on: "desk", offset: 0.4, width: 0.2, depth: 0.2, height: 0.4 };

  it("gives no object for a level with no object", () => {
    expect(expandLevel(TWO).objects).toEqual([]);
  });

  it("gives the objects of each room at the place of the room, with the `id` of the room before each `id`", () => {
    const result = expandLevel(
      level(
        [
          { id: "a", survey: { ...A, objects: [desk, lamp] } },
          { id: "b", survey: { ...B, outlets: [{ id: "o", wall: "s0", offset: 1, height: 0.3 }], objects: [{ ...desk, name: "Desk", outlet: "o" }] } },
        ],
        [AB],
      ),
    );
    expect(result.objects.slice(0, 2)).toEqual([
      { id: "a/desk", kind: "desk", size: [1, 0.5, 0.8], at: [1, 0.25] },
      { id: "a/lamp", kind: "lamp", size: [0.2, 0.2, 0.4], at: [0, -0.15], lift: 0.8, parent: "a/desk" },
    ]);
    // Room B starts at (4.15, -0.45). Its object has the same `id` in its survey as the object of room A.
    const third = result.objects[2];
    expect({ ...third, at: undefined }).toEqual({ id: "b/desk", kind: "desk", name: "Desk", size: [1, 0.5, 0.8], at: undefined, outlet: "b/o" });
    expectPoint(third?.at, 5.15, -0.2, 12);
    expect(result.objects).toHaveLength(3);
    expect(checkScene({ schema: "scene/1", room: result.room, objects: result.objects })).toEqual([]);
  });

  it("gives the objects of the expansion of each survey, in the sequence of the rooms", () => {
    const result = expandLevel(SAMPLE_LEVEL);
    const own = result.rooms.flatMap((room) =>
      room.result.objects.map((object) => ({
        ...object,
        id: `${room.id}/${object.id}`,
        ...(object.parent === undefined ? {} : { parent: `${room.id}/${object.parent}` }),
        ...(object.outlet === undefined ? {} : { outlet: `${room.id}/${object.outlet}` }),
      })),
    );
    expect(result.objects).toEqual(own);
    expect(result.objects).toHaveLength(13);
    // The walk of the bathroom starts along its west wall, so the bathroom and its object turn.
    const vanity = result.objects.find((object) => object.id === "bathroom/vanity");
    expectPoint(vanity?.at, 5.775, -0.55, 12);
    expect(vanity?.turn).toBe(90);
  });

  it("gives no place in the level to an object with no place in its survey", () => {
    const result = expandLevel(level([{ id: "a", survey: { ...A, objects: [{ ...desk, wall: "s9" }, lamp, { ...desk, id: "good" }] } }]));
    expect(result.objects.map((object) => object.id)).toEqual(["a/good"]);
  });

  it("does not change the level", () => {
    const text = JSON.stringify(SAMPLE_LEVEL);
    expandLevel(SAMPLE_LEVEL);
    expect(JSON.stringify(SAMPLE_LEVEL)).toBe(text);
  });
});

/** A layer of the test add-on with one mark at each anchor. The marks have the ids `m0`, `m1` and so on. */
function marks(...anchors: readonly Anchor[]): MarkLayer {
  return { marks: anchors.map((anchor, index) => ({ id: `m${index}`, anchor, size: 1 })) };
}

/** The marks of the layer `mark/1` of a result. */
function marksOf(result: LevelResult): MarkLayer["marks"] {
  return (result.layers?.["mark/1"] as MarkLayer | undefined)?.marks ?? [];
}

describe("expandLevel, the layers of a level", () => {
  const MARK = joinAddOn("mark/1");
  const desk: SurveyObject = { id: "desk", kind: "desk", wall: "s0", offset: 0.5, width: 1, depth: 0.5, height: 0.8 };

  it("has no layers and no layer finding for a level with no layers", () => {
    const result = expandLevel(TWO, { addOns: [MARK] });
    expect("layers" in result).toBe(false);
    expect(result.layerFindings).toEqual([]);
    expect(expandLevel(TWO).layerFindings).toEqual([]);
  });

  it("gives each anchor of a room the names of the level, at the place of the room", () => {
    const top: Anchor = { on: "wall", wall: "a/s2", face: "left", offset: 2, height: 1 };
    const inA = marks({ on: "wall", wall: "s0", face: "right", offset: 1, height: 0.3 });
    const inB = marks({ on: "wall", wall: "s1", face: "left", offset: 2, height: 0.3 }, { on: "floor", at: [1, 2], floor: "floor" }, { on: "ceiling", at: [2, 1] }, { on: "object", object: "desk", at: [0, 0, 0.8] });
    const result = expandLevel(
      level(
        [
          { id: "a", survey: { ...A, layers: { "mark/1": inA } } },
          { id: "b", survey: { ...B, objects: [desk], layers: { "mark/1": inB } } },
        ],
        [AB],
        { layers: { "mark/1": { marks: [{ id: "top", anchor: top, size: 2 }] } } },
      ),
      { addOns: [MARK] },
    );
    const list = marksOf(result);
    // The mark of the level record comes first, then the marks of each room, with the `id` of the room before each `id`.
    expect(list.map((mark) => mark.id)).toEqual(["top", "a/m0", "b/m0", "b/m1", "b/m2", "b/m3"]);
    expect(list[0]).toEqual({ id: "top", anchor: top, size: 2 });
    expect(list[1]?.anchor).toEqual({ on: "wall", wall: "a/s0", face: "left", offset: 1, height: 0.3 });
    expect(list[2]?.anchor).toEqual({ on: "wall", wall: "b/s1", face: "left", offset: 2, height: 0.3 });
    // Room B starts at (4.15, -0.45). The floor of a room has the `id` of the room.
    const [, , , floor, ceiling, object] = list.map((mark) => mark.anchor);
    expect(floor?.on === "floor" ? floor.floor : undefined).toBe("b");
    expectPoint(floor?.on === "floor" ? floor.at : undefined, 5.15, 1.55, 12);
    expect(ceiling !== undefined && "floor" in ceiling).toBe(false);
    expectPoint(ceiling?.on === "ceiling" ? ceiling.at : undefined, 6.15, 0.55, 12);
    expect(object).toEqual({ on: "object", object: "b/desk", at: [0, 0, 0.8] });
    expect(result.layerFindings).toEqual([]);
    // Each anchor is on the room record of the level.
    expect(checkLayers(resultScene(result), [MARK])).toEqual([]);
  });

  it("gives a different floor of a room the name of the room before its `id`", () => {
    const inA = marks({ on: "floor", at: [1, 1], floor: "rug" }, { on: "floor", at: [1, 1] });
    const result = expandLevel(level([{ id: "a", survey: { ...A, layers: { "mark/1": inA } } }]), { addOns: [MARK] });
    expect(marksOf(result).map((mark) => mark.anchor)).toEqual([
      { on: "floor", at: [1, 1], floor: "a/rug" },
      { on: "floor", at: [1, 1] },
    ]);
  });

  it("changes the anchors of a room in a different unit to the unit of the level", () => {
    // B is 10 ft by 10 ft, and it starts at (4.15, 1.45 - 5.5 ft).
    const feet = survey(sides([10, 10, 10, 10], LEFT4), {
      unit: "ft",
      height: 8,
      wallThickness: 0.5,
      openings: [{ ...door("d", "s3", 3, 3), height: 6.5 }],
      objects: [{ ...desk, offset: 2, width: 3, depth: 2, height: 2.5 }],
      layers: { "mark/1": marks({ on: "wall", wall: "s1", face: "left", offset: 5, height: 1 }, { on: "floor", at: [5, 5] }, { on: "object", object: "desk", at: [0, 0, 2.5] }) },
    });
    const result = expandLevel(withB(feet), { addOns: [MARK] });
    const [wall, floor, object] = marksOf(result).map((mark) => mark.anchor);
    expect(wall?.on === "wall" ? [wall.wall, wall.face] : undefined).toEqual(["b/s1", "left"]);
    expect(wall?.on === "wall" ? wall.offset : undefined).toBeCloseTo(5 * 0.3048, 12);
    expect(wall?.on === "wall" ? wall.height : undefined).toBeCloseTo(0.3048, 12);
    expectPoint(floor?.on === "floor" ? floor.at : undefined, 4.15 + 5 * 0.3048, 1.45 - 0.5 * 0.3048, 9);
    expect(object?.on === "object" ? object.at?.[2] : undefined).toBeCloseTo(2.5 * 0.3048, 12);
    expect(checkLayers(resultScene(result), [MARK])).toEqual([]);
  });

  it("gives a level in a different unit than its surveys, with the layer of the level record as it is", () => {
    const top: Anchor = { on: "wall", wall: "a/s0", face: "left", offset: 100, height: 30 };
    const inB = marks({ on: "floor", at: [1, 2] });
    const result = expandLevel({ ...withB({ ...B, layers: { "mark/1": inB } }), unit: "cm", layers: { "mark/1": marks(top) } }, { addOns: [MARK] });
    const [first, second] = marksOf(result);
    // The anchors of the level record are in the unit of the level already.
    expect(first).toEqual({ id: "m0", anchor: top, size: 1 });
    expect(second?.id).toBe("b/m0");
    expectPoint(second?.anchor.on === "floor" ? second.anchor.at : undefined, 515, 155, 6);
    expect(checkLayers(resultScene(result), [MARK])).toEqual([]);
  });

  it("tells a layer of a room that has no add-on, with the `id` of the room", () => {
    const rooms: LevelRoom[] = [
      { id: "a", survey: A },
      { id: "b", survey: { ...B, layers: { "pipe/1": { taps: [] }, "mark/1": marks({ on: "wall", wall: "s0", face: "left", offset: 1, height: 1 }) } } },
    ];
    const result = expandLevel(level(rooms, [AB]), { addOns: [MARK] });
    expect(Object.keys(result.layers ?? {})).toEqual(["mark/1"]);
    expect(result.layerFindings).toEqual([
      {
        level: "error",
        code: "layer-unknown",
        layer: "pipe/1",
        at: "",
        message: `No add-on of the list reads the layer "pipe/1" of the room "b". The result does not have the layer.`,
        room: "b",
      },
    ]);
    // With no add-on, the result has no layer of a room, and a finding tells each layer.
    const bare = expandLevel(level(rooms, [AB]));
    expect(bare.layers).toEqual({});
    expect(bare.layerFindings.map((finding) => [finding.code, finding.layer, finding.room])).toEqual([
      ["layer-unknown", "mark/1", "b"],
      ["layer-unknown", "pipe/1", "b"],
    ]);
  });

  it("keeps the layer of the level record when the add-on has no function `join`, and tells the layer of each room", () => {
    const own = { "mark/1": marks({ on: "wall", wall: "a/s0", face: "left", offset: 1, height: 1 }), "pipe/1": { taps: [] } };
    const rooms: LevelRoom[] = [
      { id: "a", survey: { ...A, layers: { "mark/1": marks() } } },
      { id: "b", survey: B },
    ];
    const result = expandLevel(level(rooms, [AB], { layers: own }), { addOns: [markAddOn("mark/1")] });
    expect(result.layers).toEqual(own);
    expect(result.layerFindings).toEqual([
      {
        level: "error",
        code: "layer-unknown",
        layer: "mark/1",
        at: "",
        message: `The add-on of the layer "mark/1" has no function "join", so the result does not have the layer of the room "a".`,
        room: "a",
      },
    ]);
  });

  it("gives the findings of the read of each room first, then the findings of the join", () => {
    const rooms: LevelRoom[] = [
      { id: "a", survey: { ...A, layers: { "mark/1": marks() } } },
      { id: "b", survey: { ...B, layers: { "pipe/1": { taps: [] } } } },
    ];
    const result = expandLevel(level(rooms, [AB]), { addOns: [markAddOn("mark/1")] });
    expect(result.layerFindings.map((finding) => [finding.code, finding.layer, finding.room])).toEqual([
      ["layer-unknown", "pipe/1", "b"],
      ["layer-unknown", "mark/1", "a"],
    ]);
  });

  it("gives the survey of each room with no layers, and does not change the level record", () => {
    const record = level(
      [
        { id: "a", survey: { ...A, layers: { "mark/1": marks({ on: "wall", wall: "s0", face: "left", offset: 1, height: 1 }) } } },
        { id: "b", survey: B },
      ],
      [AB],
    );
    const text = JSON.stringify(record);
    const result = expandLevel(record, { addOns: [MARK] });
    expect(result.rooms.map((room) => "layers" in room.survey)).toEqual([false, false]);
    expect(result.rooms.map((room) => "layers" in room.result)).toEqual([false, false]);
    expect(result.rooms.map((room) => room.result.layerFindings)).toEqual([[], []]);
    expect(JSON.stringify(record)).toBe(text);
  });

  it("puts a mark of a room at the place of an outlet with the same numbers, for each room and each unit", () => {
    const size = fc.double({ min: 2, max: 12, noNaN: true });
    const part = fc.double({ min: 0, max: 1, noNaN: true });
    const unit = fc.constantFrom("m", "ft", "cm");
    fc.assert(
      fc.property(size, size, fc.boolean(), fc.integer({ min: 0, max: 3 }), part, part, unit, unit, (width, depth, toLeft, index, along, up, own, of) => {
        const turn = toLeft ? "left" : "right";
        const wall = `s${index}`;
        const offset = along * (index % 2 === 0 ? width : depth);
        const height = up * 2;
        const b = survey(sides([width, depth, width, depth], [turn, turn, turn, turn]), {
          unit: own,
          outlets: [{ id: "o", wall, offset, height }],
          layers: { "mark/1": marks({ on: "wall", wall, face: "left", offset, height }) },
        });
        const result = expandLevel(
          level(
            [
              { id: "a", survey: A },
              { id: "b", survey: b },
            ],
            [],
            { unit: of },
          ),
          { addOns: [MARK] },
        );
        const outlet = result.room.outlets?.find((item) => item.id === "b/o");
        expect(outlet).toBeDefined();
        expect(marksOf(result)).toEqual([{ id: "b/m0", anchor: { on: "wall", wall: outlet?.wall, face: outlet?.face, offset: outlet?.offset, height: outlet?.height }, size: 1 }]);
        expect(result.layerFindings).toEqual([]);
      }),
    );
  });
});
