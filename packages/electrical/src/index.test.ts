import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as addOn from "./add-on.ts";
import * as entry from "./index.ts";
import * as schema from "./schema.ts";

/**
 * This function gives the packages that a source file imports at run time, with the files that it imports.
 * It follows each relative import. It does not count an `import type`, because the build removes it.
 */
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

describe("the root entry", () => {
  it("has the format, the anchors, the programs, the states, the check and the move", () => {
    expect(entry.ELECTRICAL_SCHEMA).toBe("electrical/1");
    for (const name of ["outletAnchors", "withOutletAnchors", "ratedLimit", "loadCurrent", "loadRatio", "ratioLevel", "electricalSpace", "circuitStates", "outletLevels", "checkElectrical", "fromSceneV1"] as const) {
      expect(entry[name]).toBeTypeOf("function");
    }
  });

  it("has no browser and no stage: each export is data or a plain function", () => {
    for (const value of Object.values(entry)) expect(["function", "object", "string", "number"]).toContain(typeof value);
  });

  it("has no schema and no add-on value", () => {
    for (const name of ["electricalSchema", "parseElectrical", "electricalAddOn", "electrical"]) expect(entry).not.toHaveProperty(name);
  });

  it("imports only Vex at run time: no zod, and the core only for its types", () => {
    expect(packages("./index.ts")).toEqual(["@mark1russell7/vex", "@mark1russell7/vex-domains"]);
  });
});

describe("the entry /schema", () => {
  it("has the schema and the read of a layer", () => {
    expect(Object.keys(schema).sort()).toEqual(["electricalSchema", "parseElectrical"]);
    expect(schema.parseElectrical({ schema: entry.ELECTRICAL_SCHEMA })).toEqual({ ok: true, layer: { schema: "electrical/1" } });
  });

  it("imports zod and the schema of an anchor of the core", () => {
    expect(packages("./schema.ts")).toEqual(["@mark1russell7/room-view/schema", "zod"]);
  });
});

describe("the entry /add-on", () => {
  it("has the add-on value and its maker", () => {
    expect(Object.keys(addOn).sort()).toEqual(["electrical", "electricalAddOn"]);
    expect(addOn.electrical.schema).toBe(entry.ELECTRICAL_SCHEMA);
  });

  it("reads a layer with the schema, so it imports zod", () => {
    expect(packages("./add-on.ts")).toContain("zod");
  });
});
