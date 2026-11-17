import { checkForm, formLayer, formRecords, type Anchor, type FormRecord, type FormRecords } from "@mark1russell7/room-view";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ELECTRICAL_FORM } from "./form.ts";
import { ELECTRICAL_SCHEMA } from "./layer.ts";
import { parseElectrical } from "./schema.ts";

const onWall: Anchor = { on: "wall", wall: "a", face: "left", offset: 1, height: 0.3 };
const onFloor: Anchor = { on: "floor", at: [1, 1] };
const onDesk: Anchor = { on: "object", object: "desk" };

/** The records of a small room: two circuits, two outlets and the power of a desk. */
const ROOM: FormRecords = {
  circuits: [
    { id: "kitchen", values: { name: "Kitchen" } },
    { id: "circuit-2", values: { breaker: 20 } },
  ],
  outlets: [
    { id: "outlet-1", anchor: onWall, values: { circuit: "kitchen" } },
    { id: "outlet-2", anchor: onWall, values: {} },
  ],
  feeds: [{ id: "feed-1", values: { object: "desk", outlet: "outlet-1", watts: 250 } }],
};

describe("ELECTRICAL_FORM", () => {
  it("is a correct form of the electrical layer", () => {
    expect(checkForm(ELECTRICAL_FORM)).toEqual([]);
    expect(ELECTRICAL_FORM.schema).toBe(ELECTRICAL_SCHEMA);
    expect(ELECTRICAL_FORM.collections.map((collection) => collection.name)).toEqual(["circuits", "outlets", "feeds"]);
  });

  it("gives a circuit the usual breaker and voltage of the units of the home", () => {
    expect(formLayer(ELECTRICAL_FORM, ROOM, { system: "imperial" })).toEqual({
      schema: "electrical/1",
      circuits: [
        { id: "kitchen", name: "Kitchen", breaker: 15, voltage: 120 },
        { id: "circuit-2", breaker: 20, voltage: 120 },
      ],
      outlets: [
        { id: "outlet-1", anchor: onWall, circuit: "kitchen" },
        { id: "outlet-2", anchor: onWall },
      ],
      feeds: [{ id: "feed-1", object: "desk", outlet: "outlet-1", watts: 250 }],
    });
    expect(formLayer(ELECTRICAL_FORM, ROOM, { system: "metric" })["circuits"]).toEqual([
      { id: "kitchen", name: "Kitchen", breaker: 16, voltage: 230 },
      { id: "circuit-2", breaker: 20, voltage: 230 },
    ]);
  });

  it("gives a layer that the schema of the add-on reads", () => {
    for (const system of ["imperial", "metric"] as const) {
      const layer = formLayer(ELECTRICAL_FORM, ROOM, { system });
      const read = parseElectrical(layer);
      expect(read).toEqual({ ok: true, layer });
    }
    expect(parseElectrical(formLayer(ELECTRICAL_FORM, {}, { system: "metric" }))).toEqual({ ok: true, layer: { schema: "electrical/1" } });
  });

  it("gives the records of its layer again", () => {
    const layer = formLayer(ELECTRICAL_FORM, ROOM, { system: "imperial" });
    const read = formRecords(ELECTRICAL_FORM, layer);
    expect(read.more).toBe(false);
    expect(read.records["feeds"]).toEqual(ROOM["feeds"]);
    expect(read.records["outlets"]).toEqual(ROOM["outlets"]);
    expect(read.records["circuits"]).toEqual([
      { id: "kitchen", values: { name: "Kitchen", breaker: 15, voltage: 120 } },
      { id: "circuit-2", values: { breaker: 20, voltage: 120 } },
    ]);
  });

  it("keeps one feed for each object, and no feed from an outlet that is not there", () => {
    const feeds: readonly FormRecord[] = [
      { id: "feed-1", values: { object: "desk", outlet: "outlet-1" } },
      { id: "feed-2", values: { object: "desk", outlet: "outlet-2" } },
      { id: "feed-3", values: { object: "lamp", outlet: "outlet-9" } },
      { id: "feed-4", values: { object: "lamp", outlet: "outlet-2", watts: -1 } },
      { id: "feed-5", values: { object: "lamp", outlet: "outlet-2", watts: 0 } },
    ];
    expect(formLayer(ELECTRICAL_FORM, { ...ROOM, feeds }, { system: "metric" })["feeds"]).toEqual([
      { id: "feed-1", object: "desk", outlet: "outlet-1" },
      { id: "feed-5", object: "lamp", outlet: "outlet-2", watts: 0 },
    ]);
  });

  it("tells the data of a layer that the form does not keep", () => {
    const layer = formLayer(ELECTRICAL_FORM, ROOM, { system: "imperial" });
    const circuits = [{ id: "kitchen", name: "Kitchen", breaker: 15, voltage: 120 }];
    const limit = { ...layer, circuits: [{ id: "kitchen", breaker: 15, voltage: 120, limit: 1440 }] };
    const otherLoad = { ...layer, circuits: [{ id: "kitchen", breaker: 15, voltage: 120, otherLoad: 300 }] };
    expect(parseElectrical(limit).ok).toBe(true);
    expect(parseElectrical(otherLoad).ok).toBe(true);
    expect(formRecords(ELECTRICAL_FORM, limit).more).toBe(true);
    expect(formRecords(ELECTRICAL_FORM, otherLoad).more).toBe(true);
    // An outlet on a floor or on an object is a correct record of the layer, and the form has only the outlets of the walls.
    for (const anchor of [onFloor, onDesk]) {
      const other = { schema: "electrical/1", circuits, outlets: [{ id: "outlet-1", anchor, circuit: "kitchen" }] };
      expect(parseElectrical(other).ok).toBe(true);
      expect(formRecords(ELECTRICAL_FORM, other)).toEqual({ records: { circuits: [{ id: "kitchen", values: { name: "Kitchen", breaker: 15, voltage: 120 } }], outlets: [], feeds: [] }, more: true });
    }
    // A circuit with a breaker of 0 A is a correct record of the form of the layer, and it is not a valid value of the form.
    const zero = { schema: "electrical/1", circuits: [{ id: "kitchen", breaker: 0 }] };
    expect(parseElectrical(zero).ok).toBe(true);
    expect(formRecords(ELECTRICAL_FORM, zero)).toEqual({ records: { circuits: [{ id: "kitchen", values: {} }], outlets: [], feeds: [] }, more: true });
  });

  it("gives, for each set of records, a layer that the schema reads and that gives its records again", () => {
    const id = fc.constantFrom("a", "b", "c", "d", "e", "");
    const value = fc.oneof(id, fc.constantFrom(" Kitchen ", "  "), fc.double(), fc.integer({ min: -2, max: 30 }));
    const record = fc.record({
      id,
      anchor: fc.constantFrom(onWall, onFloor, onDesk, undefined),
      values: fc.dictionary(fc.constantFrom("name", "breaker", "voltage", "circuit", "object", "outlet", "watts", "limit"), value),
    });
    const records = fc.record({ circuits: fc.array(record, { maxLength: 4 }), outlets: fc.array(record, { maxLength: 4 }), feeds: fc.array(record, { maxLength: 4 }) });
    fc.assert(
      fc.property(records, fc.constantFrom("metric", "imperial"), (given, system) => {
        const layer = formLayer(ELECTRICAL_FORM, given, { system });
        expect(parseElectrical(layer)).toEqual({ ok: true, layer });
        const read = formRecords(ELECTRICAL_FORM, layer);
        expect(read.more).toBe(false);
        expect(formLayer(ELECTRICAL_FORM, read.records, { system })).toEqual(layer);
      }),
    );
  });
});
