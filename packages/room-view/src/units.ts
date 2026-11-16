import { quantity, valueIn } from "@mark1russell7/quantity";

/** These are the units of length that a room record can use. */
export const LENGTH_UNITS: readonly ["m", "cm", "mm", "ft", "in"] = ["m", "cm", "mm", "ft", "in"];

/** A unit of length of a room record. */
export type LengthUnit = (typeof LENGTH_UNITS)[number];

/** This function gives the length of one unit in meters. The factor comes from `@mark1russell7/quantity`. */
export function metersPer(unit: LengthUnit): number {
  return valueIn(quantity(1, unit), "m");
}

/**
 * The largest length in meters that the model can use: 1 000 km. A larger number in a room record is a mistake.
 * With this limit, each calculation of the model gives a finite number.
 */
export const LARGEST_LENGTH = 1e6;

/** This function tells if each value is a length that the model can use: a finite number of meters, with a size of `LARGEST_LENGTH` or less. */
export function lengthsInRange(...meters: readonly number[]): boolean {
  return meters.every((value) => Math.abs(value) <= LARGEST_LENGTH);
}
