import type { Level } from "@mark1russell7/visuals/marks";

/**
 * The colors of a viewer. Each color is a CSS hex color, for example `#22364a`.
 * The viewer has no background: the page shows behind the model.
 */
export interface ViewerTheme {
  /** The color of the edges of each solid. */
  readonly edge: string;
  /** The color that marks the solids under the pointer and the selected solids. */
  readonly accent: string;
  readonly floor: string;
  readonly wall: string;
  readonly glass: string;
  /** The part of the glass that is not clear, from 0 to 1. */
  readonly glassOpacity: number;
  /** The color of the marks of each level. */
  readonly levels: Readonly<Record<Level, string>>;
  /** The color of the line around the sign of a mark. It is the color of the page, so a sign is clear on each solid. */
  readonly halo: string;
  /**
   * The colors of a field mark, from the value `min` of its scale to the value `max`.
   * A theme with no such list gives a field the color of its level.
   */
  readonly field?: readonly string[] | undefined;
  /** The part of a field mark that is not clear, from 0 to 1. The default is 0.8. */
  readonly fieldOpacity?: number | undefined;
  /** The color of a placed object whose kind has no color in `objects`. */
  readonly object: string;
  /** The color of the placed objects of each kind. The key is the field `kind` of a placed object. */
  readonly objects: Readonly<Record<string, string>>;
  /** The color of the light from above. */
  readonly sky: string;
  /** The color of the light from below. */
  readonly ground: string;
}

/** The colors of a model of white card with ink edges, for a light page. */
export const LIGHT_THEME: ViewerTheme = {
  edge: "#22364a",
  accent: "#f2b705",
  floor: "#dfe5ea",
  wall: "#fcfcfb",
  glass: "#8fc4e8",
  glassOpacity: 0.35,
  levels: { unknown: "#55677a", ok: "#1f5fa8", near: "#d9662f", over: "#c62f2f" },
  halo: "#ffffff",
  object: "#b8c0c8",
  objects: { desk: "#c9b596", sofa: "#8fa3b5", rack: "#3d4954", computer: "#5b6d7e", display: "#2c3640" },
  sky: "#ffffff",
  ground: "#b9c3cd",
};

/** The colors of a blueprint, for a dark page. */
export const DARK_THEME: ViewerTheme = {
  edge: "#cfe6ff",
  accent: "#ffd24a",
  floor: "#17395a",
  wall: "#1f4a73",
  glass: "#9fd0ff",
  glassOpacity: 0.25,
  levels: { unknown: "#a9bfd4", ok: "#6fb3f2", near: "#f5a962", over: "#f0625f" },
  halo: "#0e2740",
  object: "#2a5580",
  objects: { desk: "#2a5a8a", sofa: "#28527c", rack: "#16324e", computer: "#3a74ad", display: "#122a42" },
  sky: "#ffffff",
  ground: "#7f9bb8",
};
