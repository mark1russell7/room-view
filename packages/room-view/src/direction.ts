import type { PlanPoint } from "./room.ts";

/** The turn at a square corner, in degrees. */
export const SQUARE = 90;

/** One full turn, in degrees. */
export const FULL = 360;

/** An angle with an error below this value is exact for the model, in degrees. The value is larger than the error of a sum of numbers. */
export const TURN_NOISE = 1e-9;

/** This function gives the unit vector of a direction in degrees. A direction along an axis gives an exact vector. */
export function directionOf(degrees: number): PlanPoint {
  const turn = ((degrees % FULL) + FULL) % FULL;
  if (turn === 0) return [1, 0];
  if (turn === SQUARE) return [0, 1];
  if (turn === 2 * SQUARE) return [-1, 0];
  if (turn === 3 * SQUARE) return [0, -1];
  const angle = (turn * Math.PI) / 180;
  return [Math.cos(angle), Math.sin(angle)];
}

/** This function turns a vector of the plan by an angle in degrees, counter-clockwise. A turn by 90, 180 or 270 degrees is exact. */
export function turned([x, y]: PlanPoint, degrees: number): PlanPoint {
  const [cos, sin] = directionOf(degrees);
  return [x * cos - y * sin, x * sin + y * cos];
}

/**
 * This function gives the direction of a vector in degrees, from 0 to 360, counter-clockwise from the x axis.
 * A direction near 0, 90, 180 or 270 degrees becomes that value, so a room with square corners keeps exact numbers.
 */
export function headingOf([x, y]: PlanPoint): number {
  return squared((Math.atan2(y, x) * 180) / Math.PI);
}

/** This function gives an angle in degrees from 0 to 360. An angle near 0, 90, 180 or 270 degrees becomes that value. */
export function squared(degrees: number): number {
  const turn = ((degrees % FULL) + FULL) % FULL;
  const near = Math.round(turn / SQUARE) * SQUARE;
  return Math.abs(turn - near) < TURN_NOISE ? near % FULL : turn;
}
