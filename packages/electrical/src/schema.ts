import type { LayerParse } from "@mark1russell7/room-view";
import { anchorSchema } from "@mark1russell7/room-view/schema";
import { z } from "zod";
import { ELECTRICAL_SCHEMA, type ElectricalLayer } from "./layer.ts";

// The zod schema of an electrical layer, and the read of its JSON. This module is the entry `/schema` of the package.
// The root entry has no zod, so a page that reads only the circuit math gets no schema library.

const id = z.string().min(1);

const outlet = z.strictObject({
  id,
  anchor: anchorSchema,
  circuit: id.optional(),
});

const circuit = z.strictObject({
  id,
  name: z.string().optional(),
  breaker: z.number().optional(),
  voltage: z.number().optional(),
  limit: z.number().optional(),
  otherLoad: z.number().optional(),
});

const feed = z.strictObject({
  id,
  object: id,
  outlet: id,
  watts: z.number().optional(),
});

/**
 * The schema of an electrical layer. It examines the form of the record: the fields, their types and the finite numbers.
 * It refuses a field that the format does not have. `checkElectrical` examines the meaning of a layer with a correct form.
 */
export const electricalSchema: z.ZodType<ElectricalLayer> = z.strictObject({
  schema: z.literal(ELECTRICAL_SCHEMA),
  outlets: z.array(outlet).readonly().optional(),
  circuits: z.array(circuit).readonly().optional(),
  feeds: z.array(feed).readonly().optional(),
});

/**
 * This function reads the JSON of an electrical layer. It gives the layer, or the faults of its form.
 * Each fault names its place in the record, for example `outlets.0.anchor`.
 */
export function parseElectrical(value: unknown): LayerParse<ElectricalLayer> {
  const read = electricalSchema.safeParse(value);
  if (read.success) return { ok: true, layer: read.data };
  return {
    ok: false,
    errors: read.error.issues.map((issue) => {
      const place = issue.path.length === 0 ? "the record" : `"${issue.path.map(String).join(".")}"`;
      return `The layer "${ELECTRICAL_SCHEMA}" has a fault at ${place}: ${issue.message}`;
    }),
  };
}
