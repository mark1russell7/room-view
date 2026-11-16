import type { AddOn, Anchor } from "@mark1russell7/room-view";
import { checkElectrical } from "./check.ts";
import { ELECTRICAL_SCHEMA, parseElectrical, type ElectricalLayer } from "./layer.ts";
import type { LoadOptions } from "./states.ts";

// The electrical add-on, as a value of the contract of the core. A host gives it to `checkLayers` and `readLayer`.

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
 * This function makes the electrical add-on with options of the limits and the levels.
 * The checks of the add-on use the options, for example a different continuous part.
 */
export function electricalAddOn(options: LoadOptions = {}): AddOn<ElectricalLayer> {
  return {
    schema: ELECTRICAL_SCHEMA,
    parse: parseElectrical,
    anchors: outletAnchors,
    withAnchors: withOutletAnchors,
    check: (layer, space) => checkElectrical(layer, space, options),
  };
}

/** The electrical add-on with the default options: a continuous part of 80%, and the level `near` from 80% of a limit. */
export const electrical: AddOn<ElectricalLayer> = electricalAddOn();
