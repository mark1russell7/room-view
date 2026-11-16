import { checkLayers, checkScene, circuitStates as coreStates, outletLevels as coreLevels, type Scene } from "@mark1russell7/room-view";
import { SAMPLE_SCENE } from "@mark1russell7/room-view/sample";
import { describe, expect, it } from "vitest";
import { electrical } from "./add-on.ts";
import { fromSceneV1, type SceneV1 } from "./convert.ts";
import { parseElectrical } from "./layer.ts";
import { circuitStates, outletLevels } from "./states.ts";

describe("fromSceneV1", () => {
  it("moves each record: an outlet to a wall anchor, the loads to the other load, the outlet of an object to a feed", () => {
    const scene: SceneV1 = {
      room: {
        outlets: [{ id: "o", wall: "a", face: "right", offset: 1.5, height: 0.3, circuit: "c" }, { id: "p", wall: "a", face: "left", offset: 3, height: 1.1 }],
        circuits: [{ id: "c", name: "The desk", breaker: 15, voltage: 120, limit: 1440 }, { id: "d", limit: 900 }],
      },
      objects: [{ id: "desk", outlet: "o" }, { id: "lamp" }, { id: "tower", outlet: "p" }],
      loads: [{ circuit: "c", watts: 300 }, { circuit: "c", watts: 120 }],
    };
    expect(fromSceneV1(scene)).toEqual({
      schema: "electrical/1",
      outlets: [
        { id: "o", anchor: { on: "wall", wall: "a", face: "right", offset: 1.5, height: 0.3 }, circuit: "c" },
        { id: "p", anchor: { on: "wall", wall: "a", face: "left", offset: 3, height: 1.1 } },
      ],
      circuits: [{ id: "c", name: "The desk", breaker: 15, voltage: 120, limit: 1440, otherLoad: 420 }, { id: "d", limit: 900 }],
      feeds: [{ id: "feed-desk", object: "desk", outlet: "o" }, { id: "feed-tower", object: "tower", outlet: "p" }],
    });
  });

  it("gives a layer with no lists for a scene with no electrical records", () => {
    expect(fromSceneV1({ room: {} })).toEqual({ schema: "electrical/1" });
    expect(fromSceneV1({ room: { outlets: [], circuits: [] }, objects: [{ id: "desk" }], loads: [] })).toEqual({ schema: "electrical/1" });
  });

  it("keeps a load of 0 as a known load, and gives no other load without a load record", () => {
    const layer = fromSceneV1({ room: { circuits: [{ id: "c", limit: 100 }, { id: "d", limit: 100 }] }, loads: [{ circuit: "c", watts: 0 }] });
    expect(layer.circuits).toEqual([{ id: "c", limit: 100, otherLoad: 0 }, { id: "d", limit: 100 }]);
    expect(circuitStates(layer).map((state) => state.level)).toEqual(["ok", "unknown"]);
  });

  it("gives a circuit with the id of an outlet a new id, and each outlet follows", () => {
    const layer = fromSceneV1({
      room: {
        outlets: [{ id: "a", wall: "w", face: "left", offset: 1, height: 0.3, circuit: "a" }, { id: "circuit-a", wall: "w", face: "left", offset: 2, height: 0.3, circuit: "a" }],
        circuits: [{ id: "a", limit: 100 }],
      },
      objects: [{ id: "desk", outlet: "a" }],
      loads: [{ circuit: "a", watts: 50 }],
    });
    expect(layer.outlets?.map((outlet) => [outlet.id, outlet.circuit])).toEqual([
      ["a", "circuit-a-2"],
      ["circuit-a", "circuit-a-2"],
    ]);
    expect(layer.circuits).toEqual([{ id: "circuit-a-2", limit: 100, otherLoad: 50 }]);
    expect(layer.feeds).toEqual([{ id: "feed-desk", object: "desk", outlet: "a" }]);
    expect(new Set([...(layer.outlets ?? []), ...(layer.circuits ?? []), ...(layer.feeds ?? [])].map((record) => record.id)).size).toBe(4);
  });

  it("gives a feed with the id of a different record a new id", () => {
    const layer = fromSceneV1({
      room: { outlets: [{ id: "feed-desk", wall: "w", face: "left", offset: 1, height: 0.3 }] },
      objects: [{ id: "desk", outlet: "feed-desk" }],
    });
    expect(layer.feeds).toEqual([{ id: "feed-feed-desk", object: "desk", outlet: "feed-desk" }]);
  });

  it("keeps the name of an outlet and of a circuit that the scene does not have, so the check finds them", () => {
    const layer = fromSceneV1({ room: { outlets: [{ id: "o", wall: "w", face: "left", offset: 1, height: 0.3, circuit: "none" }] }, objects: [{ id: "desk", outlet: "gone" }] });
    expect(layer.outlets?.[0]?.circuit).toBe("none");
    expect(layer.feeds?.[0]?.outlet).toBe("gone");
  });

  it("gives no place to a load of a circuit that the room does not have", () => {
    const layer = fromSceneV1({ room: { circuits: [{ id: "c", limit: 100 }] }, loads: [{ circuit: "none", watts: 70 }] });
    expect(layer).toEqual({ schema: "electrical/1", circuits: [{ id: "c", limit: 100 }] });
  });

  it("gives a layer with a correct form", () => {
    const layer = fromSceneV1(SAMPLE_SCENE);
    expect(parseElectrical(JSON.parse(JSON.stringify(layer)))).toEqual({ ok: true, layer });
  });
});

describe("the gate of the move: the sample scene keeps its states", () => {
  const layer = fromSceneV1(SAMPLE_SCENE);

  it("has the sample records", () => {
    expect(layer.outlets).toHaveLength(SAMPLE_SCENE.room.outlets?.length ?? 0);
    expect(layer.circuits).toHaveLength(SAMPLE_SCENE.room.circuits?.length ?? 0);
    expect(layer.outlets?.length).toBeGreaterThan(0);
    expect(layer.circuits?.length).toBeGreaterThan(0);
    expect(layer.feeds?.length).toBeGreaterThan(0);
  });

  it("gives the states of the core: the load, the limit, the ratio, the level, the outlets and the objects", () => {
    const core = coreStates(SAMPLE_SCENE);
    const own = circuitStates(layer);
    expect(own.map((state) => ({ circuit: state.circuit, watts: state.watts, limit: state.limit, ratio: state.ratio ?? 0, level: state.level, outlets: state.outlets, objects: state.objects }))).toEqual(
      core.map((state) => ({ circuit: state.circuit, watts: state.watts, limit: state.limit, ratio: state.ratio, level: state.level, outlets: state.outlets, objects: state.objects })),
    );
    expect(new Set(own.map((state) => state.level)).size).toBeGreaterThan(1);
  });

  it("gives the levels of the outlets of the core", () => {
    expect([...outletLevels(layer)].sort()).toEqual([...coreLevels(SAMPLE_SCENE)].sort());
  });

  it("gives the states of the core at each near part", () => {
    for (const near of [0.2, 0.5, 0.875, 0.9, 1]) {
      expect(circuitStates(layer, { near }).map((state) => state.level)).toEqual(coreStates(SAMPLE_SCENE, { near }).map((state) => state.level));
    }
  });

  it("names each feed as a load that is not known: a scene/1 has only the total of a circuit", () => {
    expect(circuitStates(layer).flatMap((state) => state.missing)).toEqual((layer.feeds ?? []).map((feed) => feed.id));
  });

  it("has no error as a layer of the sample scene", () => {
    const scene: Scene = { ...SAMPLE_SCENE, layers: { "electrical/1": layer } };
    expect(checkScene(scene).filter((finding) => finding.level === "error")).toEqual([]);
    expect(checkLayers(scene, [electrical]).filter((finding) => finding.level === "error")).toEqual([]);
  });
});
