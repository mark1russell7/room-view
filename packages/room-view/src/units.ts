import { quantity, valueIn } from "@mark1russell7/quantity";

/** These are the units of length that a room record can use. */
export const LENGTH_UNITS: readonly ["m", "cm", "mm", "ft", "in"] = ["m", "cm", "mm", "ft", "in"];

/** A unit of length of a room record. */
export type LengthUnit = (typeof LENGTH_UNITS)[number];

/** This function gives the length of one unit in meters. The factor comes from `@mark1russell7/quantity`. */
export function metersPer(unit: LengthUnit): number {
  return valueIn(quantity(1, unit), "m");
}
