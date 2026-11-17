import type { Mark } from "@mark1russell7/visuals/marks";
import { sceneSpace, type SceneSpace } from "./anchors.ts";
import { readLayer, type AddOn } from "./layers.ts";
import { compareText } from "./order.ts";
import type { Scene } from "./room.ts";

// The marks of the layers of a scene. A mark is a record that a viewer draws: plain data of `@mark1russell7/visuals/marks`.
// This module is the entry `/marks` of the package. The root entry has no mark, so a host with no viewer does not get this module.

/**
 * The marks of one add-on. This value is in the entry `/marks` of the add-on, so the root entry of the add-on has no visual part.
 * A host gives a list of these values to `layerMarks`, with the add-ons that read the layers.
 */
export interface AddOnMarks<Layer> {
  /** The name of the format of the layer, for example `electrical/1`. It is the `schema` of the add-on that reads the layer. */
  readonly schema: string;
  /**
   * This function gives the marks of a layer. Each point is in the space of the frames: meters, with the z axis up.
   * The record name of a mark is `recordName(schema, id)`, so a finding of the layer selects its mark.
   */
  marks(layer: Layer, space: SceneSpace): readonly Mark[];
}

/**
 * This function gives the marks of the layers of a scene. Each value of `marks` gives the marks of the layer of its name.
 * The add-on of the same name reads the layer.
 *
 * A layer that the scene does not have gives no marks. A layer with a fault of its form gives no marks, and `checkLayers` tells the fault.
 * The marks are in the order of the layer names, then of the record names. Thus equal inputs give equal marks.
 * The first value of a name is used, for `addOns` and for `marks`.
 *
 * @throws RangeError when a value of `marks` names a layer that no add-on of the list reads
 */
export function layerMarks(scene: Scene, addOns: readonly AddOn<unknown>[], marks: readonly AddOnMarks<unknown>[]): readonly Mark[] {
  const makers = new Map<string, AddOnMarks<unknown>>();
  for (const maker of marks) if (!makers.has(maker.schema)) makers.set(maker.schema, maker);
  const readers = new Map<string, AddOn<unknown>>();
  for (const addOn of addOns) if (!readers.has(addOn.schema)) readers.set(addOn.schema, addOn);
  for (const name of makers.keys()) {
    if (!readers.has(name)) throw new RangeError(`The marks of the layer "${name}" have no add-on in the list. Give the add-on that reads the layer.`);
  }

  const found: Mark[] = [];
  let space: SceneSpace | undefined;
  for (const name of [...makers.keys()].sort(compareText)) {
    const maker = makers.get(name);
    const addOn = readers.get(name);
    if (maker === undefined || addOn === undefined) continue;
    const read = readLayer(scene, addOn);
    if (read === undefined || !read.ok) continue;
    space ??= sceneSpace(scene);
    // The sort is stable, so the marks of one record keep their order.
    found.push(...[...maker.marks(read.layer, space)].sort((a, b) => compareText(a.record, b.record)));
  }
  return found;
}
