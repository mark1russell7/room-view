# room-view

A 3D model of a room from its measurements, and a three.js viewer of it. The objects in the room, the outlets and the circuits are data.

The package has the formats, the model and the checks. The viewer is the next step. [`docs/ROADMAP.md`](docs/ROADMAP.md) has the plan.

## The model

- A **room** is measurements: the walls, the openings, the floors, the outlets and the circuits of a room or of an apartment.
- A **placed object** is a box at a position in the room: a desk, a rack, a computer.
- An **outlet** is a point on a face of a wall.
- A **circuit** gives power to outlets, and it has a limit.
- A **scene** is one room with its placed objects and the loads of its circuits.

A room and a scene are data, and the code makes the 3D model from them. So a program can make many scenes, and a person can compare them in the viewer.

## The packages

| Package | What it has |
| --- | --- |
| [`@mark1russell7/room-view`](packages/room-view/README.md) | The room format, the scene format, the 3D model, the checks and the loads of the circuits. It is not on npm yet. |

`@mark1russell7/layout-contract` gives the geometry records: the 3D points, the boxes and the transforms. This repository keeps only the room, the scene and the viewer.

## Development

```sh
pnpm install
pnpm typecheck
pnpm test
pnpm lint:ste
```

The license is MIT.
