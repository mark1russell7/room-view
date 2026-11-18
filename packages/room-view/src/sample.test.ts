import { describe, expect, it } from "vitest";
import { checkScene } from "./check.ts";
import { expandLevel, LEVEL_SCHEMA } from "./level.ts";
import { ROOM_SCHEMA, SCENE_SCHEMA, type Scene } from "./room.ts";
import { SAMPLE_LEVEL, SAMPLE_ROOM, SAMPLE_SCENE, SAMPLE_SURVEY } from "./sample.ts";
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

describe("the sample apartment", () => {
  const result = expandLevel(SAMPLE_LEVEL);
  const scene: Scene = { schema: "scene/2", room: result.room, objects: result.objects };

  it("has the name of the level format, and the sample room as its living room", () => {
    expect(SAMPLE_LEVEL.schema).toBe(LEVEL_SCHEMA);
    expect(SAMPLE_LEVEL.rooms[0]?.survey.sides).toBe(SAMPLE_SURVEY.sides);
  });

  it("gets the place of each room from a door", () => {
    expect(result.rooms.map((room) => [room.id, room.place, room.group, room.survey.start, room.survey.heading])).toEqual([
      ["living", "first", 0, [0, 0], 0],
      ["hall", "connection", 0, [0, -1.3], 0],
      // The walk of the bathroom starts along its west wall, so the bathroom turns.
      ["bathroom", "connection", 0, [4.1, -0.1], 270],
      ["bedroom", "connection", 0, [0, -5], 0],
    ]);
    for (const room of result.rooms) expect(room.result.closure.closed, room.id).toBe(true);
    expect(result.connections).toEqual(["living-hall", "hall-bathroom", "hall-bedroom"].map((id) => ({ id, use: "place", gap: 0, ratio: 0, turn: 0, width: 0, fits: true })));
  });

  it("gives one half of each wall between two rooms to each room", () => {
    // The bathroom has no door to the living room or to the bedroom, but their walls are back to back.
    expect(result.room.walls.flatMap((wall) => (wall.thickness === undefined ? [] : [[wall.id, wall.thickness]]))).toEqual([
      ["living/south", 0.05],
      ["hall/south", 0.05],
      ["hall/east", 0.05],
      ["hall/north", 0.05],
      ["bathroom/west", 0.05],
      ["bathroom/south", 0.05],
      ["bathroom/north", 0.05],
      ["bedroom/inset-north", 0.05],
      ["bedroom/inset-east", 0.05],
      ["bedroom/north", 0.05],
    ]);
  });

  it("gives one room record with a floor for each room", () => {
    expect(result.room.name).toBe("Sample apartment");
    expect(result.room.floors?.map((floor) => [floor.id, floor.name, floor.ring.length])).toEqual([
      ["living", "Living room", 6],
      ["hall", "Hall", 4],
      ["bathroom", "Bathroom", 4],
      ["bedroom", "Bedroom", 6],
    ]);
    expect(result.room.walls).toHaveLength(20);
    expect(result.room.openings).toHaveLength(11);
  });

  it("gives the objects of each room, with the `id` of the room before each `id`", () => {
    expect(result.objects.map((object) => [object.id, object.kind, object.parent])).toEqual([
      ["living/desk", "desk", undefined],
      ["living/display", "display", "living/desk"],
      ["living/tower", "computer", undefined],
      ["living/sofa", "sofa", undefined],
      ["living/rack", "rack", undefined],
      ["living/node-1", "computer", "living/rack"],
      ["living/node-2", "computer", "living/rack"],
      ["living/node-3", "computer", "living/rack"],
      ["living/node-4", "computer", "living/rack"],
      ["hall/shelf", "shelf", undefined],
      ["bathroom/vanity", "cabinet", undefined],
      ["bedroom/bed", "bed", undefined],
      ["bedroom/wardrobe", "cabinet", undefined],
    ]);
    expect(sceneSolids(scene).filter((solid) => solid.kind === "object")).toHaveLength(13);
  });

  it("has no fault, with its objects and with no object", () => {
    expect(checkScene(scene)).toEqual([]);
    expect(checkScene({ schema: "scene/2", room: result.room })).toEqual([]);
  });

  it("gives a model where each solid has a volume above 0", () => {
    const solids = sceneSolids(scene);
    expect(solids.length).toBeGreaterThan(60);
    for (const solid of solids) expect(solidVolume(solid), solid.id).toBeGreaterThan(0);
  });
});
