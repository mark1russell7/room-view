import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string): string => readFileSync(new URL(path, import.meta.url), "utf8");

const home = read("../index.html");
const measure = read("../measure/index.html");

/** The ids that a script reads with `byId`. A page with no such element stops the script at its start. */
function idsOf(script: string): string[] {
  return [...new Set([...script.matchAll(/\bbyId(?:<[^>]+>)?\("([^"]+)"\)/g)].map((match) => match[1] ?? ""))];
}

/** The ids of the elements of a page. */
function idsIn(page: string): string[] {
  return [...page.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1] ?? "");
}

describe("the home page", () => {
  it("names the package and gives the install command", () => {
    expect(home).toContain("<title>room-view</title>");
    expect(home).toContain("pnpm add @mark1russell7/room-view");
  });

  it("links to the pages of site-pages and to the repository", () => {
    expect(home).toContain('href="./releases/"');
    expect(home).toContain('href="./status/"');
    expect(home).toContain('href="https://github.com/mark1russell7/room-view"');
  });

  it("links to the page Measure a room, in the bar and below the room", () => {
    expect(home.split('href="./measure/"')).toHaveLength(3);
  });

  it("has each element that its script reads", () => {
    const ids = idsOf(read("./index.ts"));
    expect(ids.length).toBeGreaterThan(5);
    expect(ids.filter((id) => !idsIn(home).includes(id))).toEqual([]);
  });

  it("gives each id to one element", () => {
    const ids = idsIn(home);
    expect(ids.filter((id, index) => ids.indexOf(id) !== index)).toEqual([]);
  });
});

describe("the page Measure a room", () => {
  it("has its own title and its script", () => {
    expect(measure).toContain("<title>Measure a room | room-view</title>");
    expect(measure).toContain('<script type="module" src="../src/measure.ts"></script>');
    expect(measure).toContain('<link rel="stylesheet" href="../src/style.css">');
  });

  it("links to the home, to the pages of site-pages and to the repository", () => {
    expect(measure).toContain('href="../"');
    expect(measure).toContain('href="./" aria-current="page"');
    expect(measure).toContain('href="../releases/"');
    expect(measure).toContain('href="../status/"');
    expect(measure).toContain('href="https://github.com/mark1russell7/room-view"');
  });

  it("has each element that its script reads", () => {
    const ids = idsOf(read("./measure.ts"));
    expect(ids.length).toBeGreaterThan(20);
    expect(ids.filter((id) => !idsIn(measure).includes(id))).toEqual([]);
  });

  it("gives each id to one element", () => {
    const ids = idsIn(measure);
    expect(ids.filter((id, index) => ids.indexOf(id) !== index)).toEqual([]);
  });

  it("gives a name to each field of the page", () => {
    const fields = [...measure.matchAll(/<(?:input|select)\b[^>]*>/g)];
    expect(fields.length).toBeGreaterThan(1);
    for (const field of fields) {
      // A field in a label has the text of the label as its name. The hidden field of a file has a button with a name.
      const before = measure.slice(0, field.index);
      const inLabel = before.lastIndexOf("<label") > before.lastIndexOf("</label>");
      const named = inLabel || field[0].includes("aria-label=") || (field[0].includes('type="file"') && field[0].includes(" hidden"));
      expect(named, field[0]).toBe(true);
    }
  });

  it("tells that the numbers go to no server", () => {
    expect(measure).toContain("it sends your numbers to no server");
  });
});
