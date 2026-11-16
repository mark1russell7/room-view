import { describe, expect, it } from "vitest";
import * as entry from "./index.ts";

describe("the entry", () => {
  it("loads", () => {
    expect(entry).toBeTypeOf("object");
  });

  it("exports the anchors, the layers and their checks", () => {
    for (const name of ["sceneSpace", "checkAnchor", "checkLayers", "readLayer", "recordName", "parseRecordName", "isLayerName"] as const) expect(entry[name]).toBeTypeOf("function");
    expect(entry.ANCHOR_SURFACES).toEqual(["wall", "floor", "ceiling", "object"]);
    expect(entry.LAYER_CODES).toEqual(["layer-name", "layer-unknown", "layer-form"]);
    expect(entry.ANCHOR_CODES).toHaveLength(8);
  });
});
