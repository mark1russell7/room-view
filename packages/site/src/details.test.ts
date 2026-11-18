import { ELECTRICAL_SCHEMA, type ElectricalLayer } from "@mark1russell7/electrical";
import { SAMPLE_ELECTRICAL_SCENE, SAMPLE_SCENE_LAYER } from "@mark1russell7/electrical/sample";
import { sceneSolids, type Scene } from "@mark1russell7/room-view";
import { describe, expect, it } from "vitest";
import { circuitRows, detailsOf, formatArea, formatLength, formatNumber, legendRows, partGroups, partKey, partName, recordText, roomDetails, type PartKind } from "./details.ts";

// The sample room of the core, and the electrical layer of the add-on for it.
const SCENE = SAMPLE_ELECTRICAL_SCENE;
const LAYER = SAMPLE_SCENE_LAYER;
const NO_LAYER: ElectricalLayer = { schema: ELECTRICAL_SCHEMA };

const rowsOf = (kind: PartKind, source: string): Readonly<Record<string, string>> =>
  Object.fromEntries((detailsOf(SCENE, LAYER, { kind, source })?.rows ?? []).map((row) => [row.label, row.value]));

describe("the formats", () => {
  it("gives a number with 2 decimals at most", () => {
    expect([6, 0.15, 2.05, 25.860000000000003, 1 / 3, -0.001].map(formatNumber)).toEqual(["6", "0.15", "2.05", "25.86", "0.33", "0"]);
  });

  it("gives a length and an area in the unit of the room", () => {
    expect(formatLength(2.5, "m")).toBe("2.5 m");
    expect(formatArea(120, "ft")).toBe("120 ft²");
  });

  it("gives a record with one field on each line", () => {
    expect(recordText({ id: "south", from: [0, 0], to: [6, 0], side: "right", height: undefined })).toBe(
      '{\n  "id": "south",\n  "from": [0, 0],\n  "to": [6, 0],\n  "side": "right"\n}',
    );
    expect(recordText({ ring: [[0, 0], [1, 0]] })).toBe('{\n  "ring": [[0, 0], [1, 0]]\n}'); // prettier-ignore
  });

  it("gives a record in a field on one line, with no field that has no value", () => {
    expect(recordText({ id: "a", anchor: { on: "wall", wall: "south", face: undefined }, empty: {} })).toBe('{\n  "id": "a",\n  "anchor": { "on": "wall", "wall": "south" },\n  "empty": {}\n}');
  });
});

describe("detailsOf", () => {
  it("gives the measurements of a wall, with its door and its outlets", () => {
    expect(detailsOf(SCENE, LAYER, { kind: "wall", source: "south" })).toMatchObject({ title: "south", kind: "Wall" });
    expect(rowsOf("wall", "south")).toEqual({
      Length: "6 m",
      Height: "2.5 m",
      Thickness: "0.15 m",
      Door: "0.9 m wide, 2.05 m high",
      Outlets: "south-1 and south-2",
    });
    expect(rowsOf("wall", "nook")).toMatchObject({ Length: "1.4 m", Thickness: "0.1 m", Outlets: "None" });
  });

  it("gives the area of a floor", () => {
    // The outline is 6 by 3 m and 4 by 2 m. The wall of the nook takes 0.1 by 1.4 m.
    expect(rowsOf("floor", "floor")).toEqual({ Area: "25.86 m²", Corners: "10" });
    expect(detailsOf(SCENE, LAYER, { kind: "floor", source: "floor" })?.title).toBe("Room");
  });

  it("gives the measurements of a window", () => {
    expect(rowsOf("glass", "window-east")).toEqual({ Wall: "east", Width: "1.4 m", Height: "1.2 m", "Bottom above the floor": "0.9 m" });
    expect(detailsOf(SCENE, LAYER, { kind: "glass", source: "window-east" })?.kind).toBe("Window");
  });

  it("gives the circuit of an outlet and the objects that its feeds give power to", () => {
    expect(rowsOf("outlet", "nook-1")).toEqual({ Wall: "north", "Height above the floor": "0.3 m", Circuit: "Circuit B", "Gives power to": "Node 1 and Node 2" });
    expect(rowsOf("outlet", "south-1")).toMatchObject({ Circuit: "Circuit A", "Gives power to": "None" });
  });

  it("gives the surface of an outlet that is not on a wall, and no circuit for an outlet with none", () => {
    const layer: ElectricalLayer = {
      schema: ELECTRICAL_SCHEMA,
      outlets: [
        { id: "strip", anchor: { on: "object", object: "desk" } },
        { id: "floor-box", anchor: { on: "floor", at: [1, 1] } },
        { id: "lamp", anchor: { on: "ceiling", at: [2, 1] } },
      ],
    };
    const rows = (source: string): readonly string[] => (detailsOf(SCENE, layer, { kind: "outlet", source })?.rows ?? []).map((row) => `${row.label}: ${row.value}`);
    expect(rows("strip")).toEqual(["On: Desk", "Circuit: None", "Gives power to: None"]);
    expect(rows("floor-box")[0]).toBe("On: The floor");
    expect(rows("lamp")[0]).toBe("On: The ceiling");
  });

  it("gives the size of an object, and the objects around it", () => {
    expect(rowsOf("object", "node-3")).toEqual({ Kind: "computer", Width: "0.48 m", Depth: "0.6 m", Height: "0.18 m", "Held by": "Rack", Outlet: "nook-2", Circuit: "Circuit B" });
    expect(rowsOf("object", "rack")).toMatchObject({ Kind: "rack", Holds: "Node 1, Node 2, Node 3, and Node 4" });
    expect(rowsOf("object", "sofa")).toEqual({ Kind: "sofa", Width: "2 m", Depth: "0.9 m", Height: "0.8 m" });
  });

  it("gives the record as text: the record of the layer for an outlet", () => {
    expect(detailsOf(SCENE, LAYER, { kind: "outlet", source: "east-1" })?.record).toBe(
      '{\n  "id": "east-1",\n  "anchor": { "on": "wall", "wall": "east", "face": "left", "offset": 0.4, "height": 0.3 },\n  "circuit": "a"\n}',
    );
  });

  it("gives undefined for a record that the scene does not have", () => {
    for (const kind of ["floor", "wall", "glass", "outlet", "object"] as const) expect(detailsOf(SCENE, LAYER, { kind, source: "none" })).toBeUndefined();
  });

  it("has details for the record of each solid of the model, and of each outlet of the layer", () => {
    for (const solid of sceneSolids(SCENE)) expect(detailsOf(SCENE, LAYER, solid), solid.id).toBeDefined();
    for (const outlet of LAYER.outlets ?? []) expect(detailsOf(SCENE, LAYER, { kind: "outlet", source: outlet.id }), outlet.id).toBeDefined();
  });

  it("gives no outlet and no circuit for a scene with no electrical layer", () => {
    expect(detailsOf(SCENE, NO_LAYER, { kind: "outlet", source: "east-1" })).toBeUndefined();
    const rows = (detailsOf(SCENE, NO_LAYER, { kind: "object", source: "node-3" })?.rows ?? []).map((row) => row.label);
    expect(rows).not.toContain("Outlet");
    expect(rows).not.toContain("Circuit");
    expect((detailsOf(SCENE, NO_LAYER, { kind: "wall", source: "south" })?.rows ?? []).find((row) => row.label === "Outlets")?.value).toBe("None");
  });
});

describe("partName", () => {
  it("gives the kind before an id, and only the name of an object or a floor", () => {
    expect(partName(SCENE, LAYER, { kind: "wall", source: "south" })).toBe("Wall south");
    expect(partName(SCENE, LAYER, { kind: "outlet", source: "nook-2" })).toBe("Outlet nook-2");
    expect(partName(SCENE, LAYER, { kind: "object", source: "node-1" })).toBe("Node 1");
    expect(partName(SCENE, LAYER, { kind: "floor", source: "floor" })).toBe("Room");
    expect(partName(SCENE, LAYER, { kind: "object", source: "none" })).toBe("none");
  });
});

describe("roomDetails", () => {
  it("gives the summary of the room", () => {
    expect(roomDetails(SCENE, LAYER)).toEqual({
      title: "Sample room",
      kind: "Room",
      rows: [
        { label: "Floor area", value: "25.86 m²" },
        { label: "Height", value: "2.5 m" },
        { label: "Walls", value: "7" },
        { label: "Doors", value: "1" },
        { label: "Windows", value: "2" },
        { label: "Outlets", value: "7" },
        { label: "Objects", value: "9" },
      ],
    });
  });

  it("gives a summary for a room with no floor and no object", () => {
    const bare: Scene = { schema: "scene/2", room: { schema: "room/2", unit: "ft", height: 8, wallThickness: 0.5, walls: [] } };
    expect(roomDetails(bare, NO_LAYER)).toMatchObject({ title: "Room", rows: [{ label: "Floor area", value: "0 ft²" }, { label: "Height", value: "8 ft" }, { label: "Walls", value: "0" }, { label: "Doors", value: "0" }, { label: "Windows", value: "0" }, { label: "Outlets", value: "0" }, { label: "Objects", value: "0" }] }); // prettier-ignore
  });
});

describe("circuitRows", () => {
  it("gives the load, the limit and the level of each circuit", () => {
    const [a, b] = circuitRows(LAYER);
    expect(a).toMatchObject({ id: "a", name: "Circuit A", level: "ok", figure: "420 of 1440 W, 29.17% of the limit", status: "Within its limit" });
    expect(a!.fill).toBeCloseTo(420 / 1440, 9);
    expect(b).toMatchObject({ id: "b", name: "Circuit B", level: "near", figure: "1260 of 1440 W, 87.5% of the limit", status: "Near its limit", fill: 0.875 });
  });

  it("gives the outlets of a circuit and the objects that take power from them", () => {
    const [a, b] = circuitRows(LAYER);
    expect(a!.records.map(partKey)).toEqual(["outlet:south-1", "outlet:south-2", "outlet:east-1", "outlet:west-1", "outlet:north-1", "object:tower"]);
    expect(b!.records.map(partKey)).toEqual(["outlet:nook-1", "outlet:nook-2", "object:node-1", "object:node-2", "object:node-3", "object:node-4"]);
  });

  it("fills the meter of a circuit over its limit, and gives no load for a circuit with no load value", () => {
    const circuits = (LAYER.circuits ?? []).map((circuit) => ({ ...circuit, otherLoad: circuit.id === "a" ? 2000 : undefined }));
    const [a, b] = circuitRows({ ...LAYER, circuits });
    expect(a).toMatchObject({ level: "over", fill: 1, status: "Over its limit", figure: "2000 of 1440 W, 138.89% of the limit" });
    expect(b).toMatchObject({ level: "unknown", fill: 0, status: "No load value", figure: "The limit is 1440 W" });
  });

  it("gives the limit of a circuit from its breaker and its voltage, and the name of the circuit from the layer", () => {
    const [row] = circuitRows({ schema: ELECTRICAL_SCHEMA, circuits: [{ id: "c", name: "Rack", breaker: 20, voltage: 120, otherLoad: 960 }] });
    expect(row).toMatchObject({ id: "c", name: "Rack", level: "ok", fill: 0.5, figure: "960 of 1920 W, 50% of the limit", status: "Within its limit" });
  });

  it("gives only the load of a circuit with no limit", () => {
    const [row] = circuitRows({ schema: ELECTRICAL_SCHEMA, circuits: [{ id: "c", otherLoad: 300 }] });
    expect(row).toMatchObject({ id: "c", name: "c", level: "unknown", fill: 0, figure: "300 W", status: "No limit", records: [] });
  });
});

describe("partGroups", () => {
  it("gives the parts of each kind, with no door", () => {
    const groups = partGroups(SCENE, LAYER);
    expect(groups.map((group) => [group.title, group.parts.length])).toEqual([["Objects", 9], ["Outlets", 7], ["Windows", 2], ["Walls", 7], ["Floors", 1]]); // prettier-ignore
    expect(groups[2]!.parts.map((part) => partKey(part.record))).toEqual(["glass:window-east", "glass:window-west"]);
    expect(groups[0]!.parts[0]).toEqual({ record: { kind: "object", source: "desk" }, name: "Desk" });
  });

  it("has no group for a kind with no part", () => {
    const bare: Scene = { schema: "scene/2", room: { schema: "room/2", unit: "m", height: 2.4, wallThickness: 0.1, walls: [{ id: "a", from: [0, 0], to: [4, 0] }] } };
    expect(partGroups(bare, NO_LAYER).map((group) => group.title)).toEqual(["Walls"]);
  });
});

describe("legendRows", () => {
  it("gives the sign and the number of the outlets of each level, with the unknown level last", () => {
    expect(legendRows(LAYER)).toEqual([
      { level: "ok", shape: "disc", label: "Within its limit", count: 5 },
      { level: "near", shape: "triangle", label: "Near its limit", count: 2 },
      { level: "over", shape: "square", label: "Over its limit", count: 0 },
      { level: "unknown", shape: "ring", label: "No load value", count: 0 },
    ]);
  });

  it("counts an outlet with no circuit, and an outlet of a circuit with no load, as unknown", () => {
    const layer: ElectricalLayer = {
      schema: ELECTRICAL_SCHEMA,
      outlets: [
        { id: "free", anchor: { on: "wall", wall: "south", face: "left", offset: 1, height: 0.3 } },
        { id: "quiet", anchor: { on: "wall", wall: "south", face: "left", offset: 2, height: 0.3 }, circuit: "c" },
      ],
      circuits: [{ id: "c", limit: 1440 }],
    };
    expect(legendRows(layer).map((row) => row.count)).toEqual([0, 0, 0, 2]);
  });
});
