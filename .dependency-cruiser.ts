// The import boundaries of the workspace (@mark1russell7/boundaries): another package is imported only
// through an entry of its package.json. Start the check with `pnpm check:boundaries`.
import { boundaries, type Config } from "@mark1russell7/boundaries";

// The source files of the library packages: the core and each add-on. The site is a page, so it is not in the list.
const library = "^packages/(room-view|electrical)/src/";

const config: Config = boundaries(import.meta.dirname, {
  // The default options keep each package of npm out of the graph. The rules below must see them, so this exclude
  // has no `node_modules`. The option `doNotFollow` of the defaults still stops the analysis at a package of npm.
  options: { exclude: { path: "\\.(test|spec|e2e|probe)\\.[cm]?[jt]sx?$|\\.d\\.[cm]?ts$|/(test|tests|e2e|__tests__|fixtures)/" } },
  forbidden: [
    {
      name: "schema-library-out-of-the-entry-schema",
      severity: "error",
      comment: "Only the entry /schema of a library package imports zod. Thus the root entry has no schema library.",
      from: { path: library, pathNot: `${library}schema\\.ts$` },
      to: { path: "node_modules/zod/" },
    },
    {
      name: "root-entry-gets-to-an-entry-schema",
      severity: "error",
      comment: "The root entry of a library package does not import an entry /schema, directly or through other files.",
      from: { path: `${library}index\\.ts$` },
      to: { path: `${library}schema\\.ts$`, reachable: true },
    },
    {
      name: "marks-library-only-in-the-visual-entries",
      severity: "error",
      comment: "Only the entries /marks and /three of a library package import the visuals package. The folder viewer/ is a part of the entry /three.",
      from: { path: library, pathNot: `${library}(marks\\.ts$|three\\.ts$|viewer/)` },
      to: { path: "node_modules/@mark1russell7/visuals/" },
    },
    {
      name: "root-entry-gets-to-the-marks-library",
      severity: "error",
      comment: "The root entry of a library package does not import the visuals package, directly or through other files. Thus the root entry has no visual part.",
      from: { path: `${library}index\\.ts$` },
      to: { path: "node_modules/@mark1russell7/visuals/", reachable: true },
    },
    {
      name: "root-entry-gets-to-an-entry-marks",
      severity: "error",
      comment: "The root entry of a library package does not import an entry /marks, directly or through other files.",
      from: { path: `${library}index\\.ts$` },
      to: { path: `${library}marks\\.ts$`, reachable: true },
    },
  ],
});
export default config;
