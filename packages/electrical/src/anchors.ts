import type { Anchor, LayerPart } from "@mark1russell7/room-view";
import { ELECTRICAL_SCHEMA, type Circuit, type ElectricalLayer, type Feed, type Outlet } from "./layer.ts";

// The anchors of an electrical layer: each outlet is on one anchor of the core. The layers of the rooms of a level become one layer.

/** This function gives the anchor of each outlet of a layer, by the `id` of the outlet. The first outlet of an `id` is used. */
export function outletAnchors(layer: ElectricalLayer): ReadonlyMap<string, Anchor> {
  const anchors = new Map<string, Anchor>();
  for (const outlet of layer.outlets ?? []) if (!anchors.has(outlet.id)) anchors.set(outlet.id, outlet.anchor);
  return anchors;
}

/** This function gives a layer with new anchors of its outlets, by the `id` of each outlet. An outlet with no new anchor keeps its anchor. */
export function withOutletAnchors(layer: ElectricalLayer, anchors: ReadonlyMap<string, Anchor>): ElectricalLayer {
  if (layer.outlets === undefined) return layer;
  return { ...layer, outlets: layer.outlets.map((outlet) => ({ ...outlet, anchor: anchors.get(outlet.id) ?? outlet.anchor })) };
}

/**
 * This function gives one electrical layer from the parts of a level: the layer of the level record, then the layer of each room.
 * It is the function `join` of the add-on, and `expandLevel` of the core uses it.
 *
 * - An outlet and a feed get the name that their part gives: `part.name(id)`. The `object` and the `outlet` of a feed get such a name too.
 *   Thus a record of a room has the `id` of the room before its `id`.
 * - A circuit keeps its `id`, because one circuit gives power to outlets in more than one room. The first circuit of an `id` stays.
 * - A record of the layer of the level record stays as it is.
 *
 * The result has a list only when a part has that list.
 */
export function joinElectrical(parts: readonly LayerPart<ElectricalLayer>[]): ElectricalLayer {
  const outlets: Outlet[] = [];
  const circuits = new Map<string, Circuit>();
  const feeds: Feed[] = [];
  const has = { outlets: false, circuits: false, feeds: false };
  for (const { layer, name } of parts) {
    if (layer.outlets !== undefined) has.outlets = true;
    if (layer.circuits !== undefined) has.circuits = true;
    if (layer.feeds !== undefined) has.feeds = true;
    for (const outlet of layer.outlets ?? []) outlets.push({ ...outlet, id: name(outlet.id) });
    for (const circuit of layer.circuits ?? []) if (!circuits.has(circuit.id)) circuits.set(circuit.id, circuit);
    for (const feed of layer.feeds ?? []) feeds.push({ ...feed, id: name(feed.id), object: name(feed.object), outlet: name(feed.outlet) });
  }
  return {
    schema: ELECTRICAL_SCHEMA,
    ...(has.outlets ? { outlets } : {}),
    ...(has.circuits ? { circuits: [...circuits.values()] } : {}),
    ...(has.feeds ? { feeds } : {}),
  };
}
