import { describe, expect, it } from "vitest";
import type { Anchor, SceneSpace } from "./anchors.ts";
import { parseRecordName, recordName, solidRecord } from "./check.ts";
import { joinAddOn, joinMarks, markAddOn, type MarkLayer } from "./layers.fixture.ts";
import { checkLayers, joinLayers, layerPart, moveLayers, readLayer, roomName, type AddOn, type LayerFinding } from "./layers.ts";
import { isLayerName, type Scene } from "./room.ts";
import { SAMPLE_SCENE } from "./sample.ts";
import { sceneSolids } from "./solids.ts";

/** One wall along the x axis, 4 long, and a desk. */
function scene(layers?: Readonly<Record<string, unknown>>): Scene {
  return {
    schema: "scene/2",
    room: { schema: "room/2", unit: "m", height: 2.4, wallThickness: 0.2, walls: [{ id: "a", from: [0, 0], to: [4, 0] }] },
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

  it("gives each solid the name of its record", () => {
    for (const solid of sceneSolids(SAMPLE_SCENE)) {
      const kind = solid.kind === "glass" ? "opening" : solid.kind;
      expect(solidRecord(solid.kind, solid.source), solid.id).toBe(recordName(kind, solid.source));
    }
    expect(solidRecord("wall", "south")).toBe("wall:south");
    expect(solidRecord("object", "desk")).toBe("object:desk");
    // The glass of a window is a solid of its opening.
    expect(solidRecord("glass", "window-east")).toBe("opening:window-east");
    expect(parseRecordName(solidRecord("glass", "window-east"))).toEqual({ kind: "opening", id: "window-east" });
  });

  it("tells the form of a layer name", () => {
    for (const name of ["electrical/1", "light/12", "sound-level/2", "a1/0"]) expect(isLayerName(name)).toBe(true);
    for (const name of ["", "electrical", "Electrical/1", "electrical/v1", "electrical/1/2", "electrical:1/1", "/1", "1a/1", " light/1"]) expect(isLayerName(name)).toBe(false);
  });
});

/** This function moves an anchor on a wall up by 1, and it keeps each other anchor. */
function up(anchor: Anchor): Anchor {
  return anchor.on === "wall" ? { ...anchor, height: anchor.height + 1 } : anchor;
}

const higher: Anchor = { ...onWall, height: 1.3 };

describe("moveLayers", () => {
  it("gives no layer and no finding for no layers", () => {
    expect(moveLayers(undefined, [markAddOn("mark/1")], up)).toEqual({ layers: {}, findings: [] });
    expect(moveLayers({}, [], up)).toEqual({ layers: {}, findings: [] });
  });

  it("changes each anchor of each layer, keeps each other fact, and gives the layers in the order of their names", () => {
    const layers = {
      "b/1": { marks: [{ id: "m", anchor: onWall, size: 1 }] },
      "a/1": { marks: [{ id: "m", anchor: onDesk, size: 2 }, { id: "n", anchor: onWall, size: 3 }] },
    };
    const before = structuredClone(layers);
    const moved = moveLayers(layers, [markAddOn("b/1"), markAddOn("a/1")], up);
    expect(moved.findings).toEqual([]);
    expect(Object.keys(moved.layers)).toEqual(["a/1", "b/1"]);
    expect(moved.layers).toEqual({
      "a/1": { marks: [{ id: "m", anchor: onDesk, size: 2 }, { id: "n", anchor: higher, size: 3 }] },
      "b/1": { marks: [{ id: "m", anchor: higher, size: 1 }] },
    });
    expect(layers).toEqual(before);
  });

  it("gives the same layers for a change that keeps each anchor", () => {
    const layers = { "a/1": { marks: [{ id: "m", anchor: onDesk, size: 2 }] }, "b/1": { marks: [{ id: "m", anchor: onWall, size: 1 }] } };
    expect(moveLayers(layers, [markAddOn("a/1"), markAddOn("b/1")], (anchor) => anchor)).toEqual({ layers, findings: [] });
  });

  it("does not carry a layer that it cannot read, and tells each such layer", () => {
    const layers = { Mark: { marks: [] }, "pipe/1": { taps: [] }, "mark/1": { lines: [] }, "good/1": { marks: [] } };
    const moved = moveLayers(layers, [markAddOn("Mark"), markAddOn("mark/1"), markAddOn("good/1")], up);
    expect(moved.layers).toEqual({ "good/1": { marks: [] } });
    const findings: LayerFinding[] = [
      {
        level: "error",
        code: "layer-name",
        layer: "Mark",
        at: "",
        message: `The layer "Mark" has a name that is not a word, a slash and a version, for example "electrical/1". The result does not have the layer.`,
      },
      { level: "error", code: "layer-form", layer: "mark/1", at: "", message: `The layer "mark/1" has no list "marks".` },
      { level: "error", code: "layer-unknown", layer: "pipe/1", at: "", message: `No add-on of the list reads the layer "pipe/1". The result does not have the layer.` },
    ];
    expect(moved.findings).toEqual(findings);
  });

  it("gives one finding for each fault of the form of a layer", () => {
    const strict: AddOn<MarkLayer> = { ...markAddOn("mark/1"), parse: () => ({ ok: false, errors: ["The first fault.", "The second fault."] }) };
    const moved = moveLayers({ "mark/1": { marks: [] } }, [strict], up, "hall");
    expect(moved.layers).toEqual({});
    expect(moved.findings.map((finding) => [finding.code, finding.message, finding.room])).toEqual([
      ["layer-form", "The first fault.", "hall"],
      ["layer-form", "The second fault.", "hall"],
    ]);
  });

  it("gives each finding the room of the layers", () => {
    const moved = moveLayers({ "pipe/1": {}, Mark: {}, "mark/1": {} }, [markAddOn("mark/1")], up, "kitchen");
    expect(moved.layers).toEqual({});
    expect(moved.findings.map((finding) => [finding.code, finding.room])).toEqual([
      ["layer-name", "kitchen"],
      ["layer-form", "kitchen"],
      ["layer-unknown", "kitchen"],
    ]);
    expect(moved.findings[0]?.message).toBe(
      `The layer "Mark" of the room "kitchen" has a name that is not a word, a slash and a version, for example "electrical/1". The result does not have the layer.`,
    );
    expect(moved.findings[2]?.message).toBe(`No add-on of the list reads the layer "pipe/1" of the room "kitchen". The result does not have the layer.`);
    // A finding with no room has no field `room`.
    expect("room" in (moveLayers({ "pipe/1": {} }, [], up).findings[0] ?? {})).toBe(false);
  });

  it("uses the first add-on of a name", () => {
    const second: AddOn<MarkLayer> = { ...markAddOn("mark/1"), withAnchors: () => ({ marks: [] }) };
    const layers = { "mark/1": { marks: [{ id: "m", anchor: onWall, size: 1 }] } };
    expect(moveLayers(layers, [markAddOn("mark/1"), second], up).layers).toEqual({ "mark/1": { marks: [{ id: "m", anchor: higher, size: 1 }] } });
  });
});

describe("joinLayers", () => {
  const kitchen = { room: "kitchen", layers: { "mark/1": { marks: [{ id: "m", anchor: onWall, size: 1 }] } } };
  const hall = { room: "hall", layers: { "mark/1": { marks: [{ id: "m", anchor: onDesk, size: 2 }] } } };

  it("gives the name of a record of a room in a level", () => {
    expect(roomName("kitchen", "o1")).toBe("kitchen/o1");
  });

  it("makes a part with the name of each record: the rule of `roomName` for a room, and the same `id` for the level record", () => {
    const layer = { marks: [] };
    const ofRoom = layerPart(layer, "kitchen");
    expect([ofRoom.room, ofRoom.layer, ofRoom.name("o1")]).toEqual(["kitchen", layer, "kitchen/o1"]);
    const ofLevel = layerPart(layer);
    expect("room" in ofLevel).toBe(false);
    expect([ofLevel.layer, ofLevel.name("o1")]).toEqual([layer, "o1"]);
  });

  it("gives no layer for no layers", () => {
    expect(joinLayers(undefined, [], [joinAddOn("mark/1")])).toEqual({ layers: {}, findings: [] });
    expect(joinLayers(undefined, [{ room: "kitchen", layers: undefined }], [])).toEqual({ layers: {}, findings: [] });
    expect(joinLayers({}, [{ room: "kitchen", layers: {} }], [])).toEqual({ layers: {}, findings: [] });
  });

  it("joins the layer of the level record, then the layer of each room, with the function of the add-on", () => {
    const own = { "mark/1": { marks: [{ id: "top", anchor: onWall, size: 3 }] } };
    expect(joinLayers(own, [kitchen, hall], [joinAddOn("mark/1")])).toEqual({
      layers: {
        "mark/1": {
          marks: [
            { id: "top", anchor: onWall, size: 3 },
            { id: "kitchen/m", anchor: onWall, size: 1 },
            { id: "hall/m", anchor: onDesk, size: 2 },
          ],
        },
      },
      findings: [],
    });
    expect(joinLayers(undefined, [hall], [joinAddOn("mark/1")]).layers).toEqual({ "mark/1": { marks: [{ id: "hall/m", anchor: onDesk, size: 2 }] } });
  });

  it("gives the layers in the order of their names", () => {
    const rooms = [{ room: "r", layers: { "c/1": { marks: [] }, "a/1": { marks: [] } } }];
    const result = joinLayers({ "b/1": { marks: [] } }, rooms, [joinAddOn("a/1"), joinAddOn("b/1"), joinAddOn("c/1")]);
    expect(Object.keys(result.layers)).toEqual(["a/1", "b/1", "c/1"]);
    expect(result.findings).toEqual([]);
  });

  it("keeps a layer that only the level record has, with each name and each form", () => {
    const own = { "pipe/1": { taps: [] }, Mark: 5, "mark/1": { lines: [] } };
    const result = joinLayers(own, [{ room: "kitchen", layers: {} }], [joinAddOn("mark/1")]);
    expect(result).toEqual({ layers: own, findings: [] });
    expect(result.layers["pipe/1"]).toBe(own["pipe/1"]);
    expect(Object.keys(result.layers)).toEqual(["Mark", "mark/1", "pipe/1"]);
  });

  it("does not carry the layer of a room with no add-on, and keeps the layer of the level record", () => {
    const own = { "mark/1": { marks: [] } };
    const result = joinLayers(own, [kitchen], []);
    expect(result.layers).toEqual(own);
    expect(result.layers["mark/1"]).toBe(own["mark/1"]);
    const findings: LayerFinding[] = [
      {
        level: "error",
        code: "layer-unknown",
        layer: "mark/1",
        at: "",
        message: `No add-on of the list reads the layer "mark/1" of the room "kitchen". The result does not have the layer.`,
        room: "kitchen",
      },
    ];
    expect(result.findings).toEqual(findings);
    expect(joinLayers(undefined, [kitchen], [])).toEqual({ layers: {}, findings });
  });

  it("does not carry the layer of a room when the add-on has no function `join`", () => {
    const own = { "mark/1": { marks: [{ id: "top", anchor: onWall, size: 3 }] } };
    const result = joinLayers(own, [kitchen, hall], [markAddOn("mark/1")]);
    expect(result.layers).toEqual(own);
    const finding = (room: string): LayerFinding => ({
      level: "error",
      code: "layer-unknown",
      layer: "mark/1",
      at: "",
      message: `The add-on of the layer "mark/1" has no function "join", so the result does not have the layer of the room "${room}".`,
      room,
    });
    expect(result.findings).toEqual([finding("kitchen"), finding("hall")]);
    expect(joinLayers(undefined, [kitchen], [markAddOn("mark/1")])).toEqual({ layers: {}, findings: [finding("kitchen")] });
  });

  it("tells the layer of a room with a name that is not a layer name", () => {
    const result = joinLayers({ Mark: 5 }, [{ room: "kitchen", layers: { Mark: { marks: [] } } }], [joinAddOn("Mark")]);
    expect(result.layers).toEqual({ Mark: 5 });
    const findings: LayerFinding[] = [
      {
        level: "error",
        code: "layer-name",
        layer: "Mark",
        at: "",
        message: `The layer "Mark" of the room "kitchen" has a name that is not a word, a slash and a version, for example "electrical/1". The result does not have the layer.`,
        room: "kitchen",
      },
    ];
    expect(result.findings).toEqual(findings);
  });

  it("does not join a part with a fault in its form, and joins each other part", () => {
    const result = joinLayers({ "mark/1": { lines: [] } }, [kitchen, { room: "hall", layers: { "mark/1": 7 } }], [joinAddOn("mark/1")]);
    expect(result.layers).toEqual({ "mark/1": { marks: [{ id: "kitchen/m", anchor: onWall, size: 1 }] } });
    const findings: LayerFinding[] = [
      { level: "error", code: "layer-form", layer: "mark/1", at: "", message: `The layer "mark/1" has no list "marks".` },
      { level: "error", code: "layer-form", layer: "mark/1", at: "", message: `The layer "mark/1" has no list "marks".`, room: "hall" },
    ];
    expect(result.findings).toEqual(findings);
    // When each part has a fault, the result has no layer of the name.
    expect(joinLayers({ "mark/1": 1 }, [{ room: "hall", layers: { "mark/1": 7 } }], [joinAddOn("mark/1")]).layers).toEqual({});
    // When only the part of the level record is good, the function `join` gets that one part.
    const top = { marks: [{ id: "top", anchor: onWall, size: 3 }] };
    expect(joinLayers({ "mark/1": top }, [{ room: "hall", layers: { "mark/1": 7 } }], [joinAddOn("mark/1")]).layers).toEqual({ "mark/1": top });
  });

  it("does not use a name of the object prototype as a layer of the level record or of a room", () => {
    const rooms = [{ room: "kitchen", layers: { "mark/1": { marks: [] } } }];
    expect(joinLayers({}, rooms, [joinAddOn("mark/1")]).layers).toEqual({ "mark/1": { marks: [] } });
    expect(joinLayers({}, [{ room: "kitchen", layers: {} }], [joinAddOn("constructor")]).layers).toEqual({});
    // A room has a layer with such a name, and the level record has none. The result has no layer of the name.
    const named = joinLayers({}, [{ room: "kitchen", layers: { constructor: { marks: [] } } }], [joinAddOn("constructor")]);
    expect(Object.keys(named.layers)).toEqual([]);
    expect(named.findings.map((finding) => [finding.code, finding.layer, finding.room])).toEqual([["layer-name", "constructor", "kitchen"]]);
    // The level record has a layer with such a name, and no room has one. The layer stays, and no finding names a room.
    const kept = joinLayers({ constructor: 5 }, [{ room: "kitchen", layers: {} }], []);
    expect(Object.keys(kept.layers)).toEqual(["constructor"]);
    expect(kept.findings).toEqual([]);
  });

  it("uses the function `join` as a method of its add-on", () => {
    const addOn: AddOn<MarkLayer> = {
      ...markAddOn("mark/1"),
      join(parts) {
        return { marks: joinMarks(parts).marks.map((mark) => ({ ...mark, id: `${this.schema}:${mark.id}` })) };
      },
    };
    expect(joinLayers(undefined, [kitchen], [addOn]).layers).toEqual({ "mark/1": { marks: [{ id: "mark/1:kitchen/m", anchor: onWall, size: 1 }] } });
  });
});
