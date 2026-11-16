import type { LevelResult } from "@mark1russell7/room-view";
import type { DraftEnd, FeatureSpan, ObjectMark } from "./draft.ts";
import type { Joint, JointState } from "./level.ts";
import { drawWalkAt, fitOf, type PictureMargin, type PictureSize, type Pixel, type WalkDrawing } from "./walk.ts";

// The drawing of the rooms of a level for the page "Measure a room", as data. Each position is in pixels of the picture.
// The rooms have one scale, so a door between two rooms is at one place in the picture.

/** The data of one room for the drawing of a level. */
export interface PlanInput {
  /** The name of the room, for its label. */
  readonly name: string;
  /** The place of each feature along its wall: the result of `featureSpans`. */
  readonly spans: readonly FeatureSpan[];
  /** Each object of the survey record of the room: the result of `objectMarks`. */
  readonly marks: readonly ObjectMark[];
}

/** One room of the drawing of a level. */
export interface PlanRoom {
  /** The position of the room in the level, from 0. */
  readonly room: number;
  readonly name: string;
  /** The walls, the features, the objects and the floor of the room. The drawing has no label of a wall. */
  readonly drawing: WalkDrawing;
  /** The center of the label with the name. A room has no label when its floor has no space for the name, or when the room does not close. */
  readonly label: Pixel | undefined;
  /** This value is true for a room with no path of connections to the first room. The level does not know its place. */
  readonly apart: boolean;
}

/** The line between the two doors of a connection. */
export interface PlanTie {
  /** The position of the connection in the level, from 0. */
  readonly connection: number;
  readonly from: Pixel;
  readonly to: Pixel;
  readonly state: JointState;
}

/** The drawing of a level. */
export interface LevelDrawing {
  readonly rooms: readonly PlanRoom[];
  /** One line for each connection whose two doors are in the drawing. */
  readonly ties: readonly PlanTie[];
}

/** The space between the drawing of a level and the edge of the picture, in pixels. */
export const PLAN_MARGIN: PictureMargin = { x: 24, y: 24 };

/** The width of one character of a label, in pixels. This is an estimate for a font size of 13 pixels. */
const CHARACTER_WIDTH = 7.4;

/** The space between a label and a wall, in pixels. */
const LABEL_SPACE = 6;

/** The distance from the center of a label to its top and to its bottom, with a space, in pixels. */
const HALF_LINE = 10;

/** A ring with an area below this number of square pixels has no center of area. */
const SMALLEST_AREA = 1e-6;

/** This function gives the parts of the horizontal line at a height that are in a ring, as pairs of x positions. */
function chords(ring: readonly Pixel[], y: number): readonly (readonly [left: number, right: number])[] {
  const crossings: number[] = [];
  ring.forEach((from, index) => {
    const to = ring[(index + 1) % ring.length] ?? from;
    // An edge has its lower end and not its upper end. Thus a corner at the height counts one time.
    const below = from[1] <= y;
    if (below === to[1] <= y) return;
    crossings.push(from[0] + ((y - from[1]) / (to[1] - from[1])) * (to[0] - from[0]));
  });
  crossings.sort((a, b) => a - b);
  const parts: (readonly [number, number])[] = [];
  for (let index = 0; index + 1 < crossings.length; index += 2) parts.push([crossings[index] ?? 0, crossings[index + 1] ?? 0]);
  return parts;
}

/** This function gives the height of the center of area of a ring. A ring with no area gives the mean height of its corners. */
function centerHeight(ring: readonly Pixel[]): number {
  let area = 0;
  let moment = 0;
  ring.forEach((from, index) => {
    const to = ring[(index + 1) % ring.length] ?? from;
    const cross = from[0] * to[1] - to[0] * from[1];
    area += cross;
    moment += (from[1] + to[1]) * cross;
  });
  if (Math.abs(area) < SMALLEST_AREA) return ring.reduce((sum, point) => sum + point[1], 0) / Math.max(ring.length, 1);
  return moment / (3 * area);
}

/**
 * This function gives the center of the label of a floor.
 * The center is the middle of the widest part of the floor, at the height of its center of area.
 * The floor of a room with an inset corner has its center of area near the larger part of the room.
 * The function gives `undefined` when the text does not fit between the walls at that place.
 */
function labelAt(floor: readonly Pixel[], text: string): Pixel | undefined {
  if (floor.length < 3) return undefined;
  const y = centerHeight(floor);
  let widest: readonly [number, number] | undefined;
  for (const part of chords(floor, y)) {
    if (widest === undefined || part[1] - part[0] > widest[1] - widest[0]) widest = part;
  }
  if (widest === undefined) return undefined;
  const x = (widest[0] + widest[1]) / 2;
  const half = (text.length * CHARACTER_WIDTH) / 2 + LABEL_SPACE;
  const fits = [y - HALF_LINE, y, y + HALF_LINE].every((height) => chords(floor, height).some(([left, right]) => left <= x - half && right >= x + half));
  return fits ? [x, y] : undefined;
}

/**
 * This function gives the drawing of the rooms of a level in a picture. `result` is the expansion of the level record.
 * `inputs` has the name, the features and the objects of each room, and `joints` has the state of each connection.
 * The rooms fill the picture together, with `PLAN_MARGIN` at each edge.
 */
export function drawLevel(result: LevelResult, size: PictureSize, inputs: readonly PlanInput[], joints: readonly Joint[]): LevelDrawing {
  const points = result.rooms.flatMap((room) => (room.result.closure.closed ? room.result.corners : room.result.walk));
  const pixel = fitOf(points, size, PLAN_MARGIN);
  const rooms = result.rooms.map((room, index): PlanRoom => {
    const input = inputs[index];
    const name = input?.name ?? "";
    const drawing = drawWalkAt(room.result, pixel, [], input?.spans ?? [], input?.marks ?? []);
    const label = drawing.floor === undefined || name === "" ? undefined : labelAt(drawing.floor, name);
    return { room: index, name, drawing, label, apart: room.group > 0 };
  });
  const centerOf = (end: DraftEnd): Pixel | undefined => {
    const feature = rooms[end.room]?.drawing.features.find((item) => item.key === end.feature);
    return feature === undefined ? undefined : [(feature.from[0] + feature.to[0]) / 2, (feature.from[1] + feature.to[1]) / 2];
  };
  const ties = joints.flatMap((joint, index): PlanTie[] => {
    const from = centerOf(joint.connection.from);
    const to = centerOf(joint.connection.to);
    return from === undefined || to === undefined ? [] : [{ connection: index, from, to, state: joint.state }];
  });
  return { rooms, ties };
}
