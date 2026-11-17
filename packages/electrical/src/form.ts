import type { LayerForm } from "@mark1russell7/room-view";
import { ELECTRICAL_SCHEMA } from "./layer.ts";

// The form of an electrical layer, as data. This module is the entry `/form` of the package.
// A page makes its inputs from this form: the circuits of the level, the outlets of each wall and the power of each object.
// The root entry has no text of a page, so this form is not in the root entry.

/**
 * The form of an electrical layer: its circuits, its outlets and its feeds.
 *
 * - A circuit has a name, the rating of its breaker and its voltage.
 *   A home with feet and inches is in North America, thus 15 A at 120 V. A home with meters is in most other countries, thus 16 A at 230 V.
 * - An outlet is on a wall, and it names its circuit. An outlet with no height is 12 in or 0.3 m above the floor.
 * - A feed is the power of a placed object from an outlet, in watts. A page shows one feed for each object.
 *
 * The form does not have the `limit` and the `otherLoad` of a circuit, or an outlet on a floor or on an object. `formRecords` tells them with `more`.
 */
export const ELECTRICAL_FORM: LayerForm = {
  schema: ELECTRICAL_SCHEMA,
  collections: [
    {
      name: "circuits",
      word: "circuit",
      label: "Circuit",
      title: "Circuits",
      idFrom: "name",
      fields: [
        { kind: "text", name: "name", label: "Name" },
        {
          kind: "number",
          name: "breaker",
          label: "Breaker",
          unit: "A",
          above: 0,
          usual: { imperial: 15, metric: 16 },
          fault: "Type the rating of the breaker in amperes, as a number above 0.",
        },
        { kind: "number", name: "voltage", label: "Voltage", unit: "V", above: 0, usual: { imperial: 120, metric: 230 }, fault: "Type the voltage as a number above 0." },
      ],
    },
    {
      name: "outlets",
      word: "outlet",
      label: "Outlet",
      title: "Outlets",
      on: ["wall"],
      height: { imperial: 0.3048, metric: 0.3 },
      fields: [
        {
          kind: "record",
          name: "circuit",
          label: "Circuit",
          of: "circuits",
          none: "Not known yet",
          aid: "To tell the breaker of this outlet, add the breaker in Circuits, below the walls.",
        },
      ],
    },
    {
      name: "feeds",
      word: "feed",
      label: "Power",
      title: "Power",
      owner: "object",
      most: 1,
      fields: [
        { kind: "object", name: "object", label: "Object", needed: true },
        { kind: "record", name: "outlet", label: "Power from", of: "outlets", none: "No outlet", needed: true, aid: "To give it power, add an outlet to a wall." },
        { kind: "number", name: "watts", label: "Power", unit: "W", least: 0, fault: "Type the power in watts, as a number of 0 or more." },
      ],
    },
  ],
};
