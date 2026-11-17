import { recordName, type AnchorFrame, type SceneSpace } from "@mark1russell7/room-view";
import type { AddOnMarks } from "@mark1russell7/room-view/marks";
import type { LinkMark, Mark, MeterMark, PointMark } from "@mark1russell7/visuals/marks";
import { ELECTRICAL_SCHEMA, type ElectricalLayer } from "./layer.ts";
import { firsts } from "./records.ts";
import { circuitStates, type CircuitState, type LoadOptions } from "./states.ts";

// The marks of the electrical add-on: the records of a layer as marks of `@mark1russell7/visuals/marks`. A viewer draws them.
// This module is the entry `/marks` of the package. The root entry has no mark, so a host with no viewer does not get this module.

/** These are the kinds of the marks of the add-on, for the legend and the filter of a viewer. */
export const ELECTRICAL_MARK_KINDS: readonly ["outlet", "feed", "circuit"] = ["outlet", "feed", "circuit"];

/** A kind of a mark of the add-on. */
export type ElectricalMarkKind = (typeof ELECTRICAL_MARK_KINDS)[number];

/** The text of the unit of each meter of the add-on: the watt. */
export const ELECTRICAL_METER_UNIT = "W";

/** This function gives a text on one line: each sequence of white space becomes one space. The label of a mark has one line. */
function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** This function tells if a number is a limit of a meter: a finite number above 0. */
function isMeterLimit(limit: number | undefined): limit is number {
  return limit !== undefined && Number.isFinite(limit) && limit > 0;
}

/**
 * This function gives the marks of an electrical layer in the space of a scene: meters, with the z axis up.
 *
 * - An outlet gives a point at its anchor. Its level is the level of its circuit.
 * - A feed gives a link from its outlet to the center of its placed object. Its level is the level of the circuit of the outlet.
 * - A circuit gives a meter: the known load, in watts. The meter has the limit of the circuit when that limit is a finite number above 0.
 *
 * A record with no place gives no mark: an outlet whose anchor has no position, and a feed with no outlet or no placed object.
 * A circuit with no such limit gives a meter with no `limit`, so a page shows only its known load. The level of that meter is `unknown`.
 * `checkElectrical` and `checkLayers` tell each of these faults.
 * An outlet with no circuit of the layer has the level `unknown`.
 *
 * The record name of a mark is `recordName("electrical/1", id)`, so a finding of the layer selects its mark.
 * The marks are in the sequence of the outlets, then the feeds, then the circuits. The first record of an `id` gives the mark.
 */
export function electricalMarks(layer: ElectricalLayer, space: SceneSpace, options: LoadOptions = {}): readonly Mark[] {
  const states = circuitStates(layer, options);
  const names = new Map(firsts(layer.circuits ?? []).map((circuit) => [circuit.id, circuit.name ?? circuit.id] as const));
  const stateOfOutlet = new Map<string, CircuitState>();
  for (const state of states) for (const outlet of state.outlets) stateOfOutlet.set(outlet, state);
  const name = (id: string): string => recordName(ELECTRICAL_SCHEMA, id);
  const marks: Mark[] = [];

  const frames = new Map<string, AnchorFrame>();
  for (const outlet of firsts(layer.outlets ?? [])) {
    const frame = space.frame(outlet.anchor);
    if (frame === undefined) continue;
    frames.set(outlet.id, frame);
    const state = stateOfOutlet.get(outlet.id);
    const circuit = state === undefined ? "" : `, circuit ${names.get(state.circuit) ?? state.circuit}`;
    const point: PointMark = {
      type: "point",
      record: name(outlet.id),
      kind: "outlet",
      level: state?.level ?? "unknown",
      label: oneLine(`Outlet ${outlet.id}${circuit}`),
      frame: { at: frame.at, out: frame.out },
    };
    marks.push(point);
  }

  for (const feed of firsts(layer.feeds ?? [])) {
    const from = frames.get(feed.outlet);
    const object = space.object(feed.object);
    if (from === undefined || object === undefined) continue;
    // The frame of an object has its origin at the center of its bottom, so this anchor is the center of the object.
    const center = space.frame({ on: "object", object: object.id, at: [0, 0, object.size[2] / 2] });
    if (center === undefined) continue;
    const watts = feed.watts === undefined ? "" : `, ${String(feed.watts)} ${ELECTRICAL_METER_UNIT}`;
    const link: LinkMark = {
      type: "link",
      record: name(feed.id),
      kind: "feed",
      level: stateOfOutlet.get(feed.outlet)?.level ?? "unknown",
      label: oneLine(`Outlet ${feed.outlet} to ${object.name ?? object.id}${watts}`),
      from: { record: name(feed.outlet), at: from.at },
      to: { record: recordName("object", object.id), at: center.at },
    };
    marks.push(link);
  }

  for (const state of states) {
    // The known load of a state is a finite number, so each circuit has a value for its meter.
    const meter: MeterMark = {
      type: "meter",
      record: name(state.circuit),
      kind: "circuit",
      level: state.level,
      label: oneLine(`Circuit ${names.get(state.circuit) ?? state.circuit}`),
      value: state.watts,
      // A meter with no limit has no field `limit`. Thus the mark is the same before and after JSON.
      ...(isMeterLimit(state.limit) ? { limit: state.limit } : {}),
      unit: ELECTRICAL_METER_UNIT,
    };
    marks.push(meter);
  }
  return marks;
}

/**
 * This function makes the marks of the electrical add-on, as a value of the contract of the core. A host gives it to `layerMarks`.
 * Give the options of `electricalAddOn` to this function too, so the levels of the marks agree with the findings.
 */
export function electricalAddOnMarks(options: LoadOptions = {}): AddOnMarks<ElectricalLayer> {
  return {
    schema: ELECTRICAL_SCHEMA,
    marks: (layer, space) => electricalMarks(layer, space, options),
  };
}
