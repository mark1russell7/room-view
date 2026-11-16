// The three.js viewer of a scene. This entry needs the package `three`, and a browser for `createRoomViewer`.
export { solidGeometry, type SolidPlacement } from "./viewer/geometry.ts";
export { DARK_THEME, LIGHT_THEME, type ViewerTheme } from "./viewer/theme.ts";
export { createRoomViewer, type RoomViewer, type RoomViewerOptions, type ViewerPick, type ViewerRecord, type ViewName } from "./viewer/viewer.ts";
