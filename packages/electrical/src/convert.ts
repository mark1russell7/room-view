import type { WallFace } from "@mark1russell7/room-view";
import { ELECTRICAL_SCHEMA, type Circuit, type ElectricalLayer, type Feed, type Outlet } from "./layer.ts";

// The way from the electrical records of a `scene/1` to an electrical layer.

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
  const used = new Set<string>();
  const take = (id: string, prefix: string): string => {
    const base = used.has(id) ? `${prefix}-${id}` : id;
    let found = base;
    for (let copy = 2; used.has(found); copy += 1) found = `${base}-${copy}`;
    used.add(found);
    return found;
  };

  // The outlets come first, so each outlet keeps its `id`: a mark and a selection name an outlet.
  const outletIds = new Map<string, string>();
  const outletIdOf = (old: { readonly id: string }): string => {
    const id = take(old.id, "outlet");
    if (!outletIds.has(old.id)) outletIds.set(old.id, id);
    return id;
  };
  const oldOutlets = (scene.room.outlets ?? []).map((old) => ({ old, id: outletIdOf(old) }));

  const circuitIds = new Map<string, string>();
  const circuits = (scene.room.circuits ?? []).map((old): Circuit => {
    const id = take(old.id, "circuit");
    const first = !circuitIds.has(old.id);
    if (first) circuitIds.set(old.id, id);
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
