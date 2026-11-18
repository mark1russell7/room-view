import { ELECTRICAL_SCHEMA, electricalSpace, evaluateCircuit, RATED_LIMIT } from "@mark1russell7/electrical";
import { ELECTRICAL_FORM } from "@mark1russell7/electrical/form";
import {
  readFormRecord,
  type Circuit,
  type FormRecord,
  type FormRecords,
  type FormSystem,
  type FormValue,
  type Level,
  type Survey,
  type SurveyObject,
  type SurveyOutlet,
  type WallFace,
} from "@mark1russell7/room-view";
import type { BridgeRecords, PageAddOn } from "./bridge.ts";

// The electrical add-on of the page "Measure a room".
//
// This file is a shortcut. A survey record and a level record have no layers yet.
// They have the outlets, the circuits and the outlet of an object as fields of their own.
// Thus this file changes the records of the electrical form to those fields, and back. It is the bridge of the add-on.
// The shortcut goes away when a survey record and a level record have layers. Then the page writes the layer of the form.
//
// The texts of the add-on for the page are here too: the help of the list of the circuits, and the limit of a circuit.
// These texts are not a shortcut. They stay with the add-on when the bridge goes away.

/** The names of the electrical layer that the page uses: the layer, three collections and seven fields. */
export interface ElectricalNames {
  readonly layer: string;
  readonly circuits: string;
  readonly outlets: string;
  readonly feeds: string;
  /** The field of an outlet that names its circuit. */
  readonly circuit: string;
  /** The field of a feed that names its outlet. */
  readonly outlet: string;
  /** The field of a feed that names its object. */
  readonly object: string;
  readonly name: string;
  readonly breaker: string;
  readonly voltage: string;
  /** The field of a feed with the power of its object. */
  readonly watts: string;
}

/**
 * The names of the electrical layer. A survey record and a store of version 1 have electrical records in fields of their own.
 * The bridge and the move of a store of version 1 find the records of the form by these names. A test compares each name with the form.
 */
export const ELECTRICAL: ElectricalNames = {
  layer: ELECTRICAL_FORM.schema,
  circuits: "circuits",
  outlets: "outlets",
  feeds: "feeds",
  circuit: "circuit",
  outlet: "outlet",
  object: "object",
  name: "name",
  breaker: "breaker",
  voltage: "voltage",
  watts: "watts",
};

/**
 * This function gives the continuous load limit of a circuit in watts, from the rating of its breaker and its voltage.
 * The program `RATED_LIMIT` multiplies the voltage, the rating and the part for a continuous load: 80%, the default of the add-on.
 * Thus 15 A at 120 V gives 1440 W. A value that is not a finite number gives `undefined`.
 */
export function circuitLimit(breaker: number, voltage: number): number | undefined {
  const id = "circuit";
  const result = evaluateCircuit(RATED_LIMIT, electricalSpace({ schema: ELECTRICAL_SCHEMA, circuits: [{ id, breaker, voltage }] }), id);
  // The limit is in watts, and a part of a milliwatt is noise of the floating point.
  return result.ok && typeof result.value === "number" && Number.isFinite(result.value) ? Math.round(result.value * 1000) / 1000 : undefined;
}

type Values = Readonly<Record<string, FormValue>>;

/** This function gives the records of a collection. A collection with no records gives an empty list. */
function listOf(records: FormRecords, collection: string): readonly FormRecord[] {
  return Object.hasOwn(records, collection) ? (records[collection] ?? []) : [];
}

/** This function gives the text of a field. A field with no text gives `undefined`. */
function textValue(values: Values, name: string): string | undefined {
  const value = Object.hasOwn(values, name) ? values[name] : undefined;
  return typeof value === "string" ? value : undefined;
}

/** This function gives the number of a field. A field with no number gives `undefined`. */
function numberValue(values: Values, name: string): number | undefined {
  const value = Object.hasOwn(values, name) ? values[name] : undefined;
  return typeof value === "number" ? value : undefined;
}

/** This function gives the limit of a circuit from the values of its record. A record with no breaker or no voltage has no limit. */
function limitOf(values: Values): number | undefined {
  const breaker = numberValue(values, ELECTRICAL.breaker);
  const voltage = numberValue(values, ELECTRICAL.voltage);
  const limit = breaker === undefined || voltage === undefined ? undefined : circuitLimit(breaker, voltage);
  return limit !== undefined && limit > 0 ? limit : undefined;
}

/**
 * This function gives the circuit records of the records of the electrical form.
 * A circuit record needs a limit. Thus a circuit with no limit is not in the result, and no outlet names it.
 */
function circuitsOf(records: FormRecords): readonly Circuit[] {
  return listOf(records, ELECTRICAL.circuits).flatMap((record): Circuit[] => {
    const breaker = numberValue(record.values, ELECTRICAL.breaker);
    const voltage = numberValue(record.values, ELECTRICAL.voltage);
    const limit = limitOf(record.values);
    if (breaker === undefined || voltage === undefined || limit === undefined) return [];
    const name = textValue(record.values, ELECTRICAL.name);
    return [{ id: record.id, ...(name === undefined ? {} : { name }), breaker, voltage, limit }];
  });
}

/**
 * This function adds the records of the electrical form to a survey record: the outlets and the outlet of each object.
 * With `listed`, the survey also lists the circuits. The survey of a room of a level lists none, because the level lists them.
 * An outlet names only a circuit that the records have. An object names only an outlet that the records have.
 */
export function electricalSurvey(survey: Survey, records: FormRecords, listed: boolean): Survey {
  const circuits = circuitsOf(records);
  const known = new Set(circuits.map((circuit) => circuit.id));
  const outlets = listOf(records, ELECTRICAL.outlets).flatMap((record): SurveyOutlet[] => {
    const anchor = record.anchor;
    if (anchor?.on !== "wall") return [];
    const circuit = textValue(record.values, ELECTRICAL.circuit);
    return [{ id: record.id, wall: anchor.wall, offset: anchor.offset, height: anchor.height, ...(circuit === undefined || !known.has(circuit) ? {} : { circuit }) }];
  });
  const placed = new Set(outlets.map((outlet) => outlet.id));
  /** The `id` of the outlet of each object, by the `id` of the object. */
  const feeds = new Map<string, string>();
  for (const record of listOf(records, ELECTRICAL.feeds)) {
    const object = textValue(record.values, ELECTRICAL.object);
    const outlet = textValue(record.values, ELECTRICAL.outlet);
    if (object !== undefined && outlet !== undefined && placed.has(outlet) && !feeds.has(object)) feeds.set(object, outlet);
  }
  const { objects, ...rest } = survey;
  const fed = objects?.map((object): SurveyObject => {
    const outlet = feeds.get(object.id);
    return outlet === undefined ? object : { ...object, outlet };
  });
  // The objects come last, as in each survey record of the page.
  return {
    ...rest,
    ...(outlets.length === 0 ? {} : { outlets }),
    ...(listed && circuits.length > 0 ? { circuits } : {}),
    ...(fed === undefined ? {} : { objects: fed }),
  };
}

/** This function adds the circuits of the records of the electrical form to a level record. */
export function electricalLevel(level: Level, records: FormRecords): Level {
  const circuits = circuitsOf(records);
  return circuits.length === 0 ? level : { ...level, circuits };
}

/** A survey record does not tell the face of an outlet: it is the inner face of the wall. The page does not read the face of a record. */
const FACE: WallFace = "left";

/** This function gives the feeds of a survey record: one feed for each object with an outlet. The first object of an `id` is the object of that `id`. */
function feedsOf(survey: Survey): readonly FormRecord[] {
  const seen = new Set<string>();
  return (survey.objects ?? []).flatMap((object): FormRecord[] => {
    if (seen.has(object.id)) return [];
    seen.add(object.id);
    return object.outlet === undefined ? [] : [{ id: `feed-${object.id}`, values: { [ELECTRICAL.object]: object.id, [ELECTRICAL.outlet]: object.outlet } }];
  });
}

/**
 * This function gives the records of the electrical form from the fields of survey records and of a level record.
 * The circuits come from the level and from each survey, in that sequence. Each object with an outlet gives one feed.
 *
 * The form does not keep the limit of a circuit: the page calculates it from the breaker and the voltage.
 * Thus `more` is true when the limit of a circuit record is not the limit of its breaker and its voltage.
 * A circuit with no breaker or no voltage has the usual value of the form for `system`.
 */
export function electricalRecords(surveys: readonly Survey[], level: Level | undefined, system: FormSystem): BridgeRecords {
  const collection = ELECTRICAL_FORM.collections.find((item) => item.name === ELECTRICAL.circuits);
  let more = false;
  const circuits = [...(level?.circuits ?? []), ...surveys.flatMap((survey) => survey.circuits ?? [])].map((circuit): FormRecord => {
    const record: FormRecord = {
      id: circuit.id,
      values: {
        ...(circuit.name === undefined ? {} : { [ELECTRICAL.name]: circuit.name }),
        ...(circuit.breaker === undefined ? {} : { [ELECTRICAL.breaker]: circuit.breaker }),
        ...(circuit.voltage === undefined ? {} : { [ELECTRICAL.voltage]: circuit.voltage }),
      },
    };
    const reading = collection === undefined ? undefined : readFormRecord(collection, record, system);
    const limit = reading?.state === "ok" ? limitOf(reading.values) : undefined;
    if (limit === undefined || !(Math.abs(limit - circuit.limit) <= 1e-6 * Math.max(1, Math.abs(circuit.limit)))) more = true;
    return record;
  });
  const rooms = surveys.map(
    (survey): FormRecords => ({
      [ELECTRICAL.outlets]: (survey.outlets ?? []).map(
        (outlet): FormRecord => ({
          id: outlet.id,
          anchor: { on: "wall", wall: outlet.wall, face: FACE, offset: outlet.offset, height: outlet.height },
          values: outlet.circuit === undefined ? {} : { [ELECTRICAL.circuit]: outlet.circuit },
        }),
      ),
      [ELECTRICAL.feeds]: feedsOf(survey),
    }),
  );
  return { lists: { [ELECTRICAL.circuits]: circuits }, rooms, more };
}

/**
 * This function gives a power in watts as text. A power below 100 has one decimal place at most, and each other power has none.
 * With no `locale`, the text has the number format of the browser.
 */
export function wattText(watts: number, locale?: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: watts < 100 ? 1 : 0 }).format(watts);
}

/** The text of the button that adds a circuit. A step of the help names the button. */
const ADD_BREAKER = "Add a breaker";

/**
 * The electrical add-on of the page: its form, its texts and its bridge to the fields of a survey record and of a level record.
 *
 * The page does not show the power of an object. A survey record has no field for it, so a file does not keep the number.
 */
export const ELECTRICAL_ADD_ON: PageAddOn = {
  form: ELECTRICAL_FORM,
  bridge: { read: electricalRecords, survey: electricalSurvey, level: electricalLevel },
  hidden: { [ELECTRICAL.feeds]: [ELECTRICAL.watts] },
  lists: {
    [ELECTRICAL.circuits]: {
      aid: "Each breaker of the electrical panel gives power to the outlets of one circuit. Add each breaker here. Then, at each outlet, select its circuit.",
      add: ADD_BREAKER,
    },
  },
  steps: [
    "For the circuits, switch off one breaker of the electrical panel. Find each outlet with no power.",
    `Under Circuits, select ${ADD_BREAKER}. Type the amperes on the handle of the breaker. Then, at each outlet with no power, select the circuit.`,
  ],
  note: (collection, values) => {
    const limit = collection === ELECTRICAL.circuits ? limitOf(values) : undefined;
    return limit === undefined ? undefined : `The limit for a continuous load is ${wattText(limit)} W.`;
  },
};
