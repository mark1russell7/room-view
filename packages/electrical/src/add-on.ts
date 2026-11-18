import type { AddOn } from "@mark1russell7/room-view";
import { joinElectrical, outletAnchors, withOutletAnchors } from "./anchors.ts";
import { checkElectrical } from "./check.ts";
import { ELECTRICAL_SCHEMA, type ElectricalLayer } from "./layer.ts";
import { parseElectrical } from "./schema.ts";
import type { LoadOptions } from "./states.ts";

// The electrical add-on, as a value of the contract of the core. A host gives it to `checkLayers` and `readLayer`.
// This module is the entry `/add-on` of the package. It reads a layer with the zod schema, so it is not in the root entry.

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
    join: joinElectrical,
  };
}

/** The electrical add-on with the default options: a continuous part of 80%, and the level `near` from 80% of a limit. */
export const electrical: AddOn<ElectricalLayer> = electricalAddOn();
