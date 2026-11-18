// The probe of the page "Measure a room" for the command `site-pages check`. The check runs this code in the page, at each width.
// It tests the interactive core: a person types the walls of a room with six corners, and the page draws the room and tells if the walk closes.
// A person adds a door, an outlet, a desk and a display on the desk, and the page tells the fault of each one at its fields.
// Then a person joins two rooms by a door, and the page shows the rooms together and tells if they fit at the door.
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

/** The buttons of the rooms of the page. */
const rooms = (): HTMLElement[] => $$("#room-list button[data-room]");
/** This function gives the name and the state of each room of the list. A star is the room that the page shows. */
const roomNames = (): string =>
  rooms()
    .map((room) => `${room.querySelector(".room-name")?.textContent ?? ""}:${room.dataset["state"] ?? ""}${room.getAttribute("aria-current") === "true" ? "*" : ""}`)
    .join(",");
/** This function gives the number of rooms that the browser keeps. */
const keptRooms = (): number => {
  try {
    return (JSON.parse(localStorage.getItem(STORE_KEY) ?? "null") as { readonly rooms?: readonly unknown[] } | null)?.rooms?.length ?? 0;
  } catch {
    return 0;
  }
};

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
check("a first visit offers the example apartment", text("#example-note #see-example") === "See an example apartment", text("#example-note"));
check(
  "the example room has a door, a window and an outlet",
  features() === 3 && $$("#plan-box .walk-feature").length === 3 && fact("Doors") === "1" && fact("Windows") === "1" && fact("Outlets") === "1",
  [features(), $$("#plan-box .walk-feature").length, text("#facts")],
);
check("the list of the rooms has the example room, and its walk closes", roomNames() === "Room 1:closed*" && !disabled("#add-room"), roomNames());

// An empty room in meters: four walls with no lengths. The page asks first when a room has numbers from an earlier view.
press("#clear");
if ($("#confirm")?.hidden === false) press("#confirm-yes");
setUnits("m");
check("the removal of the only room gives one empty room", roomNames() === "Room 1:typing*", roomNames());
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

// Furniture on the first wall: a desk with a display on it. A size with no number has the usual size of the kind.
const objects = (): HTMLElement[] => $$("#sides li.object");
const desk = '#sides li.object[data-kind="desk"]';
const display = `${desk} li.object[data-kind="display"]`;
/** This function gives the first field of a length of an object. A length in the box "More" is not a length of this function. */
const objectField = (item: string, of: string): HTMLInputElement | null => document.querySelector<HTMLInputElement>(`${item} > .field .length[data-of="${of}"] input`);
const shapes = (): HTMLElement[] => $$("#plan-box .walk-object");
const addTo = (place: string): string => `${place} > .object-add [data-action="objects"]`;
press(addTo(wallOne));
check(
  "the button for furniture shows the kinds of objects",
  $(`${wallOne} > .object-add .object-kinds`)?.hidden === false && $(addTo(wallOne))?.getAttribute("aria-expanded") === "true" && $$(`${wallOne} > .object-add [data-action="add-object"]`).length === 12,
  $$(`${wallOne} > .object-add [data-action="add-object"]`).length,
);
press(`${wallOne} > .object-add [data-action="add-object"][data-kind="desk"]`);
check(
  "a new desk asks for its distance from the corner",
  objects().length === 1 && text(`${desk} > .feature-head .feature-name`) === "Desk 1" && level() === "closed" && text("#status-text") === "Type the distance from the corner of desk 1 on wall 1.",
  status(),
);
check("a new desk has the focus in its first field", document.activeElement !== null && document.activeElement === objectField(desk, "offset"), document.activeElement?.getAttribute("aria-label"));
check("the size of a desk shows its usual value", objectField(desk, "width")?.placeholder === "1.5" && objectField(desk, "depth")?.placeholder === "0.75", [objectField(desk, "width")?.placeholder, objectField(desk, "depth")?.placeholder]);
check("a desk with no distance is not in the drawing", shapes().length === 0 && fact("Furniture and equipment") === "1", [shapes().length, text("#facts")]);
enter(objectField(desk, "offset"), "0.5");
check("a desk with its distance is in the drawing, and the room has no fault", shapes().length === 1 && shapes()[0]?.dataset["fault"] === undefined && text("#status-text") === exact, status());

press(addTo(desk));
press(`${desk} > .object-add [data-action="add-object"][data-kind="display"]`);
check(
  "a display on the desk asks for its distance from the edge of the desk",
  $(display)?.dataset["level"] === "2" && text(`${display} > .field .field-name`).startsWith("From the edge near wall 6") && text("#status-text") === "Type the distance from the edge of display 1 on desk 1.",
  [text(`${display} > .field .field-name`), status()],
);
enter(objectField(display, "offset"), "0.4");
check(
  "the display is in the drawing, on the desk",
  shapes().length === 2 && $('#plan-box .walk-object[data-level="2"]') !== null && fact("Furniture and equipment") === "2" && text("#status-text") === exact,
  [shapes().length, text("#facts"), status()],
);
interface KeptObject {
  readonly kind?: string;
  readonly holds?: readonly KeptObject[];
}
const keptObjects = (): string => {
  try {
    const kept = JSON.parse(localStorage.getItem(STORE_KEY) ?? "null") as { readonly rooms?: readonly { readonly sides?: readonly { readonly objects?: readonly KeptObject[] }[] }[] } | null;
    const write = (list: readonly KeptObject[]): string => list.map((item) => `${item.kind ?? ""}${(item.holds ?? []).length === 0 ? "" : `(${write(item.holds ?? [])})`}`).join("+");
    return (kept?.rooms?.[0]?.sides ?? []).map((side) => write(side.objects ?? [])).join(",");
  } catch {
    return "";
  }
};
check("the page keeps the desk with its wall, and the display on the desk", keptObjects() === "desk(display),,,,,", keptObjects());

// The box "More" of an object has its name and its outlet.
const more = document.querySelector<HTMLDetailsElement>(`${desk} > details.more`);
check("the box More of a new object is closed", more?.open === false, more?.open);
if (more !== null) more.open = true;
enter(document.querySelector<HTMLInputElement>(`${desk} > details.more input[data-part="name"]`), "Work desk");
check("the name of an object shows next to its kind", text(`${desk} > .feature-head .object-given`) === "Work desk", text(`${desk} > .feature-head`));
const power = document.querySelector<HTMLSelectElement>(`${desk} > details.more select[data-field="outlet"]`);
check("an object can use an outlet of the room", power?.options.length === 2 && power.options[1]?.textContent === "Outlet 1, wall 2", power === null ? "no field" : Array.from(power.options, (option) => option.textContent));
if (power !== null && power.options.length === 2) {
  power.selectedIndex = 1;
  power.dispatchEvent(new Event("change", { bubbles: true }));
}
check("the outlet of the desk gives the room no fault", power?.selectedIndex === 1 && text("#status-text") === exact, status());

// A click on an object of the drawing goes to its first field.
const deskKey = $(desk)?.dataset["key"] ?? "";
$(`#plan-box .walk-touch[data-object="${CSS.escape(deskKey)}"]`)?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
check("a click on a desk of the drawing goes to its first field", document.activeElement !== null && document.activeElement === objectField(desk, "offset"), document.activeElement?.getAttribute("aria-label"));
if (document.hasFocus()) check("the drawing marks the object of the field with the focus", await until(() => $(`#plan-box .walk-object[data-key="${CSS.escape(deskKey)}"].walk-on`), 1000));

// The distance of an object can start at each corner of its wall. The typed number stays.
press(`${desk} > .field [data-action="swap-object"]`);
check(
  "the other corner keeps the typed number of the desk",
  objectField(desk, "offset")?.value === "0.5" && text(`${desk} > .field .field-name`).startsWith("From the corner with wall 2") && text("#status-text") === exact,
  [objectField(desk, "offset")?.value, text(`${desk} > .field .field-name`), status()],
);
press(`${desk} > .field [data-action="swap-object"]`);

// A chair in the space of the desk. The room stays closed, and the page tells the fault at the two objects.
const chair = '#sides li.object[data-kind="chair"]';
press(addTo(wallOne));
press(`${wallOne} > .object-add [data-action="add-object"][data-kind="chair"]`);
enter(objectField(chair, "offset"), "1");
check(
  "two objects in one space tell the fault at each object",
  $(chair)?.dataset["fault"] === "warning" && $(`${chair} > .object-note`)?.hidden === false && text(`${chair} > .object-note`) === "It is in the space of desk 1." && $(desk)?.dataset["fault"] === "warning",
  [text(`${chair} > .object-note`), $(desk)?.dataset["fault"]],
);
check(
  "the status and the drawing tell the fault, and the room stays closed",
  level() === "closed" && text("#status-text") === "Desk 1 on wall 1 is in the space of chair 1." && $$('#plan-box .walk-object[data-fault="warning"]').length >= 2 && !disabled("#save-room"),
  status(),
);
press(`${chair} > .feature-head [data-action="remove-object"]`);
check(
  "the removal of an object removes its fault, and the focus goes to the button of its wall",
  objects().length === 2 && $(desk)?.dataset["fault"] === undefined && text("#status-text") === exact && document.activeElement !== null && document.activeElement === $(addTo(wallOne)),
  [objects().length, status(), document.activeElement?.className],
);

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
check("the page keeps the door and the outlet with their walls", keptKinds() === "door,point,,,,", keptKinds());

// The removal of a feature.
press(`${door} [data-action="remove-feature"]`);
check("the removal of a door removes its fields, its symbol and its number", features() === 1 && marks("door").length === 0 && marks("outlet").length === 1 && fact("Doors") === "" && keptKinds() === ",point,,,,", [features(), text("#facts"), keptKinds()]);

// The rooms of the page: a person adds a room, goes from room to room, and removes a room.
const nameField = document.querySelector<HTMLInputElement>("#name");
// A closed room whose status tells a feature has the state `fault` in the list.
const firstState = level() === "closed" && !text("#status-text").startsWith("The walk ends") ? "fault" : level();
check("the list of the rooms shows the name and the state of the room", roomNames() === `Main bedroom:${firstState}*`, roomNames());
press("#add-room");
check(
  "the button Add a room gives a second room with no numbers, and the page shows it",
  roomNames() === `Main bedroom:${firstState},Room 2:typing*` && walls() === 4 && features() === 0 && lengthField(0)?.value === "" && nameField?.value === "" && level() === "typing",
  [roomNames(), walls(), features(), status()],
);
check("the name of a new room has the focus", document.activeElement !== null && document.activeElement === nameField, document.activeElement?.id);
check("the drawing shows no feature of the first room", $$("#plan-box .walk-feature").length === 0 && fact("Outlets") === "", [$$("#plan-box .walk-feature").length, text("#facts")]);
enter(nameField, "Hall");
check("the list of the rooms shows a name while a person types it", roomNames() === `Main bedroom:${firstState},Hall:typing*`, roomNames());
check("the page keeps the two rooms in the browser", keptRooms() === 2 && keptRoom()?.name === "Main bedroom" && keptKinds() === ",point,,,,", [keptRooms(), keptKinds()]);
// A person with a keyboard goes to the room with the key Tab, so the button has the focus before the click.
rooms()[0]?.focus();
press('#room-list button[data-room="0"]');
check(
  "a click on a room of the list shows its numbers again",
  roomNames() === `Main bedroom:${firstState}*,Hall:typing` && walls() === 6 && features() === 1 && lengthField(0)?.value === "5" && nameField?.value === "Main bedroom" && marks("outlet").length === 1,
  [roomNames(), walls(), features(), lengthField(0)?.value],
);
check("the list makes its buttons again, and the room keeps the focus", document.activeElement !== null && document.activeElement === rooms()[0], document.activeElement?.className);

// The removal of a room removes typed numbers, so the page asks first.
press('#room-list button[data-room="1"]');
check("the page shows the second room again", roomNames() === `Main bedroom:${firstState},Hall:typing*` && walls() === 4 && nameField?.value === "Hall", [roomNames(), walls()]);
press("#clear");
check("the removal of a room asks first, and it names the room", $("#confirm")?.hidden === false && text("#confirm-text").includes('removes the room "Hall"') && text("#confirm-yes") === "Remove the room", text("#confirm"));
press('#room-list button[data-room="0"]');
check("a different room closes the question", $("#confirm")?.hidden === true && rooms().length === 2 && walls() === 6, [rooms().length, walls()]);
press('#room-list button[data-room="1"]');
press("#clear");
press("#confirm-yes");
check(
  "the answer yes removes the room, and the page shows the room before it",
  $("#confirm")?.hidden === true && roomNames() === `Main bedroom:${firstState}*` && walls() === 6 && lengthField(0)?.value === "5" && keptRooms() === 1,
  [roomNames(), walls(), keptRooms()],
);
press("#clear");
check("the removal of the only room asks first", $("#confirm")?.hidden === false && text("#confirm-text").includes('removes the room "Main bedroom"'), text("#confirm"));
press("#confirm-no");
check("the answer no keeps the room", $("#confirm")?.hidden === true && walls() === 6 && lengthField(0)?.value === "5", [walls(), lengthField(0)?.value]);
press("#clear");
press("#confirm-yes");
check(
  "the answer yes gives one empty room",
  $("#confirm")?.hidden === true && roomNames() === "Room 1:typing*" && walls() === 4 && features() === 0 && lengthField(0)?.value === "" && level() === "typing",
  [roomNames(), walls(), features(), status()],
);

// The rooms together. Two rooms of 4 m by 3 m have one wall between them: wall 2 of the first room and wall 4 of the second room.
/** The doors of the form, in the sequence of the walk. */
const doors = (): HTMLElement[] => $$('#sides li.feature[data-kind="door"]');
/** This function gives the first field of a length of a door of the form. */
const doorField = (at: number, of: string): HTMLInputElement | null => doors()[at]?.querySelector<HTMLInputElement>(`.length[data-of="${of}"] input`) ?? null;
/** This function gives the field Goes to of a door of the form. */
const goesTo = (at: number): HTMLSelectElement | null => doors()[at]?.querySelector<HTMLSelectElement>('select[data-part="join"]') ?? null;
/** This function gives the choices of the field Goes to of a door. */
const choices = (at: number): string => {
  const field = goesTo(at);
  return field === null ? "" : Array.from(field.options, (option) => option.textContent ?? "").join(" | ");
};
/** This function gives the state and the text of the note of a door about the room that it goes to. A door with no note gives an empty text. */
const joinNote = (at: number): string => {
  const note = doors()[at]?.querySelector<HTMLElement>(".join-note") ?? null;
  return note === null || note.hidden ? "" : `${note.dataset["state"] ?? ""}: ${note.textContent ?? ""}`;
};
/** The button that shows the rooms together. */
const allRooms = (): HTMLElement | null => $('#room-list button[data-scope="all"]');
/** This function gives the state and the label of the button All rooms. */
const allState = (): string => `${allRooms()?.dataset["state"] ?? ""}: ${allRooms()?.getAttribute("aria-label") ?? ""}`;
/** The rooms of the drawing of the rooms together. */
const planRooms = (): HTMLElement[] => $$("#plan-box g.plan-room");
/** This function gives the number of rooms that the drawing shows apart. */
const apartRooms = (): number => $$('#plan-box g.plan-room[data-apart="true"]').length;
/** This function gives the names of the rooms in the drawing of the rooms together. */
const planNames = (): string =>
  $$("#plan-box .plan-name")
    .map((name) => name.textContent ?? "")
    .join(",");
/** This function gives the number of doors between rooms that the drawing shows in a state. */
const ties = (state: string): number => $$(`#plan-box g.plan-tie[data-state="${state}"]`).length;
/** This function gives the state of each item of the list of the doors between rooms. */
const jointStates = (): string =>
  $$("#joints li.joint")
    .map((joint) => joint.dataset["state"] ?? "")
    .join(",");
/** This function gives the width of the page that is outside the screen, in pixels. */
const overflow = (): number => document.documentElement.scrollWidth - document.documentElement.clientWidth;
/** This function gives the number of doors between rooms that the browser keeps. */
const keptJoins = (): number => {
  try {
    return (JSON.parse(localStorage.getItem(STORE_KEY) ?? "null") as { readonly connections?: readonly unknown[] } | null)?.connections?.length ?? 0;
  } catch {
    return 0;
  }
};

/** This function types the length of each wall of a room. */
const typeWalls = (lengths: readonly string[]): void => {
  lengths.forEach((length, side) => {
    enter(lengthField(side), length);
  });
};

/** This function adds a door of 0.9 m to a wall, at a distance from the first corner of the wall. The new door is the last door of the form. */
const addDoor = (side: number, offset: string): void => {
  const wall = `#sides li[data-side="${String(side)}"]`;
  if ($(`${wall} .feature-kinds`)?.hidden !== false) press(`${wall} [data-action="features"]`);
  press(`${wall} [data-action="add-feature"][data-kind="door"]`);
  enter(doorField(doors().length - 1, "offset"), offset);
  enter(doorField(doors().length - 1, "width"), "0.9");
};

/** This function selects a choice of the field Goes to of a door, as a person does. */
const choose = (at: number, choice: number): void => {
  const field = goesTo(at);
  const value = field?.options[choice]?.value;
  if (field === null || value === undefined) {
    check(`door ${String(at + 1)} has the choice ${String(choice)} of the field Goes to`, false);
    return;
  }
  field.value = value;
  field.dispatchEvent(new Event("change", { bubbles: true }));
};

const outside = "Outside, or a room that is not here";
const fitTogether = "closed: All rooms: The rooms fit together.";

typeWalls(["4", "3", "4", "3"]);
addDoor(1, "0.2");
check("a room of 4 m by 3 m with a door closes", roomNames() === "Room 1:closed*" && text("#status-text") === exact && fact("Floor area") === "12 m²" && marks("door").length === 1, [roomNames(), status(), text("#facts")]);
check(
  "a page with one room has no button All rooms and no field Goes to",
  allRooms() === null && goesTo(0) === null && $("#level")?.hidden === true && $("#stage")?.dataset["scope"] === "room",
  [allRooms() === null, goesTo(0) === null, $("#stage")?.dataset["scope"]],
);

press("#add-room");
typeWalls(["4", "3", "4", "3"]);
addDoor(3, "1.9");
check(
  "a second room gives the button All rooms, and the button tells the room with no door to the first room",
  roomNames() === "Room 1:closed,Room 2:closed*" && allState() === "typing: All rooms: Room 2 has no door to the other rooms yet.",
  [roomNames(), allState()],
);
check(
  "a door of a page with two rooms has the field Goes to, with the door of the other room",
  choices(0) === `${outside} | Room 1: door 1 on wall 2` && goesTo(0)?.value === "" && joinNote(0) === "",
  [choices(0), goesTo(0)?.value, joinNote(0)],
);
choose(0, 1);
check(
  "a door that goes to a door of the other room tells that the two rooms fit there",
  joinNote(0) === "fits: Door 1 of Room 2 is door 1 of Room 1." && goesTo(0)?.selectedIndex === 1 && keptJoins() === 1,
  [joinNote(0), goesTo(0)?.selectedIndex, keptJoins()],
);
check("the button All rooms tells that the rooms fit together", allState() === fitTogether, allState());

// The view of the rooms together has the drawing of each room at its place, and the list of the doors between rooms.
press('#room-list button[data-scope="all"]');
check(
  "the button All rooms shows the rooms together in place of the fields of a room",
  $("#form")?.hidden === true && $("#level")?.hidden === false && $("#clear")?.hidden === true && $("#stage")?.dataset["scope"] === "all" && allRooms()?.getAttribute("aria-current") === "true" && roomNames() === "Room 1:closed,Room 2:closed",
  [$("#form")?.hidden, $("#level")?.hidden, $("#clear")?.hidden, $("#stage")?.dataset["scope"], roomNames()],
);
check("the status tells that the rooms fit together", level() === "closed" && title() === "The rooms fit together.", status());
check(
  "the drawing shows each room with its floor and its name, and one dot at the door between the rooms",
  planRooms().length === 2 && $$("#plan-box g.plan-room .walk-floor").length === 2 && planNames() === "Room 1,Room 2" && ties("fits") === 1 && $$("#plan-box g.plan-tie circle").length === 1 && apartRooms() === 0,
  [planRooms().length, planNames(), ties("fits"), apartRooms()],
);
check("the page tells the numbers of the rooms together", fact("Rooms") === "2" && fact("Floor area") === "24 m²" && fact("Doors between rooms") === "1", text("#facts"));
check(
  "the list of the doors between rooms has the door with its two rooms",
  jointStates() === "fits" && text("#joints .joint-title") === "Room 2 and Room 1" && text("#joints .joint-text") === "Door 1 of Room 2 is door 1 of Room 1." && $("#no-joints")?.hidden === true,
  text("#joints"),
);
check("the rooms together do not make the page wider than the screen", overflow() <= 0, overflow());

// The 3D model of the rooms together, in a browser with WebGL 2.
const noWebGl = text("#hint").includes("no WebGL 2");
check("the rooms together have a 3D model", text("#view-room") === "3D model" && (noWebGl || !disabled("#view-room")), [text("#view-room"), disabled("#view-room")]);
if (!noWebGl) {
  press("#view-room");
  check("the page shows the rooms together in 3D", await until(() => $("#room-box canvas"), 20000), text("#hint"));
  press("#view-plan");
  check("the button Drawing shows the drawing of the rooms again", $("#stage")?.dataset["view"] === "plan" && planRooms().length === 2 && $("#room-box")?.hidden === true, [$("#stage")?.dataset["view"], planRooms().length]);
}

// A click on a room of the drawing opens the room. An element of a drawing has no function `click`.
$('#plan-box g.plan-room[data-open="0"] .walk-floor')?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
check(
  "a click on a room of the drawing opens the room with its numbers",
  roomNames() === "Room 1:closed*,Room 2:closed" && $("#form")?.hidden === false && $("#level")?.hidden === true && $("#clear")?.hidden === false && $("#stage")?.dataset["scope"] === "room" && lengthField(0)?.value === "4" && doors().length === 1,
  [roomNames(), $("#form")?.hidden, $("#stage")?.dataset["scope"], lengthField(0)?.value],
);
check(
  "the door of the first room shows the door that it goes to",
  choices(0) === `${outside} | Room 2: door 1 on wall 4` && goesTo(0)?.selectedIndex === 1 && joinNote(0) === "fits: Door 1 of Room 2 is door 1 of Room 1.",
  [choices(0), goesTo(0)?.selectedIndex, joinNote(0)],
);

// A second door between the two rooms. The first door gives the place of the second room, so the second door examines the measurements.
addDoor(1, "1.9");
check(
  "a door with no free door in the other rooms tells how to join two rooms",
  choices(1) === outside && text("#sides .join-aid").startsWith("To join two rooms, add this door to the other room too."),
  [choices(1), text("#sides .join-aid")],
);
press('#room-list button[data-room="1"]');
addDoor(3, "0.2");
check("a door that goes to a room is not a choice of a different door", choices(1) === `${outside} | Room 1: door 2 on wall 2`, choices(1));
choose(1, 1);
check("a second door at the same place from its two sides fits", joinNote(1) === "fits: Door 2 of Room 2 is door 2 of Room 1." && allState() === fitTogether, [joinNote(1), allState()]);
enter(doorField(1, "offset"), "0.7");
check(
  "a door at a different place from its two sides tells the distance between the two places",
  joinNote(1).startsWith("off: Door 2 of Room 2 and door 2 of Room 1 are 0.5 m apart.") && allState() === "open: All rooms: Room 2 and Room 1 do not fit at a door." && roomNames() === "Room 1:closed,Room 2:closed*",
  [joinNote(1), allState(), roomNames()],
);
press('#room-list button[data-scope="all"]');
check(
  "the rooms together tell the door that does not fit",
  level() === "open" && title() === "Room 2 and Room 1 do not fit at a door." && text("#status-text").includes("are 0.5 m apart") && ties("fits") === 1 && ties("off") === 1 && $$("#plan-box g.plan-tie .plan-tie-line").length === 1,
  [status(), ties("fits"), ties("off")],
);
check("the list of the doors tells the door that does not fit", jointStates() === "fits,off" && fact("Doors between rooms") === "2", [jointStates(), text("#facts")]);
press('#joints li.joint[data-state="off"] button.open-room[data-open="1"]');
check(
  "the name of a room in the list of the doors opens the room at its door",
  roomNames() === "Room 1:closed,Room 2:closed*" && $("#form")?.hidden === false && document.activeElement !== null && document.activeElement === doorField(1, "offset"),
  [roomNames(), document.activeElement?.getAttribute("aria-label")],
);
enter(doorField(1, "offset"), "0.2");
check("the correct distance makes the rooms fit again", joinNote(1) === "fits: Door 2 of Room 2 is door 2 of Room 1." && allState() === fitTogether, [joinNote(1), allState()]);

// The example apartment comes after the rooms of the visitor. No door joins it to the first room, so the drawing shows its rooms apart.
press("#open-example");
check("the example apartment adds its four rooms to the rooms of the visitor", await until(() => rooms().length === 6, 15000), roomNames());
check(
  "the page shows the rooms together, and it tells the rooms that no door joins to the first room",
  $("#stage")?.dataset["scope"] === "all" && roomNames() === "Room 1:closed,Room 2:closed,Living room:closed,Hall:closed,Bathroom:closed,Bedroom:closed" && level() === "typing" && title() === "No door joins 4 rooms to Room 1 yet.",
  [$("#stage")?.dataset["scope"], roomNames(), status()],
);
check(
  "the drawing shows the rooms of the example apart, with a dot at each door between rooms",
  planRooms().length === 6 && apartRooms() === 4 && ties("fits") === 5 && fact("Rooms") === "6" && fact("Doors between rooms") === "5",
  [planRooms().length, apartRooms(), ties("fits"), text("#facts")],
);
check(
  "the list of the doors tells each room that is apart",
  jointStates() === "fits,fits,fits,fits,fits,apart,apart,apart,apart" && text('#joints li.joint[data-state="apart"] .joint-text').startsWith("No door joins this room and its group to Room 1 yet"),
  text("#joints"),
);
check("the page tells that it shows the example apartment", text("#keep-note").startsWith("The page shows the example apartment."), text("#keep-note"));
check("six rooms do not make the page wider than the screen", overflow() <= 0, overflow());

// The removal of each room gives one empty room again. A room goes away with its doors to the other rooms.
for (let left = rooms().length; left > 0; left--) {
  press('#room-list button[data-room="0"]');
  press("#clear");
  if ($("#confirm")?.hidden === false) press("#confirm-yes");
}
check(
  "the removal of each room gives one empty room, and the page keeps no door between rooms",
  roomNames() === "Room 1:typing*" && allRooms() === null && keptRooms() === 1 && keptJoins() === 0 && $("#stage")?.dataset["scope"] === "room",
  [roomNames(), keptRooms(), keptJoins()],
);

// The example apartment in place of an empty room: its four rooms fit together.
press("#open-example");
check("the example apartment replaces an empty room", await until(() => rooms().length === 4, 15000), roomNames());
check(
  "the rooms of the example apartment fit together",
  $("#stage")?.dataset["scope"] === "all" && roomNames() === "Living room:closed,Hall:closed,Bathroom:closed,Bedroom:closed" && level() === "closed" && title() === "The rooms fit together." && jointStates() === "fits,fits,fits",
  [roomNames(), status(), jointStates()],
);
check(
  "the drawing shows the four rooms together, with a dot at each door between rooms",
  planRooms().length === 4 && apartRooms() === 0 && ties("fits") === 3 && fact("Rooms") === "4" && fact("Floor area") !== "" && fact("Doors between rooms") === "3",
  [planRooms().length, apartRooms(), ties("fits"), text("#facts")],
);
const planHeight = $("#plan-box svg.walk")?.getBoundingClientRect().height ?? 0;
check("the drawing of the rooms together has a height of 200 pixels or more", planHeight >= 200, planHeight);
check("the example apartment does not make the page wider than the screen", overflow() <= 0, overflow());

// The next view of the check starts as a first visit, with the example room.
localStorage.removeItem(STORE_KEY);

export {};
