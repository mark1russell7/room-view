import { ROOM_SCHEMA, type Circuit, type Opening, type Outlet, type PlanPoint, type Room, type Wall } from "./room.ts";
import { LARGEST_LENGTH, metersPer, type LengthUnit } from "./units.ts";

/** The name of the format of a survey record. */
export const SURVEY_SCHEMA = "survey/1";

/** These are the names of the turns at a square corner. */
export const SQUARE_TURNS: readonly ["left", "right"] = ["left", "right"];

/**
 * The turn of the person at the end of a side, to the direction of the next side.
 *
 * `left` and `right` are the turns at a square corner: 90 degrees. They are exact.
 * A number is a measured angle in degrees, from -360 to 360, and a turn to the left is positive.
 */
export type SurveyTurn = (typeof SQUARE_TURNS)[number] | number;

/** One side of a survey: the inner face of one wall, from a corner to the next corner. */
export interface SurveySide {
  /** The `id` of the wall of the side. */
  readonly id: string;
  /** The length of the inner face, from corner to corner. */
  readonly length: number;
  /** The turn at the end of the side. */
  readonly turn: SurveyTurn;
  /** The thickness of the wall. The default is `wallThickness` of the survey. */
  readonly thickness?: number | undefined;
  /** The height of the wall. The default is `height` of the survey. */
  readonly height?: number | undefined;
}

/** A measured distance between two corners of a survey, for example a diagonal of the room. It examines the walk. */
export interface SurveyCheck {
  readonly id: string;
  /** The `id` of a side. The first corner is the corner at the start of that side. */
  readonly from: string;
  /** The `id` of a side. The second corner is the corner at the start of that side. */
  readonly to: string;
  /** The measured distance between the two corners. */
  readonly length: number;
}

/** An outlet of a survey. It is on the inner face of its wall, so it has no field `face`. */
export type SurveyOutlet = Omit<Outlet, "face">;

/**
 * A survey: the measurements of one room by a person with a tape measure.
 *
 * The person goes around the room along the inner faces of the walls, in one direction.
 * Each side has the length of one face, and the turn at its end. The last turn gives the direction of the first side again.
 * An opening and an outlet name their side in `wall`. Their `offset` starts at the first corner of that side.
 */
export interface Survey {
  readonly schema: typeof SURVEY_SCHEMA;
  readonly name?: string | undefined;
  /** The unit of each length of the record. */
  readonly unit: LengthUnit;
  /** The height of each wall that has no height of its own. */
  readonly height: number;
  /** The thickness of each wall that has no thickness of its own. */
  readonly wallThickness: number;
  /** The sides, in the sequence of the walk. */
  readonly sides: readonly SurveySide[];
  /** The place of the first corner in the plan. The default is the origin. */
  readonly start?: PlanPoint | undefined;
  /** The direction of the first side, in degrees counter-clockwise from the x axis. The default is 0. */
  readonly heading?: number | undefined;
  readonly checks?: readonly SurveyCheck[] | undefined;
  readonly openings?: readonly Opening[] | undefined;
  readonly outlets?: readonly SurveyOutlet[] | undefined;
  readonly circuits?: readonly Circuit[] | undefined;
}

/** The closure of a survey: the difference between the end of the walk and its start. */
export interface SurveyClosure {
  /** The distance from the end of the last side to the first corner, in the unit of the survey. */
  readonly gap: number;
  /** The gap as a part of the length of the walk. A walk with no length has 0. */
  readonly ratio: number;
  /** The sum of the turns minus one full turn in the direction of the walk, in degrees. */
  readonly turn: number;
  /** This value is true when the walk has 3 sides or more, its turns make one full turn, and its gap is in the limit. */
  readonly closed: boolean;
}

/** The result of one check of a survey. */
export interface SurveyCheckResult {
  /** The `id` of the check. */
  readonly id: string;
  /** The measured distance, in the unit of the survey. */
  readonly measured: number;
  /** The distance between the two corners in the room record. A check with a side that the survey does not have gets `undefined`. */
  readonly model: number | undefined;
  /** The measured distance minus the distance in the room record. */
  readonly difference: number | undefined;
}

/** The result of the expansion of a survey. */
export interface SurveyResult {
  /** The room record of the survey. */
  readonly room: Room;
  /** The corner at the start of each side, as the room record has it. */
  readonly corners: readonly PlanPoint[];
  /** The points of the walk before the correction of the gap. The walk has one point more than the survey has sides. */
  readonly walk: readonly PlanPoint[];
  readonly closure: SurveyClosure;
  /** The result of each check, in the sequence of the checks. */
  readonly checks: readonly SurveyCheckResult[];
}

/** The default limit of the gap of a closed walk, as a part of the length of the walk. */
export const CLOSURE_LIMIT = 0.01;

/** The options of the expansion of a survey. */
export interface SurveyOptions {
  /** The largest gap of a closed walk, as a part of the length of the walk. The default is `CLOSURE_LIMIT`. */
  readonly limit?: number | undefined;
}

/** The turn at a square corner, in degrees. */
const SQUARE = 90;

/** One full turn, in degrees. */
const FULL = 360;

/** A sum of turns with an error below this value makes a full turn, in degrees. The value is larger than the error of a sum of numbers. */
const TURN_NOISE = 1e-9;

/** This function tells if a turn is a measured angle: an angle from -360 degrees to 360 degrees. */
function isMeasured(turn: SurveyTurn): turn is number {
  return typeof turn === "number" && Math.abs(turn) <= FULL;
}

/** This function gives a turn in degrees. A turn that is not a square turn or a measured angle is 0. */
function degreesOf(turn: SurveyTurn): number {
  if (turn === "left") return SQUARE;
  if (turn === "right") return 0 - SQUARE;
  return isMeasured(turn) ? turn : 0;
}

/** This function gives the unit vector of a direction in degrees. A direction along an axis gives an exact vector. */
function directionOf(degrees: number): PlanPoint {
  const turn = ((degrees % FULL) + FULL) % FULL;
  if (turn === 0) return [1, 0];
  if (turn === SQUARE) return [0, 1];
  if (turn === 2 * SQUARE) return [-1, 0];
  if (turn === 3 * SQUARE) return [0, -1];
  const angle = (turn * Math.PI) / 180;
  return [Math.cos(angle), Math.sin(angle)];
}

/**
 * This function makes the room record of a survey.
 *
 * The walk starts at `start` in the direction `heading`. Each side adds its length, and then the person turns.
 * A length that is not a finite number above 0, or is not in the range of the model, counts as 0.
 * A turn that is not a number from -360 to 360 counts as 0. Thus each number of the result is finite.
 *
 * A measured length has an error, so the walk does not end exactly at its start. The function corrects the two errors of a walk:
 *
 * 1. When the sum of the turns has an error below 45 degrees, each measured turn gets an equal part of the error.
 *    The turns `left` and `right` are exact, so they do not change. A larger error is a mistake, for example a wrong turn.
 * 2. When the walk is closed, the sides share the gap. Along each axis of the first side, each side changes in proportion to its length along that axis.
 *    This is the transit rule of land survey. A side along an axis stays along that axis, so a room with square corners keeps them.
 *    Then the last wall ends exactly at the first corner, and the room gets a floor.
 *
 * An opening and an outlet keep their place on a side that changes its length: each `offset` and each `width` changes in the same proportion.
 * Thus an opening that fits in its measured side fits in its wall, and two openings that do not overlap stay apart.
 *
 * A walk that is not closed gets no correction of the gap: its walls follow the walk, and the room has no floor.
 * Thus the record of a survey in progress shows the walls that the person measured.
 *
 * The wall of each side is on the outer side of its line. Thus each `offset` of the survey is a distance along the inner face.
 * `checkRoom` examines the room record.
 */
export function expandSurvey(survey: Survey, options: SurveyOptions = {}): SurveyResult {
  const scale = metersPer(survey.unit);
  const inRange = (value: number): boolean => Number.isFinite(value) && Math.abs(value) * scale <= LARGEST_LENGTH;
  const sides = survey.sides;
  const count = sides.length;
  const lengths = sides.map((side) => (side.length > 0 && inRange(side.length) ? side.length : 0));
  const turns = sides.map((side) => degreesOf(side.turn));
  const total = lengths.reduce((sum, length) => sum + length, 0);

  const sum = turns.reduce((all, turn) => all + turn, 0);
  const toLeft = sum >= 0;
  const error = sum - (toLeft ? FULL : 0 - FULL);
  const measured = sides.filter((side) => isMeasured(side.turn)).length;
  const corrected = measured > 0 && Math.abs(error) < SQUARE / 2;
  const share = corrected ? error / measured : 0;

  // The walk in its own frame: the first corner is the origin, and the first side goes along the x axis.
  let direction = 0;
  const steps = sides.map((side, index): PlanPoint => {
    const [dx, dy] = directionOf(direction);
    direction += turns[index]! - (isMeasured(side.turn) ? share : 0);
    return [dx * lengths[index]!, dy * lengths[index]!];
  });
  const points: PlanPoint[] = [[0, 0]];
  steps.forEach(([dx, dy], index) => {
    const [x, y] = points[index]!;
    points.push([x + dx, y + dy]);
  });

  const [gapX, gapY] = points[count]!;
  const gap = Math.hypot(gapX, gapY);
  const ratio = total > 0 ? gap / total : 0;
  const given = options.limit ?? CLOSURE_LIMIT;
  const limit = Number.isFinite(given) && given >= 0 ? given : CLOSURE_LIMIT;
  const closed = count >= 3 && total > 0 && (corrected || Math.abs(error) < TURN_NOISE) && ratio <= limit;

  // The transit rule: along each axis, a corner moves against the gap by the part of the movement before it.
  const moveX = steps.reduce((all, [dx]) => all + Math.abs(dx), 0);
  const moveY = steps.reduce((all, [, dy]) => all + Math.abs(dy), 0);
  let beforeX = 0;
  let beforeY = 0;
  const adjusted = steps.map(([dx, dy], index): PlanPoint => {
    const [x, y] = points[index]!;
    const partX = closed && moveX > 0 ? beforeX / moveX : 0;
    const partY = closed && moveY > 0 ? beforeY / moveY : 0;
    beforeX += Math.abs(dx);
    beforeY += Math.abs(dy);
    return [x - partX * gapX, y - partY * gapY];
  });

  // The frame of the walk goes to its place in the plan.
  const start: PlanPoint = survey.start !== undefined && inRange(survey.start[0]) && inRange(survey.start[1]) ? survey.start : [0, 0];
  const [cos, sin] = directionOf(survey.heading !== undefined && Number.isFinite(survey.heading) ? survey.heading : 0);
  const place = ([x, y]: PlanPoint): PlanPoint => [start[0] + (x * cos - y * sin), start[1] + (x * sin + y * cos)];
  const walk = points.map(place);
  const corners = adjusted.map(place);

  const walls = sides.map((side, index): Wall => {
    const to = closed ? corners[(index + 1) % count]! : walk[index + 1]!;
    return {
      id: side.id,
      from: corners[index]!,
      to,
      side: toLeft ? "right" : "left",
      ...(side.thickness === undefined ? {} : { thickness: side.thickness }),
      ...(side.height === undefined ? {} : { height: side.height }),
    };
  });

  const cornerOf = new Map<string, PlanPoint>();
  sides.forEach((side, index) => {
    if (!cornerOf.has(side.id)) cornerOf.set(side.id, corners[index]!);
  });
  const checks = (survey.checks ?? []).map((check): SurveyCheckResult => {
    const from = cornerOf.get(check.from);
    const to = cornerOf.get(check.to);
    const model = from === undefined || to === undefined ? undefined : Math.hypot(to[0] - from[0], to[1] - from[1]);
    return { id: check.id, measured: check.length, model, difference: model === undefined ? undefined : check.length - model };
  });

  // A side that shares the gap changes its length. The length of its wall, as a part of the measured length, is the factor of the side.
  const shared = closed && gap > 0;
  const factorOf = new Map<string, number>();
  sides.forEach((side, index) => {
    if (!shared || factorOf.has(side.id) || !(lengths[index]! > 0)) return;
    const { from, to } = walls[index]!;
    factorOf.set(side.id, Math.hypot(to[0] - from[0], to[1] - from[1]) / lengths[index]!);
  });
  const openings = survey.openings?.map((opening): Opening => {
    const factor = factorOf.get(opening.wall) ?? 1;
    return factor === 1 ? opening : { ...opening, offset: opening.offset * factor, width: opening.width * factor };
  });

  const face = toLeft ? "left" : "right";
  const room: Room = {
    schema: ROOM_SCHEMA,
    ...(survey.name === undefined ? {} : { name: survey.name }),
    unit: survey.unit,
    height: survey.height,
    wallThickness: survey.wallThickness,
    walls,
    // A walk with no shared gap keeps the list of the survey.
    ...(survey.openings === undefined || openings === undefined ? {} : { openings: shared ? openings : survey.openings }),
    // A floor has a counter-clockwise outline.
    ...(closed ? { floors: [{ id: "floor", ...(survey.name === undefined ? {} : { name: survey.name }), ring: toLeft ? corners : [...corners].reverse() }] } : {}),
    ...(survey.outlets === undefined ? {} : { outlets: survey.outlets.map((outlet): Outlet => ({ ...outlet, offset: outlet.offset * (factorOf.get(outlet.wall) ?? 1), face })) }),
    ...(survey.circuits === undefined ? {} : { circuits: survey.circuits }),
  };
  return { room, corners, walk, closure: { gap, ratio, turn: error, closed }, checks };
}
