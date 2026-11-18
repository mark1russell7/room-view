import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as addOn from "./add-on.ts";
import * as entry from "./index.ts";
import * as marks from "./marks.ts";
import * as sample from "./sample.ts";
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
    for (const name of ["outletAnchors", "withOutletAnchors", "joinElectrical", "ratedLimit", "loadCurrent", "loadRatio", "ratioLevel", "electricalSpace", "circuitStates", "outletLevels", "checkElectrical", "fromSceneV1"] as const) {
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
  it("has the schema and the read of a layer, and the read of the old records of version 1", () => {
    expect(Object.keys(schema).sort()).toEqual(["electricalSchema", "electricalV1", "parseElectrical"]);
    expect(schema.parseElectrical({ schema: entry.ELECTRICAL_SCHEMA })).toEqual({ ok: true, layer: { schema: "electrical/1" } });
  });

  it("imports zod/mini and the entry /schema of the core, not all of zod", () => {
    const schemas = packages("./schema.ts").filter((name) => name === "zod" || name.startsWith("zod/") || name.endsWith("/schema"));
    expect(schemas).toEqual(["@mark1russell7/room-view/schema", "zod/mini"]);
  });
});

describe("the entry /add-on", () => {
  it("has the add-on value and its maker", () => {
    expect(Object.keys(addOn).sort()).toEqual(["electrical", "electricalAddOn"]);
    expect(addOn.electrical.schema).toBe(entry.ELECTRICAL_SCHEMA);
  });

  it("has the read of the old records of version 1 of the core", () => {
    expect(addOn.electrical.v1?.fields).toEqual({ room: ["outlets", "circuits"], scene: ["loads"], survey: ["outlets", "circuits"], level: ["circuits"], object: ["outlet"] });
  });

  it("reads a layer with the schema, so it imports zod/mini", () => {
    expect(packages("./add-on.ts")).toContain("zod/mini");
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

describe("the entry /sample", () => {
  it("has the layers and the records of the samples", () => {
    expect(Object.keys(sample).sort()).toEqual(["SAMPLE_ELECTRICAL_LEVEL", "SAMPLE_ELECTRICAL_SCENE", "SAMPLE_ELECTRICAL_SURVEY", "SAMPLE_SCENE_LAYER", "SAMPLE_SURVEY_LAYER"]);
  });

  it("imports only the samples of the core at run time: no zod and no Vex", () => {
    expect(packages("./sample.ts")).toEqual(["@mark1russell7/room-view/sample"]);
  });
});
