import type { Anchor, SceneSpace } from "./anchors.ts";
import type { AddOn, AddOnFault, LayerParse, LayerPart } from "./layers.ts";

// A test add-on for the tests of the core. It knows no topic: it shows only the contract of an add-on.

/** A layer of the test add-on: marks, each on one anchor, each with a size. */
export interface MarkLayer {
  readonly marks: readonly { readonly id: string; readonly anchor: Anchor; readonly size: number }[];
}

/** This function makes a test add-on of a schema name, with no function `join`. `seen` gets the space of each check. */
export function markAddOn(schema: string, seen: SceneSpace[] = []): AddOn<MarkLayer> {
  return {
    schema,
    parse(value: unknown): LayerParse<MarkLayer> {
      const marks = (value as { marks?: unknown } | null)?.marks;
      return Array.isArray(marks) ? { ok: true, layer: { marks: marks as MarkLayer["marks"] } } : { ok: false, errors: [`The layer "${schema}" has no list "marks".`] };
    },
    anchors: (layer) => new Map(layer.marks.map((mark) => [mark.id, mark.anchor] as const)),
    withAnchors: (layer, anchors) => ({ marks: layer.marks.map((mark) => ({ ...mark, anchor: anchors.get(mark.id) ?? mark.anchor })) }),
    check(layer, space): readonly AddOnFault[] {
      seen.push(space);
      const faults: AddOnFault[] = [];
      for (const mark of layer.marks) {
        if (!(mark.size > 0)) faults.push({ level: "error", code: "mark-size", at: mark.id, message: `The mark "${mark.id}" has the size ${mark.size}.` });
        if (mark.size > 10) faults.push({ level: "warning", code: "mark-large", at: mark.id, message: `The mark "${mark.id}" is large.` });
      }
      return faults;
    },
  };
}

/** This function gives the marks of the parts of a level in one layer. A mark gets the name that its part gives. */
export function joinMarks(parts: readonly LayerPart<MarkLayer>[]): MarkLayer {
  return { marks: parts.flatMap(({ layer, name }) => layer.marks.map((mark) => ({ ...mark, id: name(mark.id) }))) };
}

/** This function makes the test add-on of a schema name with the function `join`. */
export function joinAddOn(schema: string, seen: SceneSpace[] = []): AddOn<MarkLayer> {
  return { ...markAddOn(schema, seen), join: joinMarks };
}
