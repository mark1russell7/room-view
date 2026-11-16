import type { Level } from "./level.ts";
import type { Room, Scene } from "./room.ts";
import type { Survey } from "./survey.ts";

/**
 * A sample room in meters. It is not a real room.
 *
 * The outline is an L shape. Each outer wall has its line on the inner face: `side` is `right` on a counter-clockwise outline.
 * A short wall makes a nook at the top. The floor goes around that wall.
 */
export const SAMPLE_ROOM: Room = {
  schema: "room/1",
  name: "Sample room",
  unit: "m",
  height: 2.5,
  wallThickness: 0.15,
  walls: [
    { id: "south", from: [0, 0], to: [6, 0], side: "right" },
    { id: "east", from: [6, 0], to: [6, 3], side: "right" },
    { id: "inset-north", from: [6, 3], to: [4, 3], side: "right" },
    { id: "inset-east", from: [4, 3], to: [4, 5], side: "right" },
    { id: "north", from: [4, 5], to: [0, 5], side: "right" },
    { id: "west", from: [0, 5], to: [0, 0], side: "right" },
    { id: "nook", from: [2.5, 5], to: [2.5, 3.6], thickness: 0.1 },
  ],
  openings: [
    { id: "door", wall: "south", kind: "door", offset: 0.6, width: 0.9, height: 2.05 },
    { id: "window-east", wall: "east", kind: "window", offset: 0.8, width: 1.4, sill: 0.9, height: 1.2 },
    { id: "window-west", wall: "west", kind: "window", offset: 1.5, width: 1.6, sill: 0.9, height: 1.2 },
  ],
  floors: [
    {
      id: "floor",
      name: "Room",
      ring: [
        [0, 0],
        [6, 0],
        [6, 3],
        [4, 3],
        [4, 5],
        [2.55, 5],
        [2.55, 3.6],
        [2.45, 3.6],
        [2.45, 5],
        [0, 5],
      ],
    },
  ],
  outlets: [
    { id: "south-1", wall: "south", face: "left", offset: 2.4, height: 0.3, circuit: "a" },
    { id: "south-2", wall: "south", face: "left", offset: 4.6, height: 0.3, circuit: "a" },
    { id: "east-1", wall: "east", face: "left", offset: 0.4, height: 0.3, circuit: "a" },
    { id: "west-1", wall: "west", face: "left", offset: 4.2, height: 0.3, circuit: "a" },
    { id: "north-1", wall: "north", face: "left", offset: 2.8, height: 0.3, circuit: "a" },
    { id: "nook-1", wall: "north", face: "left", offset: 0.7, height: 0.3, circuit: "b" },
    { id: "nook-2", wall: "inset-east", face: "left", offset: 1.2, height: 0.3, circuit: "b" },
  ],
  circuits: [
    { id: "a", name: "Circuit A", limit: 1440 },
    { id: "b", name: "Circuit B", limit: 1440 },
  ],
};

/** A sample scene of the sample room: a desk, a sofa, and a rack of four computers in the nook. Circuit B is near its limit. */
export const SAMPLE_SCENE: Scene = {
  schema: "scene/1",
  name: "Sample scene",
  room: SAMPLE_ROOM,
  objects: [
    { id: "desk", kind: "desk", name: "Desk", size: [1.6, 0.75, 0.74], at: [1.2, 4.55] },
    { id: "display", kind: "display", name: "Display", size: [0.6, 0.2, 0.4], at: [0, 0.2], lift: 0.74, parent: "desk" },
    { id: "tower", kind: "computer", name: "Tower", size: [0.22, 0.45, 0.45], at: [2.2, 4.6], outlet: "north-1" },
    { id: "sofa", kind: "sofa", name: "Sofa", size: [2, 0.9, 0.8], at: [4.4, 0.6] },
    { id: "rack", kind: "rack", name: "Rack", size: [0.6, 0.8, 1.2], at: [3.3, 4.5] },
    { id: "node-1", kind: "computer", name: "Node 1", size: [0.48, 0.6, 0.18], at: [0, 0], lift: 0.08, parent: "rack", outlet: "nook-1" },
    { id: "node-2", kind: "computer", name: "Node 2", size: [0.48, 0.6, 0.18], at: [0, 0], lift: 0.34, parent: "rack", outlet: "nook-1" },
    { id: "node-3", kind: "computer", name: "Node 3", size: [0.48, 0.6, 0.18], at: [0, 0], lift: 0.6, parent: "rack", outlet: "nook-2" },
    { id: "node-4", kind: "computer", name: "Node 4", size: [0.48, 0.6, 0.18], at: [0, 0], lift: 0.86, parent: "rack", outlet: "nook-2" },
  ],
  loads: [
    { circuit: "a", watts: 420 },
    { circuit: "b", watts: 1260 },
  ],
};

/**
 * The survey of the sample room: its six outer walls as a walk along their inner faces. The diagonal of the large part is a check.
 * It does not have the short wall of the nook, because that wall is not a side of the walk.
 * Its objects are the objects of the sample scene, each with its measurements from a wall, from the desk or from the rack.
 */
export const SAMPLE_SURVEY: Survey = {
  schema: "survey/1",
  name: "Sample room",
  unit: "m",
  height: 2.5,
  wallThickness: 0.15,
  sides: [
    { id: "south", length: 6, turn: "left" },
    { id: "east", length: 3, turn: "left" },
    { id: "inset-north", length: 2, turn: "right" },
    { id: "inset-east", length: 2, turn: "left" },
    { id: "north", length: 4, turn: "left" },
    { id: "west", length: 5, turn: "left" },
  ],
  checks: [{ id: "diagonal", from: "south", to: "inset-east", length: 5 }],
  openings: [
    { id: "door", wall: "south", kind: "door", offset: 0.6, width: 0.9, height: 2.05 },
    { id: "window-east", wall: "east", kind: "window", offset: 0.8, width: 1.4, sill: 0.9, height: 1.2 },
    { id: "window-west", wall: "west", kind: "window", offset: 1.5, width: 1.6, sill: 0.9, height: 1.2 },
  ],
  outlets: [
    { id: "south-1", wall: "south", offset: 2.4, height: 0.3, circuit: "a" },
    { id: "south-2", wall: "south", offset: 4.6, height: 0.3, circuit: "a" },
    { id: "east-1", wall: "east", offset: 0.4, height: 0.3, circuit: "a" },
    { id: "west-1", wall: "west", offset: 4.2, height: 0.3, circuit: "a" },
    { id: "north-1", wall: "north", offset: 2.8, height: 0.3, circuit: "a" },
    { id: "nook-1", wall: "north", offset: 0.7, height: 0.3, circuit: "b" },
    { id: "nook-2", wall: "inset-east", offset: 1.2, height: 0.3, circuit: "b" },
  ],
  circuits: [
    { id: "a", name: "Circuit A", limit: 1440 },
    { id: "b", name: "Circuit B", limit: 1440 },
  ],
  objects: [
    { id: "desk", kind: "desk", name: "Desk", wall: "north", offset: 2, width: 1.6, depth: 0.75, height: 0.74, gap: 0.075 },
    { id: "display", kind: "display", name: "Display", on: "desk", offset: 0.5, width: 0.6, depth: 0.2, height: 0.4, gap: 0.075 },
    { id: "tower", kind: "computer", name: "Tower", wall: "north", offset: 1.69, width: 0.22, depth: 0.45, height: 0.45, gap: 0.175, outlet: "north-1" },
    { id: "sofa", kind: "sofa", name: "Sofa", wall: "south", offset: 3.4, width: 2, depth: 0.9, height: 0.8, gap: 0.15 },
    { id: "rack", kind: "rack", name: "Rack", wall: "north", offset: 0.4, width: 0.6, depth: 0.8, height: 1.2, gap: 0.1 },
    { id: "node-1", kind: "computer", name: "Node 1", on: "rack", offset: 0.06, width: 0.48, depth: 0.6, height: 0.18, gap: 0.1, lift: 0.08, outlet: "nook-1" },
    { id: "node-2", kind: "computer", name: "Node 2", on: "rack", offset: 0.06, width: 0.48, depth: 0.6, height: 0.18, gap: 0.1, lift: 0.34, outlet: "nook-1" },
    { id: "node-3", kind: "computer", name: "Node 3", on: "rack", offset: 0.06, width: 0.48, depth: 0.6, height: 0.18, gap: 0.1, lift: 0.6, outlet: "nook-2" },
    { id: "node-4", kind: "computer", name: "Node 4", on: "rack", offset: 0.06, width: 0.48, depth: 0.6, height: 0.18, gap: 0.1, lift: 0.86, outlet: "nook-2" },
  ],
};

/**
 * A sample apartment in meters. It is not a real apartment.
 *
 * The living room is the sample room. A hall is below it in the plan, with a bathroom on its right. A bedroom is below the hall and the bathroom.
 * Each survey starts at its own corner, and the three doors give the places of the rooms.
 * The walk of the bathroom starts along its west wall, so the bathroom turns. A wall between two rooms has a thickness of 0.1 m.
 *
 * Each room has objects: the hall has a shelf, the bathroom has a vanity, and the bedroom has a bed and a wardrobe.
 */
export const SAMPLE_LEVEL: Level = {
  schema: "level/1",
  name: "Sample apartment",
  unit: "m",
  rooms: [
    { id: "living", survey: { ...SAMPLE_SURVEY, name: "Living room" } },
    {
      id: "hall",
      survey: {
        schema: "survey/1",
        name: "Hall",
        unit: "m",
        height: 2.5,
        wallThickness: 0.15,
        sides: [
          { id: "south", length: 4, turn: "left" },
          { id: "east", length: 1.2, turn: "left" },
          { id: "north", length: 4, turn: "left" },
          { id: "west", length: 1.2, turn: "left" },
        ],
        openings: [
          { id: "bedroom", wall: "south", kind: "door", offset: 0.4, width: 0.8, height: 2.05 },
          { id: "bathroom", wall: "east", kind: "door", offset: 0.2, width: 0.75, height: 2.05 },
          { id: "living", wall: "north", kind: "door", offset: 2.5, width: 0.9, height: 2.05 },
          { id: "entry", wall: "west", kind: "door", offset: 0.15, width: 0.9, height: 2.05 },
        ],
        outlets: [{ id: "south-1", wall: "south", offset: 2.6, height: 0.3, circuit: "c" }],
        objects: [{ id: "shelf", kind: "shelf", name: "Shoe shelf", wall: "south", offset: 1.6, width: 1.2, depth: 0.3, height: 0.9 }],
      },
    },
    {
      id: "bathroom",
      survey: {
        schema: "survey/1",
        name: "Bathroom",
        unit: "m",
        height: 2.5,
        wallThickness: 0.15,
        sides: [
          { id: "west", length: 2.5, turn: "left" },
          { id: "south", length: 1.9, turn: "left" },
          { id: "east", length: 2.5, turn: "left" },
          { id: "north", length: 1.9, turn: "left" },
        ],
        openings: [
          { id: "door", wall: "west", kind: "door", offset: 0.25, width: 0.75, height: 2.05 },
          { id: "window", wall: "east", kind: "window", offset: 0.9, width: 0.7, sill: 1.3, height: 0.8 },
        ],
        outlets: [{ id: "east-1", wall: "east", offset: 2.1, height: 1.1, circuit: "c" }],
        objects: [{ id: "vanity", kind: "cabinet", name: "Vanity", wall: "east", offset: 1.7, width: 0.7, depth: 0.45, height: 0.85 }],
      },
    },
    {
      id: "bedroom",
      survey: {
        schema: "survey/1",
        name: "Bedroom",
        unit: "m",
        height: 2.5,
        wallThickness: 0.15,
        sides: [
          { id: "south", length: 6, turn: "left" },
          { id: "east", length: 2.3, turn: "left" },
          { id: "inset-north", length: 2, turn: "right" },
          { id: "inset-east", length: 1.3, turn: "left" },
          { id: "north", length: 4, turn: "left" },
          { id: "west", length: 3.6, turn: "left" },
        ],
        openings: [
          { id: "door", wall: "north", kind: "door", offset: 2.8, width: 0.8, height: 2.05 },
          { id: "window", wall: "south", kind: "window", offset: 2.2, width: 1.6, sill: 0.9, height: 1.2 },
        ],
        outlets: [
          { id: "south-1", wall: "south", offset: 1, height: 0.3, circuit: "c" },
          { id: "south-2", wall: "south", offset: 5, height: 0.3, circuit: "c" },
          { id: "west-1", wall: "west", offset: 1.8, height: 0.3, circuit: "c" },
        ],
        objects: [
          { id: "bed", kind: "bed", name: "Bed", wall: "west", offset: 1, width: 1.6, depth: 2, height: 0.5 },
          { id: "wardrobe", kind: "cabinet", name: "Wardrobe", wall: "east", offset: 0.3, width: 1.8, depth: 0.6, height: 2 },
        ],
      },
    },
  ],
  connections: [
    { id: "living-hall", from: { room: "living", opening: "door" }, to: { room: "hall", opening: "living" }, thickness: 0.1 },
    { id: "hall-bathroom", from: { room: "hall", opening: "bathroom" }, to: { room: "bathroom", opening: "door" }, thickness: 0.1 },
    { id: "hall-bedroom", from: { room: "hall", opening: "bedroom" }, to: { room: "bedroom", opening: "door" }, thickness: 0.1 },
  ],
  circuits: [{ id: "c", name: "Circuit C", limit: 1440 }],
};
