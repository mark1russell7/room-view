# @mark1russell7/room-view

The room format, the scene format, the survey format and the 3D model of a room. A room is measurements, and the code makes the model from them.

The entry `/three` shows the model in a page with three.js. [The demo page](https://mark1russell7.github.io/room-view/) shows a sample room.

## Install

```sh
npm install @mark1russell7/room-view
```

The entry `/three` needs the package `three`, version 0.187.0 or later. The other entries do not need it.

## A room is measurements

A tape measure gives the length of each wall, the position of each door and the height of each window. The room record keeps these numbers, in the unit of the tape measure.

```ts
import { checkRoom, roomSolids, type Room } from "@mark1russell7/room-view";

const room: Room = {
  schema: "room/1",
  unit: "ft",
  height: 8,
  wallThickness: 0.4,
  walls: [
    { id: "south", from: [0, 0], to: [12, 0], side: "right" },
    { id: "east", from: [12, 0], to: [12, 10], side: "right" },
    { id: "north", from: [12, 10], to: [0, 10], side: "right" },
    { id: "west", from: [0, 10], to: [0, 0], side: "right" },
  ],
  openings: [{ id: "door", wall: "south", kind: "door", offset: 1, width: 3, height: 6.8 }],
  floors: [
    {
      id: "floor",
      ring: [
        [0, 0],
        [12, 0],
        [12, 10],
        [0, 10],
      ],
    },
  ],
};

checkRoom(room); // => []
roomSolids(room); // => the floor, and the parts of each wall around the door
```

- A **wall** is a straight line in the plan, with a thickness and a height. The field `side` tells which side of the line has the wall.
- An **opening** is a door, a window or a gap in a wall.
- A **floor** is one area of the plan.
- An **outlet** is a point on a face of a wall. A **circuit** gives power to outlets, and it has a limit in watts.

A scene is one room with its placed objects and the loads of its circuits. A placed object is a box: a desk, a rack, a computer. An object can have a parent, and then its position is relative to the parent.

## A survey: the room from a tape measure

A person with a tape measure does not know the coordinates of a corner. The person knows the length of each wall and the turn at each corner. A survey record keeps these numbers, in the sequence of a walk around the room.

```ts
import { checkRoom, expandSurvey, type Survey } from "@mark1russell7/room-view";

const survey: Survey = {
  schema: "survey/1",
  unit: "ft",
  height: 8,
  wallThickness: 0.4,
  sides: [
    { id: "south", length: 12, turn: "left" },
    { id: "east", length: 10, turn: "left" },
    { id: "north", length: 12.1, turn: "left" },
    { id: "west", length: 10, turn: "left" },
  ],
  checks: [{ id: "diagonal", from: "south", to: "north", length: 15.7 }],
  openings: [{ id: "door", wall: "south", kind: "door", offset: 1, width: 3, height: 6.8 }],
};

const { room, closure, checks } = expandSurvey(survey);
closure.closed; // => true: the walk ends 0.1 ft from its start, and the limit is 1 % of its length
room.walls[0]; // => { id: "south", from: [0, 0], to: [12.05, 0], side: "right" }, with rounded numbers
checks[0]?.difference; // => 0.04: the measured diagonal is 0.04 ft longer than the diagonal of the room record
checkRoom(room); // => []
```

- A **side** is the inner face of one wall, from a corner to the next corner.
- A **turn** is `left` or `right` at a square corner, or a measured angle in degrees. The turns `left` and `right` are exact.
- A measured length has an error, so the walk does not end exactly at its start. `closure` tells the gap.
- `expandSurvey` shares a small gap between the sides. A room with square corners keeps its square corners.
- A walk with a mistake is not closed, for example a walk with a wrong turn. Its room has the walls of the walk and no floor, so a drawing shows the mistake.
- A **check** is a measured distance between two corners, for example a diagonal. The result has its difference from the room record.
- An opening and an outlet give their `offset` from the first corner of their side, as the tape measure shows it.
- A side that shares the gap changes its length. Its openings and its outlets keep their place: each `offset` and each `width` changes in the same proportion.

The walk goes along the inner faces, so each wall is on the outer side of its line. A survey has one room. A wall in the middle of a room is not a side of the walk, for example the short wall of a nook. Add such a wall to the room record.

### The objects of a survey

A person measures a desk or a rack from a wall. A survey can have these measurements as objects, and the result has a placed object for each of them.

```ts
import { checkScene, expandSurvey, type Scene, type Survey } from "@mark1russell7/room-view";

const survey: Survey = {
  schema: "survey/1",
  unit: "m",
  height: 2.5,
  wallThickness: 0.15,
  sides: [
    { id: "south", length: 4, turn: "left" },
    { id: "east", length: 3, turn: "left" },
    { id: "north", length: 4, turn: "left" },
    { id: "west", length: 3, turn: "left" },
  ],
  objects: [
    { id: "desk", kind: "desk", wall: "north", offset: 1, width: 1.6, depth: 0.8, height: 0.75 },
    { id: "display", kind: "display", on: "desk", offset: 0.5, width: 0.6, depth: 0.2, height: 0.4, gap: 0.1 },
  ],
};

const { room, objects } = expandSurvey(survey);
objects[0]; // => { id: "desk", kind: "desk", size: [1.6, 0.8, 0.75], at: [2.2, 2.6], turn: 180 }, with rounded numbers
objects[1]; // => { id: "display", kind: "display", size: [0.6, 0.2, 0.4], at: [0, -0.2], lift: 0.75, parent: "desk" }, with rounded numbers
const scene: Scene = { schema: "scene/1", room, objects };
checkScene(scene); // => []
```

- An **object** is a box. `wall` names its side, and `offset` is the distance along the face from the first corner of the side to the object.
- `width` goes along the wall, and `depth` goes out from the wall. `gap` is the distance from the face to the back of the object.
- The back of an object is against its wall, so the object gets the turn of its wall.
- An object with `on` is on a different object or in it. That object is its **holder**: a desk for a display, a rack for a computer.
- With a holder, `offset` and `gap` start at the edge and the back of the holder. The holder becomes the parent of the placed object.
- `lift` is the height of the bottom above the floor. With a holder, the default is the top of the holder.
- `outlet` names the outlet that gives power to the object.
- An object keeps its size on a side that shares the gap. Only its place changes.
- An object with no place is not in the result. For example, its side is not in the survey, or a size is not above 0.

## A level: the rooms of an apartment

A survey has one room, with its own first corner. A level record has the survey of each room, and the connections between the rooms. A connection is one hole through a wall, for example a door. A person measures the hole in each of its two rooms, so each survey has it as an opening.

```ts
import { checkRoom, expandLevel, type Level, type Survey } from "@mark1russell7/room-view";

const hall: Survey = {
  schema: "survey/1",
  name: "Hall",
  unit: "m",
  height: 2.5,
  wallThickness: 0.15,
  sides: [
    { id: "south", length: 4, turn: "left" },
    { id: "east", length: 1.2, turn: "left" },
    { id: "north", length: 4, turn: "left" },
    { id: "west", length: 1.2, turn: "left" },
  ],
  openings: [{ id: "to-study", wall: "east", kind: "door", offset: 0.2, width: 0.8, height: 2.05 }],
};
const study: Survey = {
  schema: "survey/1",
  name: "Study",
  unit: "m",
  height: 2.5,
  wallThickness: 0.15,
  sides: [
    { id: "south", length: 3, turn: "left" },
    { id: "east", length: 3, turn: "left" },
    { id: "north", length: 3, turn: "left" },
    { id: "west", length: 3, turn: "left" },
  ],
  openings: [{ id: "to-hall", wall: "west", kind: "door", offset: 1.1, width: 0.8, height: 2.05 }],
};

const level: Level = {
  schema: "level/1",
  unit: "m",
  rooms: [
    { id: "hall", survey: hall },
    { id: "study", survey: study },
  ],
  connections: [{ id: "door", from: { room: "hall", opening: "to-study" }, to: { room: "study", opening: "to-hall" }, thickness: 0.1 }],
};

const { room, rooms, connections } = expandLevel(level);
rooms[1]?.survey.start; // => [4.1, -0.9]: the door gives the place of the study
connections[0]?.fits; // => true
room.walls[4]?.id; // => "study/south"
room.floors?.map((floor) => floor.name); // => ["Hall", "Study"]
checkRoom(room); // => []
```

- The first room keeps the `start` and the `heading` of its survey. Each other room gets its place from a connection.
- The two walls of a connection are back to back, and the centers of the two openings are opposite.
- `thickness` is the thickness of the wall at the hole, as a person measures it in the frame of a door. The default is the thickness of the wall of `from`.
- A connection between two rooms that have a place examines the measurements. Its `gap` and its `turn` tell a mistake, and `fits` tells if they are in the limits.
- A connection with a fault has the use `none` and a `fault`. For example, an end names an opening that its room does not have.
- A room with no path of connections to the first room has the place `apart`. Its place is not known, so its group goes to the right of the groups before it.
- The result has one room record with each room. The `id` of a wall, an opening or an outlet is the `id` of its room, then `/`, then its own `id`.
- `objects` has the objects of each survey, at the place of their room. The `id` of an object has the same form.
- Each closed room gives one floor, with the `id` and the name of the room.
- A survey can have a different unit than the level. `convertSurvey` changes the unit of a survey.

Two rooms have one wall between them, but each survey gives the full thickness to its own wall. Thus two walls that are back to back share the wall: each wall gets one half of the distance between the two faces. A wall that is in part an outer wall gets the same thickness along its full length. `checkRoom` examines the room record of a level, and it tells when two rooms overlap.

## The model

`roomSolids` and `sceneSolids` give the model as a list of solids. Each solid is a prism or a placed box, in meters, with the z axis up.

- Two walls with a common end make one corner. The corner has no overlap and no hole.
- A corner sharper than the option `miterLimit` keeps square ends.
- An opening removes its part of the wall. A window gets a pane of glass.
- Each solid has the `id` of the record that it comes from. Thus a viewer can show the record of a solid.

`TO_Y_UP` is the transform to a space with the y axis up, for glTF and three.js.

## The checks

`checkRoom` and `checkScene` give a list of findings. An empty list tells that the record has no fault. They do not throw.

| Level | Meaning | Examples |
| --- | --- | --- |
| `error` | The model cannot show the record correctly. | An opening that is longer than its wall, an outlet on a wall that the room does not have. |
| `warning` | The record is possible, but it is probably a mistake. | Two objects that overlap, an object in a wall, an outlet in a door. |

Each finding has a code, the kind and the `id` of the record, and a message with the values. `FINDING_CODES` has each code.

The model does not stop on a record with faults. It does not make the solids that it cannot make, and the checks tell why.

The model has a range of lengths. A size of 0.001 mm or less is 0 for the checks. A length above 1 000 km (`LARGEST_LENGTH`) is a fault, and the model does not make a part with such a length. Thus each number of the model is finite.

## The loads of the circuits

`circuitStates` gives the load of each circuit against its limit, with a level: `ok`, `near`, `over` or `unknown`. The loads are input data of the scene. This package does not calculate the power of a computer.

`outletLevels` gives the level of the circuit of each outlet. `levelShape` gives the shape of the sign of a level. The shapes are a disc for `ok`, a triangle for `near`, a square for `over` and a ring for `unknown`. Thus a person who does not see a color reads the level from the shape. `SHAPE_OUTLINES` and `shapeRing` give the outline of each sign, so each drawing shows the same signs.

## The viewer

The entry `@mark1russell7/room-view/three` shows a scene in a page with three.js. Install `three` 0.187 or later with this package. For the types, install `@types/three` too.

```ts
import { SAMPLE_SCENE } from "@mark1russell7/room-view/sample";
import { createRoomViewer, DARK_THEME } from "@mark1russell7/room-view/three";

const viewer = createRoomViewer(container, {
  scene: SAMPLE_SCENE,
  onSelect: (pick) => console.log(pick?.kind, pick?.source),
});

viewer?.setTheme(DARK_THEME);
viewer?.highlight([{ kind: "outlet", source: "nook-1" }]);
viewer?.setView("top");
```

- The viewer fills its container, so give the container a size.
- A drag turns the model. The wheel changes the distance only after a click in the picture, so the picture does not stop a page that scrolls.
- The walls between the camera and the room become almost clear.
- A click selects the record of a solid. `onSelect` gets the kind and the `id` of the record.
- With the keyboard, the arrow keys turn the model, and `+` and `-` change the distance. `Home` shows the first view, and `T` shows the plan.
- Each outlet has a marker with the color and the shape of the level of its circuit. A marker keeps its size in the picture.
- A marker behind a wall or a machine stays in the picture, and it is less clear.
- `highlight` and `select` mark records from your page: the outlets of a circuit, or the row of a table.
- A marked outlet or object shows a line from the outlet to each object that takes its power from it.
- The option `loads` has the options of `circuitStates`, for example the part of the limit where the level `near` starts.
- The viewer draws a frame only after a change.
- `createRoomViewer` gives `undefined` in a browser with no WebGL 2. It does not throw.

`LIGHT_THEME` and `DARK_THEME` are the colors, and a theme is plain data. The field `levels` of a theme has the color of each level. `solidGeometry` gives the three.js geometry of one solid, for your own three.js scene.

## The plan

`planShapes` gives the outline of each solid, as a camera above the room sees it. The list goes from the lowest top to the highest top, so a drawing in this sequence is correct.

The option `cut` gives a floor plan: the plan keeps only the solids that start below the height of the cut. Thus a door becomes a gap in its wall. Use the plan for a drawing in SVG, or for a browser with no WebGL 2.

## The entries

| Entry | What it has |
| --- | --- |
| `@mark1russell7/room-view` | The record types, the model, the plan, the checks, the loads, the survey and the level. It has no schema library. |
| `@mark1russell7/room-view/schema` | `roomSchema`, `sceneSchema`, `surveySchema` and `levelSchema`: the zod schemas that examine the form of a JSON record. |
| `@mark1russell7/room-view/sample` | `SAMPLE_ROOM`, `SAMPLE_SCENE`, `SAMPLE_SURVEY` and `SAMPLE_LEVEL`: a room with a rack and an apartment of four rooms, for demos and tests. |
| `@mark1russell7/room-view/three` | `createRoomViewer`, the themes and `solidGeometry`: the viewer in a page. It needs the package `three`. |

The schemas examine the form of a record: the fields and their types. The checks examine its meaning. Use the two for a record from a file:

```ts
import { checkScene } from "@mark1russell7/room-view";
import { sceneSchema } from "@mark1russell7/room-view/schema";

const scene = sceneSchema.parse(JSON.parse(text));
const errors = checkScene(scene).filter((finding) => finding.level === "error");
```

## The geometry

`@mark1russell7/layout-contract` gives the points, the boxes, the transforms and the polygon functions. `@mark1russell7/quantity` gives the length units. This package keeps only the room, the scene and their model.
