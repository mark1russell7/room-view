import type { PlanPoint } from "../room.ts";
import type { Sheet, SheetFill, SheetLine, SheetText } from "./sheet.ts";

/** The scale of the sample sheet: 9 points for one foot, the scale 1/8 inch to the foot. */
export const SAMPLE_SCALE = 9;

/** The space around the building on the sample sheet, in feet. */
const MARGIN = 6;

/** The thickness of each wall of the sample sheet, in feet. */
export const SAMPLE_WALL = 0.5;

/** This function gives a point of the sample sheet in points, from a point of the building in feet. The y axis points down. */
function at(x: number, y: number, scale: number): PlanPoint {
  return [(x + MARGIN) * scale, (y + MARGIN) * scale];
}

/** This function gives the four lines of the outline of one piece of wall, from its center line. The piece is horizontal or vertical. */
function piece(from: PlanPoint, to: PlanPoint, scale: number, width: number): SheetLine[] {
  const half = SAMPLE_WALL / 2;
  const [x0, y0] = from;
  const [x1, y1] = to;
  const box: [number, number, number, number] =
    y0 === y1 ? [Math.min(x0, x1), y0 - half, Math.max(x0, x1), y0 + half] : [x0 - half, Math.min(y0, y1), x0 + half, Math.max(y0, y1)];
  const corners = [at(box[0], box[1], scale), at(box[2], box[1], scale), at(box[2], box[3], scale), at(box[0], box[3], scale)];
  return corners.map((corner, index) => ({ from: corner, to: corners[(index + 1) % 4]!, width, color: "#000000" }));
}

/** This function gives a ring of the sample sheet in points, from a box of the building in feet. */
function ringOf(x0: number, y0: number, x1: number, y1: number, scale: number): PlanPoint[] {
  return [at(x0, y0, scale), at(x1, y0, scale), at(x1, y1, scale), at(x0, y1, scale)];
}

/** The options of the sample sheet. */
export interface SampleOptions {
  /** The number of sheet units in one foot. The default is `SAMPLE_SCALE`. */
  readonly scale?: number | undefined;
  /** This value is true when the sheet has the swing of the door of the west room. The default is true. */
  readonly swing?: boolean | undefined;
  /** The width of the door of the east room, in feet. The default is 3. */
  readonly eastDoor?: number | undefined;
}

/**
 * This function gives a small invented sheet in points.
 * The sheet has two rooms of 12 ft by 14 ft to the south of a corridor of 24 ft by 4 ft.
 * Each room has a door of 3 ft to the corridor. The door of the west room has a swing. The sheet has a legend with two colors.
 */
export function sampleSheet(options: SampleOptions = {}): Sheet {
  const scale = options.scale ?? SAMPLE_SCALE;
  const width = 0.5 * (scale / SAMPLE_SCALE);
  const eastDoor = options.eastDoor ?? 3;
  const centers: [PlanPoint, PlanPoint][] = [
    // The outer walls.
    [[-0.25, 0], [24.25, 0]],
    [[24, -0.25], [24, 18.25]],
    [[-0.25, 18], [24.25, 18]],
    [[0, -0.25], [0, 18.25]],
    // The wall of the corridor, with a door at 5 ft to 8 ft and a door of the east room from 15 ft.
    [[0, 4], [5, 4]],
    [[8, 4], [15, 4]],
    [[15 + eastDoor, 4], [24, 4]],
    // The wall between the two rooms.
    [[12, 4], [12, 18]],
  ];
  const lines: SheetLine[] = centers.flatMap(([from, to]) => piece(from, to, scale, width));
  if (options.swing ?? true) {
    // The leaf of the door goes into the west room from its hinge, and the swing is a quarter circle.
    const hinge: PlanPoint = [5, 4 + SAMPLE_WALL / 2];
    const radius = 3;
    lines.push({ from: at(hinge[0], hinge[1], scale), to: at(hinge[0], hinge[1] + radius, scale), width: width / 2, color: "#000000" });
    const steps = 8;
    for (let k = 0; k < steps; k++) {
      const a = (Math.PI / 2) * (k / steps);
      const b = (Math.PI / 2) * ((k + 1) / steps);
      lines.push({
        from: at(hinge[0] + radius * Math.sin(a), hinge[1] + radius * Math.cos(a), scale),
        to: at(hinge[0] + radius * Math.sin(b), hinge[1] + radius * Math.cos(b), scale),
        width: width / 2,
        color: "#000000",
        curve: true,
      });
    }
  }
  // A dimension line above the building, with a different pen.
  lines.push({ from: at(0, -3, scale), to: at(24, -3, scale), width: width / 5, color: "#808080" });
  const half = SAMPLE_WALL / 2;
  const fills: SheetFill[] = [
    { color: "#ffffff", rings: [ringOf(-MARGIN, -MARGIN, 30, 24, scale)] },
    { color: "#99ccff", rings: [ringOf(half, half, 24 - half, 4 - half, scale)] },
    { color: "#ffcc00", rings: [ringOf(half, 4 + half, 12 - half, 18 - half, scale)] },
    { color: "#ffcc00", rings: [ringOf(12 + half, 4 + half, 24 - half, 18 - half, scale)] },
  ];
  // The legend below the building: two color samples, each with its name to the right.
  const sample = 8 * (scale / SAMPLE_SCALE);
  const base = 26 * scale;
  const legend: [string, string, number][] = [
    ["#ffcc00", "UNIT", 0],
    ["#99ccff", "CORRIDOR", 10],
  ];
  const texts: SheetText[] = [];
  for (const [color, name, x] of legend) {
    const left = (x + 1) * scale;
    fills.push({ color, rings: [[[left, base], [left + sample, base], [left + sample, base + sample], [left, base + sample]]] });
    texts.push({ text: name, at: [left + sample + sample / 4, base + sample], height: sample * 0.75 });
  }
  return { width: (24 + 2 * MARGIN) * scale, height: (18 + 2 * MARGIN) * scale, scale, unit: "ft", lines, fills, texts };
}

/** The pens of the sheet of `pairSheet`. */
export const PAIR_PENS = { outer: "0.4|#000000", inner: "0.25|#000000", glass: "0.1|#000000" } as const;

/**
 * This function gives a small invented sheet in points, with two rooms of 20 ft by 10 ft side by side.
 *
 * - The outer walls have a wall pen, with two lines at 0.5 ft.
 * - A different pen draws the wall between the rooms, with two lines at 0.4 ft. Each line has two parts. The pen also has five single lines of 3 ft, as the fronts of counters.
 * - The south wall has a gap of 8 ft with three glazing lines at 0.3 ft. A pattern of ten lines in the same pen is below the building.
 * - The wall between the rooms stops 0.6 ft from the north wall.
 */
export function pairSheet(): Sheet {
  const scale = SAMPLE_SCALE;
  const lines: SheetLine[] = [];
  const draw = (pen: string, x0: number, y0: number, x1: number, y1: number): void => {
    const [width, color] = pen.split("|");
    lines.push({ from: at(x0, y0, scale), to: at(x1, y1, scale), width: Number(width), color: color! });
  };
  const outer = PAIR_PENS.outer;
  // The north, east and west walls: an inner face and an outer face.
  draw(outer, 0, 0, 40, 0);
  draw(outer, -0.5, -0.5, 40.5, -0.5);
  draw(outer, 40, 0, 40, 10);
  draw(outer, 40.5, -0.5, 40.5, 10.5);
  draw(outer, 0, 0, 0, 10);
  draw(outer, -0.5, -0.5, -0.5, 10.5);
  // The south wall, with a gap from 6 ft to 14 ft. A short end line closes each wall end at the gap.
  draw(outer, 0, 10, 6, 10);
  draw(outer, -0.5, 10.5, 6, 10.5);
  draw(outer, 14, 10, 40, 10);
  draw(outer, 14, 10.5, 40.5, 10.5);
  draw(outer, 6, 10, 6, 10.5);
  draw(outer, 14, 10, 14, 10.5);
  // The wall between the rooms: two faces, each in two parts, from 0.6 ft to 10 ft.
  const inner = PAIR_PENS.inner;
  for (const x of [19.8, 20.2]) {
    draw(inner, x, 0.6, x, 5.3);
    draw(inner, x, 5.3, x, 10);
  }
  // The fronts of the counters: single lines with no partner.
  for (const y of [2, 4, 6, 8]) draw(inner, 4, y, 7, y);
  draw(inner, 30, 3, 30, 6);
  // The glazing in the gap of the south wall, and a pattern below the building.
  const glass = PAIR_PENS.glass;
  for (const y of [9.95, 10.25, 10.55]) draw(glass, 6, y, 14, y);
  for (let k = 0; k < 10; k++) draw(glass, 10, 13 + 0.3 * k, 14, 13 + 0.3 * k);
  return { width: (40 + 2 * MARGIN) * scale, height: (10 + 2 * MARGIN) * scale, scale, unit: "ft", lines };
}
