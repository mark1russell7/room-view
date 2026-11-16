// The probe of the home page for the command `site-pages check`. The check runs this code in the page, at each width.
// It tests the interactive core: a part of the list shows its measurements, and a circuit keeps its selection.
declare const check: (name: string, ok: unknown, detail?: unknown) => boolean;
declare const $: (selector: string) => HTMLElement | null;
declare const $$: (selector: string) => HTMLElement[];
declare const click: (element: Element | string) => void;
declare const until: (fn: () => unknown, ms?: number) => Promise<unknown>;

const text = (selector: string): string => $(selector)?.textContent ?? "";
const pressed = (selector: string): string | null => $(selector)?.getAttribute("aria-pressed") ?? null;
// The plan of the room has a shape for each part too, so the selector names the control of the list.
const SOUTH = '.chip[data-record="wall:south"]';

// The 3D viewer needs WebGL 2. A browser with no WebGL 2 gets the plan of the room.
const picture = await until(() => $("#viewer canvas") ?? $("#viewer svg.plan"), 15000);
check("the page shows the room in 3D or as a plan", picture, "The viewer has no canvas and no plan.");
const height = (picture as Element | null)?.getBoundingClientRect().height ?? 0;
check("the picture has a height of 200 pixels or more", height > 200, height);

check("the panel shows the summary of the room", text("#details").includes("Floor area") && text("#details").includes("25.86 m²"), text("#details"));

click(SOUTH);
check("a part of the list shows its measurements", await until(() => text("#details").includes("Length") && text("#details").includes("6 m")), text("#details"));
check("the panel shows the record of the part", text("#details .record").includes('"from": [0, 0]'), text("#details .record"));
check("the list marks the selected part", pressed(SOUTH) === "true", pressed(SOUTH));
check("the picture names the selected part", text("#readout") === "Wall south", text("#readout"));

click('.chip[data-record="object:node-3"]');
check("a second part replaces the first part", await until(() => text("#details").includes("Held by") && text("#details").includes("Circuit B")), text("#details"));
check("only one part is selected", $$('.chip[aria-pressed="true"]').length === 1, $$('.chip[aria-pressed="true"]').length);

click("#details .tool");
check("the panel goes back to the room", await until(() => text("#details").includes("Floor area")), text("#details"));
check("no part is selected", $$('.chip[aria-pressed="true"]').length === 0, $$('.chip[aria-pressed="true"]').length);

check("the legend has the sign of each level", $$(".legend-item .level-mark[data-shape]").length === 4, $$(".legend-item").length);
check("the legend counts the outlets of each level", text('.legend-item[data-level="ok"]').includes("Within its limit: 5") && text('.legend-item[data-level="near"]').includes("Near its limit: 2"), text("#legend"));
// The plan shows each outlet with the sign of its level. The 3D picture has no elements to examine.
const plan = $("#viewer svg.plan");
if (plan !== null) {
  const signs = (shape: string): number => plan.querySelectorAll(`[data-record^="outlet:"][data-shape="${shape}"]`).length;
  check("the plan shows the outlets of a circuit near its limit as triangles", signs("triangle") === 2 && signs("disc") === 5, [signs("triangle"), signs("disc")]);
}

check("each circuit has a meter", $$(".meter").length === 2, $$(".meter").length);
check("the meter of circuit B has the sign of its level", $('[data-circuit="b"] .level-mark')?.dataset["shape"] === "triangle", $('[data-circuit="b"] .level-mark')?.dataset["shape"]);
check("the meter of circuit B tells its load and its level in words", text('[data-circuit="b"]').includes("1260 of 1440 W") && text('[data-circuit="b"]').includes("Near its limit"), text('[data-circuit="b"]'));
click('[data-circuit="b"]');
check("a click selects a circuit", pressed('[data-circuit="b"]') === "true", pressed('[data-circuit="b"]'));
click('[data-circuit="b"]');
check("a second click removes the selection of the circuit", pressed('[data-circuit="b"]') === "false", pressed('[data-circuit="b"]'));

// The pointer in the 3D picture. The picture has no elements to examine.
// So the probe sends pointer events to the canvas, and the page tells the name of the part under each one.
const canvas = $("#viewer canvas");
if (canvas !== null) {
  const GRID = 7;
  const send = (type: string, x: number, y: number, buttons: number): void => {
    const button = type === "pointermove" ? -1 : 0;
    canvas.dispatchEvent(new PointerEvent(type, { pointerId: 1, pointerType: "mouse", isPrimary: true, bubbles: true, cancelable: true, clientX: x, clientY: y, button, buttons }));
  };
  const leave = (): void => {
    send("pointerleave", 0, 0, 0);
  };
  // The center of a cell of a grid on the picture, in the coordinates of the window.
  const cell = (index: number): readonly [number, number] => {
    const box = canvas.getBoundingClientRect();
    return [box.left + (box.width * ((index % GRID) + 0.5)) / GRID, box.top + (box.height * (Math.floor(index / GRID) + 0.5)) / GRID];
  };
  // The name of the part under each cell. A cell with no part has an empty name.
  const scan = (): readonly string[] => {
    const names: string[] = [];
    for (let index = 0; index < GRID * GRID; index += 1) {
      const [x, y] = cell(index);
      send("pointermove", x, y, 0);
      names.push(text("#readout"));
    }
    leave();
    return names;
  };
  // The part of the cells that have the same name in two scans, from 0 to 1.
  const same = (a: readonly string[], b: readonly string[]): number => a.filter((name, index) => name === b[index]).length / a.length;

  let first: readonly string[] = [];
  const found = await until(() => {
    first = scan();
    return new Set(first.filter((name) => name !== "")).size >= 3;
  }, 5000);
  check("the pointer finds the parts of the room in the 3D picture", found, [...new Set(first)]);
  check("the name goes when the pointer leaves the picture", text("#readout") === "", text("#readout"));

  const at = Math.max(
    first.findIndex((name) => name !== ""),
    0,
  );
  const part = first[at] ?? "";
  const [clickX, clickY] = cell(at);
  send("pointerdown", clickX, clickY, 1);
  send("pointerup", clickX, clickY, 0);
  leave();
  check("a click in the 3D picture selects the part under the pointer", part !== "" && text("#readout") === part && $("#details .tool") !== null, [part, text("#readout")]);

  // The turn of a drag is in proportion to the height of the picture. This distance gives a quarter of a turn.
  const box = canvas.getBoundingClientRect();
  const startX = box.left + box.width / 2;
  const startY = box.top + box.height / 2;
  const far = box.height * 0.28;
  send("pointerdown", startX, startY, 1);
  const cursor = canvas.style.cursor;
  for (let step = 1; step <= 8; step += 1) send("pointermove", startX + (far * step) / 8, startY, 1);
  send("pointerup", startX + far, startY, 0);
  leave();
  check("the cursor shows a drag, and only during the drag", cursor === "grabbing" && canvas.style.cursor !== "grabbing", [cursor, canvas.style.cursor]);
  check("a drag keeps the selected part", text("#readout") === part, text("#readout"));

  // The scans compare the pictures with no selected part, because the page names the selected part in an empty cell.
  click("#details .tool");
  let turned: readonly string[] = [];
  const turns = await until(() => {
    turned = scan();
    return same(turned, first) < 0.9;
  }, 5000);
  check("a drag turns the room", turns, same(turned, first));

  // The room continues to turn for a moment after a drag. The button "Corner view" stops the turn, and the first view comes back.
  click("#view-home");
  let back: readonly string[] = [];
  const returns = await until(() => {
    back = scan();
    return same(back, first) >= 0.95;
  }, 5000);
  check("the button Corner view brings the first view back after a drag", returns, same(back, first));
}

export {};
