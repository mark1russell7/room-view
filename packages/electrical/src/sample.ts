import type { Level, Scene, Survey } from "@mark1russell7/room-view";
import { SAMPLE_LEVEL, SAMPLE_SCENE, SAMPLE_SURVEY } from "@mark1russell7/room-view/sample";
import { ELECTRICAL_SCHEMA, type Circuit, type ElectricalLayer, type Feed, type Outlet } from "./layer.ts";

// The electrical samples of the sample room and of the sample apartment of the core. They are not a real room or a real apartment.
// This module is the entry `/sample` of the package.

/** This function gives an outlet on the face in the room of a wall, 0.3 m above the floor. */
const outlet = (id: string, wall: string, offset: number, circuit: string, height = 0.3): Outlet => ({ id, anchor: { on: "wall", wall, face: "left", offset, height }, circuit });

/** This function gives a circuit of 15 A at 120 V, with the continuous limit of 1440 W. */
const circuit = (id: string, name: string): Circuit => ({ id, name, breaker: 15, voltage: 120, limit: 1440 });

// The outlets of the sample room. Circuit A has the outlets of the large part, and circuit B has the outlets of the nook.
const ROOM_OUTLETS: readonly Outlet[] = [
  outlet("south-1", "south", 2.4, "a"),
  outlet("south-2", "south", 4.6, "a"),
  outlet("east-1", "east", 0.4, "a"),
  outlet("west-1", "west", 4.2, "a"),
  outlet("north-1", "north", 2.8, "a"),
  outlet("nook-1", "north", 0.7, "b"),
  outlet("nook-2", "inset-east", 1.2, "b"),
];

// The tower is on the outlet north-1. The four computers of the rack are on the two outlets of the nook.
const ROOM_FEEDS: readonly Feed[] = [
  { id: "feed-tower", object: "tower", outlet: "north-1" },
  { id: "feed-node-1", object: "node-1", outlet: "nook-1" },
  { id: "feed-node-2", object: "node-2", outlet: "nook-1" },
  { id: "feed-node-3", object: "node-3", outlet: "nook-2" },
  { id: "feed-node-4", object: "node-4", outlet: "nook-2" },
];

/**
 * The electrical layer of the sample scene: seven outlets on the walls, two circuits and five feeds.
 * No feed has its watts, so each circuit has its load as `otherLoad`. Circuit B is near its limit.
 */
export const SAMPLE_SCENE_LAYER: ElectricalLayer = {
  schema: ELECTRICAL_SCHEMA,
  outlets: ROOM_OUTLETS,
  circuits: [
    { ...circuit("a", "Circuit A"), otherLoad: 420 },
    { ...circuit("b", "Circuit B"), otherLoad: 1260 },
  ],
  feeds: ROOM_FEEDS,
};

/**
 * The electrical layer of the sample survey: the records of the layer of the sample scene, with no load.
 * Each outlet is on a side of the walk. The expansion of the survey puts it on the face in the room.
 */
export const SAMPLE_SURVEY_LAYER: ElectricalLayer = {
  schema: ELECTRICAL_SCHEMA,
  outlets: ROOM_OUTLETS,
  circuits: [circuit("a", "Circuit A"), circuit("b", "Circuit B")],
  feeds: ROOM_FEEDS,
};

/** The sample scene of the core with its electrical layer. */
export const SAMPLE_ELECTRICAL_SCENE: Scene = { ...SAMPLE_SCENE, layers: { [ELECTRICAL_SCHEMA]: SAMPLE_SCENE_LAYER } };

/** The sample survey of the core with its electrical layer. */
export const SAMPLE_ELECTRICAL_SURVEY: Survey = { ...SAMPLE_SURVEY, layers: { [ELECTRICAL_SCHEMA]: SAMPLE_SURVEY_LAYER } };

/** The layer of each room of the sample apartment. The outlets of the hall, of the bathroom and of the bedroom are on circuit C of the level. */
const ROOM_LAYERS: Readonly<Record<string, ElectricalLayer>> = {
  living: SAMPLE_SURVEY_LAYER,
  hall: { schema: ELECTRICAL_SCHEMA, outlets: [outlet("south-1", "south", 2.6, "c")] },
  bathroom: { schema: ELECTRICAL_SCHEMA, outlets: [outlet("east-1", "east", 2.1, "c", 1.1)] },
  bedroom: { schema: ELECTRICAL_SCHEMA, outlets: [outlet("south-1", "south", 1, "c"), outlet("south-2", "south", 5, "c"), outlet("west-1", "west", 1.8, "c")] },
};

/**
 * The sample apartment of the core with its electrical layers. The level record has circuit C.
 * The survey of each room has a layer of its own. The living room has the layer of the sample survey.
 */
export const SAMPLE_ELECTRICAL_LEVEL: Level = {
  ...SAMPLE_LEVEL,
  rooms: SAMPLE_LEVEL.rooms.map((room) => {
    const layer = ROOM_LAYERS[room.id];
    return layer === undefined ? room : { ...room, survey: { ...room.survey, layers: { [ELECTRICAL_SCHEMA]: layer } } };
  }),
  layers: { [ELECTRICAL_SCHEMA]: { schema: ELECTRICAL_SCHEMA, circuits: [circuit("c", "Circuit C")] } satisfies ElectricalLayer },
};
