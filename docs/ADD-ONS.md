# A core of space and add-on layers

This file is the design of roadmap item R7. It comes before the code.

## The goal

A room model has many topics: electrical, plumbing, light, sound, heat, air and more. Each topic composes on one core, and no topic changes the core.

- The core knows only space: rooms, walls, openings, floors, placed objects and anchors.
- Each topic is an add-on package. An add-on has its records, its checks, its formulas and its marks.
- The add-ons do not know each other. Two add-ons can name the same object by its `id`.
- A viewer draws marks from a shared library. An add-on gives marks, and it does not draw.
- The API is JSON. A procedures package gives it to the command line and to MCP.

## The state before R7

Electrical is in the core today:

| Part | Electrical part in the core |
| --- | --- |
| `room.ts` | `Outlet`, `Circuit` and `CircuitLoad`, the fields `Room.outlets`, `Room.circuits` and `Scene.loads`, and `PlacedObject.outlet` |
| `schema.ts` | The schemas of these records |
| `check.ts` | The record kinds `outlet`, `circuit` and `load`, and the codes `outlet-*`, `circuit-limit`, `object-outlet` and `load-*` |
| `loads.ts` | The load of each circuit against its limit, and the shape of each load level |
| `survey.ts` and `level.ts` | `SurveyOutlet`, `Survey.outlets` and the circuits of a survey and of a level |
| `solids.ts` and `viewer/` | The solid kind `outlet`, the outlet markers and the power links |
| The site | The circuits of the store, the field `circuit` of a feature, the meters and the plan marks |

The math of a circuit limit is a Vex program of `@mark1russell7/cluster-design` today. A circuit is not an idea of a computer cluster, and a room add-on does not import cluster design. So R7 moves the circuit math to the electrical add-on, and `cluster-design` imports it from there.

## The core

### Anchors

An anchor is a place in the space of the core. An add-on puts each of its records on an anchor, and the core gives the anchor its position.

```ts
type Anchor =
  | { readonly on: "wall"; readonly wall: string; readonly face: WallFace; readonly offset: number; readonly height: number }
  | { readonly on: "floor"; readonly at: PlanPoint; readonly floor?: string }
  | { readonly on: "ceiling"; readonly at: PlanPoint }
  | { readonly on: "object"; readonly object: string; readonly at?: readonly [number, number, number] };
```

- `anchorFrame(anchor, core)` gives a point and the direction out of the surface, or a finding.
- `checkAnchor(anchor, core)` gives the findings: the wall or the object is not in the room, the point is out of the wall, or the point is in an opening.
- The wall anchor is the outlet of today without its circuit. The checks `outlet-wall`, `outlet-range` and `outlet-in-opening` become the anchor checks `anchor-wall`, `anchor-range` and `anchor-in-opening`.

### Layers

A layer is the records of one add-on. The core keeps the layers of a scene, and it does not read them.

```ts
interface Scene {
  readonly schema: "scene/2";
  readonly room: Room;
  readonly objects?: readonly PlacedObject[];
  /** The records of each add-on, by the schema name of the add-on, for example `electrical/1`. */
  readonly layers?: Readonly<Record<string, unknown>>;
}
```

- The core keeps each layer when it reads and writes a scene, also a layer of an add-on that it does not know.
- `Room` loses `outlets` and `circuits`. `Scene` loses `loads`. `PlacedObject` loses `outlet`.
- The record names become `room/2` and `scene/2`.

### The add-on contract

An add-on is a value of this type. The core and the hosts know only this type.

```ts
interface AddOn<Layer> {
  /** The schema name of the layer, for example `electrical/1`. */
  readonly schema: string;
  /** This function reads the JSON of a layer. It gives the layer, or the findings. */
  readonly parse: (value: unknown) => ParseResult<Layer>;
  /** This function gives the anchors of the records, by the `id` of each record. */
  readonly anchors: (layer: Layer) => ReadonlyMap<string, Anchor>;
  /** This function gives the findings of the meaning of the layer. The anchor checks are in the core. */
  readonly check: (layer: Layer, space: SceneSpace) => readonly Finding[];
}

/** The marks of one add-on. This value is in the entry `/marks` of the add-on, so the root entry has no visual part. */
interface AddOnMarks<Layer> {
  readonly schema: string;
  readonly marks: (layer: Layer, space: SceneSpace) => readonly Mark[];
}
```

- `SceneSpace` is the read view of the core: the walls, the floors, the objects and `anchorFrame`.
- A host with no viewer, for example a command-line tool, imports only the root entry of each add-on.
- A finding of an add-on has the code `<add-on>/<code>`, for example `electrical/circuit-limit`.
- A host composes a list of add-ons: `checkScene(scene, [electrical, light])` runs the core checks, the anchor checks and the checks of each add-on.
- An unknown layer gives a warning, and the scene keeps it.

### Two add-ons on one object

A lamp is a placed object of the core. The electrical layer has a load on it, and a light layer has a light source on it. Each layer names the lamp by its `id`. An add-on that needs two topics, for example light for each watt, is a third package that depends on both.

## The marks

A mark is a record that a viewer draws. A mark has no topic. The marks are in `@mark1russell7/visuals`, with an entry that imports no three.js, so an add-on depends only on data.

| Mark | Data | Example |
| --- | --- | --- |
| A point | An anchor frame, a shape, a level and a label | An outlet, a tap, a lamp |
| A run | A list of points along surfaces, a width and a level | A cable, a pipe, a duct |
| A link | Two record ids and a level | A power line from an outlet to a computer |
| A field | A grid of values on a floor, and a scale | Light in lux, sound in decibels, heat |
| A meter | A value, a limit and a label | The load of a circuit against its limit |

- The level of a mark is `unknown`, `ok`, `near` or `over`. Each level has a shape and a color, so a mark does not use color alone. The shapes of the levels move from `loads.ts` to the marks.
- A plan view and a 3D view draw the same marks.

## The electrical add-on

The first add-on is a package in this repository: `@mark1russell7/electrical`, in `packages/electrical`.

- The root entry is the model, with no browser part: circuits, breakers, outlets, loads, the continuous-load check and the formulas. The amounts have units from `@mark1russell7/quantity`.
- The entry `/marks` maps the records to the marks of `@mark1russell7/visuals`.
- `@mark1russell7/cluster-design` imports the root entry for the load of each circuit. It does not keep a copy.

```ts
interface ElectricalLayer {
  readonly schema: "electrical/1";
  readonly outlets?: readonly { readonly id: string; readonly anchor: Anchor; readonly circuit?: string }[];
  readonly circuits?: readonly { readonly id: string; readonly name?: string; readonly breaker?: number; readonly voltage?: number; readonly limit: number }[];
  /** The power of each object, by the `id` of the object and of its outlet. */
  readonly feeds?: readonly { readonly object: string; readonly outlet: string }[];
  readonly loads?: readonly { readonly circuit: string; readonly watts: number }[];
}
```

- The checks: an unknown circuit, an unknown outlet, an unknown object, a load that is not a positive number, and a circuit over its limit.
- The formulas: the limit of a circuit and the load of each circuit are Vex programs of this package. They move here from `cluster-design`.
- The marks: a point for each outlet, a link for each feed, and a meter for each circuit.
- The form: the outlets of each wall and the list of circuits. The site gets them from the add-on, not from the core.

## The form of the site

The form "Measure a room" gets its topic fields from the add-ons.

- A feature of a wall has a kind from the core (door, window, gap) or from an add-on (an outlet).
- The store keeps the drafts of each add-on by its schema name.
- The store of the browser stays. The page reads the old store and moves its outlets and its circuits to the electrical draft. A person loses no number.

## The procedures package

Two procedures packages wrap this API, in the monorepo of the universal client: `@procedures/room-view` and `@procedures/electrical`. Their procedures are JSON in and JSON out:

- `room.expand`: a survey or a level gives a scene.
- `room.check`: a scene and a list of add-ons give the findings.
- `room.marks`: a scene and a list of add-ons give the marks.
- `electrical.limit`: a breaker and a voltage give the limit of a circuit.
- `electrical.loads`: an electrical layer gives the load of each circuit against its limit.

## The versions

R7 changes the public API, so `@mark1russell7/room-view` goes to 0.2.0. Before 1.0.0, a break raises MINOR.

- `room/1` and `scene/1` stay readable. `fromSceneV1` of the electrical add-on gives a `scene/2` and an electrical layer.
- The core rejects `outlets` in a `room/2` with a finding that names `fromSceneV1`.

## The steps

1. This design, and a review of the marks by the maintainer of `@mark1russell7/visuals`.
2. The core: anchors, layers, the add-on contract, `room/2` and `scene/2`.
3. The electrical add-on, with `fromSceneV1`. The tests of the electrical checks move with it.
4. `cluster-design` imports the circuit math from `@mark1russell7/electrical`, and it removes its copy.
5. The site: the form and the store get the topic fields from the add-ons.
6. The viewer draws marks from `@mark1russell7/visuals`.
7. The procedures packages.

## The open questions

- A run along two walls and a ceiling needs a path of anchors. The first version has runs on one surface.
- A scene with many add-ons needs one order of their marks in the picture. The first version draws the layers in the order of the list of the host.
