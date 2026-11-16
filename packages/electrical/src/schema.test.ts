import { describe, expect, it } from "vitest";
import { ELECTRICAL_SCHEMA, type ElectricalLayer } from "./layer.ts";
import { electricalSchema, parseElectrical } from "./schema.ts";

/** A layer with each kind of record, and an outlet on each kind of surface. */
const layer: ElectricalLayer = {
  schema: "electrical/1",
  outlets: [
    { id: "wall-1", anchor: { on: "wall", wall: "a", face: "left", offset: 1, height: 0.3 }, circuit: "c" },
    { id: "floor-1", anchor: { on: "floor", at: [1, 2] } },
    { id: "ceiling-1", anchor: { on: "ceiling", at: [1, 2] }, circuit: "c" },
    { id: "strip-1", anchor: { on: "object", object: "desk", at: [0, 0, 0.75] }, circuit: "c" },
  ],
  circuits: [{ id: "c", name: "The desk", breaker: 15, voltage: 120, limit: 1440, otherLoad: 60 }, { id: "d" }],
  feeds: [
    { id: "f-1", object: "desk", outlet: "wall-1", watts: 90 },
    { id: "f-2", object: "desk", outlet: "strip-1" },
  ],
};

describe("the format", () => {
  it("has the name of its layer", () => {
    expect(ELECTRICAL_SCHEMA).toBe("electrical/1");
  });

  it("accepts a layer with each record, and a layer with no lists", () => {
    expect(electricalSchema.parse(layer)).toEqual(layer);
    expect(electricalSchema.parse({ schema: "electrical/1" })).toEqual({ schema: "electrical/1" });
  });

  it("survives JSON", () => {
    expect(electricalSchema.parse(JSON.parse(JSON.stringify(layer)))).toEqual(layer);
  });
});

describe("parseElectrical", () => {
  it("gives the layer of a correct record", () => {
    expect(parseElectrical(layer)).toEqual({ ok: true, layer });
  });

  it("refuses a record that is not a layer", () => {
    for (const value of [undefined, null, 4, "electrical/1", [], {}]) expect(parseElectrical(value).ok).toBe(false);
  });

  it("refuses a different format", () => {
    expect(parseElectrical({ schema: "electrical/2" }).ok).toBe(false);
  });

  it("names the place of each fault", () => {
    const read = parseElectrical({ schema: "electrical/1", outlets: [{ id: "", anchor: { on: "floor", at: [1] } }], feeds: [{ id: "f", object: "desk" }] });
    if (read.ok) throw new Error("The record has faults.");
    expect(read.errors.some((text) => text.includes('"outlets.0.id"'))).toBe(true);
    expect(read.errors.some((text) => text.includes('"outlets.0.anchor.at"'))).toBe(true);
    expect(read.errors.some((text) => text.includes('"feeds.0.outlet"'))).toBe(true);
    for (const text of read.errors) expect(text).toContain('The layer "electrical/1" has a fault at ');
  });

  it("refuses a field that the format does not have", () => {
    const top = parseElectrical({ schema: "electrical/1", loads: [] });
    if (top.ok) throw new Error("The record has a fault.");
    expect(top.errors).toHaveLength(1);
    expect(top.errors[0]).toContain("the record");
    expect(parseElectrical({ schema: "electrical/1", circuits: [{ id: "c", amps: 15 }] }).ok).toBe(false);
    expect(parseElectrical({ schema: "electrical/1", outlets: [{ id: "o", anchor: { on: "floor", at: [1, 2], wall: "a" } }] }).ok).toBe(false);
  });

  it("refuses a number that is not finite, and a number as a text", () => {
    expect(parseElectrical({ schema: "electrical/1", circuits: [{ id: "c", limit: Number.POSITIVE_INFINITY }] }).ok).toBe(false);
    expect(parseElectrical({ schema: "electrical/1", circuits: [{ id: "c", breaker: Number.NaN }] }).ok).toBe(false);
    expect(parseElectrical({ schema: "electrical/1", feeds: [{ id: "f", object: "desk", outlet: "o", watts: "90" }] }).ok).toBe(false);
  });

  it("does not examine the meaning: a negative limit and a circuit that is not there have a correct form", () => {
    const odd = { schema: "electrical/1", outlets: [{ id: "o", anchor: { on: "floor", at: [1, 2] }, circuit: "none" }], circuits: [{ id: "c", limit: -1 }] };
    expect(parseElectrical(odd).ok).toBe(true);
  });
});
