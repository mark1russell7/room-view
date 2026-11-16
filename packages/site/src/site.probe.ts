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

export {};
