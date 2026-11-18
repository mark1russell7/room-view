import type { WallFace } from "@mark1russell7/room-view";
import { ELECTRICAL_SCHEMA, type Circuit, type ElectricalLayer, type Feed, type Outlet } from "./layer.ts";

// The way from the old electrical records of the core to an electrical layer: the records of a `scene/1`, of a `survey/1` and of a `level/1`.

/**
 * The electrical records of a `scene/1`: the outlets and the circuits of its room, the outlet of each object, and the loads.
 * A scene record of the core has this form.
 */
export interface SceneV1 {
  readonly room: {
    readonly outlets?:
      | readonly {
          readonly id: string;
          readonly wall: string;
          readonly face: WallFace;
          readonly offset: number;
          readonly height: number;
          readonly circuit?: string | undefined;
        }[]
      | undefined;
    readonly circuits?:
      | readonly {
          readonly id: string;
          readonly name?: string | undefined;
          readonly breaker?: number | undefined;
          readonly voltage?: number | undefined;
          readonly limit: number;
        }[]
      | undefined;
  };
  readonly objects?: readonly { readonly id: string; readonly outlet?: string | undefined }[] | undefined;
  readonly loads?: readonly { readonly circuit: string; readonly watts: number }[] | undefined;
}

/**
 * The electrical records of a `survey/1`: its outlets and its circuits, and the outlet of each object.
 * A survey record of the core has this form. An outlet of a survey is on the inner face of its side, so it has no `face`.
 */
export interface SurveyV1 {
  readonly outlets?:
    | readonly {
        readonly id: string;
        /** The `id` of the side of the outlet. */
        readonly wall: string;
        readonly offset: number;
        readonly height: number;
        readonly circuit?: string | undefined;
      }[]
    | undefined;
  readonly circuits?: SceneV1["room"]["circuits"];
  readonly objects?: SceneV1["objects"];
}

/** The electrical records of a `level/1`: the circuits of the level. A level record of the core has this form. */
export interface LevelV1 {
  readonly circuits?: SceneV1["room"]["circuits"];
}

/**
 * This function moves old electrical records to an electrical layer. `fromSceneV1` tells the rules.
 *
 * The ids of a layer are unique. The records of the kind `keeps` get their ids first.
 * Thus a record of that kind keeps its `id` when a record of the other kind has the same `id`.
 * The other record gets a new `id`: the word of its kind, a hyphen and its old `id`. Each record that names it follows.
 *
 * A second record of one kind with one `id` gets a new `id` in the same way. A record that names that `id` names the first one.
 */
function toLayer(scene: SceneV1, keeps: "outlets" | "circuits"): ElectricalLayer {
  const used = new Set<string>();
  const take = (id: string, prefix: string): string => {
    const base = used.has(id) ? `${prefix}-${id}` : id;
    let found = base;
    for (let copy = 2; used.has(found); copy += 1) found = `${base}-${copy}`;
    used.add(found);
    return found;
  };

  const outletIds = new Map<string, string>();
  const nameOutlets = () =>
    (scene.room.outlets ?? []).map((old) => {
      const id = take(old.id, "outlet");
      if (!outletIds.has(old.id)) outletIds.set(old.id, id);
      return { old, id };
    });
  const circuitIds = new Map<string, string>();
  const nameCircuits = () =>
    (scene.room.circuits ?? []).map((old) => {
      const id = take(old.id, "circuit");
      const first = !circuitIds.has(old.id);
      if (first) circuitIds.set(old.id, id);
      return { old, id, first };
    });
  const outletsFirst = keeps === "outlets" ? nameOutlets() : undefined;
  const oldCircuits = nameCircuits();
  const oldOutlets = outletsFirst ?? nameOutlets();

  const circuits = oldCircuits.map(({ old, id, first }): Circuit => {
    const loads = first ? (scene.loads ?? []).filter((load) => load.circuit === old.id) : [];
    return {
      id,
      ...(old.name === undefined ? {} : { name: old.name }),
      ...(old.breaker === undefined ? {} : { breaker: old.breaker }),
      ...(old.voltage === undefined ? {} : { voltage: old.voltage }),
      limit: old.limit,
      ...(loads.length === 0 ? {} : { otherLoad: loads.reduce((sum, load) => sum + load.watts, 0) }),
    };
  });

  const outlets = oldOutlets.map(
    ({ old, id }): Outlet => ({
      id,
      anchor: { on: "wall", wall: old.wall, face: old.face, offset: old.offset, height: old.height },
      ...(old.circuit === undefined ? {} : { circuit: circuitIds.get(old.circuit) ?? old.circuit }),
    }),
  );

  const feeds: Feed[] = [];
  for (const object of scene.objects ?? []) {
    if (object.outlet === undefined) continue;
    feeds.push({ id: take(`feed-${object.id}`, "feed"), object: object.id, outlet: outletIds.get(object.outlet) ?? object.outlet });
  }

  return {
    schema: ELECTRICAL_SCHEMA,
    ...(outlets.length === 0 ? {} : { outlets }),
    ...(circuits.length === 0 ? {} : { circuits }),
    ...(feeds.length === 0 ? {} : { feeds }),
  };
}

/**
 * This function moves the electrical records of a `scene/1` to an electrical layer.
 *
 * - An outlet keeps its `id`, and its place on the wall becomes a wall anchor.
 * - A circuit keeps its facts. The sum of its loads becomes its `otherLoad`.
 * - The outlet of an object becomes a feed with no watts, with the `id` `feed-` and the `id` of the object.
 *
 * The ids of a layer are unique. Thus a circuit with the `id` of an outlet gets the `id` `circuit-` and its old `id`, and each record that names it follows.
 * A load of a circuit that the room does not have has no place in a layer. `checkScene` of the core gives an error for it.
 */
export function fromSceneV1(scene: SceneV1): ElectricalLayer {
  // The outlets come first, so each outlet keeps its `id`: a mark and a selection name an outlet.
  return toLayer(scene, "outlets");
}

/** The face of the wall anchor of an outlet of a survey. A survey does not use it: `expandSurvey` gives the inner face of the side. */
const SURVEY_FACE: WallFace = "left";

/**
 * This function moves the electrical records of a `survey/1` to an electrical layer of the survey. It has the rules of `fromSceneV1`, with two changes.
 *
 * - An outlet names a side, and its wall anchor is on that side. `expandSurvey` puts the anchor on the inner face of the wall.
 * - A circuit keeps its `id`, because an outlet of a different room of a level can name it.
 *   Thus an outlet with the `id` of a circuit gets the `id` `outlet-` and its old `id`, and each feed that names it follows.
 *
 * The lengths stay in the unit of the survey.
 * Two circuits of one list with one `id` are a fault of the old record. The second one gets the `id` `circuit-` and its old `id`, so the layer keeps each record.
 */
export function fromSurveyV1(survey: SurveyV1): ElectricalLayer {
  const outlets = survey.outlets?.map((old) => ({ ...old, face: SURVEY_FACE }));
  return toLayer({ room: { outlets, circuits: survey.circuits }, objects: survey.objects }, "circuits");
}

/**
 * This function moves the circuits of a `level/1` to an electrical layer of the level record. Each circuit keeps its facts.
 * `fromSurveyV1` gives the layer of the survey of each room. Then the function `join` of the add-on makes one layer of them.
 * The circuit of the level record stays when a room has a circuit with the same `id`, as in the join of a `level/1`.
 */
export function fromLevelV1(level: LevelV1): ElectricalLayer {
  return toLayer({ room: { circuits: level.circuits } }, "circuits");
}
