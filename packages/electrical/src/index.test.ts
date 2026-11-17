import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as addOn from "./add-on.ts";
import * as entry from "./index.ts";
import * as marks from "./marks.ts";
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

  it("has no schema, no add-on value and no mark", () => {
    for (const name of ["electricalSchema", "parseElectrical", "electricalAddOn", "electrical", "electricalMarks", "electricalAddOnMarks"]) expect(entry).not.toHaveProperty(name);
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

describe("the entry /marks", () => {
  it("has the marks of a layer and the value for the core", () => {
    expect(Object.keys(marks).sort()).toEqual(["ELECTRICAL_MARK_KINDS", "ELECTRICAL_METER_UNIT", "electricalAddOnMarks", "electricalMarks"]);
    expect(marks.electricalAddOnMarks().schema).toBe(entry.ELECTRICAL_SCHEMA);
  });

  it("imports the core and Vex at run time: no zod, and the visuals package only for its types", () => {
    expect(packages("./marks.ts")).toEqual(["@mark1russell7/room-view", "@mark1russell7/vex", "@mark1russell7/vex-domains"]);
  });
});
