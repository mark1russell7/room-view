import type { Point3 } from "@mark1russell7/layout-contract";
import { CircleGeometry, Group, Mesh, MeshBasicMaterial, RingGeometry, type BufferGeometry } from "three";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import { levelShape, SHAPE_OUTLINES, type LevelShape, type LoadLevel } from "../loads.ts";

/**
 * The marker of an outlet: a flat sign that looks at the camera and keeps its size in the picture.
 * The plate of an outlet is too small for a person to find it in a room, so each outlet has a marker.
 */
export interface OutletMarker {
  /** The group of the marker, at the center of the plate of the outlet, in the space of the viewer. */
  readonly root: Group;
  /** The line around the sign. The pointer selects the marker by this mesh, because it is the larger mesh. */
  readonly back: Mesh<BufferGeometry, MeshBasicMaterial>;
  /** The sign: its shape and its color tell the level of the circuit of the outlet. */
  readonly front: Mesh<BufferGeometry, MeshBasicMaterial>;
  readonly shape: LevelShape;
  /** The radius of the sign in the picture, in CSS pixels. The viewer changes it. */
  radius: number;
  /** This value is true while a solid is between the camera and the outlet. The viewer changes it. */
  hidden: boolean;
}

/** A link from an outlet to a placed object that takes its power from the outlet. */
export interface PowerLink {
  /** The name of the record of the outlet. */
  readonly outlet: string;
  /** The name of the record of the placed object. */
  readonly object: string;
  /** The level of the circuit of the outlet. */
  readonly level: LoadLevel | undefined;
  readonly line: LineSegments2;
}

/** The radius of the sign of a marker with no mark, in CSS pixels. */
export const MARKER_RADIUS = 7;

/** The width of the line around a sign, as a part of the radius of the disc. */
const HALO_WIDTH = 0.36;

/** The three.js objects of a marker and of a link are above the solids in the sequence of the drawing. */
const LINK_ORDER = 9;
const MARKER_ORDER = 10;

/**
 * This function gives the factor between a sign and the line around it.
 * The line has the same width around each shape, so a shape with a small circle in it gets a larger factor.
 */
export function haloScale(shape: LevelShape): number {
  const { radius, sides } = SHAPE_OUTLINES[shape];
  return 1 + HALO_WIDTH / (radius * Math.cos(Math.PI / sides));
}

/** This function makes the geometry of the outline of a shape, in the plane of x and y, with its center at the origin. */
function outlineGeometry(shape: LevelShape): BufferGeometry {
  const { radius, sides, start } = SHAPE_OUTLINES[shape];
  return new CircleGeometry(radius, sides, start);
}

/** This function makes the geometry of the sign of a shape. A sign with a hole is a ring, and each other sign is its outline. */
function signGeometry(shape: LevelShape): BufferGeometry {
  const { radius, sides, start, hole } = SHAPE_OUTLINES[shape];
  return hole > 0 ? new RingGeometry(hole, radius, sides, 1, start) : outlineGeometry(shape);
}

/** This function makes a material that the solids do not hide. */
function overlayMaterial(): MeshBasicMaterial {
  return new MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false });
}

/**
 * This function makes the marker of an outlet at a point of the space of the viewer.
 * The marker has no colors until `paintPart` gives them, and the viewer gives it its size and its turn for each picture.
 */
export function makeMarker(at: Point3, level: LoadLevel | undefined): OutletMarker {
  const shape = levelShape(level);
  const root = new Group();
  root.position.set(at.x, at.y, at.z);
  const back = new Mesh(outlineGeometry(shape), overlayMaterial());
  back.scale.setScalar(haloScale(shape));
  const front = new Mesh(signGeometry(shape), overlayMaterial());
  // The line is before the sign in the group. Thus two objects at one distance draw in this sequence.
  back.renderOrder = MARKER_ORDER;
  front.renderOrder = MARKER_ORDER;
  root.add(back, front);
  return { root, back, front, shape, radius: MARKER_RADIUS, hidden: false };
}

/** This function makes the line of a link between two points of the space of the viewer. The line shows only when the viewer says so. */
export function makeLink(outlet: string, object: string, level: LoadLevel | undefined, from: Point3, to: Point3): PowerLink {
  const geometry = new LineSegmentsGeometry().setPositions([from.x, from.y, from.z, to.x, to.y, to.z]);
  const material = new LineMaterial({ linewidth: 2, dashed: true, dashSize: 0.09, gapSize: 0.06, transparent: true, depthTest: false, depthWrite: false });
  const line = new LineSegments2(geometry, material);
  line.computeLineDistances();
  line.renderOrder = LINK_ORDER;
  line.visible = false;
  return { outlet, object, level, line };
}

/** This function releases the memory of the graphics card that a marker uses. */
export function disposeMarker(marker: OutletMarker): void {
  marker.back.geometry.dispose();
  marker.back.material.dispose();
  marker.front.geometry.dispose();
  marker.front.material.dispose();
  marker.root.clear();
}

/** This function releases the memory of the graphics card that a link uses. */
export function disposeLink(link: PowerLink): void {
  link.line.geometry.dispose();
  link.line.material.dispose();
}
