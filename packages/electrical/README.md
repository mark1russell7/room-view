# @mark1russell7/electrical

Electrical circuits as data: outlets, circuits, feeds and loads. The package has the format of an electrical layer, its checks and the circuit formulas.

It is the electrical add-on of [`@mark1russell7/room-view`](../room-view/README.md). The core of room-view knows only space. This package puts the electrical records on the anchors of the core.

The package has no browser part. Each function is a plain function, and each formula is a Vex program.

## The entries

| Entry | What it has |
| --- | --- |
| `@mark1russell7/electrical` | The records of a layer, the circuit formulas, the states, the checks and the move of an old scene. |
| `@mark1russell7/electrical/schema` | `electricalSchema`, the zod schema of a layer, and `parseElectrical`. |
| `@mark1russell7/electrical/add-on` | `electrical`, the add-on value for the contract of the core. |
| `@mark1russell7/electrical/marks` | `electricalMarks` and `electricalAddOnMarks`: the records of a layer as marks for a viewer. |

The root entry imports only Vex at run time. Thus a page that shows only the load of a circuit gets no schema library.
The entry `/marks` uses only the types of `@mark1russell7/visuals`, so it adds no code of a viewer.

## Install

```sh
npm install @mark1russell7/electrical
```

## A layer

An electrical layer is one record with three lists. A scene keeps it in `Scene.layers`, with the key `electrical/1`.

```ts
import { circuitStates, type ElectricalLayer } from "@mark1russell7/electrical";

const layer: ElectricalLayer = {
  schema: "electrical/1",
  circuits: [{ id: "office", breaker: 15, voltage: 120 }],
  outlets: [
    { id: "north-1", anchor: { on: "wall", wall: "north", face: "left", offset: 1.2, height: 0.3 }, circuit: "office" },
    { id: "strip", anchor: { on: "object", object: "desk" }, circuit: "office" },
  ],
  feeds: [
    { id: "pc", object: "tower", outlet: "strip", watts: 450 },
    { id: "screen", object: "monitor", outlet: "strip", watts: 60 },
    { id: "printer", object: "printer", outlet: "north-1" },
  ],
};

circuitStates(layer);
// => [{ circuit: "office", watts: 510, limit: 1440, ratio: 0.354, level: "ok", missing: ["printer"],
//       outlets: ["north-1", "strip"], feeds: ["pc", "screen", "printer"], objects: ["tower", "monitor", "printer"] }]
```

- An **outlet** is a point that gives power, on an anchor of the core: a wall, a floor, a ceiling or a placed object.
- A **circuit** gives power to outlets. It can have the rating of its breaker, its voltage, a limit and a load that no feed gives.
- A **feed** is the power of a placed object from an outlet. An object with two power supplies has two feeds.

The units are fixed: a breaker in amperes, a voltage in volts, and a limit and a load in watts. The ids of one layer are unique, so `recordName("electrical/1", id)` of the core names one record.

`parseElectrical` of the entry `/schema` reads the JSON of a layer. It gives the layer, or the faults of its form with the place of each fault. `electricalSchema` is the zod schema.

## The limit and the level of a circuit

A continuous load can use only a part of the rating of a breaker: 80% by default. Thus a breaker of 15 A at 120 V has a limit of 1440 W.

- The limit of a circuit is its field `limit`. Without it, the limit is the voltage times the breaker times the continuous part.
- The known load of a circuit is the sum of the watts of its feeds, plus its `otherLoad`.
- A feed with no watts adds nothing to the load. The state of the circuit names it in `missing`, because the true load can be above the known load.

| Level | Meaning |
| --- | --- |
| `unknown` | No load of the circuit has watts, or the circuit has no limit above 0. |
| `ok` | The known load is below the near part of the limit. |
| `near` | The known load is the near part of the limit, or more. The default near part is 80%. |
| `over` | The known load is above the limit. |

`circuitStates` gives the state of each circuit, and `outletLevels` gives each outlet the level of its circuit. The options `continuousLoad` and `near` change the two parts.

## The add-on

`electrical` is the add-on value for the contract of the core. `checkLayers` of the core examines the form of the layer, each anchor and the meaning of the records:

```ts
import { electrical } from "@mark1russell7/electrical/add-on";
import { checkLayers, readLayer } from "@mark1russell7/room-view";

const findings = checkLayers(scene, [electrical]);
const read = readLayer(scene, electrical);
```

`electricalAddOn(options)` makes the add-on with different parts. `checkElectrical` of the root entry gives the faults of the meaning of one layer:

| Code | Level | The fault |
| --- | --- | --- |
| `id-duplicate` | error | Two records of the layer have one `id`. |
| `outlet-circuit` | error | An outlet is on a circuit that the layer does not have. |
| `feed-outlet` | error | A feed is from an outlet that the layer does not have. |
| `feed-object` | error | A feed gives power to an object that the scene does not have. |
| `feed-watts` | error | The watts of a feed are below 0, or they are not finite. |
| `circuit-number` | error | A breaker, a voltage or a limit is not above 0, or an `otherLoad` is below 0. |
| `circuit-no-limit` | warning | A circuit has no limit, and it does not have a breaker and a voltage. |
| `circuit-limits` | warning | The field `limit` of a circuit and its rated limit are not equal. |
| `circuit-over` | warning | The known load of a circuit is above its limit. |

## The marks

A mark is a record that a viewer draws. The entry `/marks` gives the records of a layer as marks of [`@mark1russell7/visuals/marks`](https://www.npmjs.com/package/@mark1russell7/visuals). A mark is plain data, with no shape and no color:

```ts
import { electrical } from "@mark1russell7/electrical/add-on";
import { electricalAddOnMarks, electricalMarks } from "@mark1russell7/electrical/marks";
import { sceneSpace } from "@mark1russell7/room-view";
import { layerMarks } from "@mark1russell7/room-view/marks";

// The marks of one layer:
const marks = electricalMarks(layer, sceneSpace(scene));
// The marks of each layer of a scene, with the add-ons of a host:
const all = layerMarks(scene, [electrical], [electricalAddOnMarks()]);
```

| Record | Mark | Kind | What the mark shows |
| --- | --- | --- | --- |
| An outlet | A point | `outlet` | The place of the anchor and the direction out of its surface, with the level of its circuit. |
| A feed | A link | `feed` | A line from the outlet to the center of the placed object, with the level of the circuit of the outlet. |
| A circuit | A meter | `circuit` | The known load against the limit, in watts. |

- The record name of a mark is `recordName("electrical/1", id)`. A finding of `checkLayers` has the same name, so a finding selects its mark.
- Each point is in meters, with the z axis up.
- A record with no place gives no mark: an outlet whose anchor has no position, and a feed with no outlet or no placed object.
- A circuit with no limit gives no meter, because a meter needs a limit. Its outlets and its feeds have the level `unknown`.
- The checks tell each of these faults, so a record with no mark has a finding.
- Give the options of `electricalAddOn` to `electricalAddOnMarks` too. Thus the levels of the marks agree with the findings.

`ELECTRICAL_MARK_KINDS` has the kinds of the marks, for the legend and the filter of a viewer.

## The formulas

The circuit math is Vex programs, so a program is data. `explain` of Vex shows each step, and a host can keep a program as JSON.

Four functions build general programs. They read no field, so a model with different records uses them with its own field names:

```ts
import { loadVars, ratedLimit } from "@mark1russell7/electrical";
import { evaluate, ref, space } from "@mark1russell7/vex";
import { NumDomain } from "@mark1russell7/vex-domains";

const supplies = space.record({ rack: { volts: 240, amps: 30 } });
evaluate(ratedLimit(ref("volts"), ref("amps")), { space: supplies, origin: "rack", domains: [NumDomain], vars: loadVars() });
// => { ok: true, value: 5760 }
```

| Function | The program |
| --- | --- |
| `ratedLimit(voltage, breaker)` | The limit of a continuous load, in watts. |
| `loadCurrent(load, voltage)` | The current of a load, in amperes. |
| `loadRatio(load, limit)` | A load as a part of its limit. A limit that is not above 0 gives an error value. |
| `ratioLevel(ratio)` | The level of a ratio: `over`, `near` or `ok`. |

`electricalSpace` makes a tree of a layer: a circuit, then its outlets and its other load, then the feeds of each outlet. The programs of a circuit evaluate at its node, and `evaluateCircuit` evaluates one of them:

| Program | The value at a circuit |
| --- | --- |
| `CIRCUIT_LIMIT` | The limit, in watts. |
| `RATED_LIMIT` | The limit from the breaker and the voltage, in watts. |
| `CIRCUIT_LOAD` | The known load, in watts. |
| `KNOWN_LOADS` | The count of the loads with watts. |
| `MISSING_LOADS` | The keys of the feeds with no watts. |
| `CIRCUIT_RATIO` | The known load as a part of the limit. |
| `CIRCUIT_CURRENT` | The current of the known load, in amperes. |
| `CIRCUIT_LEVEL` | The level. |
| `LIMITS_DIFFER` | `true` when the field `limit` and the rated limit are not equal. |

## From a `scene/1`

A `scene/1` of room-view keeps outlets and circuits in its room, and the total load of each circuit. `fromSceneV1` moves these records to a layer:

```ts
import { fromSceneV1 } from "@mark1russell7/electrical";
import { SAMPLE_SCENE } from "@mark1russell7/room-view/sample";

const layer = fromSceneV1(SAMPLE_SCENE);
const scene = { ...SAMPLE_SCENE, layers: { "electrical/1": layer } };
```

- An outlet keeps its `id`, and its place on the wall becomes a wall anchor.
- The sum of the loads of a circuit becomes its `otherLoad`. Thus the circuit keeps its level.
- The outlet of an object becomes a feed with no watts, because a `scene/1` does not have the power of each object.

## License

MIT
