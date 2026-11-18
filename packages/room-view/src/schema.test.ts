import { describe, expect, it } from "vitest";
import { expandLevel } from "./level.ts";
import { SAMPLE_LEVEL, SAMPLE_ROOM, SAMPLE_SCENE, SAMPLE_SURVEY } from "./sample.ts";
import { anchorSchema, levelSchema, roomSchema, sceneSchema, surveySchema } from "./schema.ts";
import { expandSurvey } from "./survey.ts";

type Data = Record<string, unknown>;

/** A copy of the sample room as plain JSON data, with a change. */
function roomWith(change: (room: Data) => void): unknown {
  const room = JSON.parse(JSON.stringify(SAMPLE_ROOM)) as Data;
  change(room);
  return room;
}

/** The first record of a list of the room. */
function first(room: Data, list: string): Data {
  return (room[list] as Data[])[0]!;
}

function accepts(room: unknown): boolean {
  return roomSchema.safeParse(room).success;
}

describe("roomSchema", () => {
  it("accepts the sample room, also after a change to JSON text and back", () => {
    expect(roomSchema.parse(SAMPLE_ROOM)).toEqual(SAMPLE_ROOM);
    expect(roomSchema.parse(JSON.parse(JSON.stringify(SAMPLE_ROOM)))).toEqual(SAMPLE_ROOM);
  });

  it("accepts a room with only its necessary fields", () => {
    const room = { schema: "room/2", unit: "ft", height: 8, wallThickness: 0.4, walls: [] };
    expect(roomSchema.parse(room)).toEqual(room);
  });

  it("refuses a field that the format does not have", () => {
    expect(
      accepts(
        roomWith((room) => {
          room["color"] = "red";
        }),
      ),
    ).toBe(false);
    for (const list of ["walls", "openings", "floors"]) {
      const changed = roomWith((room) => {
        first(room, list)["note"] = "x";
      });
      expect(accepts(changed), list).toBe(false);
    }
  });

  it("refuses a different schema name, a unit that the format does not have and a record with no walls field", () => {
    const changes: readonly ((room: Data) => void)[] = [
      (room) => {
        room["schema"] = "room/3";
      },
      (room) => {
        room["unit"] = "yd";
      },
      (room) => {
        delete room["walls"];
      },
    ];
    for (const change of changes) expect(accepts(roomWith(change))).toBe(false);
  });

  it("refuses a number that is not finite and a value of a different type", () => {
    expect(accepts({ ...SAMPLE_ROOM, height: Number.NaN })).toBe(false);
    expect(accepts({ ...SAMPLE_ROOM, wallThickness: Infinity })).toBe(false);
    const changes: readonly ((room: Data) => void)[] = [
      (room) => {
        room["height"] = "2.5";
      },
      (room) => {
        first(room, "walls")["from"] = [0, 0, 0];
      },
      (room) => {
        first(room, "walls")["side"] = "middle";
      },
      (room) => {
        first(room, "openings")["kind"] = "arch";
      },
      (room) => {
        first(room, "floors")["ring"] = [[0, 0, 0]];
      },
    ];
    for (const change of changes) expect(accepts(roomWith(change))).toBe(false);
  });

  it("refuses an empty id", () => {
    const changes: readonly ((room: Data) => void)[] = [
      (room) => {
        first(room, "walls")["id"] = "";
      },
      (room) => {
        first(room, "openings")["wall"] = "";
      },
    ];
    for (const change of changes) expect(accepts(roomWith(change))).toBe(false);
  });

  it("refuses the old fields of version 1: an add-on keeps those records in a layer of a scene", () => {
    expect(accepts({ ...SAMPLE_ROOM, outlets: [] })).toBe(false);
    expect(accepts({ ...SAMPLE_ROOM, circuits: [] })).toBe(false);
  });

  it("does not examine the meaning of a record", () => {
    // The checks tell these faults: a size below 0, and an opening on a wall that the room does not have.
    const changes: readonly ((room: Data) => void)[] = [
      (room) => {
        room["height"] = -1;
      },
      (room) => {
        first(room, "openings")["wall"] = "none";
      },
    ];
    for (const change of changes) expect(accepts(roomWith(change))).toBe(true);
  });
});

describe("sceneSchema", () => {
  it("accepts the sample scene, also after a change to JSON text and back", () => {
    expect(sceneSchema.parse(SAMPLE_SCENE)).toEqual(SAMPLE_SCENE);
    expect(sceneSchema.parse(JSON.parse(JSON.stringify(SAMPLE_SCENE)))).toEqual(SAMPLE_SCENE);
  });

  it("accepts a scene with only its necessary fields", () => {
    const scene = { schema: "scene/2", room: { schema: "room/2", unit: "m", height: 2.4, wallThickness: 0.1, walls: [] } };
    expect(sceneSchema.parse(scene)).toEqual(scene);
  });

  it("refuses a record with a fault in its form", () => {
    const object = { id: "o", kind: "box", size: [1, 1, 1], at: [0, 0] };
    const sceneAccepts = (more: Data): boolean => sceneSchema.safeParse({ schema: "scene/2", room: SAMPLE_ROOM, ...more }).success;
    expect(sceneAccepts({ objects: [object] })).toBe(true);
    expect(sceneAccepts({ schema: "scene/3" })).toBe(false);
    expect(sceneAccepts({ room: { ...SAMPLE_ROOM, unit: "yd" } })).toBe(false);
    expect(sceneAccepts({ view: "top" })).toBe(false);
    expect(sceneAccepts({ objects: [{ ...object, color: "red" }] })).toBe(false);
    expect(sceneAccepts({ objects: [{ ...object, size: [1, 1] }] })).toBe(false);
    expect(sceneAccepts({ objects: [{ ...object, kind: "" }] })).toBe(false);
    expect(sceneAccepts({ objects: [{ ...object, turn: Number.NaN }] })).toBe(false);
    // Version 2 has no loads and no outlet of an object: a layer keeps them.
    expect(sceneAccepts({ loads: [{ circuit: "a", watts: 5 }] })).toBe(false);
    expect(sceneAccepts({ objects: [{ ...object, outlet: "a" }] })).toBe(false);
  });

  it("keeps each layer, and refuses a layer name that is not a word, a slash and a version", () => {
    const scene = { schema: "scene/2", room: SAMPLE_ROOM, layers: { "mark/1": { marks: [{ id: "m", size: 1 }] }, "pipe/1": 7 } };
    expect(sceneSchema.parse(JSON.parse(JSON.stringify(scene)))).toEqual(scene);
    expect(sceneSchema.safeParse({ ...scene, layers: { "": {} } }).success).toBe(false);
    expect(sceneSchema.safeParse({ ...scene, layers: { Mark: {} } }).success).toBe(false);
    expect(sceneSchema.safeParse({ ...scene, layers: { "mark:1/1": {} } }).success).toBe(false);
    expect(sceneSchema.safeParse({ ...scene, layers: "mark/1" }).success).toBe(false);
  });
});

describe("anchorSchema", () => {
  const anchors = [
    { on: "wall", wall: "a", face: "left", offset: 1, height: 0.3 },
    { on: "floor", at: [1, 2] },
    { on: "floor", at: [1, 2], floor: "f" },
    { on: "ceiling", at: [1, 2] },
    { on: "ceiling", at: [1, 2], floor: "f" },
    { on: "object", object: "desk" },
    { on: "object", object: "desk", at: [0, 0, 0.75], out: [0, 0, 1] },
  ];
  const anchorAccepts = (anchor: unknown): boolean => anchorSchema.safeParse(anchor).success;

  it("accepts an anchor on each surface, also after a change to JSON text and back", () => {
    for (const anchor of anchors) {
      expect(anchorSchema.parse(anchor)).toEqual(anchor);
      expect(anchorSchema.parse(JSON.parse(JSON.stringify(anchor)))).toEqual(anchor);
    }
  });

  it("refuses an anchor with a fault in its form", () => {
    expect(anchorAccepts({ on: "door", at: [1, 2] })).toBe(false);
    expect(anchorAccepts({ at: [1, 2] })).toBe(false);
    expect(anchorAccepts("wall")).toBe(false);
    expect(anchorAccepts({ on: "wall", wall: "a", face: "top", offset: 1, height: 0.3 })).toBe(false);
    expect(anchorAccepts({ on: "wall", wall: "", face: "left", offset: 1, height: 0.3 })).toBe(false);
    expect(anchorAccepts({ on: "wall", wall: "a", face: "left", offset: 1 })).toBe(false);
    expect(anchorAccepts({ on: "floor", at: [1, 2, 3] })).toBe(false);
    expect(anchorAccepts({ on: "floor", at: [1, 2], floor: "" })).toBe(false);
    expect(anchorAccepts({ on: "ceiling", at: [1, Number.NaN] })).toBe(false);
    expect(anchorAccepts({ on: "object", object: "desk", at: [0, 0] })).toBe(false);
    expect(anchorAccepts({ on: "object", object: "desk", out: [0, 0, Number.POSITIVE_INFINITY] })).toBe(false);
  });

  it("refuses a field that the surface of the anchor does not have", () => {
    expect(anchorAccepts({ on: "wall", wall: "a", face: "left", offset: 1, height: 0.3, at: [1, 2] })).toBe(false);
    expect(anchorAccepts({ on: "floor", at: [1, 2], height: 1 })).toBe(false);
    expect(anchorAccepts({ on: "object", object: "desk", color: "red" })).toBe(false);
  });

  it("does not examine the meaning of an anchor", () => {
    expect(anchorAccepts({ on: "wall", wall: "no-wall", face: "left", offset: -5, height: 99 })).toBe(true);
    expect(anchorAccepts({ on: "object", object: "desk", out: [0, 0, 0] })).toBe(true);
  });
});

describe("surveySchema", () => {
  const survey = {
    schema: "survey/2",
    name: "Study",
    unit: "ft",
    height: 8,
    wallThickness: 0.4,
    sides: [
      { id: "south", length: 12, turn: "left" },
      { id: "east", length: 10, turn: "left", thickness: 0.5, height: 7.5 },
      { id: "north", length: 12, turn: 90 },
      { id: "west", length: 10, turn: "left" },
    ],
    start: [1, 2],
    heading: 30,
    checks: [{ id: "diagonal", from: "south", to: "north", length: 15.6 }],
    openings: [{ id: "door", wall: "south", kind: "door", offset: 1, width: 3, height: 6.8 }],
  };
  const surveyAccepts = (more: Data): boolean => surveySchema.safeParse({ ...survey, ...more }).success;
  const side = { id: "a", length: 1, turn: "left" };

  it("accepts a survey, also after a change to JSON text and back", () => {
    expect(surveySchema.parse(survey)).toEqual(survey);
    expect(surveySchema.parse(JSON.parse(JSON.stringify(survey)))).toEqual(survey);
    expect(surveySchema.parse(SAMPLE_SURVEY)).toEqual(SAMPLE_SURVEY);
  });

  it("accepts a survey with only its necessary fields", () => {
    const small = { schema: "survey/2", unit: "m", height: 2.4, wallThickness: 0.1, sides: [] };
    expect(surveySchema.parse(small)).toEqual(small);
  });

  it("refuses a record with a fault in its form", () => {
    expect(surveyAccepts({ sides: [side] })).toBe(true);
    expect(surveyAccepts({ schema: "survey/3" })).toBe(false);
    expect(surveyAccepts({ unit: "yd" })).toBe(false);
    expect(surveyAccepts({ color: "red" })).toBe(false);
    expect(surveyAccepts({ sides: undefined })).toBe(false);
    expect(surveyAccepts({ sides: [{ ...side, turn: "up" }] })).toBe(false);
    expect(surveyAccepts({ sides: [{ id: "a", length: 1 }] })).toBe(false);
    expect(surveyAccepts({ sides: [{ ...side, length: Number.NaN }] })).toBe(false);
    expect(surveyAccepts({ sides: [{ ...side, turn: Infinity }] })).toBe(false);
    expect(surveyAccepts({ sides: [{ ...side, id: "" }] })).toBe(false);
    expect(surveyAccepts({ sides: [{ ...side, note: "x" }] })).toBe(false);
    expect(surveyAccepts({ start: [0, 0, 0] })).toBe(false);
    expect(surveyAccepts({ heading: "north" })).toBe(false);
    expect(surveyAccepts({ checks: [{ id: "d", from: "south", to: "north" }] })).toBe(false);
    expect(surveyAccepts({ openings: [{ id: "door", wall: "south", kind: "arch", offset: 1, width: 3, height: 6.8 }] })).toBe(false);
    // Version 2 has no outlets and no circuits: a layer keeps them.
    expect(surveyAccepts({ circuits: [{ id: "a", limit: 1440 }] })).toBe(false);
    expect(surveyAccepts({ outlets: [] })).toBe(false);
  });

  it("does not examine the meaning of a record", () => {
    // The expansion counts a length below 0 as 0, and the checks tell an opening on a wall that the room does not have.
    expect(surveyAccepts({ sides: [{ ...side, length: -1 }] })).toBe(true);
    expect(surveyAccepts({ sides: [{ ...side, turn: 720 }] })).toBe(true);
    expect(surveyAccepts({ openings: [{ id: "door", wall: "none", kind: "door", offset: 1, width: 3, height: 6.8 }] })).toBe(true);
  });

  it("gives a survey whose room record has the form of the room format", () => {
    for (const record of [survey, SAMPLE_SURVEY, { ...survey, sides: survey.sides.slice(0, 2) }]) {
      const result = expandSurvey(surveySchema.parse(record));
      expect(roomSchema.parse(result.room)).toEqual(result.room);
    }
  });
});

describe("levelSchema", () => {
  const room = {
    schema: "survey/2",
    unit: "m",
    height: 2.4,
    wallThickness: 0.1,
    sides: [{ id: "a", length: 3, turn: "left" }],
    openings: [{ id: "door", wall: "a", kind: "door", offset: 1, width: 0.9, height: 2 }],
  };
  const link = { id: "door", from: { room: "hall", opening: "door" }, to: { room: "study", opening: "door" }, thickness: 0.12 };
  const level = {
    schema: "level/2",
    name: "Home",
    unit: "m",
    rooms: [
      { id: "hall", survey: room },
      { id: "study", survey: { ...room, unit: "ft" } },
    ],
    connections: [link],
  };
  const levelAccepts = (more: Data): boolean => levelSchema.safeParse({ ...level, ...more }).success;

  it("accepts a level, also after a change to JSON text and back", () => {
    expect(levelSchema.parse(level)).toEqual(level);
    expect(levelSchema.parse(JSON.parse(JSON.stringify(level)))).toEqual(level);
    expect(levelSchema.parse(SAMPLE_LEVEL)).toEqual(SAMPLE_LEVEL);
    expect(levelSchema.parse(JSON.parse(JSON.stringify(SAMPLE_LEVEL)))).toEqual(SAMPLE_LEVEL);
  });

  it("accepts a level with only its necessary fields", () => {
    const small = { schema: "level/2", unit: "m", rooms: [] };
    expect(levelSchema.parse(small)).toEqual(small);
    expect(levelAccepts({ connections: [{ id: "door", from: link.from, to: link.to }] })).toBe(true);
  });

  it("refuses a record with a fault in its form", () => {
    expect(levelAccepts({})).toBe(true);
    expect(levelAccepts({ schema: "level/3" })).toBe(false);
    expect(levelAccepts({ unit: "yd" })).toBe(false);
    expect(levelAccepts({ color: "red" })).toBe(false);
    expect(levelAccepts({ rooms: undefined })).toBe(false);
    expect(levelAccepts({ rooms: [{ survey: room }] })).toBe(false);
    expect(levelAccepts({ rooms: [{ id: "", survey: room }] })).toBe(false);
    expect(levelAccepts({ rooms: [{ id: "hall" }] })).toBe(false);
    expect(levelAccepts({ rooms: [{ id: "hall", survey: room, floor: 2 }] })).toBe(false);
    expect(levelAccepts({ rooms: [{ id: "hall", survey: { ...room, schema: "survey/1" } }] })).toBe(false);
    expect(levelAccepts({ rooms: [{ id: "hall", survey: { ...room, sides: [{ id: "a", length: 3 }] } }] })).toBe(false);
    expect(levelAccepts({ connections: [{ id: "door", from: link.from }] })).toBe(false);
    expect(levelAccepts({ connections: [{ from: link.from, to: link.to }] })).toBe(false);
    expect(levelAccepts({ connections: [{ ...link, to: { ...link.to, wall: "a" } }] })).toBe(false);
    expect(levelAccepts({ connections: [{ ...link, to: { room: "", opening: "door" } }] })).toBe(false);
    expect(levelAccepts({ connections: [{ ...link, to: { room: "study" } }] })).toBe(false);
    expect(levelAccepts({ connections: [{ ...link, thickness: "thin" }] })).toBe(false);
    expect(levelAccepts({ connections: [{ ...link, thickness: Number.NaN }] })).toBe(false);
    expect(levelAccepts({ connections: [{ ...link, note: "x" }] })).toBe(false);
    expect(levelAccepts({ circuits: [{ id: "a" }] })).toBe(false);
  });

  it("does not examine the meaning of a record", () => {
    // The expansion tells a connection to a room that the level does not have, and it uses the default for a thickness below 0.
    expect(levelAccepts({ connections: [{ ...link, to: { room: "none", opening: "none" } }] })).toBe(true);
    expect(levelAccepts({ connections: [{ ...link, thickness: -1 }] })).toBe(true);
    // The checks of the room record tell two rooms with one `id`.
    expect(levelAccepts({ rooms: [level.rooms[0], level.rooms[0]] })).toBe(true);
  });

  it("gives a level whose room record has the form of the room format", () => {
    for (const record of [level, SAMPLE_LEVEL, { schema: "level/2", unit: "in", rooms: [] }]) {
      const result = expandLevel(levelSchema.parse(record));
      expect(roomSchema.parse(result.room)).toEqual(result.room);
    }
  });
});

describe("surveySchema, the objects of a survey", () => {
  const object = { id: "desk", kind: "desk", wall: "south", offset: 1, width: 1.6, depth: 0.75, height: 0.74 };
  const withObjects = (...objects: unknown[]): boolean => surveySchema.safeParse({ ...SAMPLE_SURVEY, objects }).success;

  it("accepts an object on a side, an object on a holder, and each field that is not necessary", () => {
    expect(withObjects()).toBe(true);
    expect(withObjects(object)).toBe(true);
    expect(withObjects(object, { id: "lamp", kind: "lamp", on: "desk", offset: 0, width: 0.2, depth: 0.2, height: 0.4 })).toBe(true);
    expect(withObjects({ ...object, name: "Desk", gap: 0.05, lift: 0.1 })).toBe(true);
    expect(withObjects({ ...object, on: "rack" })).toBe(true);
    // The schema examines the form only. `expandSurvey` gives no place to an object with no side and no holder.
    expect(withObjects({ id: "a", kind: "desk", offset: 0, width: 1, depth: 1, height: 1 })).toBe(true);
    expect(withObjects({ ...object, offset: -1, width: 0 })).toBe(true);
  });

  it("refuses an object with a fault in its form", () => {
    expect(withObjects({ ...object, color: "red" })).toBe(false);
    expect(withObjects({ ...object, turn: 90 })).toBe(false);
    expect(withObjects({ ...object, kind: "" })).toBe(false);
    expect(withObjects({ ...object, id: "" })).toBe(false);
    expect(withObjects({ ...object, wall: "" })).toBe(false);
    expect(withObjects({ ...object, on: 3 })).toBe(false);
    expect(withObjects({ ...object, width: undefined })).toBe(false);
    expect(withObjects({ ...object, depth: "1" })).toBe(false);
    expect(withObjects({ ...object, height: Number.NaN })).toBe(false);
    expect(withObjects({ ...object, offset: Infinity })).toBe(false);
    expect(withObjects({ ...object, gap: null })).toBe(false);
    expect(withObjects({ ...object, outlet: "south-1" })).toBe(false);
    expect(withObjects(null)).toBe(false);
    expect(surveySchema.safeParse({ ...SAMPLE_SURVEY, objects: object }).success).toBe(false);
  });

  it("examines the objects of each room of a level", () => {
    const withRoomObjects = (...objects: unknown[]): boolean =>
      levelSchema.safeParse({ ...SAMPLE_LEVEL, rooms: SAMPLE_LEVEL.rooms.map((room) => ({ ...room, survey: { ...room.survey, objects } })) }).success;
    expect(withRoomObjects(object)).toBe(true);
    expect(withRoomObjects({ ...object, color: "red" })).toBe(false);
    expect(levelSchema.safeParse({ ...SAMPLE_LEVEL, objects: [object] }).success).toBe(false);
  });

  it("keeps the objects of the samples after a change to JSON text and back", () => {
    expect(surveySchema.parse(JSON.parse(JSON.stringify(SAMPLE_SURVEY))).objects).toEqual(SAMPLE_SURVEY.objects);
    expect(SAMPLE_SURVEY.objects).toHaveLength(9);
    expect(levelSchema.parse(JSON.parse(JSON.stringify(SAMPLE_LEVEL))).rooms.map((room) => room.survey.objects?.length)).toEqual([9, 1, 1, 2]);
  });
});

describe("the layers of a survey and of a level", () => {
  const layers = { "electrical/1": { schema: "electrical/1", outlets: [] }, "mark/1": 5 };
  const BAD_NAMES = ["", "Mark", "mark:1/1"];
  /** The sample level with a value as the layers of the survey of its first room. */
  const inFirstRoom = (value: unknown): unknown => ({
    ...SAMPLE_LEVEL,
    rooms: SAMPLE_LEVEL.rooms.map((room, index) => (index === 0 ? { ...room, survey: { ...room.survey, layers: value } } : room)),
  });

  it("accepts the layers of a survey, and keeps each layer as it is", () => {
    expect(surveySchema.parse({ ...SAMPLE_SURVEY, layers }).layers).toEqual(layers);
    expect(surveySchema.parse(JSON.parse(JSON.stringify({ ...SAMPLE_SURVEY, layers }))).layers).toEqual(layers);
    expect(surveySchema.parse({ ...SAMPLE_SURVEY, layers: {} }).layers).toEqual({});
  });

  it("refuses the layers of a survey with a name that is not a layer name, and layers that are not a record", () => {
    for (const name of BAD_NAMES) expect(surveySchema.safeParse({ ...SAMPLE_SURVEY, layers: { [name]: {} } }).success, name).toBe(false);
    expect(surveySchema.safeParse({ ...SAMPLE_SURVEY, layers: "mark/1" }).success).toBe(false);
  });

  it("accepts the layers of a level and of the survey of a room", () => {
    expect(levelSchema.parse({ ...SAMPLE_LEVEL, layers }).layers).toEqual(layers);
    expect(levelSchema.parse(inFirstRoom(layers)).rooms[0]?.survey.layers).toEqual(layers);
  });

  it("refuses the layers of a level with a name that is not a layer name, and layers that are not a record", () => {
    for (const name of BAD_NAMES) {
      expect(levelSchema.safeParse({ ...SAMPLE_LEVEL, layers: { [name]: {} } }).success, name).toBe(false);
      expect(levelSchema.safeParse(inFirstRoom({ [name]: {} })).success, name).toBe(false);
    }
    expect(levelSchema.safeParse({ ...SAMPLE_LEVEL, layers: "mark/1" }).success).toBe(false);
    expect(levelSchema.safeParse(inFirstRoom("mark/1")).success).toBe(false);
  });
});
