import { describe, expect, it } from "vitest";
import { checkScene } from "./check.ts";
import { ROOM_SCHEMA, SCENE_SCHEMA } from "./room.ts";
import { SAMPLE_ROOM, SAMPLE_SCENE } from "./sample.ts";
import { sceneSolids, solidVolume } from "./solids.ts";

describe("the sample", () => {
  it("has the names of the two formats", () => {
    expect(SAMPLE_ROOM.schema).toBe(ROOM_SCHEMA);
    expect(SAMPLE_SCENE.schema).toBe(SCENE_SCHEMA);
    expect(SAMPLE_SCENE.room).toBe(SAMPLE_ROOM);
  });

  it("has no fault", () => {
    expect(checkScene(SAMPLE_SCENE)).toEqual([]);
  });

  it("gives a model where each solid has a volume above 0", () => {
    const solids = sceneSolids(SAMPLE_SCENE);
    expect(solids.length).toBeGreaterThan(20);
    for (const solid of solids) expect(solidVolume(solid), solid.id).toBeGreaterThan(0);
  });
});
