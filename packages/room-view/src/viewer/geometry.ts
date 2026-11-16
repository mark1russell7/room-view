import { transformPoint3, type Point3, type Rotation3 } from "@mark1russell7/layout-contract";
import { BoxGeometry, ExtrudeGeometry, Shape, Vector2, type BufferGeometry } from "three";
import type { Solid } from "../solids.ts";

/**
 * The three.js geometry of a solid, and its place in the room.
 * The origin of the geometry is the center of the solid. Thus three.js puts clear solids in the correct sequence.
 */
export interface SolidPlacement {
  /** The geometry, in meters, around its own origin. The caller disposes it. */
  readonly geometry: BufferGeometry;
  /** The position of the origin of the geometry in the room, where the z axis points up. */
  readonly position: Point3;
  /** The rotation of the geometry in the room. */
  readonly rotation: Rotation3;
}

/** The rotation that changes no direction. */
const NO_ROTATION: Rotation3 = { x: 0, y: 0, z: 0, w: 1 };

/**
 * This function gives the three.js geometry of a solid, with its place in the room.
 *
 * A mesh with this geometry, this position and this rotation is in the space of the room: the z axis points up.
 * Put the mesh in a group with the rotation of `TO_Y_UP`. Then three.js shows it with the y axis up.
 */
export function solidGeometry(solid: Solid): SolidPlacement {
  const shape = solid.shape;
  if (shape.kind === "box") {
    const { box, transform } = shape;
    const center = { x: box.x + box.w / 2, y: box.y + box.h / 2, z: box.z + box.d / 2 };
    return { geometry: new BoxGeometry(box.w, box.h, box.d), position: transformPoint3(transform, center), rotation: transform.rotation };
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, y] of shape.ring) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const outline = new Shape(shape.ring.map(([x, y]) => new Vector2(x - centerX, y - centerY)));
  const geometry = new ExtrudeGeometry(outline, { depth: shape.d, bevelEnabled: false, steps: 1, curveSegments: 1 });
  geometry.translate(0, 0, 0 - shape.d / 2);
  return { geometry, position: { x: centerX, y: centerY, z: shape.z + shape.d / 2 }, rotation: NO_ROTATION };
}
