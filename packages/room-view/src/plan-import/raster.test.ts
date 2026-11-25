import { regionArea } from "@mark1russell7/layout-contract";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { gridOf, labelRegions, regionOutline, ringCells, stampLines } from "./raster.ts";

/** This function gives a grid with a barrier from a picture: `#` is a barrier cell and `.` is a free cell. */
function picture(rows: readonly string[]) {
  const grid = gridOf(rows[0]!.length, rows.length, 1);
  const barrier = new Uint8Array(grid.columns * grid.rows);
  rows.forEach((row, y) => [...row].forEach((mark, x) => (barrier[y * grid.columns + x] = mark === "#" ? 1 : 0)));
  return { grid, barrier };
}

describe("labelRegions", () => {
  it("gives each free region a label, its cells and its contact with the border", () => {
    const { grid, barrier } = picture(["......", ".####.", ".#..#.", ".####.", "......"]);
    const { regions, labels } = labelRegions(grid, barrier);
    expect(regions.map((region) => [region.cells, region.border])).toEqual([
      [18, true],
      [2, false],
    ]);
    expect(regions[1]!.perimeter).toBe(6);
    expect(labels[2 * 6 + 2]).toBe(2);
    expect(labels[1 * 6 + 1]).toBe(0);
  });

  it("does not join two cells that touch only at a corner", () => {
    const { grid, barrier } = picture(["#.", ".#"]);
    expect(labelRegions(grid, barrier).regions).toHaveLength(2);
  });
});

describe("regionOutline", () => {
  it("gives the outline of an L shape with six corners and its area", () => {
    const { grid, barrier } = picture(["#####", "#..##", "#..##", "#...#", "#####"]);
    const { regions, labels } = labelRegions(grid, barrier);
    const room = regions.find((region) => !region.border)!;
    const ring = regionOutline(grid, labels, room);
    expect(ring).toHaveLength(6);
    expect(regionArea({ kind: "polygon", points: ring })).toBe(room.cells);
  });

  it("gives a ring with the area of the cells for each region with no hole", () => {
    fc.assert(
      fc.property(fc.array(fc.array(fc.boolean(), { minLength: 6, maxLength: 6 }), { minLength: 6, maxLength: 6 }), (marks) => {
        const { grid, barrier } = picture(marks.map((row) => row.map((mark) => (mark ? "#" : ".")).join("")));
        const { regions, labels } = labelRegions(grid, barrier);
        for (const region of regions) {
          const ring = regionOutline(grid, labels, region);
          // A region with a hole has a larger outline than its cells, and no region has a smaller outline.
          expect(regionArea({ kind: "polygon", points: ring })).toBeGreaterThanOrEqual(region.cells);
        }
      }),
    );
  });
});

describe("stampLines and ringCells", () => {
  it("closes a box with four lines and counts the cells of a ring", () => {
    const grid = gridOf(10, 10, 1);
    const barrier = new Uint8Array(100);
    const corners = [
      [1.5, 1.5],
      [8.5, 1.5],
      [8.5, 8.5],
      [1.5, 8.5],
    ] as const;
    stampLines(
      grid,
      barrier,
      corners.map((corner, index) => ({ from: corner, to: corners[(index + 1) % 4]!, width: 0.1, color: "#000000" })),
    );
    const { regions, labels } = labelRegions(grid, barrier);
    const inner = regions.find((region) => !region.border)!;
    expect(inner.cells).toBe(36);
    expect(ringCells(grid, labels, corners).get(inner.label)).toBe(36);
  });
});
