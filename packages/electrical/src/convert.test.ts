import {
  checkLayers,
  checkScene,
  circuitStates as coreStates,
  expandLevel,
  expandSurvey,
  outletLevels as coreLevels,
  resultScene,
  type Level,
  type Scene,
  type Survey,
} from "@mark1russell7/room-view";
import { SAMPLE_LEVEL, SAMPLE_SCENE, SAMPLE_SURVEY } from "@mark1russell7/room-view/sample";
import { describe, expect, it } from "vitest";
import { electrical } from "./add-on.ts";
import { fromLevelV1, fromSceneV1, fromSurveyV1, type SceneV1, type SurveyV1 } from "./convert.ts";
import { ELECTRICAL_SCHEMA, type ElectricalLayer } from "./layer.ts";
import { parseElectrical } from "./schema.ts";
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

  it("gives a second outlet of an id a new id, and a feed names the first one", () => {
    const layer = fromSceneV1({
      room: {
        outlets: [
          { id: "o", wall: "w", face: "left", offset: 1, height: 0.3 },
          { id: "o", wall: "w", face: "left", offset: 2, height: 0.3 },
        ],
      },
      objects: [{ id: "desk", outlet: "o" }],
    });
    expect(layer.outlets?.map((outlet) => [outlet.id, outlet.anchor.on === "wall" ? outlet.anchor.offset : undefined])).toEqual([
      ["o", 1],
      ["outlet-o", 2],
    ]);
    expect(layer.feeds).toEqual([{ id: "feed-desk", object: "desk", outlet: "o" }]);
  });

  it("gives the loads of an id to the first circuit of that id", () => {
    const layer = fromSceneV1({
      room: {
        circuits: [
          { id: "a", limit: 100 },
          { id: "a", limit: 200 },
        ],
      },
      loads: [
        { circuit: "a", watts: 50 },
        { circuit: "a", watts: 25 },
      ],
    });
    expect(layer.circuits).toEqual([
      { id: "a", limit: 100, otherLoad: 75 },
      { id: "circuit-a", limit: 200 },
    ]);
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

describe("fromSurveyV1", () => {
  it("moves each record: an outlet to a wall anchor on its side, a circuit, the outlet of an object to a feed", () => {
    const survey: SurveyV1 = {
      outlets: [
        { id: "o", wall: "s0", offset: 1.5, height: 0.3, circuit: "c" },
        { id: "p", wall: "s1", offset: 3, height: 1.1 },
      ],
      circuits: [
        { id: "c", name: "The desk", breaker: 15, voltage: 120, limit: 1440 },
        { id: "d", limit: 900 },
      ],
      objects: [{ id: "desk", outlet: "o" }, { id: "lamp" }, { id: "tower", outlet: "p" }],
    };
    expect(fromSurveyV1(survey)).toEqual({
      schema: "electrical/1",
      outlets: [
        { id: "o", anchor: { on: "wall", wall: "s0", face: "left", offset: 1.5, height: 0.3 }, circuit: "c" },
        { id: "p", anchor: { on: "wall", wall: "s1", face: "left", offset: 3, height: 1.1 } },
      ],
      circuits: [
        { id: "c", name: "The desk", breaker: 15, voltage: 120, limit: 1440 },
        { id: "d", limit: 900 },
      ],
      feeds: [
        { id: "feed-desk", object: "desk", outlet: "o" },
        { id: "feed-tower", object: "tower", outlet: "p" },
      ],
    });
  });

  it("gives a layer with no lists for a survey with no electrical records", () => {
    expect(fromSurveyV1({})).toEqual({ schema: "electrical/1" });
    expect(fromSurveyV1({ outlets: [], circuits: [], objects: [{ id: "desk" }] })).toEqual({ schema: "electrical/1" });
  });

  it("keeps the id of a circuit: an outlet with that id gets a new id, and each feed follows", () => {
    const layer = fromSurveyV1({
      outlets: [
        { id: "a", wall: "w", offset: 1, height: 0.3, circuit: "a" },
        { id: "b", wall: "w", offset: 2, height: 0.3, circuit: "a" },
      ],
      circuits: [{ id: "a", limit: 100 }],
      objects: [
        { id: "desk", outlet: "a" },
        { id: "lamp", outlet: "b" },
      ],
    });
    expect(layer.circuits).toEqual([{ id: "a", limit: 100 }]);
    expect(layer.outlets?.map((outlet) => [outlet.id, outlet.circuit])).toEqual([
      ["outlet-a", "a"],
      ["b", "a"],
    ]);
    expect(layer.feeds).toEqual([
      { id: "feed-desk", object: "desk", outlet: "outlet-a" },
      { id: "feed-lamp", object: "lamp", outlet: "b" },
    ]);
    // The same records as a scene keep the id of the outlet, and the circuit gets the new id.
    const scene = fromSceneV1({ room: { outlets: [{ id: "a", wall: "w", face: "left", offset: 1, height: 0.3, circuit: "a" }], circuits: [{ id: "a", limit: 100 }] } });
    expect([scene.outlets?.[0]?.id, scene.circuits?.[0]?.id]).toEqual(["a", "circuit-a"]);
  });

  it("gives a second circuit of an id a new id, and an outlet names the first one", () => {
    const layer = fromSurveyV1({
      outlets: [{ id: "o", wall: "w", offset: 1, height: 0.3, circuit: "a" }],
      circuits: [
        { id: "a", limit: 100 },
        { id: "a", limit: 200 },
      ],
    });
    expect(layer.circuits).toEqual([
      { id: "a", limit: 100 },
      { id: "circuit-a", limit: 200 },
    ]);
    expect(layer.outlets?.[0]?.circuit).toBe("a");
  });

  it("gives a layer with a correct form, and does not change the survey", () => {
    const text = JSON.stringify(SAMPLE_SURVEY);
    const layer = fromSurveyV1(SAMPLE_SURVEY);
    expect(parseElectrical(JSON.parse(JSON.stringify(layer)))).toEqual({ ok: true, layer });
    expect(layer.outlets).toHaveLength(SAMPLE_SURVEY.outlets?.length ?? 0);
    expect(layer.outlets?.length).toBeGreaterThan(0);
    expect(JSON.stringify(SAMPLE_SURVEY)).toBe(text);
  });
});

describe("fromLevelV1", () => {
  it("gives the circuits of the level, and no list for a level with no circuit", () => {
    const circuits = [
      { id: "c", name: "Kitchen", breaker: 20, voltage: 120, limit: 1920 },
      { id: "d", limit: 900 },
    ];
    expect(fromLevelV1({ circuits })).toEqual({ schema: "electrical/1", circuits });
    expect(fromLevelV1({})).toEqual({ schema: "electrical/1" });
    expect(fromLevelV1({ circuits: [] })).toEqual({ schema: "electrical/1" });
  });
});

/** This function gives a length in feet from a length in meters. */
const feet = (meters: number): number => meters / 0.3048;

/**
 * A level of two rooms with one door between them. Room A is 4 m by 3 m. Room B is 3 m by 3 m, and its survey is in feet.
 * The level has two circuits, and each room has two circuits. An outlet of room B names a circuit of room A.
 * The circuit `both` of room A and the circuit `main` of room B have the `id` of a circuit of the level, so the circuit of the level stays.
 */
const SHARED: Level = {
  schema: "level/1",
  unit: "m",
  circuits: [
    { id: "main", name: "Main", breaker: 20, voltage: 120, limit: 1920 },
    { id: "both", limit: 500 },
  ],
  rooms: [
    {
      id: "a",
      survey: {
        schema: "survey/1",
        unit: "m",
        height: 2.5,
        wallThickness: 0.15,
        sides: [
          { id: "s0", length: 4, turn: "left" },
          { id: "s1", length: 3, turn: "left" },
          { id: "s2", length: 4, turn: "left" },
          { id: "s3", length: 3, turn: "left" },
        ],
        openings: [{ id: "d", wall: "s1", kind: "door", offset: 1, width: 0.9, height: 2.05 }],
        outlets: [
          { id: "o", wall: "s0", offset: 1, height: 0.3, circuit: "main" },
          { id: "p", wall: "s2", offset: 2.5, height: 0.3, circuit: "desk" },
          { id: "q", wall: "s3", offset: 1, height: 1.1 },
        ],
        circuits: [
          { id: "desk", name: "Desk", breaker: 15, voltage: 120, limit: 1440 },
          { id: "both", limit: 700 },
        ],
        objects: [{ id: "pc", kind: "computer", wall: "s0", offset: 0.5, width: 0.5, depth: 0.5, height: 0.5, outlet: "o" }],
      },
    },
    {
      id: "b",
      survey: {
        schema: "survey/1",
        unit: "ft",
        height: feet(2.5),
        wallThickness: feet(0.15),
        sides: [
          { id: "s0", length: feet(3), turn: "left" },
          { id: "s1", length: feet(3), turn: "left" },
          { id: "s2", length: feet(3), turn: "left" },
          { id: "s3", length: feet(3), turn: "left" },
        ],
        openings: [{ id: "d", wall: "s3", kind: "door", offset: feet(0.65), width: feet(0.9), height: feet(2.05) }],
        outlets: [
          { id: "o", wall: "s1", offset: 3, height: 1, circuit: "desk" },
          { id: "r", wall: "s2", offset: 4, height: 1.5, circuit: "both" },
        ],
        circuits: [
          { id: "main", limit: 100 },
          { id: "lamp", limit: 300 },
        ],
        objects: [{ id: "lamp", kind: "lamp", wall: "s2", offset: 3, width: 1, depth: 1, height: 4, outlet: "r" }],
      },
    },
  ],
  connections: [{ id: "ab", from: { room: "a", opening: "d" }, to: { room: "b", opening: "d" } }],
};

/** This function gives a survey with a layer in the place of its old electrical records. */
function layeredSurvey(survey: Survey): Survey {
  return {
    ...survey,
    outlets: undefined,
    circuits: undefined,
    ...(survey.objects === undefined ? {} : { objects: survey.objects.map((object) => ({ ...object, outlet: undefined })) }),
    layers: { [ELECTRICAL_SCHEMA]: fromSurveyV1(survey) },
  };
}

/** This function gives a level with layers in the place of its old electrical records, and of those of each room. */
function layeredLevel(level: Level): Level {
  return {
    ...level,
    circuits: undefined,
    rooms: level.rooms.map((room) => ({ ...room, survey: layeredSurvey(room.survey) })),
    layers: { [ELECTRICAL_SCHEMA]: fromLevelV1(level) },
  };
}

/** This function gives the electrical layer of a result of the core. */
function layerOf(result: { readonly layers?: Readonly<Record<string, unknown>> | undefined }): ElectricalLayer {
  const read = parseElectrical(result.layers?.[ELECTRICAL_SCHEMA]);
  if (!read.ok) throw new Error("The result has no electrical layer.");
  return read.layer;
}

/** This function gives the facts of a layer that a join keeps: the circuits, the outlets, the two ends of each feed and the state of each circuit. */
function facts(layer: ElectricalLayer): unknown {
  return {
    circuits: layer.circuits,
    outlets: layer.outlets,
    feeds: (layer.feeds ?? []).map((feed) => [feed.object, feed.outlet]),
    states: circuitStates(layer).map((state) => [state.circuit, state.level, state.limit, state.outlets, state.feeds.length]),
  };
}

const errorsOf = (scene: Scene): readonly unknown[] => checkLayers(scene, [electrical]).filter((finding) => finding.level === "error");

describe("the gate of the move: a survey and a level keep their electrical records", () => {
  it("gives the layer of the old room record of the sample survey", () => {
    const old = fromSceneV1(resultScene(expandSurvey(SAMPLE_SURVEY)));
    const result = expandSurvey(layeredSurvey(SAMPLE_SURVEY), { addOns: [electrical] });
    expect(result.layerFindings).toEqual([]);
    expect(result.room.outlets).toBeUndefined();
    expect(result.room.circuits).toBeUndefined();
    expect(layerOf(result)).toEqual(old);
    expect(old.outlets?.length).toBeGreaterThan(0);
    expect(old.feeds?.length).toBeGreaterThan(0);
    expect(errorsOf(resultScene(result))).toEqual([]);
  });

  it("gives the records of the old join: the sample apartment, and a level with circuits of the level and of two rooms", () => {
    for (const level of [SAMPLE_LEVEL, SHARED]) {
      const old = fromSceneV1(resultScene(expandLevel(level)));
      const result = expandLevel(layeredLevel(level), { addOns: [electrical] });
      expect(result.layerFindings).toEqual([]);
      expect(result.room.outlets).toBeUndefined();
      expect(result.room.circuits).toBeUndefined();
      expect(facts(layerOf(result))).toEqual(facts(old));
      expect(errorsOf(resultScene(result))).toEqual([]);
    }
  });

  it("moves only the circuits of the level record with fromLevelV1: fromSurveyV1 gives the layer of each room", () => {
    expect(fromLevelV1(SHARED)).toEqual({ schema: "electrical/1", circuits: SHARED.circuits });
  });

  it("has the cases of the level with two rooms: a circuit of a different room, a circuit of the level first, a survey in feet", () => {
    const layer = layerOf(expandLevel(layeredLevel(SHARED), { addOns: [electrical] }));
    expect(layer.circuits?.map((circuit) => [circuit.id, circuit.limit])).toEqual([
      ["main", 1920],
      ["both", 500],
      ["desk", 1440],
      ["lamp", 300],
    ]);
    expect(layer.outlets?.map((outlet) => [outlet.id, outlet.circuit])).toEqual([
      ["a/o", "main"],
      ["a/p", "desk"],
      ["a/q", undefined],
      ["b/o", "desk"],
      ["b/r", "both"],
    ]);
    expect(layer.feeds).toEqual([
      { id: "a/feed-pc", object: "a/pc", outlet: "a/o" },
      { id: "b/feed-lamp", object: "b/lamp", outlet: "b/r" },
    ]);
    // The outlet of room B is 3 ft along its side and 1 ft above the floor, in the meters of the level.
    const anchor = layer.outlets?.[3]?.anchor;
    expect(anchor?.on === "wall" ? [anchor.wall, anchor.offset, anchor.height] : []).toEqual(["b/s1", expect.closeTo(0.9144, 9), expect.closeTo(0.3048, 9)]);
  });

  it("keeps the circuit of an outlet of a different room when an outlet has the id of that circuit", () => {
    const a = SHARED.rooms[0];
    const b = SHARED.rooms[1];
    if (a === undefined || b === undefined) throw new Error("The level has two rooms.");
    // Room A has an outlet with the id of its circuit "desk". The outlet "o" of room B names that circuit.
    const outlets = [...(a.survey.outlets ?? []), { id: "desk", wall: "s0", offset: 3, height: 0.3, circuit: "desk" }];
    const level: Level = { ...SHARED, rooms: [{ ...a, survey: { ...a.survey, outlets } }, b] };
    const old = circuitStates(fromSceneV1(resultScene(expandLevel(level))));
    const result = expandLevel(layeredLevel(level), { addOns: [electrical] });
    const states = circuitStates(layerOf(result));
    expect(states.map((state) => [state.circuit, state.level, state.outlets.length])).toEqual(old.map((state) => [state.circuit, state.level, state.outlets.length]));
    expect(states.find((state) => state.circuit === "desk")?.outlets).toEqual(["a/p", "a/outlet-desk", "b/o"]);
    expect(errorsOf(resultScene(result))).toEqual([]);
  });
});
