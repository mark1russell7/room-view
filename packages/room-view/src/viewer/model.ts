import type { Point3 } from "@mark1russell7/layout-contract";
import { Color, EdgesGeometry, Group, Mesh, MeshLambertMaterial, type BufferGeometry, type Material } from "three";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import type { Scene } from "../room.ts";
import { boundsOfSolids, sceneSolids, solidCorners, TO_Y_UP, type Solid, type SolidKind, type SolidOptions } from "../solids.ts";
import { metersPer } from "../units.ts";
import { wallShades, type WallShade } from "./fade.ts";
import { solidGeometry } from "./geometry.ts";
import type { ViewerTheme } from "./theme.ts";
import { toViewer } from "./view.ts";

/** The mark of a part: 0 for no mark, 1 for a part under the pointer, 2 for a selected part. */
export type PartMark = 0 | 1 | 2;

/** One solid of the model as three.js objects. */
export interface ModelPart {
  readonly solid: Solid;
  /** The name of the record of the solid: its kind and its source. Each part of one wall has the same name. */
  readonly record: string;
  /** The `id` of the wall that the part fades with: the wall itself, the wall of a window or the wall of an outlet. */
  readonly wall: string | undefined;
  /** The name of the record of the object that this object is in or on. */
  readonly holder: string | undefined;
  /** This value is true for an object with other objects in it. Such an object shows as a clear box. */
  readonly holds: boolean;
  readonly mesh: Mesh<BufferGeometry, MeshLambertMaterial>;
  readonly lines: LineSegments2;
  /** The fade of the part, from 0 for a solid part to 1 for a part that hides the room. The viewer changes it. */
  fade: number;
}

/** The model of a scene as three.js objects. */
export interface RoomModel {
  /** The group of each part. It has the rotation from the room to the space of the viewer. */
  readonly group: Group;
  readonly parts: readonly ModelPart[];
  /** Each corner of each solid, in the space of the viewer. */
  readonly corners: readonly Point3[];
  /** The center of the model, in the space of the viewer. */
  readonly center: Point3;
  /** The walls of the room, each with the side that looks at the room. */
  readonly shades: readonly WallShade[];
}

/** This function gives the name of a record of a kind. */
export function recordName(kind: SolidKind, source: string): string {
  return `${kind}:${source}`;
}

/** The width of the edges of each kind of solid, in CSS pixels. */
const EDGE_WIDTH: Readonly<Record<SolidKind, number>> = { floor: 1.25, wall: 1.25, glass: 1, outlet: 1, object: 1.25 };

/** The part of a clear box of objects that is not clear. */
const HOLDER_OPACITY = 0.14;

/** A part with an opacity above this value writes its depth, as a solid part does. */
const SOLID_OPACITY = 0.999;

/** This function gives the `id` of each placed object that has an object in its box. */
function holders(scene: Scene): ReadonlySet<string> {
  const scale = metersPer(scene.room.unit);
  const objects = new Map((scene.objects ?? []).map((object) => [object.id, object] as const));
  const found = new Set<string>();
  for (const object of scene.objects ?? []) {
    const parent = object.parent === undefined ? undefined : objects.get(object.parent);
    if (parent === undefined) continue;
    const x = object.at[0] * scale;
    const y = object.at[1] * scale;
    const z = ((object.lift ?? 0) + object.size[2] / 2) * scale;
    const [w, h, d] = [parent.size[0] * scale, parent.size[1] * scale, parent.size[2] * scale];
    if (Math.abs(x) < w / 2 && Math.abs(y) < h / 2 && z > 0 && z < d) found.add(parent.id);
  }
  return found;
}

/**
 * This function makes the three.js objects of a scene: one mesh with its edges for each solid.
 * The parts have no colors until `paintPart` gives them. The caller disposes the model with `disposeModel`.
 */
export function buildModel(scene: Scene, options: SolidOptions = {}): RoomModel {
  const solids = sceneSolids(scene, options);
  const wallOfOpening = new Map((scene.room.openings ?? []).map((opening) => [opening.id, opening.wall] as const));
  const wallOfOutlet = new Map((scene.room.outlets ?? []).map((outlet) => [outlet.id, outlet.wall] as const));
  const parentOf = new Map((scene.objects ?? []).map((object) => [object.id, object.parent] as const));
  const holding = holders(scene);
  const group = new Group();
  group.quaternion.set(TO_Y_UP.rotation.x, TO_Y_UP.rotation.y, TO_Y_UP.rotation.z, TO_Y_UP.rotation.w);
  const parts = solids.map((solid): ModelPart => {
    const { geometry, position, rotation } = solidGeometry(solid);
    const mesh = new Mesh(geometry, new MeshLambertMaterial({ polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }));
    mesh.position.set(position.x, position.y, position.z);
    mesh.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
    const edges = new EdgesGeometry(geometry, 30);
    const lines = new LineSegments2(new LineSegmentsGeometry().fromEdgesGeometry(edges), new LineMaterial({ linewidth: EDGE_WIDTH[solid.kind] }));
    edges.dispose();
    mesh.add(lines);
    group.add(mesh);
    const parent = solid.kind === "object" ? parentOf.get(solid.source) : undefined;
    return {
      solid,
      record: recordName(solid.kind, solid.source),
      wall: solid.kind === "wall" ? solid.source : solid.kind === "glass" ? wallOfOpening.get(solid.source) : solid.kind === "outlet" ? wallOfOutlet.get(solid.source) : undefined,
      holder: parent === undefined ? undefined : recordName("object", parent),
      holds: solid.kind === "object" && holding.has(solid.source),
      mesh,
      lines,
      fade: 0,
    };
  });
  const bounds = boundsOfSolids(solids);
  const middle = bounds === undefined ? { x: 0, y: 0, z: 0 } : { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2, z: bounds.z + bounds.d / 2 };
  return {
    group,
    parts,
    corners: solids.flatMap((solid) => solidCorners(solid).map((corner) => toViewer(corner))),
    center: toViewer(middle),
    shades: wallShades(scene.room, bounds === undefined ? undefined : middle),
  };
}

/** This function sets the opacity of a material. A material that is not solid does not write its depth. */
function setOpacity(material: Material, opacity: number): void {
  const clear = opacity < SOLID_OPACITY;
  if (material.transparent !== clear) {
    material.transparent = clear;
    material.depthWrite = !clear;
    material.needsUpdate = true;
  }
  material.opacity = opacity;
}

/** This function gives the color of a part in a theme, before a mark. */
function baseColor(part: ModelPart, scene: Scene, theme: ViewerTheme): string {
  const kind = part.solid.kind;
  if (kind !== "object") return theme[kind];
  const object = (scene.objects ?? []).find((candidate) => candidate.id === part.solid.source);
  return (object === undefined ? undefined : theme.objects[object.kind]) ?? theme.object;
}

/**
 * This function gives a part its colors: the colors of the theme, the fade of the part and its mark.
 * A marked part has some of the color `accent` of the theme, and a selected part has wide edges.
 */
export function paintPart(part: ModelPart, scene: Scene, theme: ViewerTheme, mark: PartMark): void {
  const kind = part.solid.kind;
  const fill = part.mesh.material;
  const ink = part.lines.material;
  fill.color.set(baseColor(part, scene, theme));
  if (mark !== 0) fill.color.lerp(new Color(theme.accent), mark === 2 ? 0.55 : 0.3);
  ink.color.set(theme.edge);
  ink.linewidth = EDGE_WIDTH[kind] * (mark === 2 ? 2 : 1);
  const still = 1 - part.fade;
  let opacity = kind === "glass" ? theme.glassOpacity : part.holds ? (mark === 0 ? HOLDER_OPACITY : 0.45) : 1;
  let edge = 1;
  if (kind === "wall") {
    opacity *= 0.08 + 0.92 * still;
    edge = 0.3 + 0.7 * still;
  } else if (kind === "glass" || kind === "outlet") {
    opacity *= 0.35 + 0.65 * still;
    edge = 0.35 + 0.65 * still;
  }
  setOpacity(fill, opacity);
  setOpacity(ink, edge);
  // An outlet is small in a room. A marked outlet is larger, so that a person can find it.
  part.mesh.scale.setScalar(kind === "outlet" && mark !== 0 ? 2.6 : 1);
}

/** This function releases the memory of the graphics card that a model uses. */
export function disposeModel(model: RoomModel): void {
  for (const part of model.parts) {
    part.mesh.geometry.dispose();
    part.mesh.material.dispose();
    part.lines.geometry.dispose();
    part.lines.material.dispose();
  }
  model.group.clear();
}
