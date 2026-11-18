import { checkLayers, checkScene, expandLevel, expandSurvey, resultScene } from "@mark1russell7/room-view";
import { levelSchema, sceneSchema, surveySchema } from "@mark1russell7/room-view/schema";
import { describe, expect, it } from "vitest";
import { electrical } from "./add-on.ts";
import { ELECTRICAL_SCHEMA } from "./layer.ts";
import { SAMPLE_ELECTRICAL_LEVEL, SAMPLE_ELECTRICAL_SCENE, SAMPLE_ELECTRICAL_SURVEY, SAMPLE_SCENE_LAYER, SAMPLE_SURVEY_LAYER } from "./sample.ts";
import { parseElectrical } from "./schema.ts";
import { circuitStates } from "./states.ts";

const isError = (finding: { readonly level: string }): boolean => finding.level === "error";

describe("the electrical samples", () => {
  it("have a correct form: each layer and each record", () => {
    for (const layer of [SAMPLE_SCENE_LAYER, SAMPLE_SURVEY_LAYER]) expect(parseElectrical(JSON.parse(JSON.stringify(layer)))).toEqual({ ok: true, layer });
    expect(sceneSchema.safeParse(SAMPLE_ELECTRICAL_SCENE).success).toBe(true);
    expect(surveySchema.safeParse(SAMPLE_ELECTRICAL_SURVEY).success).toBe(true);
    expect(levelSchema.safeParse(SAMPLE_ELECTRICAL_LEVEL).success).toBe(true);
  });

  it("give a scene with no error, where circuit B is near its limit", () => {
    expect(checkScene(SAMPLE_ELECTRICAL_SCENE).filter(isError)).toEqual([]);
    expect(checkLayers(SAMPLE_ELECTRICAL_SCENE, [electrical]).filter(isError)).toEqual([]);
    expect(circuitStates(SAMPLE_SCENE_LAYER).map((state) => [state.circuit, state.level])).toEqual([
      ["a", "ok"],
      ["b", "near"],
    ]);
  });

  it("give a survey that expands to the layer of the sample scene, with no load", () => {
    const result = expandSurvey(SAMPLE_ELECTRICAL_SURVEY, { addOns: [electrical] });
    expect(result.layerFindings).toEqual([]);
    expect(result.layers?.[ELECTRICAL_SCHEMA]).toEqual({ ...SAMPLE_SCENE_LAYER, circuits: SAMPLE_SURVEY_LAYER.circuits });
    expect(checkLayers(resultScene(result), [electrical]).filter(isError)).toEqual([]);
  });

  it("give an apartment with no error: the circuit of the level and the circuits of the living room", () => {
    const result = expandLevel(SAMPLE_ELECTRICAL_LEVEL, { addOns: [electrical] });
    expect(result.layerFindings).toEqual([]);
    const scene = resultScene(result);
    expect(checkLayers(scene, [electrical]).filter(isError)).toEqual([]);
    const read = parseElectrical(scene.layers?.[ELECTRICAL_SCHEMA]);
    expect(read.ok ? circuitStates(read.layer).map((state) => [state.circuit, state.outlets.length]) : []).toEqual([
      ["c", 5],
      ["a", 5],
      ["b", 2],
    ]);
  });
});
