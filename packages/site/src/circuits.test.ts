import { describe, expect, it } from "vitest";
import { circuitName, readCircuit, usualCircuit } from "./circuits.ts";
import type { DraftCircuit } from "./draft.ts";

/** This function gives a circuit of a store with the texts of a list. */
function circuit(key: string, name = "", breaker = "", voltage = ""): DraftCircuit {
  return { key, name, breaker, voltage };
}

describe("usualCircuit", () => {
  it("gives 15 A at 120 V for feet and inches, and 16 A at 230 V for meters", () => {
    expect([usualCircuit("breaker", "ft-in"), usualCircuit("voltage", "in")]).toEqual([15, 120]);
    expect([usualCircuit("breaker", "m"), usualCircuit("voltage", "cm")]).toEqual([16, 230]);
  });
});

describe("readCircuit", () => {
  it("gives an empty field its usual value", () => {
    expect(readCircuit(circuit("c1"), "ft-in")).toEqual({ state: "ok", breaker: 15, voltage: 120, limit: 1440 });
    expect(readCircuit(circuit("c1"), "m")).toEqual({ state: "ok", breaker: 16, voltage: 230, limit: 2944 });
    expect(readCircuit(circuit("c1", "", " 20 ", "240"), "m")).toEqual({ state: "ok", breaker: 20, voltage: 240, limit: 3840 });
  });

  it("tells the first field with a text that is not a number above 0", () => {
    expect(readCircuit(circuit("c1", "", "0"), "ft-in")).toEqual({ state: "bad", field: "breaker" });
    expect(readCircuit(circuit("c1", "", "15 A"), "ft-in")).toEqual({ state: "bad", field: "breaker" });
    expect(readCircuit(circuit("c1", "", "15", "-120"), "ft-in")).toEqual({ state: "bad", field: "voltage" });
    expect(readCircuit(circuit("c1", "", "x", "y"), "ft-in")).toEqual({ state: "bad", field: "breaker" });
  });
});

describe("circuitName", () => {
  it("gives the name, or the number of a circuit with no name", () => {
    expect(circuitName(circuit("c1", " Kitchen "), 0)).toBe("Kitchen");
    expect(circuitName(circuit("c1", "  "), 2)).toBe("Circuit 3");
  });
});
