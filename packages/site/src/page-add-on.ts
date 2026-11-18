import type { AddOn, FormSystem, FormValue, LayerForm, Level, Survey } from "@mark1russell7/room-view";
import type { AddOnMarks } from "@mark1russell7/room-view/marks";

// An add-on of the page "Measure a room": the type that the page knows about a topic.
//
// A survey record and a level record keep the records of each add-on as a layer, by the name of the layer.
// The page writes the layer of each form, and it reads the layer with the add-on of the core.
// Thus the page names no topic. Each word about a topic comes from an add-on of this type.

/** The texts of the page for one list of an add-on. The page has a usual text for each text that the add-on does not give. */
export interface ListTexts {
  /** The sentences below the title of the list. They tell a person what a record of the list is. */
  readonly aid?: string | undefined;
  /** The text of the button that adds a record to the list. */
  readonly add?: string | undefined;
}

/**
 * An add-on of the page: the form of its layer, the add-on of the core that reads the layer, and its texts for the page.
 * The form gives the fields of each record. The texts are the part of the add-on in this page, because a form has no sentences of help.
 */
export interface PageAddOn<Layer = unknown> {
  readonly form: LayerForm;
  /**
   * The add-on of the core for the layer of the form. It reads the layer, it moves its anchors to the room record, and it gives its faults.
   * The key of the anchor of a record is the `id` of the record. Thus a fault of an anchor tells the point of the page.
   */
  readonly core: AddOn<Layer>;
  /**
   * This function loads the marks of the layer for the 3D view. The page uses it only when a person opens that view.
   * An add-on with no such function has no mark in the 3D view.
   */
  marks?(): Promise<AddOnMarks<Layer>>;
  /**
   * This function gives the layer of the old fields of a survey record, from the time before a survey record had layers.
   * A survey with no such field gives `undefined`. The page uses the function only for a survey with no layer of the form.
   */
  fromSurvey?(survey: Survey): Layer | undefined;
  /** This function gives the layer of the old fields of a level record, as `fromSurvey` does for a survey record. */
  fromLevel?(level: Level): Layer | undefined;
  /**
   * This function removes from a layer each value that the page calculates from the fields of the form.
   * The form does not have such a value. Without this function, the page tells a person that the file has data that the page does not keep.
   * A value that is different from the calculated value stays, because it is data. `system` gives the usual number of each field with no value.
   */
  plain?(layer: Layer, system: FormSystem): Layer;
  /** The texts of the lists of the add-on, by the name of their collection. */
  readonly lists?: Readonly<Record<string, ListTexts>> | undefined;
  /** The steps of the add-on at the end of the help of the page. */
  readonly steps?: readonly string[] | undefined;
  /** This function gives a sentence about a record of a list, from the values that its form reads. No sentence gives `undefined`. */
  readonly note?: ((collection: string, values: Readonly<Record<string, FormValue>>) => string | undefined) | undefined;
}
