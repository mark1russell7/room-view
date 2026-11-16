import { describe, expect, it } from "vitest";
import type { Anchor, SceneSpace } from "./anchors.ts";
import { parseRecordName, recordName } from "./check.ts";
import { checkLayers, readLayer, type AddOn, type AddOnFault, type LayerParse } from "./layers.ts";
import { isLayerName, type Scene } from "./room.ts";

/** A layer of the test add-on: marks, each on one anchor, each with a size. */
interface MarkLayer {
  readonly marks: readonly { readonly id: string; readonly anchor: Anchor; readonly size: number }[];
}

/** This function makes a test add-on of a schema name. It knows no topic: it shows only the contract. */
function markAddOn(schema: string, seen: SceneSpace[] = []): AddOn<MarkLayer> {
  return {
    schema,
    parse(value: unknown): LayerParse<MarkLayer> {
      const marks = (value as { marks?: unknown } | null)?.marks;
      return Array.isArray(marks) ? { ok: true, layer: { marks: marks as MarkLayer["marks"] } } : { ok: false, errors: [`The layer "${schema}" has no list "marks".`] };
    },
    anchors: (layer) => new Map(layer.marks.map((mark) => [mark.id, mark.anchor] as const)),
    withAnchors: (layer, anchors) => ({ marks: layer.marks.map((mark) => ({ ...mark, anchor: anchors.get(mark.id) ?? mark.anchor })) }),
    check(layer, space): readonly AddOnFault[] {
      seen.push(space);
      const faults: AddOnFault[] = [];
      for (const mark of layer.marks) {
        if (!(mark.size > 0)) faults.push({ level: "error", code: "mark-size", at: mark.id, message: `The mark "${mark.id}" has the size ${mark.size}.` });
        if (mark.size > 10) faults.push({ level: "warning", code: "mark-large", at: mark.id, message: `The mark "${mark.id}" is large.` });
      }
      return faults;
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

describe("checkLayers", () => {
  it("gives no finding for a scene with no layers, or with correct layers", () => {
    expect(checkLayers(scene(), [markAddOn("mark/1")])).toEqual([]);
    expect(checkLayers(scene({ "mark/1": { marks: [{ id: "m", anchor: onWall, size: 1 }] } }), [markAddOn("mark/1")])).toEqual([]);
  });

  it("warns about a layer of no add-on of the check, and keeps the layer", () => {
    const input = scene({ "pipe/1": { taps: [] } });
    expect(checkLayers(input, [markAddOn("mark/1")])).toEqual([
      { level: "warning", code: "layer-unknown", layer: "pipe/1", at: "", message: `The scene has the layer "pipe/1", and no add-on of the check reads it. The scene keeps the layer.` },
    ]);
    expect(input.layers).toEqual({ "pipe/1": { taps: [] } });
  });

  it("refuses a layer whose name is not a word, a slash and a version", () => {
    const findings = checkLayers(scene({ Mark: { marks: [] }, "mark/1": { marks: [] } }), [markAddOn("Mark"), markAddOn("mark/1")]);
    expect(findings).toEqual([
      { level: "error", code: "layer-name", layer: "Mark", at: "", message: `The layer "Mark" has a name that is not a word, a slash and a version, for example "electrical/1".` },
    ]);
  });

  it("gives the faults of the form of a layer, and does not examine its anchors", () => {
    const seen: SceneSpace[] = [];
    expect(checkLayers(scene({ "mark/1": { lines: [] } }), [markAddOn("mark/1", seen)])).toEqual([
      { level: "error", code: "layer-form", layer: "mark/1", at: "", message: `The layer "mark/1" has no list "marks".` },
    ]);
    expect(seen).toEqual([]);
  });

  it("gives the faults of each anchor with the key of the anchor, then the faults of the add-on", () => {
    const layer = { marks: [{ id: "m", anchor: { ...onWall, wall: "b" }, size: 0 }] };
    expect(checkLayers(scene({ "mark/1": layer }), [markAddOn("mark/1")])).toEqual([
      { level: "error", code: "anchor-wall", layer: "mark/1", at: "m", message: `The anchor "m" of the layer "mark/1" is on the wall "b", which the room does not have.` },
      { level: "error", code: "mark-size", layer: "mark/1", at: "m", message: `The mark "m" has the size 0.` },
    ]);
  });

  it("gives the findings in the order of the layer keys, then of the record keys", () => {
    const marks = [
      { id: "z", anchor: onWall, size: 20 },
      { id: "b", anchor: onDesk, size: 0 },
      { id: "a", anchor: { ...onDesk, object: "chair" }, size: 1 },
    ];
    const addOns = [markAddOn("b/1"), markAddOn("a/1"), markAddOn("a-b/1")];
    const findings = checkLayers(scene({ "b/1": { marks }, "a/1": { marks: [marks[1]] }, "a-b/1": { marks: [marks[1]] } }), addOns);
    // The order is by code point: "-" comes before "/".
    expect(findings.map((finding) => `${finding.layer} ${finding.at} ${finding.code}`)).toEqual([
      "a-b/1 b mark-size",
      "a/1 b mark-size",
      "b/1 a anchor-object",
      "b/1 b mark-size",
      "b/1 z mark-large",
    ]);
    // Equal inputs give equal findings, in any order of the add-ons.
    expect(checkLayers(scene({ "a/1": { marks: [marks[1]] }, "a-b/1": { marks: [marks[1]] }, "b/1": { marks } }), [...addOns].reverse())).toEqual(findings);
  });

  it("keeps the order of the faults of one record", () => {
    const addOn: AddOn<MarkLayer> = {
      ...markAddOn("mark/1"),
      check: () => [
        { level: "warning", code: "second", at: "m", message: "B" },
        { level: "error", code: "first", at: "", message: "A" },
        { level: "warning", code: "third", at: "m", message: "C" },
      ],
    };
    const findings = checkLayers(scene({ "mark/1": { marks: [{ id: "m", anchor: { ...onWall, offset: 9 }, size: 1 }] } }), [addOn]);
    expect(findings.map((finding) => finding.code)).toEqual(["first", "anchor-range", "second", "third"]);
  });

  it("uses the first add-on of a name, and gives one space of the scene to each add-on", () => {
    const seen: SceneSpace[] = [];
    const strict: AddOn<MarkLayer> = { ...markAddOn("mark/1"), check: () => [{ level: "error", code: "strict", at: "", message: "The second add-on read the layer." }] };
    const input = scene({ "mark/1": { marks: [] }, "other/1": { marks: [{ id: "m", anchor: onDesk, size: 1 }] } });
    expect(checkLayers(input, [markAddOn("mark/1", seen), strict, markAddOn("other/1", seen)])).toEqual([]);
    expect(seen).toHaveLength(2);
    expect(seen[0]).toBe(seen[1]);
    expect(seen[0]?.scene).toBe(input);
    expect(seen[0]?.frame(onDesk)?.at).toEqual({ x: 2, y: 1.5, z: 0.75 });
  });

  it("lets two add-ons put records on one object, and neither add-on knows the other", () => {
    const input = scene({ "mark/1": { marks: [{ id: "m", anchor: onDesk, size: 1 }] }, "other/1": { marks: [{ id: "m", anchor: onDesk, size: 0 }] } });
    const findings = checkLayers(input, [markAddOn("mark/1"), markAddOn("other/1")]);
    expect(findings.map((finding) => `${finding.layer} ${finding.code}`)).toEqual(["other/1 mark-size"]);
  });
});

describe("readLayer", () => {
  it("reads the layer of an add-on, and gives undefined when the scene has none", () => {
    const addOn = markAddOn("mark/1");
    expect(readLayer(scene(), addOn)).toBeUndefined();
    expect(readLayer(scene({ "mark/1": { marks: [] } }), addOn)).toEqual({ ok: true, layer: { marks: [] } });
    expect(readLayer(scene({ "mark/1": 7 }), addOn)).toEqual({ ok: false, errors: [`The layer "mark/1" has no list "marks".`] });
    // A name of a property of each object is not a layer.
    expect(readLayer(scene({}), markAddOn("constructor"))).toBeUndefined();
  });

  it("moves the anchors of a layer with withAnchors", () => {
    const addOn = markAddOn("mark/1");
    const layer: MarkLayer = { marks: [{ id: "m", anchor: onWall, size: 1 }, { id: "n", anchor: onDesk, size: 2 }] };
    const moved = addOn.withAnchors(layer, new Map([["m", { ...onWall, offset: 2 }]]));
    expect(addOn.anchors(moved)).toEqual(new Map<string, Anchor>([["m", { ...onWall, offset: 2 }], ["n", onDesk]]));
    expect(addOn.anchors(layer).get("m")).toEqual(onWall);
  });
});

describe("the names of the records", () => {
  it("gives one name for each record of the core and of each layer", () => {
    expect(recordName("object", "desk")).toBe("object:desk");
    expect(recordName("electrical/1", "o1")).toBe("electrical/1:o1");
    expect(parseRecordName("electrical/1:o1")).toEqual({ kind: "electrical/1", id: "o1" });
    // A kind has no colon, so an id can have one.
    expect(parseRecordName(recordName("wall", "a:b"))).toEqual({ kind: "wall", id: "a:b" });
    expect(parseRecordName("desk")).toBeUndefined();
    expect(parseRecordName(":desk")).toBeUndefined();
  });

  it("tells the form of a layer name", () => {
    for (const name of ["electrical/1", "light/12", "sound-level/2", "a1/0"]) expect(isLayerName(name)).toBe(true);
    for (const name of ["", "electrical", "Electrical/1", "electrical/v1", "electrical/1/2", "electrical:1/1", "/1", "1a/1", " light/1"]) expect(isLayerName(name)).toBe(false);
  });
});
