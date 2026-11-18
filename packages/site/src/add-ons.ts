import { ELECTRICAL_FORM } from "@mark1russell7/electrical/form";
import type { FormCollection, LayerForm } from "@mark1russell7/room-view";

// The add-ons of the page "Measure a room": the form of each layer that the page knows.
// The store of the page knows no topic. Each word about a topic comes from a form of this list.

/** The forms of the add-ons of the page. */
export const FORMS: readonly LayerForm[] = [ELECTRICAL_FORM];

/** This function gives the form of a layer. A layer that the list does not have gives `undefined`. */
export function formOf(layer: string, forms: readonly LayerForm[] = FORMS): LayerForm | undefined {
  return forms.find((form) => form.schema === layer);
}

/** This function gives a collection of the form of a layer. A name that the forms do not have gives `undefined`. */
export function collectionOf(layer: string, collection: string, forms: readonly LayerForm[] = FORMS): FormCollection | undefined {
  return formOf(layer, forms)?.collections.find((item) => item.name === collection);
}

/** The names of the electrical layer that the page uses for a survey record: the layer, three collections and five fields. */
export interface ElectricalNames {
  readonly layer: string;
  readonly circuits: string;
  readonly outlets: string;
  readonly feeds: string;
  /** The field of an outlet that names its circuit. */
  readonly circuit: string;
  /** The field of a feed that names its outlet. */
  readonly outlet: string;
  readonly name: string;
  readonly breaker: string;
  readonly voltage: string;
}

/**
 * The names of the electrical layer. A survey record and a store of version 1 have electrical records, and a survey has no layers yet.
 * Thus the page reads and writes these records by these names, until a survey has layers.
 * A test holds each name against the form of the add-on.
 */
export const ELECTRICAL: ElectricalNames = {
  layer: ELECTRICAL_FORM.schema,
  circuits: "circuits",
  outlets: "outlets",
  feeds: "feeds",
  circuit: "circuit",
  outlet: "outlet",
  name: "name",
  breaker: "breaker",
  voltage: "voltage",
};
