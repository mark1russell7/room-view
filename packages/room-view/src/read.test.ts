import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { markAddOn, oldMarkAddOn } from "./layers.fixture.ts";
import { SAMPLE_LEVEL, SAMPLE_ROOM, SAMPLE_SCENE, SAMPLE_SURVEY } from "./sample.ts";
import { READ_CODES, readRecord, type RecordRead } from "./schema.ts";

type Data = Record<string, unknown>;

/** This function gives a copy of a record as plain JSON data. */
const copy = (value: unknown): Data => JSON.parse(JSON.stringify(value)) as Data;

/** This function gives a record of version 2 with the schema names of version 1, also in each nested record. */
function asV1(value: unknown): Data {
  const record = copy(value);
  const old = (data: Data): void => {
    if (typeof data["schema"] === "string") data["schema"] = data["schema"].replace(/\/2$/, "/1");
  };
  old(record);
  if (typeof record["room"] === "object" && record["room"] !== null) old(record["room"] as Data);
  for (const room of (record["rooms"] as Data[] | undefined) ?? []) old(room["survey"] as Data);
  return record;
}

const MARKS = [{ id: "m", anchor: { on: "floor", at: [1, 1] }, size: 2 }];
const OLD = oldMarkAddOn("mark/1");

/** This function gives the record of a correct read, or it fails the test. */
function recordOf(read: RecordRead): Data {
  if (!read.ok) throw new Error(`The read failed: ${read.errors.join(" ")}`);
  return read.record as unknown as Data;
}

describe("readRecord: a record of version 2", () => {
  it("gives each sample record as it is, with its kind and no finding", () => {
    for (const [kind, record] of [
      ["room", SAMPLE_ROOM],
      ["scene", SAMPLE_SCENE],
      ["survey", SAMPLE_SURVEY],
      ["level", SAMPLE_LEVEL],
    ] as const) {
      expect(readRecord(copy(record), [OLD])).toEqual({ ok: true, kind, record, version: 2, findings: [] });
    }
  });

  it("does not use the read v1 of an add-on: a field of version 1 is a fault", () => {
    const read = readRecord({ ...copy(SAMPLE_ROOM), marks: MARKS }, [OLD]);
    expect(read.ok).toBe(false);
    expect(read.ok ? [] : read.errors.join(" ")).toContain("marks");
  });
});

describe("readRecord: a record that is not a record of the core", () => {
  it("tells a value that is not a JSON object, and a schema name that the core does not have", () => {
    for (const value of [null, 3, "room/2", [SAMPLE_ROOM]]) expect(readRecord(value)).toEqual({ ok: false, errors: ["The record is not a JSON object."] });
    expect(readRecord({ ...copy(SAMPLE_ROOM), schema: "room/3" })).toEqual({ ok: false, errors: ['The record has no known format: "schema" is "room/3".'] });
    expect(readRecord({ unit: "m" })).toEqual({ ok: false, errors: ['The record has no known format: "schema" is missing.'] });
  });

  it("names the place of each fault of the form", () => {
    const read = readRecord({ ...copy(SAMPLE_SURVEY), sides: [{ id: "a", length: "long", turn: "left" }] });
    expect(read).toEqual({ ok: false, errors: [expect.stringMatching(/^"sides\.0\.length": /)] });
  });
});

describe("readRecord: a record of version 1 with no old fields", () => {
  it("gives the record in version 2, with the version 1 of the file", () => {
    for (const [kind, record] of [
      ["room", SAMPLE_ROOM],
      ["scene", SAMPLE_SCENE],
      ["survey", SAMPLE_SURVEY],
      ["level", SAMPLE_LEVEL],
    ] as const) {
      expect(readRecord(asV1(record))).toEqual({ ok: true, kind, record, version: 1, findings: [] });
      expect(readRecord(asV1(record), [OLD, markAddOn("other/1")])).toEqual({ ok: true, kind, record, version: 1, findings: [] });
    }
  });

  it("keeps a nested schema name that is not of version 1, so the read tells it", () => {
    const level = asV1(SAMPLE_LEVEL);
    ((level["rooms"] as Data[])[0]!["survey"] as Data)["schema"] = "survey/9";
    expect(readRecord(level).ok).toBe(false);
    expect(readRecord({ ...asV1(SAMPLE_SCENE), room: { ...copy(SAMPLE_ROOM), schema: "room/9" } }).ok).toBe(false);
  });

  it("does not change the record, and a second read of the result gives the same record", () => {
    fc.assert(
      fc.property(fc.constantFrom<unknown>(SAMPLE_ROOM, SAMPLE_SCENE, SAMPLE_SURVEY, SAMPLE_LEVEL), (record) => {
        const value = asV1(record);
        const text = JSON.stringify(value);
        const first = recordOf(readRecord(value, [OLD]));
        expect(JSON.stringify(value)).toBe(text);
        expect(recordOf(readRecord(copy(first), [OLD]))).toEqual(first);
      }),
    );
  });
});

describe("readRecord: the old fields of an add-on", () => {
  it("gives a room with old fields as a scene of the room with the layer", () => {
    const read = readRecord({ ...asV1(SAMPLE_ROOM), marks: MARKS }, [OLD]);
    expect(read).toEqual({ ok: true, kind: "scene", record: { schema: "scene/2", room: SAMPLE_ROOM, layers: { "mark/1": { marks: MARKS } } }, version: 1, findings: [] });
  });

  it("gives the layer of a scene from the fields of its room and of its objects, and removes those fields", () => {
    const scene = asV1(SAMPLE_SCENE);
    (scene["room"] as Data)["marks"] = MARKS;
    const objects = scene["objects"] as Data[];
    objects[0]!["mark"] = 3;
    const record = recordOf(readRecord(scene, [OLD]));
    expect(record).toEqual({ ...SAMPLE_SCENE, layers: { "mark/1": { marks: [...MARKS, { id: `mark-${String(objects[0]!["id"])}`, anchor: { on: "object", object: objects[0]!["id"] }, size: 3 }] } } });
  });

  it("gives the layer of a survey, and the layers of a level record and of the survey of each room", () => {
    expect(recordOf(readRecord({ ...asV1(SAMPLE_SURVEY), marks: MARKS }, [OLD]))).toEqual({ ...SAMPLE_SURVEY, layers: { "mark/1": { marks: MARKS } } });
    const level: Data = { ...asV1(SAMPLE_LEVEL), marks: MARKS };
    const first = (level["rooms"] as Data[])[0]!;
    (first["survey"] as Data)["marks"] = MARKS;
    const record = recordOf(readRecord(level, [OLD]));
    expect(record["layers"]).toEqual({ "mark/1": { marks: MARKS } });
    expect((record["rooms"] as Data[]).map((room) => (room["survey"] as Data)["layers"])).toEqual(SAMPLE_LEVEL.rooms.map((_, index) => (index === 0 ? { "mark/1": { marks: MARKS } } : undefined)));
  });

  it("keeps a layer that the record has, and tells the old fields with the finding read-both", () => {
    const layer = { marks: [] };
    const read = readRecord({ ...asV1(SAMPLE_SURVEY), marks: MARKS, layers: { "mark/1": layer } }, [OLD]);
    expect(recordOf(read)["layers"]).toEqual({ "mark/1": layer });
    expect(read.ok ? read.findings : []).toEqual([{ level: "warning", code: "read-both", layer: "mark/1", message: expect.stringContaining("mark/1") }]);
    expect(READ_CODES).toContain("read-both");
    const level = asV1(SAMPLE_LEVEL);
    const first = (level["rooms"] as Data[])[0]!;
    first["survey"] = { ...(first["survey"] as Data), marks: MARKS, layers: { "mark/1": layer } };
    const inRoom = readRecord(level, [OLD]);
    expect(inRoom.ok ? inRoom.findings.map((finding) => [finding.code, finding.room]) : []).toEqual([["read-both", SAMPLE_LEVEL.rooms[0]?.id]]);
  });

  it("keeps the layer of a different add-on next to the new layer", () => {
    const other = { "other/1": { marks: [] } };
    expect(recordOf(readRecord({ ...asV1(SAMPLE_SURVEY), marks: MARKS, layers: other }, [OLD]))["layers"]).toEqual({ ...other, "mark/1": { marks: MARKS } });
  });

  it("gives the faults of the read of an add-on, and a fault for an old field with no add-on", () => {
    expect(readRecord({ ...asV1(SAMPLE_SURVEY), marks: 5 }, [OLD])).toEqual({ ok: false, errors: ['The old field "marks" of the survey is not a list.'] });
    const unread = readRecord({ ...asV1(SAMPLE_SURVEY), marks: MARKS }, [markAddOn("mark/1")]);
    expect(unread.ok).toBe(false);
    expect(unread.ok ? "" : unread.errors.join(" ")).toContain("marks");
  });
});
