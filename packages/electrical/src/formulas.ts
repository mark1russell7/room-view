import { app, axes, each, let_, lit, ref, v, type Axis, type Expr } from "@mark1russell7/vex";

// The circuit math, as Vex programs. A program is data: `explain` of Vex shows each step, and a host can keep it as JSON.
// The first part is general: it reads no field, so a package with a different tree builds its programs from it.
// The second part is the programs of the electrical tree, which `electricalSpace` makes from a layer.

/** The name of the variable with the continuous part: the part of the rating of a breaker that a continuous load can use. */
export const CONTINUOUS_LOAD = "continuousLoad";

/** The default continuous part. A continuous load can use 80% of the rating of a breaker. */
export const DEFAULT_CONTINUOUS_LOAD = 0.8;

/** The name of the variable with the near part: a load with this part of its limit, or more, has the level `near`. */
export const NEAR_LOAD = "nearLoad";

/** The default near part. */
export const DEFAULT_NEAR_LOAD = 0.8;

/** These are the levels of the load of a circuit. */
export const LOAD_LEVELS: readonly ["unknown", "ok", "near", "over"] = ["unknown", "ok", "near", "over"];

/** A level of the load of a circuit. A viewer gives each level a color and a shape. */
export type LoadLevel = (typeof LOAD_LEVELS)[number];

/**
 * This function gives the program of the limit of a continuous load, in watts: the voltage times the breaker times the continuous part.
 * The default part is the variable `continuousLoad`.
 */
export function ratedLimit(voltage: Expr, breaker: Expr, part: Expr = v(CONTINUOUS_LOAD)): Expr {
  return app("multiply", app("multiply", voltage, breaker), part);
}

/** This function gives the program of the current of a load, in amperes: the load in watts divided by the voltage. */
export function loadCurrent(load: Expr, voltage: Expr): Expr {
  return app("divide", load, voltage);
}

/**
 * This function gives the program of a load as a part of its limit.
 * A limit that is not above 0 gives an error value, not a ratio.
 */
export function loadRatio(load: Expr, limit: Expr): Expr {
  return app("divide", load, app("max", limit, lit(0)));
}

/**
 * This function gives the program of the level of a ratio: `over` above 1, `near` from the near part, or `ok`.
 * The default near part is the variable `nearLoad`. The program evaluates the ratio one time, with the name `loadRatio`.
 */
export function ratioLevel(ratio: Expr, near: Expr = v(NEAR_LOAD)): Expr {
  const value = v("loadRatio");
  return let_({ loadRatio: ratio }, app("if", app("gt", value, lit(1)), lit("over"), app("if", app("gte", value, near), lit("near"), lit("ok"))));
}

/** These are the kinds of the nodes of the electrical tree. The node `other` has the other load of its circuit. */
export const NODE_KINDS: readonly ["circuit", "outlet", "feed", "other"] = ["circuit", "outlet", "feed", "other"];

/** A kind of node of the electrical tree. */
export type NodeKind = (typeof NODE_KINDS)[number];

/** This function gives the test of the kind of a node. */
function isKind(kind: NodeKind): Expr {
  return app("eq", ref("kind"), lit(kind));
}

/** The loads below a circuit: the feeds of its outlets, and its other load. Each load has its power in the field `watts`. */
export const CIRCUIT_LOADS: Axis = axes.where(axes.descendants, app("or", isKind("feed"), isKind("other")));

/** The watts of each load of a circuit. A feed with no watts gives an error item. */
const WATTS: Expr = each(CIRCUIT_LOADS, ref("watts"));

/** The rated limit of a circuit, in watts, from its voltage and its breaker. A circuit without one of the two gives `#N/A`. */
export const RATED_LIMIT: Expr = ratedLimit(ref("voltage"), ref("breaker"));

/** The limit of a circuit, in watts: its field `limit`, or its rated limit. A circuit with no limit gives `#N/A`. */
export const CIRCUIT_LIMIT: Expr = app("ifError", ref("limit"), RATED_LIMIT);

/** The known load of a circuit, in watts: the sum of the watts of its loads. A feed with no watts adds nothing. */
export const CIRCUIT_LOAD: Expr = app("sum", WATTS);

/** The count of the loads of a circuit that have watts. */
export const KNOWN_LOADS: Expr = app("count", WATTS);

/** This test tells if the record at the focus has watts. A feed with no watts gives false. */
const HAS_WATTS: Expr = app("ifError", app("eq", ref("watts"), ref("watts")), lit(false));

/** The keys of the feeds of a circuit that have no watts. With one or more, the true load can be above the known load. */
export const MISSING_LOADS: Expr = app("keys", each(axes.where(CIRCUIT_LOADS, app("not", HAS_WATTS)), ref("kind")));

/** The known load of a circuit as a part of its limit. A circuit with no limit above 0 gives an error value. */
export const CIRCUIT_RATIO: Expr = loadRatio(CIRCUIT_LOAD, CIRCUIT_LIMIT);

/** The current of the known load of a circuit, in amperes. A circuit with no voltage gives `#N/A`. */
export const CIRCUIT_CURRENT: Expr = loadCurrent(CIRCUIT_LOAD, ref("voltage"));

/**
 * The level of a circuit, for its known load.
 *
 * - `unknown`: no load of the circuit has watts, or the circuit has no limit above 0.
 * - `over`: the load is above the limit.
 * - `near`: the load is the near part of the limit, or more.
 * - `ok`: each other circuit.
 */
export const CIRCUIT_LEVEL: Expr = app("if", app("eq", KNOWN_LOADS, lit(0)), lit("unknown"), app("ifError", ratioLevel(CIRCUIT_RATIO), lit("unknown")));

/** The largest difference of two limits that are equal, as a part of the rated limit. It is above the error of the arithmetic. */
const EQUAL_LIMITS = 1e-9;

/**
 * This program tells if the field `limit` of a circuit and its rated limit are not equal.
 * A circuit without a limit, a voltage or a breaker gives `#N/A`: it has no two limits to compare.
 */
export const LIMITS_DIFFER: Expr = app("gt", app("abs", app("subtract", ref("limit"), RATED_LIMIT)), app("multiply", RATED_LIMIT, lit(EQUAL_LIMITS)));
