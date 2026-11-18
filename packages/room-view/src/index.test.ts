import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as entry from "./index.ts";
import * as schema from "./schema.ts";

/** This function gives the packages that a source file imports at run time, with the files that it imports. It does not count an `import type`. */
function packagesOf(file: URL, seen: Set<string> = new Set()): ReadonlySet<string> {
  const found = new Set<string>();
  if (seen.has(file.href)) return found;
  seen.add(file.href);
  const text = readFileSync(fileURLToPath(file), "utf8");
  for (const match of text.matchAll(/^(import|export)\s([^;]*?\sfrom\s+)?"([^"]+)";/gm)) {
    const [, , clause = "", specifier = ""] = match;
    if (clause.startsWith("type ")) continue;
    if (!specifier.startsWith(".")) found.add(specifier);
    else for (const name of packagesOf(new URL(specifier, file), seen)) found.add(name);
  }
  return found;
}

const packages = (name: string): readonly string[] => [...packagesOf(new URL(name, import.meta.url))].sort();

describe("the entry /schema", () => {
  // A page that reads a layer at each change loads the schemas at its start. `zod/mini` keeps that script small.
  it("imports zod/mini and its English messages, not all of zod", () => {
    expect(packages("./schema.ts").filter((name) => name === "zod" || name.startsWith("zod/"))).toEqual(["zod/mini", "zod/v4/locales/en.js"]);
  });

  it("gives the English messages of zod to a read", () => {
    const read = schema.readRecord({ schema: "room/2", unit: "m", height: "high", wallThickness: 0.1, walls: [] });
    expect(read).toEqual({ ok: false, errors: ['"height": Invalid input: expected number, received string'] });
  });

  it("gives the same messages to the read of an add-on", () => {
    expect(schema.anchorSchema.safeParse({ on: "floor", at: [0] }, schema.READ_CONTEXT).error?.issues.map((issue) => issue.message)).toEqual(["Too small: expected array to have >=2 items"]);
  });
});

describe("the entry", () => {
  it("loads", () => {
    expect(entry).toBeTypeOf("object");
  });

  it("exports the anchors, the layers and their checks", () => {
    for (const name of ["sceneSpace", "checkAnchor", "checkLayers", "readLayer", "recordName", "parseRecordName", "solidRecord", "isLayerName"] as const) expect(entry[name]).toBeTypeOf("function");
    expect(entry.ANCHOR_SURFACES).toEqual(["wall", "floor", "ceiling", "object"]);
    expect(entry.LAYER_CODES).toEqual(["layer-name", "layer-unknown", "layer-form"]);
    expect(entry.ANCHOR_CODES).toHaveLength(8);
  });
});
