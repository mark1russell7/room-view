import { checkMarks, type Mark } from "@mark1russell7/visuals/marks";
import { describe, expect, it } from "vitest";
import { sceneSpace, type Anchor, type SceneSpace } from "./anchors.ts";
import { recordName } from "./check.ts";
import * as root from "./index.ts";
import { checkLayers, type AddOn, type LayerParse } from "./layers.ts";
import * as entry from "./marks.ts";
import { layerMarks, type AddOnMarks } from "./marks.ts";
import type { Scene } from "./room.ts";

/** A layer of the test add-on: signs, each on one anchor. */
interface SignLayer {
  readonly signs: readonly { readonly id: string; readonly anchor: Anchor }[];
}

/** This function makes a test add-on of a schema name. It knows no topic: it shows only the contract. */
function signAddOn(schema: string): AddOn<SignLayer> {
  return {
    schema,
    parse(value: unknown): LayerParse<SignLayer> {
      const signs = (value as { signs?: unknown } | null)?.signs;
      return Array.isArray(signs) ? { ok: true, layer: { signs: signs as SignLayer["signs"] } } : { ok: false, errors: [`The layer "${schema}" has no list "signs".`] };
    },
    anchors: (layer) => new Map(layer.signs.map((sign) => [sign.id, sign.anchor] as const)),
    withAnchors: (layer, anchors) => ({ signs: layer.signs.map((sign) => ({ ...sign, anchor: anchors.get(sign.id) ?? sign.anchor })) }),
    check: () => [],
  };
}

/** This function makes the marks of the test add-on: a point for each sign with a position, and then a meter for each sign. */
function signMarks(schema: string, kind: string = "sign", seen: SceneSpace[] = []): AddOnMarks<SignLayer> {
  return {
    schema,
    marks(layer, space): readonly Mark[] {
      seen.push(space);
      const marks: Mark[] = [];
      for (const sign of layer.signs) {
        const frame = space.frame(sign.anchor);
        if (frame !== undefined) marks.push({ type: "point", record: recordName(schema, sign.id), kind, level: "ok", label: `Sign ${sign.id}`, frame });
      }
      for (const sign of layer.signs) marks.push({ type: "meter", record: recordName(schema, sign.id), kind, level: "near", label: `Meter ${sign.id}`, value: 9, limit: 10, unit: "W" });
      return marks;
    },
  };
}

/** One wall along the x axis, 4 long, and a desk. */
function scene(layers?: Readonly<Record<string, unknown>>): Scene {
  return {
    schema: "scene/1",
    room: { schema: "room/1", unit: "m", height: 2.4, wallThickness: 0.2, walls: [{ id: "a", from: [0, 0], to: [4, 0] }] },
    objects: [{ id: "desk", kind: "desk", size: [2, 1, 0.75], at: [2, 1.5] }],
    ...(layers === undefined ? {} : { layers }),
  };
}

const onWall: Anchor = { on: "wall", wall: "a", face: "left", offset: 1, height: 0.3 };
const onDesk: Anchor = { on: "object", object: "desk" };
const onNoWall: Anchor = { on: "wall", wall: "z", face: "left", offset: 1, height: 0.3 };

/** This function gives the type and the record name of each mark. */
function names(marks: readonly Mark[]): readonly string[] {
  return marks.map((mark) => `${mark.type} ${mark.record}`);
}

describe("the entry /marks", () => {
  it("has the function of the marks, and the root entry does not have it", () => {
    expect(Object.keys(entry)).toEqual(["layerMarks"]);
    expect(root).not.toHaveProperty("layerMarks");
  });
});

describe("layerMarks", () => {
  it("gives no marks for a scene with no layers, and for no marks values", () => {
    expect(layerMarks(scene(), [signAddOn("sign/1")], [signMarks("sign/1")])).toEqual([]);
    expect(layerMarks(scene({ "sign/1": { signs: [{ id: "s", anchor: onWall }] } }), [signAddOn("sign/1")], [])).toEqual([]);
    expect(layerMarks(scene(), [], [])).toEqual([]);
  });

  it("gives the marks of a layer in the space of the scene, in meters", () => {
    const room = scene({ "sign/1": { signs: [{ id: "s", anchor: onWall }] } });
    const marks = layerMarks(room, [signAddOn("sign/1")], [signMarks("sign/1")]);
    expect(marks).toEqual([
      { type: "point", record: "sign/1:s", kind: "sign", level: "ok", label: "Sign s", frame: sceneSpace(room).frame(onWall) },
      { type: "meter", record: "sign/1:s", kind: "sign", level: "near", label: "Meter s", value: 9, limit: 10, unit: "W" },
    ]);
    const point = marks[0];
    if (point?.type !== "point") throw new Error("The first mark is not a point.");
    expect(point.frame.at.x).toBeCloseTo(1, 12);
    expect(point.frame.at.z).toBeCloseTo(0.3, 12);
  });

  it("lists the marks by the name of the layer, then by the name of the record", () => {
    const room = scene({
      "sign/1": { signs: [{ id: "z", anchor: onWall }, { id: "b", anchor: onDesk }] },
      "arrow/1": { signs: [{ id: "y", anchor: onDesk }, { id: "a", anchor: onWall }] },
    });
    const addOns = [signAddOn("sign/1"), signAddOn("arrow/1")];
    const expected = ["point arrow/1:a", "meter arrow/1:a", "point arrow/1:y", "meter arrow/1:y", "point sign/1:b", "meter sign/1:b", "point sign/1:z", "meter sign/1:z"];
    expect(names(layerMarks(room, addOns, [signMarks("sign/1"), signMarks("arrow/1")]))).toEqual(expected);
    expect(names(layerMarks(room, [...addOns].reverse(), [signMarks("arrow/1"), signMarks("sign/1")]))).toEqual(expected);
  });

  it("keeps the order of the marks of one record", () => {
    const room = scene({ "sign/1": { signs: [{ id: "s", anchor: onWall }] } });
    expect(names(layerMarks(room, [signAddOn("sign/1")], [signMarks("sign/1")]))).toEqual(["point sign/1:s", "meter sign/1:s"]);
  });

  it("gives no marks for a layer with a fault of its form, and checkLayers tells the fault", () => {
    const room = scene({ "sign/1": { signs: "none" }, "arrow/1": { signs: [{ id: "a", anchor: onWall }] } });
    const addOns = [signAddOn("sign/1"), signAddOn("arrow/1")];
    expect(names(layerMarks(room, addOns, [signMarks("sign/1"), signMarks("arrow/1")]))).toEqual(["point arrow/1:a", "meter arrow/1:a"]);
    expect(checkLayers(room, addOns).map((finding) => `${finding.code} ${finding.layer}`)).toEqual(["layer-form sign/1"]);
  });

  it("gives marks only for the layers with a marks value", () => {
    const room = scene({ "sign/1": { signs: [{ id: "s", anchor: onWall }] }, "arrow/1": { signs: [{ id: "a", anchor: onWall }] }, "other/1": {} });
    expect(names(layerMarks(room, [signAddOn("sign/1"), signAddOn("arrow/1")], [signMarks("arrow/1")]))).toEqual(["point arrow/1:a", "meter arrow/1:a"]);
  });

  it("gives the marks that the add-on gives: a record with no position has no point", () => {
    const room = scene({ "sign/1": { signs: [{ id: "s", anchor: onNoWall }] } });
    expect(names(layerMarks(room, [signAddOn("sign/1")], [signMarks("sign/1")]))).toEqual(["meter sign/1:s"]);
  });

  it("throws for a marks value with no add-on of its name", () => {
    expect(() => layerMarks(scene(), [signAddOn("arrow/1")], [signMarks("sign/1")])).toThrow(RangeError);
    expect(() => layerMarks(scene(), [], [signMarks("sign/1")])).toThrow('The marks of the layer "sign/1" have no add-on in the list.');
  });

  it("uses the first value of a name", () => {
    const room = scene({ "sign/1": { signs: [{ id: "s", anchor: onWall }] } });
    const marks = layerMarks(room, [signAddOn("sign/1"), signAddOn("sign/1")], [signMarks("sign/1", "first"), signMarks("sign/1", "second")]);
    expect(marks.map((mark) => mark.kind)).toEqual(["first", "first"]);
  });

  it("gives one space to each marks value", () => {
    const seen: SceneSpace[] = [];
    const room = scene({ "sign/1": { signs: [{ id: "s", anchor: onWall }] }, "arrow/1": { signs: [{ id: "a", anchor: onDesk }] } });
    layerMarks(room, [signAddOn("sign/1"), signAddOn("arrow/1")], [signMarks("sign/1", "sign", seen), signMarks("arrow/1", "sign", seen)]);
    expect(seen).toHaveLength(2);
    expect(seen[0]).toBe(seen[1]);
    expect(seen[0]?.scene).toBe(room);
  });

  it("gives marks that the check of the marks accepts, and that go through JSON with no change", () => {
    const room = scene({ "sign/1": { signs: [{ id: "s", anchor: onWall }, { id: "t", anchor: onDesk }] } });
    const marks = layerMarks(room, [signAddOn("sign/1")], [signMarks("sign/1")]);
    expect(marks).toHaveLength(4);
    expect(checkMarks(marks)).toEqual([]);
    expect(JSON.parse(JSON.stringify(marks))).toEqual(marks);
  });
});
