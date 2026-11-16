import type { Anchor, LayerParse } from "@mark1russell7/room-view";
import { anchorSchema } from "@mark1russell7/room-view/schema";
import { z } from "zod";

// The records of the electrical add-on. They are one layer of a scene, with the key `electrical/1` in `Scene.layers`.
// The units are fixed: a breaker in amperes, a voltage in volts, and a limit and a load in watts.

/** The name of the format of an electrical layer. It is the key of the layer in `Scene.layers`. */
export const ELECTRICAL_SCHEMA = "electrical/1";

/**
 * An outlet: a point that gives power, on an anchor of the core.
 * An outlet can be on a wall, on a floor or on an object, for example a power strip on a desk.
 */
export interface Outlet {
  readonly id: string;
  readonly anchor: Anchor;
  /** The `id` of the circuit of the outlet. */
  readonly circuit?: string | undefined;
}

/** A circuit: it gives power to outlets, and it has a limit. */
export interface Circuit {
  readonly id: string;
  readonly name?: string | undefined;
  /** The rating of the breaker of the circuit, in amperes, for example 15. */
  readonly breaker?: number | undefined;
  /** The voltage of the circuit, in volts, for example 120. */
  readonly voltage?: number | undefined;
  /**
   * The largest continuous load, in watts.
   * Without it, the limit is the voltage times the breaker times the continuous part. Thus 15 A at 120 V gives 1440 W.
   */
  readonly limit?: number | undefined;
  /** The load of the circuit that no feed gives, in watts. Examples are the lamps of a ceiling and the reading of a meter. */
  readonly otherLoad?: number | undefined;
}

/** A feed: the power of a placed object from an outlet. An object with two power supplies has two feeds. */
export interface Feed {
  readonly id: string;
  /** The `id` of the placed object of the scene. */
  readonly object: string;
  /** The `id` of the outlet. */
  readonly outlet: string;
  /** The power that the object takes from the outlet, in watts. Without it, the power is not known. */
  readonly watts?: number | undefined;
}

/**
 * The electrical layer of a scene: the outlets, the circuits and the feeds.
 * Each record has an `id`, and the ids of one layer are unique. Thus `recordName("electrical/1", id)` names one record.
 */
export interface ElectricalLayer {
  readonly schema: typeof ELECTRICAL_SCHEMA;
  readonly outlets?: readonly Outlet[] | undefined;
  readonly circuits?: readonly Circuit[] | undefined;
  readonly feeds?: readonly Feed[] | undefined;
}

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
