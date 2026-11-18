import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Anchor } from "./anchors.ts";
import { checkForm, formLayer, formRecords, readFormRecord, type FormCollection, type FormOutside, type FormRecord, type FormRecords, type LayerForm } from "./form.ts";

/** The form of a test add-on: water lines, taps on walls, and the water of each object. It shows only the contract. */
const PIPES: LayerForm = {
  schema: "pipe/1",
  collections: [
    {
      name: "lines",
      word: "line",
      label: "Line",
      title: "Lines",
      idFrom: "name",
      fields: [
        { kind: "text", name: "name", label: "Name" },
        { kind: "number", name: "pressure", label: "Pressure", unit: "bar", above: 0, usual: { metric: 3, imperial: 3.1 } },
      ],
    },
    {
      name: "taps",
      word: "tap",
      label: "Tap",
      title: "Taps",
      on: ["wall"],
      height: { metric: 1, imperial: 0.9144 },
      fields: [
        { kind: "record", name: "line", label: "Line", of: "lines", none: "No line" },
        { kind: "number", name: "flow", label: "Flow", unit: "L/min", least: 0 },
      ],
    },
    {
      name: "uses",
      word: "use",
      label: "Water",
      title: "Water",
      owner: "object",
      most: 1,
      fields: [
        { kind: "object", name: "object", label: "Object", needed: true },
        { kind: "record", name: "tap", label: "Water from", of: "taps", needed: true },
      ],
    },
  ],
};

const [LINES, TAPS, USES] = PIPES.collections as readonly [FormCollection, FormCollection, FormCollection];

const onWall: Anchor = { on: "wall", wall: "a", face: "left", offset: 1, height: 1 };
const onFloor: Anchor = { on: "floor", at: [1, 1] };

/** The records of a small home: two lines, two taps and the water of a sink. */
const HOME: FormRecords = {
  lines: [
    { id: "cold", values: { name: " Cold " } },
    { id: "hot", values: { name: "Hot", pressure: 2 } },
  ],
  taps: [
    { id: "tap-1", anchor: onWall, values: { line: "cold", flow: 9 } },
    { id: "tap-2", anchor: onWall, values: {} },
  ],
  uses: [{ id: "use-1", values: { object: "sink", tap: "tap-1" } }],
};

/** The layer of `HOME` for a person with meters. */
const HOME_LAYER = {
  schema: "pipe/1",
  lines: [
    { id: "cold", name: "Cold", pressure: 3 },
    { id: "hot", name: "Hot", pressure: 2 },
  ],
  taps: [
    { id: "tap-1", anchor: onWall, line: "cold", flow: 9 },
    { id: "tap-2", anchor: onWall },
  ],
  uses: [{ id: "use-1", object: "sink", tap: "tap-1" }],
};

/** The records of one room of `HOME`: its taps and its water. The lines are records of the level. */
const ROOM: FormRecords = { taps: HOME["taps"] ?? [], uses: HOME["uses"] ?? [] };
const ROOM_LAYER = { schema: "pipe/1", taps: HOME_LAYER.taps, uses: HOME_LAYER.uses };
/** The ids of the lines of the level. */
const LEVEL_LINES: FormOutside = new Map([["lines", new Set(["cold", "hot"])]]);

/** This function gives a form with a change of one collection. */
function withCollection(index: number, change: Partial<FormCollection>): LayerForm {
  return { ...PIPES, collections: PIPES.collections.map((collection, position) => (position === index ? { ...collection, ...change } : collection)) };
}

/** This function gives the codes and the places of the faults of a form. */
function faultsOf(form: LayerForm): readonly string[] {
  return checkForm(form).map((fault) => `${fault.code} ${fault.at}`);
}

describe("checkForm", () => {
  it("gives no fault for a correct form", () => {
    expect(checkForm(PIPES)).toEqual([]);
    expect(checkForm({ schema: "empty/1", collections: [] })).toEqual([]);
  });

  it("finds a name that is not the name of a layer", () => {
    expect(checkForm({ ...PIPES, schema: "Pipes" })).toEqual([
      { code: "form-schema", at: "", message: `The form has the name "Pipes", which is not a word, a slash and a version, for example "electrical/1".` },
    ]);
  });

  it("finds a collection with a name that a layer cannot have, or that is there two times", () => {
    expect(faultsOf(withCollection(0, { name: "schema" }))).toEqual(["form-collection schema", "form-field taps.line"]);
    expect(faultsOf(withCollection(0, { name: "" }))).toEqual(["form-collection ", "form-field taps.line"]);
    expect(faultsOf(withCollection(1, { name: "lines", fields: [] }))).toEqual(["form-collection lines", "form-collection lines", "form-field uses.tap"]);
  });

  it("finds the faults of the parts of a collection", () => {
    expect(faultsOf(withCollection(0, { word: "" }))).toEqual(["form-collection lines"]);
    expect(faultsOf(withCollection(1, { on: [] }))).toEqual(["form-collection taps", "form-collection taps"]);
    expect(faultsOf(withCollection(1, { on: ["wall", "wall"] }))).toEqual(["form-collection taps"]);
    expect(faultsOf(withCollection(0, { height: { metric: 1, imperial: 1 } }))).toEqual(["form-collection lines"]);
    expect(faultsOf(withCollection(1, { height: { metric: Number.NaN, imperial: 1 } }))).toEqual(["form-collection taps"]);
    expect(faultsOf(withCollection(2, { most: 0 }))).toEqual(["form-collection uses"]);
    expect(faultsOf(withCollection(2, { most: 1.5 }))).toEqual(["form-collection uses"]);
    expect(faultsOf(withCollection(0, { most: 1 }))).toEqual(["form-collection lines"]);
    expect(faultsOf(withCollection(0, { idFrom: "pressure" }))).toEqual(["form-collection lines"]);
    expect(faultsOf(withCollection(0, { idFrom: "title" }))).toEqual(["form-collection lines"]);
  });

  it("finds an owner that is not a necessary field of an object or of a record", () => {
    expect(faultsOf(withCollection(2, { owner: "water" }))).toEqual(["form-collection uses"]);
    expect(faultsOf(withCollection(1, { owner: "line" }))).toEqual(["form-collection taps"]);
    expect(faultsOf(withCollection(1, { owner: "flow" }))).toEqual(["form-collection taps"]);
    expect(checkForm(withCollection(2, { owner: "tap" }))).toEqual([]);
  });

  it("finds the faults of a field", () => {
    // The collection has only this field, so its ids do not come from a name.
    const field = (change: object): LayerForm => withCollection(0, { idFrom: undefined, fields: [{ kind: "number", name: "pressure", label: "Pressure", ...change }] });
    expect(faultsOf(field({ name: "id" }))).toEqual(["form-field lines.id"]);
    expect(faultsOf(field({ name: "anchor" }))).toEqual(["form-field lines.anchor"]);
    expect(faultsOf(field({ name: "__proto__" }))).toEqual(["form-field lines.__proto__"]);
    expect(faultsOf(field({ name: "" }))).toEqual(["form-field lines."]);
    expect(faultsOf(field({ above: Number.POSITIVE_INFINITY }))).toEqual(["form-field lines.pressure"]);
    expect(faultsOf(field({ least: Number.NaN }))).toEqual(["form-field lines.pressure"]);
    expect(faultsOf(field({ above: 0, usual: { metric: 3, imperial: 0 } }))).toEqual(["form-field lines.pressure"]);
    expect(faultsOf(field({ least: 0, usual: { metric: 3, imperial: 0 } }))).toEqual([]);
    const twice = withCollection(0, {
      fields: [
        { kind: "text", name: "name", label: "Name" },
        { kind: "text", name: "name", label: "Name" },
      ],
    });
    expect(faultsOf(twice)).toEqual(["form-field lines.name", "form-field lines.name"]);
    expect(checkForm(withCollection(1, { fields: [{ kind: "record", name: "line", label: "Line", of: "pipes" }] }))).toEqual([
      { code: "form-field", at: "taps.line", message: `The field "line" of the collection "taps" names the collection "pipes", which the form does not have.` },
    ]);
  });
});

describe("readFormRecord", () => {
  it("gives the usual value of the system to a number with no value", () => {
    expect(readFormRecord(LINES, { id: "cold", values: {} }, "metric")).toEqual({ state: "ok", values: { pressure: 3 } });
    expect(readFormRecord(LINES, { id: "cold", values: {} }, "imperial")).toEqual({ state: "ok", values: { pressure: 3.1 } });
    expect(readFormRecord(LINES, { id: "cold", values: { pressure: 2 } }, "metric")).toEqual({ state: "ok", values: { pressure: 2 } });
  });

  it("removes the spaces at the ends of a text, and an empty text is no value", () => {
    expect(readFormRecord(LINES, { id: "cold", values: { name: "  Cold water " } }, "metric")).toEqual({ state: "ok", values: { name: "Cold water", pressure: 3 } });
    expect(readFormRecord(LINES, { id: "cold", values: { name: "   " } }, "metric")).toEqual({ state: "ok", values: { pressure: 3 } });
  });

  it("stops a record with a value that is not valid", () => {
    expect(readFormRecord(LINES, { id: "cold", values: { pressure: 0 } }, "metric")).toEqual({ state: "bad", field: "pressure" });
    expect(readFormRecord(LINES, { id: "cold", values: { pressure: Number.NaN } }, "metric")).toEqual({ state: "bad", field: "pressure" });
    expect(readFormRecord(LINES, { id: "cold", values: { pressure: "3" } }, "metric")).toEqual({ state: "bad", field: "pressure" });
    expect(readFormRecord(LINES, { id: "cold", values: { name: 3 } }, "metric")).toEqual({ state: "bad", field: "name" });
    expect(readFormRecord(TAPS, { id: "tap", anchor: onWall, values: { flow: -1 } }, "metric")).toEqual({ state: "bad", field: "flow" });
    expect(readFormRecord(TAPS, { id: "tap", anchor: onWall, values: { flow: 0 } }, "metric")).toEqual({ state: "ok", values: { flow: 0 } });
    expect(readFormRecord(TAPS, { id: "tap", anchor: onWall, values: { line: 4 } }, "metric")).toEqual({ state: "bad", field: "line" });
  });

  it("stops a record with no value of a necessary field", () => {
    expect(readFormRecord(USES, { id: "use", values: { tap: "tap-1" } }, "metric")).toEqual({ state: "empty", field: "object" });
    expect(readFormRecord(USES, { id: "use", values: { object: "sink", tap: "" } }, "metric")).toEqual({ state: "empty", field: "tap" });
    expect(readFormRecord({ ...LINES, fields: [{ kind: "number", name: "pressure", label: "Pressure", needed: true }] }, { id: "cold", values: {} }, "metric")).toEqual({
      state: "empty",
      field: "pressure",
    });
  });

  it("needs an anchor on a surface of the collection", () => {
    expect(readFormRecord(TAPS, { id: "tap", values: {} }, "metric")).toEqual({ state: "empty", field: "anchor" });
    expect(readFormRecord(TAPS, { id: "tap", anchor: onFloor, values: {} }, "metric")).toEqual({ state: "bad", field: "anchor" });
    expect(readFormRecord(TAPS, { id: "tap", anchor: onWall, values: {} }, "metric")).toEqual({ state: "ok", values: {} });
  });

  it("reads only the fields of the collection", () => {
    const values = JSON.parse(`{ "__proto__": "x", "name": "Cold", "other": 5 }`) as FormRecord["values"];
    const reading = readFormRecord(LINES, { id: "cold", values }, "metric");
    expect(reading).toEqual({ state: "ok", values: { name: "Cold", pressure: 3 } });
    expect(reading.state === "ok" && Object.keys(reading.values)).toEqual(["name", "pressure"]);
  });
});

describe("formLayer", () => {
  it("makes the layer of the records, with the usual values", () => {
    expect(formLayer(PIPES, HOME, { system: "metric" })).toEqual(HOME_LAYER);
    expect(formLayer(PIPES, HOME, { system: "imperial" })["lines"]).toEqual([
      { id: "cold", name: "Cold", pressure: 3.1 },
      { id: "hot", name: "Hot", pressure: 2 },
    ]);
  });

  it("gives equal JSON for equal records: the id, the anchor, then the fields of the form", () => {
    const layer = formLayer(PIPES, { taps: [{ id: "tap", anchor: onWall, values: { flow: 2, line: "cold" } }], lines: [{ id: "cold", values: { pressure: 2, name: "Cold" } }] }, { system: "metric" });
    expect(JSON.stringify(layer)).toBe(JSON.stringify({ schema: "pipe/1", lines: [{ id: "cold", name: "Cold", pressure: 2 }], taps: [{ id: "tap", anchor: onWall, line: "cold", flow: 2 }] }));
  });

  it("has no collection with no record", () => {
    expect(formLayer(PIPES, {}, { system: "metric" })).toEqual({ schema: "pipe/1" });
    expect(formLayer(PIPES, { lines: [], valves: [{ id: "v", values: {} }] }, { system: "metric" })).toEqual({ schema: "pipe/1" });
  });

  it("does not have a record that the read stops, and a field that names it has no value", () => {
    const records: FormRecords = { ...HOME, lines: [{ id: "cold", values: { pressure: -1 } }] };
    expect(formLayer(PIPES, records, { system: "metric" })).toEqual({
      schema: "pipe/1",
      taps: [
        { id: "tap-1", anchor: onWall, flow: 9 },
        { id: "tap-2", anchor: onWall },
      ],
      uses: [{ id: "use-1", object: "sink", tap: "tap-1" }],
    });
  });

  it("does not have a record with a necessary field that names a record that is not there", () => {
    const records: FormRecords = { ...HOME, taps: [{ id: "tap-1", anchor: onWall, values: { flow: -1 } }] };
    expect(formLayer(PIPES, records, { system: "metric" })).toEqual({ schema: "pipe/1", lines: HOME_LAYER.lines });
    // A record that goes away is the record of a field of a third record.
    const chain: LayerForm = {
      schema: "chain/1",
      collections: ["a", "b", "c"].map((name, index, names): FormCollection => {
        const before = names[index + 1];
        return { name, word: name, label: name, title: name, fields: before === undefined ? [{ kind: "object", name: "object", label: "Object", needed: true }] : [{ kind: "record", name: "next", label: "Next", of: before, needed: true }] };
      }),
    };
    const links: FormRecords = { a: [{ id: "a1", values: { next: "b1" } }], b: [{ id: "b1", values: { next: "c1" } }], c: [{ id: "c1", values: { object: "sink" } }] };
    expect(checkForm(chain)).toEqual([]);
    expect(formLayer(chain, links, { system: "metric", objects: new Set(["sink"]) })).toEqual({
      schema: "chain/1",
      a: [{ id: "a1", next: "b1" }],
      b: [{ id: "b1", next: "c1" }],
      c: [{ id: "c1", object: "sink" }],
    });
    expect(formLayer(chain, links, { system: "metric", objects: new Set(["bath"]) })).toEqual({ schema: "chain/1" });
  });

  it("keeps the first record of an id, in the sequence of the collections", () => {
    const records: FormRecords = {
      taps: [
        { id: "cold", anchor: onWall, values: {} },
        { id: "tap", anchor: onWall, values: { flow: 1 } },
        { id: "tap", anchor: onWall, values: { flow: 2 } },
        { id: "", anchor: onWall, values: {} },
      ],
      lines: [{ id: "cold", values: {} }],
    };
    expect(formLayer(PIPES, records, { system: "metric" })).toEqual({ schema: "pipe/1", lines: [{ id: "cold", pressure: 3 }], taps: [{ id: "tap", anchor: onWall, flow: 1 }] });
  });

  it("keeps the largest number of records of one owner", () => {
    const records: FormRecords = {
      ...HOME,
      uses: [
        { id: "use-1", values: { object: "sink", tap: "tap-1" } },
        { id: "use-2", values: { object: "sink", tap: "tap-2" } },
        { id: "use-3", values: { object: "bath", tap: "tap-2" } },
      ],
    };
    expect(formLayer(PIPES, records, { system: "metric" })["uses"]).toEqual([
      { id: "use-1", object: "sink", tap: "tap-1" },
      { id: "use-3", object: "bath", tap: "tap-2" },
    ]);
  });

  it("keeps only an object of the scene, with the ids of the objects", () => {
    expect(formLayer(PIPES, HOME, { system: "metric", objects: new Set(["sink"]) })).toEqual(HOME_LAYER);
    expect(formLayer(PIPES, HOME, { system: "metric", objects: new Set(["bath"]) })).toEqual({ schema: "pipe/1", lines: HOME_LAYER.lines, taps: HOME_LAYER.taps });
  });

  it("keeps a field that names a record outside the layer, with the ids of those records", () => {
    // With no ids, the tap loses its line. The tap stays, because the line is not a necessary field.
    const alone = [
      { id: "tap-1", anchor: onWall, flow: 9 },
      { id: "tap-2", anchor: onWall },
    ];
    expect(formLayer(PIPES, ROOM, { system: "metric" })).toEqual({ schema: "pipe/1", taps: alone, uses: HOME_LAYER.uses });
    expect(formLayer(PIPES, ROOM, { system: "metric", outside: LEVEL_LINES })).toEqual(ROOM_LAYER);
    // The ids are the ids of one collection: a line with the id of a tap is not there.
    expect(formLayer(PIPES, ROOM, { system: "metric", outside: new Map([["taps", new Set(["cold"])]]) })["taps"]).toEqual(alone);
    expect(formLayer(PIPES, ROOM, { system: "metric", outside: new Map([["lines", new Set(["hot"])]]) })["taps"]).toEqual(alone);
  });

  it("keeps a record with a necessary field that names a record outside the layer", () => {
    const use: FormRecords = { uses: [{ id: "use-1", values: { object: "sink", tap: "tap-9" } }] };
    expect(formLayer(PIPES, use, { system: "metric" })).toEqual({ schema: "pipe/1" });
    expect(formLayer(PIPES, use, { system: "metric", outside: new Map([["taps", new Set(["tap-9"])]]) })).toEqual({
      schema: "pipe/1",
      uses: [{ id: "use-1", object: "sink", tap: "tap-9" }],
    });
  });

  it("keeps a record of the layer with the id of a record outside the layer", () => {
    expect(formLayer(PIPES, HOME, { system: "metric", outside: LEVEL_LINES })).toEqual(HOME_LAYER);
  });
});

describe("formRecords", () => {
  it("gives the records of a layer", () => {
    expect(formRecords(PIPES, HOME_LAYER)).toEqual({
      records: {
        lines: [
          { id: "cold", values: { name: "Cold", pressure: 3 } },
          { id: "hot", values: { name: "Hot", pressure: 2 } },
        ],
        taps: [
          { id: "tap-1", anchor: onWall, values: { line: "cold", flow: 9 } },
          { id: "tap-2", anchor: onWall, values: {} },
        ],
        uses: [{ id: "use-1", values: { object: "sink", tap: "tap-1" } }],
      },
      more: false,
    });
  });

  it("gives an empty list for a collection with no record", () => {
    const empty = { lines: [], taps: [], uses: [] };
    expect(formRecords(PIPES, { schema: "pipe/1" })).toEqual({ records: empty, more: false });
    expect(formRecords(PIPES, undefined)).toEqual({ records: empty, more: false });
    expect(formRecords(PIPES, 5)).toEqual({ records: empty, more: true });
    expect(formRecords(PIPES, [HOME_LAYER])).toEqual({ records: empty, more: true });
  });

  it("removes the spaces at the ends of a text, and a line with no pressure stays", () => {
    expect(formRecords(PIPES, { schema: "pipe/1", lines: [{ id: "cold", name: " Cold " }, { id: "hot", name: "" }] })).toEqual({
      records: { lines: [{ id: "cold", values: { name: "Cold" } }, { id: "hot", values: {} }], taps: [], uses: [] },
      more: false,
    });
  });

  it("tells the data that the form does not keep", () => {
    const more = (layer: unknown): FormRecords => {
      const read = formRecords(PIPES, layer);
      expect(read.more).toBe(true);
      return read.records;
    };
    const lines = formRecords(PIPES, HOME_LAYER).records["lines"];
    // A field of the layer, and a collection that is not a list.
    expect(more({ ...HOME_LAYER, valves: [] })["lines"]).toEqual(lines);
    expect(more({ ...HOME_LAYER, lines: { cold: {} } })["lines"]).toEqual([]);
    // A record with no id, a second record of an id, and a thing that is not a record.
    expect(more({ schema: "pipe/1", lines: [{ name: "Cold" }, { id: "" }, { id: 5 }, "hot", null] })["lines"]).toEqual([]);
    expect(more({ schema: "pipe/1", lines: [{ id: "cold" }, { id: "cold", name: "Hot" }] })["lines"]).toEqual([{ id: "cold", values: {} }]);
    expect(more({ schema: "pipe/1", lines: [{ id: "cold" }], taps: [{ id: "cold", anchor: onWall }] })["taps"]).toEqual([]);
    // A record with no anchor on a surface of the collection.
    expect(more({ schema: "pipe/1", taps: [{ id: "tap" }, { id: "floor", anchor: onFloor }, { id: "text", anchor: "wall" }] })["taps"]).toEqual([]);
    // A field that the form does not have, and a value that is not valid.
    expect(more({ schema: "pipe/1", lines: [{ id: "cold", limit: 4 }] })["lines"]).toEqual([{ id: "cold", values: {} }]);
    expect(more({ schema: "pipe/1", lines: [{ id: "cold", anchor: onWall }] })["lines"]).toEqual([{ id: "cold", values: {} }]);
    expect(more({ schema: "pipe/1", lines: [{ id: "cold", pressure: 0 }] })["lines"]).toEqual([{ id: "cold", values: {} }]);
    expect(more({ schema: "pipe/1", lines: [{ id: "cold", name: 5 }] })["lines"]).toEqual([{ id: "cold", values: {} }]);
    expect(more({ schema: "pipe/1", taps: [{ id: "tap", anchor: onWall, line: "" }] })["taps"]).toEqual([{ id: "tap", anchor: onWall, values: {} }]);
    // A field that names a record that the layer does not have.
    expect(more({ schema: "pipe/1", taps: [{ id: "tap", anchor: onWall, line: "cold" }] })["taps"]).toEqual([{ id: "tap", anchor: onWall, values: {} }]);
    expect(more({ schema: "pipe/1", uses: [{ id: "use", object: "sink", tap: "tap" }] })["uses"]).toEqual([]);
    expect(more({ schema: "pipe/1", uses: [{ id: "use", tap: "tap" }] })["uses"]).toEqual([]);
    // A record after the largest number of records of its owner.
    const uses = [
      { id: "use-1", object: "sink", tap: "tap-1" },
      { id: "use-2", object: "sink", tap: "tap-2" },
    ];
    expect(more({ ...HOME_LAYER, uses })["uses"]).toEqual([{ id: "use-1", values: { object: "sink", tap: "tap-1" } }]);
  });

  it("keeps a field that names a record outside the layer, with the ids of those records", () => {
    const alone = formRecords(PIPES, ROOM_LAYER);
    expect(alone.more).toBe(true);
    expect(alone.records["taps"]).toEqual([
      { id: "tap-1", anchor: onWall, values: { flow: 9 } },
      { id: "tap-2", anchor: onWall, values: {} },
    ]);
    expect(formRecords(PIPES, ROOM_LAYER, { outside: LEVEL_LINES })).toEqual({ records: { lines: [], ...ROOM }, more: false });
    // The ids are the ids of one collection.
    expect(formRecords(PIPES, ROOM_LAYER, { outside: new Map([["taps", new Set(["cold"])]]) })).toEqual(alone);
    // A necessary field can name a record outside the layer.
    const use = { schema: "pipe/1", uses: [{ id: "use-1", object: "sink", tap: "tap-9" }] };
    expect(formRecords(PIPES, use)).toEqual({ records: { lines: [], taps: [], uses: [] }, more: true });
    expect(formRecords(PIPES, use, { outside: new Map([["taps", new Set(["tap-9"])]]) })).toEqual({
      records: { lines: [], taps: [], uses: [{ id: "use-1", values: { object: "sink", tap: "tap-9" } }] },
      more: false,
    });
  });

  it("keeps a record with no value of a necessary number that has a usual value", () => {
    const form = withCollection(0, { fields: [{ kind: "number", name: "pressure", label: "Pressure", needed: true, usual: { metric: 3, imperial: 3.1 } }] });
    expect(formRecords(form, { schema: "pipe/1", lines: [{ id: "cold" }] })).toEqual({ records: { lines: [{ id: "cold", values: {} }], taps: [], uses: [] }, more: false });
    const strict = withCollection(0, { fields: [{ kind: "number", name: "pressure", label: "Pressure", needed: true }] });
    expect(formRecords(strict, { schema: "pipe/1", lines: [{ id: "cold" }] })).toEqual({ records: { lines: [], taps: [], uses: [] }, more: true });
  });

  it("gives the records of each layer of formLayer again, with no more data", () => {
    const id = fc.constantFrom("a", "b", "c", "d", "e", "");
    const value = fc.oneof(id, fc.constantFrom(" x ", "  "), fc.double(), fc.integer({ min: -2, max: 9 }));
    const record = fc.record({
      id,
      anchor: fc.constantFrom(onWall, onFloor, undefined),
      values: fc.dictionary(fc.constantFrom("name", "pressure", "line", "flow", "object", "tap", "other"), value),
    });
    const records = fc.record({ lines: fc.array(record, { maxLength: 4 }), taps: fc.array(record, { maxLength: 4 }), uses: fc.array(record, { maxLength: 4 }) });
    // The ids outside the layer: none, or a line and a tap. The id "z" is the id of no record of the layer.
    const outside = fc.constantFrom<FormOutside | undefined>(
      undefined,
      new Map([
        ["lines", new Set(["a", "z"])],
        ["taps", new Set(["b", "z"])],
      ]),
    );
    fc.assert(
      fc.property(records, fc.constantFrom("metric", "imperial"), outside, (given, system, known) => {
        const layer = formLayer(PIPES, given, { system, outside: known });
        const read = formRecords(PIPES, layer, { outside: known });
        expect(read.more).toBe(false);
        expect(formLayer(PIPES, read.records, { system, outside: known })).toEqual(layer);
        // The ids of a layer are unique.
        const ids = Object.values(read.records).flatMap((list) => list.map((item) => item.id));
        expect(new Set(ids).size).toBe(ids.length);
      }),
    );
  });
});
