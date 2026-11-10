# room-view

A three.js viewer of a room model. The model is a glTF file. The objects in the room, the outlets and the circuits are data.

This repository is new. Its first package is not written yet. [`docs/ROADMAP.md`](docs/ROADMAP.md) has the plan.

## The model

- A **room model** is a glTF file of a room or of an apartment, with real dimensions.
- A **placed object** is a box or a model at a position in the room: a desk, a rack, a computer.
- An **outlet** is a point on a wall.
- A **circuit** joins outlets, and it has a limit.
- A **scene** is one room model with its placed objects, its outlets and its circuits.

A scene is data. So a program can make many scenes, and a person can compare them in the viewer.

## The packages

This package is the plan. It does not exist yet.

| Package | What it has |
| --- | --- |
| `@mark1russell7/room-view` | The scene format and the three.js viewer. |

`@mark1russell7/layout-contract` gives the geometry records: the 3D points, the boxes and the transforms. This repository keeps only the viewer and the scene data.

## Development

```sh
pnpm install
pnpm typecheck
pnpm test
pnpm lint:ste
```

The license is MIT.
