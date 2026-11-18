import type { Highlight } from "@mark1russell7/visuals";
import type { StageContent, StageFrame, StagePick } from "@mark1russell7/visuals/three";
import type { Object3D, Raycaster } from "three";
import type { Scene } from "../room.ts";
import type { Solid, SolidKind, SolidOptions } from "../solids.ts";
import { hidingWalls } from "./fade.ts";
import { buildModel, disposeModel, paintPart, type ModelPart } from "./model.ts";
import type { ViewerTheme } from "./theme.ts";
import { toRoom } from "./view.ts";

/** A record of a scene that the viewer shows: a floor, a wall, a window or a placed object. */
export interface ViewerRecord {
  /** The kind of the solids of the record. A window has the kind `glass`. */
  readonly kind: SolidKind;
  /** The `id` of the record in the scene. */
  readonly source: string;
}

/** The solid under the pointer, with its record. */
export interface ViewerPick extends ViewerRecord {
  /** The `id` of the solid. A wall with openings has more than one solid. */
  readonly solid: string;
}

/** The content of a stage that shows the solids of a scene. The value of a pick is the solid. */
export interface RoomContent extends StageContent<ViewerPick, ViewerTheme> {
  /** The solids of the scene. */
  readonly solids: readonly Solid[];
  /** This function gives the first solid of a record with a name, as a pick. A name of no record of the content gives `undefined`. */
  pickOf(record: string): ViewerPick | undefined;
}

/** The time in which a wall goes most of the way to clear or to solid, in seconds. */
export const FADE_TIME = 0.11;

/**
 * This function makes the content of a stage that shows the solids of a scene.
 * The solids are the floors, the walls, the windows and the placed objects.
 *
 * The walls between the camera and the room become almost clear, and the pointer goes through them.
 * An object in a clear box of objects gets the pick before the box. Each pick has its distance, so a mark in front of a solid gets the pick.
 * The space of the content has the y axis up: the z axis of the scene becomes the y axis.
 */
export function createRoomContent(scene: Scene, solids: SolidOptions = {}): RoomContent {
  const model = buildModel(scene, solids);
  const first = new Map<string, ModelPart>();
  for (const part of model.parts) if (!first.has(part.record)) first.set(part.record, part);
  const byMesh = new Map<Object3D, ModelPart>(model.parts.map((part) => [part.mesh, part]));
  const pickOfPart = (part: ModelPart): ViewerPick => ({ solid: part.solid.id, kind: part.solid.kind, source: part.solid.source });

  /** The walls that hide the room from the camera of the last step. */
  let hiding: ReadonlySet<string> = new Set();
  let theme: ViewerTheme | undefined;
  let highlightOf: (record: string) => Highlight = () => 0;
  const paintOne = (part: ModelPart): void => {
    if (theme !== undefined) paintPart(part, scene, theme, highlightOf(part.record));
  };

  return {
    objects: [model.group],
    extent: { corners: model.corners, center: model.center },
    solids: model.parts.map((part) => part.solid),
    has: (record) => first.has(record),
    pickOf(record): ViewerPick | undefined {
      const part = first.get(record);
      return part === undefined ? undefined : pickOfPart(part);
    },
    pick(ray: Raycaster): StagePick<ViewerPick> | undefined {
      // A wall that hides the room is clear, and the pointer goes through it.
      const open = model.parts.filter((part) => part.wall === undefined || !hiding.has(part.wall)).map((part) => part.mesh);
      const hits = ray.intersectObjects(open, false);
      const nearest = hits[0];
      const found = nearest === undefined ? undefined : byMesh.get(nearest.object);
      if (nearest === undefined || found === undefined) return undefined;
      if (found.holds) {
        // A clear box of objects: the pointer selects an object in the box before the box.
        for (const hit of hits) {
          const part = byMesh.get(hit.object);
          if (part !== undefined && part.holder === found.record) return { record: part.record, value: pickOfPart(part), distance: hit.distance };
        }
      }
      return { record: found.record, value: pickOfPart(found), distance: nearest.distance };
    },
    paint(nextTheme, highlight): void {
      theme = nextTheme;
      highlightOf = highlight;
      for (const part of model.parts) paintOne(part);
    },
    step(frame: StageFrame): boolean {
      hiding = hidingWalls(model.shades, toRoom(frame.camera.position));
      // Each wall goes to its goal: clear for a wall that hides the room, solid for each other wall.
      const rate = frame.settle ? 1 : 1 - Math.exp(0 - frame.seconds / FADE_TIME);
      let active = false;
      for (const part of model.parts) {
        if (part.wall === undefined) continue;
        const goal = hiding.has(part.wall) ? 1 : 0;
        if (part.fade === goal) continue;
        const next = part.fade + (goal - part.fade) * rate;
        part.fade = Math.abs(goal - next) < 0.01 ? goal : next;
        paintOne(part);
        active = active || part.fade !== goal;
      }
      return active;
    },
    dispose(): void {
      disposeModel(model);
    },
  };
}
