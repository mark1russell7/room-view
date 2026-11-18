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
  /** This optional function gives one layer from the parts of a level. The section about a survey and a level tells its rules. */
  join?(parts: readonly LayerPart<Layer>[]): Layer;
}

/** The marks of one add-on. This value is in the entry `/marks` of the add-on, so the root entry has no visual part. */
interface AddOnMarks<Layer> {
  /** The name of the layer. It is the `schema` of the add-on that reads the layer. */
  readonly schema: string;
  /** This function gives the marks of a layer, in the space of the frames. */
  marks(layer: Layer, space: SceneSpace): readonly Mark[];
}

/** This function gives the marks of the layers of a scene. It is in the entry `/marks` of the core. */
function layerMarks(scene: Scene, addOns: readonly AddOn<unknown>[], marks: readonly AddOnMarks<unknown>[]): readonly Mark[];
```

- `SceneSpace` is the read view of the core: the walls, the objects, their transforms and the frame of each anchor.
- A host with no viewer, for example a command-line tool, imports only the root entry of each add-on.
- A host composes a list of add-ons. `checkScene(scene)` examines the core, and `checkLayers(scene, [electrical, light])` examines the layers.
- `checkLayers` gives the faults of the form of each layer, of each anchor and of the meaning of its records.
- A finding of a layer has the name of the layer in `layer`. Thus an add-on gives its own codes.
- The name of a layer is a word, a slash and a version, for example `electrical/1`. A layer with a different name gets an error.
- An unknown layer gives a warning, and the scene keeps it.
- `layerMarks` is in the entry `@mark1russell7/room-view/marks`. The add-on of the same name reads each layer, and its `AddOnMarks` value gives the marks.
- The marks are in the order of the layer names, then of the record names. Thus equal inputs give equal marks.
- A layer with a fault of its form gives no marks, and `checkLayers` tells the fault.
- The function `marks` is a method, as the functions of `AddOn` are. Thus one list holds the marks values of different layers.

`recordName(kind, id)` gives one name for each record, for example `object:desk` or `electrical/1:o1`. The kind of a record of a layer is the name of the layer. A finding, a mark and the selection use this name, so a click on a finding selects its mark.

### The layers of a survey and of a level

A survey and a level are the files that a person writes. Each has the optional field `layers`, in the format of the layers of a scene.
`expandSurvey` and `expandLevel` carry the layers to the room record.

```ts
interface Survey {
  // The sides, the openings and the objects are above this field.
  /** The records of each add-on. Their anchors name the sides and the objects of the survey. */
  readonly layers?: Readonly<Record<string, unknown>>;
}

interface Level {
  // The rooms and the connections are above this field.
  /** The records of each add-on for the level. Their anchors are on the room record of the level. */
  readonly layers?: Readonly<Record<string, unknown>>;
}

/** One part of the layers of a level, for the function `join` of an add-on. */
interface LayerPart<Layer> {
  /** The `id` of the room of the layer. The layer of the level record has no room. */
  readonly room?: string;
  readonly layer: Layer;
  /** This function gives the name in the level of a record of the part, from its `id` in the part. */
  readonly name: (id: string) => string;
}
```

An anchor of a survey is in the space of the survey:

- An anchor on a wall names a side. Its `offset` starts at the first corner of the side, and it goes along the inner face.
- A point on the floor or on the ceiling is in the frame of the walk. The first corner is the origin, and the first side goes along the x axis.
- An anchor on an object names an object of the survey.

`expandSurvey(survey, { addOns })` gives the layers on the room record in `layers`, and the place of the walk in `frame`:

- `surveyAnchor(anchor, frame)` moves one anchor to the room record. A wall anchor gets the face in the room.
- The `offset` of a wall anchor changes in the proportion of its side, as an opening does. Thus a record stays at its place when the walk has a gap.
- The core reads no layer. `moveLayers` changes each anchor through the functions `anchors` and `withAnchors` of the add-on of the layer.
- A layer with no add-on in the list is not in the result, because its anchors are in the space of the survey.
  `layerFindings` of the result tells each such layer, with the codes `layer-name`, `layer-unknown` and `layer-form`.
- `convertSurvey(survey, unit, addOns)` changes the lengths of each anchor with `scaleAnchor`. An add-on keeps each different length of its layer in a fixed unit.
- `resultScene(result)` gives the scene of a result. `checkScene` and `checkLayers` examine it, and `layerMarks` gives its marks.

A level has the layers of each room in the survey of the room. The level record has the layers of the level, for example the circuits of an apartment.

- `expandLevel(level, { addOns })` moves each anchor of a room in one change: the unit, the place of the room, then the names of the level.
- A wall and an object of a room get the name `roomName(room, id)`, for example `kitchen/s0`. The floor of a room has the `id` of the room.
- The function `join` of an add-on then gives one layer from the parts: the layer of the level record, then the layer of each room.
- `layerPart(layer, room)` makes a part. Its function `name` has the rule of `roomName`, so an add-on does not write that rule again.
- A record of a room gets the name that its part gives. Each `id` of the layer that names such a record or a placed object gets it too.
- A record that the rooms share keeps its `id`, for example a circuit of an apartment. The first record of an `id` stays.
- An add-on with no function `join` gives a finding for the layer of each room, and the layer of the level record stays as it is.
- A layer that only the level record has stays as it is, because its anchors are on the room record of the level already.

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
| A meter | A value, the text of the unit, and a limit when there is one | The load of a circuit against its limit |

- Each mark has a record name (`recordName`), a kind, a level and a label. The kind is a word of the add-on, for example `outlet`, for the legend and the filter.
- The level of a mark is `unknown`, `ok`, `near` or `over`. The add-on calculates the level, so `visuals` has no rule from a value to a level.
- A mark has no shape and no color. The scale gives each level its shape, and the theme gives its color. Thus a mark does not use color alone.
- Each point of a mark is in the space of the frames: meters, with the z axis up. Each point of a run has its own direction, so a run can cross surfaces.
- A field has its values row by row, with `null` for a cell with no value. JSON has no NaN.
- A meter has no place. The page draws it in a panel, and the 3D view ignores it.
- A meter can have no limit: the mark then has no `limit`, and a page shows only the value and the unit.
  The check of its add-on tells a record with no limit.
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
- The marks: a point for each outlet, a link for each feed, and a meter for each circuit. The meter of a circuit with no limit has no `limit`.
  A link goes from its outlet to the center of its placed object. A record with no place gives no mark.
- The form: `ELECTRICAL_FORM` of the entry `/form` has the circuits, the outlets of the walls and the power of each object. The site gets them from the add-on, not from the core.
- The layer of a level: `joinElectrical` is the function `join` of the add-on. An outlet and a feed get the name of their room, for example `kitchen/o1`.
  A circuit keeps its `id`, because one circuit gives power to outlets in more than one room.
- `fromSceneV1` moves the electrical records of a `scene/1` to a layer: the outlets, the circuits, the loads and the outlet of each object. The loads of a circuit become its `otherLoad`.
- `fromSurveyV1` and `fromLevelV1` move the old electrical records of a `survey/1` and of a `level/1` to layers.
  A circuit keeps its `id`, so an outlet of a different room names it.

## The form of the site

The form "Measure a room" gets its topic fields from the add-ons. The page has no code of a topic.

### The form of a layer

An add-on gives the form of its layer as data, a `LayerForm` of the core. A page makes its inputs from this data.

```ts
interface LayerForm {
  /** The name of the layer, for example `electrical/1`. */
  readonly schema: string;
  /** The collections of the layer, in the sequence of a page. */
  readonly collections: readonly FormCollection[];
}

interface FormCollection {
  /** The field of the layer that has the records, for example `circuits`. */
  readonly name: string;
  /** The word of one record for its `id`. For example, `circuit` gives `circuit-1`. */
  readonly word: string;
  /** The name of one record and the title of the records in a page. */
  readonly label: string;
  readonly title: string;
  /** The surfaces of the anchor of a record. A collection with no surfaces has records with no place. */
  readonly on?: readonly AnchorSurface[];
  /** The usual height of a record on a wall, in meters, for each system of units. */
  readonly height?: FormUsual;
  readonly fields: readonly FormField[];
  /** The text field that gives the words of the `id` of a record. */
  readonly idFrom?: string;
  /** The necessary field that names the owner of a record, and the largest number of records of one owner. */
  readonly owner?: string;
  readonly most?: number;
}
```

- A record of a layer has its `id`, its `anchor` when it has a place, and one value for each field. The electrical layer has this shape.
- A field has a kind: a text, a number in a fixed unit, the `id` of a record of the same layer, or the `id` of a placed object.
- A number field can have a usual value for each system of units, `metric` and `imperial`. A record with no value gets the usual value.
- A collection tells its place in a page. A collection with surfaces is on the walls, and a collection with an owner is with its owner.
  Each other collection is a list of the level.
- `formLayer` makes the layer from the records of a form. It is total: a record that the layer cannot have is not in the layer.
- `formRecords` gives the records of a form from a layer. Its value `more` tells that the layer has data that the form does not keep.
- The option `outside` of the two functions gives the ids of the records outside the layer that a field can name.
  For example, the outlet of a room of a level names a circuit of the layer of the level record.
- `checkForm` gives the faults of a form. The test of an add-on examines its form with this function.
- The form is in the entry `/form` of the add-on, so the root entry has no text of a page.
- The read-out of a record comes from the marks of the add-on. For example, the meter of a circuit gives its limit.

### The store of the page

- A feature of a wall has a kind from the core (door, window, gap) or from an add-on. A feature of an add-on names the layer and the collection of its form.
- The points of an add-on stay in the list of the features of their wall. Thus the sequence of a wall stays, and a wall that goes away takes its points.
- The store keeps the lists of the level of each add-on by the name of its layer, for example the circuits.
- A placed object keeps the records that it owns by the name of the layer, for example its power.
- The store of the browser stays. The page reads the store of version 1, and it moves its outlets, its circuits and the outlet of each object. A person loses no number.
- The page reads and writes the records of each add-on from its form: points of a wall, records of an object and lists. That code names no topic.

A survey and a level do not have layers before step 6. Until then, an add-on of the page can have a bridge.
The bridge changes the records of the form to the fields of a survey and of a level, and back. The electrical add-on has the only bridge, in one file.
The bridge goes away in step 6, when a survey and a level get layers.

### The inputs of the page

The page makes each input of an add-on from its form. The functions are in `inputs.ts` of the site. They are pure, so their tests need no browser.

- A text field and a number field have an input each. A number has its unit and the usual value of the system of units.
- A field that names a record of a list is a choice of the records of that list.
- A field that names a point is a choice of the points of the room.
- A collection on the walls gives a kind of feature of a wall. Its records get the fields of the form below their distances.
- A collection with an owner gives fields in the box "More" of a piece of furniture.
- Each other collection is a list. A list has a section below the walls, with the title of its collection and a button that adds a record.
- The sentences of the page that name a collection come from the forms, for example the button "Add doors, windows or outlets".
- A record with a number that its form does not accept shows the sentence of the form for that field.
- A record of a list tells the records of the rooms that name it, for example "3 outlets in 2 rooms use this circuit."

A form has no sentences of help. Thus an add-on of the page can give them, as data:

- the sentences below the title of a list, and the text of the button that adds a record
- steps at the end of the help of the page
- a sentence about a good record of a list, for example the limit of a circuit

The code of the page names no topic. The electrical topic is in four files of the site:

- `electrical.ts` has the add-on of the page: the form, the sentences of help and the bridge.
- `store-v1.ts` reads the store of version 1 of the browser.
- `draft.ts` has the example room, with an outlet and the power of a rack.
- `electrical.fixture.ts` has functions for the tests.

The inputs have three limits:

- A piece of furniture has one record of a collection, also when the form permits more. No add-on needs more at this time.
- The plural of the word of a collection is the word with an `s`. A word with a different plural needs a new field in the form.
- An add-on of the page can hide a field. The electrical add-on hides the power of a piece of furniture, because a survey has no field for it.
  The hidden fields go away with the bridge, in step 6.

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

Step 2 adds to the public API, so it is a PATCH: before 1.0.0, a feature raises PATCH, and a break raises MINOR.
`@mark1russell7/visuals` 0.3 makes the limit of a meter optional.
The type of a mark is in the public API of the core and of the electrical add-on, so the two packages are 0.2.0 on that version.
The meter with no limit changes the marks that `electricalMarks` gives, so `@mark1russell7/electrical` goes to 0.3.0.
The form of a layer is a feature of the core and of the add-on. Thus `@mark1russell7/room-view` goes to 0.2.2, and `@mark1russell7/electrical` goes to 0.3.2.
The layers of a survey and of a level are a feature of the core and of the add-on, and they remove nothing.
Thus `@mark1russell7/room-view` goes to 0.2.3, and `@mark1russell7/electrical` goes to 0.3.3.
The ids outside a layer in the form are a feature of the core. The move of an old survey and of an old level is a feature of the add-on.
Thus `@mark1russell7/room-view` goes to 0.2.4, and `@mark1russell7/electrical` goes to 0.3.4.
The last part of step 6 removes records from the public API, so `@mark1russell7/room-view` then goes to 0.3.0.

- `room/1` and `scene/1` stay readable. `fromSceneV1` of the electrical add-on gives the electrical layer of a `scene/1`. Step 6 adds the move of the scene to `scene/2`.
- A page can read the old electrical records of a `survey/1` and of a `level/1`: `fromSurveyV1` and `fromLevelV1` of the electrical add-on give their layers.
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
   The viewer of the entry `/three` is on the stage and the markers of that package (`@mark1russell7/room-view` 0.2.1). Its option `marks` takes the marks of the layers.
   With no list of marks, the viewer makes the marks of the outlets of a `scene/1`, until step 6 removes them.
   The core has the form of a layer, and the electrical add-on gives its form in its entry `/form` (`@mark1russell7/room-view` 0.2.2, `@mark1russell7/electrical` 0.3.2).
   Then the store of the page keeps the records of each add-on, and the page makes its inputs from the forms.
6. The layers go into the files of a person, in three parts. First, a survey and a level get the field `layers`, and the core carries the layers to the room record.
   This part is a feature (`@mark1russell7/room-view` 0.2.3, `@mark1russell7/electrical` 0.3.3).
   Then the page writes the records of each add-on as layers, and the viewer of the page draws the marks of the layers.
   For this part, the form keeps a field that names a record outside its layer (`@mark1russell7/room-view` 0.2.4).
   The electrical add-on moves the old records of a survey and of a level to layers (`@mark1russell7/electrical` 0.3.4).
   Last, the core removes `outlets`, `circuits`, `loads` and `PlacedObject.outlet`, also from a survey and from a level.
   It gives `room/2`, `scene/2`, `survey/2` and `level/2`. This part is the break of the version.
7. The procedures packages.

## The answers of the review

- A run along two walls and a ceiling is a list of frames, so it needs no new format.
- Two marks at one point: the 3D view draws the levels in sequence, so the worst level is always in view.
