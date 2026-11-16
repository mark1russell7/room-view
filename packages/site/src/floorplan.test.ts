import { expandLevel } from "@mark1russell7/room-view";
import { SAMPLE_LEVEL } from "@mark1russell7/room-view/sample";
import { describe, expect, it } from "vitest";
import {
  emptyDraft,
  featureFaults,
  featureSpans,
  listedObjects,
  objectFaults,
  objectMarks,
  roomName,
  storeOf,
  withConnection,
  withNewRooms,
  type Draft,
  type DraftFeature,
  type DraftObject,
  type DraftSide,
  type Store,
  type TypedLength,
} from "./draft.ts";
import { drawLevel, PLAN_MARGIN, type LevelDrawing, type PlanInput } from "./floorplan.ts";
import { draftsOf, jointsOf, levelOf } from "./level.ts";
import type { Pixel } from "./walk.ts";

const typed = (text: string): TypedLength => ({ value: text, inches: "" });

/** This function gives a room with a name. The walk goes to the left, and each corner is square. `features` has the features of a wall at its position. */
function box(name: string, lengths: readonly string[], features: Readonly<Record<number, readonly DraftFeature[]>> = {}): Draft {
  return {
    ...emptyDraft("m"),
    name,
    sides: lengths.map((length, index): DraftSide => ({ key: `s${String(index + 1)}`, length: typed(length), corner: "left", angle: "", features: features[index] ?? [], objects: [] })),
  };
}

function door(key: string, offset: string, width = "0.9"): DraftFeature {
  return { key, kind: "door", from: "start", offset: typed(offset), width: typed(width), height: typed(""), sill: typed("") };
}

const SIZE = { width: 600, height: 400 };
const FOUR_BY_THREE = ["4", "3", "4", "3"];

/** Room A has a door on its east wall. Room B has the same door on its west wall, so room B is to the east of room A. */
const A = box("A", FOUR_BY_THREE, { 1: [door("f1", "0.2")] });
const B = box("B", FOUR_BY_THREE, { 3: [door("f1", "1.9")] });
const PAIR = withConnection(storeOf([A, B]), { room: 0, feature: "f1" }, { room: 1, feature: "f1" });

/** This function gives the drawing of the rooms of a store, as the page makes it. */
function draw(store: Store, size = SIZE): LevelDrawing {
  const result = expandLevel(levelOf(store));
  const inputs = store.rooms.map((room, index): PlanInput => {
    const placed = result.rooms[index];
    if (placed === undefined) return { name: roomName(room, index), spans: [], marks: [] };
    return { name: roomName(room, index), spans: featureSpans(room, featureFaults(room, placed.result)), marks: objectMarks(room, objectFaults(room, placed.result)) };
  });
  return drawLevel(result, size, inputs, jointsOf(store, result));
}

interface Box {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

function boxOf(points: readonly Pixel[]): Box {
  const xs = points.map((point) => point[0]);
  const ys = points.map((point) => point[1]);
  return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
}

const floorOf = (drawing: LevelDrawing, room: number): Box => boxOf(drawing.rooms[room]?.drawing.floor ?? []);

/** The rooms of the sample apartment. */
const drafts = (): readonly Draft[] => draftsOf(SAMPLE_LEVEL).rooms;

describe("drawLevel", () => {
  it("draws the rooms with one scale, in the picture", () => {
    const drawing = draw(PAIR);
    expect(drawing.rooms.map((room) => [room.room, room.name, room.apart])).toEqual([
      [0, "A", false],
      [1, "B", false],
    ]);
    const a = floorOf(drawing, 0);
    const b = floorOf(drawing, 1);
    expect(a.right - a.left).toBeCloseTo(b.right - b.left, 6);
    expect(a.bottom - a.top).toBeCloseTo(((a.right - a.left) * 3) / 4, 6);
    // Room B is to the right of room A, at the same height. The two rooms fill the width of the picture.
    expect(b.left).toBeGreaterThan(a.right);
    expect(b.top).toBeCloseTo(a.top, 6);
    expect(a.left).toBeCloseTo(PLAN_MARGIN.x, 6);
    expect(b.right).toBeCloseTo(SIZE.width - PLAN_MARGIN.x, 6);
    expect(a.top).toBeGreaterThanOrEqual(PLAN_MARGIN.y);
    expect(a.bottom).toBeLessThanOrEqual(SIZE.height - PLAN_MARGIN.y);
  });

  it("gives no label to a wall", () => {
    expect(draw(PAIR).rooms.map((room) => room.drawing.labels)).toEqual([[], []]);
  });

  it("puts the name of a room at the center of its floor", () => {
    const drawing = draw(PAIR);
    const a = floorOf(drawing, 0);
    const label = drawing.rooms[0]?.label;
    expect(label?.[0]).toBeCloseTo((a.left + a.right) / 2, 6);
    expect(label?.[1]).toBeCloseTo((a.top + a.bottom) / 2, 6);
  });

  it("puts the name in the larger part of a room with an inset corner", () => {
    // The room is 6 m wide for its first 3 m, and 4 m wide for the other 2 m.
    const nook: Draft = {
      ...box("Living room", ["6", "3", "2", "2", "4", "5"]),
      sides: box("", ["6", "3", "2", "2", "4", "5"]).sides.map((side, index): DraftSide => (index === 2 ? { ...side, corner: "right" } : side)),
    };
    const drawing = draw(storeOf([nook]));
    const floor = floorOf(drawing, 0);
    const label = drawing.rooms[0]?.label;
    expect(label).toBeDefined();
    // The label is at the middle of the full width, and it is below the middle of the height.
    expect(label?.[0]).toBeCloseTo((floor.left + floor.right) / 2, 6);
    expect(label?.[1]).toBeGreaterThan((floor.top + floor.bottom) / 2);
    expect(label?.[1]).toBeLessThan(floor.bottom);
  });

  it("gives no label when the name does not fit in the room", () => {
    const long = box("The room with a name that is much too long for its floor", FOUR_BY_THREE);
    expect(draw(storeOf([A, long])).rooms.map((room) => room.label === undefined)).toEqual([false, true]);
    // A small picture has no space for a name.
    expect(draw(storeOf([box("Bathroom", ["2", "1", "2", "1"])]), { width: 90, height: 80 }).rooms[0]?.label).toBeUndefined();
  });

  it("gives no label and no floor to a room that does not close", () => {
    const open = box("B", ["4", "3", "4", "2"], { 3: [door("f1", "0.5")] });
    const room = draw({ ...PAIR, rooms: [A, open] }).rooms[1];
    expect(room?.drawing.floor).toBeUndefined();
    expect(room?.label).toBeUndefined();
    expect(room?.drawing.walls).toHaveLength(4);
  });

  it("draws one line for each connection, between the centers of its two doors", () => {
    const drawing = draw(PAIR);
    expect(drawing.ties).toHaveLength(1);
    const tie = drawing.ties[0];
    expect(tie?.connection).toBe(0);
    expect(tie?.state).toBe("fits");
    const a = floorOf(drawing, 0);
    const b = floorOf(drawing, 1);
    // The door of room A is on its east wall, and that of room B is on its west wall: the line goes through the wall between the rooms.
    expect(tie?.from[0]).toBeCloseTo(a.right, 6);
    expect(tie?.to[0]).toBeCloseTo(b.left, 6);
    expect(tie?.from[1]).toBeCloseTo(tie?.to[1] ?? 0, 6);
    // The center of the door is 0.65 m above the south wall, of a height of 3 m.
    expect(tie?.from[1]).toBeCloseTo(a.bottom - ((a.bottom - a.top) * 0.65) / 3, 6);
  });

  it("draws no line for a door that needs its numbers", () => {
    const empty = box("B", FOUR_BY_THREE, { 3: [door("f1", "1.9", "")] });
    expect(draw({ ...PAIR, rooms: [A, empty] }).ties).toEqual([]);
  });

  it("tells the state of a connection that does not fit", () => {
    const two = box("A", FOUR_BY_THREE, { 1: [door("f1", "0.2"), door("f2", "2")] });
    const moved = box("B", FOUR_BY_THREE, { 3: [door("f2", "0.6"), door("f1", "1.9")] });
    const store = withConnection({ ...PAIR, rooms: [two, moved] }, { room: 0, feature: "f2" }, { room: 1, feature: "f2" });
    const ties = draw(store).ties;
    expect(ties.map((tie) => [tie.connection, tie.state])).toEqual([
      [0, "fits"],
      [1, "off"],
    ]);
    // The two doors of the second connection are 0.5 m apart along the wall.
    const scale = (floorOf(draw(store), 0).right - floorOf(draw(store), 0).left) / 4;
    expect(Math.abs((ties[1]?.to[1] ?? 0) - (ties[1]?.from[1] ?? 0))).toBeCloseTo(0.5 * scale, 6);
  });

  it("marks a room with no door to the other rooms", () => {
    const drawing = draw(storeOf([A, B, box("C", FOUR_BY_THREE)]));
    expect(drawing.rooms.map((room) => room.apart)).toEqual([false, true, true]);
    expect(drawing.ties).toEqual([]);
    // The rooms that are apart do not cover the first room.
    const a = floorOf(drawing, 0);
    const b = floorOf(drawing, 1);
    expect(b.left >= a.right || b.right <= a.left || b.top >= a.bottom || b.bottom <= a.top).toBe(true);
  });

  it("draws the sample apartment with a name in each room", () => {
    const drafts = draftsOf(SAMPLE_LEVEL);
    const store = withNewRooms(storeOf([emptyDraft("m")]), drafts.rooms, drafts.connections, true);
    const drawing = draw(store, { width: 720, height: 520 });
    expect(drawing.rooms.map((room) => room.name)).toEqual(["Living room", "Hall", "Bathroom", "Bedroom"]);
    expect(drawing.rooms.map((room) => room.label !== undefined)).toEqual([true, true, true, true]);
    expect(drawing.ties.map((tie) => tie.state)).toEqual(["fits", "fits", "fits"]);
    for (const room of drawing.rooms) {
      const floor = boxOf(room.drawing.floor ?? []);
      expect(floor.left).toBeGreaterThanOrEqual(PLAN_MARGIN.x - 1e-6);
      expect(floor.right).toBeLessThanOrEqual(720 - PLAN_MARGIN.x + 1e-6);
      expect(floor.top).toBeGreaterThanOrEqual(PLAN_MARGIN.y - 1e-6);
      expect(floor.bottom).toBeLessThanOrEqual(520 - PLAN_MARGIN.y + 1e-6);
    }
  });

  it("draws the objects of each room on its floor", () => {
    const drafts = draftsOf(SAMPLE_LEVEL);
    const store = withNewRooms(storeOf([emptyDraft("m")]), drafts.rooms, drafts.connections, true);
    const drawing = draw(store, { width: 720, height: 520 });
    expect(drawing.rooms.map((room) => room.drawing.objects.length)).toEqual(store.rooms.map((room) => listedObjects(room).length));
    expect(drawing.rooms.map((room) => room.drawing.objects.length)).toEqual([9, 1, 1, 2]);
    for (const room of drawing.rooms) {
      const floor = boxOf(room.drawing.floor ?? []);
      for (const object of room.drawing.objects) {
        const outline = boxOf(object.ring);
        expect(object.fault).toBeUndefined();
        expect(outline.left).toBeGreaterThanOrEqual(floor.left - 1e-6);
        expect(outline.right).toBeLessThanOrEqual(floor.right + 1e-6);
        expect(outline.top).toBeGreaterThanOrEqual(floor.top - 1e-6);
        expect(outline.bottom).toBeLessThanOrEqual(floor.bottom + 1e-6);
      }
    }
    // A display on a desk comes after the desk, so the drawing shows it.
    const kinds = drawing.rooms[0]?.drawing.objects.map((object) => object.kind) ?? [];
    expect(kinds.indexOf("display")).toBeGreaterThan(kinds.indexOf("desk"));
  });

  it("draws no objects of a room that does not close", () => {
    const bed: DraftObject = { ...listedObjects(drafts()[3] ?? A)[0]!.object, key: "o1" };
    const furnished = (room: Draft): Draft => ({ ...room, sides: room.sides.map((side, index) => (index === 0 ? { ...side, objects: [bed] } : side)) });
    const open = box("B", ["4", "3", "4", "2"], { 3: [door("f1", "0.5")] });
    const drawing = draw({ ...PAIR, rooms: [furnished(A), furnished(open)] });
    expect(drawing.rooms.map((room) => room.drawing.objects.length)).toEqual([1, 0]);
  });
});
