import { describe, expect, it } from "vitest";
import * as entry from "./index.ts";

describe("the entry", () => {
  it("has the format, the add-on, the programs, the states, the check and the move", () => {
    expect(entry.ELECTRICAL_SCHEMA).toBe("electrical/1");
    expect(entry.electrical.schema).toBe(entry.ELECTRICAL_SCHEMA);
    for (const name of ["parseElectrical", "electricalAddOn", "ratedLimit", "loadCurrent", "loadRatio", "ratioLevel", "electricalSpace", "circuitStates", "outletLevels", "checkElectrical", "fromSceneV1"] as const) {
      expect(entry[name]).toBeTypeOf("function");
    }
  });

  it("has no browser and no stage: each export is data or a plain function", () => {
    for (const value of Object.values(entry)) expect(["function", "object", "string", "number"]).toContain(typeof value);
  });
});
