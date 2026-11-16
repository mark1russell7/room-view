import type { Circuit } from "@mark1russell7/room-view";
import { describe, expect, it } from "vitest";
import { circuitDrafts, circuitLimit, circuitName, circuitRecords, readCircuit, usualCircuit } from "./circuits.ts";
import { MOST_CIRCUITS, MOST_TEXT, type DraftCircuit } from "./draft.ts";

/** This function gives a circuit of a store with the texts of a list. */
function circuit(key: string, name = "", breaker = "", voltage = ""): DraftCircuit {
  return { key, name, breaker, voltage };
}

describe("circuitLimit", () => {
  it("gives 80% of the voltage times the rating of the breaker, in watts", () => {
    expect(circuitLimit(15, 120)).toBe(1440);
    expect(circuitLimit(20, 120)).toBe(1920);
    expect(circuitLimit(16, 230)).toBe(2944);
    // 10 × 0.1 × 0.8 is 0.8000000000000002 in floating point: the limit is a number of milliwatts.
    expect(circuitLimit(10, 0.1)).toBe(0.8);
  });

  it("gives `undefined` for a value that is not a finite number", () => {
    expect(circuitLimit(Number.NaN, 120)).toBeUndefined();
    expect(circuitLimit(15, Number.POSITIVE_INFINITY)).toBeUndefined();
  });
});

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

describe("circuitRecords", () => {
  const circuits = [circuit("c1", "Kitchen", "20"), circuit("c2"), circuit("c3", "Kitchen", "0"), circuit("c4", "Kitchen")];

  it("gives each circuit an id from its name, and a circuit with a bad number has no record", () => {
    const { ids, records } = circuitRecords(circuits, "ft-in");
    // The bad circuit c3 uses the id kitchen-2, so the id of c4 does not change when c3 is correct again.
    expect([...ids]).toEqual([
      ["c1", "kitchen"],
      ["c2", "circuit-2"],
      ["c4", "kitchen-3"],
    ]);
    expect(records).toEqual([
      { id: "kitchen", name: "Kitchen", breaker: 20, voltage: 120, limit: 1920 },
      { id: "circuit-2", breaker: 15, voltage: 120, limit: 1440 },
      { id: "kitchen-3", name: "Kitchen", breaker: 15, voltage: 120, limit: 1440 },
    ]);
    expect(records[1]).not.toHaveProperty("name");
  });

  it("gives no records for no circuits", () => {
    expect(circuitRecords([], "m")).toEqual({ ids: new Map(), records: [] });
  });
});

describe("circuitDrafts", () => {
  /** This function gives a circuit record of 15 A at 120 V. */
  const record = (id: string, more: Partial<Circuit> = {}): Circuit => ({ id, breaker: 15, voltage: 120, limit: 1440, ...more });

  it("gives the circuits of the records of a store again, with no data that the store does not keep", () => {
    const { records } = circuitRecords([circuit("c1", "Kitchen", "20"), circuit("c2"), circuit("c4", "Hall", "", "")], "ft-in");
    const read = circuitDrafts(records, "ft-in");
    expect(read.circuits).toEqual([circuit("c1", "Kitchen", "20", "120"), circuit("c2", "", "15", "120"), circuit("c3", "Hall", "15", "120")]);
    expect([...read.keys]).toEqual([
      ["kitchen", "c1"],
      ["circuit-2", "c2"],
      ["hall", "c3"],
    ]);
    expect(read.more).toBe(false);
    expect(circuitRecords(read.circuits, "ft-in").records).toEqual(records);
  });

  it("keeps the first record of an id", () => {
    expect(circuitDrafts([record("a"), record("a")], "ft-in")).toEqual({ circuits: [circuit("c1", "", "15", "120")], keys: new Map([["a", "c1"]]), more: false });
    const twice = circuitDrafts([record("a", { name: "One" }), record("a", { name: "Two" })], "ft-in");
    expect(twice.circuits).toEqual([circuit("c1", "One", "15", "120")]);
    expect(twice.more).toBe(true);
  });

  it("tells a limit that is not the limit of the breaker and the voltage", () => {
    expect(circuitDrafts([record("a", { limit: 1500 })], "ft-in").more).toBe(true);
    // A record with no breaker and no voltage gets the usual numbers of the units of the file.
    expect(circuitDrafts([{ id: "a", limit: 1440 }], "ft-in")).toEqual({ circuits: [circuit("c1")], keys: new Map([["a", "c1"]]), more: false });
    expect(circuitDrafts([{ id: "a", limit: 1440 }], "m").more).toBe(true);
    expect(circuitDrafts([{ id: "a", limit: 2944 }], "m").more).toBe(false);
  });

  it("gives an empty text for a number that is not above 0", () => {
    expect(circuitDrafts([record("a", { breaker: 0, voltage: -120 })], "ft-in").circuits).toEqual([circuit("c1")]);
  });

  it("cuts a long name, and tells it", () => {
    const read = circuitDrafts([record("a", { name: "x".repeat(MOST_TEXT + 1) })], "ft-in");
    expect(read.circuits[0]?.name).toBe("x".repeat(MOST_TEXT));
    expect(read.more).toBe(true);
  });

  it("keeps the largest number of circuits of a store, and tells the others", () => {
    const many = Array.from({ length: MOST_CIRCUITS + 1 }, (_, index) => record(`c-${String(index)}`));
    const read = circuitDrafts(many, "ft-in");
    expect(read.circuits).toHaveLength(MOST_CIRCUITS);
    expect(read.keys.has(`c-${String(MOST_CIRCUITS)}`)).toBe(false);
    expect(read.more).toBe(true);
    expect(circuitDrafts(many.slice(0, MOST_CIRCUITS), "ft-in").more).toBe(false);
  });
});
