import type { Point3 } from "@mark1russell7/layout-contract";
import { DirectionalLight, HemisphereLight, PerspectiveCamera, Raycaster, Scene as World, Vector2, Vector3, WebGLRenderer, type Object3D } from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { LoadOptions } from "../loads.ts";
import type { Scene } from "../room.ts";
import type { SolidKind, SolidOptions } from "../solids.ts";
import { hidingWalls } from "./fade.ts";
import { buildModel, disposeModel, paintLink, paintPart, recordName, type ModelPart, type PartMark, type RoomModel } from "./model.ts";
import { LIGHT_THEME, type ViewerTheme } from "./theme.ts";
import { cameraPosition, fitDistance, HOME_VIEW, TOP_VIEW, toRoom, turnBetween, viewOf, type ViewAngles } from "./view.ts";

/** A record of a scene that the viewer shows: a floor, a wall, a window, an outlet or a placed object. */
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

/** The name of a view: `home` looks into the room from a corner above it, and `top` shows the plan. */
export type ViewName = "home" | "top";

/** The options of a viewer. */
export interface RoomViewerOptions {
  readonly scene: Scene;
  /** The colors. The default is `LIGHT_THEME`. */
  readonly theme?: ViewerTheme | undefined;
  /** The options of the model. */
  readonly solids?: SolidOptions | undefined;
  /** The options of the levels of the circuits. */
  readonly loads?: LoadOptions | undefined;
  /** The name of the picture for a screen reader. */
  readonly label?: string | undefined;
  /** The viewer starts this function when the pointer goes to a different record, or to no record. */
  readonly onHover?: ((pick: ViewerPick | undefined) => void) | undefined;
  /** The viewer starts this function when a person selects a record with the pointer, or selects no record. */
  readonly onSelect?: ((pick: ViewerPick | undefined) => void) | undefined;
}

/** A viewer of one scene in a page. */
export interface RoomViewer {
  /** The canvas of the viewer. It is in the container. */
  readonly canvas: HTMLCanvasElement;
  /** This function shows a different scene. The view stays if a person moved it. */
  setScene(scene: Scene): void;
  /** This function changes the colors. */
  setTheme(theme: ViewerTheme): void;
  /** This function moves the camera to a view that shows all of the model. */
  setView(view: ViewName): void;
  /** This function marks records, as the pointer does. An empty list removes the marks. */
  highlight(records: readonly ViewerRecord[]): void;
  /** This function selects one record, or no record. It does not start `onSelect`. */
  select(record: ViewerRecord | undefined): void;
  /** This function removes the canvas and releases the memory of the graphics card. */
  dispose(): void;
}

/** The vertical angle of the picture, in degrees. A small angle gives the look of a drawing. */
const FIELD_OF_VIEW = 32;

/** The space around the model in a view that shows all of it, as a factor of the distance. */
const MARGIN = 1.06;

/** The time of the move between two views, in milliseconds. */
const MOVE_TIME = 380;

/** The time in which a wall goes most of the way to clear or to solid, in seconds. */
const FADE_TIME = 0.11;

/** A pointer that moves less than this distance between down and up is a click, in CSS pixels. */
const CLICK_DISTANCE = 4;

/** The angle of one step of an arrow key, in radians. */
const KEY_TURN = Math.PI / 24;

/** The smallest polar angle. At 0, the azimuth of a camera has no meaning. */
const SMALLEST_POLAR = 0.0005;

/** The largest polar angle: the camera stays above the floor. */
const LARGEST_POLAR = Math.PI / 2 - 0.05;

/** A solid hides a marker when it is this distance or more before the outlet, in meters. */
const SIGHT_MARGIN = 0.06;

/** A place of the camera: the point that it looks at, the angles and the distance. */
interface Place extends ViewAngles {
  readonly target: Point3;
  readonly distance: number;
}

/** A move of the camera from one place to a different place. */
interface Move {
  readonly from: Place;
  readonly to: Place;
  readonly start: number;
}

/** This function tells if the person asks for less motion. */
function lessMotion(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * This function makes a viewer of a scene in a container of a page. The viewer fills the container, so give the container a size.
 *
 * A person turns the model with a drag, and moves nearer with the wheel after a click in the picture.
 * The walls between the camera and the room become almost clear. A click selects the record of a solid.
 * Each outlet has a marker with the color and the shape of the level of its circuit. A marker keeps its size in the picture.
 * A marked outlet or object shows a line from the outlet to each object that takes its power from it.
 * With the keyboard, the arrow keys turn the model, `+` and `-` change the distance, `Home` shows the first view and `T` shows the plan.
 *
 * The function gives `undefined` when the browser has no WebGL 2. It does not throw, and it writes no error to the console.
 */
export function createRoomViewer(container: HTMLElement, options: RoomViewerOptions): RoomViewer | undefined {
  const canvas = container.ownerDocument.createElement("canvas");
  const context = canvas.getContext("webgl2", { alpha: true, antialias: true, depth: true, stencil: false, premultipliedAlpha: true, powerPreference: "default" });
  if (context === null) return undefined;
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, context, alpha: true, antialias: true });
  } catch {
    return undefined;
  }
  renderer.setClearColor(0x000000, 0);

  canvas.style.display = "block";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.cursor = "grab";
  canvas.tabIndex = 0;
  canvas.setAttribute("role", "application");
  canvas.setAttribute("aria-label", options.label ?? "3D model of the room");
  container.append(canvas);

  const world = new World();
  const sky = new HemisphereLight("#ffffff", "#ffffff", 2.2);
  const sun = new DirectionalLight("#ffffff", 1.5);
  sun.position.set(-10, 24, 15);
  world.add(sky, sun);
  const camera = new PerspectiveCamera(FIELD_OF_VIEW, 1, 0.05, 1000);

  let scene = options.scene;
  let theme = options.theme ?? LIGHT_THEME;
  let model: RoomModel = buildModel(scene, options.solids, options.loads);
  world.add(model.group, model.overlay);

  let hovered: string | undefined;
  let selected: string | undefined;
  let marked: ReadonlySet<string> = new Set();
  let hiding: ReadonlySet<string> = new Set();
  let view: ViewName = "home";
  let move: Move | undefined;
  /** This value is true after a person moved the view. Then a new size of the container does not move the camera. */
  let moved = false;
  /** The height of the picture, in CSS pixels. */
  let viewHeight = 1;
  let frame = 0;
  let lastTime = 0;
  let disposed = false;

  const invalidate = (): void => {
    if (frame === 0 && !disposed) frame = requestAnimationFrame(tick);
  };

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = !lessMotion();
  controls.dampingFactor = 0.14;
  controls.maxPolarAngle = LARGEST_POLAR;
  controls.rotateSpeed = 0.9;
  controls.screenSpacePanning = true;
  // The wheel moves the page until a person uses the picture. Thus the picture does not stop a person who reads down the page.
  controls.enableZoom = false;

  const markOfRecord = (record: string): PartMark => (record === selected ? 2 : record === hovered || marked.has(record) ? 1 : 0);
  const markOf = (part: ModelPart): PartMark => markOfRecord(part.record);
  const paintAll = (): void => {
    for (const part of model.parts) paintPart(part, scene, theme, markOf(part));
    // A link shows while its outlet or its object has a mark.
    for (const link of model.links) paintLink(link, theme, markOfRecord(link.outlet) !== 0 || markOfRecord(link.object) !== 0);
    invalidate();
  };
  const pickOf = (part: ModelPart): ViewerPick => ({ solid: part.solid.id, kind: part.solid.kind, source: part.solid.source });

  const place = (to: Place): void => {
    const polar = Math.min(Math.max(to.polar, SMALLEST_POLAR), LARGEST_POLAR);
    const distance = Math.min(Math.max(to.distance, controls.minDistance), controls.maxDistance);
    const eye = cameraPosition(to.target, { polar, azimuth: to.azimuth }, distance);
    controls.target.set(to.target.x, to.target.y, to.target.z);
    camera.position.set(eye.x, eye.y, eye.z);
    camera.lookAt(controls.target);
  };
  const placeNow = (): Place => {
    const target = { x: controls.target.x, y: controls.target.y, z: controls.target.z };
    return { target, ...viewOf(camera.position, target) };
  };
  const fit = (name: ViewName): Place => {
    const angles = name === "top" ? TOP_VIEW : HOME_VIEW;
    const distance = fitDistance(model.corners, model.center, angles, FIELD_OF_VIEW, camera.aspect) * MARGIN;
    return { target: model.center, ...angles, distance: distance > 0 ? distance : 10 };
  };
  /** This function sets the nearest and the farthest distance of the camera from the size of the model. */
  const setLimits = (): void => {
    const far = Math.max(fit("home").distance, fit("top").distance);
    controls.minDistance = 0.4;
    controls.maxDistance = far * 3;
    camera.far = far * 8 + 100;
    camera.updateProjectionMatrix();
  };
  /**
   * This function stops the turn that continues after a drag. The camera stays where it is.
   * Without it, the camera continues to turn after a move to a view, and the view is not exact.
   */
  const stopDrift = (): void => {
    if (!controls.enableDamping) return;
    const now = placeNow();
    // With no damping, an update of the controls uses all of the turn that remains. The camera then goes back.
    controls.enableDamping = false;
    controls.update();
    controls.enableDamping = true;
    place(now);
  };
  const goTo = (name: ViewName, animate: boolean): void => {
    view = name;
    moved = false;
    stopDrift();
    const to = fit(name);
    if (animate && !lessMotion()) {
      move = { from: placeNow(), to, start: performance.now() };
    } else {
      move = undefined;
      place(to);
    }
    invalidate();
  };

  /** This function sets the size of the picture from the size of the container. It gives false for a container with no size. */
  const setSize = (): boolean => {
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (width === 0 || height === 0) return false;
    viewHeight = height;
    renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio, 2));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    return true;
  };

  /** This function moves the camera one step of a move between two views. It gives true while the move continues. */
  const stepMove = (now: number): boolean => {
    if (move === undefined) return false;
    const { from, to } = move;
    const part = Math.min(Math.max((now - move.start) / MOVE_TIME, 0), 1);
    const eased = part < 0.5 ? 4 * part * part * part : 1 - (-2 * part + 2) ** 3 / 2;
    const between = (a: number, b: number): number => a + (b - a) * eased;
    place({
      target: { x: between(from.target.x, to.target.x), y: between(from.target.y, to.target.y), z: between(from.target.z, to.target.z) },
      polar: between(from.polar, to.polar),
      azimuth: from.azimuth + turnBetween(from.azimuth, to.azimuth) * eased,
      distance: between(from.distance, to.distance),
    });
    if (part >= 1) move = undefined;
    return true;
  };

  /**
   * This function moves the fade of each wall one step to its goal: clear for a wall that hides the room, solid for the others.
   * `seconds` is the time since the last picture, and 0 sets each goal immediately. It gives true while a wall changes.
   */
  const stepFade = (seconds: number): boolean => {
    hiding = hidingWalls(model.shades, toRoom(camera.position));
    const rate = seconds > 0 ? 1 - Math.exp(0 - seconds / FADE_TIME) : 1;
    let active = false;
    for (const part of model.parts) {
      if (part.wall === undefined) continue;
      const goal = hiding.has(part.wall) ? 1 : 0;
      if (part.fade === goal) continue;
      const next = part.fade + (goal - part.fade) * rate;
      part.fade = Math.abs(goal - next) < 0.01 ? goal : next;
      paintPart(part, scene, theme, markOf(part));
      active = active || part.fade !== goal;
    }
    return active;
  };

  const sight = new Raycaster();
  const forward = new Vector3();
  const offset = new Vector3();
  /**
   * This function turns each marker to the camera and gives it its size in the picture.
   * It also finds each marker with a solid between the camera and its outlet: such a marker is less clear.
   */
  const stepOverlay = (): void => {
    const perPixel = (2 * Math.tan((FIELD_OF_VIEW * Math.PI) / 360)) / viewHeight;
    camera.getWorldDirection(forward);
    model.group.updateMatrixWorld();
    // Glass, a clear wall and a clear box of objects hide nothing.
    const blockers = model.parts
      .filter((part) => {
        const kind = part.solid.kind;
        return kind === "floor" || (kind === "wall" && !hiding.has(part.solid.source)) || (kind === "object" && !part.holds);
      })
      .map((part) => part.mesh);
    for (const part of model.parts) {
      const marker = part.marker;
      if (marker === undefined) continue;
      offset.subVectors(marker.root.position, camera.position);
      const distance = offset.length();
      marker.root.quaternion.copy(camera.quaternion);
      marker.root.scale.setScalar(Math.max(offset.dot(forward), 0.01) * perPixel * marker.radius);
      sight.set(camera.position, offset.divideScalar(Math.max(distance, 1e-9)));
      sight.far = distance - SIGHT_MARGIN;
      const hidden = sight.far > 0 && sight.intersectObjects(blockers, false).length > 0;
      if (hidden === marker.hidden) continue;
      marker.hidden = hidden;
      paintPart(part, scene, theme, markOf(part));
    }
  };

  function tick(now: number): void {
    frame = 0;
    if (disposed) return;
    const seconds = lastTime === 0 ? 1 / 60 : Math.min((now - lastTime) / 1000, 0.1);
    let active = stepMove(now);
    active = controls.update() || active;
    active = stepFade(lessMotion() ? 0 : seconds) || active;
    stepOverlay();
    renderer.render(world, camera);
    lastTime = active ? now : 0;
    if (active) invalidate();
  }

  const raycaster = new Raycaster();
  const pointer = new Vector2();
  /**
   * This function gives the part under a pointer. A wall that hides the room is clear, and the pointer goes through it.
   * The marker of an outlet is above each solid in the picture, so the pointer selects a marker first.
   */
  const partAt = (event: PointerEvent): ModelPart | undefined => {
    const box = canvas.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return undefined;
    pointer.set(((event.clientX - box.left) / box.width) * 2 - 1, 1 - ((event.clientY - box.top) / box.height) * 2);
    raycaster.setFromCamera(pointer, camera);
    const bySign = new Map<Object3D, ModelPart>();
    for (const part of model.parts) if (part.marker !== undefined) bySign.set(part.marker.back, part);
    const sign = raycaster.intersectObjects([...bySign.keys()], false)[0];
    if (sign !== undefined) return bySign.get(sign.object);
    const open = model.parts.filter((part) => part.wall === undefined || !hiding.has(part.wall));
    const byMesh = new Map<Object3D, ModelPart>(open.map((part) => [part.mesh, part]));
    const hits = raycaster.intersectObjects(
      open.map((part) => part.mesh),
      false,
    );
    const first = hits[0] === undefined ? undefined : byMesh.get(hits[0].object);
    if (first === undefined || !first.holds) return first;
    // A clear box of objects: the pointer selects an object in the box before the box.
    for (const hit of hits) {
      const part = byMesh.get(hit.object);
      if (part !== undefined && part.holder === first.record) return part;
    }
    return first;
  };

  const setHover = (part: ModelPart | undefined): void => {
    const record = part?.record;
    if (record === hovered) return;
    hovered = record;
    canvas.style.cursor = record === undefined ? "grab" : "pointer";
    paintAll();
    options.onHover?.(part === undefined ? undefined : pickOf(part));
  };

  const listeners = new AbortController();
  const signal = listeners.signal;
  let down: { readonly id: number; readonly x: number; readonly y: number } | undefined;
  const setInUse = (inUse: boolean): void => {
    controls.enableZoom = inUse;
  };
  canvas.addEventListener(
    "pointerdown",
    (event) => {
      setInUse(true);
      canvas.focus({ preventScroll: true });
      down = { id: event.pointerId, x: event.clientX, y: event.clientY };
    },
    { signal },
  );
  canvas.addEventListener(
    "pointermove",
    (event) => {
      if (event.buttons === 0 && event.pointerType !== "touch") setHover(partAt(event));
    },
    { signal },
  );
  canvas.addEventListener(
    "pointerup",
    (event) => {
      const start = down;
      down = undefined;
      if (start === undefined || start.id !== event.pointerId) return;
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > CLICK_DISTANCE) return;
      const part = partAt(event);
      selected = part?.record;
      paintAll();
      options.onSelect?.(part === undefined ? undefined : pickOf(part));
    },
    { signal },
  );
  canvas.addEventListener(
    "pointercancel",
    () => {
      down = undefined;
    },
    { signal },
  );
  canvas.addEventListener(
    "pointerleave",
    (event) => {
      setHover(undefined);
      if (event.pointerType === "mouse") setInUse(false);
    },
    { signal },
  );
  canvas.addEventListener("blur", () => setInUse(false), { signal });
  canvas.addEventListener(
    "keydown",
    (event) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const now = placeNow();
      let to: Place | undefined;
      if (event.key === "ArrowLeft") to = { ...now, azimuth: now.azimuth - KEY_TURN };
      else if (event.key === "ArrowRight") to = { ...now, azimuth: now.azimuth + KEY_TURN };
      else if (event.key === "ArrowUp") to = { ...now, polar: now.polar - KEY_TURN };
      else if (event.key === "ArrowDown") to = { ...now, polar: now.polar + KEY_TURN };
      else if (event.key === "+" || event.key === "=") to = { ...now, distance: now.distance * 0.85 };
      else if (event.key === "-" || event.key === "_") to = { ...now, distance: now.distance / 0.85 };
      else if (event.key === "Home" || event.key === "0") goTo("home", true);
      else if (event.key === "t" || event.key === "T") goTo("top", true);
      else return;
      event.preventDefault();
      setInUse(true);
      if (to === undefined) return;
      moved = true;
      move = undefined;
      place(to);
      invalidate();
    },
    { signal },
  );
  canvas.addEventListener("webglcontextlost", (event) => event.preventDefault(), { signal });
  canvas.addEventListener("webglcontextrestored", invalidate, { signal });

  controls.addEventListener("start", () => {
    moved = true;
    move = undefined;
    canvas.style.cursor = "grabbing";
    invalidate();
  });
  controls.addEventListener("end", () => {
    canvas.style.cursor = hovered === undefined ? "grab" : "pointer";
  });
  controls.addEventListener("change", invalidate);

  const applyTheme = (): void => {
    sky.color.set(theme.sky);
    sky.groundColor.set(theme.ground);
    paintAll();
  };

  const observer = new ResizeObserver(() => {
    if (disposed || !setSize()) return;
    setLimits();
    if (!moved) goTo(view, false);
    invalidate();
  });

  setSize();
  setLimits();
  goTo("home", false);
  stepFade(0);
  applyTheme();
  observer.observe(container);

  return {
    canvas,
    setScene(next: Scene): void {
      world.remove(model.group, model.overlay);
      disposeModel(model);
      scene = next;
      model = buildModel(scene, options.solids, options.loads);
      world.add(model.group, model.overlay);
      hovered = undefined;
      if (selected !== undefined && !model.parts.some((part) => part.record === selected)) selected = undefined;
      setLimits();
      if (!moved) goTo(view, false);
      stepFade(0);
      paintAll();
    },
    setTheme(next: ViewerTheme): void {
      theme = next;
      applyTheme();
    },
    setView(name: ViewName): void {
      goTo(name, true);
    },
    highlight(records: readonly ViewerRecord[]): void {
      marked = new Set(records.map((record) => recordName(record.kind, record.source)));
      paintAll();
    },
    select(record: ViewerRecord | undefined): void {
      selected = record === undefined ? undefined : recordName(record.kind, record.source);
      paintAll();
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      listeners.abort();
      controls.dispose();
      world.remove(model.group, model.overlay);
      disposeModel(model);
      renderer.dispose();
      canvas.remove();
    },
  };
}
