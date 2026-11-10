# Roadmap

This file is the plan of room-view. The Status page of the site reads it, and the tracker of the project mirrors it.

| ID | Item | Status | Summary |
| --- | --- | --- | --- |
| R1 | The scene format | open | The records of a scene: the room model, the placed objects, the outlets and the circuits. The 3D points, boxes and transforms go to `@mark1russell7/layout-contract` by a pull request there. |
| R2 | The first package: the viewer | open | Make `@mark1russell7/room-view` with `pnpm package add`. It loads a glTF room model, and it shows the placed objects of a scene with three.js. Replace the first site with a demo room. |
| R3 | Outlets and circuits | open | The viewer shows the outlets and the circuits. A color shows the load of each circuit against its limit. |
| R4 | Compare scenes | open | Sliders and charts change a scene, and the viewer compares two scenes. |
| R5 | The Blender path | open | A guide and a script export a room model from Blender to glTF, with the correct units and names. |
