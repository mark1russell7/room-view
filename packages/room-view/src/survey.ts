import { scaleAnchor, type Anchor } from "./anchors.ts";
import { directionOf, FULL, headingOf, SQUARE, TURN_NOISE } from "./direction.ts";
import { moveLayers, type AddOn, type LayerFinding } from "./layers.ts";
import {
  ROOM_SCHEMA,
  SCENE_SCHEMA,
  type Circuit,
  type Opening,
  type Outlet,
  type PlacedObject,
  type PlanPoint,
  type Room,
  type Scene,
  type Wall,
  type WallFace,
} from "./room.ts";
import { LARGEST_LENGTH, metersPer, unitsPer, type LengthUnit } from "./units.ts";

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
 * An object of a survey: a box that a person measures from a side, for example a desk, a shelf or a rack.
 *
 * The back of the object is parallel to the inner face of the side. The person measures along the face to the near edge of the object,
 * and out from the face to its back. The near edge is the edge that is nearest to the first corner of the side.
 * Thus the record has no coordinate.
 *
 * An object with `on` is on a different object or in it, for example a display on a desk or a computer in a rack.
 * Then the person measures from the near edge and from the back of that object, which is the holder.
 * An object has `wall` or `on`. When it has the two, `on` applies.
 */
export interface SurveyObject {
  readonly id: string;
  /** The class of the object, for example `desk`, `rack` or `computer`. A viewer gives each class a color. */
  readonly kind: string;
  readonly name?: string | undefined;
  /** The `id` of the side. */
  readonly wall?: string | undefined;
  /** The `id` of the holder. The first object with the `id` applies. */
  readonly on?: string | undefined;
  /**
   * The distance along the inner face, from the first corner of the side to the near edge of the object.
   * With `on`, this is the distance from the near edge of the holder to the near edge of the object.
   */
  readonly offset: number;
  /** The size of the object along the wall. */
  readonly width: number;
  /** The size of the object out from the wall. */
  readonly depth: number;
  readonly height: number;
  /**
   * The distance from the inner face to the back of the object. With `on`, this is the distance from the back of the holder.
   * The default is 0: the object touches the wall, or its back is level with the back of the holder.
   */
  readonly gap?: number | undefined;
  /**
   * The height of the bottom of the object above the floor. The default is 0.
   * With `on`, this is the height above the bottom of the holder. Then the default is the height of the holder: the object is on its top.
   */
  readonly lift?: number | undefined;
  /** The `id` of the outlet that gives power to the object. */
  readonly outlet?: string | undefined;
}

/**
 * A survey: the measurements of one room by a person with a tape measure.
 *
 * The person goes around the room along the inner faces of the walls, in one direction.
 * Each side has the length of one face, and the turn at its end. The last turn gives the direction of the first side again.
 * An opening, an outlet and an object name their side in `wall`. Their `offset` starts at the first corner of that side.
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
  readonly objects?: readonly SurveyObject[] | undefined;
  /**
   * The records of each add-on, by the name of its layer, for example `electrical/1`. A layer has the format of a layer of a scene.
   * Its anchors are in the space of the survey: they name the sides and the objects of the survey. `surveyAnchor` tells that space.
   * `expandSurvey` moves the anchors to the room record. The core keeps each layer, and it does not read one.
   */
  readonly layers?: Readonly<Record<string, unknown>> | undefined;
}

/**
 * The place of the walk of a survey in its room record. `surveyAnchor` moves an anchor of the survey with it.
 * The record is plain data, so it goes through JSON with no change.
 */
export interface SurveyFrame {
  /** The face of each wall that is in the room: `left` for a walk to the left, and `right` for a walk to the right. */
  readonly face: WallFace;
  /** The place of the first corner in the plan. */
  readonly start: PlanPoint;
  /** The direction of the first side, in degrees counter-clockwise from the x axis. */
  readonly heading: number;
  /**
   * The factor of the length of each side that shares the gap, by the `id` of the side. A factor is the length of the wall as a part of the measured length.
   * A side with no factor keeps its length.
   */
  readonly factors: Readonly<Record<string, number>>;
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
  /**
   * The placed object of each object of the survey that has a place, in the sequence of the survey.
   * A scene record with the room record and these objects gives the model of the room with its objects.
   */
  readonly objects: readonly PlacedObject[];
  /** The place of the walk in the room record. */
  readonly frame: SurveyFrame;
  /**
   * The layers of the survey with their anchors on the room record. A survey with no layers gives none.
   * A layer is here only when an add-on of the options read it. The anchors of a different layer are in the space of the survey.
   */
  readonly layers?: Readonly<Record<string, unknown>> | undefined;
  /** One finding or more for each layer of the survey that is not in `layers`. `moveLayers` tells the codes. */
  readonly layerFindings: readonly LayerFinding[];
}

/** The `id` of the floor of the room record of a closed survey. */
export const SURVEY_FLOOR = "floor";

/** The default limit of the gap of a closed walk, as a part of the length of the walk. */
export const CLOSURE_LIMIT = 0.01;

/** The options of the expansion of a survey. */
export interface SurveyOptions {
  /** The largest gap of a closed walk, as a part of the length of the walk. The default is `CLOSURE_LIMIT`. */
  readonly limit?: number | undefined;
  /** The add-ons that read the layers of the survey. The default is no add-on, and then the result has no layer. */
  readonly addOns?: readonly AddOn<unknown>[] | undefined;
}

/**
 * This function gives an anchor of a survey on the room record of the survey. `frame` comes from the result of `expandSurvey`.
 *
 * - An anchor on a wall names a side. Its `offset` starts at the first corner of the side and goes along the inner face.
 *   The result is on the face in the room, and its `offset` changes in the proportion of the side, as an opening does. Its `face` in the survey has no effect.
 * - A point of an anchor on the floor or on the ceiling is in the frame of the walk. The first corner is the origin, and the first side goes along the x axis.
 *   The result is at its place in the plan. The correction of the gap does not move the point.
 * - An anchor on an object stays, because a placed object keeps the `id` and the frame of its object in the survey.
 */
export function surveyAnchor(anchor: Anchor, frame: SurveyFrame): Anchor {
  if (anchor.on === "object") return anchor;
  if (anchor.on === "wall") {
    const factor = Object.hasOwn(frame.factors, anchor.wall) ? (frame.factors[anchor.wall] ?? 1) : 1;
    return { ...anchor, face: frame.face, offset: anchor.offset * factor };
  }
  const [cos, sin] = directionOf(frame.heading);
  const [x, y] = anchor.at;
  return { ...anchor, at: [frame.start[0] + (x * cos - y * sin), frame.start[1] + (x * sin + y * cos)] };
}

/**
 * This function gives the scene record of the result of `expandSurvey` or of `expandLevel`: the room record, the placed objects and the layers.
 * The scene has the name of the room record. `checkScene` and `checkLayers` examine it.
 */
export function resultScene(result: { readonly room: Room; readonly objects: readonly PlacedObject[]; readonly layers?: Readonly<Record<string, unknown>> | undefined }): Scene {
  return {
    schema: SCENE_SCHEMA,
    ...(result.room.name === undefined ? {} : { name: result.room.name }),
    room: result.room,
    objects: result.objects,
    ...(result.layers === undefined ? {} : { layers: result.layers }),
  };
}

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

/**
 * This function gives a survey in a different unit. Each length of the record changes, and each angle stays.
 * A survey that has the unit already is the result.
 *
 * The anchors of a layer change through the add-on of the layer in `addOns`. An add-on keeps each different length of its layer in a fixed unit.
 * The result has only the layers that an add-on of the list reads, because the anchors of a different layer stay in the old unit.
 * `moveLayers` with `scaleAnchor` gives a finding for each layer that the result does not have.
 */
export function convertSurvey(survey: Survey, unit: LengthUnit, addOns: readonly AddOn<unknown>[] = []): Survey {
  if (survey.unit === unit) return survey;
  const factor = unitsPer(survey.unit, unit);
  const to = (value: number): number => value * factor;
  const start: PlanPoint | undefined = survey.start === undefined ? undefined : [to(survey.start[0]), to(survey.start[1])];
  const layers = survey.layers === undefined ? undefined : moveLayers(survey.layers, addOns, (anchor) => scaleAnchor(anchor, factor)).layers;
  return {
    ...survey,
    unit,
    ...(layers === undefined ? {} : { layers }),
    height: to(survey.height),
    wallThickness: to(survey.wallThickness),
    sides: survey.sides.map((side) => ({
      ...side,
      length: to(side.length),
      ...(side.thickness === undefined ? {} : { thickness: to(side.thickness) }),
      ...(side.height === undefined ? {} : { height: to(side.height) }),
    })),
    ...(start === undefined ? {} : { start }),
    ...(survey.checks === undefined ? {} : { checks: survey.checks.map((check) => ({ ...check, length: to(check.length) })) }),
    ...(survey.openings === undefined
      ? {}
      : {
          openings: survey.openings.map((opening) => ({
            ...opening,
            offset: to(opening.offset),
            width: to(opening.width),
            ...(opening.sill === undefined ? {} : { sill: to(opening.sill) }),
            height: to(opening.height),
          })),
        }),
    ...(survey.outlets === undefined ? {} : { outlets: survey.outlets.map((outlet) => ({ ...outlet, offset: to(outlet.offset), height: to(outlet.height) })) }),
    ...(survey.objects === undefined
      ? {}
      : {
          objects: survey.objects.map((object) => ({
            ...object,
            offset: to(object.offset),
            width: to(object.width),
            depth: to(object.depth),
            height: to(object.height),
            ...(object.gap === undefined ? {} : { gap: to(object.gap) }),
            ...(object.lift === undefined ? {} : { lift: to(object.lift) }),
          })),
        }),
  };
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
 * An object keeps its size on a side that changes its length. It moves by a part of that change: its place in the free length of the side.
 * Thus an object that touches a corner continues to touch it. The x axis of a placed object goes along its wall,
 * and its y axis points into the room. An object with a holder has the holder as its parent, and its place is relative to the holder.
 *
 * Some objects have no place, and the result does not have them. A side that is not in the survey or has no length gives no place.
 * A holder with no place gives no place. A size that is not a finite number above 0 gives no place.
 * A distance that is not in the range of the model gives no place.
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
  const heading = survey.heading !== undefined && Number.isFinite(survey.heading) ? survey.heading : 0;
  const [cos, sin] = directionOf(heading);
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
    ...(closed ? { floors: [{ id: SURVEY_FLOOR, ...(survey.name === undefined ? {} : { name: survey.name }), ring: toLeft ? corners : [...corners].reverse() }] } : {}),
    ...(survey.outlets === undefined ? {} : { outlets: survey.outlets.map((outlet): Outlet => ({ ...outlet, offset: outlet.offset * (factorOf.get(outlet.wall) ?? 1), face })) }),
    ...(survey.circuits === undefined ? {} : { circuits: survey.circuits }),
  };

  const sideOf = new Map<string, number>();
  sides.forEach((side, index) => {
    if (!sideOf.has(side.id)) sideOf.set(side.id, index);
  });
  const listed = new Map<string, SurveyObject>();
  for (const object of survey.objects ?? []) if (!listed.has(object.id)) listed.set(object.id, object);
  const places = new Map<SurveyObject, PlacedObject | undefined>();
  const placeOf = (object: SurveyObject): PlacedObject | undefined => {
    if (places.has(object)) return places.get(object);
    // An object in a ring of objects that hold one another finds itself here. Thus it has no place.
    places.set(object, undefined);
    const made = placed(object);
    places.set(object, made);
    return made;
  };
  const placed = (object: SurveyObject): PlacedObject | undefined => {
    const out = object.gap ?? 0;
    if (![object.width, object.depth, object.height].every((size) => size > 0 && inRange(size))) return undefined;
    if (![object.offset, out, object.lift ?? 0].every(inRange)) return undefined;
    const record = {
      id: object.id,
      kind: object.kind,
      ...(object.name === undefined ? {} : { name: object.name }),
      size: [object.width, object.depth, object.height] as const,
    };
    const power = object.outlet === undefined ? {} : { outlet: object.outlet };
    if (object.on !== undefined) {
      const holder = listed.get(object.on);
      if (holder === undefined || placeOf(holder) === undefined) return undefined;
      // The x axis of the holder goes along its side for a walk to the left, and against its side for a walk to the right.
      const x = object.offset + object.width / 2 - holder.width / 2;
      return { ...record, at: [toLeft ? x : 0 - x, out + object.depth / 2 - holder.depth / 2], lift: object.lift ?? holder.height, parent: holder.id, ...power };
    }
    const index = object.wall === undefined ? undefined : sideOf.get(object.wall);
    if (index === undefined) return undefined;
    const { from, to } = walls[index]!;
    const measure = lengths[index]!;
    const line = Math.hypot(to[0] - from[0], to[1] - from[1]);
    if (!(line > 0) || !(measure > 0)) return undefined;
    // The object keeps its size, so it moves by a part of the change of the length of its side.
    // The part is the place of the object in the free length of the side. An object that is longer than its side has no free length,
    // so the part is its place in the full length, as for an opening.
    const free = measure - object.width;
    const part = Math.min(1, Math.max(0, object.offset / (free > 0 ? free : measure)));
    const near = shared ? object.offset + (line - measure) * part : object.offset;
    const along: PlanPoint = [(to[0] - from[0]) / line, (to[1] - from[1]) / line];
    // The room is on the left of each side of a walk to the left, and on the right of each side of a walk to the right.
    const inward: PlanPoint = toLeft ? [0 - along[1], along[0]] : [along[1], 0 - along[0]];
    const a = near + object.width / 2;
    const b = out + object.depth / 2;
    // The y axis of the object is on the left of its x axis, so the x axis of a walk to the right goes against the side.
    const turn = headingOf(toLeft ? along : [0 - along[0], 0 - along[1]]);
    return {
      ...record,
      at: [from[0] + along[0] * a + inward[0] * b, from[1] + along[1] * a + inward[1] * b],
      ...(object.lift === undefined ? {} : { lift: object.lift }),
      ...(turn === 0 ? {} : { turn }),
      ...power,
    };
  };
  const objects = (survey.objects ?? []).flatMap((object) => {
    const made = placeOf(object);
    return made === undefined ? [] : [made];
  });
  // The layers go to the room record with the frame of the walk. A layer that no add-on reads stays in the survey.
  const frame: SurveyFrame = { face, start, heading, factors: Object.fromEntries(factorOf) };
  const moved = survey.layers === undefined ? undefined : moveLayers(survey.layers, options.addOns ?? [], (anchor) => surveyAnchor(anchor, frame));
  return {
    room,
    corners,
    walk,
    closure: { gap, ratio, turn: error, closed },
    checks,
    objects,
    frame,
    ...(moved === undefined ? {} : { layers: moved.layers }),
    layerFindings: moved?.findings ?? [],
  };
}
