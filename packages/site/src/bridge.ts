import type { FormRecords, FormSystem, FormValue, LayerForm, Level, Survey } from "@mark1russell7/room-view";

// An add-on of the page "Measure a room", and its bridge.
//
// The bridge is a shortcut. A survey record and a level record have no layers yet.
// Some add-ons have fields of their own in these records, for example the outlets of a survey.
// The bridge of such an add-on changes the records of its form to those fields, and back.
// The shortcut goes away when a survey record and a level record have layers. Then the page writes the layer of each form.

/** The records of a form that a bridge reads from survey records and from a level record. */
export interface BridgeRecords {
  /** The records of the lists of the level, by the name of each collection. */
  readonly lists: FormRecords;
  /** The records of each room, by the name of each collection, in the sequence of the surveys. */
  readonly rooms: readonly FormRecords[];
  /** This value is true when the records have data of the add-on that its form does not keep. */
  readonly more: boolean;
}

/** The bridge of an add-on: the change between the records of its form and the fields of a survey record and of a level record. */
export interface AddOnBridge {
  /** This function gives the records of the form from survey records and from their level record. A survey with no level has `undefined`. */
  read(surveys: readonly Survey[], level: Level | undefined, system: FormSystem): BridgeRecords;
  /** This function adds the records of a room to its survey record. With `listed`, the survey also lists the records of the lists. */
  survey(survey: Survey, records: FormRecords, listed: boolean): Survey;
  /** This function adds the records of the lists to a level record. */
  level(level: Level, records: FormRecords): Level;
}

/** The texts of the page for one list of an add-on. The page has a usual text for each text that the add-on does not give. */
export interface ListTexts {
  /** The sentences below the title of the list. They tell a person what a record of the list is. */
  readonly aid?: string | undefined;
  /** The text of the button that adds a record to the list. */
  readonly add?: string | undefined;
}

/**
 * An add-on of the page: the form of its layer, its texts for the page and its bridge.
 * The form gives the fields of each record. The texts are the part of the add-on in this page, because a form has no sentences of help.
 */
export interface PageAddOn {
  readonly form: LayerForm;
  /** The bridge of the add-on, when a survey record has fields of the add-on. */
  readonly bridge?: AddOnBridge | undefined;
  /**
   * The fields that the page does not show, by the name of their collection.
   * This list is a shortcut. A field is here when a survey record has no field for it, so a file does not keep its value.
   * The shortcut goes away with the bridge.
   */
  readonly hidden?: Readonly<Record<string, readonly string[]>> | undefined;
  /** The texts of the lists of the add-on, by the name of their collection. */
  readonly lists?: Readonly<Record<string, ListTexts>> | undefined;
  /** The steps of the add-on at the end of the help of the page. */
  readonly steps?: readonly string[] | undefined;
  /** This function gives a sentence about a record of a list, from the values that its form reads. No sentence gives `undefined`. */
  readonly note?: ((collection: string, values: Readonly<Record<string, FormValue>>) => string | undefined) | undefined;
}
