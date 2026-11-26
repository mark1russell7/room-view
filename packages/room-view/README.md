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
  schema: "room/2",
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

The room record has only space. The records of a topic, for example outlets, are in a layer of an add-on. Refer to [Anchors and layers](#anchors-and-layers).

A scene is one room with its placed objects and its layers. A placed object is a box: a desk, a rack, a computer. An object can have a parent, and then its position is relative to the parent.

## A survey: the room from a tape measure

A person with a tape measure does not know the coordinates of a corner. The person knows the length of each wall and the turn at each corner. A survey record keeps these numbers, in the sequence of a walk around the room.

```ts
import { checkRoom, expandSurvey, type Survey } from "@mark1russell7/room-view";

const survey: Survey = {
  schema: "survey/2",
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
- An opening gives its `offset` from the first corner of its side, as the tape measure shows it.
- A side that shares the gap changes its length. Its openings and the wall anchors of its layers keep their place: each `offset` and each `width` changes in the same proportion.

The walk goes along the inner faces, so each wall is on the outer side of its line. A survey has one room. A wall in the middle of a room is not a side of the walk, for example the short wall of a nook. Add such a wall to the room record.

### The objects of a survey

A person measures a desk or a rack from a wall. A survey can have these measurements as objects, and the result has a placed object for each of them.

```ts
import { checkScene, expandSurvey, type Scene, type Survey } from "@mark1russell7/room-view";

const survey: Survey = {
  schema: "survey/2",
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
const scene: Scene = { schema: "scene/2", room, objects };
checkScene(scene); // => []
```

- An **object** is a box. `wall` names its side, and `offset` is the distance along the face from the first corner of the side to the object.
- `width` goes along the wall, and `depth` goes out from the wall. `gap` is the distance from the face to the back of the object.
- The back of an object is against its wall, so the object gets the turn of its wall.
- An object with `on` is on a different object or in it. That object is its **holder**: a desk for a display, a rack for a computer.
- With a holder, `offset` and `gap` start at the edge and the back of the holder. The holder becomes the parent of the placed object.
- `lift` is the height of the bottom above the floor. With a holder, the default is the top of the holder.
- An object keeps its size on a side that shares the gap. Only its place changes.
- An object with no place is not in the result. For example, its side is not in the survey, or a size is not above 0.

## A level: the rooms of an apartment

A survey has one room, with its own first corner. A level record has the survey of each room, and the connections between the rooms. A connection is one hole through a wall, for example a door. A person measures the hole in each of its two rooms, so each survey has it as an opening.

```ts
import { checkRoom, expandLevel, type Level, type Survey } from "@mark1russell7/room-view";

const hall: Survey = {
  schema: "survey/2",
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
  schema: "survey/2",
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
  schema: "level/2",
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
- The result has one room record with each room. The `id` of a wall or an opening is the `id` of its room, then `/`, then its own `id`.
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
| `error` | The model cannot show the record correctly. | An opening that is longer than its wall, an object on an object that the scene does not have. |
| `warning` | The record is possible, but it is probably a mistake. | Two objects that overlap, an object in a wall. |

Each finding has a code, the kind and the `id` of the record, and a message with the values. `FINDING_CODES` has each code. A fault between two records also has the `id` of the second record in `other`. An example is the other object of an overlap.

The model does not stop on a record with faults. It does not make the solids that it cannot make, and the checks tell why.

The model has a range of lengths. A size of 0.001 mm or less is 0 for the checks. A length above 1 000 km (`LARGEST_LENGTH`) is a fault, and the model does not make a part with such a length. Thus each number of the model is finite.

## Anchors and layers

An add-on puts the records of one topic on the core, for example the outlets of an electrical add-on. The core names no topic.

- `Scene.layers` keeps the records of each add-on, by the name of the format of its layer, for example `electrical/1`. The core does not read a layer.
- An anchor is a place for a record: on a face of a wall, on the floor, on the ceiling or on a placed object.
- `sceneSpace` gives the space of a scene. Its function `frame` gives the point of an anchor and the direction out of its surface, in meters.
- `checkAnchor` gives the faults of an anchor. An error tells that the anchor has no position. A warning tells a fault that the model can show.

An add-on is an `AddOn` value: the name of the format of its layer, and the functions `parse`, `anchors`, `withAnchors` and `check`. The function `join` is optional. `checkLayers` examines the layers of a scene with a list of add-ons:

```ts
import { checkLayers } from "@mark1russell7/room-view";

const findings = checkLayers(scene, addOns);
```

- Each layer gets the faults of its form, of each anchor and of the meaning of its records.
- A layer of no add-on of the list gets a warning, and the scene keeps the layer.
- The findings are in the order of the layer keys, then of the record keys. Thus equal inputs give equal findings.
- The add-ons do not know each other. Two add-ons can put records on one object.

An add-on can give marks: records that a viewer draws, in the format of `@mark1russell7/visuals/marks`. `layerMarks` of the entry `/marks` gives the marks of the layers of a scene:

```ts
import { layerMarks } from "@mark1russell7/room-view/marks";

const marks = layerMarks(scene, addOns, addOnMarks);
```

- Each value of `addOnMarks` is the `AddOnMarks` value of an add-on, from the entry `/marks` of its package. The add-on of the same name reads the layer.
- The marks are in the order of the layer names, then of the record names. Thus equal inputs give equal marks.
- A layer with a fault of its form gives no marks, and `checkLayers` tells the fault.
- A mark is plain data in meters, with the z axis up. It has no shape and no color.

An add-on can give the form of its layer as data, a `LayerForm` value. It has the collections of the records and the fields of each record. A page makes its inputs from this data, so the page has no code of a topic:

```ts
import { formLayer, formRecords } from "@mark1russell7/room-view";

// The layer of the records that a person typed, with the usual values of a home with feet and inches:
const layer = formLayer(form, records, { system: "imperial" });
// The records of a layer, for the inputs of a page:
const read = formRecords(form, layer);
```

- A field is a text, a number in a fixed unit, or the `id` of a record or of a placed object.
- The record of a field is in the same layer. The option `outside` of `formLayer` and of `formRecords` gives the ids of the records outside the layer.
  For example, the layer of one room of a level can name a record of the layer of the level record.
- A collection with surfaces has records with an anchor. A collection with an owner has the records of a placed object or of a different record.
- `formLayer` is total. A record with a value that is not valid, or with no value of a necessary field, is not in the layer.
- A number with no value gets the usual value of its field for the system of units, `metric` or `imperial`.
- `formRecords` gives `more: true` when the layer has data that the form does not keep. Thus a page can tell that an edit loses data.
- `readFormRecord` gives the first field that stops a record, so a page can show the fault at its input.
- `checkForm` gives the faults of a form. An add-on examines its form with this function in a test.

A survey and a level have the field `layers` too. The anchors of a layer of a survey name the sides and the objects of the survey:

```ts
import { checkLayers, expandSurvey, resultScene } from "@mark1russell7/room-view";

const result = expandSurvey(survey, { addOns });
const findings = [...result.layerFindings, ...checkLayers(resultScene(result), addOns)];
```

- `expandSurvey` and `expandLevel` move each anchor to the room record through the add-on of its layer. `surveyAnchor` tells the rule for one anchor.
- A layer with no add-on in the option `addOns` is not in the result, and `layerFindings` tells the layer.
- `resultScene` gives the scene of a result, with its layers.
- In a level, the survey of a room has the layers of the room, and the level record has the layers of the level.
- A record of a room gets the name `roomName(room, id)` in the level. The function `join` of an add-on makes one layer from the layers of the rooms.
- `convertSurvey(survey, unit, addOns)` changes the lengths of each anchor with the unit of the survey.
- `moveLayers` changes each anchor of some layers, for a host that moves the records of a room. `scaleAnchor` changes the unit of one anchor.

`ANCHOR_CODES`, `LAYER_CODES` and `FORM_CODES` have the codes of the core. The design of the add-ons is in `docs/ADD-ONS.md` of the repository.

## The viewer

The entry `@mark1russell7/room-view/three` shows a scene in a page with three.js. Install `three` 0.187 or later with this package. For the types, install `@types/three` too.

```ts
import { SAMPLE_SCENE } from "@mark1russell7/room-view/sample";
import { createRoomViewer, DARK_THEME } from "@mark1russell7/room-view/three";

const viewer = createRoomViewer(container, {
  scene: SAMPLE_SCENE,
  onSelect: (pick, mark) => console.log(pick?.kind, pick?.source, mark?.label),
});

viewer?.setTheme(DARK_THEME);
viewer?.highlight([{ kind: "object", source: "desk" }]);
viewer?.setView("top");
```

- The viewer fills its container, so give the container a size.
- A drag turns the model. The wheel changes the distance only after a click in the picture, so the picture does not stop a page that scrolls.
- The walls between the camera and the room become almost clear.
- A click selects the record of a solid or of a sign. `onSelect` gets the kind and the `id` of the record.
- With the keyboard, the arrow keys turn the model, and `+` and `-` change the distance. `Home` shows the first view, and `T` shows the plan.
- The stage and the signs come from `@mark1russell7/visuals`. Thus each viewer on that package shows the same signs.
- The signs are the marks of the layers, from the option `marks`. With no marks, the picture has only the solids.
- A sign keeps its size in the picture. A sign behind a wall or a machine stays in the picture, and it is less clear.
- The pointer finds a sign before each solid, also behind a solid. `onHover` and `onSelect` get its mark as their second parameter.
- `highlight` and `select` mark records from your page, for example the record of the row of a table.
- The viewer draws a frame only after a change.
- `createRoomViewer` gives `undefined` in a browser with no WebGL 2. It does not throw.

`LIGHT_THEME` and `DARK_THEME` are the colors, and a theme is plain data. The field `levels` of a theme has the color of each level of a mark. `solidGeometry` gives the three.js geometry of one solid, for your own three.js scene.

### The marks of the add-ons

The option `marks` gives the marks of a scene to the viewer. The viewer draws them as signs:

```ts
import { layerMarks } from "@mark1russell7/room-view/marks";
import { createRoomViewer } from "@mark1russell7/room-view/three";

const marks = layerMarks(scene, addOns, addOnMarks);
const viewer = createRoomViewer(container, { scene, marks });

viewer?.highlight(["electrical/1:nook-2"]);
viewer?.showMarks((mark) => mark.kind === "outlet");
```

- The marks are in the space of the scene: meters, with the z axis up.
- A point is a sign, a run is a round line, a link is a dashed line and a field is a grid of colors. A meter has no picture.
- The viewer draws no mark with a fault. `checkMarks` of `@mark1russell7/visuals/marks` tells each fault.
- `highlight` and `select` accept the record name of a mark, as `recordName` gives it.
- `solidRecord` of the root entry gives the record name of a solid. Thus a finding, a mark and a solid of one record have one name.
- `showMarks` shows only the marks that a test accepts, for example the marks of one kind.
- `setScene` takes the marks of the new scene as its second parameter.
- An empty list gives a picture with no sign.
- The fields `field` and `fieldOpacity` of a theme have the colors of a field mark.

## The plan

`planShapes` gives the outline of each solid, as a camera above the room sees it. The list goes from the lowest top to the highest top, so a drawing in this sequence is correct.

The option `cut` gives a floor plan: the plan keeps only the solids that start below the height of the cut. Thus a door becomes a gap in its wall. Use the plan for a drawing in SVG, or for a browser with no WebGL 2.

## A floor plan from a drawing

The entry `@mark1russell7/room-view/import` reads the vector paths of a floor plan drawing, for example the lines of a page of a PDF file. It gives a room record with the walls, the openings and one floor for each room.

```ts
import { importPlan, readLegend, type Sheet } from "@mark1russell7/room-view/import";

// The lines, the fills and the texts of one page, in points. The scale 1/8 inch to the foot gives 9 points for each foot.
const sheet: Sheet = { width, height, scale: 9, unit: "ft", lines, fills, texts };
const result = importPlan(sheet, { legend: readLegend(sheet) });
console.log(result.rooms.length, result.gate.within);
```

The import has five steps:

1. `readPens` finds the wall pens. A wall pen has long lines, and each line has a parallel partner at the distance of a wall thickness. `readWallLines` also reads the walls of the other pens one line at a time. `snapEnds` closes the small gaps at the open wall ends.
2. `findBridges` closes each gap between two wall ends. The bridge of a gap is an opening of the room record.
3. The walls, the door swings and the bridges go on a grid. Each free region inside the building is a room.
4. Each room gets the fill color under most of its cells. `readLegend` gives the name of each color.
5. The area gate compares the area of each fill of the legend with the rooms in it.

- A free region with a small area is a speck. A thin free region is the space inside a wall. They are not rooms.
- The sheet has the y axis down. The plan of the result has the y axis up.
- Each option has a default in feet. The import changes the default to the unit of the sheet.
- An opening is a `door` when a door swing is near it. Each other opening is a `gap`.
- The lines of the door pen are barriers of the rooms. A straight line of the pen longer than `longestLeaf` (4.5 ft) is not a door leaf, so it is not a barrier.
- The import does not read the windows or the heights. The room record has the default heights.

### The read of the wall lines

A drawing can draw some walls with the pen of the glazing or of the fixtures. Thus that pen is not a wall pen. The option `walls` of `importPlan` sets the read of these lines:

| Option | Default | What it does |
| --- | --- | --- |
| `read` | `"lines"` | `"lines"` also takes the wall faces of the other pens. `"pens"` takes only the lines of the wall pens. |
| `patternSide` | `0.4` | A pen with a smaller part of one-side lines is a pattern pen, for example a hatch or glazing. Its lines are not wall faces. |
| `crossPens` | `true` | A wall face can have its partner in a different pen. |
| `glazing` | `true` | The glazing lines of the pattern pens close the rooms. They give no wall of the room record. |
| `snap` | `1` ft | An open wall end goes on for this distance or less, to the next wall line or to a wall end in front of it. The value `0` closes no gap. |

- A wall face is a long line with a parallel partner at a wall thickness on one side only.
- An end line is a short line that joins two face ends. It is a wall line.
- A glazing line is a long line of a pattern pen with 1 to 3 partners. Its two ends are near wall ends.
- The result has `lineRead`: the wall lines, the glazing lines and the number of faces of each pen.
- For the read of version 0.3, set `read: "pens"` and `snap: 0`.

## The ways through a room

`roomGraph` gives the floors on the two sides of each door and gap. `floorRoute` finds the shortest route from one floor to the nearest floor of a set.

```ts
import { floorRoute, roomGraph } from "@mark1russell7/room-view";

const graph = roomGraph(result.room, { walk: true });
const route = floorRoute(graph, "room-12", ["room-3", "room-40"], { through: ["room-5", "room-7"] });
console.log(route?.openings, route?.length, route?.path);
```

- The option `through` of `floorRoute` gives the floors that a route can go through. Thus a route from a home to a stair keeps out of the other homes.
- The floor of a point is the smallest floor that holds it. Thus a floor inside the outline of a corridor keeps its own doors.
- With no option `walk`, a step between two doors of one floor has the straight distance. The length of a route is then a lower bound.
- With the option `walk`, each step goes on a grid of cells inside its floor. The other floors inside its outline are holes, so a walk goes around a court.
- `true` gives cells of 0.25 m. A number gives the side of a cell in the unit of the room.
- With the option `walk`, the route has `path`: the points of the walk from the first door to the last door. Each straight part stays inside a floor, and `length` is the length of the path.

## The entries

| Entry | What it has |
| --- | --- |
| `@mark1russell7/room-view` | The record types, the model, the plan, the checks, the survey, the level, the anchors and the layers. It has no schema library. |
| `@mark1russell7/room-view/schema` | `readRecord`, the schemas of the records and of an anchor in `zod/mini`, and `READ_CONTEXT`: the read of a JSON record. |
| `@mark1russell7/room-view/sample` | `SAMPLE_ROOM`, `SAMPLE_SCENE`, `SAMPLE_SURVEY` and `SAMPLE_LEVEL`: a room with a rack and an apartment of four rooms, for demos and tests. |
| `@mark1russell7/room-view/marks` | `layerMarks` and the type `AddOnMarks`: the marks of the layers of a scene, as plain data for a viewer. |
| `@mark1russell7/room-view/import` | `importPlan`, `readLegend`, `readPens`, `readWallLines`, `snapEnds`, `wallPairs` and `findBridges`: a room record from the vector paths of a floor plan drawing. |
| `@mark1russell7/room-view/three` | `createRoomViewer`, the themes and `solidGeometry`: the viewer in a page. It needs the package `three`. |

The schemas examine the form of a record: the fields and their types. The checks examine its meaning. Use the two for a record from a file:

```ts
import { checkScene } from "@mark1russell7/room-view";
import { readRecord } from "@mark1russell7/room-view/schema";

const read = readRecord(JSON.parse(text), addOns);
if (read.ok && read.kind === "scene") {
  const errors = checkScene(read.record).filter((finding) => finding.level === "error");
}
```

- `readRecord` reads a room, a scene, a survey or a level, in version 1 or in version 2. It gives the record in version 2, its kind and the version of the file.
- A record of version 1 kept the records of some topics in fields of its own. An add-on with the read `v1` moves its fields to its layer.
- A field of version 1 that no add-on of the list moves is a fault. `readRecord` does not throw.
- A record with a layer and the old fields of the same add-on keeps the layer. The finding `read-both` tells it.
- A `room/1` with old records becomes a `scene/2`, because a room record has no layers.

The schemas use `zod/mini`, so a page gets only the parts of zod that the schemas use. `READ_CONTEXT` gives the English messages of zod to each read. An add-on gives it to the read of its layer too.

## The geometry

`@mark1russell7/layout-contract` gives the points, the boxes, the transforms and the polygon functions. `@mark1russell7/quantity` gives the length units. This package keeps only the room, the scene and their model.
