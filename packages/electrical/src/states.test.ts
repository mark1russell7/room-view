import type { Anchor } from "@mark1russell7/room-view";
import { describe, expect, it } from "vitest";
import { CIRCUIT_CURRENT, CIRCUIT_LIMIT } from "./formulas.ts";
import type { Circuit, ElectricalLayer, Feed, Outlet } from "./layer.ts";
import { circuitStates, electricalSpace, evaluateCircuit, loadVars, nodeKey, outletLevels } from "./states.ts";

const anchor: Anchor = { on: "floor", at: [1, 1] };

/** This function makes a layer from short records: an outlet is `[id, circuit]`, and a feed is `[id, object, outlet, watts]`. */
function layerOf(
  circuits: readonly Circuit[],
  outlets: readonly (readonly [string, string?])[] = [],
  feeds: readonly (readonly [string, string, string, number?])[] = [],
): ElectricalLayer {
  return {
    schema: "electrical/1",
    circuits,
    outlets: outlets.map(([id, circuit]): Outlet => ({ id, anchor, ...(circuit === undefined ? {} : { circuit }) })),
    feeds: feeds.map(([id, object, outlet, watts]): Feed => ({ id, object, outlet, ...(watts === undefined ? {} : { watts }) })),
  };
}

/** This function gives the state of the first circuit of a layer. */
function first(layer: ElectricalLayer, options?: Parameters<typeof circuitStates>[1]): ReturnType<typeof circuitStates>[number] {
  const state = circuitStates(layer, options)[0];
  if (state === undefined) throw new Error("The layer has no circuit.");
  return state;
}

describe("nodeKey", () => {
  it("joins the kind and the id", () => {
    expect(nodeKey("circuit", "a")).toBe("circuit:a");
    expect(nodeKey("feed", "a")).toBe("feed:a");
  });
});

describe("electricalSpace", () => {
  it("makes a tree: a circuit, its outlets and its other load, then the feeds of each outlet", () => {
    const tree = electricalSpace(layerOf([{ id: "a", breaker: 15, voltage: 120, otherLoad: 60 }], [["o", "a"]], [["f", "desk", "o", 90]]));
    expect(tree.kind).toBe("tree");
    expect([...tree.keys].sort()).toEqual(["circuit:a", "feed:f", "other:a", "outlet:o"]);
    expect(tree.parentOf?.("circuit:a")).toBeUndefined();
    expect(tree.parentOf?.("other:a")).toBe("circuit:a");
    expect(tree.parentOf?.("outlet:o")).toBe("circuit:a");
    expect(tree.parentOf?.("feed:f")).toBe("outlet:o");
    expect(tree.get("circuit:a")).toEqual({ kind: "circuit", breaker: 15, voltage: 120 });
    expect(tree.get("other:a")).toEqual({ kind: "other", watts: 60 });
    expect(tree.get("feed:f")).toEqual({ kind: "feed", watts: 90 });
  });

  it("keeps one id of an outlet, a circuit and a feed apart", () => {
    const tree = electricalSpace(layerOf([{ id: "x" }], [["x", "x"]], [["x", "desk", "x", 5]]));
    expect([...tree.keys].sort()).toEqual(["circuit:x", "feed:x", "outlet:x"]);
  });

  it("makes a root of a record with a parent that the layer does not have", () => {
    const tree = electricalSpace(layerOf([], [["o", "none"], ["p"]], [["f", "desk", "none", 5]]));
    expect(tree.parentOf?.("outlet:o")).toBeUndefined();
    expect(tree.parentOf?.("outlet:p")).toBeUndefined();
    expect(tree.parentOf?.("feed:f")).toBeUndefined();
  });

  it("uses the first record of an id", () => {
    const layer = layerOf(
      [{ id: "a", limit: 100, otherLoad: 10 }, { id: "a", limit: 900, otherLoad: 20 }, { id: "b" }],
      [["o", "a"], ["o", "b"]],
      [["f", "desk", "o", 1], ["f", "desk", "o", 2]],
    );
    const tree = electricalSpace(layer);
    expect(tree.get("circuit:a")).toEqual({ kind: "circuit", limit: 100 });
    expect(tree.get("other:a")).toEqual({ kind: "other", watts: 10 });
    expect(tree.parentOf?.("outlet:o")).toBe("circuit:a");
    expect(tree.get("feed:f")).toEqual({ kind: "feed", watts: 1 });
    expect(circuitStates(layer).map((state) => [state.circuit, state.watts, state.outlets])).toEqual([
      ["a", 11, ["o"]],
      ["b", 0, []],
    ]);
  });

  it("makes an empty tree of an empty layer", () => {
    expect(electricalSpace({ schema: "electrical/1" }).keys).toEqual([]);
    expect(circuitStates({ schema: "electrical/1" })).toEqual([]);
  });
});

describe("loadVars and evaluateCircuit", () => {
  it("gives the default parts, and the parts of the options", () => {
    expect(loadVars()).toEqual({ continuousLoad: 0.8, nearLoad: 0.8 });
    expect(loadVars({ continuousLoad: 1, near: 0.5 })).toEqual({ continuousLoad: 1, nearLoad: 0.5 });
  });

  it("evaluates a program at a circuit", () => {
    const layer = layerOf([{ id: "a", breaker: 20, voltage: 240 }], [["o", "a"]], [["f", "desk", "o", 960]]);
    const tree = electricalSpace(layer);
    expect(evaluateCircuit(CIRCUIT_LIMIT, tree, "a")).toEqual({ ok: true, value: 3840 });
    expect(evaluateCircuit(CIRCUIT_LIMIT, tree, "a", { continuousLoad: 1 })).toEqual({ ok: true, value: 4800 });
    expect(evaluateCircuit(CIRCUIT_CURRENT, tree, "a")).toEqual({ ok: true, value: 4 });
    expect(evaluateCircuit(CIRCUIT_LIMIT, tree, "none").ok).toBe(false);
  });
});

describe("circuitStates", () => {
  it("gives the state of a circuit: the load, the limit, the ratio, the level and its records", () => {
    const layer = layerOf(
      [{ id: "a", breaker: 15, voltage: 120, otherLoad: 120 }],
      [["o1", "a"], ["o2", "a"], ["o3"]],
      [["f1", "desk", "o1", 300], ["f2", "lamp", "o2", 300], ["f3", "desk", "o2"], ["f4", "fan", "o3", 999]],
    );
    expect(circuitStates(layer)).toEqual([
      { circuit: "a", watts: 720, limit: 1440, ratio: 0.5, level: "ok", missing: ["f3"], outlets: ["o1", "o2"], feeds: ["f1", "f2", "f3"], objects: ["desk", "lamp"] },
    ]);
  });

  it("gives each level, with the two boundaries", () => {
    const withLoad = (watts: number): ElectricalLayer => layerOf([{ id: "a", limit: 1440 }], [["o", "a"]], [["f", "desk", "o", watts]]);
    expect(first(withLoad(0)).level).toBe("ok");
    expect(first(withLoad(1151)).level).toBe("ok");
    expect(first(withLoad(1152)).level).toBe("near");
    expect(first(withLoad(1440)).level).toBe("near");
    expect(first(withLoad(1441)).level).toBe("over");
  });

  it("takes the limit from the breaker and the voltage, and the field limit comes first", () => {
    expect(first(layerOf([{ id: "a", breaker: 15, voltage: 120 }])).limit).toBe(1440);
    expect(first(layerOf([{ id: "a", breaker: 15, voltage: 120, limit: 1000 }])).limit).toBe(1000);
    expect(first(layerOf([{ id: "a", breaker: 15 }])).limit).toBeUndefined();
    expect(first(layerOf([{ id: "a" }])).limit).toBeUndefined();
  });

  it("gives the level unknown for a circuit with no known load", () => {
    expect(first(layerOf([{ id: "a", limit: 1440 }]))).toEqual({ circuit: "a", watts: 0, limit: 1440, ratio: 0, level: "unknown", missing: [], outlets: [], feeds: [], objects: [] });
    const state = first(layerOf([{ id: "a", limit: 1440 }], [["o", "a"]], [["f", "desk", "o"]]));
    expect([state.level, state.watts, state.missing]).toEqual(["unknown", 0, ["f"]]);
  });

  it("gives the level unknown for a circuit with no limit above 0", () => {
    const none = first(layerOf([{ id: "a" }], [["o", "a"]], [["f", "desk", "o", 100]]));
    expect([none.level, none.watts, none.limit, none.ratio]).toEqual(["unknown", 100, undefined, undefined]);
    const zero = first(layerOf([{ id: "a", limit: 0 }], [["o", "a"]], [["f", "desk", "o", 100]]));
    expect([zero.level, zero.limit, zero.ratio]).toEqual(["unknown", 0, undefined]);
    expect(first(layerOf([{ id: "a", limit: -10 }], [["o", "a"]], [["f", "desk", "o", 100]])).level).toBe("unknown");
  });

  it("gives the level of the known load when a feed has no watts", () => {
    const state = first(layerOf([{ id: "a", limit: 1000 }], [["o", "a"]], [["f1", "desk", "o", 1200], ["f2", "lamp", "o"]]));
    expect([state.level, state.watts, state.missing]).toEqual(["over", 1200, ["f2"]]);
  });

  it("counts the other load as a known load", () => {
    const state = first(layerOf([{ id: "a", limit: 1000, otherLoad: 900 }]));
    expect([state.level, state.watts, state.ratio]).toEqual(["near", 900, 0.9]);
    expect(first(layerOf([{ id: "a", limit: 1000, otherLoad: 0 }])).level).toBe("ok");
  });

  it("uses the options", () => {
    const layer = layerOf([{ id: "a", breaker: 15, voltage: 120 }], [["o", "a"]], [["f", "desk", "o", 1000]]);
    expect(first(layer).level).toBe("ok");
    expect(first(layer, { near: 0.5 }).level).toBe("near");
    expect(first(layer, { continuousLoad: 0.5 })).toMatchObject({ limit: 900, level: "over" });
    expect(first(layer, { continuousLoad: 1 })).toMatchObject({ limit: 1800, level: "ok" });
  });

  it("names an object with two feeds one time", () => {
    const state = first(layerOf([{ id: "a", limit: 1000 }], [["o1", "a"], ["o2", "a"]], [["f1", "server", "o1", 200], ["f2", "server", "o2", 200]]));
    expect([state.watts, state.feeds, state.objects]).toEqual([400, ["f1", "f2"], ["server"]]);
  });

  it("keeps the circuits apart, in their sequence", () => {
    const layer = layerOf(
      [{ id: "b", limit: 100 }, { id: "a", limit: 100 }],
      [["o1", "a"], ["o2", "b"]],
      [["f1", "desk", "o1", 90], ["f2", "lamp", "o2", 10]],
    );
    expect(circuitStates(layer).map((state) => [state.circuit, state.watts, state.level])).toEqual([
      ["b", 10, "ok"],
      ["a", 90, "near"],
    ]);
  });
});

describe("outletLevels", () => {
  it("gives each outlet the level of its circuit", () => {
    const layer = layerOf(
      [{ id: "a", limit: 100 }, { id: "b", limit: 100 }, { id: "c" }],
      [["o1", "a"], ["o2", "a"], ["o3", "b"], ["o4", "c"], ["o5"], ["o6", "none"]],
      [["f1", "desk", "o1", 150], ["f2", "lamp", "o3", 10]],
    );
    expect([...outletLevels(layer)]).toEqual([
      ["o1", "over"],
      ["o2", "over"],
      ["o3", "ok"],
      ["o4", "unknown"],
    ]);
    expect([...outletLevels(layer, { near: 0.1 })].filter(([outlet]) => outlet === "o3")).toEqual([["o3", "near"]]);
  });
});
