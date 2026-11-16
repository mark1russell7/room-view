import type { Point3 } from "@mark1russell7/layout-contract";

/**
 * The direction of a view: where the camera is, as seen from the point that it looks at.
 * The viewer has the y axis up. The x axis is the x axis of the plan, and the negative z axis is the y axis of the plan.
 */
export interface ViewAngles {
  /** The angle from the up axis to the camera, in radians. At 0, the camera looks down from above. */
  readonly polar: number;
  /** The angle around the up axis, in radians. At 0, the camera is south of the room and it looks north. */
  readonly azimuth: number;
}

/** The view of a dollhouse: from the south-east, 38 degrees above the floor. */
export const HOME_VIEW: ViewAngles = { polar: (52 * Math.PI) / 180, azimuth: (35 * Math.PI) / 180 };

/** The view of a plan: from above, with north at the top. */
export const TOP_VIEW: ViewAngles = { polar: 0, azimuth: 0 };

/** The three axes of a camera, as unit vectors in the space of the viewer. */
export interface ViewAxes {
  /** The vector from the point that the camera looks at to the camera. */
  readonly back: Point3;
  /** The vector to the right side of the picture. */
  readonly right: Point3;
  /** The vector to the top of the picture. */
  readonly up: Point3;
}

/** This function gives a point of the room in the space of the viewer: the z axis of the room becomes the y axis. */
export function toViewer(point: Point3): Point3 {
  return { x: point.x, y: point.z, z: 0 - point.y };
}

/** This function gives a point of the viewer in the space of the room: the y axis of the viewer becomes the z axis. */
export function toRoom(point: Point3): Point3 {
  return { x: point.x, y: 0 - point.z, z: point.y };
}

/** This function gives the axes of the camera of a view. At a polar angle of 0, the top of the picture is north. */
export function viewAxes(view: ViewAngles): ViewAxes {
  const sinPolar = Math.sin(view.polar);
  const cosPolar = Math.cos(view.polar);
  const sinAzimuth = Math.sin(view.azimuth);
  const cosAzimuth = Math.cos(view.azimuth);
  return {
    back: { x: sinPolar * sinAzimuth, y: cosPolar, z: sinPolar * cosAzimuth },
    right: { x: cosAzimuth, y: 0, z: 0 - sinAzimuth },
    up: { x: 0 - cosPolar * sinAzimuth, y: sinPolar, z: 0 - cosPolar * cosAzimuth },
  };
}

/** This function gives the dot product of the vector from `origin` to `point` with `axis`. */
function along(point: Point3, origin: Point3, axis: Point3): number {
  return (point.x - origin.x) * axis.x + (point.y - origin.y) * axis.y + (point.z - origin.z) * axis.z;
}

/**
 * This function gives the smallest distance from `target` at which a camera shows each point.
 *
 * The camera looks at `target` along the direction of `view`. `fov` is the vertical angle of the picture in degrees,
 * and `aspect` is the width of the picture divided by its height. The points and the target are in the space of the viewer.
 * The function gives 0 for no points, and for an angle or an aspect that makes no picture.
 */
export function fitDistance(points: readonly Point3[], target: Point3, view: ViewAngles, fov: number, aspect: number): number {
  const tanUp = Math.tan((fov * Math.PI) / 360);
  const tanRight = tanUp * aspect;
  if (!(tanUp > 0) || !(tanRight > 0) || !Number.isFinite(tanRight)) return 0;
  const axes = viewAxes(view);
  let distance = 0;
  for (const point of points) {
    const depth = along(point, target, axes.back);
    const needed = Math.max(Math.abs(along(point, target, axes.right)) / tanRight, Math.abs(along(point, target, axes.up)) / tanUp);
    distance = Math.max(distance, depth + needed);
  }
  return distance;
}

/** This function gives the position of a camera at a distance from `target`, in the direction of `view`. */
export function cameraPosition(target: Point3, view: ViewAngles, distance: number): Point3 {
  const { back } = viewAxes(view);
  return { x: target.x + back.x * distance, y: target.y + back.y * distance, z: target.z + back.z * distance };
}

/** This function gives the angles of the view from `target` to a camera, and the distance between them. A camera at the target gives the angles 0. */
export function viewOf(camera: Point3, target: Point3): ViewAngles & { readonly distance: number } {
  const x = camera.x - target.x;
  const y = camera.y - target.y;
  const z = camera.z - target.z;
  const distance = Math.hypot(x, y, z);
  if (!(distance > 0)) return { polar: 0, azimuth: 0, distance: 0 };
  return { polar: Math.acos(Math.min(Math.max(y / distance, -1), 1)), azimuth: Math.atan2(x, z), distance };
}

/** This function gives the angle between two azimuths along the shortest way, from −π to π. */
export function turnBetween(from: number, to: number): number {
  const full = 2 * Math.PI;
  const turn = (((to - from) % full) + full) % full;
  return turn > Math.PI ? turn - full : turn;
}
