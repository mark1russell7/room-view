import { sceneSpace, type Anchor, type Scene } from "@mark1russell7/room-view";
import { describe, expect, it } from "vitest";
import { ELECTRICAL_CODES, checkElectrical, type ElectricalFault } from "./check.ts";
import type { ElectricalLayer } from "./layer.ts";

/** One wall along the x axis, a desk and a lamp. */
const scene: Scene = {
  schema: "scene/2",
  room: { schema: "room/2", unit: "m", height: 2.4, wallThickness: 0.2, walls: [{ id: "a", from: [0, 0], to: [4, 0] }] },
  objects: [
    { id: "desk", kind: "desk", size: [2, 1, 0.75], at: [2, 1.5] },
    { id: "lamp", kind: "lamp", size: [0.3, 0.3, 1.5], at: [3.5, 1.5] },
  ],
};
const space = sceneSpace(scene);
const anchor: Anchor = { on: "wall", wall: "a", face: "left", offset: 1, height: 0.3 };

/** A correct layer: one circuit with its rated limit, one outlet and one feed. */
const good: ElectricalLayer = {
  schema: "electrical/1",
  outlets: [{ id: "o", anchor, circuit: "c" }],
  circuits: [{ id: "c", breaker: 15, voltage: 120, limit: 1440 }],
  feeds: [{ id: "f", object: "desk", outlet: "o", watts: 90 }],
};

/** This function gives the code, the level and the place of each fault of a layer. */
function codes(layer: ElectricalLayer, options?: Parameters<typeof checkElectrical>[2]): readonly string[] {
  return checkElectrical(layer, space, options).map((fault) => `${fault.level} ${fault.code} ${fault.at}`);
}

/** This function gives the one fault of a layer. */
function only(layer: ElectricalLayer): ElectricalFault {
  const faults = checkElectrical(layer, space);
  if (faults.length !== 1 || faults[0] === undefined) throw new Error(`The layer has ${faults.length} faults.`);
  return faults[0];
}

describe("checkElectrical", () => {
  it("gives no fault for a correct layer, and for an empty layer", () => {
    expect(checkElectrical(good, space)).toEqual([]);
    expect(checkElectrical({ schema: "electrical/1" }, space)).toEqual([]);
  });

  it("has a code for each fault", () => {
    expect(new Set(ELECTRICAL_CODES).size).toBe(ELECTRICAL_CODES.length);
    expect(ELECTRICAL_CODES).toHaveLength(9);
  });

  it("finds one id of two records, also of two kinds", () => {
    const layer: ElectricalLayer = { ...good, circuits: [{ id: "o", limit: 100 }, { id: "c", limit: 1440, breaker: 15, voltage: 120 }], feeds: [...(good.feeds ?? []), { id: "f", object: "lamp", outlet: "o", watts: 1 }] };
    expect(codes(layer)).toEqual(["error id-duplicate o", "error id-duplicate f"]);
    expect(checkElectrical(layer, space)[0]?.message).toBe('The id "o" is the id of 2 records of the layer: an outlet, a circuit. Each record of a layer has its own id.');
  });

  it("finds an outlet on a circuit that is not there", () => {
    const fault = only({ schema: "electrical/1", outlets: [{ id: "o", anchor, circuit: "none" }] });
    expect(fault).toEqual({ level: "error", code: "outlet-circuit", at: "o", other: "none", message: 'The outlet "o" is on the circuit "none", which the layer does not have.' });
  });

  it("accepts an outlet with no circuit", () => {
    expect(checkElectrical({ schema: "electrical/1", outlets: [{ id: "o", anchor }] }, space)).toEqual([]);
  });

  it("finds a feed from an outlet that is not there, and to an object that is not there", () => {
    const layer: ElectricalLayer = { ...good, feeds: [{ id: "f1", object: "desk", outlet: "none", watts: 5 }, { id: "f2", object: "tower", outlet: "o", watts: 5 }] };
    expect(checkElectrical(layer, space)).toEqual([
      { level: "error", code: "feed-outlet", at: "f1", other: "none", message: 'The feed "f1" is from the outlet "none", which the layer does not have.' },
      { level: "error", code: "feed-object", at: "f2", other: "tower", message: 'The feed "f2" gives power to the object "tower", which the scene does not have.' },
    ]);
  });

  it("finds a power below 0, and accepts a power of 0 and no power", () => {
    const layer: ElectricalLayer = { ...good, feeds: [{ id: "f1", object: "desk", outlet: "o", watts: -5 }, { id: "f2", object: "desk", outlet: "o", watts: 0 }, { id: "f3", object: "lamp", outlet: "o" }] };
    expect(codes(layer)).toEqual(["error feed-watts f1"]);
    expect(codes({ ...good, feeds: [{ id: "f", object: "desk", outlet: "o", watts: Number.NaN }] })).toEqual(["error feed-watts f"]);
  });

  it("finds each number of a circuit that is not valid", () => {
    const layer: ElectricalLayer = { schema: "electrical/1", circuits: [{ id: "c", breaker: 0, voltage: -120, limit: 0, otherLoad: -1 }] };
    const faults = checkElectrical(layer, space);
    expect(faults.map((fault) => `${fault.level} ${fault.code} ${fault.at}`)).toEqual(["error circuit-number c", "error circuit-number c", "error circuit-number c", "error circuit-number c"]);
    expect(faults.map((fault) => fault.message)).toEqual([
      'The breaker of the circuit "c" is 0 A. It must be above 0.',
      'The voltage of the circuit "c" is -120 V. It must be above 0.',
      'The limit of the circuit "c" is 0 W. It must be above 0.',
      'The other load of the circuit "c" is -1 W. It must be a finite number, 0 or more.',
    ]);
  });

  it("warns about a circuit with no limit", () => {
    expect(only({ schema: "electrical/1", circuits: [{ id: "c", breaker: 15 }] })).toEqual({
      level: "warning",
      code: "circuit-no-limit",
      at: "c",
      message: 'The circuit "c" has no limit, and it does not have a breaker and a voltage. Its level is not known.',
    });
    expect(codes({ schema: "electrical/1", circuits: [{ id: "c", breaker: 15, voltage: 120 }] })).toEqual([]);
    expect(codes({ schema: "electrical/1", circuits: [{ id: "c", limit: 500 }] })).toEqual([]);
  });

  it("warns about a limit that is not the rated limit", () => {
    expect(only({ schema: "electrical/1", circuits: [{ id: "c", breaker: 15, voltage: 120, limit: 1800 }] })).toEqual({
      level: "warning",
      code: "circuit-limits",
      at: "c",
      message: 'The circuit "c" has the limit 1800 W. Its breaker of 15 A at 120 V gives 1440 W for a continuous load.',
    });
  });

  it("compares the limits with the continuous part of the options", () => {
    const layer: ElectricalLayer = { schema: "electrical/1", circuits: [{ id: "c", breaker: 15, voltage: 120, limit: 1800 }] };
    expect(codes(layer, { continuousLoad: 1 })).toEqual([]);
    expect(codes({ schema: "electrical/1", circuits: [{ id: "c", breaker: 15, voltage: 120, limit: 1440 }] }, { continuousLoad: 1 })).toEqual(["warning circuit-limits c"]);
  });

  it("accepts a rated limit with the error of the arithmetic", () => {
    const limit = 0.1 * 3 * 0.8;
    expect(limit).not.toBe(0.3 * 0.8);
    expect(codes({ schema: "electrical/1", circuits: [{ id: "c", breaker: 0.3, voltage: 1, limit }] })).toEqual([]);
  });

  it("warns about a known load above the limit", () => {
    const layer: ElectricalLayer = { ...good, circuits: [{ id: "c", limit: 1000, otherLoad: 950.5 }] };
    expect(only(layer)).toEqual({ level: "warning", code: "circuit-over", at: "c", message: 'The circuit "c" has a known load of 1040.5 W, above its limit of 1000 W.' });
    expect(codes({ ...good, circuits: [{ id: "c", limit: 1000, otherLoad: 910 }] })).toEqual([]);
  });

  it("uses the near part only for the level, not for a warning", () => {
    expect(codes({ ...good, circuits: [{ id: "c", limit: 100 }] }, { near: 0.1 })).toEqual([]);
  });

  it("examines the numbers of each record of an id, and the programs of the first", () => {
    const layer: ElectricalLayer = { schema: "electrical/1", circuits: [{ id: "c", limit: 500 }, { id: "c", limit: -1 }] };
    expect(codes(layer)).toEqual(["error id-duplicate c", "error circuit-number c"]);
  });
});
