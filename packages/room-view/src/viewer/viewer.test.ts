import { addPoints3, scalePoint3, type Point3 } from "@mark1russell7/layout-contract";
import type { Highlight } from "@mark1russell7/visuals";
import type { Mark, PointMark } from "@mark1russell7/visuals/marks";
import type { StageFrame } from "@mark1russell7/visuals/three";
import { PerspectiveCamera, Raycaster, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { SAMPLE_SCENE } from "../sample.ts";
import { DARK_THEME, LIGHT_THEME } from "./theme.ts";
import { toViewer } from "./view.ts";
import { createRoomViewer, createViewerContent, marksThemes, nameOf, type ViewerContent } from "./viewer.ts";

const noHighlight = (): Highlight => 0;
const vector = (point: Point3): Vector3 => new Vector3(point.x, point.y, point.z);

/** A point on the face of the south wall of the sample scene that is in the room, in the space of the scene. The direction out of the wall is north. */
const SPOT: Point3 = { x: 2.4, y: 0, z: 0.3 };
const NORTH: Point3 = { x: 0, y: 1, z: 0 };

/**
 * This function paints a content, and gives the pointer on a point of the scene to it.
 * The camera is 3 m from the point, in a direction of the scene.
 */
function pointAt(viewer: ViewerContent, at: Point3, toCamera: Point3 = NORTH): ReturnType<ViewerContent["content"]["pick"]> {
  const eye = vector(toViewer(addPoints3(at, scalePoint3(toCamera, 3))));
  const target = vector(toViewer(at));
  const camera = new PerspectiveCamera(32, 1, 0.1, 100);
  camera.position.copy(eye);
  camera.lookAt(target);
  camera.updateMatrixWorld();
  const frame: StageFrame = { camera, seconds: 0, settle: true, height: 600, fieldOfView: 32 };
  viewer.content.paint(LIGHT_THEME, noHighlight);
  viewer.content.step?.(frame);
  const ray = new Raycaster();
  ray.set(eye, target.clone().sub(eye).normalize());
  return viewer.content.pick(ray);
}

/** A mark of an add-on at the point `SPOT`. No solid has its record. */
const ADDED: PointMark = { type: "point", record: "mark/1:spot", kind: "spot", level: "near", label: "Spot on the south wall", frame: { at: SPOT, out: NORTH } };

describe("nameOf", () => {
  it("gives the name of the record of a solid, and keeps a record name", () => {
    expect(nameOf({ kind: "wall", source: "south" })).toBe("wall:south");
    expect(nameOf({ kind: "glass", source: "window-east" })).toBe("opening:window-east");
    expect(nameOf("mark/1:spot")).toBe("mark/1:spot");
  });
});

describe("marksThemes", () => {
  it("gives the colors of the marks of a viewer theme", () => {
    const theme = marksThemes()(LIGHT_THEME);
    expect(theme.levels).toBe(LIGHT_THEME.levels);
    expect(theme.halo).toBe(LIGHT_THEME.halo);
    expect(theme.accent).toBe(LIGHT_THEME.accent);
    expect(theme.sky).toBe(LIGHT_THEME.sky);
    expect(theme.ground).toBe(LIGHT_THEME.ground);
    expect(theme.field).toEqual([]);
  });

  it("gives the colors of a field of a theme that has them", () => {
    const field = ["#112233", "#445566"];
    const theme = marksThemes()({ ...LIGHT_THEME, field, fieldOpacity: 0.5 });
    expect(theme.field).toBe(field);
    expect(theme.fieldOpacity).toBe(0.5);
  });

  it("gives the same object while the viewer theme is the same", () => {
    const themeOf = marksThemes();
    const light = themeOf(LIGHT_THEME);
    expect(themeOf(LIGHT_THEME)).toBe(light);
    const dark = themeOf(DARK_THEME);
    expect(dark).not.toBe(light);
    expect(dark.halo).toBe(DARK_THEME.halo);
    expect(themeOf(DARK_THEME)).toBe(dark);
  });
});

describe("createViewerContent", () => {
  describe("with no list of marks", () => {
    it("has the records of the solids, and no mark", () => {
      const viewer = createViewerContent(SAMPLE_SCENE);
      for (const record of ["wall:south", "opening:window-east", "object:tower"]) expect(viewer.content.has(record), record).toBe(true);
      expect(viewer.content.has("mark/1:spot")).toBe(false);
      viewer.content.dispose();
    });

    it("gives a solid to the pointer, with its distance", () => {
      const viewer = createViewerContent(SAMPLE_SCENE);
      const pick = pointAt(viewer, SPOT);
      expect(pick?.record).toBe("wall:south");
      expect(pick?.distance).toBeCloseTo(3, 6);
      const [solid, mark] = viewer.told(pick?.value);
      expect(solid).toMatchObject({ kind: "wall", source: "south" });
      expect(mark).toBeUndefined();
      viewer.content.dispose();
    });

    it("tells the page that the pointer is on no record", () => {
      const viewer = createViewerContent(SAMPLE_SCENE);
      expect(viewer.told(undefined)).toEqual([undefined, undefined]);
      viewer.content.dispose();
    });
  });

  describe("with a list of marks", () => {
    it("gives the sign of a mark to the pointer, and the page gets the mark of the list", () => {
      const viewer = createViewerContent(SAMPLE_SCENE, [ADDED]);
      expect(viewer.content.has("mark/1:spot")).toBe(true);
      const pick = pointAt(viewer, SPOT);
      expect(pick?.record).toBe("mark/1:spot");
      // A sign has no distance, so it gets the pointer before each solid.
      expect(pick?.distance).toBeUndefined();
      // No solid has the record of this mark.
      const [solid, mark] = viewer.told(pick?.value);
      expect(solid).toBeUndefined();
      expect(mark).toBe(ADDED);
      viewer.content.dispose();
    });

    it("gives the first solid of the record of a mark to the page", () => {
      const onWall: PointMark = { ...ADDED, record: "wall:south" };
      const viewer = createViewerContent(SAMPLE_SCENE, [onWall]);
      const [solid, mark] = viewer.told(pointAt(viewer, SPOT)?.value);
      expect(solid).toEqual({ solid: "wall:south:0", kind: "wall", source: "south" });
      expect(mark).toBe(onWall);
      viewer.content.dispose();
    });

    it("shows no mark for an empty list", () => {
      const viewer = createViewerContent(SAMPLE_SCENE, []);
      const pick = pointAt(viewer, SPOT);
      // The pointer is on the wall: a solid with a distance.
      expect(pick?.record).toBe("wall:south");
      expect(pick?.distance).toBeCloseTo(3, 6);
      expect(viewer.told(pick?.value)[1]).toBeUndefined();
      viewer.content.dispose();
    });

    it("leaves out a mark with a fault", () => {
      const noLabel: PointMark = { ...ADDED, record: "mark/1:bad", label: "" };
      const noDirection: PointMark = { ...ADDED, record: "mark/1:flat", frame: { at: SPOT, out: { x: 0, y: 0, z: 0 } } };
      const viewer = createViewerContent(SAMPLE_SCENE, [noLabel, ADDED, noDirection]);
      expect(viewer.content.has("mark/1:bad")).toBe(false);
      expect(viewer.content.has("mark/1:flat")).toBe(false);
      expect(viewer.content.has("mark/1:spot")).toBe(true);
      expect(viewer.told(pointAt(viewer, SPOT)?.value)[1]).toBe(ADDED);
      viewer.content.dispose();
    });
  });

  describe("show", () => {
    it("gives each mark to the test as the scene has it", () => {
      const second: PointMark = { ...ADDED, record: "mark/1:other", kind: "sensor", frame: { at: { x: 4, y: 0, z: 1 }, out: NORTH } };
      const viewer = createViewerContent(SAMPLE_SCENE, [ADDED, second]);
      const seen: Mark[] = [];
      viewer.show((mark) => {
        seen.push(mark);
        return true;
      });
      expect(seen).toContain(ADDED);
      expect(seen).toContain(second);
      expect(seen.every((mark) => mark === ADDED || mark === second)).toBe(true);
      viewer.content.dispose();
    });

    it("removes a mark that the test refuses from the pointer", () => {
      const viewer = createViewerContent(SAMPLE_SCENE, [ADDED]);
      viewer.show((mark) => mark.kind !== "spot");
      // The pointer is then on the wall below the sign.
      expect(pointAt(viewer, SPOT)?.record).toBe("wall:south");
      viewer.show(() => true);
      expect(pointAt(viewer, SPOT)?.record).toBe("mark/1:spot");
      viewer.content.dispose();
    });
  });
});

describe("createRoomViewer", () => {
  it("gives undefined, and changes nothing in the page, when the browser has no WebGL 2", () => {
    const asked: string[] = [];
    const canvas = {
      getContext: (kind: string): null => {
        asked.push(kind);
        return null;
      },
    };
    // This container has no method that adds an element, so a viewer that changes the page throws.
    const container = { ownerDocument: { createElement: (): unknown => canvas } } as unknown as HTMLElement;
    expect(createRoomViewer(container, { scene: SAMPLE_SCENE })).toBeUndefined();
    expect(asked).toEqual(["webgl2"]);
  });

  it("gives undefined with a list of marks, when the browser has no WebGL 2", () => {
    const canvas = { getContext: (): null => null };
    const container = { ownerDocument: { createElement: (): unknown => canvas } } as unknown as HTMLElement;
    expect(createRoomViewer(container, { scene: SAMPLE_SCENE, marks: [ADDED], theme: DARK_THEME })).toBeUndefined();
  });
});
