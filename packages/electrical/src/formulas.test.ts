import { evaluate, lit, ref, space, type Expr } from "@mark1russell7/vex";
import { BoolDomain, NumDomain, TextDomain } from "@mark1russell7/vex-domains";
import { describe, expect, it } from "vitest";
import {
  CIRCUIT_CURRENT,
  CIRCUIT_LEVEL,
  CIRCUIT_LIMIT,
  CIRCUIT_LOAD,
  CIRCUIT_RATIO,
  CONTINUOUS_LOAD,
  DEFAULT_CONTINUOUS_LOAD,
  DEFAULT_NEAR_LOAD,
  KNOWN_LOADS,
  LIMITS_DIFFER,
  LOAD_LEVELS,
  MISSING_LOADS,
  NEAR_LOAD,
  NODE_KINDS,
  RATED_LIMIT,
  loadCurrent,
  loadRatio,
  ratedLimit,
  ratioLevel,
} from "./formulas.ts";

const domains = [NumDomain, BoolDomain, TextDomain];
const vars = { [CONTINUOUS_LOAD]: DEFAULT_CONTINUOUS_LOAD, [NEAR_LOAD]: DEFAULT_NEAR_LOAD };

/** A supply of a different model: the general programs read its fields by the names of the caller. */
const supplies = space.record({ psu: { volts: 240, amps: 30, draw: 4320 }, dead: { volts: 240, amps: 0, draw: 100 } });

/** This function evaluates a program at a supply. It gives the value, or the code of the error. */
function at(program: Expr, origin: string = "psu"): unknown {
  const result = evaluate(program, { space: supplies, origin, domains, vars });
  return result.ok ? result.value : result.error.code;
}

describe("the general programs", () => {
  it("gives the limit of a continuous load: 80% of the voltage times the breaker", () => {
    expect(at(ratedLimit(lit(120), lit(15)))).toBe(1440);
    expect(at(ratedLimit(ref("volts"), ref("amps")))).toBe(5760);
  });

  it("takes a different continuous part", () => {
    expect(at(ratedLimit(lit(120), lit(15), lit(1)))).toBe(1800);
    const result = evaluate(ratedLimit(lit(120), lit(20)), { space: supplies, origin: "psu", domains, vars: { [CONTINUOUS_LOAD]: 0.5 } });
    expect(result).toEqual({ ok: true, value: 1200 });
  });

  it("gives the current of a load", () => {
    expect(at(loadCurrent(lit(1440), lit(120)))).toBe(12);
    expect(at(loadCurrent(ref("draw"), ref("volts")))).toBe(18);
  });

  it("gives a load as a part of its limit", () => {
    expect(at(loadRatio(lit(720), lit(1440)))).toBe(0.5);
    expect(at(loadRatio(ref("draw"), ratedLimit(ref("volts"), ref("amps"))))).toBe(0.75);
  });

  it("gives an error value for a limit that is not above 0", () => {
    expect(at(loadRatio(lit(100), lit(0)))).toBe("#NUM!");
    expect(at(loadRatio(lit(100), lit(-5)))).toBe("#NUM!");
    expect(at(loadRatio(ref("draw"), ratedLimit(ref("volts"), ref("amps"))), "dead")).toBe("#NUM!");
  });

  it("gives the level of a ratio, with its two boundaries", () => {
    expect(at(ratioLevel(lit(0)))).toBe("ok");
    expect(at(ratioLevel(lit(0.79)))).toBe("ok");
    expect(at(ratioLevel(lit(0.8)))).toBe("near");
    expect(at(ratioLevel(lit(1)))).toBe("near");
    expect(at(ratioLevel(lit(1.01)))).toBe("over");
    expect(at(ratioLevel(lit(0.6), lit(0.5)))).toBe("near");
  });

  it("gives the error of a ratio, not a level", () => {
    expect(at(ratioLevel(loadRatio(lit(100), lit(0))))).toBe("#NUM!");
  });
});

describe("the names", () => {
  it("has the levels from the least known to the worst", () => {
    expect(LOAD_LEVELS).toEqual(["unknown", "ok", "near", "over"]);
  });

  it("has the kinds of the nodes of the tree", () => {
    expect(NODE_KINDS).toEqual(["circuit", "outlet", "feed", "other"]);
  });
});

/** One circuit of 15 A at 120 V with two outlets, three feeds and an other load. A second circuit has only a limit. */
const tree = space.tree(
  {
    "circuit:a": { kind: "circuit", breaker: 15, voltage: 120 },
    "other:a": { kind: "other", watts: 100 },
    "outlet:1": { kind: "outlet" },
    "outlet:2": { kind: "outlet" },
    "feed:x": { kind: "feed", watts: 500 },
    "feed:y": { kind: "feed", watts: 300 },
    "feed:z": { kind: "feed" },
    "circuit:b": { kind: "circuit", limit: 1000, breaker: 20, voltage: 120 },
    "circuit:c": { kind: "circuit" },
    "outlet:3": { kind: "outlet" },
    "feed:w": { kind: "feed", watts: 40 },
  },
  {
    "circuit:a": null,
    "other:a": "circuit:a",
    "outlet:1": "circuit:a",
    "outlet:2": "circuit:a",
    "feed:x": "outlet:1",
    "feed:y": "outlet:2",
    "feed:z": "outlet:2",
    "circuit:b": null,
    "circuit:c": null,
    "outlet:3": "circuit:c",
    "feed:w": "outlet:3",
  },
);

/** This function evaluates a program at a circuit of the tree. It gives the value, or the code of the error. */
function atCircuit(program: Expr, circuit: string): unknown {
  const result = evaluate(program, { space: tree, origin: `circuit:${circuit}`, domains, vars });
  return result.ok ? result.value : result.error.code;
}

describe("the programs of a circuit", () => {
  it("adds the watts of the feeds and of the other load", () => {
    expect(atCircuit(CIRCUIT_LOAD, "a")).toBe(900);
    expect(atCircuit(KNOWN_LOADS, "a")).toBe(3);
  });

  it("names the feeds with no watts", () => {
    expect(atCircuit(MISSING_LOADS, "a")).toEqual(["feed:z"]);
    expect(atCircuit(MISSING_LOADS, "b")).toEqual([]);
  });

  it("gives the rated limit, and the field limit comes first", () => {
    expect(atCircuit(RATED_LIMIT, "a")).toBe(1440);
    expect(atCircuit(CIRCUIT_LIMIT, "a")).toBe(1440);
    expect(atCircuit(RATED_LIMIT, "b")).toBe(1920);
    expect(atCircuit(CIRCUIT_LIMIT, "b")).toBe(1000);
  });

  it("gives the ratio, the current and the level", () => {
    expect(atCircuit(CIRCUIT_RATIO, "a")).toBe(0.625);
    expect(atCircuit(CIRCUIT_CURRENT, "a")).toBe(7.5);
    expect(atCircuit(CIRCUIT_LEVEL, "a")).toBe("ok");
  });

  it("gives the level unknown for a circuit with no known load", () => {
    expect(atCircuit(CIRCUIT_LOAD, "b")).toBe(0);
    expect(atCircuit(KNOWN_LOADS, "b")).toBe(0);
    expect(atCircuit(CIRCUIT_LEVEL, "b")).toBe("unknown");
  });

  it("gives the level unknown, and error values, for a circuit with no limit", () => {
    expect(atCircuit(CIRCUIT_LOAD, "c")).toBe(40);
    expect(atCircuit(CIRCUIT_LEVEL, "c")).toBe("unknown");
    expect(typeof atCircuit(CIRCUIT_LIMIT, "c")).toBe("string");
    expect(typeof atCircuit(CIRCUIT_RATIO, "c")).toBe("string");
    expect(atCircuit(CIRCUIT_CURRENT, "c")).toBe("#N/A");
  });

  it("tells if the two limits of a circuit differ", () => {
    expect(atCircuit(LIMITS_DIFFER, "b")).toBe(true);
    expect(atCircuit(LIMITS_DIFFER, "a")).toBe("#N/A");
    const equal = space.tree({ "circuit:e": { kind: "circuit", breaker: 15, voltage: 120, limit: 1440 } }, { "circuit:e": null });
    expect(evaluate(LIMITS_DIFFER, { space: equal, origin: "circuit:e", domains, vars })).toEqual({ ok: true, value: false });
  });

  it("is data: each program survives JSON", () => {
    for (const program of [CIRCUIT_LOAD, KNOWN_LOADS, MISSING_LOADS, CIRCUIT_LIMIT, CIRCUIT_RATIO, CIRCUIT_CURRENT, CIRCUIT_LEVEL, LIMITS_DIFFER]) {
      const copy = JSON.parse(JSON.stringify(program)) as Expr;
      for (const circuit of ["a", "b", "c"]) expect(atCircuit(copy, circuit)).toEqual(atCircuit(program, circuit));
    }
  });
});
