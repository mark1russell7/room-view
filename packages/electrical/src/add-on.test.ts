import { checkLayers, expandLevel, layerPart, readLayer, recordName, resultScene, type Anchor, type Level, type Scene, type Survey } from "@mark1russell7/room-view";
import { describe, expect, it } from "vitest";
import { electrical, electricalAddOn } from "./add-on.ts";
import { joinElectrical, outletAnchors, withOutletAnchors } from "./anchors.ts";
import type { ElectricalLayer } from "./layer.ts";

const onWall: Anchor = { on: "wall", wall: "a", face: "left", offset: 1, height: 0.3 };
const onDesk: Anchor = { on: "object", object: "desk", at: [0, 0, 0.75] };

const layer: ElectricalLayer = {
  schema: "electrical/1",
  outlets: [
    { id: "o", anchor: onWall, circuit: "c" },
    { id: "strip", anchor: onDesk, circuit: "c" },
  ],
  circuits: [{ id: "c", breaker: 15, voltage: 120 }],
  feeds: [{ id: "f", object: "desk", outlet: "strip", watts: 90 }],
};

/** One wall along the x axis, 4 long, and a desk. The scene has the layers of the argument. */
function scene(layers?: Readonly<Record<string, unknown>>): Scene {
  return {
    schema: "scene/2",
    room: { schema: "room/2", unit: "m", height: 2.4, wallThickness: 0.2, walls: [{ id: "a", from: [0, 0], to: [4, 0] }] },
    objects: [{ id: "desk", kind: "desk", size: [2, 1, 0.75], at: [2, 1.5] }],
    ...(layers === undefined ? {} : { layers }),
  };
}

describe("the anchors of a layer", () => {
  it("gives the anchor of each outlet", () => {
    expect([...outletAnchors(layer)]).toEqual([
      ["o", onWall],
      ["strip", onDesk],
    ]);
    expect(outletAnchors({ schema: "electrical/1" }).size).toBe(0);
  });

  it("uses the first outlet of an id", () => {
    expect([...outletAnchors({ schema: "electrical/1", outlets: [{ id: "o", anchor: onWall }, { id: "o", anchor: onDesk }] })]).toEqual([["o", onWall]]);
  });

  it("gives a layer with new anchors, and keeps each other fact", () => {
    const moved: Anchor = { ...onWall, offset: 2.5 };
    const next = withOutletAnchors(layer, new Map([["o", moved]]));
    expect(next).toEqual({ ...layer, outlets: [{ id: "o", anchor: moved, circuit: "c" }, { id: "strip", anchor: onDesk, circuit: "c" }] });
    expect(layer.outlets?.[0]?.anchor).toEqual(onWall);
    expect(withOutletAnchors(next, outletAnchors(layer))).toEqual(layer);
  });

  it("keeps a layer with no outlets", () => {
    const bare: ElectricalLayer = { schema: "electrical/1", circuits: [{ id: "c" }] };
    expect(withOutletAnchors(bare, new Map([["o", onWall]]))).toBe(bare);
  });
});

describe("the add-on in the contract of the core", () => {
  it("has the name of its layer", () => {
    expect(electrical.schema).toBe("electrical/1");
  });

  it("reads its layer of a scene", () => {
    expect(readLayer(scene({ "electrical/1": layer }), electrical)).toEqual({ ok: true, layer });
    expect(readLayer(scene(), electrical)).toBeUndefined();
    expect(readLayer(scene({ "electrical/1": { schema: "electrical/1", more: 1 } }), electrical)?.ok).toBe(false);
  });

  it("gives no finding for a correct layer", () => {
    expect(checkLayers(scene({ "electrical/1": layer }), [electrical])).toEqual([]);
  });

  it("gives the faults of the form as findings of the layer", () => {
    const findings = checkLayers(scene({ "electrical/1": { schema: "electrical/1", outlets: [{ id: "o" }] } }), [electrical]);
    expect(findings.map((finding) => [finding.level, finding.code, finding.layer, finding.at])).toEqual([["error", "layer-form", "electrical/1", ""]]);
    expect(findings[0]?.message).toContain('"outlets.0.anchor"');
  });

  it("lets the core examine each anchor: a wall and an object that are not there", () => {
    const bad: ElectricalLayer = { schema: "electrical/1", outlets: [{ id: "o", anchor: { ...onWall, wall: "none" } }, { id: "p", anchor: { on: "object", object: "tower" } }] };
    const findings = checkLayers(scene({ "electrical/1": bad }), [electrical]);
    expect(findings.map((finding) => [finding.level, finding.layer, finding.at])).toEqual([
      ["error", "electrical/1", "o"],
      ["error", "electrical/1", "p"],
    ]);
  });

  it("gives the faults of the meaning, with the name of the record", () => {
    const bad: ElectricalLayer = { ...layer, feeds: [{ id: "f", object: "tower", outlet: "strip", watts: 2000 }] };
    const findings = checkLayers(scene({ "electrical/1": bad }), [electrical]);
    expect(findings.map((finding) => [finding.level, finding.code, recordName(finding.layer, finding.at)])).toEqual([
      ["warning", "circuit-over", "electrical/1:c"],
      ["error", "feed-object", "electrical/1:f"],
    ]);
  });

  it("uses its options in the check", () => {
    const loaded: ElectricalLayer = { ...layer, feeds: [{ id: "f", object: "desk", outlet: "strip", watts: 1500 }] };
    expect(checkLayers(scene({ "electrical/1": loaded }), [electrical]).map((finding) => finding.code)).toEqual(["circuit-over"]);
    expect(checkLayers(scene({ "electrical/1": loaded }), [electricalAddOn({ continuousLoad: 1 })])).toEqual([]);
  });

  it("works next to a layer of a different add-on", () => {
    const findings = checkLayers(scene({ "electrical/1": layer, "pipe/1": { taps: [] } }), [electrical]);
    expect(findings.map((finding) => [finding.code, finding.layer])).toEqual([["layer-unknown", "pipe/1"]]);
  });
});

describe("the layer of a level", () => {
  const kitchen: ElectricalLayer = {
    schema: "electrical/1",
    outlets: [{ id: "o", anchor: onWall, circuit: "c" }],
    circuits: [
      { id: "c", breaker: 20, voltage: 120 },
      { id: "k", breaker: 15 },
    ],
    feeds: [{ id: "f", object: "desk", outlet: "o", watts: 60 }],
  };

  it("gives each outlet and each feed of a room the name of the room, and keeps the records of the level", () => {
    const hall: ElectricalLayer = { schema: "electrical/1", outlets: [{ id: "o", anchor: onDesk }] };
    expect(joinElectrical([layerPart(layer), layerPart(kitchen, "kitchen"), layerPart(hall, "hall")])).toEqual({
      schema: "electrical/1",
      outlets: [
        { id: "o", anchor: onWall, circuit: "c" },
        { id: "strip", anchor: onDesk, circuit: "c" },
        { id: "kitchen/o", anchor: onWall, circuit: "c" },
        { id: "hall/o", anchor: onDesk },
      ],
      // A circuit keeps its `id`, because one circuit can feed outlets in different rooms. The first circuit of an `id` stays.
      circuits: [
        { id: "c", breaker: 15, voltage: 120 },
        { id: "k", breaker: 15 },
      ],
      feeds: [
        { id: "f", object: "desk", outlet: "strip", watts: 90 },
        { id: "kitchen/f", object: "kitchen/desk", outlet: "kitchen/o", watts: 60 },
      ],
    });
  });

  it("has a list only when a part has the list", () => {
    expect(joinElectrical([])).toEqual({ schema: "electrical/1" });
    const empty: ElectricalLayer = { schema: "electrical/1" };
    expect(Object.keys(joinElectrical([layerPart(empty, "a")]))).toEqual(["schema"]);
    const joined = joinElectrical([layerPart<ElectricalLayer>({ schema: "electrical/1", outlets: [] }, "a"), layerPart(empty, "b")]);
    expect(joined).toEqual({ schema: "electrical/1", outlets: [] });
    expect(Object.keys(joined)).toEqual(["schema", "outlets"]);
    expect(Object.keys(joinElectrical([layerPart<ElectricalLayer>({ schema: "electrical/1", circuits: [], feeds: [] })]))).toEqual(["schema", "circuits", "feeds"]);
  });

  it("does not change a part", () => {
    const text = JSON.stringify(kitchen);
    joinElectrical([layerPart(kitchen, "kitchen")]);
    expect(JSON.stringify(kitchen)).toBe(text);
  });

  it("is the function `join` of the add-on", () => {
    expect(electrical.join).toBe(joinElectrical);
    expect(electricalAddOn({ continuousLoad: 1 }).join).toBe(joinElectrical);
  });

  it("gives the layer of a level that the checks of the add-on accept", () => {
    // Each room is 4 by 3, with a desk at its first wall and an outlet on that wall. The circuit of the two outlets is a record of the level.
    const inRoom: ElectricalLayer = {
      schema: "electrical/1",
      outlets: [{ id: "o", anchor: { on: "wall", wall: "s0", face: "right", offset: 1, height: 0.3 }, circuit: "c" }],
      feeds: [{ id: "f", object: "desk", outlet: "o", watts: 90 }],
    };
    const survey: Survey = {
      schema: "survey/2",
      unit: "m",
      height: 2.5,
      wallThickness: 0.15,
      sides: [4, 3, 4, 3].map((length, index) => ({ id: `s${index}`, length, turn: "left" })),
      objects: [{ id: "desk", kind: "desk", wall: "s0", offset: 0.5, width: 1, depth: 0.5, height: 0.8 }],
      layers: { "electrical/1": inRoom },
    };
    const level: Level = {
      schema: "level/2",
      unit: "m",
      rooms: [
        { id: "kitchen", survey },
        { id: "hall", survey },
      ],
      layers: { "electrical/1": { schema: "electrical/1", circuits: [{ id: "c", breaker: 15, voltage: 120 }] } },
    };
    const result = expandLevel(level, { addOns: [electrical] });
    expect(result.layerFindings).toEqual([]);
    const joined: ElectricalLayer = {
      schema: "electrical/1",
      outlets: [
        { id: "kitchen/o", anchor: { on: "wall", wall: "kitchen/s0", face: "left", offset: 1, height: 0.3 }, circuit: "c" },
        { id: "hall/o", anchor: { on: "wall", wall: "hall/s0", face: "left", offset: 1, height: 0.3 }, circuit: "c" },
      ],
      circuits: [{ id: "c", breaker: 15, voltage: 120 }],
      feeds: [
        { id: "kitchen/f", object: "kitchen/desk", outlet: "kitchen/o", watts: 90 },
        { id: "hall/f", object: "hall/desk", outlet: "hall/o", watts: 90 },
      ],
    };
    expect(readLayer(resultScene(result), electrical)).toEqual({ ok: true, layer: joined });
    expect(checkLayers(resultScene(result), [electrical])).toEqual([]);
    // Without the add-on, the result has only the layer of the level record, and a finding tells the layer of each room.
    const bare = expandLevel(level);
    expect(bare.layers).toEqual(level.layers);
    expect(bare.layerFindings.map((finding) => [finding.code, finding.room])).toEqual([
      ["layer-unknown", "kitchen"],
      ["layer-unknown", "hall"],
    ]);
  });
});
