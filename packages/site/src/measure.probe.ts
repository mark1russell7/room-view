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
/** The doors, the windows, the openings and the outlets of the form. */
const features = (): number => $$("#sides li.feature").length;
/** This function gives the first field of a length of the first feature of a kind. */
const featureField = (kind: string, of: string): HTMLInputElement | null => document.querySelector<HTMLInputElement>(`#sides li.feature[data-kind="${kind}"] .length[data-of="${of}"] input`);
/** This function gives the features of a kind in the drawing. */
const marks = (kind: string): HTMLElement[] => $$(`#plan-box .walk-feature[data-kind="${kind}"]`);

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
check(
  "the example room has a door, a window and an outlet",
  features() === 3 && $$("#plan-box .walk-feature").length === 3 && fact("Doors") === "1" && fact("Windows") === "1" && fact("Outlets") === "1",
  [features(), $$("#plan-box .walk-feature").length, text("#facts")],
);

// A new room in meters: four walls with no lengths. The page asks first when a room has numbers from an earlier view.
press("#clear");
if ($("#confirm")?.hidden === false) press("#confirm-yes");
setUnits("m");
check("a new room has four walls and asks for the first length", walls() === 4 && level() === "typing" && title() === "Type the length of wall 1.", status());
check("a new room has no door, no window and no outlet", features() === 0 && $$("#plan-box .walk-feature").length === 0 && fact("Doors") === "", [features(), text("#facts")]);
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

// A door on the first wall. The button of a wall shows one button for each kind of feature.
const wallOne = '#sides li[data-side="0"]';
const door = '#sides li.feature[data-kind="door"]';
const exact = "The walk ends exactly at its start.";
press(`${wallOne} [data-action="features"]`);
check(
  "the button of a wall shows the kinds of features",
  $(`${wallOne} .feature-kinds`)?.hidden === false && $(`${wallOne} [data-action="features"]`)?.getAttribute("aria-expanded") === "true" && $$(`${wallOne} [data-action="add-feature"]`).length === 4,
  $$(`${wallOne} [data-action="add-feature"]`).length,
);
press(`${wallOne} [data-action="add-feature"][data-kind="door"]`);
check(
  "a new door asks for its distance from the corner",
  features() === 1 && text(`${door} .feature-name`) === "Door 1" && level() === "closed" && text("#status-text") === "Type the distance from the corner of door 1 on wall 1.",
  status(),
);
check("a new door has the focus in its first field", document.activeElement !== null && document.activeElement === featureField("door", "offset"), document.activeElement?.getAttribute("aria-label"));
check("the height of a door shows its usual value", featureField("door", "height")?.placeholder === "2.03", featureField("door", "height")?.placeholder);
check("a door with no numbers is not in the drawing", marks("door").length === 0 && fact("Doors") === "1", [marks("door").length, fact("Doors")]);
enter(featureField("door", "offset"), "1");
check("a door asks for its width next", text("#status-text") === "Type the width of door 1 on wall 1.", status());
enter(featureField("door", "width"), "0.9");
check("a door with its numbers is in the drawing, and the room has no fault", marks("door").length === 1 && marks("door")[0]?.dataset["fault"] === undefined && text("#status-text") === exact, status());

// A door that is larger than the space of its wall. The room stays closed, and the page tells the fault at the fields of the door.
enter(featureField("door", "offset"), "4.5");
check(
  "a door that does not fit tells the fault at its fields",
  $(door)?.dataset["fault"] === "error" && $(`${door} .feature-note`)?.hidden === false && text(`${door} .feature-note`) === "It does not fit in the wall.",
  text(`${door} .feature-note`),
);
check(
  "the status and the drawing tell the fault, and the room stays closed",
  level() === "closed" && text("#status-text") === "Door 1 does not fit in wall 1." && marks("door")[0]?.dataset["fault"] === "error" && !disabled("#save-room"),
  status(),
);
enter(featureField("door", "offset"), "1");
check("the correct distance removes the fault", $(door)?.dataset["fault"] === undefined && $(`${door} .feature-note`)?.hidden === true && text("#status-text") === exact, status());

// The distance of a feature can start at each corner of its wall. The typed number stays.
const holeOf = (): string => {
  const hole = $(`#plan-box .walk-feature[data-kind="door"] .walk-hole`);
  return `${hole?.getAttribute("x1") ?? ""} ${hole?.getAttribute("y1") ?? ""}`;
};
const nearStart = holeOf();
check("the distance of a door starts at the corner with the wall before it", text(`${door} .field-name`).startsWith("From the corner with wall 6"), text(`${door} .field-name`));
press(`${door} [data-action="swap"]`);
check(
  "the other corner keeps the typed number and moves the door",
  featureField("door", "offset")?.value === "1" && text(`${door} .field-name`).startsWith("From the corner with wall 2") && holeOf() !== nearStart && text("#status-text") === exact,
  [featureField("door", "offset")?.value, text(`${door} .field-name`), nearStart, holeOf()],
);

// An outlet on the second wall. It needs only its distance, because its height above the floor has a usual value.
const wallTwo = '#sides li[data-side="1"]';
press(`${wallTwo} [data-action="features"]`);
press(`${wallTwo} [data-action="add-feature"][data-kind="outlet"]`);
check("a new outlet asks for its distance from the corner", features() === 2 && text("#status-text") === "Type the distance from the corner of outlet 1 on wall 2.", status());
enter(featureField("outlet", "offset"), "1.5");
check("an outlet with its distance is in the drawing", marks("outlet").length === 1 && fact("Outlets") === "1" && fact("Doors") === "1" && text("#status-text") === exact, [marks("outlet").length, text("#facts"), status()]);
$("#plan-box .walk-touch[data-feature]")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
check("a click on an outlet of the drawing goes to its first field", document.activeElement !== null && document.activeElement === featureField("outlet", "offset"), document.activeElement?.getAttribute("aria-label"));
if (document.hasFocus()) check("the drawing shows the measured distance of the feature with the focus", await until(() => $('#plan-box .walk-feature[data-kind="outlet"].walk-on'), 1000));

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
check("a change of the units converts the lengths of a door", $(`${door} .length[data-of="offset"]`)?.dataset["fields"] === "2" && featureField("door", "offset")?.value === "3" && $(door)?.dataset["fault"] === undefined, [featureField("door", "offset")?.value, status()]);
setUnits("m");
check("the first units show the typed numbers again", fieldsOf(0) === "1" && lengthField(0)?.value === "5" && lengthField(5)?.value === "4", [lengthField(0)?.value, lengthField(5)?.value]);
check("the first units show the typed numbers of a door again", featureField("door", "offset")?.value === "1" && featureField("door", "width")?.value === "0.9", [featureField("door", "offset")?.value, featureField("door", "width")?.value]);

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
interface KeptRoom {
  readonly name?: string;
  readonly sides?: readonly { readonly features?: readonly { readonly kind?: string }[] }[];
}
const keptRoom = (): KeptRoom | undefined => {
  try {
    const kept = JSON.parse(localStorage.getItem(STORE_KEY) ?? "null") as { readonly rooms?: readonly KeptRoom[] } | null;
    return kept?.rooms?.[0];
  } catch {
    return undefined;
  }
};
const keptKinds = (): string => (keptRoom()?.sides ?? []).map((side) => (side.features ?? []).map((feature) => feature.kind ?? "").join("+")).join(",");
check("the page keeps the room in the browser", keptRoom()?.name === "Main bedroom" && keptRoom()?.sides?.length === 6, localStorage.getItem(STORE_KEY)?.slice(0, 120));
check("the page keeps the door and the outlet with their walls", keptKinds() === "door,outlet,,,,", keptKinds());

// The removal of a feature.
press(`${door} [data-action="remove-feature"]`);
check("the removal of a door removes its fields, its symbol and its number", features() === 1 && marks("door").length === 0 && marks("outlet").length === 1 && fact("Doors") === "" && keptKinds() === ",outlet,,,,", [features(), text("#facts"), keptKinds()]);

// A new room removes typed numbers, so the page asks first.
press("#clear");
check("a new room asks before it removes the numbers", $("#confirm")?.hidden === false && text("#confirm-text").includes("removes each number") && text("#confirm-yes") === "Remove the numbers", text("#confirm"));
press("#confirm-no");
check("the answer no keeps the numbers", $("#confirm")?.hidden === true && walls() === 6 && lengthField(0)?.value === "5", [walls(), lengthField(0)?.value]);
press("#clear");
press("#confirm-yes");
check("the answer yes gives a new room", $("#confirm")?.hidden === true && walls() === 4 && features() === 0 && lengthField(0)?.value === "" && level() === "typing", [walls(), features(), status()]);

// The next view of the check starts as a first visit, with the example room.
localStorage.removeItem(STORE_KEY);

export {};
