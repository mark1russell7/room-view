import { describe, expect, it } from "vitest";
import { circuitStates, LOAD_LEVELS, NEAR_LIMIT } from "./loads.ts";
import type { Scene } from "./room.ts";
import { SAMPLE_SCENE } from "./sample.ts";

/** A scene with one wall, the circuits `c` and `d`, and the loads of the argument. */
function scene(loads: Scene["loads"], limit = 1000): Scene {
  return {
    schema: "scene/1",
    room: {
      schema: "room/1",
      unit: "m",
      height: 2.4,
      wallThickness: 0.2,
      walls: [{ id: "a", from: [0, 0], to: [4, 0] }],
      outlets: [
        { id: "x", wall: "a", face: "left", offset: 1, height: 0.3, circuit: "c" },
        { id: "y", wall: "a", face: "left", offset: 2, height: 0.3, circuit: "d" },
        { id: "z", wall: "a", face: "left", offset: 3, height: 0.3 },
      ],
      circuits: [
        { id: "c", limit },
        { id: "d", limit: 2000 },
      ],
    },
    objects: [
      { id: "one", kind: "box", size: [1, 1, 1], at: [1, 1], outlet: "x" },
      { id: "two", kind: "box", size: [1, 1, 1], at: [3, 1], outlet: "y" },
      { id: "three", kind: "box", size: [1, 1, 1], at: [1, 3], outlet: "x" },
      { id: "four", kind: "box", size: [1, 1, 1], at: [3, 3], outlet: "z" },
      { id: "five", kind: "box", size: [1, 1, 1], at: [5, 3] },
    ],
    loads,
  };
}

function levelOf(loads: Scene["loads"], limit?: number): string {
  return circuitStates(scene(loads, limit))[0]!.level;
}

describe("circuitStates", () => {
  it("gives the state of each circuit of the sample scene", () => {
    const [a, b] = circuitStates(SAMPLE_SCENE);
    expect(a).toEqual({ circuit: "a", watts: 420, limit: 1440, ratio: 420 / 1440, level: "ok", outlets: ["south-1", "south-2", "east-1", "west-1", "north-1"], objects: ["tower"] });
    expect(b).toEqual({ circuit: "b", watts: 1260, limit: 1440, ratio: 0.875, level: "near", outlets: ["nook-1", "nook-2"], objects: ["node-1", "node-2", "node-3", "node-4"] });
  });

  it("adds the loads of one circuit", () => {
    const states = circuitStates(
      scene([
        { circuit: "c", watts: 300 },
        { circuit: "d", watts: 50 },
        { circuit: "c", watts: 200 },
        { circuit: "none", watts: 999 },
      ]),
    );
    expect(states.map((state) => [state.circuit, state.watts, state.ratio, state.level])).toEqual([
      ["c", 500, 0.5, "ok"],
      ["d", 50, 0.025, "ok"],
    ]);
  });

  it("gives the outlets of a circuit and the objects on those outlets", () => {
    const states = circuitStates(scene([]));
    expect(states.map((state) => [state.outlets, state.objects])).toEqual([
      [["x"], ["one", "three"]],
      [["y"], ["two"]],
    ]);
  });

  it("gives a level from the load and the limit", () => {
    expect(levelOf([{ circuit: "c", watts: 0 }])).toBe("ok");
    expect(levelOf([{ circuit: "c", watts: 799 }])).toBe("ok");
    expect(levelOf([{ circuit: "c", watts: 800 }])).toBe("near");
    expect(levelOf([{ circuit: "c", watts: 1000 }])).toBe("near");
    expect(levelOf([{ circuit: "c", watts: 1001 }])).toBe("over");
    expect(NEAR_LIMIT).toBe(0.8);
    expect(LOAD_LEVELS).toEqual(["unknown", "ok", "near", "over"]);
  });

  it("uses the option near", () => {
    const loads: Scene["loads"] = [{ circuit: "c", watts: 500 }];
    expect(circuitStates(scene(loads), { near: 0.5 })[0]!.level).toBe("near");
    expect(circuitStates(scene(loads), { near: 0.51 })[0]!.level).toBe("ok");
  });

  it("gives the level unknown when it cannot know the load", () => {
    expect(circuitStates(scene(undefined)).map((state) => state.level)).toEqual(["unknown", "unknown"]);
    expect(circuitStates(scene([{ circuit: "d", watts: 10 }])).map((state) => state.level)).toEqual(["unknown", "ok"]);
    expect(circuitStates(scene([{ circuit: "c", watts: 10 }], 0))[0]).toMatchObject({ level: "unknown", ratio: 0, watts: 10, limit: 0 });
    expect(circuitStates(scene([{ circuit: "c", watts: Number.NaN }]))[0]).toMatchObject({ level: "unknown", ratio: 0 });
  });

  it("gives no state for a room with no circuits", () => {
    const record = scene([{ circuit: "c", watts: 10 }]);
    expect(circuitStates({ ...record, room: { ...record.room, circuits: undefined } })).toEqual([]);
  });
});
