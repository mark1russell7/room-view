import { addPoints3, scalePoint3, type Point3 } from "@mark1russell7/layout-contract";
import { cameraPosition, type Highlight } from "@mark1russell7/visuals";
import type { StageFrame } from "@mark1russell7/visuals/three";
import { PerspectiveCamera, Raycaster, Vector3, type Mesh, type MeshStandardMaterial } from "three";
import { describe, expect, it } from "vitest";
import { SAMPLE_SCENE } from "../sample.ts";
import { sceneSolids, solidCorners } from "../solids.ts";
import { createRoomContent, FADE_TIME, type RoomContent } from "./content.ts";
import { LIGHT_THEME } from "./theme.ts";
import { HOME_VIEW, toViewer } from "./view.ts";

const SOLIDS = sceneSolids(SAMPLE_SCENE);
const noHighlight = (): Highlight => 0;

/** This function gives the mean of the corners of a solid of the sample scene, in the space of the scene. */
function centerOf(id: string): Point3 {
  const solid = SOLIDS.find((candidate) => candidate.id === id);
  if (solid === undefined) throw new Error(`The scene has no solid ${id}.`);
  const corners = solidCorners(solid);
  return scalePoint3(
    corners.reduce((sum, corner) => addPoints3(sum, corner), { x: 0, y: 0, z: 0 }),
    1 / corners.length,
  );
}

/** This function makes the ray from a point of the scene in a direction of the scene. */
function rayFrom(from: Point3, direction: Point3): Raycaster {
  const start = toViewer(from);
  const along = toViewer(direction);
  const ray = new Raycaster();
  ray.set(new Vector3(start.x, start.y, start.z), new Vector3(along.x, along.y, along.z).normalize());
  return ray;
}

const DOWN: Point3 = { x: 0, y: 0, z: -1 };
const NORTH: Point3 = { x: 0, y: 1, z: 0 };

/** This function gives a frame of the stage with the camera of the first view: south-east of the sample room, above it. */
function homeFrame(seconds: number, settle: boolean): StageFrame {
  const camera = new PerspectiveCamera(32, 1, 0.1, 100);
  const eye = cameraPosition(toViewer({ x: 3, y: 2.5, z: 1.25 }), HOME_VIEW, 12);
  camera.position.set(eye.x, eye.y, eye.z);
  camera.updateMatrixWorld();
  return { camera, seconds, settle, height: 600, fieldOfView: 32 };
}

/** This function gives the part of the walls of a content that is not clear, as the smallest value of the meshes of a wall. */
function wallOpacity(content: RoomContent, wall: string): number {
  const group = content.objects[0];
  if (group === undefined) throw new Error("The content has no group.");
  const meshes = (group.children as Mesh[]).filter((_, index) => content.solids[index]?.kind === "wall" && content.solids[index]?.source === wall);
  return Math.min(...meshes.map((mesh) => (mesh.material as MeshStandardMaterial).opacity));
}

describe("createRoomContent", () => {
  it("has the solids of the scene", () => {
    const content = createRoomContent(SAMPLE_SCENE);
    expect(content.solids.map((solid) => solid.id)).toEqual(SOLIDS.map((solid) => solid.id));
    expect(content.objects.length).toBe(1);
    expect(content.objects[0]?.children.length).toBe(SOLIDS.length);
    content.dispose();
  });

  it("has the records of the solids, with the names of the root entry", () => {
    const content = createRoomContent(SAMPLE_SCENE);
    for (const record of ["floor:floor", "wall:south", "opening:window-east", "outlet:south-1", "object:desk", "object:node-3"]) expect(content.has(record), record).toBe(true);
    for (const record of ["glass:window-east", "opening:door", "wall:none", "electrical/1:south-1", ""]) expect(content.has(record), record).toBe(false);
    content.dispose();
  });

  it("gives the first solid of a record as a pick", () => {
    const content = createRoomContent(SAMPLE_SCENE);
    expect(content.pickOf("wall:south")).toEqual({ solid: "wall:south:0", kind: "wall", source: "south" });
    expect(content.pickOf("opening:window-east")).toEqual({ solid: "glass:window-east", kind: "glass", source: "window-east" });
    expect(content.pickOf("outlet:nook-2")).toEqual({ solid: "outlet:nook-2", kind: "outlet", source: "nook-2" });
    expect(content.pickOf("object:none")).toBeUndefined();
    content.dispose();
  });

  it("gives the space of the room to the stage, with the y axis up", () => {
    const content = createRoomContent(SAMPLE_SCENE);
    expect(content.extent.center.x).toBeCloseTo(3, 9);
    expect(content.extent.center.z).toBeCloseTo(-2.5, 9);
    expect(Math.max(...content.extent.corners.map((corner) => corner.y))).toBeCloseTo(2.5, 9);
    content.dispose();
  });

  describe("pick", () => {
    it("gives the solid under the pointer, with its distance", () => {
      const content = createRoomContent(SAMPLE_SCENE);
      const sofa = centerOf("object:sofa");
      // The sofa is 0.8 m high, so its top is 0.4 m above its center.
      const pick = content.pick(rayFrom({ ...sofa, z: sofa.z + 5 }, DOWN));
      expect(pick?.record).toBe("object:sofa");
      expect(pick?.value).toEqual({ solid: "object:sofa", kind: "object", source: "sofa" });
      expect(pick?.distance).toBeCloseTo(4.6, 6);
      content.dispose();
    });

    it("gives no record for a pointer on no solid", () => {
      const content = createRoomContent(SAMPLE_SCENE);
      expect(content.pick(rayFrom({ x: 20, y: 20, z: 5 }, DOWN))).toBeUndefined();
      content.dispose();
    });

    it("gives the glass of a window the record of its opening", () => {
      const content = createRoomContent(SAMPLE_SCENE);
      const glass = centerOf("glass:window-east");
      const pick = content.pick(rayFrom({ ...glass, x: glass.x + 3 }, { x: -1, y: 0, z: 0 }));
      expect(pick?.record).toBe("opening:window-east");
      expect(pick?.value.kind).toBe("glass");
      content.dispose();
    });

    it("gives an object in a clear box of objects before the box", () => {
      const content = createRoomContent(SAMPLE_SCENE);
      const rack = centerOf("object:rack");
      const node = centerOf("object:node-4");
      const pick = content.pick(rayFrom({ ...node, z: 5 }, DOWN));
      expect(pick?.record).toBe("object:node-4");
      // The distance is the distance to the object, and not to the top of the box. The node is 0.18 m high.
      expect(pick?.distance).toBeCloseTo(5 - (node.z + 0.09), 6);
      // The side of the box has no object below it. The box is 0.6 m wide, and each node is 0.48 m wide.
      const side = content.pick(rayFrom({ x: rack.x - 0.28, y: rack.y, z: 5 }, DOWN));
      expect(side?.record).toBe("object:rack");
      expect(side?.distance).toBeCloseTo(5 - 1.2, 6);
      content.dispose();
    });

    it("lets the pointer go through a wall that hides the room", () => {
      const content = createRoomContent(SAMPLE_SCENE);
      // This ray starts south of the room, 1.5 m above the floor. It goes north through the south wall.
      const ray = rayFrom({ x: 3, y: -3, z: 1.5 }, NORTH);
      expect(content.pick(ray)?.record).toBe("wall:south");
      content.step?.(homeFrame(0, true));
      const behind = content.pick(ray);
      expect(behind?.record).toBe("wall:north");
      // The inner face of the north wall is 5 m north of the origin of the room.
      expect(behind?.distance).toBeCloseTo(8, 6);
      content.dispose();
    });
  });

  describe("step", () => {
    it("makes the walls between the camera and the room clear at once, when the picture does not move", () => {
      const content = createRoomContent(SAMPLE_SCENE);
      content.paint(LIGHT_THEME, noHighlight);
      expect(wallOpacity(content, "south")).toBe(1);
      expect(content.step?.(homeFrame(0, true))).toBe(false);
      expect(wallOpacity(content, "south")).toBeCloseTo(0.08, 9);
      expect(wallOpacity(content, "east")).toBeCloseTo(0.08, 9);
      expect(wallOpacity(content, "north")).toBe(1);
      expect(wallOpacity(content, "west")).toBe(1);
      content.dispose();
    });

    it("moves a wall to clear in steps, and tells that the picture changes", () => {
      const content = createRoomContent(SAMPLE_SCENE);
      content.paint(LIGHT_THEME, noHighlight);
      expect(content.step?.(homeFrame(FADE_TIME, false))).toBe(true);
      // After one time of the fade, a wall is 1 - 1/e of the way to clear.
      const part = 1 - Math.exp(-1);
      expect(wallOpacity(content, "south")).toBeCloseTo(0.08 + 0.92 * (1 - part), 9);
      let steps = 1;
      while (content.step?.(homeFrame(FADE_TIME, false)) === true && steps < 50) steps += 1;
      expect(steps).toBeLessThan(10);
      expect(wallOpacity(content, "south")).toBeCloseTo(0.08, 9);
      expect(content.step?.(homeFrame(FADE_TIME, false))).toBe(false);
      content.dispose();
    });

    it("changes no wall before the first paint, and paints it at the paint", () => {
      const content = createRoomContent(SAMPLE_SCENE);
      expect(content.step?.(homeFrame(0, true))).toBe(false);
      content.paint(LIGHT_THEME, noHighlight);
      expect(wallOpacity(content, "south")).toBeCloseTo(0.08, 9);
      content.dispose();
    });
  });

  describe("paint", () => {
    it("gives each solid the highlight of its record", () => {
      const content = createRoomContent(SAMPLE_SCENE);
      const group = content.objects[0];
      const colorOf = (id: string): string => {
        const index = content.solids.findIndex((solid) => solid.id === id);
        return `#${((group?.children[index] as Mesh).material as MeshStandardMaterial).color.getHexString()}`;
      };
      content.paint(LIGHT_THEME, noHighlight);
      const plain = colorOf("object:desk");
      const asked: string[] = [];
      content.paint(LIGHT_THEME, (record) => {
        asked.push(record);
        return record === "object:desk" ? 2 : 0;
      });
      expect(colorOf("object:desk")).not.toBe(plain);
      expect(colorOf("object:sofa")).toBe(LIGHT_THEME.objects["sofa"]);
      expect(asked).toContain("opening:window-east");
      expect(asked).not.toContain("glass:window-east");
      content.dispose();
    });
  });

  it("removes the solids at the end", () => {
    const content = createRoomContent(SAMPLE_SCENE);
    content.dispose();
    expect(content.objects[0]?.children).toEqual([]);
  });
});
