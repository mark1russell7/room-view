import { Color } from "three";
import { describe, expect, it } from "vitest";
import { SAMPLE_SCENE } from "../sample.ts";
import { sceneSolids } from "../solids.ts";
import { MARKER_RADIUS, type OutletMarker } from "./markers.ts";
import { buildModel, disposeModel, paintLink, paintPart, recordName, type ModelPart, type RoomModel } from "./model.ts";
import { DARK_THEME, LIGHT_THEME } from "./theme.ts";
import { createRoomViewer } from "./viewer.ts";

function partOf(model: RoomModel, solid: string): ModelPart {
  const found = model.parts.find((part) => part.solid.id === solid);
  if (found === undefined) throw new Error(`The model has no part ${solid}.`);
  return found;
}

function markerOf(part: ModelPart): OutletMarker {
  if (part.marker === undefined) throw new Error(`The part ${part.solid.id} has no marker.`);
  return part.marker;
}

const hex = (color: Color): string => `#${color.getHexString()}`;

describe("buildModel", () => {
  const model = buildModel(SAMPLE_SCENE);

  it("makes one mesh with edges for each solid", () => {
    expect(model.parts.map((part) => part.solid.id)).toEqual(sceneSolids(SAMPLE_SCENE).map((solid) => solid.id));
    expect(model.group.children).toEqual(model.parts.map((part) => part.mesh));
    for (const part of model.parts) expect(part.mesh.children).toEqual([part.lines]);
  });

  it("gives each part of one wall the same record", () => {
    const south = model.parts.filter((part) => part.record === recordName("wall", "south"));
    expect(south.length).toBeGreaterThan(1);
    expect(south.every((part) => part.wall === "south")).toBe(true);
  });

  it("puts a window and an outlet with their wall", () => {
    expect(partOf(model, "glass:window-east").wall).toBe("east");
    expect(partOf(model, "outlet:nook-2").wall).toBe("inset-east");
    expect(partOf(model, "floor:floor").wall).toBeUndefined();
    expect(partOf(model, "object:desk").wall).toBeUndefined();
  });

  it("finds the object with other objects in it", () => {
    expect(model.parts.filter((part) => part.holds).map((part) => part.solid.id)).toEqual(["object:rack"]);
    expect(partOf(model, "object:node-3").holder).toBe("object:rack");
    // The display is on the desk, and not in it.
    expect(partOf(model, "object:display").holder).toBe("object:desk");
    expect(partOf(model, "object:desk").holds).toBe(false);
  });

  it("gives the center and the corners in the space of the viewer", () => {
    // The outer faces of the sample room are 0.15 m out of its outline of 6 by 5 m. The floor is 0.1 m deep.
    expect(model.center.x).toBeCloseTo(3, 9);
    expect(model.center.z).toBeCloseTo(-2.5, 9);
    expect(Math.max(...model.corners.map((corner) => corner.y))).toBeCloseTo(2.5, 9);
    expect(Math.min(...model.corners.map((corner) => corner.x))).toBeCloseTo(-0.15, 9);
    expect(Math.min(...model.corners.map((corner) => corner.z))).toBeCloseTo(-5.15, 9);
  });

  it("has the shade of each wall", () => {
    expect(model.shades.map((shade) => shade.frame.id).sort()).toEqual(["east", "inset-east", "inset-north", "nook", "north", "south", "west"]);
  });
});

describe("paintPart", () => {
  it("gives a part the colors of the theme", () => {
    const model = buildModel(SAMPLE_SCENE);
    const wall = partOf(model, "wall:north:0");
    paintPart(wall, SAMPLE_SCENE, LIGHT_THEME, 0);
    expect(hex(wall.mesh.material.color)).toBe(LIGHT_THEME.wall);
    expect(hex(wall.lines.material.color)).toBe(LIGHT_THEME.edge);
    expect(wall.mesh.material.transparent).toBe(false);
    expect(wall.mesh.material.depthWrite).toBe(true);
    paintPart(wall, SAMPLE_SCENE, DARK_THEME, 0);
    expect(hex(wall.mesh.material.color)).toBe(DARK_THEME.wall);

    const sofa = partOf(model, "object:sofa");
    paintPart(sofa, SAMPLE_SCENE, LIGHT_THEME, 0);
    expect(hex(sofa.mesh.material.color)).toBe(LIGHT_THEME.objects["sofa"]);
    disposeModel(model);
  });

  it("uses the color of objects for a kind that the theme does not have", () => {
    const scene = { ...SAMPLE_SCENE, objects: [{ id: "plant", kind: "plant", size: [0.4, 0.4, 1] as const, at: [1, 1] as const }] };
    const model = buildModel(scene);
    const plant = partOf(model, "object:plant");
    paintPart(plant, scene, LIGHT_THEME, 0);
    expect(hex(plant.mesh.material.color)).toBe(LIGHT_THEME.object);
    disposeModel(model);
  });

  it("makes a wall that fades almost clear, and its edges light", () => {
    const model = buildModel(SAMPLE_SCENE);
    const wall = partOf(model, "wall:south:0");
    wall.fade = 1;
    paintPart(wall, SAMPLE_SCENE, LIGHT_THEME, 0);
    expect(wall.mesh.material.transparent).toBe(true);
    expect(wall.mesh.material.depthWrite).toBe(false);
    expect(wall.mesh.material.opacity).toBeCloseTo(0.08, 9);
    expect(wall.lines.material.opacity).toBeCloseTo(0.3, 9);
    wall.fade = 0;
    paintPart(wall, SAMPLE_SCENE, LIGHT_THEME, 0);
    expect(wall.mesh.material.transparent).toBe(false);
    expect(wall.mesh.material.opacity).toBe(1);
    disposeModel(model);
  });

  it("shows glass and a box of objects as clear parts", () => {
    const model = buildModel(SAMPLE_SCENE);
    const glass = partOf(model, "glass:window-west");
    const rack = partOf(model, "object:rack");
    paintPart(glass, SAMPLE_SCENE, LIGHT_THEME, 0);
    paintPart(rack, SAMPLE_SCENE, LIGHT_THEME, 0);
    expect(glass.mesh.material.opacity).toBeCloseTo(LIGHT_THEME.glassOpacity, 9);
    expect(rack.mesh.material.opacity).toBeLessThan(0.2);
    expect(rack.mesh.material.transparent).toBe(true);
    paintPart(rack, SAMPLE_SCENE, LIGHT_THEME, 2);
    expect(rack.mesh.material.opacity).toBeGreaterThan(0.4);
    disposeModel(model);
  });

  it("moves the color of a marked part to the accent, more for a selected part", () => {
    const model = buildModel(SAMPLE_SCENE);
    const desk = partOf(model, "object:desk");
    const accent = new Color(LIGHT_THEME.accent);
    const far = (mark: 0 | 1 | 2): number => {
      paintPart(desk, SAMPLE_SCENE, LIGHT_THEME, mark);
      const color = desk.mesh.material.color;
      return Math.hypot(color.r - accent.r, color.g - accent.g, color.b - accent.b);
    };
    expect(far(1)).toBeLessThan(far(0));
    expect(far(2)).toBeLessThan(far(1));
    paintPart(desk, SAMPLE_SCENE, LIGHT_THEME, 2);
    const selected = desk.lines.material.linewidth;
    paintPart(desk, SAMPLE_SCENE, LIGHT_THEME, 0);
    expect(selected).toBe(desk.lines.material.linewidth * 2);
    disposeModel(model);
  });

  it("gives an outlet and its marker the color of the level of its circuit", () => {
    const model = buildModel(SAMPLE_SCENE);
    const ok = partOf(model, "outlet:south-1");
    const near = partOf(model, "outlet:nook-2");
    paintPart(ok, SAMPLE_SCENE, LIGHT_THEME, 0);
    paintPart(near, SAMPLE_SCENE, LIGHT_THEME, 0);
    expect(ok.level).toBe("ok");
    expect(near.level).toBe("near");
    expect(hex(ok.mesh.material.color)).toBe(LIGHT_THEME.levels.ok);
    expect(hex(near.mesh.material.color)).toBe(LIGHT_THEME.levels.near);
    expect(hex(markerOf(ok).front.material.color)).toBe(LIGHT_THEME.levels.ok);
    expect(hex(markerOf(near).front.material.color)).toBe(LIGHT_THEME.levels.near);
    expect(hex(markerOf(ok).back.material.color)).toBe(LIGHT_THEME.halo);
    expect(markerOf(ok).shape).toBe("disc");
    expect(markerOf(near).shape).toBe("triangle");
    paintPart(near, SAMPLE_SCENE, DARK_THEME, 0);
    expect(hex(markerOf(near).front.material.color)).toBe(DARK_THEME.levels.near);
    expect(hex(markerOf(near).back.material.color)).toBe(DARK_THEME.halo);
    disposeModel(model);
  });

  it("uses the option near of the loads", () => {
    // The circuit of this outlet has 420 W of 1440 W.
    const model = buildModel(SAMPLE_SCENE, {}, { near: 0.25 });
    expect(partOf(model, "outlet:south-1").level).toBe("near");
    disposeModel(model);
  });

  it("gives an outlet with no circuit the color of outlets and a ring", () => {
    const outlets = [{ id: "free", wall: "south", face: "left" as const, offset: 1, height: 0.3 }];
    const scene = { ...SAMPLE_SCENE, room: { ...SAMPLE_SCENE.room, outlets }, objects: [] };
    const model = buildModel(scene);
    const free = partOf(model, "outlet:free");
    paintPart(free, scene, LIGHT_THEME, 0);
    expect(free.level).toBeUndefined();
    expect(markerOf(free).shape).toBe("ring");
    expect(hex(free.mesh.material.color)).toBe(LIGHT_THEME.outlet);
    expect(hex(markerOf(free).front.material.color)).toBe(LIGHT_THEME.outlet);
    disposeModel(model);
  });

  it("has a marker for each outlet, and for no other part", () => {
    const model = buildModel(SAMPLE_SCENE);
    const outlets = model.parts.filter((part) => part.solid.kind === "outlet");
    expect(outlets.length).toBe(SAMPLE_SCENE.room.outlets?.length);
    expect(model.parts.filter((part) => part.marker !== undefined)).toEqual(outlets);
    for (const part of outlets) expect(model.overlay.children).toContain(markerOf(part).root);
    disposeModel(model);
  });

  it("puts a marker at the center of the plate of its outlet", () => {
    const model = buildModel(SAMPLE_SCENE);
    // This outlet is 2.4 m along the south wall and 0.3 m above the floor. Its plate is 12 mm deep, on the face at y = 0.
    const at = markerOf(partOf(model, "outlet:south-1")).root.position;
    expect(at.x).toBeCloseTo(2.4, 6);
    expect(at.y).toBeCloseTo(0.3, 6);
    expect(at.z).toBeCloseTo(-0.006, 6);
    disposeModel(model);
  });

  it("makes the marker of a marked outlet larger, with the accent around it", () => {
    const model = buildModel(SAMPLE_SCENE);
    const outlet = partOf(model, "outlet:south-1");
    const marker = markerOf(outlet);
    paintPart(outlet, SAMPLE_SCENE, LIGHT_THEME, 0);
    expect(marker.radius).toBe(MARKER_RADIUS);
    paintPart(outlet, SAMPLE_SCENE, LIGHT_THEME, 1);
    const pointed = marker.radius;
    expect(pointed).toBeGreaterThan(MARKER_RADIUS);
    expect(hex(marker.back.material.color)).toBe(LIGHT_THEME.accent);
    paintPart(outlet, SAMPLE_SCENE, LIGHT_THEME, 2);
    expect(marker.radius).toBeGreaterThan(pointed);
    // The plate keeps its size: the marker shows the mark.
    expect(outlet.mesh.scale.x).toBe(1);
    disposeModel(model);
  });

  it("makes a marker less clear on a clear wall and behind a solid, but not a marked marker", () => {
    const model = buildModel(SAMPLE_SCENE);
    const outlet = partOf(model, "outlet:south-1");
    const marker = markerOf(outlet);
    paintPart(outlet, SAMPLE_SCENE, LIGHT_THEME, 0);
    expect(marker.front.material.opacity).toBe(1);
    outlet.fade = 1;
    paintPart(outlet, SAMPLE_SCENE, LIGHT_THEME, 0);
    expect(marker.front.material.opacity).toBeCloseTo(0.35, 9);
    expect(marker.back.material.opacity).toBeCloseTo(0.35, 9);
    outlet.fade = 0;
    marker.hidden = true;
    paintPart(outlet, SAMPLE_SCENE, LIGHT_THEME, 0);
    expect(marker.front.material.opacity).toBeCloseTo(0.45, 9);
    paintPart(outlet, SAMPLE_SCENE, LIGHT_THEME, 1);
    expect(marker.front.material.opacity).toBe(1);
    disposeModel(model);
  });
});

describe("the links of a model", () => {
  it("has a hidden link from each outlet to each object that takes its power from it", () => {
    const model = buildModel(SAMPLE_SCENE);
    const users = (SAMPLE_SCENE.objects ?? []).filter((object) => object.outlet !== undefined);
    expect(users.length).toBeGreaterThan(3);
    expect(model.links.map((link) => `${link.outlet} ${link.object}`)).toEqual(users.map((object) => `outlet:${String(object.outlet)} object:${object.id}`));
    expect(model.links.every((link) => !link.line.visible)).toBe(true);
    for (const link of model.links) expect(model.overlay.children).toContain(link.line);
    disposeModel(model);
  });

  it("shows a link with the color of the level of its circuit", () => {
    const model = buildModel(SAMPLE_SCENE);
    const link = model.links.find((item) => item.object === "object:node-3");
    if (link === undefined) throw new Error("The model has no link of node-3.");
    expect(link.outlet).toBe("outlet:nook-2");
    expect(link.level).toBe("near");
    paintLink(link, LIGHT_THEME, true);
    expect(link.line.visible).toBe(true);
    expect(hex(link.line.material.color)).toBe(LIGHT_THEME.levels.near);
    paintLink(link, DARK_THEME, false);
    expect(link.line.visible).toBe(false);
    expect(hex(link.line.material.color)).toBe(DARK_THEME.levels.near);
    disposeModel(model);
  });

  it("has no link for an outlet that the room does not have", () => {
    const scene = { ...SAMPLE_SCENE, objects: [{ id: "lamp", kind: "lamp", size: [0.2, 0.2, 1] as const, at: [1, 1] as const, outlet: "none" }] };
    const model = buildModel(scene);
    expect(model.links).toEqual([]);
    disposeModel(model);
  });
});

describe("disposeModel", () => {
  it("removes each part from the group, and each marker and link from the overlay", () => {
    const model = buildModel(SAMPLE_SCENE);
    expect(model.overlay.children.length).toBe(model.links.length + (SAMPLE_SCENE.room.outlets?.length ?? 0));
    disposeModel(model);
    expect(model.group.children).toEqual([]);
    expect(model.overlay.children).toEqual([]);
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
});
