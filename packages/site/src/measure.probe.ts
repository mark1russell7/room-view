// The probe of the page "Measure a room" for the command `site-pages check`. The check runs this code in the page, at each width.
// It tests the interactive core: a person types the walls of a room with six corners, and the page draws the room and tells if the walk closes.
declare const check: (name: string, ok: unknown, detail?: unknown) => boolean;
declare const $: (selector: string) => HTMLElement | null;
declare const $$: (selector: string) => HTMLElement[];
declare const until: (fn: () => unknown, ms?: number) => Promise<unknown>;

/** The key of the rooms in the storage of the browser, as in the script of the page. */
const STORE_KEY = "room-view:measure";

const text = (selector: string): string => $(selector)?.textContent ?? "";
const level = (): string => $("#status")?.dataset["level"] ?? "";
const title = (): string => text("#status-title");
const status = (): string => `${level()}: ${title()} ${text("#status-text")}`;
const disabled = (selector: string): boolean => $(selector)?.hasAttribute("disabled") ?? true;
const walls = (): number => $$("#sides li.side").length;
const lengthField = (side: number): HTMLInputElement | null => document.querySelector<HTMLInputElement>(`#sides li[data-side="${String(side)}"] .length input`);
const fieldsOf = (side: number): string => $(`#sides li[data-side="${String(side)}"] .length`)?.dataset["fields"] ?? "";
const fact = (name: string): string => $$("#facts div").find((row) => row.querySelector("dt")?.textContent === name)?.querySelector("dd")?.textContent ?? "";

/** This function clicks a control. A page with no such control fails a check, and the probe continues. */
const press = (selector: string): void => {
  const element = $(selector);
  if (element === null) check(`the page has the control ${selector}`, false);
  else element.click();
};

/** This function types a text in a field, as a person does. */
const enter = (field: HTMLInputElement | null, value: string): void => {
  if (field === null) {
    check(`the page has the field for ${value}`, false);
    return;
  }
  field.value = value;
  field.dispatchEvent(new Event("input", { bubbles: true }));
};

const setUnits = (mode: string): void => {
  const field = document.querySelector<HTMLSelectElement>("#mode");
  if (field === null) return;
  field.value = mode;
  field.dispatchEvent(new Event("change", { bubbles: true }));
};

const drawing = await until(() => $("#plan-box svg.walk"), 15000);
check("the page draws a room at its start", drawing, "The box of the drawing has no picture.");
const height = (drawing as Element | null)?.getBoundingClientRect().height ?? 0;
check("the drawing has a height of 160 pixels or more", height >= 160, height);
check("a first visit shows the example room, and its walk closes", $("#example-note")?.hidden === false && level() === "closed", status());

// A new room in meters: four walls with no lengths. The page asks first when a room has numbers from an earlier view.
press("#clear");
if ($("#confirm")?.hidden === false) press("#confirm-yes");
setUnits("m");
check("a new room has four walls and asks for the first length", walls() === 4 && level() === "typing" && title() === "Type the length of wall 1.", status());
check("a length in meters has one field", fieldsOf(0) === "1" && text('#sides li[data-side="0"] .unit') === "m", fieldsOf(0));
check("a room with no closed walk has no record and no 3D view", disabled("#save-room") && disabled("#view-room"), [disabled("#save-room"), disabled("#view-room")]);

// The room has six corners: 5 east, 3 north, 2 west, 1 north, 3 west and 4 south. The corner after the third wall points into the room.
enter(lengthField(0), "5");
check("the drawing shows the first wall with its length", text('#plan-box .walk-label[data-side="0"]') === "5 m", text("#plan-box .walk-label"));
enter(lengthField(1), "3");
enter(lengthField(2), "2");
enter(lengthField(3), "1");
check("four walls that do not meet give an open walk with a gap", level() === "open" && title().includes("from its start") && $("#plan-box .walk-gap") !== null, status());
check("an open walk has no floor", $("#plan-box .walk-floor") === null);

press('#sides li[data-side="2"] input[value="right"]');
check("a wrong sum of the turns tells the fault", level() === "open" && title() === "The corners do not make a full turn.", status());

press("#add");
check("a new wall asks for its length", walls() === 5 && level() === "typing" && title() === "Type the length of wall 5.", status());
enter(lengthField(4), "3");
press("#add");
enter(lengthField(5), "4");
check("the walk of six walls closes", level() === "closed" && title() === "The room closes." && text("#status-text") === "The walk ends exactly at its start.", status());
check("the drawing shows the floor and each wall", $("#plan-box .walk-floor") !== null && $$("#plan-box .walk-wall").length === 6 && $("#plan-box .walk-gap") === null, $$("#plan-box .walk-wall").length);
check("the drawing shows the lengths of the walls", $$("#plan-box .walk-label").length >= 4 && text('#plan-box .walk-label[data-side="5"]') === "4 m", $$("#plan-box .walk-label").length);
check("the page tells the numbers of the room", fact("Walls") === "6" && fact("Around the room") === "18 m" && fact("Floor area") === "18 m²", text("#facts"));
check("a closed room has a record", !disabled("#save-room"), disabled("#save-room"));
check("the example note goes when the room has numbers of the visitor", $("#example-note")?.hidden === true);

// A click on a wall of the drawing goes to its field. An element of a drawing has no function `click`.
$('#plan-box .walk-hit[data-side="2"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
check("a click on a wall of the drawing goes to the field of its length", document.activeElement !== null && document.activeElement === lengthField(2), document.activeElement?.getAttribute("aria-label"));
// A window with no focus gets no focus events, so the page cannot mark the wall there.
if (document.hasFocus()) check("the drawing marks the wall of the field with the focus", await until(() => $('#plan-box .walk-mark[data-side="2"].walk-on'), 1000));

// A value that is not a number.
enter(lengthField(1), "abc");
check("a text that is not a number tells the fault", level() === "typing" && title() === "The length of wall 2 is not a number.", status());
enter(lengthField(1), "3");
check("the correct number closes the room again", level() === "closed", status());

// A measured corner. An angle of 90 degrees inside the room is a square turn.
press('#sides li[data-side="0"] input[value="angle"]');
const angle = document.querySelector<HTMLInputElement>('#sides li[data-side="0"] input[data-part="angle"]');
check("a measured corner asks for its angle", angle?.closest<HTMLElement>(".angle")?.hidden === false && title() === "Type the angle of the corner after wall 1.", status());
enter(angle, "90");
check("an angle of 90 degrees closes the room", level() === "closed", status());
press('#sides li[data-side="0"] input[value="left"]');
check("a square corner hides the field of the angle", angle?.closest<HTMLElement>(".angle")?.hidden === true && level() === "closed", status());

// A change of the units converts each length. The first units show the typed numbers again.
setUnits("ft-in");
check("feet and inches have two fields", fieldsOf(0) === "2" && lengthField(0)?.value === "16" && $("#fractions")?.hidden === false, [fieldsOf(0), lengthField(0)?.value]);
check("the room stays closed in feet and inches", level() === "closed" && walls() === 6, status());
setUnits("m");
check("the first units show the typed numbers again", fieldsOf(0) === "1" && lengthField(0)?.value === "5" && lengthField(5)?.value === "4", [lengthField(0)?.value, lengthField(5)?.value]);

// The removal of a wall opens the walk.
press('#sides li[data-side="5"] .remove');
check("the removal of a wall opens the walk", walls() === 5 && level() === "open" && $("#plan-box .walk-floor") === null && disabled("#save-room"), status());
press("#add");
enter(lengthField(5), "4");
check("the wall closes the room again", walls() === 6 && level() === "closed", status());

// The 3D view needs WebGL 2. A browser with no WebGL 2 keeps the drawing, and the page tells why.
check("a closed room has a 3D view", !disabled("#view-room"), disabled("#view-room"));
press("#view-room");
const shown = await until(() => $("#room-box canvas") ?? (text("#hint").includes("no WebGL 2") ? $("#hint") : null), 20000);
check("the page shows the room in 3D, or tells that the browser has no WebGL 2", shown, text("#hint"));
if ($("#room-box canvas") !== null) {
  check("the 3D view replaces the drawing", $("#stage")?.dataset["view"] === "room" && $("#plan-box")?.hidden === true && $("#view-room")?.getAttribute("aria-pressed") === "true", $("#stage")?.dataset["view"]);
  const tall = $("#room-box canvas")?.getBoundingClientRect().height ?? 0;
  check("the 3D picture has a height of 200 pixels or more", tall >= 200, tall);
  // A room that is not closed has no 3D model, so the page goes back to the drawing.
  enter(lengthField(0), "5.5");
  check("an open walk goes back to the drawing", $("#stage")?.dataset["view"] === "plan" && $("#plan-box svg.walk") !== null && $("#room-box canvas") === null && disabled("#view-room"), [$("#stage")?.dataset["view"], status()]);
  enter(lengthField(0), "5");
  press("#view-room");
  check("the 3D view opens again", await until(() => $("#room-box canvas"), 20000), text("#hint"));
  press("#view-plan");
  check("the button Drawing shows the drawing again", $("#stage")?.dataset["view"] === "plan" && $("#plan-box svg.walk") !== null && $("#room-box")?.hidden === true, $("#stage")?.dataset["view"]);
} else {
  check("a browser with no WebGL 2 keeps the drawing", $("#plan-box svg.walk") !== null && disabled("#view-room"), text("#hint"));
}

// The page keeps the room in the browser.
enter(document.querySelector<HTMLInputElement>("#name"), "Main bedroom");
const keptRoom = (): { readonly name?: string; readonly sides?: readonly unknown[] } | undefined => {
  try {
    const kept = JSON.parse(localStorage.getItem(STORE_KEY) ?? "null") as { readonly rooms?: readonly { readonly name?: string; readonly sides?: readonly unknown[] }[] } | null;
    return kept?.rooms?.[0];
  } catch {
    return undefined;
  }
};
check("the page keeps the room in the browser", keptRoom()?.name === "Main bedroom" && keptRoom()?.sides?.length === 6, localStorage.getItem(STORE_KEY)?.slice(0, 120));

// A new room removes typed numbers, so the page asks first.
press("#clear");
check("a new room asks before it removes the numbers", $("#confirm")?.hidden === false && text("#confirm-text").includes("removes each number") && text("#confirm-yes") === "Remove the numbers", text("#confirm"));
press("#confirm-no");
check("the answer no keeps the numbers", $("#confirm")?.hidden === true && walls() === 6 && lengthField(0)?.value === "5", [walls(), lengthField(0)?.value]);
press("#clear");
press("#confirm-yes");
check("the answer yes gives a new room", $("#confirm")?.hidden === true && walls() === 4 && lengthField(0)?.value === "" && level() === "typing", [walls(), status()]);

// The next view of the check starts as a first visit, with the example room.
localStorage.removeItem(STORE_KEY);

export {};
