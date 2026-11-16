import { describe, expect, it } from "vitest";
import { SAMPLE_ROOM, SAMPLE_SCENE } from "./sample.ts";
import { roomSchema, sceneSchema } from "./schema.ts";

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
    const room = { schema: "room/1", unit: "ft", height: 8, wallThickness: 0.4, walls: [] };
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
    for (const list of ["walls", "openings", "floors", "outlets", "circuits"]) {
      const changed = roomWith((room) => {
        first(room, list)["note"] = "x";
      });
      expect(accepts(changed), list).toBe(false);
    }
  });

  it("refuses a different schema name, a unit that the format does not have and a record with no walls field", () => {
    const changes: readonly ((room: Data) => void)[] = [
      (room) => {
        room["schema"] = "room/2";
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
        first(room, "outlets")["face"] = "top";
      },
      (room) => {
        first(room, "floors")["ring"] = [[0, 0, 0]];
      },
      (room) => {
        first(room, "circuits")["limit"] = null;
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
        first(room, "outlets")["circuit"] = "";
      },
      (room) => {
        first(room, "openings")["wall"] = "";
      },
    ];
    for (const change of changes) expect(accepts(roomWith(change))).toBe(false);
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
    const scene = { schema: "scene/1", room: { schema: "room/1", unit: "m", height: 2.4, wallThickness: 0.1, walls: [] } };
    expect(sceneSchema.parse(scene)).toEqual(scene);
  });

  it("refuses a record with a fault in its form", () => {
    const object = { id: "o", kind: "box", size: [1, 1, 1], at: [0, 0] };
    const sceneAccepts = (more: Data): boolean => sceneSchema.safeParse({ schema: "scene/1", room: SAMPLE_ROOM, ...more }).success;
    expect(sceneAccepts({ objects: [object], loads: [{ circuit: "a", watts: 5 }] })).toBe(true);
    expect(sceneAccepts({ schema: "scene/2" })).toBe(false);
    expect(sceneAccepts({ room: { ...SAMPLE_ROOM, unit: "yd" } })).toBe(false);
    expect(sceneAccepts({ view: "top" })).toBe(false);
    expect(sceneAccepts({ objects: [{ ...object, color: "red" }] })).toBe(false);
    expect(sceneAccepts({ objects: [{ ...object, size: [1, 1] }] })).toBe(false);
    expect(sceneAccepts({ objects: [{ ...object, kind: "" }] })).toBe(false);
    expect(sceneAccepts({ objects: [{ ...object, turn: Number.NaN }] })).toBe(false);
    expect(sceneAccepts({ loads: [{ circuit: "a" }] })).toBe(false);
    expect(sceneAccepts({ loads: [{ circuit: "a", watts: 5, phase: 1 }] })).toBe(false);
  });
});
