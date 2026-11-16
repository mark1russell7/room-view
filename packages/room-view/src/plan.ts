import { transformPoint3, type Ring } from "@mark1russell7/layout-contract";
import type { Scene } from "./room.ts";
import { sceneSolids, type Solid, type SolidKind, type SolidOptions } from "./solids.ts";

/** The outline of one solid in the plan of a room: the solid as a camera above the room sees it. */
export interface PlanShape {
  /** The `id` of the solid. */
  readonly solid: string;
  readonly kind: SolidKind;
  /** The `id` of the record that the solid comes from. */
  readonly source: string;
  /** The outline in the plan, in meters. */
  readonly ring: Ring;
  /** The height of the bottom of the solid above the floor, in meters. */
  readonly bottom: number;
  /** The height of the top of the solid above the floor, in meters. */
  readonly top: number;
}

/**
 * This function gives the outline of a solid in the plan.
 * Each box of a model stands on its bottom face, so the outline of a box is that face.
 */
export function planShape(solid: Solid): PlanShape {
  const { id, kind, source, shape } = solid;
  if (shape.kind === "prism") return { solid: id, kind, source, ring: shape.ring, bottom: shape.z, top: shape.z + shape.d };
  const { box, transform } = shape;
  const face = [
    { x: box.x, y: box.y, z: box.z },
    { x: box.x + box.w, y: box.y, z: box.z },
    { x: box.x + box.w, y: box.y + box.h, z: box.z },
    { x: box.x, y: box.y + box.h, z: box.z },
  ].map((corner) => transformPoint3(transform, corner));
  const bottom = face[0]!.z;
  const top = transformPoint3(transform, { x: box.x, y: box.y, z: box.z + box.d }).z;
  return { solid: id, kind, source, ring: face.map((corner) => [corner.x, corner.y] as const), bottom: Math.min(bottom, top), top: Math.max(bottom, top) };
}

/** The options of a plan. */
export interface PlanOptions extends SolidOptions {
  /**
   * The height of the cut of the plan above the floor, in meters. The plan has only the solids with a bottom below the cut.
   * Thus a cut below the top of a door shows the door as a gap in its wall. Without a cut, the plan has each solid.
   */
  readonly cut?: number | undefined;
}

/**
 * This function gives the plan of a scene: the outline of each solid of its model.
 * The sequence goes from the solid with the lowest top to the solid with the highest top.
 * Thus a drawing in this sequence shows the room as a camera above it sees the room.
 */
export function planShapes(scene: Scene, options: PlanOptions = {}): readonly PlanShape[] {
  const cut = options.cut ?? Infinity;
  return sceneSolids(scene, options)
    .map((solid) => planShape(solid))
    .filter((shape) => shape.bottom < cut)
    .map((shape, index) => ({ shape, index }))
    .sort((a, b) => a.shape.top - b.shape.top || a.index - b.index)
    .map(({ shape }) => shape);
}
