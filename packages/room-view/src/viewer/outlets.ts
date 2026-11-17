import { addPoints3, scalePoint3, type Point3 } from "@mark1russell7/layout-contract";
import type { LinkMark, Mark, PointMark } from "@mark1russell7/visuals/marks";
import { sceneSpace } from "../anchors.ts";
import { recordName } from "../check.ts";
import { outletLevels, type LoadOptions } from "../loads.ts";
import type { Scene } from "../room.ts";
import { OUTLET_PLATE, solidCorners, type Solid } from "../solids.ts";

/** This function gives the center of a solid, in the space of the scene: the mean of its corners. */
function centerOf(solid: Solid): Point3 {
  const corners = solidCorners(solid);
  const sum = corners.reduce((total, corner) => addPoints3(total, corner), { x: 0, y: 0, z: 0 });
  return scalePoint3(sum, 1 / Math.max(corners.length, 1));
}

/**
 * This function gives the marks of the outlets of a scene, in the space of the scene: meters, with the z axis up.
 *
 * - An outlet gives a point on the front of its plate. Its level is the level of its circuit, and `unknown` for no circuit of the room.
 * - A placed object with an outlet gives a link from that outlet to the center of the object.
 *
 * The record name of a point is the name of the record of its outlet, so the sign and the plate are one record.
 * The record name of a link is the name of the record of its object: that record has the outlet.
 * `solids` are the solids of the scene. An outlet or an object with no solid gives no mark. The first record of an `id` gives the mark.
 */
export function outletMarks(scene: Scene, solids: readonly Solid[], loads: LoadOptions = {}): readonly Mark[] {
  const space = sceneSpace(scene);
  const levels = outletLevels(scene, loads);
  /** The first solid of each outlet and of each placed object, by the name of its record. */
  const made = new Map<string, Solid>();
  for (const solid of solids) {
    const name = recordName(solid.kind, solid.source);
    if ((solid.kind === "outlet" || solid.kind === "object") && !made.has(name)) made.set(name, solid);
  }
  const circuits = new Map((scene.room.circuits ?? []).map((circuit) => [circuit.id, circuit.name ?? circuit.id] as const));
  const marks: Mark[] = [];

  const fronts = new Map<string, Point3>();
  for (const outlet of scene.room.outlets ?? []) {
    if (fronts.has(outlet.id) || !made.has(recordName("outlet", outlet.id))) continue;
    const frame = space.frame({ on: "wall", wall: outlet.wall, face: outlet.face, offset: outlet.offset, height: outlet.height });
    if (frame === undefined) continue;
    // The plate is on the face of the wall, so its front is one depth of the plate out of the wall.
    const front = addPoints3(frame.at, scalePoint3(frame.out, OUTLET_PLATE.depth));
    fronts.set(outlet.id, front);
    const level = levels.get(outlet.id);
    const circuit = level === undefined || outlet.circuit === undefined ? "" : `, circuit ${circuits.get(outlet.circuit) ?? outlet.circuit}`;
    const point: PointMark = {
      type: "point",
      record: recordName("outlet", outlet.id),
      kind: "outlet",
      level: level ?? "unknown",
      label: `Outlet ${outlet.id}${circuit}`.replace(/\s+/g, " ").trim(),
      frame: { at: front, out: frame.out },
    };
    marks.push(point);
  }

  const linked = new Set<string>();
  for (const object of scene.objects ?? []) {
    const from = object.outlet === undefined ? undefined : fronts.get(object.outlet);
    const solid = made.get(recordName("object", object.id));
    if (object.outlet === undefined || from === undefined || solid === undefined || linked.has(object.id)) continue;
    linked.add(object.id);
    const link: LinkMark = {
      type: "link",
      record: recordName("object", object.id),
      kind: "feed",
      level: levels.get(object.outlet) ?? "unknown",
      label: `Outlet ${object.outlet} to ${object.name ?? object.id}`.replace(/\s+/g, " ").trim(),
      from: { record: recordName("outlet", object.outlet), at: from },
      to: { record: recordName("object", object.id), at: centerOf(solid) },
    };
    marks.push(link);
  }
  return marks;
}
