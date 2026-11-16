import {
  checkRoom,
  CONNECTION_TURN_LIMIT,
  LEVEL_SCHEMA,
  metersPer,
  type ConnectionEnd,
  type Level,
  type LevelConnection,
  type LevelResult,
  type PlacedObject,
  type Room,
} from "@mark1russell7/room-view";
import {
  draftKeys,
  FEATURE_NAMES,
  featureFaults,
  hasFault,
  hasMore,
  joinedTo,
  lengthText,
  nameWords,
  placedFeatures,
  roomName,
  shownObjects,
  surveyOf,
  unitOf,
  validConnections,
  type Draft,
  type DraftConnection,
  type DraftEnd,
  type LengthMode,
  type PlacedFeature,
  type Status,
  type Store,
} from "./draft.ts";

// The rooms of the page "Measure a room" as one level: the level record of a store, and the rooms of a level record.
// The file also has the messages about the doors between the rooms. Each function of this file is pure, so the tests need no browser.

/**
 * This function gives the `id` of each room in a level record: the words of its name with a hyphen between them.
 * A room with no name gets its number, for example `room-3`. A second room with the same words gets a number at the end.
 * An `id` has no `/`, so the `id` of a wall in the room record of the level tells its room.
 */
export function roomIds(rooms: readonly Draft[]): readonly string[] {
  const taken = new Set<string>();
  return rooms.map((room, index) => {
    const words = nameWords(room.name);
    const base = words.length === 0 ? `room-${String(index + 1)}` : words.join("-");
    let id = base;
    for (let count = 2; taken.has(id); count += 1) id = `${base}-${String(count)}`;
    taken.add(id);
    return id;
  });
}

/**
 * This function makes the level record of a store. It is total, as `surveyOf` is.
 * Each length of its room record is in the unit of the first room. The record has one connection for each connection of the store, at the same position.
 * A feature that needs a number is not in its survey, so `expandLevel` gives its connection the fault `opening`.
 */
export function levelOf(store: Store): Level {
  const ids = roomIds(store.rooms);
  const openings = store.rooms.map((room) => new Map(placedFeatures(room).map((item): [string, string] => [item.feature.key, item.id])));
  const end = (item: DraftEnd): ConnectionEnd => ({ room: ids[item.room] ?? "", opening: openings[item.room]?.get(item.feature) ?? "" });
  const connections = store.connections.map((connection): LevelConnection => {
    const from = end(connection.from);
    return { id: `${from.room}/${from.opening}`, from, to: end(connection.to) };
  });
  return {
    schema: LEVEL_SCHEMA,
    unit: unitOf(store.rooms[0]?.mode ?? "m"),
    rooms: store.rooms.map((room, index) => ({ id: ids[index] ?? "", survey: surveyOf(room) })),
    ...(connections.length === 0 ? {} : { connections }),
  };
}

/** The rooms and the connections of a level record, for a store. */
export interface LevelDrafts {
  readonly rooms: readonly Draft[];
  /** The position of a room in an end of a connection is its position in `rooms`. */
  readonly connections: readonly DraftConnection[];
  /** This value is true when the level record has data that the page does not keep. */
  readonly more: boolean;
}

/**
 * This function makes the rooms of a store from a level record, with the connections between them.
 * A draft does not keep the name of a level, its circuits, the thickness of a connection or the data that `hasMore` tells.
 * A connection that the rooms cannot have goes away. Its opening is not in the survey, or its opening has a second connection.
 */
export function draftsOf(level: Level): LevelDrafts {
  const read = level.rooms.map((room) => draftKeys(room.survey));
  const rooms = read.map((item) => item.draft);
  // Two rooms with one `id` are an error of the record. A connection goes to the first of them, as in `expandLevel`.
  const positions = new Map<string, number>();
  level.rooms.forEach((room, index) => {
    if (!positions.has(room.id)) positions.set(room.id, index);
  });
  const end = (item: ConnectionEnd): DraftEnd | undefined => {
    const room = positions.get(item.room);
    const feature = room === undefined ? undefined : read[room]?.keys.get(item.opening);
    return room === undefined || feature === undefined ? undefined : { room, feature };
  };
  const given = level.connections ?? [];
  const found = given.flatMap((item): DraftConnection[] => {
    const from = end(item.from);
    const to = end(item.to);
    return from === undefined || to === undefined ? [] : [{ from, to }];
  });
  const connections = validConnections(rooms, found);
  const more =
    level.name !== undefined ||
    (level.circuits ?? []).length > 0 ||
    given.some((item) => item.thickness !== undefined) ||
    connections.length < given.length ||
    level.rooms.some((room) => hasMore(room.survey));
  return { rooms, connections, more };
}

/** A feature of a different room that a door can go to. */
export interface JoinChoice {
  readonly end: DraftEnd;
  /** The name of the room and of the feature, for example `Hall: door 2 on wall 3`. */
  readonly text: string;
  /** This value is true for the feature that the door goes to at this time. */
  readonly current: boolean;
}

/**
 * This function gives the features that the door or the opening at `from` can go to.
 * They are the doors and the openings of the other rooms that have no connection.
 * The feature that `from` goes to at this time is a choice too.
 * A window between two rooms is not a choice yet.
 */
export function joinChoices(store: Store, from: DraftEnd): readonly JoinChoice[] {
  const now = joinedTo(store, from);
  return store.rooms.flatMap((room, index) => {
    if (index === from.room) return [];
    return placedFeatures(room).flatMap((item): JoinChoice[] => {
      const { kind, key } = item.feature;
      if (kind !== "door" && kind !== "gap") return [];
      const end: DraftEnd = { room: index, feature: key };
      const current = now !== undefined && now.room === index && now.feature === key;
      if (!current && joinedTo(store, end) !== undefined) return [];
      return [{ end, text: `${roomName(room, index)}: ${FEATURE_NAMES[kind].toLowerCase()} ${String(item.number)} on wall ${String(item.side + 1)}`, current }];
    });
  });
}

/**
 * The state of a connection. `typing`: a door needs a number. `fits`: the two rooms agree about the place of the door.
 * `near`: they agree about its place, and not about its width. `off`: they do not agree about its place.
 */
export type JointState = "typing" | "fits" | "near" | "off";

/** A connection of the store, with the message of the page about it. */
export interface Joint {
  readonly connection: DraftConnection;
  readonly state: JointState;
  /** The names of the two rooms. */
  readonly title: string;
  readonly text: string;
}

/** The two rooms of a connection can give widths of its door that differ by this length, in meters. A larger difference gives the state `near`. */
const WIDTH_LIMIT = 0.025;

const capital = (text: string): string => `${text.slice(0, 1).toUpperCase()}${text.slice(1)}`;

/** One end of a connection, for a message. */
interface End {
  /** The name of the room. */
  readonly name: string;
  /** The words for the feature, for example `door 2`. */
  readonly words: string;
  readonly item: PlacedFeature | undefined;
  readonly mode: LengthMode;
}

function endOf(rooms: readonly Draft[], end: DraftEnd): End {
  const room = rooms[end.room];
  const item = room === undefined ? undefined : placedFeatures(room).find((entry) => entry.feature.key === end.feature);
  return {
    name: room === undefined ? "a room" : roomName(room, end.room),
    words: item === undefined ? "a door" : `${FEATURE_NAMES[item.feature.kind].toLowerCase()} ${String(item.number)}`,
    item,
    mode: room?.mode ?? "m",
  };
}

/** This function tells the number that the feature at an end of a connection needs, before the level can use the connection. */
function needOf(end: End): string | undefined {
  const { item } = end;
  if (item === undefined) return undefined;
  if (!(item.wall > 0)) return `Wall ${String(item.side + 1)} of ${end.name} needs its length. ${capital(end.words)} is on this wall.`;
  if (item.reading.state !== "ok") return `${capital(end.words)} of ${end.name} needs its numbers.`;
  return undefined;
}

/** This function gives the width of the feature at an end of a connection as text, in the units of its room. */
function widthOf(end: End): string | undefined {
  const reading = end.item?.reading;
  return reading?.state === "ok" ? lengthText(reading.numbers.width, end.mode) : undefined;
}

/**
 * This function gives the message about each connection of a store. `result` is the expansion of the level record of the store.
 * The messages are in the sequence of the connections.
 */
export function jointsOf(store: Store, result: LevelResult): readonly Joint[] {
  const mode = store.rooms[0]?.mode ?? "m";
  const meters = metersPer(unitOf(mode));
  const faults = store.rooms.map((room, index) => {
    const placed = result.rooms[index];
    return placed === undefined ? [] : featureFaults(room, placed.result);
  });
  // A door that its wall cannot have gives a place that is not sure, so its connection is not ready.
  const errorOf = (end: DraftEnd, name: string): string | undefined => {
    const fault = faults[end.room]?.find((item) => item.key === end.feature && item.level === "error");
    return fault === undefined ? undefined : `${name}: ${fault.text}`;
  };
  return store.connections.map((connection, index): Joint => {
    const from = endOf(store.rooms, connection.from);
    const to = endOf(store.rooms, connection.to);
    const title = `${from.name} and ${to.name}`;
    const pair = `${from.words} of ${from.name} and ${to.words} of ${to.name}`;
    const found = result.connections[index];
    if (found === undefined || found.fault !== undefined) {
      const text = needOf(from) ?? needOf(to) ?? `Examine the numbers of ${pair}.`;
      return { connection, state: "typing", title, text };
    }
    const error = errorOf(connection.from, from.name) ?? errorOf(connection.to, to.name);
    if (error !== undefined) return { connection, state: "typing", title, text: error };
    if (!found.fits) {
      const turn = Math.abs(found.turn ?? 0);
      const text =
        turn > CONNECTION_TURN_LIMIT
          ? `The walls of ${pair} make an angle of ${String(Math.round(turn * 10) / 10)} degrees, and they must be parallel. Examine the corners of the two rooms.`
          : `${capital(pair)} are ${lengthText(found.gap ?? 0, mode)} apart. A length is wrong in one of the rooms, or this door goes to a different room.`;
      return { connection, state: "off", title, text };
    }
    const same = `${capital(from.words)} of ${from.name} is ${to.words} of ${to.name}.`;
    if (Math.abs(found.width ?? 0) * meters > WIDTH_LIMIT) {
      const one = widthOf(from);
      const two = widthOf(to);
      const widths = one === undefined || two === undefined ? "The two rooms give different widths for it." : `Its width is ${one} in ${from.name} and ${two} in ${to.name}.`;
      return { connection, state: "near", title, text: `${same} ${widths} Measure it again.` };
    }
    return { connection, state: "fits", title, text: same };
  });
}

/**
 * This function gives the positions of the rooms that have no path of connections to the first room.
 * The level does not know their place, so `expandLevel` puts them at the side.
 */
export function apartRooms(result: LevelResult): readonly number[] {
  return result.rooms.flatMap((room, index) => (room.group > 0 ? [index] : []));
}

/** This function gives the names of rooms as a part of a sentence: `A`, `A and B`, or their number. */
function namesOf(rooms: readonly Draft[], positions: readonly number[]): string {
  const names = positions.map((position) => {
    const room = rooms[position];
    return room === undefined ? "a room" : roomName(room, position);
  });
  if (names.length <= 2) return names.join(" and ");
  return `${String(names.length)} rooms`;
}

/** This function gives the positions of the rooms that have a connection. */
function joinedRooms(joints: readonly Joint[]): ReadonlySet<number> {
  return new Set(joints.flatMap(({ connection }) => [connection.from.room, connection.to.room]));
}

/**
 * This function tells why the drawing shows a room apart. The room has no door to a different room.
 * Or the room has one, and no door joins its group of rooms to the first room.
 */
export function apartNote(rooms: readonly Draft[], joints: readonly Joint[], room: number): string {
  if (!joinedRooms(joints).has(room)) return "No door joins this room to a different room yet, so the drawing shows it apart.";
  return `No door joins this room and its group to ${namesOf(rooms, [0])} yet, so the drawing shows it apart.`;
}

/**
 * This function gives the message of the page about the rooms of a store as one level.
 * `statuses` has the status of each room, and `joints` is the result of `jointsOf`.
 * A room that needs a number comes first. A room that does not close, a connection that is not ready and a connection that does not fit follow.
 */
export function levelStatus(rooms: readonly Draft[], statuses: readonly Status[], result: LevelResult, joints: readonly Joint[]): Status {
  const nameAt = (position: number): string => namesOf(rooms, [position]);
  const typing = statuses.findIndex((status) => status.level === "typing");
  if (typing >= 0) return { level: "typing", title: `${nameAt(typing)} needs a number.`, text: statuses[typing]?.title ?? "" };
  const open = statuses.findIndex((status) => status.level === "open");
  if (open >= 0) return { level: "open", title: `${nameAt(open)} does not close.`, text: statuses[open]?.title ?? "" };
  const waits = joints.find((joint) => joint.state === "typing");
  if (waits !== undefined) return { level: "typing", title: `The door between ${waits.title} is not ready.`, text: waits.text };
  const off = joints.find((joint) => joint.state === "off");
  if (off !== undefined) return { level: "open", title: `${off.title} do not fit at a door.`, text: off.text };
  const apart = apartRooms(result);
  if (apart.length > 0) {
    // A room with no connection comes before a group of rooms that no door joins to the first room.
    const joined = joinedRooms(joints);
    const alone = apart.filter((room) => !joined.has(room));
    if (alone.length > 0) {
      return {
        level: "typing",
        title: `${namesOf(rooms, alone)} ${alone.length === 1 ? "has" : "have"} no door to the other rooms yet.`,
        text: "Open the room. At one of its doors, select where the door goes. Until then, the drawing shows the room apart.",
      };
    }
    return {
      level: "typing",
      title: `No door joins ${namesOf(rooms, apart)} to ${nameAt(0)} yet.`,
      text: "Open one of these rooms. At one of its doors, select where the door goes. Until then, the drawing shows these rooms apart.",
    };
  }
  const fault = statuses.findIndex((status) => hasFault(status));
  if (fault >= 0) return { level: "closed", title: "The rooms fit together.", text: `${nameAt(fault)}: ${statuses[fault]?.text ?? ""}` };
  const near = joints.find((joint) => joint.state === "near");
  if (near !== undefined) return { level: "closed", title: "The rooms fit together.", text: near.text };
  return { level: "closed", title: "The rooms fit together.", text: "Each door between two rooms is at the same place from its two sides." };
}

/**
 * This function gives the room record of a level that the page shows and saves.
 * It has no wall, no opening and no outlet of a room that does not close.
 * It has no opening and no outlet that has an error.
 * Thus one room that is not ready does not stop the model of the other rooms.
 */
export function shownLevel(result: LevelResult): Room {
  const open = result.rooms.filter((room) => !room.result.closure.closed).map((room) => `${room.id}/`);
  const bad = new Set(
    checkRoom(result.room)
      .filter((finding) => finding.level === "error" && (finding.record === "opening" || finding.record === "outlet"))
      .map((finding) => finding.at),
  );
  if (open.length === 0 && bad.size === 0) return result.room;
  const stays = (id: string): boolean => !bad.has(id) && !open.some((prefix) => id.startsWith(prefix));
  const { walls, openings, outlets, ...rest } = result.room;
  return {
    ...rest,
    walls: walls.filter((wall) => stays(wall.id)),
    ...(openings === undefined ? {} : { openings: openings.filter((item) => stays(item.id)) }),
    ...(outlets === undefined ? {} : { outlets: outlets.filter((item) => stays(item.id)) }),
  };
}

/**
 * This function gives the objects of a level that the page shows and saves. `room` is the result of `shownLevel`.
 * It has no object of a room that does not close. An object does not keep an outlet that `room` does not have.
 */
export function shownLevelObjects(result: LevelResult, room: Room): readonly PlacedObject[] {
  const open = result.rooms.filter((item) => !item.result.closure.closed).map((item) => `${item.id}/`);
  const objects = open.length === 0 ? result.objects : result.objects.filter((object) => !open.some((prefix) => object.id.startsWith(prefix)));
  return shownObjects(room, objects);
}
