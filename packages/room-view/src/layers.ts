import { sceneSpace, type Anchor, type SceneSpace } from "./anchors.ts";
import { checkAnchor, type FindingLevel } from "./check.ts";
import { compareText } from "./order.ts";
import { isLayerName, type Scene } from "./room.ts";

// The layers of a scene: the records of the add-ons. The core keeps each layer, and it does not read one.
// An add-on reads its layer, gives the anchors of its records, and examines the meaning of its records.
// The core examines the anchors. Thus each add-on composes on the core, and the add-ons do not know each other.

/** The result of the read of a layer: the layer, or the faults of its form. */
export type LayerParse<Layer> = { readonly ok: true; readonly layer: Layer } | { readonly ok: false; readonly errors: readonly string[] };

/** A fault that an add-on finds in its layer. */
export interface AddOnFault {
  readonly level: FindingLevel;
  /** The code of the fault. The add-on gives its own codes. */
  readonly code: string;
  /** The `id` of the record with the fault. For the layer, it is empty. */
  readonly at: string;
  /** The fault in plain words, with the values. */
  readonly message: string;
  /** The `id` of the second record of the fault. A fault of one record has none. */
  readonly other?: string | undefined;
}

/**
 * An add-on: one topic on the core, for example electrical, plumbing or light.
 * A host gives a list of add-ons to `checkLayers`. The core knows only this type.
 */
export interface AddOn<Layer> {
  /** The name of the format of the layer, for example `electrical/1`. It is the key of the layer in `Scene.layers`. */
  readonly schema: string;
  /** This function reads the JSON of a layer. */
  parse(value: unknown): LayerParse<Layer>;
  /**
   * This function gives the anchors of the records of a layer, by a key.
   * The key is the `id` of a record, or the `id` and a position for a record with many anchors.
   */
  anchors(layer: Layer): ReadonlyMap<string, Anchor>;
  /** This function gives the layer with new anchors, by the keys of `anchors`. The core uses it when it moves the records of a room. */
  withAnchors(layer: Layer, anchors: ReadonlyMap<string, Anchor>): Layer;
  /** This function gives the faults of the meaning of a layer. The core examines the anchors, so this function does not. */
  check(layer: Layer, space: SceneSpace): readonly AddOnFault[];
  /**
   * This function gives one layer from the parts of a level: the layer of the level record, then the layer of each room.
   *
   * - A record of a part gets the name `part.name(id)`. Each `id` of the layer that names such a record or a placed object gets it too.
   * - A record that all the rooms share keeps its `id`, for example a circuit of an apartment. The first record of an `id` stays.
   * - The core changes the anchors before this function, so the function does not change an anchor.
   *
   * `expandLevel` does not carry the layer of a room when its add-on has no such function.
   */
  join?(parts: readonly LayerPart<Layer>[]): Layer;
  /**
   * The read of the old records of the topic. A record of version 1 of the core kept some of them in fields of its own.
   * `readRecord` of the entry `/schema` uses it. An add-on with no such records has none.
   */
  readonly v1?: AddOnV1<Layer> | undefined;
}

/** These are the kinds of the files of the core: `room`, `scene`, `survey` and `level`. */
export const FILE_KINDS: readonly ["room", "scene", "survey", "level"] = ["room", "scene", "survey", "level"];

/** A kind of a file of the core. */
export type FileKind = (typeof FILE_KINDS)[number];

/** The old records of an add-on in the records of version 1 of the core: their fields, and the read of their layer. */
export interface AddOnV1<Layer> {
  /**
   * The names of the fields of each kind of record that keep the old records. Version 2 of the core does not have these fields.
   * The names of `object` are the fields of each placed object of a scene and of each object of a survey.
   */
  readonly fields: { readonly [Kind in FileKind | "object"]?: readonly string[] | undefined };
  /**
   * This function gives the layer of the old records of a record of version 1, or `undefined` for a record with none of them.
   * The record is the JSON of the file, or the JSON of the survey of a room of a level. The function examines the form of its own fields.
   * The schema of version 2 examines the other fields after the read. A layer of a survey has the anchors of a survey, as `Survey.layers` tells.
   * A room record has no layers, so the layer of a `room` is the layer of a scene of that room.
   */
  read(record: unknown, kind: FileKind): LayerParse<Layer> | undefined;
}

/** One part of the layers of a level, for the function `join` of an add-on. `layerPart` makes it. */
export interface LayerPart<Layer> {
  /** The `id` of the room of the layer. The layer of the level record has no room. */
  readonly room?: string | undefined;
  readonly layer: Layer;
  /**
   * This function gives the name in the level of a record of the part, from its `id` in the part.
   * A record of a room gets the name that `roomName` gives, and a record of the level record keeps its `id`.
   * The function also gives the name of a record of the core that the part names, for example a placed object.
   */
  readonly name: (id: string) => string;
}

/**
 * This function gives the name in a level of a record of a room. The name is the `id` of the room, a slash and the `id` in the survey.
 * `expandLevel` gives each wall, each opening and each placed object such a name. The function `join` of an add-on gives it to the records of a room.
 */
export function roomName(room: string, id: string): string {
  return `${room}/${id}`;
}

/**
 * This function makes one part of the layers of a level. With no room, the part is the layer of the level record.
 * Its function `name` has the rule of `roomName`, so an add-on does not write that rule again.
 */
export function layerPart<Layer>(layer: Layer, room?: string): LayerPart<Layer> {
  return room === undefined ? { layer, name: (id) => id } : { room, layer, name: (id) => roomName(room, id) };
}

/** These are the codes of the faults of a layer that the core finds. */
export const LAYER_CODES: readonly ["layer-name", "layer-unknown", "layer-form"] = ["layer-name", "layer-unknown", "layer-form"];

/** A finding of a layer: a fault of its form, of an anchor or of the meaning of its records. */
export interface LayerFinding {
  readonly level: FindingLevel;
  /** A code of `LAYER_CODES` or `ANCHOR_CODES`, or a code of the add-on. */
  readonly code: string;
  /** The key of the layer in `Scene.layers`. */
  readonly layer: string;
  /** The key of the anchor, or the `id` of the record with the fault. For the layer, it is empty. */
  readonly at: string;
  /** The fault in plain words, with the values. */
  readonly message: string;
  /** The `id` of the second record of the fault. A fault of one record has none. */
  readonly other?: string | undefined;
  /** The `id` of the room of the layer. Only a finding of `expandLevel` about the layer of a room has it. */
  readonly room?: string | undefined;
}

/** This function gives the add-on of each schema name. The first add-on of a name is used. */
function addOnsByName(addOns: readonly AddOn<unknown>[]): ReadonlyMap<string, AddOn<unknown>> {
  const byName = new Map<string, AddOn<unknown>>();
  for (const addOn of addOns) if (!byName.has(addOn.schema)) byName.set(addOn.schema, addOn);
  return byName;
}

/** This function reads the layer of an add-on in a scene. It gives `undefined` when the scene has no layer of the add-on. */
export function readLayer<Layer>(scene: Scene, addOn: AddOn<Layer>): LayerParse<Layer> | undefined {
  const layers = scene.layers ?? {};
  return Object.hasOwn(layers, addOn.schema) ? addOn.parse(layers[addOn.schema]) : undefined;
}

/**
 * This function gives the findings of the layers of a scene, with a list of add-ons.
 * Each layer gets the faults of its form, of each anchor and of the meaning of its records. A layer of no add-on of the list gets a warning.
 * The findings are in the order of the layer keys, then of the record keys. Thus equal inputs give equal findings.
 *
 * The name of the record of a finding is `recordName(finding.layer, finding.at)`, so a finding selects its mark.
 * `checkScene` examines the core, and this function examines the layers.
 */
export function checkLayers(scene: Scene, addOns: readonly AddOn<unknown>[]): readonly LayerFinding[] {
  const byName = addOnsByName(addOns);
  const layers = scene.layers ?? {};
  const findings: LayerFinding[] = [];
  let space: SceneSpace | undefined;
  for (const name of Object.keys(layers).sort(compareText)) {
    if (!isLayerName(name)) {
      findings.push({ level: "error", code: "layer-name", layer: name, at: "", message: `The layer "${name}" has a name that is not a word, a slash and a version, for example "electrical/1".` });
      continue;
    }
    const addOn = byName.get(name);
    if (addOn === undefined) {
      findings.push({ level: "warning", code: "layer-unknown", layer: name, at: "", message: `The scene has the layer "${name}", and no add-on of the check reads it. The scene keeps the layer.` });
      continue;
    }
    const read = addOn.parse(layers[name]);
    if (!read.ok) {
      for (const message of read.errors) findings.push({ level: "error", code: "layer-form", layer: name, at: "", message });
      continue;
    }
    space ??= sceneSpace(scene);
    const own: LayerFinding[] = [];
    for (const [key, anchor] of addOn.anchors(read.layer)) {
      for (const fault of checkAnchor(anchor, space, `The anchor "${key}" of the layer "${name}"`)) own.push({ ...fault, layer: name, at: key });
    }
    for (const fault of addOn.check(read.layer, space)) own.push({ ...fault, layer: name });
    // The sort is stable, so the faults of one record keep their order.
    own.sort((a, b) => compareText(a.at, b.at));
    findings.push(...own);
  }
  return findings;
}

/** The result of a change of layers: the layers that the function carried, and a finding for each layer that it did not carry. */
export interface LayersMove {
  /** The layers of the result, in the order of their names. */
  readonly layers: Readonly<Record<string, unknown>>;
  /** One finding or more for each layer that is not in the result. Each finding has the level `error`. */
  readonly findings: readonly LayerFinding[];
}

/** The read of one layer for a change: the add-on and the layer, or the findings that tell why the layer has no read. */
type LayerRead = { readonly addOn: AddOn<unknown>; readonly layer: unknown } | readonly LayerFinding[];

/** This function reads one layer with the add-on of its name. `room` is the `id` of the room of the layer, in a level. */
function readForChange(name: string, value: unknown, byName: ReadonlyMap<string, AddOn<unknown>>, room?: string): LayerRead {
  const where = room === undefined ? {} : { room };
  const of = room === undefined ? "" : ` of the room "${room}"`;
  const finding = (code: (typeof LAYER_CODES)[number], message: string): LayerFinding => ({ level: "error", code, layer: name, at: "", message, ...where });
  if (!isLayerName(name)) {
    return [finding("layer-name", `The layer "${name}"${of} has a name that is not a word, a slash and a version, for example "electrical/1". The result does not have the layer.`)];
  }
  const addOn = byName.get(name);
  if (addOn === undefined) return [finding("layer-unknown", `No add-on of the list reads the layer "${name}"${of}. The result does not have the layer.`)];
  const read = addOn.parse(value);
  if (!read.ok) return read.errors.map((message) => finding("layer-form", message));
  return { addOn, layer: read.layer };
}

/**
 * This function gives layers with each anchor changed by `move`. The add-on of each layer comes from the list.
 * `expandSurvey` uses it to put the layers of a survey on the room record. A host uses it when it moves the records of a room.
 *
 * A layer that the function cannot read is not in the result, because its anchors are in the old space. A finding tells each such layer:
 *
 * - `layer-name`: the name is not a layer name.
 * - `layer-unknown`: no add-on of the list has the name.
 * - `layer-form`: the add-on found a fault in the form of the layer.
 *
 * `room` is the `id` of the room of the layers, in a level. Each finding gets it.
 */
export function moveLayers(
  layers: Readonly<Record<string, unknown>> | undefined,
  addOns: readonly AddOn<unknown>[],
  move: (anchor: Anchor) => Anchor,
  room?: string,
): LayersMove {
  const byName = addOnsByName(addOns);
  const given = layers ?? {};
  const moved: [string, unknown][] = [];
  const findings: LayerFinding[] = [];
  for (const name of Object.keys(given).sort(compareText)) {
    const read = readForChange(name, given[name], byName, room);
    if ("addOn" in read) {
      const anchors = new Map<string, Anchor>();
      for (const [key, anchor] of read.addOn.anchors(read.layer)) anchors.set(key, move(anchor));
      moved.push([name, read.addOn.withAnchors(read.layer, anchors)]);
    } else findings.push(...read);
  }
  return { layers: Object.fromEntries(moved), findings };
}

/** The layers of one room of a level, for `joinLayers`. The anchors have the names of the level already. */
export interface RoomLayers {
  /** The `id` of the room. */
  readonly room: string;
  readonly layers: Readonly<Record<string, unknown>> | undefined;
}

/**
 * This function gives the layers of a level. Each name gets one layer, from the layer of the level record and the layers of the rooms.
 * The function `join` of the add-on of each name makes that layer. `expandLevel` uses this function.
 *
 * - A layer that only the level record has stays as it is, because its anchors are on the room record of the level already.
 *   `checkLayers` examines it.
 * - The layer of a room needs an add-on of its name with the function `join`. Without it, a finding tells the layer of each room,
 *   and the layer of the level record stays as it is. The codes are the codes of `moveLayers`.
 *   An add-on with no function `join` gives the code `layer-unknown`.
 * - With such an add-on, a part with a fault in its form is not in the layer of the result. A finding tells the part.
 */
export function joinLayers(own: Readonly<Record<string, unknown>> | undefined, rooms: readonly RoomLayers[], addOns: readonly AddOn<unknown>[]): LayersMove {
  const byName = addOnsByName(addOns);
  const level = own ?? {};
  const names = new Set(Object.keys(level));
  for (const room of rooms) for (const name of Object.keys(room.layers ?? {})) names.add(name);
  const joined: [string, unknown][] = [];
  const findings: LayerFinding[] = [];
  for (const name of [...names].sort(compareText)) {
    const inLevel = Object.hasOwn(level, name);
    const inRooms = rooms.filter((room) => room.layers !== undefined && Object.hasOwn(room.layers, name));
    const addOn = isLayerName(name) ? byName.get(name) : undefined;
    const join = addOn?.join?.bind(addOn);
    if (join === undefined || inRooms.length === 0) {
      if (inLevel) joined.push([name, level[name]]);
      for (const { room, layers } of inRooms) {
        if (addOn === undefined) {
          const read = readForChange(name, layers?.[name], byName, room);
          if (!("addOn" in read)) findings.push(...read);
        } else {
          const message = `The add-on of the layer "${name}" has no function "join", so the result does not have the layer of the room "${room}".`;
          findings.push({ level: "error", code: "layer-unknown", layer: name, at: "", message, room });
        }
      }
      continue;
    }
    const parts: LayerPart<unknown>[] = [];
    if (inLevel) {
      const read = readForChange(name, level[name], byName);
      if ("addOn" in read) parts.push(layerPart(read.layer));
      else findings.push(...read);
    }
    for (const { room, layers } of inRooms) {
      const read = readForChange(name, layers?.[name], byName, room);
      if ("addOn" in read) parts.push(layerPart(read.layer, room));
      else findings.push(...read);
    }
    if (parts.length > 0) joined.push([name, join(parts)]);
  }
  return { layers: Object.fromEntries(joined), findings };
}
