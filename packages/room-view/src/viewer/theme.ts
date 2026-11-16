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
  readonly outlet: string;
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
  outlet: "#e2a400",
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
  outlet: "#ffd24a",
  object: "#2a5580",
  objects: { desk: "#2a5a8a", sofa: "#28527c", rack: "#16324e", computer: "#3a74ad", display: "#122a42" },
  sky: "#ffffff",
  ground: "#7f9bb8",
};
