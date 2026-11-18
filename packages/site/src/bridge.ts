import type { FormRecords, FormSystem, LayerForm, Level, Survey } from "@mark1russell7/room-view";

// The bridge of an add-on of the page "Measure a room".
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

/** An add-on of the page: the form of its layer, and its bridge when a survey record has fields of the add-on. */
export interface PageAddOn {
  readonly form: LayerForm;
  readonly bridge?: AddOnBridge | undefined;
}
