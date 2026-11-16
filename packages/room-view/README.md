# @mark1russell7/room-view

The room format, the scene format and the 3D model of a room. A room is measurements, and the code makes the model from them.

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
| `@mark1russell7/room-view` | The record types, the model, the plan, the checks and the loads. It has no schema library. |
| `@mark1russell7/room-view/schema` | `roomSchema` and `sceneSchema`: the zod schemas that examine the form of a JSON record. |
| `@mark1russell7/room-view/sample` | `SAMPLE_ROOM` and `SAMPLE_SCENE`: a small apartment with a rack, for demos and tests. |
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
