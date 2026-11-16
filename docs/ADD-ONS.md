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
  | { readonly on: "ceiling"; readonly at: PlanPoint; readonly floor?: string }
  | { readonly on: "object"; readonly object: string; readonly at?: readonly [number, number, number]; readonly out?: readonly [number, number, number] };
```

- `sceneSpace(scene)` gives the space of a scene. Its function `frame(anchor)` gives the point and the direction out of the surface, or `undefined`.
- A frame is in meters, with the z axis up, as the solids. An object anchor with no point is at the center of the top, with the direction up.
- `anchorSchema` of the entry `/schema` examines the form of an anchor. The schema of an add-on uses it for each record.
- `checkAnchor(anchor, space)` gives the faults of an anchor. An error tells that the anchor has no position: its wall or object is not in the room, or its point is out of range. A warning tells a point in an opening.
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
  /** The name of the layer, for example `electrical/1`. */
  readonly schema: string;
  /** This function reads the JSON of a layer. It gives the layer, or the faults of its form. */
  parse(value: unknown): LayerParse<Layer>;
  /** This function gives the anchors of the records, by the `id` of each record. */
  anchors(layer: Layer): ReadonlyMap<string, Anchor>;
  /** This function gives the layer with new anchors. The core uses it when it moves the records of a room. */
  withAnchors(layer: Layer, anchors: ReadonlyMap<string, Anchor>): Layer;
  /** This function gives the faults of the meaning of the layer. The anchor checks are in the core. */
  check(layer: Layer, space: SceneSpace): readonly AddOnFault[];
}

/** The marks of one add-on. This value is in the entry `/marks` of the add-on, so the root entry has no visual part. */
interface AddOnMarks<Layer> {
  readonly schema: string;
  readonly marks: (layer: Layer, space: SceneSpace) => readonly Mark[];
}
```

- `SceneSpace` is the read view of the core: the walls, the objects, their transforms and the frame of each anchor.
- A host with no viewer, for example a command-line tool, imports only the root entry of each add-on.
- A host composes a list of add-ons. `checkScene(scene)` examines the core, and `checkLayers(scene, [electrical, light])` examines the layers.
- `checkLayers` gives the faults of the form of each layer, of each anchor and of the meaning of its records.
- A finding of a layer has the name of the layer in `layer`. Thus an add-on gives its own codes.
- The name of a layer is a word, a slash and a version, for example `electrical/1`. A layer with a different name gets an error.
- An unknown layer gives a warning, and the scene keeps it.

`recordName(kind, id)` gives one name for each record, for example `object:desk` or `electrical/1:o1`. The kind of a record of a layer is the name of the layer. A finding, a mark and the selection use this name, so a click on a finding selects its mark.

### Two add-ons on one object

A lamp is a placed object of the core. The electrical layer has a load on it, and a light layer has a light source on it. Each layer names the lamp by its `id`. An add-on that needs two topics, for example light for each watt, is a third package that depends on both.

## The marks

A mark is a record that a viewer draws. A mark has no topic. The marks are in `@mark1russell7/visuals`, with an entry that imports no three.js, so an add-on depends only on data.

| Mark | Data | Example |
| --- | --- | --- |
| A point | A frame and a size | An outlet, a tap, a lamp |
| A run | A list of frames and a width | A cable, a pipe, a duct |
| A link | Two ends, each with a record name and a point | A power line from an outlet to a computer |
| A field | A grid of values on a plane, and a scale | Light in lux, sound in decibels, heat |
| A meter | A value, a limit and the text of the unit | The load of a circuit against its limit |

- Each mark has a record name (`recordName`), a kind, a level and a label. The kind is a word of the add-on, for example `outlet`, for the legend and the filter.
- The level of a mark is `unknown`, `ok`, `near` or `over`. The add-on calculates the level, so `visuals` has no rule from a value to a level.
- A mark has no shape and no color. The scale gives each level its shape, and the theme gives its color. Thus a mark does not use color alone.
- Each point of a mark is in the space of the frames: meters, with the z axis up. Each point of a run has its own direction, so a run can cross surfaces.
- A field has its values row by row, with `null` for a cell with no value. JSON has no NaN.
- A meter has no place. The page draws it in a panel, and the 3D view ignores it.
- The entry `@mark1russell7/visuals/marks` has the types, the levels, their shapes and `checkMarks`, with no three.js. The shapes move from `loads.ts` to that entry.
- A plan view and a 3D view draw the same marks.

## The electrical add-on

The first add-on is a package in this repository: `@mark1russell7/electrical`, in `packages/electrical`.

- The root entry is the model, with no browser part: the records of the layer, its checks and the formulas. It imports no zod.
- The entry `/schema` has the zod schema of the layer. The entry `/add-on` has the add-on value for the contract of the core.
- The entry `/marks` maps the records to the marks of `@mark1russell7/visuals`.
- `@mark1russell7/cluster-design` imports the formulas of the root entry. It does not keep a copy.

```ts
interface ElectricalLayer {
  readonly schema: "electrical/1";
  readonly outlets?: readonly { readonly id: string; readonly anchor: Anchor; readonly circuit?: string }[];
  readonly circuits?: readonly {
    readonly id: string;
    readonly name?: string;
    readonly breaker?: number;
    readonly voltage?: number;
    readonly limit?: number;
    readonly otherLoad?: number;
  }[];
  /** The power of a placed object from an outlet. */
  readonly feeds?: readonly { readonly id: string; readonly object: string; readonly outlet: string; readonly watts?: number }[];
}
```

- Each record of the layer has an `id`, and the ids of one layer are unique. Thus `recordName("electrical/1", id)` names one record.
- An outlet can be on a wall, on a floor or on an object, for example a power strip on a desk.
- The units are fixed: a breaker in amperes, a voltage in volts, and a limit and a load in watts.
- `@mark1russell7/quantity` has no product of two amounts. Thus a formula cannot give watts from volts and amperes with units.

The formulas are Vex programs of this package. They move here from `cluster-design`:

- The limit of a circuit is its `limit`, or its voltage times its breaker times the continuous part, 80% by default.
- A circuit with a `limit`, a breaker and a voltage gets a warning when the two limits are not equal.
- The load of a circuit is the sum of the watts of the feeds from its outlets, plus its `otherLoad`.
- The level of a circuit is the level of its known load: `over` above its limit, `near` from 80% of its limit, or `ok`.
- The level is `unknown` when no load of the circuit has watts, or when the circuit has no limit above 0.
- A feed with no watts adds nothing to the load. The state of the circuit names it in `missing`, because the true load can be above the known load.

The programs evaluate over a tree, which `electricalSpace` makes from a layer. A circuit has its outlets and its other load, and an outlet has its feeds.

- `ratedLimit`, `loadCurrent`, `loadRatio` and `ratioLevel` build general programs. They read no field, so `cluster-design` uses them with its own records.
- `CIRCUIT_LIMIT`, `CIRCUIT_LOAD`, `CIRCUIT_RATIO` and `CIRCUIT_LEVEL` are programs of a circuit. They evaluate at the node of the circuit in the tree.
- `circuitStates` gives the state of each circuit from these programs. It has no second copy of the math.

The add-on also has these parts:

- The checks find a duplicate `id`, an unknown circuit, outlet or object, and a number that is not valid. They also find a circuit with no limit or over its limit.
- The marks: a point for each outlet, a link for each feed, and a meter for each circuit.
- The form: the outlets of each wall and the list of circuits. The site gets them from the add-on, not from the core.
- `fromSceneV1` moves the electrical records of a `scene/1` to a layer: the outlets, the circuits, the loads and the outlet of each object. The loads of a circuit become its `otherLoad`.

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

The input names the add-ons in the field `addOns`, a list of schema names: `{ "scene": {}, "addOns": ["electrical/1"] }`.

- The list has no duplicates, and its order has no effect. An unknown name is a validation error that names it.
- The output lists the findings and the marks by add-on, then by `id`. Thus equal inputs give equal JSON.
- Each procedure reads nothing and writes nothing.

## The versions

Step 2 adds to the public API, so it is a PATCH: before 1.0.0, a feature raises PATCH. Step 6 removes records from the public API, so `@mark1russell7/room-view` goes to 0.2.0: before 1.0.0, a break raises MINOR.

- `room/1` and `scene/1` stay readable. `fromSceneV1` of the electrical add-on gives the electrical layer of a `scene/1`. Step 6 adds the move of the scene to `scene/2`.
- `@mark1russell7/electrical` starts at 0.1.0. It depends on the core of this workspace, so a new version of the core gives a new version of the add-on.
- The core rejects `outlets` in a `room/2` with a finding that names `fromSceneV1`.

## The steps

The first steps add, and the last step removes. Thus each step keeps the page and the viewer in operation, and no step waits for a different step of a different maintainer.

1. This design, and a review of the marks by the maintainer of `@mark1russell7/visuals`.
2. The core adds anchors, layers and the add-on contract. `Scene.layers` is a new optional field, so `scene/1` stays valid. This step is a feature, and it removes nothing.
3. The electrical add-on, with `fromSceneV1` and the circuit math. The electrical checks have their tests in the add-on, and the core checks of outlets stay until step 6.
4. `cluster-design` imports the circuit math from `@mark1russell7/electrical`, and it removes its copy.
5. The site, in two parts. First, the site reads the limit of a circuit and the levels from `@mark1russell7/electrical`, and it does not import `cluster-design`.
   Then the form and the store get the topic fields from the add-ons. The viewer draws marks from `@mark1russell7/visuals`, in the move of the viewer to that package.
6. The core removes `outlets`, `circuits`, `loads` and `PlacedObject.outlet`, and it gives `room/2` and `scene/2`. This step is the break of the version.
7. The procedures packages.

## The answers of the review

- A run along two walls and a ceiling is a list of frames, so it needs no new format.
- Two marks at one point: the 3D view draws the levels in sequence, so the worst level is always in view.
