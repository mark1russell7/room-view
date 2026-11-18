import { planShapes, solidRecord, type PlanShape } from "@mark1russell7/room-view";
import type { RoomViewer, RoomViewerOptions, ViewerPick, ViewerRecord, ViewerTheme } from "@mark1russell7/room-view/three";
import { SHAPE_OUTLINES, levelShape, shapeRing, type LevelShape, type Mark, type PointMark } from "@mark1russell7/visuals/marks";

/** The part of a viewer that the page uses. The 3D viewer and the plan have these functions. */
export type RoomStage = Pick<RoomViewer, "setTheme" | "setView" | "highlight" | "select" | "dispose">;

/** The height of the cut of the plan above the floor, in meters. A door is a gap in its wall at this height. */
const CUT = 1.2;

/** The space around the plan, in meters. */
const MARGIN = 0.25;

/** The radius of the sign of a point mark with a disc, in meters. */
const SIGN_RADIUS = 0.09;

/** The size of the line that marks a selected sign, as a factor of the size of the sign. */
const SIGN_MARK = 1.5;

const SVG = "http://www.w3.org/2000/svg";

/** This function makes an element of a drawing with its attributes. */
export function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Readonly<Record<string, string>>): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG, tag);
  for (const [name, value] of Object.entries(attrs)) element.setAttribute(name, value);
  return element;
}

/** This function gives the name of a record of the viewer. A record name stays as it is. */
const keyOf = (record: ViewerRecord | string): string => (typeof record === "string" ? record : solidRecord(record.kind, record.source));

/** This function gives the outline of a shape as the data of a path. The y axis of a plan points up, and that of a picture points down. */
function pathOf(shape: PlanShape): string {
  return `${shape.ring.map(([x, y], index) => `${index === 0 ? "M" : "L"}${String(x)} ${String(-y)}`).join(" ")} Z`;
}

/**
 * This function gives the outline of a sign as the data of a path, around a point of the plan.
 * `factor` changes the size: 1 gives the outline of the sign.
 */
export function signPath(center: readonly [number, number], sign: LevelShape, factor: number): string {
  const [x, y] = center;
  const corners = shapeRing(sign, SIGN_RADIUS * factor);
  return `${corners.map(([dx, dy], index) => `${index === 0 ? "M" : "L"}${String(x + dx)} ${String(-(y + dy))}`).join(" ")} Z`;
}

/** This function gives the point of the plan below a point mark. */
const centerOf = (mark: PointMark): readonly [number, number] => [mark.frame.at.x, mark.frame.at.y];

/** A part of the drawing: a shape of the scene, or the sign of a point mark. */
type Part = { readonly key: string; readonly element: SVGPathElement } & ({ readonly shape: PlanShape } | { readonly mark: PointMark });

/** The part under the pointer: the pick of a shape, as the 3D viewer gives a solid, or a point mark. */
interface Hit {
  readonly key: string;
  readonly pick: ViewerPick | undefined;
  readonly mark: Mark | undefined;
}

/**
 * This function shows the plan of a scene as a drawing, for a browser that has no WebGL 2.
 * The drawing shows the room from above, with a cut through the walls. A person can point at a part and select it, as in the 3D viewer.
 * Each point mark is a sign at its point, above the shapes. The plan does not show the other kinds of marks.
 */
export function createPlanView(container: HTMLElement, options: RoomViewerOptions & { readonly theme: ViewerTheme }): RoomStage {
  const { scene } = options;
  const shapes = planShapes(scene, { ...options.solids, cut: CUT });
  const points = (options.marks ?? []).filter((mark: Mark): mark is PointMark => mark.type === "point");
  const corners = [...shapes.flatMap((shape) => shape.ring), ...points.map(centerOf)];
  // A scene with no solid and no mark has a plan of 1 by 1 m.
  const xs = corners.length === 0 ? [0, 1] : corners.map(([x]) => x);
  const ys = corners.length === 0 ? [0, 1] : corners.map(([, y]) => y);
  const left = Math.min(...xs) - MARGIN;
  const right = Math.max(...xs) + MARGIN;
  const bottom = Math.min(...ys) - MARGIN;
  const top = Math.max(...ys) + MARGIN;

  const picture = svg("svg", { class: "plan", viewBox: `${String(left)} ${String(-top)} ${String(right - left)} ${String(top - bottom)}`, role: "img" });
  picture.setAttribute("aria-label", options.label ?? "Plan of the room");
  const fills = svg("g", {});
  const signs = svg("g", { class: "plan-signs" });
  const marks = svg("g", { class: "plan-marks" });
  // A sign is above each shape, so that a wall does not hide it.
  picture.append(fills, signs, marks);

  const parts: Part[] = [
    ...shapes.map((shape): Part => {
      const element = svg("path", { d: pathOf(shape), "stroke-width": "1", "vector-effect": "non-scaling-stroke" });
      element.dataset["record"] = keyOf(shape);
      fills.append(element);
      return { key: keyOf(shape), element, shape };
    }),
    ...points.map((mark): Part => {
      const sign = levelShape(mark.level);
      const outline = SHAPE_OUTLINES[sign];
      // The line of a ring is its sign: it is between the hole and the outline, and its width is in meters.
      const ring = outline.hole > 0;
      const element = svg("path", { d: signPath(centerOf(mark), sign, ring ? (1 + outline.hole / outline.radius) / 2 : 1) });
      if (ring) element.setAttribute("stroke-width", String((outline.radius - outline.hole) * SIGN_RADIUS));
      else {
        element.setAttribute("stroke-width", "1.5");
        element.setAttribute("vector-effect", "non-scaling-stroke");
      }
      element.dataset["record"] = mark.record;
      element.dataset["shape"] = sign;
      element.dataset["level"] = mark.level;
      signs.append(element);
      return { key: mark.record, element, mark };
    }),
  ];

  let theme = options.theme;
  let highlighted: readonly (ViewerRecord | string)[] = [];
  let selected: ViewerRecord | string | undefined;
  let hovered: string | undefined;

  const kindOf = (source: string): string | undefined => scene.objects?.find((object) => object.id === source)?.kind;

  function fillOf(shape: PlanShape, colors: ViewerTheme): string {
    if (shape.kind === "floor") return colors.floor;
    // A wall that the cut goes through is solid, as in a plan on paper. A low part of a wall, below a window, is not.
    if (shape.kind === "wall") return shape.top > CUT ? colors.edge : colors.wall;
    if (shape.kind === "glass") return colors.glass;
    return colors.objects[kindOf(shape.source) ?? ""] ?? colors.object;
  }

  function paint(): void {
    for (const part of parts) {
      if ("mark" in part) {
        // A sign has the color and the shape of its level, with the color of the page around it or in it.
        const color = theme.levels[part.mark.level];
        const ring = SHAPE_OUTLINES[levelShape(part.mark.level)].hole > 0;
        part.element.setAttribute("fill", ring ? theme.halo : color);
        part.element.setAttribute("stroke", ring ? color : theme.halo);
        continue;
      }
      part.element.setAttribute("fill", fillOf(part.shape, theme));
      part.element.setAttribute("stroke", part.shape.kind === "floor" ? "none" : theme.edge);
    }
    const strong = selected === undefined ? undefined : keyOf(selected);
    const light = new Set(highlighted.map(keyOf));
    marks.replaceChildren();
    for (const part of parts) {
      if (part.key !== strong && !light.has(part.key)) continue;
      // The mark of a sign is a line around it, so the color of the sign stays.
      const sign = "mark" in part;
      const mark = svg("path", { d: sign ? signPath(centerOf(part.mark), levelShape(part.mark.level), SIGN_MARK) : pathOf(part.shape) });
      mark.setAttribute("vector-effect", "non-scaling-stroke");
      mark.setAttribute("fill", sign ? "none" : theme.accent);
      mark.setAttribute("fill-opacity", part.key === strong ? "0.55" : "0.3");
      mark.setAttribute("stroke", theme.accent);
      mark.setAttribute("stroke-width", part.key === strong ? "4" : "2.5");
      marks.append(mark);
    }
  }

  function hitAt(target: EventTarget | null): Hit | undefined {
    const part = parts.find((item) => item.element === target);
    if (part === undefined) return undefined;
    if ("mark" in part) return { key: part.key, pick: undefined, mark: part.mark };
    return { key: part.key, pick: { kind: part.shape.kind, source: part.shape.source, solid: part.shape.solid }, mark: undefined };
  }

  const abort = new AbortController();
  picture.addEventListener(
    "pointermove",
    (event) => {
      if (event.pointerType === "touch") return;
      const hit = hitAt(event.target);
      if (hit?.key === hovered) return;
      hovered = hit?.key;
      options.onHover?.(hit?.pick, hit?.mark);
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
      const hit = hitAt(event.target);
      selected = hit?.mark === undefined ? hit?.pick : hit.key;
      paint();
      options.onSelect?.(hit?.pick, hit?.mark);
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
