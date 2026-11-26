import { pointInRing, pointSegmentDistance, regionArea, type Ring } from "@mark1russell7/layout-contract";
import { median } from "@mark1russell7/rigor-statistics";
import { ROOM_SCHEMA, type Floor, type Opening, type OpeningKind, type PlanPoint, type Room, type Wall } from "../room.ts";
import { unitsPer } from "../units.ts";
import { findBridges, type Bridge, type BridgeGuide, type BridgeLimits, type BridgeOptions } from "./bridges.ts";
import { gridOf, labelRegions, regionOutline, ringCells, scanRings, stampLines, type Grid, type GridRegion } from "./raster.ts";
import { lineLength, penOf, type Legend, type Sheet, type SheetLine } from "./sheet.ts";
import { readPens, readWallLines, snapEnds, wallPairs, type PenRead, type WallLimits, type WallLineRead, type WallOptions } from "./walls.ts";

/** The name of the side of an opening that is outside the building. */
export const OUTSIDE = "outside";

/** The options of `importPlan`. Each length is in the `unit` of the sheet, and each area is in that unit squared. */
export interface ImportOptions {
  /** The legend of the sheet. Without it, the rooms have no use and the area gate has no rings. */
  readonly legend?: Legend | undefined;
  /** The wall pens. The default is each pen that `readPens` reads as a wall pen. */
  readonly wallPens?: readonly string[] | undefined;
  /** The pens of the doors, as barriers of the rooms. The default is the pen with the most curve lines: the pen of the door swings. */
  readonly doorPens?: readonly string[] | undefined;
  /**
   * The longest straight line of a door pen that is a barrier, in the unit of the plan. The default is 4.5 ft.
   * A longer line of the pen is not a door leaf, for example the edge of a floor finish across a corridor. It is not a barrier.
   */
  readonly longestLeaf?: number | undefined;
  readonly walls?: WallOptions | undefined;
  readonly bridges?: BridgeOptions | undefined;
  /** The side of a cell of the grid. The default is 0.1 ft. */
  readonly cell?: number | undefined;
  /** The largest number of cells of the grid. A larger grid gets larger cells. The default is 40 000 000. */
  readonly largestGrid?: number | undefined;
  /** A free region with a smaller area is a speck, not a room. The default is 12 square ft. */
  readonly smallestRoom?: number | undefined;
  /** A free region with a smaller mean width is the space inside a wall, not a room. The mean width is two times the area over the perimeter. The default is 1.6 ft. */
  readonly thinnestRoom?: number | undefined;
  /** The height of each wall. The default is 8 ft. */
  readonly height?: number | undefined;
  /** The height of each opening. The default is 80 in. */
  readonly openingHeight?: number | undefined;
  /** A fill ring with a smaller area is not in the area gate. The default is 15 square ft. */
  readonly smallestRing?: number | undefined;
  /** The limits of the area gate, as parts of the area of a ring. The default is 0.05 and 0.1. */
  readonly gateLimits?: readonly number[] | undefined;
  /**
   * A fill ring is in the area gate only when this part of its edge or more is near a line of the sheet.
   * A ring with no line on its edge is a letter or a symbol, not a room. The value 0 keeps each ring. The default is 0.25.
   */
  readonly gateEdge?: number | undefined;
  /**
   * This value is the part of the edge of a hole that wall lines must touch. Only such a hole leaves the area of its ring.
   * A hole with no walls on its edge is a fixture or a column under the fill. The value 0 keeps each hole in the area. The default is 0.5.
   */
  readonly gateHoles?: number | undefined;
}

/** One room of a plan import: a free region of the grid inside the building. */
export interface ImportedRoom {
  /** The `id` of the room, and of its floor in the room record. */
  readonly id: string;
  /** The name of the fill color under most of the room, from the legend. */
  readonly use?: string | undefined;
  /** The fill color under most of the room. */
  readonly color?: string | undefined;
  /** The area of the cells of the room. */
  readonly area: number;
  /**
   * The texts of the sheet on the room, from the top to the bottom and from the left to the right. A room with no text has no value.
   * A text is on the room when most of its line is on the cells of the room.
   */
  readonly labels?: readonly string[] | undefined;
  /** The mean point of the cells of the room, in the plan. */
  readonly center: PlanPoint;
}

/** One opening of a plan import: a bridge across a gap in a wall. */
export interface ImportedOpening {
  /** The `id` of the opening in the room record. */
  readonly id: string;
  /** The `id` of the wall of the opening in the room record. */
  readonly wall: string;
  readonly kind: OpeningKind;
  readonly source: Bridge["source"];
  /** The room on each side of the opening, or `OUTSIDE`. An opening with no room or a room on the two sides has no sides. */
  readonly sides?: readonly [string, string] | undefined;
}

/** The kinds of the free regions of the grid. */
export const REGION_KINDS: readonly ["outside", "speck", "core", "room"] = ["outside", "speck", "core", "room"];

/** A kind of a free region of the grid. */
export type RegionKind = (typeof REGION_KINDS)[number];

/** One fill ring of the area gate, and the rooms that it holds. */
export interface RingFit {
  /** The position of the fill in the fills of the sheet. */
  readonly fill: number;
  /** The position of the ring in the rings of the fill. */
  readonly ring: number;
  readonly use: string;
  /** The area of the ring, without its holes with walls on their edges. */
  readonly area: number;
  /** The rooms that have most of their cells in the ring, and half of their cells or more. */
  readonly rooms: readonly string[];
  /** The sum of the areas of the rooms over the area of the ring, minus 1. A ring with no room has no error. */
  readonly error?: number | undefined;
}

/** The area gate: each fill ring of a use of the legend against the rooms that it holds. */
export interface AreaGate {
  readonly rings: readonly RingFit[];
  /** The number of rings with an error of each limit or less, in the sequence of the limits. */
  readonly within: readonly { readonly limit: number; readonly rings: number }[];
  /** The median of the errors. A gate with no error has no median. */
  readonly median?: number | undefined;
}

/** The result of a plan import. */
export interface PlanImport {
  /**
   * The room record of the level: the walls, one opening for each bridge, and one floor for each room.
   * A wall from two faces has the `id` `wall-` and a number. The wall of a bridge has the `id` `bridge-` and the number of its opening.
   */
  readonly room: Room;
  readonly rooms: readonly ImportedRoom[];
  readonly openings: readonly ImportedOpening[];
  /** The number of free regions of each kind. */
  readonly regions: Readonly<Record<RegionKind, number>>;
  readonly pens: readonly PenRead[];
  readonly wallPens: readonly string[];
  readonly doorPens: readonly string[];
  /** The grid of the rooms. Its cell is in the `unit` of the sheet. */
  readonly grid: Grid;
  readonly gate: AreaGate;
  /** The wall lines, the glazing lines and the faces of each pen, from `readWallLines`. */
  readonly lineRead: WallLineRead;
}

/** The fill colors of a grid: a color number for each cell, or `NO_COLOR`. */
const NO_COLOR = 0xffff;

/**
 * This function turns the vector paths of a floor plan into a room record with rooms, walls and openings.
 *
 * 1. A wall pen has long lines with a parallel partner at the distance of a wall thickness. Two such lines give a wall.
 *    `readWallLines` also takes the wall faces and the glazing of the other pens. `snapEnds` closes the small gaps at the open wall ends.
 * 2. A bridge closes each gap between two wall ends. The bridge is an opening of the room record.
 * 3. The walls, the door pens and the bridges go on a grid. Each free region of the grid that does not touch the border is a room, a speck or the space in a wall.
 * 4. A room gets the fill color under most of its cells, and its use from the legend.
 * 5. The area gate compares each fill ring of the legend with the rooms that have most of their cells in it.
 *
 * The coordinates of the sheet have the y axis down. The plan of the result has the y axis up, with the bottom left corner of the sheet at the origin.
 */
export function importPlan(sheet: Sheet, options: ImportOptions = {}): PlanImport {
  const scale = sheet.scale;
  const feet = unitsPer("ft", sheet.unit);
  // A length in the unit of the sheet, from the option or from its default in feet, in the units of the sheet.
  const sheetLength = (value: number | undefined, defaultFeet: number): number => (value ?? defaultFeet * feet) * scale;
  const areaUnit = (cells: number, cell: number): number => (cells * cell * cell) / (scale * scale);
  const toPlan = (point: PlanPoint): PlanPoint => [tidy(point[0] / scale), tidy((sheet.height - point[1]) / scale)];
  const planRing = (ring: Ring): Ring => ring.map((point) => toPlan(point));

  const wallOptions = options.walls ?? {};
  // Two wall ends touch at this distance or less.
  const touch = sheetLength(undefined, 0.225);
  const wallLimits: WallLimits = {
    thinnest: sheetLength(wallOptions.thinnest, 0.25),
    thickest: sheetLength(wallOptions.thickest, 1.5),
    longLine: sheetLength(wallOptions.longLine, 1.5),
    fewestLines: wallOptions.fewestLines ?? 8,
    leastLength: sheetLength(wallOptions.leastLength, 40),
    shortestWall: sheetLength(wallOptions.shortestWall, 1),
    read: wallOptions.read ?? "lines",
    patternSide: wallOptions.patternSide ?? 0.4,
    crossPens: wallOptions.crossPens ?? true,
    glazing: wallOptions.glazing ?? true,
    touch,
  };
  const bridgeOptions = options.bridges ?? {};
  const bridgeLimits: BridgeLimits = {
    narrowest: sheetLength(bridgeOptions.narrowest, 1.5),
    widest: sheetLength(bridgeOptions.widest, 4.5),
    widestGuided: sheetLength(bridgeOptions.widestGuided ?? bridgeOptions.widest, 4.5),
    shortestEnd: sheetLength(bridgeOptions.shortestEnd, 0.2),
    longestEnd: sheetLength(bridgeOptions.longestEnd, 1.6),
    touch: sheetLength(bridgeOptions.touch, 0.225),
    angle: bridgeOptions.angle ?? 25,
  };

  // 1. The pens and the walls.
  const pens = readPens(sheet.lines, wallLimits, scale);
  const wallPens = options.wallPens ?? pens.filter((read) => read.wall).map((read) => read.pen);
  const curves = new Map<string, number>();
  for (const line of sheet.lines) if (line.curve === true) curves.set(penOf(line), (curves.get(penOf(line)) ?? 0) + 1);
  const swing = [...curves].sort((a, b) => b[1] - a[1])[0];
  const doorPens = options.doorPens ?? (swing === undefined ? [] : [swing[0]]);
  const doorSet = new Set(doorPens);
  const lineRead = readWallLines(sheet.lines, pens, wallLimits, wallPens);
  const wallLines = lineRead.walls;
  const straight = wallLines.filter((line) => line.curve !== true);
  const longestLeaf = sheetLength(options.longestLeaf, 4.5);
  const doorLines = sheet.lines.filter(
    (line) => doorSet.has(penOf(line)) && (line.curve === true || Math.hypot(line.to[0] - line.from[0], line.to[1] - line.from[1]) <= longestLeaf),
  );
  const pairs = wallPairs(straight, wallLimits);
  const snaps = snapEnds(straight, sheetLength(wallOptions.snap, 1), touch);

  // 2. The bridges. The edges of the fill rings of the uses guide the bridges of the wide gaps.
  const legendSamples = new Set(options.legend?.samples ?? []);
  const guides: BridgeGuide[] = (sheet.fills ?? []).flatMap((fill, index) =>
    options.legend?.names[fill.color] === undefined || legendSamples.has(index)
      ? []
      : fill.rings.flatMap((ring) => ring.map((from, at) => ({ from, to: ring[(at + 1) % ring.length]! }))),
  );
  const bridges = findBridges(straight, bridgeLimits, guides);

  // 3. The grid and its regions.
  let cell = sheetLength(options.cell, 0.1);
  const largest = options.largestGrid ?? 40_000_000;
  const cellsOf = (side: number): number => Math.ceil(sheet.width / side) * Math.ceil(sheet.height / side);
  if (cellsOf(cell) > largest) cell *= Math.sqrt(cellsOf(cell) / largest) * 1.001;
  const grid = gridOf(sheet.width, sheet.height, cell);
  let barrier: Uint8Array | undefined = new Uint8Array(grid.columns * grid.rows);
  stampLines(grid, barrier, wallLines);
  stampLines(grid, barrier, doorLines);
  stampLines(grid, barrier, lineRead.glazing);
  stampLines(grid, barrier, snaps);
  for (const bridge of bridges) stampLines(grid, barrier, bridge.lines);
  const { labels, regions } = labelRegions(grid, barrier);
  barrier = undefined;

  // 4. The fill color of each region.
  const fills = sheet.fills ?? [];
  const samples = new Set(options.legend?.samples ?? []);
  const names = options.legend?.names ?? {};
  const colors = [...new Set(fills.map((fill) => fill.color))];
  const colorIndex = new Map(colors.map((color, index) => [color, index]));
  const paint = new Uint16Array(grid.columns * grid.rows).fill(NO_COLOR);
  fills.forEach((fill, index) => {
    if (samples.has(index)) return;
    const value = colorIndex.get(fill.color)!;
    scanRings(grid, fill.rings, (row, first, last) => paint.fill(value, row * grid.columns + first, row * grid.columns + last + 1));
  });
  const counts = new Map<number, number>();
  for (let index = 0; index < labels.length; index++) {
    const label = labels[index]!;
    const color = paint[index]!;
    if (label === 0 || color === NO_COLOR) continue;
    const key = label * colors.length + color;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const smallest = options.smallestRoom ?? 12 * feet * feet;
  const thinnest = options.thinnestRoom ?? 1.6 * feet;
  const kindOf = (region: GridRegion): RegionKind => {
    if (region.border) return "outside";
    const area = areaUnit(region.cells, cell);
    if (area < smallest) return "speck";
    const width = (2 * area) / ((region.perimeter * cell) / scale);
    return width < thinnest ? "core" : "room";
  };
  const kinds = regions.map((region) => kindOf(region));
  const tally: Record<RegionKind, number> = { outside: 0, speck: 0, core: 0, room: 0 };
  for (const kind of kinds) tally[kind]++;
  const idOf = new Map<number, string>();
  const rooms: ImportedRoom[] = [];
  const floors: Floor[] = [];
  regions.forEach((region, index) => {
    if (kinds[index] !== "room") return;
    const id = `room-${rooms.length + 1}`;
    idOf.set(region.label, id);
    let best = -1;
    let most = 0;
    for (let color = 0; color < colors.length; color++) {
      const count = counts.get(region.label * colors.length + color) ?? 0;
      if (count > most) {
        most = count;
        best = color;
      }
    }
    const color = best < 0 ? undefined : colors[best];
    const use = color === undefined ? undefined : names[color];
    const center = toPlan([(region.center[0] + 0.5) * cell, (region.center[1] + 0.5) * cell]);
    rooms.push({ id, ...(use === undefined ? {} : { use }), ...(color === undefined ? {} : { color }), area: tidy(areaUnit(region.cells, cell)), center });
    floors.push({ id, ...(use === undefined ? {} : { name: use }), ring: planRing(regionOutline(grid, labels, region)) });
  });

  // The texts on each room. The line of a text goes from its start along its base line, about 0.6 of its height for each character, and up by half its height.
  const textsOf = new Map<string, string[]>();
  const texts = [...(sheet.texts ?? [])].sort((a, b) => a.at[1] - b.at[1] || a.at[0] - b.at[0]);
  for (const text of texts) {
    const words = text.text.trim();
    if (words === "") continue;
    const length = 0.6 * text.height * words.length;
    const count = Math.max(1, Math.ceil(length / Math.max(text.height, cell)));
    const votes = new Map<string, number>();
    for (let k = 0; k < count; k++) {
      const column = Math.floor((text.at[0] + (length * (k + 0.5)) / count) / cell);
      const row = Math.floor((text.at[1] - text.height / 2) / cell);
      if (column < 0 || row < 0 || column >= grid.columns || row >= grid.rows) continue;
      const id = idOf.get(labels[row * grid.columns + column]!);
      if (id !== undefined) votes.set(id, (votes.get(id) ?? 0) + 1);
    }
    const best = [...votes].sort((a, b) => b[1] - a[1])[0];
    if (best !== undefined && 2 * best[1] > count) textsOf.set(best[0], [...(textsOf.get(best[0]) ?? []), words]);
  }
  rooms.forEach((room, index) => {
    const found = textsOf.get(room.id);
    if (found !== undefined) rooms[index] = { ...room, labels: found };
  });

  // The walls, and the openings of the bridges with the rooms on their two sides.
  const walls: Wall[] = pairs.map((pair, index) => ({ id: `wall-${index + 1}`, from: toPlan(pair.from), to: toPlan(pair.to), thickness: tidy(pair.thickness / scale) }));
  const wallThickness = walls.length === 0 ? 0.5 * feet : tidy(median(walls.map((wall) => wall.thickness!)));
  const height = options.height ?? 8 * feet;
  const openingHeight = options.openingHeight ?? (80 / 12) * feet;
  const swings = doorLines.filter((line) => line.curve === true).map((line): PlanPoint => [(line.from[0] + line.to[0]) / 2, (line.from[1] + line.to[1]) / 2]);
  const sideOf = (label: number): string | undefined => {
    if (label === 0) return undefined;
    const kind = kinds[label - 1];
    return kind === "outside" ? OUTSIDE : kind === "room" ? idOf.get(label) : undefined;
  };
  const openings: Opening[] = [];
  const imported: ImportedOpening[] = [];
  bridges.forEach((bridge, index) => {
    const width = lineLength(bridge);
    if (!(width > 0)) return;
    const id = `opening-${index + 1}`;
    const wall = `bridge-${index + 1}`;
    const center: PlanPoint = [(bridge.from[0] + bridge.to[0]) / 2, (bridge.from[1] + bridge.to[1]) / 2];
    const along: PlanPoint = [(bridge.to[0] - bridge.from[0]) / width, (bridge.to[1] - bridge.from[1]) / width];
    const half = (bridge.thickness ?? 0) / 2;
    const reach = width * 1.2 + half;
    const kind: OpeningKind = swings.some((point) => Math.hypot(point[0] - center[0], point[1] - center[1]) <= reach) ? "door" : "gap";
    const sides = openingSides(grid, labels, center, along, width, half + 8 * feet * scale, sideOf);
    walls.push({ id: wall, from: toPlan(bridge.from), to: toPlan(bridge.to), ...(bridge.thickness === undefined ? {} : { thickness: tidy(bridge.thickness / scale) }) });
    openings.push({ id, wall, kind, offset: 0, width: tidy(width / scale), height: openingHeight });
    imported.push({ id, wall, kind, source: bridge.source, ...(sides === undefined ? {} : { sides }) });
  });

  // 5. The area gate.
  const fits: RingFit[] = [];
  const ringArea = options.smallestRing ?? 15 * feet * feet;
  const gateRings: { fill: number; ring: number; use: string; area: number; points: Ring; holes: readonly Ring[] }[] = [];
  const edgeShare = options.gateEdge ?? 0.25;
  // A point of the edge of a ring is near a line at 0.4 ft or less. The points of the edge are 0.5 ft apart.
  const edgeOf = edgeShare > 0 ? lineEdge(sheet.lines, sheetLength(undefined, 0.4)) : undefined;
  const holeShare = options.gateHoles ?? 0.5;
  const wallSet = new Set(wallPens);
  const wallEdgeOf = holeShare > 0 ? lineEdge(sheet.lines.filter((line) => wallSet.has(penOf(line))), sheetLength(undefined, 0.4)) : undefined;
  fills.forEach((fill, index) => {
    const use = names[fill.color];
    if (use === undefined || samples.has(index)) return;
    const areas = fill.rings.map((points) => regionArea({ kind: "polygon", points }));
    // The rings of the fill around each ring: the larger rings that hold most of its points.
    const around = fill.rings.map((points, ring) => fill.rings.flatMap((other, at) => (at !== ring && areas[at]! > areas[ring]! && mostInside(points, other) ? [at] : [])));
    fill.rings.forEach((points, ring) => {
      const depth = around[ring]!.length;
      // The paint is even-odd, so a ring inside an odd number of rings is a hole, not a room.
      if (wallEdgeOf !== undefined && depth % 2 === 1) return;
      const holes = wallEdgeOf === undefined ? [] : fill.rings.filter((hole, at) => around[at]!.length === depth + 1 && around[at]!.includes(ring) && wallEdgeOf(hole, sheetLength(undefined, 0.5)) >= holeShare);
      const area = (areas[ring]! - holes.reduce((total, hole) => total + regionArea({ kind: "polygon", points: hole }), 0)) / (scale * scale);
      if (area < ringArea) return;
      if (edgeOf !== undefined && edgeOf(points, sheetLength(undefined, 0.5)) < edgeShare) return;
      gateRings.push({ fill: index, ring, use, area, points, holes });
    });
  });
  const overlaps = gateRings.map((ring) => ringCells(grid, labels, ring.points, ring.holes));
  const owners = new Map<number, string[]>();
  regions.forEach((region, index) => {
    if (kinds[index] !== "room") return;
    let best = -1;
    let most = 0;
    overlaps.forEach((overlap, ring) => {
      const count = overlap.get(region.label) ?? 0;
      if (count > most) {
        most = count;
        best = ring;
      }
    });
    if (best < 0 || most < 0.5 * region.cells) return;
    const list = owners.get(best) ?? [];
    list.push(idOf.get(region.label)!);
    owners.set(best, list);
  });
  const areaOf = new Map(rooms.map((room) => [room.id, room.area]));
  gateRings.forEach((ring, index) => {
    const held = owners.get(index) ?? [];
    const sum = held.reduce((total, id) => total + areaOf.get(id)!, 0);
    fits.push({ fill: ring.fill, ring: ring.ring, use: ring.use, area: tidy(ring.area), rooms: held, ...(held.length === 0 ? {} : { error: sum / ring.area - 1 }) });
  });
  const errors = fits.flatMap((fit) => (fit.error === undefined ? [] : [fit.error]));
  const limits = options.gateLimits ?? [0.05, 0.1];
  const gate: AreaGate = {
    rings: fits,
    within: limits.map((limit) => ({ limit, rings: errors.filter((error) => Math.abs(error) <= limit).length })),
    ...(errors.length === 0 ? {} : { median: median(errors) }),
  };

  const room: Room = {
    schema: ROOM_SCHEMA,
    unit: sheet.unit,
    height,
    wallThickness,
    walls,
    ...(openings.length === 0 ? {} : { openings }),
    ...(floors.length === 0 ? {} : { floors }),
  };
  return { room, rooms, openings: imported, regions: tally, pens, wallPens, doorPens, grid: { ...grid, cell: cell / scale }, gate, lineRead };
}

/**
 * This function finds the rooms on the two sides of an opening. It goes from the center across the wall in the two directions.
 * It goes past the cells of a speck or of the space in a wall, to the first room or the outside.
 * It tries the center, then two points along the opening.
 */
function openingSides(
  grid: Grid,
  labels: Int32Array,
  center: PlanPoint,
  along: PlanPoint,
  width: number,
  reach: number,
  sideOf: (label: number) => string | undefined,
): readonly [string, string] | undefined {
  const { columns, rows, cell } = grid;
  const across: PlanPoint = [-along[1], along[0]];
  const side = (sign: number, shift: number): string | undefined => {
    const ox = center[0] + along[0] * shift;
    const oy = center[1] + along[1] * shift;
    for (let t = 0; t <= reach; t += cell / 2) {
      const x = Math.floor((ox + sign * across[0] * t) / cell);
      const y = Math.floor((oy + sign * across[1] * t) / cell);
      if (x < 0 || y < 0 || x >= columns || y >= rows) return undefined;
      const found = sideOf(labels[y * columns + x]!);
      if (found !== undefined) return found;
    }
    return undefined;
  };
  for (const shift of [0, -0.25, 0.25]) {
    const a = side(-1, shift * width);
    const b = side(1, shift * width);
    if (a !== undefined && b !== undefined) return a === b ? undefined : [a, b];
  }
  return undefined;
}

/** This function tells if most points of `inner` are inside `outer`. */
function mostInside(inner: Ring, outer: Ring): boolean {
  return inner.filter(([x, y]) => pointInRing(x, y, outer)).length > inner.length / 2;
}

/**
 * This function measures the edge of a ring. The measure is the part of its points with a line of the sheet at `reach` or less.
 * The points are at the distance `step` or less along the edge. A hash of cells finds the lines near each point.
 */
function lineEdge(lines: readonly SheetLine[], reach: number): (ring: Ring, step: number) => number {
  const cell = Math.max(reach * 4, 1e-9);
  const keyOf = (x: number, y: number): string => `${Math.floor(x / cell)},${Math.floor(y / cell)}`;
  const hash = new Map<string, number[]>();
  lines.forEach((line, index) => {
    // The points of the line are one cell or less apart, so each cell that the line crosses gets the line.
    const steps = Math.max(1, Math.ceil(lineLength(line) / cell));
    const keys = new Set<string>();
    for (let k = 0; k <= steps; k++) keys.add(keyOf(line.from[0] + ((line.to[0] - line.from[0]) * k) / steps, line.from[1] + ((line.to[1] - line.from[1]) * k) / steps));
    for (const key of keys) hash.set(key, [...(hash.get(key) ?? []), index]);
  });
  const near = (x: number, y: number): boolean => {
    const cx = Math.floor(x / cell);
    const cy = Math.floor(y / cell);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const index of hash.get(`${cx + dx},${cy + dy}`) ?? []) {
          const line = lines[index]!;
          if (pointSegmentDistance({ x, y }, { x: line.from[0], y: line.from[1] }, { x: line.to[0], y: line.to[1] }) <= reach) return true;
        }
      }
    }
    return false;
  };
  return (ring, step) => {
    let points = 0;
    let lined = 0;
    ring.forEach(([x0, y0], index) => {
      const [x1, y1] = ring[(index + 1) % ring.length]!;
      const count = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / step));
      for (let k = 0; k < count; k++) {
        points++;
        if (near(x0 + ((x1 - x0) * (k + 0.5)) / count, y0 + ((y1 - y0) * (k + 0.5)) / count)) lined++;
      }
    });
    return points === 0 ? 0 : lined / points;
  };
}

/** This function puts a calculated length on a grid of 1e-9, so the noise of float arithmetic does not go to a file. */
function tidy(value: number): number {
  return Math.round(value * 1e9) / 1e9 + 0;
}
