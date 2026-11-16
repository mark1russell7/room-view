import { circuitStates, outletLevels, type ElectricalLayer, type LoadLevel } from "@mark1russell7/electrical";
import { regionArea } from "@mark1russell7/layout-contract";
import { levelShape, type LengthUnit, type LevelShape, type OpeningKind, type Scene, type SolidKind } from "@mark1russell7/room-view";

/** A record of a scene that the page shows: the kind of its solids, and its `id` in the scene. */
export interface PartRecord {
  readonly kind: SolidKind;
  readonly source: string;
}

/** One line of the details of a record: a measurement or a relation. */
export interface DetailRow {
  readonly label: string;
  readonly value: string;
}

/** The details of one record, or of the room, as text for the page. */
export interface Details {
  /** The name of the record, or its `id` for a record with no name. */
  readonly title: string;
  /** The kind of the record in plain words, for example `Wall`. */
  readonly kind: string;
  readonly rows: readonly DetailRow[];
  /** The record as text in the JSON format. The room has no such text. */
  readonly record?: string | undefined;
}

/** One circuit of a scene, as text and numbers for a meter. */
export interface CircuitRow {
  readonly id: string;
  readonly name: string;
  readonly level: LoadLevel;
  /** The part of the meter that the load fills, from 0 to 1. */
  readonly fill: number;
  /** The load and the limit, for example `1260 of 1440 W`. */
  readonly figure: string;
  /** The level in plain words. */
  readonly status: string;
  /** The outlets of the circuit, and the objects that take power from them. */
  readonly records: readonly PartRecord[];
}

/** One line of the legend of the outlets: a level, its sign and the number of the outlets with the level. */
export interface LegendRow {
  readonly level: LoadLevel;
  /** The shape of the sign of the level. */
  readonly shape: LevelShape;
  /** The level in plain words. */
  readonly label: string;
  /** The number of the outlets of the scene with the level. An outlet with no circuit has the level `unknown`. */
  readonly count: number;
}

/** A part of the room in a list. */
export interface PartEntry {
  readonly record: PartRecord;
  readonly name: string;
}

/** The parts of one kind. */
export interface PartGroup {
  readonly title: string;
  readonly parts: readonly PartEntry[];
}

const KIND_NAMES: Readonly<Record<SolidKind, string>> = { floor: "Floor", wall: "Wall", glass: "Window", outlet: "Outlet", object: "Object" };

const OPENING_NAMES: Readonly<Record<OpeningKind, string>> = { door: "Door", window: "Window", gap: "Gap" };

const STATUS: Readonly<Record<LoadLevel, string>> = { unknown: "No load value", ok: "Within its limit", near: "Near its limit", over: "Over its limit" };

const words = new Intl.ListFormat("en", { style: "long", type: "conjunction" });

/** This function gives the key of a record. Two records have the same key only if they are the same record. */
export function partKey(record: PartRecord): string {
  return `${record.kind}:${record.source}`;
}

/** This function gives a number as text with 2 decimals at most, and with no zeros at the end. */
export function formatNumber(value: number): string {
  return String(Number(value.toFixed(2)) + 0);
}

/** This function gives a length as text in the unit of the room, for example `2.05 m`. */
export function formatLength(value: number, unit: LengthUnit): string {
  return `${formatNumber(value)} ${unit}`;
}

/** This function gives an area as text in the unit of the room, for example `25.86 m²`. */
export function formatArea(value: number, unit: LengthUnit): string {
  return `${formatNumber(value)} ${unit}²`;
}

/** This function gives a list of names in a sentence, or `None` for an empty list. */
function listOf(names: readonly string[]): string {
  return names.length === 0 ? "None" : words.format(names);
}

/** This function gives a value on one line in the JSON format, with a space after each comma of a list. */
function inline(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(inline).join(", ")}]`;
  return JSON.stringify(value) ?? "null";
}

/** This function gives a record as text in the JSON format, with one field on each line. */
export function recordText(record: object): string {
  const lines = Object.entries(record)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `  ${JSON.stringify(key)}: ${inline(value)}`);
  return `{\n${lines.join(",\n")}\n}`;
}

/** This function gives the name of a circuit of the scene, or the `id` for a circuit with no name. */
function circuitName(scene: Scene, id: string): string {
  return scene.room.circuits?.find((circuit) => circuit.id === id)?.name ?? id;
}

/** This function gives the name of a placed object of the scene, or the `id` for an object with no name. */
function objectName(scene: Scene, id: string): string {
  return scene.objects?.find((object) => object.id === id)?.name ?? id;
}

function wallDetails(scene: Scene, id: string): Details | undefined {
  const { room } = scene;
  const wall = room.walls.find((item) => item.id === id);
  if (wall === undefined) return undefined;
  const openings = (room.openings ?? []).filter((opening) => opening.wall === id);
  const outlets = (room.outlets ?? []).filter((outlet) => outlet.wall === id);
  return {
    title: wall.id,
    kind: KIND_NAMES.wall,
    rows: [
      { label: "Length", value: formatLength(Math.hypot(wall.to[0] - wall.from[0], wall.to[1] - wall.from[1]), room.unit) },
      { label: "Height", value: formatLength(wall.height ?? room.height, room.unit) },
      { label: "Thickness", value: formatLength(wall.thickness ?? room.wallThickness, room.unit) },
      ...openings.map((opening) => ({
        label: OPENING_NAMES[opening.kind],
        value: `${formatLength(opening.width, room.unit)} wide, ${formatLength(opening.height, room.unit)} high`,
      })),
      { label: "Outlets", value: listOf(outlets.map((outlet) => outlet.id)) },
    ],
    record: recordText(wall),
  };
}

function floorDetails(scene: Scene, id: string): Details | undefined {
  const { room } = scene;
  const floor = room.floors?.find((item) => item.id === id);
  if (floor === undefined) return undefined;
  return {
    title: floor.name ?? floor.id,
    kind: KIND_NAMES.floor,
    rows: [
      { label: "Area", value: formatArea(regionArea({ kind: "polygon", points: floor.ring }), room.unit) },
      { label: "Corners", value: String(floor.ring.length) },
    ],
    record: recordText(floor),
  };
}

function windowDetails(scene: Scene, id: string): Details | undefined {
  const { room } = scene;
  const opening = room.openings?.find((item) => item.id === id);
  if (opening === undefined) return undefined;
  return {
    title: opening.id,
    kind: OPENING_NAMES[opening.kind],
    rows: [
      { label: "Wall", value: opening.wall },
      { label: "Width", value: formatLength(opening.width, room.unit) },
      { label: "Height", value: formatLength(opening.height, room.unit) },
      { label: "Bottom above the floor", value: formatLength(opening.sill ?? 0, room.unit) },
    ],
    record: recordText(opening),
  };
}

function outletDetails(scene: Scene, id: string): Details | undefined {
  const { room } = scene;
  const outlet = room.outlets?.find((item) => item.id === id);
  if (outlet === undefined) return undefined;
  const users = (scene.objects ?? []).filter((object) => object.outlet === id);
  return {
    title: outlet.id,
    kind: KIND_NAMES.outlet,
    rows: [
      { label: "Wall", value: outlet.wall },
      { label: "Height above the floor", value: formatLength(outlet.height, room.unit) },
      { label: "Circuit", value: outlet.circuit === undefined ? "None" : circuitName(scene, outlet.circuit) },
      { label: "Gives power to", value: listOf(users.map((object) => object.name ?? object.id)) },
    ],
    record: recordText(outlet),
  };
}

function objectDetails(scene: Scene, id: string): Details | undefined {
  const { room } = scene;
  const object = scene.objects?.find((item) => item.id === id);
  if (object === undefined) return undefined;
  const outlet = room.outlets?.find((item) => item.id === object.outlet);
  const holds = (scene.objects ?? []).filter((item) => item.parent === id);
  return {
    title: object.name ?? object.id,
    kind: KIND_NAMES.object,
    rows: [
      { label: "Kind", value: object.kind },
      { label: "Width", value: formatLength(object.size[0], room.unit) },
      { label: "Depth", value: formatLength(object.size[1], room.unit) },
      { label: "Height", value: formatLength(object.size[2], room.unit) },
      ...(object.parent === undefined ? [] : [{ label: "Held by", value: objectName(scene, object.parent) }]),
      ...(holds.length === 0 ? [] : [{ label: "Holds", value: listOf(holds.map((item) => item.name ?? item.id)) }]),
      ...(object.outlet === undefined ? [] : [{ label: "Outlet", value: object.outlet }]),
      ...(outlet?.circuit === undefined ? [] : [{ label: "Circuit", value: circuitName(scene, outlet.circuit) }]),
    ],
    record: recordText(object),
  };
}

/** This function gives the details of a record of the scene, or `undefined` for a record that the scene does not have. */
export function detailsOf(scene: Scene, record: PartRecord): Details | undefined {
  if (record.kind === "wall") return wallDetails(scene, record.source);
  if (record.kind === "floor") return floorDetails(scene, record.source);
  if (record.kind === "glass") return windowDetails(scene, record.source);
  if (record.kind === "outlet") return outletDetails(scene, record.source);
  return objectDetails(scene, record.source);
}

/** This function gives the name of a record with its kind, for example `Wall south`. */
export function partName(scene: Scene, record: PartRecord): string {
  const details = detailsOf(scene, record);
  if (details === undefined) return record.source;
  return record.kind === "object" || record.kind === "floor" ? details.title : `${details.kind} ${details.title}`;
}

/** This function gives the details of the room of a scene. */
export function roomDetails(scene: Scene): Details {
  const { room } = scene;
  const area = (room.floors ?? []).reduce((sum, floor) => sum + regionArea({ kind: "polygon", points: floor.ring }), 0);
  const openings = room.openings ?? [];
  return {
    title: room.name ?? scene.name ?? "Room",
    kind: "Room",
    rows: [
      { label: "Floor area", value: formatArea(area, room.unit) },
      { label: "Height", value: formatLength(room.height, room.unit) },
      { label: "Walls", value: String(room.walls.length) },
      { label: "Doors", value: String(openings.filter((opening) => opening.kind === "door").length) },
      { label: "Windows", value: String(openings.filter((opening) => opening.kind === "window").length) },
      { label: "Outlets", value: String(room.outlets?.length ?? 0) },
      { label: "Objects", value: String(scene.objects?.length ?? 0) },
    ],
  };
}

/**
 * This function gives each circuit of an electrical layer as text and numbers for a meter. The load is the known load of the circuit.
 * A row does not name the feeds with no watts. The layer of a `scene/1` has the total load of each circuit, and no watts of a feed.
 * A circuit with no limit has only its load, and the status tells that it has no limit.
 */
export function circuitRows(layer: ElectricalLayer): readonly CircuitRow[] {
  return circuitStates(layer).map((state): CircuitRow => {
    const ratio = state.ratio ?? 0;
    const limit = state.limit === undefined ? undefined : `${formatNumber(state.limit)} W`;
    const load = `${formatNumber(state.watts)} W`;
    return {
      id: state.circuit,
      name: layer.circuits?.find((circuit) => circuit.id === state.circuit)?.name ?? state.circuit,
      level: state.level,
      fill: Math.min(1, Math.max(0, ratio)),
      figure: limit === undefined ? load : state.level === "unknown" ? `The limit is ${limit}` : `${formatNumber(state.watts)} of ${limit}, ${formatNumber(ratio * 100)}% of the limit`,
      status: limit === undefined ? "No limit" : STATUS[state.level],
      records: [
        ...state.outlets.map((source): PartRecord => ({ kind: "outlet", source })),
        ...state.objects.map((source): PartRecord => ({ kind: "object", source })),
      ],
    };
  });
}

/** The levels in the sequence of a legend: the levels with a load first, then the level with no load value. */
const LEGEND_LEVELS: readonly LoadLevel[] = ["ok", "near", "over", "unknown"];

/** This function gives the legend of the outlets of an electrical layer: one line for each level, with the sign that the viewer shows. */
export function legendRows(layer: ElectricalLayer): readonly LegendRow[] {
  const levels = outletLevels(layer);
  const outlets = layer.outlets ?? [];
  return LEGEND_LEVELS.map((level): LegendRow => {
    const count = outlets.filter((outlet) => (levels.get(outlet.id) ?? "unknown") === level).length;
    return { level, shape: levelShape(level), label: STATUS[level], count };
  });
}

/** This function gives the parts of a scene in groups, one for each kind. A kind with no part has no group. */
export function partGroups(scene: Scene): readonly PartGroup[] {
  const { room } = scene;
  const entries = (kind: SolidKind, items: readonly { readonly id: string; readonly name?: string | undefined }[]): readonly PartEntry[] =>
    items.map((item) => ({ record: { kind, source: item.id }, name: item.name ?? item.id }));
  const groups: readonly PartGroup[] = [
    { title: "Objects", parts: entries("object", scene.objects ?? []) },
    { title: "Outlets", parts: entries("outlet", room.outlets ?? []) },
    { title: "Windows", parts: entries("glass", (room.openings ?? []).filter((opening) => opening.kind === "window")) },
    { title: "Walls", parts: entries("wall", room.walls) },
    { title: "Floors", parts: entries("floor", room.floors ?? []) },
  ];
  return groups.filter((group) => group.parts.length > 0);
}
