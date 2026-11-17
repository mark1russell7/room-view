import { sceneSpace, type Anchor, type Scene } from "@mark1russell7/room-view";
import { layerMarks } from "@mark1russell7/room-view/marks";
import { checkMarks, type Mark } from "@mark1russell7/visuals/marks";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { electricalAddOn } from "./add-on.ts";
import type { Circuit, ElectricalLayer, Feed, Outlet } from "./layer.ts";
import { ELECTRICAL_MARK_KINDS, ELECTRICAL_METER_UNIT, electricalAddOnMarks, electricalMarks } from "./marks.ts";
import { circuitStates, outletLevels } from "./states.ts";

/** One wall along the x axis, a desk and a lamp with a name. */
const scene: Scene = {
  schema: "scene/1",
  room: { schema: "room/1", unit: "m", height: 2.4, wallThickness: 0.2, walls: [{ id: "a", from: [0, 0], to: [4, 0] }] },
  objects: [
    { id: "desk", kind: "desk", size: [2, 1, 0.75], at: [2, 1.5] },
    { id: "lamp", kind: "lamp", name: "Floor lamp", size: [0.3, 0.3, 1.5], at: [3.5, 1.5] },
  ],
};
const space = sceneSpace(scene);
const anchor: Anchor = { on: "wall", wall: "a", face: "left", offset: 1, height: 0.3 };
const noPlace: Anchor = { on: "wall", wall: "z", face: "left", offset: 1, height: 0.3 };

/** A correct layer: one circuit with its limit, one outlet and one feed. */
const good: ElectricalLayer = {
  schema: "electrical/1",
  outlets: [{ id: "o", anchor, circuit: "c" }],
  circuits: [{ id: "c", breaker: 15, voltage: 120, limit: 1440 }],
  feeds: [{ id: "f", object: "desk", outlet: "o", watts: 90 }],
};

/** This function gives the good layer with a different load of its feed. */
function withWatts(watts: number): ElectricalLayer {
  return { ...good, feeds: [{ id: "f", object: "desk", outlet: "o", watts }] };
}

/** This function gives the type, the record name and the level of each mark. */
function lines(marks: readonly Mark[]): readonly string[] {
  return marks.map((mark) => `${mark.type} ${mark.record} ${mark.level}`);
}

/** This function gives the one mark of a record of a list. */
function markOf(marks: readonly Mark[], record: string): Mark {
  const found = marks.filter((mark) => mark.record === record);
  if (found.length !== 1 || found[0] === undefined) throw new Error(`The list has ${String(found.length)} marks of "${record}".`);
  return found[0];
}

describe("electricalMarks", () => {
  it("gives a point for an outlet, a link for a feed and a meter for a circuit", () => {
    const frame = space.frame(anchor);
    if (frame === undefined) throw new Error("The anchor has no position.");
    expect(electricalMarks(good, space)).toEqual([
      { type: "point", record: "electrical/1:o", kind: "outlet", level: "ok", label: "Outlet o, circuit c", frame: { at: frame.at, out: frame.out } },
      {
        type: "link",
        record: "electrical/1:f",
        kind: "feed",
        level: "ok",
        label: "Outlet o to desk, 90 W",
        from: { record: "electrical/1:o", at: frame.at },
        to: { record: "object:desk", at: { x: 2, y: 1.5, z: 0.375 } },
      },
      { type: "meter", record: "electrical/1:c", kind: "circuit", level: "ok", label: "Circuit c", value: 90, limit: 1440, unit: "W" },
    ]);
  });

  it("gives no marks for a layer with no records", () => {
    expect(electricalMarks({ schema: "electrical/1" }, space)).toEqual([]);
  });

  it("has the kinds and the unit of its marks", () => {
    expect(ELECTRICAL_MARK_KINDS).toEqual(["outlet", "feed", "circuit"]);
    expect(ELECTRICAL_METER_UNIT).toBe("W");
    expect(electricalMarks(good, space).map((mark) => mark.kind)).toEqual(ELECTRICAL_MARK_KINDS);
  });

  it("gives each mark the level of its circuit", () => {
    expect(lines(electricalMarks(withWatts(1200), space))).toEqual(["point electrical/1:o near", "link electrical/1:f near", "meter electrical/1:c near"]);
    expect(lines(electricalMarks(withWatts(1500), space))).toEqual(["point electrical/1:o over", "link electrical/1:f over", "meter electrical/1:c over"]);
  });

  it("uses the options of the levels", () => {
    expect(lines(electricalMarks(good, space, { near: 0.05 }))).toEqual(["point electrical/1:o near", "link electrical/1:f near", "meter electrical/1:c near"]);
  });

  it("gives the limit that the breaker and the voltage give, when the circuit has no limit of its own", () => {
    const rated: ElectricalLayer = { ...good, circuits: [{ id: "c", breaker: 15, voltage: 120 }] };
    const state = circuitStates(rated)[0];
    const meter = markOf(electricalMarks(rated, space), "electrical/1:c");
    expect(meter).toMatchObject({ type: "meter", value: 90, limit: 1440 });
    expect(meter).toMatchObject({ limit: state?.limit, level: state?.level });
    expect(markOf(electricalMarks(rated, space, { continuousLoad: 1 }), "electrical/1:c")).toMatchObject({ limit: 1800 });
  });

  it("gives no meter for a circuit with no limit above 0, and the level unknown to its outlets", () => {
    for (const circuit of [{ id: "c" }, { id: "c", limit: 0 }, { id: "c", limit: -5 }] satisfies Circuit[]) {
      const layer: ElectricalLayer = { ...good, circuits: [circuit] };
      expect(lines(electricalMarks(layer, space))).toEqual(["point electrical/1:o unknown", "link electrical/1:f unknown"]);
    }
  });

  it("gives a meter for a circuit with no load", () => {
    const layer: ElectricalLayer = { schema: "electrical/1", circuits: [{ id: "c", limit: 1440 }] };
    const state = circuitStates(layer)[0];
    expect(electricalMarks(layer, space)).toEqual([{ type: "meter", record: "electrical/1:c", kind: "circuit", level: state?.level, label: "Circuit c", value: 0, limit: 1440, unit: "W" }]);
  });

  it("counts the other load of a circuit in its meter", () => {
    const layer: ElectricalLayer = { ...good, circuits: [{ id: "c", limit: 1440, otherLoad: 600 }] };
    expect(markOf(electricalMarks(layer, space), "electrical/1:c")).toMatchObject({ value: 690, limit: 1440 });
  });

  it("gives the level unknown to an outlet with no circuit of the layer, and to its feeds", () => {
    const free: ElectricalLayer = { ...good, outlets: [{ id: "o", anchor }] };
    expect(lines(electricalMarks(free, space))).toEqual(["point electrical/1:o unknown", "link electrical/1:f unknown", "meter electrical/1:c unknown"]);
    expect(markOf(electricalMarks(free, space), "electrical/1:o").label).toBe("Outlet o");
    const other: ElectricalLayer = { ...good, outlets: [{ id: "o", anchor, circuit: "none" }] };
    expect(markOf(electricalMarks(other, space), "electrical/1:o")).toMatchObject({ level: "unknown", label: "Outlet o" });
  });

  it("gives no point for an outlet with no position, and no link for its feeds", () => {
    const layer: ElectricalLayer = { ...good, outlets: [{ id: "o", anchor: noPlace, circuit: "c" }] };
    expect(lines(electricalMarks(layer, space))).toEqual(["meter electrical/1:c ok"]);
  });

  it("gives no link for a feed with no outlet of the layer, or with no placed object of the scene", () => {
    const layer: ElectricalLayer = {
      ...good,
      feeds: [
        { id: "f1", object: "desk", outlet: "none", watts: 90 },
        { id: "f2", object: "ghost", outlet: "o", watts: 90 },
        { id: "f3", object: "lamp", outlet: "o" },
      ],
    };
    expect(lines(electricalMarks(layer, space))).toEqual(["point electrical/1:o ok", "link electrical/1:f3 ok", "meter electrical/1:c ok"]);
  });

  it("puts the end of a link at the center of the placed object", () => {
    const layer: ElectricalLayer = { ...good, feeds: [{ id: "f", object: "lamp", outlet: "o" }] };
    const link = markOf(electricalMarks(layer, space), "electrical/1:f");
    if (link.type !== "link") throw new Error("The mark is not a link.");
    expect(link.to.record).toBe("object:lamp");
    expect(link.to.at.x).toBeCloseTo(3.5, 12);
    expect(link.to.at.y).toBeCloseTo(1.5, 12);
    expect(link.to.at.z).toBeCloseTo(0.75, 12);
    expect(link.from.at).toEqual(space.frame(anchor)?.at);
  });

  it("gives each point in meters for a room in a different unit", () => {
    const small: Scene = {
      schema: "scene/1",
      room: { schema: "room/1", unit: "cm", height: 240, wallThickness: 20, walls: [{ id: "a", from: [0, 0], to: [400, 0] }] },
      objects: [{ id: "desk", kind: "desk", size: [200, 100, 75], at: [200, 150] }],
    };
    const layer: ElectricalLayer = { ...good, outlets: [{ id: "o", anchor: { on: "wall", wall: "a", face: "left", offset: 100, height: 30 }, circuit: "c" }] };
    const marks = electricalMarks(layer, sceneSpace(small));
    const point = markOf(marks, "electrical/1:o");
    const link = markOf(marks, "electrical/1:f");
    if (point.type !== "point" || link.type !== "link") throw new Error("The marks have a different type.");
    expect(point.frame.at.x).toBeCloseTo(1, 12);
    expect(point.frame.at.z).toBeCloseTo(0.3, 12);
    expect(link.to.at.x).toBeCloseTo(2, 12);
    expect(link.to.at.y).toBeCloseTo(1.5, 12);
    expect(link.to.at.z).toBeCloseTo(0.375, 12);
  });

  it("writes the name of a circuit and of a placed object in the labels", () => {
    const layer: ElectricalLayer = {
      ...good,
      circuits: [{ id: "c", name: "Kitchen", limit: 1440 }],
      feeds: [
        { id: "f", object: "lamp", outlet: "o", watts: 60 },
        { id: "g", object: "desk", outlet: "o" },
      ],
    };
    expect(electricalMarks(layer, space).map((mark) => mark.label)).toEqual(["Outlet o, circuit Kitchen", "Outlet o to Floor lamp, 60 W", "Outlet o to desk", "Circuit Kitchen"]);
  });

  it("gives each label on one line", () => {
    const layer: ElectricalLayer = {
      schema: "electrical/1",
      outlets: [{ id: "o\n1", anchor, circuit: "c" }],
      circuits: [{ id: "c", name: "  The\r\n kitchen\tcircuit ", limit: 1440 }],
      feeds: [{ id: "f", object: "desk", outlet: "o\n1", watts: 90 }],
    };
    const marks = electricalMarks(layer, space);
    expect(marks.map((mark) => mark.label)).toEqual(["Outlet o 1, circuit The kitchen circuit", "Outlet o 1 to desk, 90 W", "Circuit The kitchen circuit"]);
    expect(checkMarks(marks)).toEqual([]);
  });

  it("gives one mark for the first record of an id", () => {
    const layer: ElectricalLayer = {
      schema: "electrical/1",
      outlets: [
        { id: "o", anchor, circuit: "c" },
        { id: "o", anchor: { on: "floor", at: [1, 1] } },
      ],
      circuits: [
        { id: "c", limit: 1440 },
        { id: "c", limit: 100 },
      ],
      feeds: [
        { id: "f", object: "desk", outlet: "o", watts: 90 },
        { id: "f", object: "lamp", outlet: "o", watts: 500 },
      ],
    };
    const marks = electricalMarks(layer, space);
    expect(marks.map((mark) => `${mark.type} ${mark.record}`)).toEqual(["point electrical/1:o", "link electrical/1:f", "meter electrical/1:c"]);
    expect(markOf(marks, "electrical/1:o")).toMatchObject({ frame: space.frame(anchor) });
    expect(markOf(marks, "electrical/1:f")).toMatchObject({ to: { record: "object:desk" } });
    expect(markOf(marks, "electrical/1:c")).toMatchObject({ limit: 1440 });
  });

  it("gives marks that go through JSON with no change", () => {
    const marks = electricalMarks(good, space);
    expect(JSON.parse(JSON.stringify(marks))).toEqual(marks);
  });
});

describe("electricalAddOnMarks", () => {
  const withLayer: Scene = { ...scene, layers: { "electrical/1": good } };

  it("has the name of the layer", () => {
    expect(electricalAddOnMarks().schema).toBe("electrical/1");
  });

  it("gives the marks of the layer of a scene, in the order of the record names", () => {
    const marks = layerMarks(withLayer, [electricalAddOn()], [electricalAddOnMarks()]);
    expect(lines(marks)).toEqual(["meter electrical/1:c ok", "link electrical/1:f ok", "point electrical/1:o ok"]);
    expect([...marks].sort((a, b) => a.type.localeCompare(b.type))).toEqual([...electricalMarks(good, sceneSpace(withLayer))].sort((a, b) => a.type.localeCompare(b.type)));
  });

  it("uses its options", () => {
    const marks = layerMarks(withLayer, [electricalAddOn({ near: 0.05 })], [electricalAddOnMarks({ near: 0.05 })]);
    expect(lines(marks)).toEqual(["meter electrical/1:c near", "link electrical/1:f near", "point electrical/1:o near"]);
  });

  it("gives no marks for a scene with no electrical layer, or with a layer of a wrong form", () => {
    expect(layerMarks(scene, [electricalAddOn()], [electricalAddOnMarks()])).toEqual([]);
    expect(layerMarks({ ...scene, layers: { "electrical/1": { schema: "electrical/1", outlets: "none" } } }, [electricalAddOn()], [electricalAddOnMarks()])).toEqual([]);
  });
});

// The property: for each layer, with records that are correct or not, the marks are correct marks, and they agree with the states.
describe("the marks of each layer", () => {
  const anchors: readonly Anchor[] = [
    anchor,
    noPlace,
    { on: "wall", wall: "a", face: "right", offset: 3.5, height: 1.1 },
    { on: "floor", at: [1, 1] },
    { on: "ceiling", at: [2, 1] },
    { on: "object", object: "desk" },
    { on: "object", object: "ghost" },
    { on: "object", object: "lamp", at: [0, 0.15, 0.7], out: [0, 2, 0] },
  ];
  const circuitIds = ["c0", "c1", "c2"] as const;
  const outletIds = ["o0", "o1", "o2", "o3"] as const;
  const feedIds = ["f0", "f1", "f2", "f3", "f4"] as const;
  const maybe = <Value>(values: readonly Value[]): fc.Arbitrary<Value | undefined> => fc.option(fc.constantFrom(...values), { nil: undefined });

  const circuit = (id: string): fc.Arbitrary<Circuit> =>
    fc
      .record({ name: maybe(["Kitchen", "Desk"]), breaker: maybe([15, 20]), voltage: maybe([120, 240]), limit: maybe([0, 600, 1440]), otherLoad: maybe([0, 300]) })
      .map((fields) => ({ id, ...Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)) }));
  const outlet = (id: string): fc.Arbitrary<Outlet> =>
    fc.record({ anchor: fc.constantFrom(...anchors), circuit: maybe([...circuitIds, "none"]) }).map(({ anchor: at, circuit: on }) => ({ id, anchor: at, ...(on === undefined ? {} : { circuit: on }) }));
  const feed = (id: string): fc.Arbitrary<Feed> =>
    fc
      .record({ object: fc.constantFrom("desk", "lamp", "ghost"), outlet: fc.constantFrom(...outletIds, "none"), watts: maybe([0, 90, 700, 1500]) })
      .map(({ object, outlet: from, watts }) => ({ id, object, outlet: from, ...(watts === undefined ? {} : { watts }) }));
  const some = <Value>(ids: readonly string[], make: (id: string) => fc.Arbitrary<Value>): fc.Arbitrary<readonly Value[]> =>
    fc.subarray([...ids]).chain((chosen): fc.Arbitrary<readonly Value[]> => (chosen.length === 0 ? fc.constant<readonly Value[]>([]) : fc.tuple(...chosen.map(make))));
  const layers: fc.Arbitrary<ElectricalLayer> = fc
    .record({ circuits: some(circuitIds, circuit), outlets: some(outletIds, outlet), feeds: some(feedIds, feed) })
    .map((lists) => ({ schema: "electrical/1" as const, ...lists }));

  it("are correct marks that agree with the states of the circuits", () => {
    fc.assert(
      fc.property(layers, (layer) => {
        const marks = electricalMarks(layer, space);
        expect(checkMarks(marks)).toEqual([]);
        expect(JSON.parse(JSON.stringify(marks))).toEqual(marks);
        expect(new Set(marks.map((mark) => mark.record)).size).toBe(marks.length);
        for (const mark of marks) expect(ELECTRICAL_MARK_KINDS).toContain(mark.kind);

        const points = marks.filter((mark) => mark.type === "point");
        const links = marks.filter((mark) => mark.type === "link");
        const meters = marks.filter((mark) => mark.type === "meter");
        expect(points.length + links.length + meters.length).toBe(marks.length);

        // A point for each outlet with a position, with the level of its circuit.
        const levels = outletLevels(layer);
        const placed = (layer.outlets ?? []).filter((item) => space.frame(item.anchor) !== undefined);
        expect(points.map((mark) => mark.record)).toEqual(placed.map((item) => `electrical/1:${item.id}`));
        for (const item of placed) expect(markOf(marks, `electrical/1:${item.id}`).level).toBe(levels.get(item.id) ?? "unknown");

        // A link for each feed from a placed outlet to a placed object. Its start is the point of the outlet.
        const fed = (layer.feeds ?? []).filter((item) => placed.some((from) => from.id === item.outlet) && space.object(item.object) !== undefined);
        expect(links.map((mark) => mark.record)).toEqual(fed.map((item) => `electrical/1:${item.id}`));
        for (const link of links) {
          const from = markOf(marks, link.from.record);
          if (from.type !== "point") throw new Error("The start of a link is not a point.");
          expect(link.from.at).toEqual(from.frame.at);
          expect(link.level).toBe(from.level);
          expect(link.to.record.startsWith("object:")).toBe(true);
        }

        // A meter for each circuit with a limit above 0, with the numbers and the level of its state.
        const states = circuitStates(layer).filter((state) => state.limit !== undefined && state.limit > 0);
        expect(meters.map((mark) => ({ record: mark.record, value: mark.value, limit: mark.limit, level: mark.level, unit: mark.unit }))).toEqual(
          states.map((state) => ({ record: `electrical/1:${state.circuit}`, value: state.watts, limit: state.limit, level: state.level, unit: "W" })),
        );
      }),
      { seed: 20261116, numRuns: 150 },
    );
  });
});
