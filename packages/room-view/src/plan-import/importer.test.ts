import { regionArea } from "@mark1russell7/layout-contract";
import { describe, expect, it } from "vitest";
import { checkRoom } from "../check.ts";
import { importPlan, OUTSIDE } from "./importer.ts";
import { sampleSheet, SAMPLE_SCALE, SAMPLE_WALL } from "./sheet.fixture.ts";
import { readLegend } from "./sheet.ts";

const sheet = sampleSheet();
const legend = readLegend(sheet);

describe("readLegend", () => {
  it("reads the name of each color sample, and gives the samples", () => {
    expect(legend.names).toEqual({ "#ffcc00": "UNIT", "#99ccff": "CORRIDOR" });
    expect(legend.samples).toEqual([4, 5]);
  });

  it("joins two names of one color with a slash", () => {
    const fills = [...(sheet.fills ?? []), { color: "#ffcc00", rings: [[[200, 234], [208, 234], [208, 242], [200, 242]] as const] }];
    const texts = [...(sheet.texts ?? []), { text: "AMENITY", at: [210, 242] as const, height: 6 }];
    expect(readLegend({ fills, texts }).names["#ffcc00"]).toBe("UNIT/AMENITY");
  });
});

describe("importPlan", () => {
  const result = importPlan(sheet, { legend });

  it("finds the wall pen and the door pen", () => {
    expect(result.wallPens).toEqual(["0.5|#000000"]);
    expect(result.doorPens).toEqual(["0.25|#000000"]);
    expect(result.pens.find((read) => read.pen === "0.1|#808080")?.wall).toBe(false);
  });

  it("finds the two rooms and the corridor, each with the use of its fill", () => {
    expect(result.rooms.map((room) => room.use).sort()).toEqual(["CORRIDOR", "UNIT", "UNIT"]);
    expect(result.regions.room).toBe(3);
    expect(result.regions.outside).toBe(1);
  });

  it("gives each room an area near the area between its walls", () => {
    const inner = 12 - SAMPLE_WALL;
    const expected = { CORRIDOR: (24 - SAMPLE_WALL) * (4 - SAMPLE_WALL), UNIT: inner * (14 - SAMPLE_WALL) };
    for (const room of result.rooms) {
      const area = expected[room.use as keyof typeof expected];
      // The swing of the door is a speck, not a part of the west room.
      expect(Math.abs(room.area / area - 1), room.id).toBeLessThan(0.08);
    }
  });

  it("gives each room a floor with its outline, and the area of the floor is the area of the room", () => {
    const floors = result.room.floors ?? [];
    expect(floors.map((floor) => floor.id)).toEqual(result.rooms.map((room) => room.id));
    for (const [index, floor] of floors.entries()) {
      expect(floor.name).toBe(result.rooms[index]!.use);
      // The outline goes around the cells of the room, and a hole of the room is not in it.
      expect(regionArea({ kind: "polygon", points: floor.ring })).toBeGreaterThanOrEqual(result.rooms[index]!.area - 1e-6);
    }
  });

  it("has the y axis up: the corridor is at the top of the sheet, so it is north of the rooms", () => {
    const corridor = result.rooms.find((room) => room.use === "CORRIDOR")!;
    for (const room of result.rooms.filter((item) => item.use === "UNIT")) expect(corridor.center[1]).toBeGreaterThan(room.center[1]);
  });

  it("gives one opening for each door, between a room and the corridor", () => {
    expect(result.openings).toHaveLength(2);
    const corridor = result.rooms.find((room) => room.use === "CORRIDOR")!.id;
    for (const opening of result.openings) {
      expect(opening.source).toBe("ends");
      expect(opening.sides).toContain(corridor);
      expect(opening.sides).not.toContain(OUTSIDE);
    }
    expect(result.openings.map((opening) => opening.kind).sort()).toEqual(["door", "gap"]);
    for (const opening of result.room.openings ?? []) expect(opening.width).toBeCloseTo(3, 6);
  });

  it("gives walls with the thickness of the drawing", () => {
    const pairs = result.room.walls.filter((wall) => wall.id.startsWith("wall-"));
    expect(pairs).toHaveLength(8);
    for (const wall of pairs) expect(wall.thickness).toBeCloseTo(SAMPLE_WALL, 9);
    expect(result.room.wallThickness).toBeCloseTo(SAMPLE_WALL, 9);
  });

  it("gives a room record with no error", () => {
    expect(checkRoom(result.room).filter((finding) => finding.level === "error")).toEqual([]);
  });

  it("puts each fill ring of the legend in the area gate", () => {
    expect(result.gate.rings).toHaveLength(3);
    for (const ring of result.gate.rings) expect(ring.rooms).toHaveLength(1);
    expect(result.gate.within).toEqual([
      { limit: 0.05, rings: 2 },
      { limit: 0.1, rings: 3 },
    ]);
    expect(result.gate.median).toBeLessThan(0);
  });

  it("joins the two rooms of a door with no bridge, but a door swing stays a barrier", () => {
    const wide = importPlan(sheet, { legend, bridges: { widest: 2 } });
    expect(wide.openings).toHaveLength(0);
    // The east room joins the corridor. The leaf and the swing of the west door close the west room.
    expect(wide.regions.room).toBe(2);
  });

  it("gives no use and no gate without a legend", () => {
    const bare = importPlan(sheet);
    expect(bare.rooms.every((room) => room.use === undefined)).toBe(true);
    expect(bare.gate).toEqual({ rings: [], within: [{ limit: 0.05, rings: 0 }, { limit: 0.1, rings: 0 }] });
  });

  it("gives the same plan in inches from a sheet with a scale in points for each inch", () => {
    const inches = importPlan({ ...sheet, scale: SAMPLE_SCALE / 12, unit: "in" }, { legend });
    expect(inches.rooms.map((room) => room.use)).toEqual(result.rooms.map((room) => room.use));
    inches.rooms.forEach((room, index) => expect(room.area / 144).toBeCloseTo(result.rooms[index]!.area, 6));
    expect(inches.room.wallThickness).toBeCloseTo(SAMPLE_WALL * 12, 6);
  });

  it("gives the same rooms from a sheet at a different scale", () => {
    const large = sampleSheet({ scale: 2 * SAMPLE_SCALE });
    const twice = importPlan(large, { legend: readLegend(large, { smallest: 8, largest: 60, reach: 24, smallestText: 4 }) });
    expect(twice.rooms.map((room) => room.use)).toEqual(result.rooms.map((room) => room.use));
    twice.rooms.forEach((room, index) => expect(room.area).toBeCloseTo(result.rooms[index]!.area, 6));
  });

  it("makes the cells larger when the grid has too many cells", () => {
    const coarse = importPlan(sheet, { legend, largestGrid: 20_000 });
    expect(coarse.grid.columns * coarse.grid.rows).toBeLessThanOrEqual(20_000);
    expect(coarse.grid.cell).toBeGreaterThan(0.1);
  });

  it("does not find a door swing when the sheet has none", () => {
    const plain = importPlan(sampleSheet({ swing: false }), { legend });
    expect(plain.doorPens).toEqual([]);
    expect(plain.openings.map((opening) => opening.kind)).toEqual(["gap", "gap"]);
  });
});
