import { fitView } from "@mark1russell7/visuals";
import { createMarkers, type MarkersOptions, type MarkersTheme } from "@mark1russell7/visuals/markers";
import { checkMarks, transformMarks, type Mark } from "@mark1russell7/visuals/marks";
import { createStage, stackContents, type StageContent } from "@mark1russell7/visuals/three";
import { solidRecord } from "../check.ts";
import type { Scene } from "../room.ts";
import { TO_Y_UP, type SolidOptions } from "../solids.ts";
import { createRoomContent, type ViewerPick, type ViewerRecord } from "./content.ts";
import { LIGHT_THEME, type ViewerTheme } from "./theme.ts";
import { HOME_VIEW, TOP_VIEW } from "./view.ts";

export type { ViewerPick, ViewerRecord } from "./content.ts";

/** The name of a view: `home` looks into the room from a corner above it, and `top` shows the plan. */
export type ViewName = "home" | "top";

/** The options of a viewer. */
export interface RoomViewerOptions {
  readonly scene: Scene;
  /** The colors. The default is `LIGHT_THEME`. */
  readonly theme?: ViewerTheme | undefined;
  /** The options of the model. */
  readonly solids?: SolidOptions | undefined;
  /** The options of the picture of the marks, for example the radius of a sign. */
  readonly markers?: MarkersOptions | undefined;
  /**
   * The marks of the scene, in the space of the scene: meters, with the z axis up. `layerMarks` of the entry `/marks` gives them.
   * With no list, the picture has no mark.
   * The viewer draws no mark with a fault. `checkMarks` of `@mark1russell7/visuals/marks` tells each fault.
   */
  readonly marks?: readonly Mark[] | undefined;
  /** The name of the picture for a screen reader. */
  readonly label?: string | undefined;
  /**
   * The viewer starts this function when the pointer goes to a different record, or to no record.
   * `mark` is the mark under the pointer. `pick` is then the first solid of the record of the mark, or `undefined` for a record with no solid.
   */
  readonly onHover?: ((pick: ViewerPick | undefined, mark?: Mark) => void) | undefined;
  /** The viewer starts this function when a person selects a record with the pointer, or selects no record. The parameters are those of `onHover`. */
  readonly onSelect?: ((pick: ViewerPick | undefined, mark?: Mark) => void) | undefined;
}

/** A viewer of one scene in a page. */
export interface RoomViewer {
  /** The canvas of the viewer. It is in the container. */
  readonly canvas: HTMLCanvasElement;
  /** This function shows a different scene, with its marks. The view stays if a person moved it. With no list, the picture has no mark. */
  setScene(scene: Scene, marks?: readonly Mark[]): void;
  /** This function changes the colors. */
  setTheme(theme: ViewerTheme): void;
  /** This function moves the camera to a view that shows all of the model. */
  setView(view: ViewName): void;
  /**
   * This function highlights records, as the pointer does. An empty list removes the highlights.
   * A record is a record of a solid, or the record name of a mark, for example `electrical/1:nook-2`.
   */
  highlight(records: readonly (ViewerRecord | string)[]): void;
  /** This function selects one record, or no record. It does not start `onSelect`. */
  select(record: ViewerRecord | string | undefined): void;
  /**
   * This function shows only the marks that a test accepts, for example the marks of one kind. The pointer does not find a mark that the picture does not show.
   * The test stays for each subsequent scene. A test that accepts each mark shows all of them again.
   */
  showMarks(test: (mark: Mark) => boolean): void;
  /** This function removes the canvas and releases the memory of the graphics card. */
  dispose(): void;
}

/** The options of the content of a viewer: the options of the model and of the picture of the marks. */
export type ViewerContentOptions = Pick<RoomViewerOptions, "solids" | "markers">;

/** The record under the pointer for the stage: a solid of the room, or a mark. */
export type StageValue = ViewerPick | Mark;

/** This function gives the name of a record for the stage. */
export function nameOf(record: ViewerRecord | string): string {
  return typeof record === "string" ? record : solidRecord(record.kind, record.source);
}

/**
 * This function makes a function that gives the colors of the marks of a viewer theme.
 * The marks paint each field again for a new theme object. So the function gives the same object while the viewer theme is the same.
 * A theme with no colors of a field gives a field the color of its level.
 */
export function marksThemes(): (theme: ViewerTheme) => MarkersTheme {
  let from: ViewerTheme | undefined;
  let to: MarkersTheme | undefined;
  return (theme) => {
    if (to === undefined || theme !== from) {
      to = { sky: theme.sky, ground: theme.ground, levels: theme.levels, halo: theme.halo, accent: theme.accent, field: theme.field ?? [], fieldOpacity: theme.fieldOpacity };
    }
    from = theme;
    return to;
  };
}

/** The content of a viewer for one scene, with the functions that use its marks. */
export interface ViewerContent {
  /** The solids of the scene, and its marks above them. */
  readonly content: StageContent<StageValue, ViewerTheme>;
  /** This function shows only the marks that a test accepts. The test gets each mark as the scene has it. */
  show(test: (mark: Mark) => boolean): void;
  /**
   * This function gives a record of the stage as a page gets it.
   * A mark gives the first solid of its record and the mark as the scene has it. A solid gives the solid.
   */
  told(value: StageValue | undefined): readonly [pick: ViewerPick | undefined, mark: Mark | undefined];
}

/**
 * This function makes the content of a viewer for a scene: the solids, and the marks above them.
 *
 * `marks` are in the space of the scene: meters, with the z axis up. With no list, the content has no mark.
 * A mark with a fault is not in the content. The space of the content has the y axis up.
 */
export function createViewerContent(scene: Scene, marks?: readonly Mark[], options: ViewerContentOptions = {}): ViewerContent {
  const room = createRoomContent(scene, options.solids);
  const given = marks ?? [];
  const faulty = new Set(checkMarks(given).map((fault) => fault.index));
  const good = given.filter((_, index) => !faulty.has(index));
  const onStage = transformMarks(good, TO_Y_UP);
  /** The mark of the scene for each mark of the stage. */
  const inScene = new Map<Mark, Mark>(onStage.map((mark, index) => [mark, good[index] ?? mark]));
  const sceneMark = (mark: Mark): Mark => inScene.get(mark) ?? mark;
  const markers = createMarkers(onStage, options.markers);
  const themeOf = marksThemes();
  const above: StageContent<StageValue, ViewerTheme> = {
    objects: markers.objects,
    extent: markers.extent,
    has: (record) => markers.has(record),
    pick: (ray) => markers.pick(ray),
    paint(theme, highlight): void {
      markers.paint(themeOf(theme), highlight);
    },
    step: (frame) => markers.step?.(frame) ?? false,
    dispose(): void {
      markers.dispose();
    },
  };
  return {
    content: stackContents<StageValue, ViewerTheme>([room, above]),
    show(test): void {
      markers.show((mark) => test(sceneMark(mark)));
    },
    told(value) {
      if (value === undefined) return [undefined, undefined];
      return "type" in value ? [room.pickOf(value.record), sceneMark(value)] : [value, undefined];
    },
  };
}

/**
 * This function makes a viewer of a scene in a container of a page. The viewer fills the container, so give the container a size.
 *
 * A person turns the model with a drag, and moves nearer with the wheel after a click in the picture.
 * The walls between the camera and the room become almost clear. A click selects the record of a solid or of a mark.
 * With the keyboard, the arrow keys turn the model, `+` and `-` change the distance, `Home` shows the first view and `T` shows the plan.
 *
 * The viewer draws the marks of the scene with `@mark1russell7/visuals/markers`. A point is a sign with the color and the shape of its level.
 * A link shows while its record, or the record of one of its ends, has a highlight. A sign that a solid hides is less clear.
 *
 * The function gives `undefined` when the browser has no WebGL 2. It does not throw, and it writes no error to the console.
 */
export function createRoomViewer(container: HTMLElement, options: RoomViewerOptions): RoomViewer | undefined {
  let accepted: (mark: Mark) => boolean = () => true;
  let current = createViewerContent(options.scene, options.marks, options);
  /** This function gives a record of the stage to a function of the page. */
  const tell = (to: ((pick: ViewerPick | undefined, mark?: Mark) => void) | undefined, value: StageValue | undefined): void => {
    if (to === undefined) return;
    const [pick, mark] = current.told(value);
    if (mark === undefined) to(pick);
    else to(pick, mark);
  };

  const stage = createStage<StageValue, ViewerTheme>(container, {
    content: current.content,
    theme: options.theme ?? LIGHT_THEME,
    label: options.label ?? "3D model of the room",
    views: { home: fitView(HOME_VIEW), top: fitView(TOP_VIEW) },
    home: "home",
    keys: { t: "top" },
    onHover: (value) => tell(options.onHover, value),
    onSelect: (value) => tell(options.onSelect, value),
  });
  if (stage === undefined) {
    current.content.dispose();
    return undefined;
  }

  return {
    canvas: stage.canvas,
    setScene(scene: Scene, marks?: readonly Mark[]): void {
      current = createViewerContent(scene, marks, options);
      current.show(accepted);
      stage.setContent(current.content);
    },
    setTheme(theme: ViewerTheme): void {
      stage.setTheme(theme);
    },
    setView(view: ViewName): void {
      stage.setView(view);
    },
    highlight(records: readonly (ViewerRecord | string)[]): void {
      stage.highlight(records.map(nameOf));
    },
    select(record: ViewerRecord | string | undefined): void {
      stage.select(record === undefined ? undefined : nameOf(record));
    },
    showMarks(test: (mark: Mark) => boolean): void {
      accepted = test;
      current.show(test);
      stage.refresh();
    },
    dispose(): void {
      stage.dispose();
    },
  };
}
