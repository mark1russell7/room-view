import type { AddOn, FormCollection, LayerForm } from "@mark1russell7/room-view";
import { ELECTRICAL_ADD_ON } from "./electrical.ts";
import type { PageAddOn } from "./page-add-on.ts";

// The add-ons of the page "Measure a room": the form of each layer that the page knows.
// The store of the page knows no topic. Each word about a topic comes from a form of this list.

/** The add-ons of the page, in the sequence of the page. */
export const ADD_ONS: readonly PageAddOn[] = [ELECTRICAL_ADD_ON];

/** The forms of the add-ons of the page. */
export const FORMS: readonly LayerForm[] = ADD_ONS.map((addOn) => addOn.form);

/** The add-ons of the core that read the layers of the page, in the sequence of the page. */
export const CORE_ADD_ONS: readonly AddOn<unknown>[] = ADD_ONS.map((addOn) => addOn.core);

/** This function gives the add-on of a layer. A layer that the list does not have gives `undefined`. */
export function addOnOf(layer: string, addOns: readonly PageAddOn[] = ADD_ONS): PageAddOn | undefined {
  return addOns.find((addOn) => addOn.form.schema === layer);
}

/** This function gives the form of a layer. A layer that the list does not have gives `undefined`. */
export function formOf(layer: string, forms: readonly LayerForm[] = FORMS): LayerForm | undefined {
  return forms.find((form) => form.schema === layer);
}

/** This function gives a collection of the form of a layer. A name that the forms do not have gives `undefined`. */
export function collectionOf(layer: string, collection: string, forms: readonly LayerForm[] = FORMS): FormCollection | undefined {
  return formOf(layer, forms)?.collections.find((item) => item.name === collection);
}
