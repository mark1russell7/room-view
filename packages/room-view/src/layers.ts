import { sceneSpace, type Anchor, type SceneSpace } from "./anchors.ts";
import { checkAnchor, type FindingLevel } from "./check.ts";
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
}

/** This function compares two texts by their code points, so the order does not change with the language of a computer. */
function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
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
