import { describe, expect, it } from "vitest";
import { importPlan } from "./plan-import/importer.ts";
import { sampleSheet } from "./plan-import/sheet.fixture.ts";
import { readLegend } from "./plan-import/sheet.ts";
import type { Room } from "./room.ts";
import { floorRoute, roomGraph } from "./routes.ts";

/** An invented row of three rooms of 4 m by 4 m, A, B and C, from west to east. */
const row: Room = {
  schema: "room/2",
  unit: "m",
  height: 2.5,
  wallThickness: 0.2,
  walls: [
    { id: "ab", from: [4, 0], to: [4, 4] },
    { id: "bc", from: [8, 0], to: [8, 4] },
    { id: "south", from: [0, 0], to: [12, 0] },
  ],
  openings: [
    { id: "d1", wall: "ab", kind: "door", offset: 1, width: 1, height: 2 },
    { id: "w1", wall: "ab", kind: "window", offset: 3, width: 0.5, sill: 1, height: 1 },
    { id: "d2", wall: "south", kind: "door", offset: 6, width: 1, height: 2 },
    { id: "d3", wall: "bc", kind: "gap", offset: 2, width: 1, height: 2 },
  ],
  floors: [
    { id: "A", ring: [[0, 0], [3.9, 0], [3.9, 4], [0, 4]] },
    { id: "B", ring: [[4.1, 0], [7.9, 0], [7.9, 4], [4.1, 4]] },
    { id: "C", ring: [[8.1, 0], [12, 0], [12, 4], [8.1, 4]] },
  ],
};

describe("roomGraph", () => {
  const graph = roomGraph(row);

  it("gives the floors on the two sides of each door and gap, and leaves out the windows", () => {
    const sides = Object.fromEntries(graph.sides.map((side) => [side.opening, [...side.floors].sort()]));
    expect(sides).toEqual({ d1: ["A", "B"], d2: ["B"], d3: ["B", "C"] });
    expect(graph.sides.find((side) => side.opening === "d1")?.at).toEqual([4, 1.5]);
  });

  it("joins the openings of each floor in both directions, with the straight distance", () => {
    const step = graph.steps.findIndex((item) => item.from === "d1" && item.to === "d3");
    expect(graph.steps[step]?.weight).toBeCloseTo(Math.hypot(4, 1), 9);
    expect(graph.stepFloors[step]).toBe("B");
    expect(graph.steps.some((item) => item.from === "d3" && item.to === "d1")).toBe(true);
    // B has three openings, so six steps. A and C have one opening each, so no step.
    expect(graph.steps).toHaveLength(6);
  });

  it("finds no floor past the reach", () => {
    // Floor A stops 0.2 m short of the face of the wall ab.
    const short = { ...row, floors: [{ id: "A", ring: [[0, 0], [3.7, 0], [3.7, 4], [0, 4]] as const }, ...row.floors!.slice(1)] };
    const sides = (reach?: number) => roomGraph(short, { reach }).sides.find((side) => side.opening === "d1")?.floors;
    expect(sides(0.1)).toEqual(["B"]);
    expect(sides(0.3)).toEqual(["A", "B"]);
    expect(sides()).toEqual(["A", "B"]);
  });
});

describe("floorRoute", () => {
  const graph = roomGraph(row);

  it("goes through each floor between the start and the nearest floor of the set", () => {
    expect(floorRoute(graph, "A", ["C"])).toEqual({ floors: ["A", "B", "C"], openings: ["d1", "d3"], length: Math.hypot(4, 1) });
    expect(floorRoute(graph, "A", ["B", "C"])).toEqual({ floors: ["A", "B"], openings: ["d1"], length: 0 });
  });

  it("gives the start floor alone for a start in the set, and no route to a floor with no way in", () => {
    expect(floorRoute(graph, "B", ["B"])).toEqual({ floors: ["B"], openings: [], length: 0 });
    expect(floorRoute(graph, "A", ["D"])).toBeUndefined();
    expect(floorRoute(roomGraph(row, { kinds: ["door"] }), "A", ["C"])).toBeUndefined();
  });

  it("finds the way from one room of a plan import to the other through the corridor", () => {
    const sheet = sampleSheet();
    const result = importPlan(sheet, { legend: readLegend(sheet) });
    const plan = roomGraph(result.room);
    const units = result.rooms.filter((room) => room.use === "UNIT").map((room) => room.id);
    const corridor = result.rooms.find((room) => room.use === "CORRIDOR")!.id;
    const route = floorRoute(plan, units[0]!, [units[1]!]);
    expect(route?.floors).toEqual([units[0], corridor, units[1]]);
    expect(route?.openings).toHaveLength(2);
    // The two doors of the sample are 10 ft apart, center to center.
    expect(route?.length).toBeCloseTo(10, 0);
  });
});

/**
 * An invented hall of 10 m by 10 m around a court of 4 m by 4 m, with a room on its west side and a room on its east side.
 * The outline of the hall goes around the court, as the outline of a plan import does. The court has one door to the hall.
 */
const court: Room = {
  schema: "room/2",
  unit: "m",
  height: 2.5,
  wallThickness: 0.2,
  walls: [
    { id: "west", from: [0, 0], to: [0, 10] },
    { id: "east", from: [10, 0], to: [10, 10] },
    { id: "court-north", from: [3, 7], to: [7, 7] },
  ],
  openings: [
    { id: "d-west", wall: "west", kind: "door", offset: 4.5, width: 1, height: 2 },
    { id: "d-east", wall: "east", kind: "door", offset: 4.5, width: 1, height: 2 },
    { id: "d-court", wall: "court-north", kind: "door", offset: 1.5, width: 1, height: 2 },
  ],
  floors: [
    { id: "hall", ring: [[0.1, 0.1], [9.9, 0.1], [9.9, 9.9], [0.1, 9.9]] },
    { id: "court", ring: [[3.1, 3.1], [6.9, 3.1], [6.9, 6.9], [3.1, 6.9]] },
    { id: "W", ring: [[-4, 0], [-0.1, 0], [-0.1, 10], [-4, 10]] },
    { id: "E", ring: [[10.1, 0], [14, 0], [14, 10], [10.1, 10]] },
  ],
};

describe("the walk inside each floor", () => {
  it("gives a point to the smallest floor that holds it", () => {
    const sides = roomGraph(court).sides.find((side) => side.opening === "d-court");
    expect([...sides!.floors].sort()).toEqual(["court", "hall"]);
  });

  it("goes around the court, and the length is the length of the walk", () => {
    const straight = floorRoute(roomGraph(court), "W", ["E"]);
    expect(straight?.length).toBeCloseTo(10, 9);
    expect(straight?.path).toBeUndefined();
    const walked = floorRoute(roomGraph(court, { walk: 0.1 }), "W", ["E"])!;
    expect(walked.openings).toEqual(["d-west", "d-east"]);
    expect(walked.floors).toEqual(["W", "hall", "E"]);
    // The shortest walk goes from the west door past two corners of the court: 2 * hypot(3, 2) + 4 m.
    const shortest = 2 * Math.hypot(3, 2) + 4;
    expect(walked.length).toBeGreaterThanOrEqual(shortest - 0.2);
    expect(walked.length).toBeLessThanOrEqual(shortest + 0.4);
    expect(walked.path![0]).toEqual([0, 5]);
    expect(walked.path![walked.path!.length - 1]).toEqual([10, 5]);
    // No point of the walk is inside the court.
    for (const [x, y] of walked.path!) expect(x > 3.1 && x < 6.9 && y > 3.1 && y < 6.9).toBe(false);
    for (let k = 1; k < walked.path!.length; k++) {
      const [a, b] = [walked.path![k - 1]!, walked.path![k]!];
      for (let t = 0; t <= 20; t++) {
        const [x, y] = [a[0] + ((b[0] - a[0]) * t) / 20, a[1] + ((b[1] - a[1]) * t) / 20];
        expect(x > 3.1 && x < 6.9 && y > 3.1 && y < 6.9).toBe(false);
      }
    }
  });

  it("gives the step weight of the walk on the grid, which is not less than the straight distance", () => {
    const graph = roomGraph(court, { walk: true });
    const step = graph.steps.find((item) => item.from === "d-west" && item.to === "d-east")!;
    expect(step.weight).toBeGreaterThan(2 * Math.hypot(3, 2) + 4 - 0.2);
    expect(graph.walk?.grids.has("hall")).toBe(true);
  });
});

describe("the floors that a route goes through", () => {
  const graph = roomGraph(row);

  it("goes only through the floors of the option through", () => {
    expect(floorRoute(graph, "A", ["C"], { through: [] })).toBeUndefined();
    expect(floorRoute(graph, "A", ["C"], { through: ["B"] })?.floors).toEqual(["A", "B", "C"]);
    expect(floorRoute(graph, "A", ["B"], { through: [] })?.openings).toEqual(["d1"]);
  });

  it("gives the walk of the steps that the route takes", () => {
    const walked = floorRoute(roomGraph(court, { walk: 0.1 }), "W", ["E"], { through: ["hall"] })!;
    expect(walked.floors).toEqual(["W", "hall", "E"]);
    expect(floorRoute(roomGraph(court, { walk: 0.1 }), "W", ["E"], { through: ["court"] })).toBeUndefined();
  });
});
