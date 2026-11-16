import { sceneSolids, type Scene } from "@mark1russell7/room-view";
import { SAMPLE_SCENE } from "@mark1russell7/room-view/sample";
import { describe, expect, it } from "vitest";
import { circuitRows, detailsOf, formatArea, formatLength, formatNumber, partGroups, partKey, partName, recordText, roomDetails } from "./details.ts";

const rowsOf = (kind: "floor" | "wall" | "glass" | "outlet" | "object", source: string): Readonly<Record<string, string>> =>
  Object.fromEntries((detailsOf(SAMPLE_SCENE, { kind, source })?.rows ?? []).map((row) => [row.label, row.value]));

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
});

describe("detailsOf", () => {
  it("gives the measurements of a wall, with its door and its outlets", () => {
    expect(detailsOf(SAMPLE_SCENE, { kind: "wall", source: "south" })).toMatchObject({ title: "south", kind: "Wall" });
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
    expect(detailsOf(SAMPLE_SCENE, { kind: "floor", source: "floor" })?.title).toBe("Room");
  });

  it("gives the measurements of a window", () => {
    expect(rowsOf("glass", "window-east")).toEqual({ Wall: "east", Width: "1.4 m", Height: "1.2 m", "Bottom above the floor": "0.9 m" });
    expect(detailsOf(SAMPLE_SCENE, { kind: "glass", source: "window-east" })?.kind).toBe("Window");
  });

  it("gives the circuit of an outlet and the objects that it gives power to", () => {
    expect(rowsOf("outlet", "nook-1")).toEqual({ Wall: "north", "Height above the floor": "0.3 m", Circuit: "Circuit B", "Gives power to": "Node 1 and Node 2" });
    expect(rowsOf("outlet", "south-1")).toMatchObject({ Circuit: "Circuit A", "Gives power to": "None" });
  });

  it("gives the size of an object, and the objects around it", () => {
    expect(rowsOf("object", "node-3")).toEqual({ Kind: "computer", Width: "0.48 m", Depth: "0.6 m", Height: "0.18 m", "Held by": "Rack", Outlet: "nook-2", Circuit: "Circuit B" });
    expect(rowsOf("object", "rack")).toMatchObject({ Kind: "rack", Holds: "Node 1, Node 2, Node 3, and Node 4" });
    expect(rowsOf("object", "sofa")).toEqual({ Kind: "sofa", Width: "2 m", Depth: "0.9 m", Height: "0.8 m" });
  });

  it("gives the record as text", () => {
    expect(detailsOf(SAMPLE_SCENE, { kind: "outlet", source: "east-1" })?.record).toBe(
      '{\n  "id": "east-1",\n  "wall": "east",\n  "face": "left",\n  "offset": 0.4,\n  "height": 0.3,\n  "circuit": "a"\n}',
    );
  });

  it("gives undefined for a record that the scene does not have", () => {
    for (const kind of ["floor", "wall", "glass", "outlet", "object"] as const) expect(detailsOf(SAMPLE_SCENE, { kind, source: "none" })).toBeUndefined();
  });

  it("has details for the record of each solid of the model", () => {
    for (const solid of sceneSolids(SAMPLE_SCENE)) expect(detailsOf(SAMPLE_SCENE, solid), solid.id).toBeDefined();
  });
});

describe("partName", () => {
  it("gives the kind before an id, and only the name of an object or a floor", () => {
    expect(partName(SAMPLE_SCENE, { kind: "wall", source: "south" })).toBe("Wall south");
    expect(partName(SAMPLE_SCENE, { kind: "outlet", source: "nook-2" })).toBe("Outlet nook-2");
    expect(partName(SAMPLE_SCENE, { kind: "object", source: "node-1" })).toBe("Node 1");
    expect(partName(SAMPLE_SCENE, { kind: "floor", source: "floor" })).toBe("Room");
    expect(partName(SAMPLE_SCENE, { kind: "object", source: "none" })).toBe("none");
  });
});

describe("roomDetails", () => {
  it("gives the summary of the room", () => {
    expect(roomDetails(SAMPLE_SCENE)).toEqual({
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
    const bare: Scene = { schema: "scene/1", room: { schema: "room/1", unit: "ft", height: 8, wallThickness: 0.5, walls: [] } };
    expect(roomDetails(bare)).toMatchObject({ title: "Room", rows: [{ label: "Floor area", value: "0 ft²" }, { label: "Height", value: "8 ft" }, { label: "Walls", value: "0" }, { label: "Doors", value: "0" }, { label: "Windows", value: "0" }, { label: "Outlets", value: "0" }, { label: "Objects", value: "0" }] }); // prettier-ignore
  });
});

describe("circuitRows", () => {
  it("gives the load, the limit and the level of each circuit", () => {
    const [a, b] = circuitRows(SAMPLE_SCENE);
    expect(a).toMatchObject({ id: "a", name: "Circuit A", level: "ok", figure: "420 of 1440 W, 29.17% of the limit", status: "Within its limit" });
    expect(a!.fill).toBeCloseTo(420 / 1440, 9);
    expect(b).toMatchObject({ id: "b", name: "Circuit B", level: "near", figure: "1260 of 1440 W, 87.5% of the limit", status: "Near its limit", fill: 0.875 });
  });

  it("gives the outlets of a circuit and the objects that take power from them", () => {
    const [a, b] = circuitRows(SAMPLE_SCENE);
    expect(a!.records.map(partKey)).toEqual(["outlet:south-1", "outlet:south-2", "outlet:east-1", "outlet:west-1", "outlet:north-1", "object:tower"]);
    expect(b!.records.map(partKey)).toEqual(["outlet:nook-1", "outlet:nook-2", "object:node-1", "object:node-2", "object:node-3", "object:node-4"]);
  });

  it("fills the meter of a circuit over its limit, and gives no load for a circuit with no load record", () => {
    const scene: Scene = { ...SAMPLE_SCENE, loads: [{ circuit: "a", watts: 2000 }] };
    const [a, b] = circuitRows(scene);
    expect(a).toMatchObject({ level: "over", fill: 1, status: "Over its limit", figure: "2000 of 1440 W, 138.89% of the limit" });
    expect(b).toMatchObject({ level: "unknown", fill: 0, status: "No load value", figure: "The limit is 1440 W" });
  });
});

describe("partGroups", () => {
  it("gives the parts of each kind, with no door", () => {
    const groups = partGroups(SAMPLE_SCENE);
    expect(groups.map((group) => [group.title, group.parts.length])).toEqual([["Objects", 9], ["Outlets", 7], ["Windows", 2], ["Walls", 7], ["Floors", 1]]); // prettier-ignore
    expect(groups[2]!.parts.map((part) => partKey(part.record))).toEqual(["glass:window-east", "glass:window-west"]);
    expect(groups[0]!.parts[0]).toEqual({ record: { kind: "object", source: "desk" }, name: "Desk" });
  });

  it("has no group for a kind with no part", () => {
    const bare: Scene = { schema: "scene/1", room: { schema: "room/1", unit: "m", height: 2.4, wallThickness: 0.1, walls: [{ id: "a", from: [0, 0], to: [4, 0] }] } };
    expect(partGroups(bare).map((group) => group.title)).toEqual(["Walls"]);
  });
});
