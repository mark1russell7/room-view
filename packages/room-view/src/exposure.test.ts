import { describe, expect, it } from "vitest";
import { floorExposure } from "./exposure.ts";
import type { PlanPoint, Room } from "./room.ts";

/** This function gives the square floor of side 3 m at a column and a row of a block, with walls of 0.2 m between the floors. */
function cell(column: number, row: number): { id: string; ring: PlanPoint[] } {
  const x = column * 3.2;
  const y = row * 3.2;
  return { id: `c${column}${row}`, ring: [[x, y], [x + 3, y], [x + 3, y + 3], [x, y + 3]] };
}

/** An invented block of 3 by 3 floors. The middle floor `c11` has no wall on the outside. */
const block: Room = {
  schema: "room/2",
  unit: "m",
  height: 2.5,
  wallThickness: 0.2,
  walls: [],
  floors: [0, 1, 2].flatMap((row) => [0, 1, 2].map((column) => cell(column, row))),
};

describe("floorExposure", () => {
  const exposure = new Map(floorExposure(block).map((item) => [item.floor, item]));

  it("gives the length of the outline on the outside", () => {
    expect(exposure.get("c00")!.outer).toBeCloseTo(6, 6);
    expect(exposure.get("c10")!.outer).toBeCloseTo(3, 6);
    expect(exposure.get("c11")!.outer).toBe(0);
  });

  it("gives the full length of each outer side when the step does not divide the side", () => {
    const rough = new Map(floorExposure(block, { step: 0.7 }).map((item) => [item.floor, item]));
    expect(rough.get("c00")!.outer).toBeCloseTo(6, 6);
    expect(rough.get("c22")!.outer).toBeCloseTo(6, 6);
    expect(rough.get("c10")!.outer).toBeCloseTo(3, 6);
  });

  it("keeps the edges of a gentle curve in one side", () => {
    // An invented round floor of 24 edges: each edge turns by 15 degrees, so the outline has no corner.
    const ring: PlanPoint[] = Array.from({ length: 24 }, (_, index) => [5 * Math.cos((index * Math.PI) / 12), 5 * Math.sin((index * Math.PI) / 12)]);
    const round = floorExposure({ ...block, floors: [{ id: "round", ring }] });
    const perimeter = 24 * 2 * 5 * Math.sin(Math.PI / 24);
    expect(round[0]!.outer).toBeCloseTo(perimeter, 6);
  });

  it("gives the depth of an interior floor: the distance from its outline to the outer wall of another floor", () => {
    expect(exposure.get("c11")!.depth).toBeCloseTo(3.2, 6);
    expect(exposure.get("c00")!.depth).toBe(0);
  });

  it("gives the wall on a court to the floors around the court, and no exposure to the court", () => {
    const open = new Map(floorExposure(block, { outside: ["c11"] }).map((item) => [item.floor, item]));
    expect(open.has("c11")).toBe(false);
    // The floor on the middle of each side now has its outer wall and its wall on the court. A corner floor touches the court only at a corner.
    expect(open.get("c10")!.outer).toBeCloseTo(6, 6);
    expect(open.get("c00")!.outer).toBeCloseTo(6, 6);
  });

  it("reads a thick wall between two floors as a wall, not as the outside", () => {
    const thick = floorExposure(block, { reach: 0.1 }).find((item) => item.floor === "c11")!;
    // With a reach shorter than the walls, each wall is on the outside.
    expect(thick.outer).toBeCloseTo(12, 6);
  });
});

describe("floorExposure and a space that the floors close around", () => {
  /** This function gives the block without some floors. */
  const without = (...ids: string[]): Room => ({ ...block, floors: block.floors!.filter((floor) => !ids.includes(floor.id)) });

  it("does not read a space with no floor inside the block as the outside", () => {
    const exposure = new Map(floorExposure(without("c11")).map((item) => [item.floor, item]));
    // The middle space of 3 m has no floor, and the floors close around it. Thus the floor on the middle of a side keeps only its outer wall.
    expect(exposure.get("c10")!.outer).toBeCloseTo(3, 6);
    expect(exposure.get("c00")!.outer).toBeCloseTo(6, 6);
  });

  it("reads a space as the outside when a gap wider than the reach joins it to the edge of the plan", () => {
    const exposure = new Map(floorExposure(without("c11", "c12")).map((item) => [item.floor, item]));
    // The gap of 3.4 m from the middle space to the edge is wider than the reach of 3 m.
    expect(exposure.get("c10")!.outer).toBeCloseTo(6, 6);
  });
});
