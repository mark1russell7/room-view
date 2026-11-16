# Roadmap

This file is the plan of room-view. The Status page of the site reads it, and the tracker of the project mirrors it.

| ID | Item | Status | Summary |
| --- | --- | --- | --- |
| R1 | The room format and the scene format | done | The records `room/1` and `scene/1`: walls, openings, floors, outlets, circuits, placed objects and loads. The schemas examine the form, and the checks examine the meaning. `@mark1russell7/layout-contract` 0.10.2 has the 3D points, boxes and transforms. |
| R2 | The first package: the model and the viewer | in progress | `@mark1russell7/room-view` makes the 3D model of a room from its measurements: walls with corners, openings, floors, outlets and placed objects. Next: an entry shows the model with three.js, and a demo room replaces the first site. |
| R3 | Outlets and circuits | open | The viewer shows the outlets and the circuits. A color shows the load of each circuit against its limit. `circuitStates` gives the levels now. |
| R4 | Compare scenes | open | Sliders and charts change a scene, and the viewer compares two scenes. |
| R5 | The glTF export | open | A function writes the model of a room as a glTF file, with the correct units and names, for other tools. The model comes from measurements, so a Blender path is not necessary. |
| R6 | A survey form | open | A short form for the measurements of a person with a tape measure: the lengths of the walls in order, and the corners. It expands to a `room/1` record. |
