import { expandSurvey, SURVEY_SCHEMA, type PlanPoint, type SurveyResult, type SurveyTurn } from "@mark1russell7/room-view";
import { describe, expect, it } from "vitest";
import { drawWalk, pathOf, PICTURE_MARGIN, type Pixel, type WalkDrawing } from "./walk.ts";

// A picture whose room for the drawing is 600 by 300 pixels. A room of 6 by 3 thus gets 100 pixels for each unit.
const SIZE = { width: 600 + 2 * PICTURE_MARGIN.x, height: 300 + 2 * PICTURE_MARGIN.y };
const LEFT = PICTURE_MARGIN.x;
const RIGHT = SIZE.width - PICTURE_MARGIN.x;
const TOP = PICTURE_MARGIN.y;
const BOTTOM = SIZE.height - PICTURE_MARGIN.y;

function walkOf(sides: readonly (readonly [length: number, turn: SurveyTurn])[]): SurveyResult {
  return expandSurvey({
    schema: SURVEY_SCHEMA,
    unit: "m",
    height: 2.5,
    wallThickness: 0.1,
    sides: sides.map(([length, turn], index) => ({ id: `w${String(index + 1)}`, length, turn })),
  });
}

function textsOf(result: SurveyResult): string[] {
  return result.room.walls.map((_, index) => `wall ${String(index + 1)}`);
}

function draw(result: SurveyResult, texts: readonly (string | undefined)[] = textsOf(result)): WalkDrawing {
  return drawWalk(result, SIZE, texts);
}

/** An open walk with the walls of `result` and the given points. */
function openWalk(result: SurveyResult, walk: readonly PlanPoint[]): SurveyResult {
  return { ...result, walk, closure: { ...result.closure, closed: false } };
}

function near(actual: Pixel | undefined, expected: Pixel): void {
  expect(actual).toBeDefined();
  expect(actual?.[0]).toBeCloseTo(expected[0], 6);
  expect(actual?.[1]).toBeCloseTo(expected[1], 6);
}

const ROOM = walkOf([
  [6, "left"],
  [3, "left"],
  [6, "left"],
  [3, "left"],
]);
const ROOM_TO_RIGHT = walkOf([
  [6, "right"],
  [3, "right"],
  [6, "right"],
  [3, "right"],
]);
const OPEN = walkOf([
  [6, "left"],
  [3, "left"],
  [4, "left"],
]);

describe("drawWalk, a closed room", () => {
  const drawing = draw(ROOM);

  it("fits the room in the picture inside the margins, with the y axis down", () => {
    expect(ROOM.closure.closed).toBe(true);
    expect(drawing.walls.map((wall) => wall.side)).toEqual([0, 1, 2, 3]);
    near(drawing.walls[0]?.from, [LEFT, BOTTOM]);
    near(drawing.walls[0]?.to, [RIGHT, BOTTOM]);
    near(drawing.walls[1]?.to, [RIGHT, TOP]);
    near(drawing.walls[2]?.to, [LEFT, TOP]);
    near(drawing.walls[3]?.to, [LEFT, BOTTOM]);
  });

  it("gives the floor as the outline of the corners, and no gap", () => {
    expect(drawing.floor).toHaveLength(4);
    near(drawing.floor?.[0], [LEFT, BOTTOM]);
    near(drawing.floor?.[2], [RIGHT, TOP]);
    expect(drawing.gap).toBeUndefined();
  });

  it("starts at the first corner, in the direction of the first wall", () => {
    near(drawing.start, [LEFT, BOTTOM]);
    near(drawing.heading, [1, 0]);
  });

  it("puts each label 13 pixels from the middle of its wall, on the outer side", () => {
    expect(drawing.labels.map((label) => [label.side, label.text, label.anchor])).toEqual([
      [0, "wall 1", "middle"],
      [1, "wall 2", "start"],
      [2, "wall 3", "middle"],
      [3, "wall 4", "end"],
    ]);
    near(drawing.labels[0]?.at, [SIZE.width / 2, BOTTOM + 13]);
    near(drawing.labels[1]?.at, [RIGHT + 13, SIZE.height / 2]);
    near(drawing.labels[2]?.at, [SIZE.width / 2, TOP - 13]);
    near(drawing.labels[3]?.at, [LEFT - 13, SIZE.height / 2]);
  });

  it("puts the labels of a walk to the right on the outer side too", () => {
    const right = draw(ROOM_TO_RIGHT);
    expect(ROOM_TO_RIGHT.closure.closed).toBe(true);
    // The room is below its first wall, so the first wall is the top of the picture.
    near(right.walls[0]?.from, [LEFT, TOP]);
    near(right.walls[0]?.to, [RIGHT, TOP]);
    near(right.labels[0]?.at, [SIZE.width / 2, TOP - 13]);
    near(right.labels[1]?.at, [RIGHT + 13, SIZE.height / 2]);
    expect(right.labels.map((label) => label.anchor)).toEqual(["middle", "start", "middle", "end"]);
  });

  it("puts a room that is narrower than the picture in the center", () => {
    const square = draw(
      walkOf([
        [3, "left"],
        [3, "left"],
        [3, "left"],
        [3, "left"],
      ]),
    );
    near(square.walls[0]?.from, [SIZE.width / 2 - 150, BOTTOM]);
    near(square.walls[0]?.to, [SIZE.width / 2 + 150, BOTTOM]);
    near(square.walls[1]?.to, [SIZE.width / 2 + 150, TOP]);
  });

  it("puts a room that is lower than the picture in the center", () => {
    const low = draw(
      walkOf([
        [6, "left"],
        [1, "left"],
        [6, "left"],
        [1, "left"],
      ]),
    );
    near(low.walls[0]?.from, [LEFT, SIZE.height / 2 + 50]);
    near(low.walls[1]?.to, [RIGHT, SIZE.height / 2 - 50]);
  });

  it("gives no label to a wall with no text", () => {
    const drawing = draw(ROOM, ["6 m", undefined, "6 m"]);
    expect(drawing.labels.map((label) => [label.side, label.text])).toEqual([
      [0, "6 m"],
      [2, "6 m"],
    ]);
  });

  it("gives no label to a wall shorter than 26 pixels", () => {
    const thin = draw(
      walkOf([
        [6, "left"],
        [0.25, "left"],
        [6, "left"],
        [0.25, "left"],
      ]),
    );
    expect(thin.walls).toHaveLength(4);
    expect(thin.labels.map((label) => label.side)).toEqual([0, 2]);
    const short = draw(
      walkOf([
        [6, "left"],
        [0.27, "left"],
        [6, "left"],
        [0.27, "left"],
      ]),
    );
    expect(short.labels.map((label) => label.side)).toEqual([0, 1, 2, 3]);
  });

  it("uses a picture smaller than its margins without an error", () => {
    const small = drawWalk(ROOM, { width: 40, height: 30 }, textsOf(ROOM));
    expect(small.walls).toHaveLength(4);
    for (const wall of small.walls) for (const value of [...wall.from, ...wall.to]) expect(Number.isFinite(value)).toBe(true);
    expect(small.labels).toEqual([]);
  });
});

describe("drawWalk, an open walk", () => {
  const drawing = draw(OPEN);

  it("draws the walls that the person measured, and no floor", () => {
    expect(OPEN.closure.closed).toBe(false);
    expect(drawing.floor).toBeUndefined();
    expect(drawing.walls).toHaveLength(3);
    near(drawing.walls[0]?.from, [LEFT, BOTTOM]);
    near(drawing.walls[1]?.to, [RIGHT, TOP]);
    near(drawing.walls[2]?.to, [LEFT + 200, TOP]);
  });

  it("draws the gap from the end of the walk to its start", () => {
    near(drawing.gap?.from, [LEFT + 200, TOP]);
    near(drawing.gap?.to, [LEFT, BOTTOM]);
    near(drawing.gap?.at, [LEFT + 100, SIZE.height / 2]);
  });

  it("draws no gap smaller than 3 pixels", () => {
    const corners: readonly PlanPoint[] = [
      [0, 0],
      [6, 0],
      [6, 3],
      [0, 3],
    ];
    expect(draw(openWalk(ROOM, [...corners, [0, 0.02]])).gap).toBeUndefined();
    const wide = draw(openWalk(ROOM, [...corners, [0, 0.05]]));
    near(wide.gap?.from, [LEFT, BOTTOM - 5]);
    near(wide.gap?.to, [LEFT, BOTTOM]);
  });

  it("gives no direction when the first wall has no length", () => {
    const drawing = draw(
      openWalk(OPEN, [
        [0, 0],
        [0, 0],
        [6, 0],
        [6, 3],
      ]),
    );
    expect(drawing.heading).toBeUndefined();
    near(drawing.start, [LEFT, BOTTOM]);
    expect(drawing.labels.map((label) => label.side)).toEqual([1, 2]);
  });

  it("puts a walk with no size at the center of the picture", () => {
    const origin: PlanPoint = [2, 5];
    const drawing = draw(openWalk(OPEN, [origin, origin, origin, origin]));
    const center: Pixel = [SIZE.width / 2, SIZE.height / 2];
    near(drawing.start, center);
    for (const wall of drawing.walls) {
      near(wall.from, center);
      near(wall.to, center);
    }
    expect(drawing.heading).toBeUndefined();
    expect(drawing.labels).toEqual([]);
    expect(drawing.gap).toBeUndefined();
  });

  it("draws one wall as a line along the picture", () => {
    const one = walkOf([[4, "left"]]);
    const drawing = draw(one);
    expect(one.closure.closed).toBe(false);
    expect(drawing.walls).toHaveLength(1);
    near(drawing.walls[0]?.from, [LEFT, SIZE.height / 2]);
    near(drawing.walls[0]?.to, [RIGHT, SIZE.height / 2]);
    near(drawing.heading, [1, 0]);
    near(drawing.gap?.from, [RIGHT, SIZE.height / 2]);
  });
});

describe("pathOf", () => {
  const points: readonly Pixel[] = [
    [1, 2],
    [3.26, 4.049],
    [10, 0],
  ];

  it("gives a line through the positions, with one decimal place", () => {
    expect(pathOf(points, false)).toBe("M1.0 2.0 L3.3 4.0 L10.0 0.0");
  });

  it("closes the line of an outline", () => {
    expect(pathOf(points, true)).toBe("M1.0 2.0 L3.3 4.0 L10.0 0.0 Z");
  });
});
