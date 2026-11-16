import { planShapes, type PlanShape } from "@mark1russell7/room-view";
import type { RoomViewer, RoomViewerOptions, ViewerPick, ViewerRecord, ViewerTheme } from "@mark1russell7/room-view/three";

/** The part of a viewer that the page uses. The 3D viewer and the plan have these functions. */
export type RoomStage = Pick<RoomViewer, "setTheme" | "setView" | "highlight" | "select" | "dispose">;

/** The height of the cut of the plan above the floor, in meters. A door is a gap in its wall at this height. */
const CUT = 1.2;

/** The space around the plan, in meters. */
const MARGIN = 0.25;

/** The radius of the mark of an outlet, in meters. The plate of an outlet is too small for a plan. */
const OUTLET_RADIUS = 0.09;

const SVG = "http://www.w3.org/2000/svg";

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Readonly<Record<string, string>>): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG, tag);
  for (const [name, value] of Object.entries(attrs)) element.setAttribute(name, value);
  return element;
}

const keyOf = (record: ViewerRecord): string => `${record.kind}:${record.source}`;

/** This function gives the outline of a shape as the data of a path. The y axis of a plan points up, and that of a picture points down. */
function pathOf(shape: PlanShape): string {
  return `${shape.ring.map(([x, y], index) => `${index === 0 ? "M" : "L"}${String(x)} ${String(-y)}`).join(" ")} Z`;
}

/** This function makes the element of a shape: a circle for an outlet, and the outline for each other shape. */
function elementOf(shape: PlanShape): SVGGeometryElement {
  if (shape.kind !== "outlet") return svg("path", { d: pathOf(shape) });
  const x = shape.ring.reduce((sum, point) => sum + point[0], 0) / shape.ring.length;
  const y = shape.ring.reduce((sum, point) => sum + point[1], 0) / shape.ring.length;
  return svg("circle", { cx: String(x), cy: String(-y), r: String(OUTLET_RADIUS) });
}

/**
 * This function shows the plan of a scene as a drawing, for a browser that has no WebGL 2.
 * The drawing shows the room from above, with a cut through the walls. A person can point at a part and select it, as in the 3D viewer.
 */
export function createPlanView(container: HTMLElement, options: RoomViewerOptions & { readonly theme: ViewerTheme }): RoomStage {
  const { scene } = options;
  // An outlet is above each other shape, so that a wall does not hide it.
  const cut = planShapes(scene, { ...options.solids, cut: CUT });
  const shapes = [...cut.filter((shape) => shape.kind !== "outlet"), ...cut.filter((shape) => shape.kind === "outlet")];
  const points = shapes.flatMap((shape) => shape.ring);
  // A scene with no solid has a plan of 1 by 1 m.
  const xs = points.length === 0 ? [0, 1] : points.map(([x]) => x);
  const ys = points.length === 0 ? [0, 1] : points.map(([, y]) => y);
  const left = Math.min(...xs) - MARGIN;
  const right = Math.max(...xs) + MARGIN;
  const bottom = Math.min(...ys) - MARGIN;
  const top = Math.max(...ys) + MARGIN;

  const picture = svg("svg", { class: "plan", viewBox: `${String(left)} ${String(-top)} ${String(right - left)} ${String(top - bottom)}`, role: "img" });
  picture.setAttribute("aria-label", options.label ?? "Plan of the room");
  const fills = svg("g", {});
  const marks = svg("g", { class: "plan-marks" });
  picture.append(fills, marks);

  const parts = shapes.map((shape) => {
    const element = elementOf(shape);
    element.dataset["record"] = keyOf(shape);
    element.setAttribute("vector-effect", "non-scaling-stroke");
    fills.append(element);
    return { shape, element };
  });

  let theme = options.theme;
  let highlighted: readonly ViewerRecord[] = [];
  let selected: ViewerRecord | undefined;
  let hovered: string | undefined;

  const kindOf = (source: string): string | undefined => scene.objects?.find((object) => object.id === source)?.kind;

  function fillOf(shape: PlanShape, colors: ViewerTheme): string {
    if (shape.kind === "floor") return colors.floor;
    // A wall that the cut goes through is solid, as in a plan on paper. A low part of a wall, below a window, is not.
    if (shape.kind === "wall") return shape.top > CUT ? colors.edge : colors.wall;
    if (shape.kind === "glass") return colors.glass;
    if (shape.kind === "outlet") return colors.outlet;
    return colors.objects[kindOf(shape.source) ?? ""] ?? colors.object;
  }

  function paint(): void {
    for (const { shape, element } of parts) {
      element.setAttribute("fill", fillOf(shape, theme));
      element.setAttribute("stroke", shape.kind === "floor" ? "none" : theme.edge);
      element.setAttribute("stroke-width", "1");
    }
    const strong = selected === undefined ? undefined : keyOf(selected);
    const light = new Set(highlighted.map(keyOf));
    marks.replaceChildren();
    for (const { shape } of parts) {
      const key = keyOf(shape);
      if (key !== strong && !light.has(key)) continue;
      const mark = elementOf(shape);
      mark.setAttribute("vector-effect", "non-scaling-stroke");
      mark.setAttribute("fill", theme.accent);
      mark.setAttribute("fill-opacity", key === strong ? "0.55" : "0.3");
      mark.setAttribute("stroke", theme.accent);
      mark.setAttribute("stroke-width", key === strong ? "4" : "2.5");
      marks.append(mark);
    }
  }

  /** This function gives the shape under the pointer, as the 3D viewer gives a solid. */
  function pickAt(target: EventTarget | null): ViewerPick | undefined {
    const shape = parts.find((item) => item.element === target)?.shape;
    return shape === undefined ? undefined : { kind: shape.kind, source: shape.source, solid: shape.solid };
  }

  const abort = new AbortController();
  picture.addEventListener(
    "pointermove",
    (event) => {
      if (event.pointerType === "touch") return;
      const pick = pickAt(event.target);
      const key = pick === undefined ? undefined : keyOf(pick);
      if (key === hovered) return;
      hovered = key;
      options.onHover?.(pick);
    },
    { signal: abort.signal },
  );
  picture.addEventListener(
    "pointerleave",
    () => {
      if (hovered === undefined) return;
      hovered = undefined;
      options.onHover?.(undefined);
    },
    { signal: abort.signal },
  );
  picture.addEventListener(
    "click",
    (event) => {
      const pick = pickAt(event.target);
      selected = pick;
      paint();
      options.onSelect?.(pick);
    },
    { signal: abort.signal },
  );

  container.append(picture);
  paint();

  return {
    setTheme(next): void {
      theme = next;
      paint();
    },
    // A plan has one view.
    setView(): void {},
    highlight(records): void {
      highlighted = records;
      paint();
    },
    select(record): void {
      selected = record;
      paint();
    },
    dispose(): void {
      abort.abort();
      picture.remove();
    },
  };
}
