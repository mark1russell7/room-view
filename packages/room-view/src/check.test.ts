import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { checkRoom, checkScene, FINDING_CODES, type Finding } from "./check.ts";
import { circuitStates } from "./loads.ts";
import { OPENING_KINDS, ROOM_SCHEMA, SCENE_SCHEMA, WALL_FACES, WALL_SIDES, type Room, type Scene } from "./room.ts";
import { SAMPLE_SCENE } from "./sample.ts";
import { boundsOfSolids, sceneSolids, solidVolume } from "./solids.ts";
import { LENGTH_UNITS } from "./units.ts";

/** One wall along the x axis, 4 long, 0.2 thick and 2.4 high. */
function room(more: Partial<Room> = {}): Room {
  return { schema: "room/1", unit: "m", height: 2.4, wallThickness: 0.2, walls: [{ id: "a", from: [0, 0], to: [4, 0] }], ...more };
}

function scene(more: Partial<Scene> = {}, roomMore: Partial<Room> = {}): Scene {
  return { schema: "scene/1", room: room(roomMore), ...more };
}

/** Each finding as one text: the level, the code, the kind of record and the `id`. */
function found(findings: readonly Finding[]): readonly string[] {
  return findings.map((finding) => `${finding.level}/${finding.code}/${finding.record}/${finding.at}`);
}

const box = { kind: "box", size: [1, 1, 1] } as const;

describe("checkRoom", () => {
  it("gives no finding for a correct room", () => {
    expect(checkRoom(room())).toEqual([]);
    expect(checkRoom(SAMPLE_SCENE.room)).toEqual([]);
  });

  it("tells a number that is not finite", () => {
    expect(found(checkRoom(room({ height: Infinity })))).toEqual(["error/number-not-finite/room/"]);
    expect(found(checkRoom(room({ walls: [{ id: "a", from: [0, 0], to: [Number.NaN, 0] }] })))).toEqual(["error/number-not-finite/wall/a", "error/wall-length/wall/a"]);
    expect(found(checkRoom(room({ circuits: [{ id: "c", limit: Infinity }] })))).toEqual(["error/number-not-finite/circuit/c"]);
  });

  it("tells an id that two records of one kind have", () => {
    const walls: Room["walls"] = [
      { id: "a", from: [0, 0], to: [4, 0] },
      { id: "a", from: [0, 2], to: [4, 2] },
    ];
    expect(found(checkRoom(room({ walls })))).toEqual(["error/id-duplicate/wall/a"]);
    const outlets: Room["outlets"] = [
      { id: "x", wall: "a", face: "left", offset: 1, height: 0.3 },
      { id: "x", wall: "a", face: "left", offset: 2, height: 0.3 },
      { id: "x", wall: "a", face: "left", offset: 3, height: 0.3 },
    ];
    expect(found(checkRoom(room({ outlets })))).toEqual(["error/id-duplicate/outlet/x"]);
    // An outlet and a wall can have the same id: the kinds are different.
    expect(checkRoom(room({ outlets: [{ id: "a", wall: "a", face: "left", offset: 1, height: 0.3 }] }))).toEqual([]);
  });

  it("tells a size that is not above 0", () => {
    expect(found(checkRoom(room({ height: 0 })))).toEqual(["error/size-not-positive/room/"]);
    expect(found(checkRoom(room({ wallThickness: -0.2 })))).toEqual(["error/size-not-positive/room/"]);
    expect(found(checkRoom(room({ walls: [{ id: "a", from: [0, 0], to: [4, 0], thickness: 0, height: -1 }] })))).toEqual(["error/size-not-positive/wall/a", "error/size-not-positive/wall/a"]);
    expect(found(checkRoom(room({ openings: [{ id: "o", wall: "a", kind: "door", offset: 1, width: 0, height: -1 }] })))).toEqual(["error/size-not-positive/opening/o", "error/size-not-positive/opening/o"]);
  });

  it("tells a wall with no length", () => {
    const walls: Room["walls"] = [
      { id: "a", from: [0, 0], to: [4, 0] },
      { id: "b", from: [1, 1], to: [1, 1] },
    ];
    expect(found(checkRoom(room({ walls })))).toEqual(["error/wall-length/wall/b"]);
  });

  it("tells a wall that is too short for its corners", () => {
    const angle = (20 * Math.PI) / 180;
    const walls: Room["walls"] = [
      { id: "long", from: [0, 0], to: [5, 0] },
      { id: "short", from: [0, 0], to: [0.3 * Math.cos(angle), 0.3 * Math.sin(angle)] },
    ];
    expect(found(checkRoom(room({ walls })))).toEqual(["warning/wall-short/wall/short"]);
    // With square ends, each wall has its full thickness, and the two walls overlap.
    expect(found(checkRoom(room({ walls }), { joins: { miterLimit: 0 } }))).toEqual(["warning/wall-overlap/wall/long"]);
  });

  it("tells two walls that overlap", () => {
    const walls: Room["walls"] = [
      { id: "a", from: [0, 0], to: [4, 0] },
      { id: "b", from: [2, -1], to: [2, 1] },
      { id: "c", from: [0, 3], to: [4, 3] },
    ];
    const findings = checkRoom(room({ walls }));
    expect(found(findings)).toEqual(["warning/wall-overlap/wall/a"]);
    expect(findings[0]!.message).toBe('The walls "a" and "b" overlap. Walls connect only at their ends: divide a wall at the point where a different wall crosses it.');
  });

  it("gives no finding for walls that touch at a corner or on a face", () => {
    const walls: Room["walls"] = [
      { id: "a", from: [0, 0], to: [4, 0] },
      { id: "b", from: [4, 0], to: [4, 3] },
      { id: "c", from: [2, 0.1], to: [2, 2] },
    ];
    expect(checkRoom(room({ walls }))).toEqual([]);
  });

  it("tells an opening on a wall that the room does not have", () => {
    expect(found(checkRoom(room({ openings: [{ id: "o", wall: "none", kind: "door", offset: 1, width: 0.9, height: 2 }] })))).toEqual(["error/opening-wall/opening/o"]);
  });

  it("tells an opening that is not in the straight part of its wall", () => {
    const door = { id: "o", wall: "a", kind: "door", width: 0.9, height: 2 } as const;
    expect(checkRoom(room({ openings: [{ ...door, offset: 3.1 }] }))).toEqual([]);
    expect(found(checkRoom(room({ openings: [{ ...door, offset: 3.5 }] })))).toEqual(["error/opening-range/opening/o"]);
    expect(found(checkRoom(room({ openings: [{ ...door, offset: -0.1 }] })))).toEqual(["error/opening-range/opening/o"]);
    // A corner with a second wall takes the last 0.1 of the inner face of the wall.
    const walls: Room["walls"] = [
      { id: "a", from: [0, 0], to: [4, 0] },
      { id: "b", from: [4, 0], to: [4, 3] },
    ];
    expect(checkRoom(room({ walls, openings: [{ ...door, offset: 3 }] }))).toEqual([]);
    expect(found(checkRoom(room({ walls, openings: [{ ...door, offset: 3.05 }] })))).toEqual(["error/opening-range/opening/o"]);
  });

  it("gives the values of a finding in the unit of the room", () => {
    const findings = checkRoom({
      schema: "room/1",
      unit: "cm",
      height: 240,
      wallThickness: 20,
      walls: [{ id: "a", from: [0, 0], to: [400, 0] }],
      openings: [{ id: "o", wall: "a", kind: "door", offset: 350, width: 90, height: 200 }],
    });
    expect(findings).toEqual([
      {
        level: "error",
        code: "opening-range",
        record: "opening",
        at: "o",
        message: 'The opening "o" is from 350 to 440 along the wall "a". The straight part of that wall is from 0 to 400.',
      },
    ]);
  });

  it("tells an opening that is not in the height of its wall", () => {
    const hole = { id: "o", wall: "a", kind: "window", offset: 1, width: 1 } as const;
    expect(checkRoom(room({ openings: [{ ...hole, sill: 1.4, height: 1 }] }))).toEqual([]);
    expect(found(checkRoom(room({ openings: [{ ...hole, sill: 2, height: 1 }] })))).toEqual(["error/opening-height/opening/o"]);
    expect(found(checkRoom(room({ openings: [{ ...hole, sill: -0.5, height: 1 }] })))).toEqual(["error/opening-height/opening/o"]);
    // The wall has its own height.
    expect(found(checkRoom(room({ walls: [{ id: "a", from: [0, 0], to: [4, 0], height: 1.5 }], openings: [{ ...hole, sill: 1, height: 1 }] })))).toEqual(["error/opening-height/opening/o"]);
  });

  it("tells two openings of one wall that overlap", () => {
    const openings: Room["openings"] = [
      { id: "late", wall: "a", kind: "door", offset: 1.5, width: 1, height: 2 },
      { id: "early", wall: "a", kind: "door", offset: 1, width: 1, height: 2 },
      { id: "last", wall: "a", kind: "door", offset: 2.5, width: 1, height: 2 },
    ];
    expect(found(checkRoom(room({ openings })))).toEqual(["error/opening-overlap/opening/late"]);
  });

  it("tells an outlet on a wall or a circuit that the room does not have", () => {
    expect(found(checkRoom(room({ outlets: [{ id: "x", wall: "none", face: "left", offset: 1, height: 0.3 }] })))).toEqual(["error/outlet-wall/outlet/x"]);
    expect(found(checkRoom(room({ outlets: [{ id: "x", wall: "a", face: "left", offset: 1, height: 0.3, circuit: "z" }] })))).toEqual(["error/outlet-circuit/outlet/x"]);
    expect(checkRoom(room({ outlets: [{ id: "x", wall: "a", face: "left", offset: 1, height: 0.3, circuit: "z" }], circuits: [{ id: "z", limit: 1800 }] }))).toEqual([]);
  });

  it("tells an outlet that is not on its wall", () => {
    const outlet = { id: "x", wall: "a", face: "right" } as const;
    expect(checkRoom(room({ outlets: [{ ...outlet, offset: 4, height: 2.4 }] }))).toEqual([]);
    expect(found(checkRoom(room({ outlets: [{ ...outlet, offset: 4.5, height: 0.3 }] })))).toEqual(["error/outlet-range/outlet/x"]);
    expect(found(checkRoom(room({ outlets: [{ ...outlet, offset: -0.1, height: 0.3 }] })))).toEqual(["error/outlet-range/outlet/x"]);
    expect(found(checkRoom(room({ outlets: [{ ...outlet, offset: 1, height: 2.5 }] })))).toEqual(["error/outlet-range/outlet/x"]);
    expect(found(checkRoom(room({ outlets: [{ ...outlet, offset: 1, height: -0.1 }] })))).toEqual(["error/outlet-range/outlet/x"]);
  });

  it("tells an outlet in an opening", () => {
    const openings: Room["openings"] = [{ id: "door", wall: "a", kind: "door", offset: 1, width: 1, height: 2 }];
    const outlet = { id: "x", wall: "a", face: "left" } as const;
    expect(found(checkRoom(room({ openings, outlets: [{ ...outlet, offset: 1.5, height: 0.3 }] })))).toEqual(["warning/outlet-in-opening/outlet/x"]);
    expect(checkRoom(room({ openings, outlets: [{ ...outlet, offset: 2.5, height: 0.3 }] }))).toEqual([]);
    expect(checkRoom(room({ openings, outlets: [{ ...outlet, offset: 1.5, height: 2.2 }] }))).toEqual([]);
  });

  it("tells a floor with no area", () => {
    const floors = (ring: readonly (readonly [number, number])[]): Room["floors"] => [{ id: "f", ring }];
    expect(
      checkRoom(
        room({
          floors: floors([
            [0, 0],
            [4, 0],
            [0, 3],
          ]),
        }),
      ),
    ).toEqual([]);
    expect(
      found(
        checkRoom(
          room({
            floors: floors([
              [0, 0],
              [4, 0],
            ]),
          }),
        ),
      ),
    ).toEqual(["error/floor-ring/floor/f"]);
    expect(
      found(
        checkRoom(
          room({
            floors: floors([
              [0, 0],
              [2, 0],
              [4, 0],
            ]),
          }),
        ),
      ),
    ).toEqual(["error/floor-ring/floor/f"]);
  });

  it("tells a circuit with a limit that is not above 0", () => {
    expect(found(checkRoom(room({ circuits: [{ id: "c", limit: 0 }] })))).toEqual(["error/circuit-limit/circuit/c"]);
  });
});

describe("checkScene", () => {
  it("gives no finding for the sample scene", () => {
    expect(checkScene(SAMPLE_SCENE)).toEqual([]);
  });

  it("gives the findings of the room first", () => {
    const findings = checkScene(scene({ objects: [{ ...box, id: "o", at: [2, 2], parent: "none" }] }, { height: 0 }));
    expect(found(findings)).toEqual(["error/size-not-positive/room/", "error/object-parent/object/o"]);
  });

  it("tells the faults of the numbers and the ids of the objects", () => {
    expect(found(checkScene(scene({ objects: [{ ...box, id: "o", at: [2, 2], lift: Number.NaN }] })))).toEqual(["error/number-not-finite/object/o"]);
    expect(found(checkScene(scene({ objects: [{ kind: "box", id: "o", at: [2, 2], size: [1, 0, 1] }] })))).toEqual(["error/size-not-positive/object/o"]);
    const twice = checkScene(
      scene({
        objects: [
          { ...box, id: "o", at: [2, 2] },
          { ...box, id: "o", at: [3, 3] },
        ],
      }),
    );
    expect(found(twice)).toContain("error/id-duplicate/object/o");
  });

  it("tells an object on an object that the scene does not have, and a loop of parents", () => {
    expect(found(checkScene(scene({ objects: [{ ...box, id: "o", at: [2, 2], parent: "none" }] })))).toEqual(["error/object-parent/object/o"]);
    const loop = checkScene(
      scene({
        objects: [
          { ...box, id: "a", at: [2, 2], parent: "b" },
          { ...box, id: "b", at: [2, 2], parent: "a" },
          { ...box, id: "self", at: [2, 2], parent: "self" },
        ],
      }),
    );
    expect(found(loop)).toEqual(["error/object-cycle/object/a", "error/object-cycle/object/b", "error/object-cycle/object/self"]);
    expect(loop[0]!.message).toBe('The parents of the object "a" make a loop.');
  });

  it("tells an object with an outlet that the room does not have", () => {
    expect(found(checkScene(scene({ objects: [{ ...box, id: "o", at: [2, 2], outlet: "none" }] })))).toEqual(["error/object-outlet/object/o"]);
    const outlets: Room["outlets"] = [{ id: "x", wall: "a", face: "left", offset: 1, height: 0.3 }];
    expect(checkScene(scene({ objects: [{ ...box, id: "o", at: [2, 2], outlet: "x" }] }, { outlets }))).toEqual([]);
  });

  it("tells an object that is not on a floor", () => {
    const floors: Room["floors"] = [
      {
        id: "f",
        ring: [
          [0, 0.1],
          [4, 0.1],
          [4, 3],
          [0, 3],
        ],
      },
    ];
    const objects: Scene["objects"] = [
      { ...box, id: "in", at: [2, 1.5] },
      { ...box, id: "out", at: [10, 10] },
      { kind: "box", size: [0.2, 0.2, 0.2], id: "on-out", at: [0, 0], lift: 1, parent: "out" },
    ];
    expect(found(checkScene(scene({ objects }, { floors })))).toEqual(["warning/object-outside/object/out"]);
    // A room with no floor record has no such check.
    expect(checkScene(scene({ objects }))).toEqual([]);
  });

  it("tells two objects that overlap", () => {
    const objects: Scene["objects"] = [
      { ...box, id: "p", at: [1, 2] },
      { ...box, id: "q", at: [1.5, 2.5] },
      { ...box, id: "above", at: [1, 2], lift: 1 },
      { ...box, id: "beside", at: [2.5, 2.5] },
      { kind: "box", size: [0.5, 0.5, 0.5], id: "in-p", at: [0, 0], lift: 0.2, parent: "p" },
    ];
    // The object "in-p" is in the object "p", which holds it. It also overlaps "q".
    expect(found(checkScene(scene({ objects })))).toEqual(["warning/object-overlap/object/p", "warning/object-overlap/object/q"]);
    const findings = checkScene(scene({ objects: objects.slice(0, 2) }));
    expect(findings.map((finding) => finding.message)).toEqual(['The objects "p" and "q" overlap.']);
  });

  it("tells an object in a wall", () => {
    expect(found(checkScene(scene({ objects: [{ ...box, id: "o", at: [2, 0.3] }] })))).toEqual(["warning/object-in-wall/object/o"]);
    expect(checkScene(scene({ objects: [{ ...box, id: "o", at: [2, 0.6] }] }))).toEqual([]);
    // An object above the top of the wall is not in the wall.
    expect(checkScene(scene({ objects: [{ ...box, id: "o", at: [2, 0.3], lift: 2.4 }] }))).toEqual([]);
  });

  it("tells the faults of the loads", () => {
    const circuits: Room["circuits"] = [{ id: "c", limit: 1800 }];
    expect(checkScene(scene({ loads: [{ circuit: "c", watts: 0 }] }, { circuits }))).toEqual([]);
    expect(found(checkScene(scene({ loads: [{ circuit: "z", watts: 10 }] }, { circuits })))).toEqual(["error/load-circuit/load/z"]);
    expect(found(checkScene(scene({ loads: [{ circuit: "c", watts: -1 }] }, { circuits })))).toEqual(["error/load-watts/load/c"]);
    expect(found(checkScene(scene({ loads: [{ circuit: "c", watts: Number.NaN }] }, { circuits })))).toEqual(["error/load-watts/load/c"]);
  });
});

describe("a record with faults", () => {
  const number = fc.oneof(fc.double(), fc.constantFrom(0, -1, 0.5, 1, 3, Number.NaN, Infinity, -Infinity));
  const id = fc.constantFrom("a", "b", "c");
  const maybe = <T>(value: fc.Arbitrary<T>): fc.Arbitrary<T | undefined> => fc.option(value, { nil: undefined });
  const point = fc.tuple(number, number);
  const anyRoom: fc.Arbitrary<Room> = fc.record({
    schema: fc.constant(ROOM_SCHEMA),
    unit: fc.constantFrom(...LENGTH_UNITS),
    height: number,
    wallThickness: number,
    walls: fc.array(fc.record({ id, from: point, to: point, thickness: maybe(number), height: maybe(number), side: maybe(fc.constantFrom(...WALL_SIDES)) }), { maxLength: 4 }),
    openings: fc.array(fc.record({ id, wall: id, kind: fc.constantFrom(...OPENING_KINDS), offset: number, width: number, sill: maybe(number), height: number }), { maxLength: 3 }),
    floors: fc.array(fc.record({ id, ring: fc.array(point, { maxLength: 5 }) }), { maxLength: 2 }),
    outlets: fc.array(fc.record({ id, wall: id, face: fc.constantFrom(...WALL_FACES), offset: number, height: number, circuit: maybe(id) }), { maxLength: 3 }),
    circuits: fc.array(fc.record({ id, limit: number }), { maxLength: 2 }),
  });
  const anyScene: fc.Arbitrary<Scene> = fc.record({
    schema: fc.constant(SCENE_SCHEMA),
    room: anyRoom,
    objects: fc.array(fc.record({ id, kind: fc.constant("box"), size: fc.tuple(number, number, number), at: point, lift: maybe(number), turn: maybe(number), parent: maybe(id), outlet: maybe(id) }), { maxLength: 4 }),
    loads: fc.array(fc.record({ circuit: id, watts: number }), { maxLength: 3 }),
  });

  it("does not stop the checks, the model or the loads", () => {
    fc.assert(
      fc.property(anyScene, (record) => {
        const findings = checkScene(record);
        for (const finding of findings) expect(FINDING_CODES).toContain(finding.code);
        const solids = sceneSolids(record);
        expect(new Set(solids.map((solid) => solid.id)).size).toBeLessThanOrEqual(solids.length);
        solids.forEach((solid) => solidVolume(solid));
        boundsOfSolids(solids);
        expect(circuitStates(record)).toHaveLength(record.room.circuits?.length ?? 0);
      }),
    );
  });

  it("gives a model with volumes above 0 when the checks find no error", () => {
    fc.assert(
      fc.property(anyScene, (record) => {
        fc.pre(checkScene(record).every((finding) => finding.level !== "error"));
        for (const solid of sceneSolids(record)) expect(solidVolume(solid)).toBeGreaterThan(0);
      }),
      { numRuns: 30, maxSkipsPerRun: 2000 },
    );
  });
});
