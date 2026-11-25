import type { Ring } from "@mark1russell7/layout-contract";
import type { PlanPoint } from "../room.ts";
import type { LengthUnit } from "../units.ts";

/**
 * A line of a sheet: one straight piece of a stroked path, in the coordinates of the sheet.
 * The y axis of a sheet points down, as in a PDF page after the usual flip.
 */
export interface SheetLine {
  readonly from: PlanPoint;
  readonly to: PlanPoint;
  /** The width of the pen, in the units of the sheet. */
  readonly width: number;
  /** The color of the pen, for example `#000000`. */
  readonly color: string;
  /** This value is true when the line is one piece of a curve, for example of the swing of a door. */
  readonly curve?: boolean | undefined;
}

/** A filled path of a sheet. The rings use the even-odd rule. The sequence of the fills is the paint sequence. */
export interface SheetFill {
  readonly color: string;
  readonly rings: readonly Ring[];
}

/** A text of a sheet. The point `at` is the start of its base line. */
export interface SheetText {
  readonly text: string;
  readonly at: PlanPoint;
  /** The height of the text, in the units of the sheet. */
  readonly height: number;
}

/**
 * A sheet: the vector paths of one floor plan, for example from a page of a PDF file.
 * The scale is the number of units of the sheet for one `unit` of the building. A PDF page at 1/8 inch to the foot has the scale 9 with the unit `ft`.
 */
export interface Sheet {
  /** The width of the sheet, in the units of the sheet. */
  readonly width: number;
  /** The height of the sheet, in the units of the sheet. */
  readonly height: number;
  readonly scale: number;
  /** The unit of the building, and of each length of the result. */
  readonly unit: LengthUnit;
  readonly lines: readonly SheetLine[];
  readonly fills?: readonly SheetFill[] | undefined;
  readonly texts?: readonly SheetText[] | undefined;
}

/** This function gives the name of the pen of a line: its width, a bar, then its color. */
export function penOf(line: Pick<SheetLine, "width" | "color">): string {
  return `${line.width}|${line.color}`;
}

/** This function gives the length of a line. */
export function lineLength(line: Pick<SheetLine, "from" | "to">): number {
  return Math.hypot(line.to[0] - line.from[0], line.to[1] - line.from[1]);
}

/** A legend: the name of each fill color, and the fills that are the color samples of the legend. */
export interface Legend {
  /** The name of each color. A color with two or more names has the names with a slash between them. */
  readonly names: Readonly<Record<string, string>>;
  /** The position of each sample in the fills of the sheet. A sample is not a room. */
  readonly samples: readonly number[];
}

/** The options of `readLegend`. Each length is in the units of the sheet, and the defaults suit a sheet in points. */
export interface LegendOptions {
  /** The smallest side of a sample. The default is 4. */
  readonly smallest?: number | undefined;
  /** The largest side of a sample. The default is 30. */
  readonly largest?: number | undefined;
  /** The largest distance from the right side of a sample to the start of its text. The default is 12. */
  readonly reach?: number | undefined;
  /** The smallest height of a text of the legend. The default is 2. */
  readonly smallestText?: number | undefined;
}

/** This function gives the box of a fill: the smallest x, the smallest y, the largest x and the largest y. */
export function fillBox(fill: SheetFill): readonly [number, number, number, number] {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const ring of fill.rings) {
    for (const [x, y] of ring) {
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  }
  return [x0, y0, x1, y1];
}

/**
 * This function reads the legend of a sheet. A sample is a small square fill with a text just to its right.
 * The text is the name of the color of the sample.
 */
export function readLegend(sheet: Pick<Sheet, "fills" | "texts">, options: LegendOptions = {}): Legend {
  const smallest = options.smallest ?? 4;
  const largest = options.largest ?? 30;
  const reach = options.reach ?? 12;
  const smallestText = options.smallestText ?? 2;
  const texts = sheet.texts ?? [];
  const names = new Map<string, string[]>();
  const samples: number[] = [];
  (sheet.fills ?? []).forEach((fill, index) => {
    const [x0, y0, x1, y1] = fillBox(fill);
    const w = x1 - x0;
    const h = y1 - y0;
    if (w < smallest || h < smallest || w > largest || h > largest || Math.abs(w - h) > 0.5 * Math.max(w, h)) return;
    const text = texts.find((item) => item.height > smallestText && item.at[0] > x1 && item.at[0] - x1 < reach && item.at[1] > y0 - 2 && item.at[1] < y1 + 4);
    if (text === undefined || /^\W*$/.test(text.text)) return;
    samples.push(index);
    const list = names.get(fill.color) ?? [];
    const name = text.text.trim();
    if (!list.includes(name)) list.push(name);
    names.set(fill.color, list);
  });
  return { names: Object.fromEntries([...names].map(([color, list]) => [color, list.join("/")])), samples };
}
