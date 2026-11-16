import type { Anchor } from "@mark1russell7/room-view";
import type { ElectricalLayer } from "./layer.ts";

// The anchors of an electrical layer: each outlet is on one anchor of the core.

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
