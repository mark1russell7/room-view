import { ELECTRICAL_SCHEMA, electricalSpace, evaluateCircuit, fromLevelV1, fromSurveyV1, RATED_LIMIT, type Circuit, type ElectricalLayer } from "@mark1russell7/electrical";
import { electrical } from "@mark1russell7/electrical/add-on";
import { ELECTRICAL_FORM } from "@mark1russell7/electrical/form";
import { readFormRecord, type FormSystem, type FormValue } from "@mark1russell7/room-view";
import type { PageAddOn } from "./page-add-on.ts";

// The electrical add-on of the page "Measure a room".
//
// The page writes the records of the electrical form as the layer `electrical/1` of a survey record and of a level record.
// The add-on of the package reads that layer, and the page reads the records of the form from it.
// This file has the parts that the form does not have: the texts of the add-on for the page, the limit of a circuit, and the read of an old file.
// An old file has the outlets, the circuits and the outlet of an object as fields of a survey record. The package moves them to a layer.

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
 * The names of the electrical layer. A store of version 1 has electrical records in fields of its own.
 * The move of such a store and the example room find the records of the form by these names. A test compares each name with the form.
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

/** The largest difference of two limits that are equal, as a part of the limit. It is above the error of the arithmetic. */
const EQUAL_LIMITS = 1e-6;

/**
 * This function removes the limit of each circuit that is equal to the limit of its breaker and its voltage.
 * The form does not keep the limit of a circuit: the page calculates it. Thus such a limit is not data that the page loses.
 * A circuit with no breaker or no voltage has the usual value of the form for `system`. A different limit stays.
 */
function plainLayer(layer: ElectricalLayer, system: FormSystem): ElectricalLayer {
  const collection = ELECTRICAL_FORM.collections.find((item) => item.name === ELECTRICAL.circuits);
  if (layer.circuits === undefined || collection === undefined) return layer;
  const circuits = layer.circuits.map((circuit): Circuit => {
    const { limit, ...rest } = circuit;
    if (limit === undefined) return circuit;
    const values = {
      ...(circuit.name === undefined ? {} : { [ELECTRICAL.name]: circuit.name }),
      ...(circuit.breaker === undefined ? {} : { [ELECTRICAL.breaker]: circuit.breaker }),
      ...(circuit.voltage === undefined ? {} : { [ELECTRICAL.voltage]: circuit.voltage }),
    };
    const reading = readFormRecord(collection, { id: circuit.id, values }, system);
    const rated = reading.state === "ok" ? limitOf(reading.values) : undefined;
    return rated !== undefined && Math.abs(rated - limit) <= EQUAL_LIMITS * Math.max(1, Math.abs(limit)) ? rest : circuit;
  });
  return { ...layer, circuits };
}

/** This function gives a layer that has a record. A layer with no record gives `undefined`. */
function withRecords(layer: ElectricalLayer): ElectricalLayer | undefined {
  return layer.outlets === undefined && layer.circuits === undefined && layer.feeds === undefined ? undefined : layer;
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
 * The electrical add-on of the page: its form, the add-on of the package, its marks, its texts and the read of an old file.
 *
 * The marks come with the 3D view, so the first load of the page does not have them.
 * An old file has no layer. `fromSurveyV1` and `fromLevelV1` of the package move its electrical fields to a layer.
 */
export const ELECTRICAL_ADD_ON: PageAddOn<ElectricalLayer> = {
  form: ELECTRICAL_FORM,
  core: electrical,
  async marks() {
    const { electricalAddOnMarks } = await import("@mark1russell7/electrical/marks");
    return electricalAddOnMarks();
  },
  fromSurvey: (survey) => withRecords(fromSurveyV1(survey)),
  fromLevel: (level) => withRecords(fromLevelV1(level)),
  plain: plainLayer,
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
