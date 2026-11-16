import type { Room, Scene } from "./room.ts";

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
