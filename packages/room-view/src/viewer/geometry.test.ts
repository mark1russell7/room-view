import { Quaternion, Vector3, type BufferGeometry } from "three";
import { describe, expect, it } from "vitest";
import type { Scene } from "../room.ts";
import { SAMPLE_SCENE } from "../sample.ts";
import { sceneSolids, solidCorners, solidVolume, type Solid } from "../solids.ts";
import { solidGeometry } from "./geometry.ts";

/** A scene in feet with a wall that is not along an axis, and objects with turns that are not right angles. */
const TURNED_SCENE: Scene = {
  schema: "scene/2",
  room: {
    schema: "room/2",
    unit: "ft",
    height: 8,
    wallThickness: 0.5,
    walls: [
      { id: "a", from: [0, 0], to: [8, 6] },
      { id: "b", from: [8, 6], to: [8, 14], side: "left" },
    ],
    openings: [{ id: "w", wall: "a", kind: "window", offset: 3, width: 3, sill: 3, height: 4 }],
    floors: [
      {
        id: "f",
        ring: [
          [0, 0],
          [8, 6],
          [8, 14],
          [0, 14],
        ],
      },
    ],
  },
  objects: [
    { id: "box", kind: "box", size: [2, 1, 3], at: [3, 9], turn: 30 },
    { id: "top", kind: "box", size: [1, 0.5, 1], at: [0.2, 0.1], lift: 3, turn: 45, parent: "box" },
  ],
};

/** This function gives each vertex of the geometry of a solid, in the room. */
function vertices(solid: Solid): readonly Vector3[] {
  const { geometry, position, rotation } = solidGeometry(solid);
  const points = geometry.getAttribute("position");
  const turn = new Quaternion(rotation.x, rotation.y, rotation.z, rotation.w);
  const origin = new Vector3(position.x, position.y, position.z);
  const found: Vector3[] = [];
  for (let n = 0; n < points.count; n += 1) found.push(new Vector3().fromBufferAttribute(points, n).applyQuaternion(turn).add(origin));
  geometry.dispose();
  return found;
}

/** This function gives the volume of a closed mesh from its triangles. A mesh with faces that point in has a negative volume. */
function meshVolume(geometry: BufferGeometry): number {
  const points = geometry.getAttribute("position");
  const index = geometry.getIndex();
  const count = index === null ? points.count : index.count;
  const at = (n: number): Vector3 => new Vector3().fromBufferAttribute(points, index === null ? n : index.getX(n));
  let volume = 0;
  for (let n = 0; n < count; n += 3) volume += at(n).dot(at(n + 1).cross(at(n + 2))) / 6;
  return volume;
}

describe.each([
  ["the sample scene", SAMPLE_SCENE],
  ["a scene with turns", TURNED_SCENE],
])("solidGeometry of %s", (_name, scene) => {
  const solids = sceneSolids(scene);

  it("has a solid of each kind", () => {
    expect(new Set(solids.map((solid) => solid.kind))).toEqual(new Set(["floor", "wall", "glass", "object"]));
  });

  it("has its vertices at the corners of the solid", () => {
    for (const solid of solids) {
      const corners = solidCorners(solid).map((corner) => new Vector3(corner.x, corner.y, corner.z));
      const found = vertices(solid);
      const far = (point: Vector3, others: readonly Vector3[]): number => Math.min(...others.map((other) => other.distanceTo(point)));
      expect(Math.max(...found.map((vertex) => far(vertex, corners))), `a vertex of ${solid.id}`).toBeLessThan(1e-5);
      expect(Math.max(...corners.map((corner) => far(corner, found))), `a corner of ${solid.id}`).toBeLessThan(1e-5);
    }
  });

  it("is a closed mesh with faces that point out, and with the volume of the solid", () => {
    for (const solid of solids) {
      const { geometry } = solidGeometry(solid);
      const volume = solidVolume(solid);
      expect(volume, solid.id).toBeGreaterThan(0);
      expect(meshVolume(geometry) / volume, solid.id).toBeCloseTo(1, 4);
      geometry.dispose();
    }
  });

  it("is around the center of the solid", () => {
    for (const solid of solids) {
      const { geometry } = solidGeometry(solid);
      geometry.computeBoundingBox();
      const center = geometry.boundingBox!.getCenter(new Vector3());
      expect(center.length(), solid.id).toBeLessThan(1e-6);
      geometry.dispose();
    }
  });
});
