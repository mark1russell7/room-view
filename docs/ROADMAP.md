# Roadmap

This file is the plan of room-view. The Status page of the site reads it, and the tracker of the project mirrors it.

| ID | Item | Status | Summary |
| --- | --- | --- | --- |
| R1 | The room format and the scene format | done | The records `room/1` and `scene/1`: walls, openings, floors, outlets, circuits, placed objects and loads. The schemas examine the form, and the checks examine the meaning. `@mark1russell7/layout-contract` 0.10.2 has the 3D points, boxes and transforms. |
| R2 | The first package: the model and the viewer | in progress | `@mark1russell7/room-view` makes the 3D model of a room from its measurements: walls with corners, openings, floors, outlets and placed objects. The entry `/three` shows the model with three.js: a person turns the room, the walls in front become clear, and a click selects a record. The site shows a sample room, and a browser with no WebGL 2 gets its plan. Next: the first release on npm. |
| R3 | Outlets and circuits | done | The viewer shows each outlet with a marker. The color and the shape of the marker tell the load of its circuit against its limit. A marked outlet shows a line to each machine on it. The site shows the circuits as meters, with a legend of the signs. |
| R4 | Compare scenes | open | Sliders and charts change a scene, and the viewer compares two scenes. |
| R5 | The glTF export | open | A function writes the model of a room as a glTF file, with the correct units and names, for other tools. The model comes from measurements, so a Blender path is not necessary. |
| R6 | A survey form | open | A short form for the measurements of a person with a tape measure: the lengths of the walls in order, and the corners. It expands to a `room/1` record. |
