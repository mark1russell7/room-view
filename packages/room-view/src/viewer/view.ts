import type { Point3 } from "@mark1russell7/layout-contract";
import type { ViewAngles } from "@mark1russell7/visuals";

// The space of the viewer has the y axis up. The x axis is the x axis of the plan, and the negative z axis is the y axis of the plan.
// At an azimuth of 0, the camera is south of the room and it looks north. At a polar angle of 0, it looks down from above.

/** The view of a dollhouse: from the south-east, 38 degrees above the floor. */
export const HOME_VIEW: ViewAngles = { polar: (52 * Math.PI) / 180, azimuth: (35 * Math.PI) / 180 };

/** The view of a plan: from above, with north at the top. */
export const TOP_VIEW: ViewAngles = { polar: 0, azimuth: 0 };

/** This function gives a point of the room in the space of the viewer: the z axis of the room becomes the y axis. */
export function toViewer(point: Point3): Point3 {
  return { x: point.x, y: point.z, z: 0 - point.y };
}

/** This function gives a point of the viewer in the space of the room: the y axis of the viewer becomes the z axis. */
export function toRoom(point: Point3): Point3 {
  return { x: point.x, y: 0 - point.z, z: point.y };
}
