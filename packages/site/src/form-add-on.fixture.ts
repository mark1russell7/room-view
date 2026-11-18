import type { AddOn, Anchor, FormLayer, LayerForm, LayerParse } from "@mark1russell7/room-view";
import type { PageAddOn } from "./page-add-on.ts";

// A test add-on from a form alone.
//
// A false add-on of the tests has no package, so it has no add-on of the core.
// This add-on reads a layer of `formLayer`, and it gives the anchor of each record of a collection with a surface. It examines no meaning.
// Only tests use this file.

type Item = Readonly<Record<string, unknown>>;

const isObject = (value: unknown): value is Item => typeof value === "object" && value !== null && !Array.isArray(value);

/** This function gives the records of one collection of a layer. A layer with no such list gives no record. */
function itemsOf(layer: FormLayer, name: string): readonly Item[] {
  const list = Object.hasOwn(layer, name) ? layer[name] : undefined;
  return Array.isArray(list) ? (list as readonly unknown[]).filter(isObject) : [];
}

/** This function makes a test add-on of the core for a form. It has no function `join`. */
export function formAddOn(form: LayerForm): AddOn<FormLayer> {
  const placed = form.collections.filter((collection) => collection.on !== undefined).map((collection) => collection.name);
  return {
    schema: form.schema,
    parse(value: unknown): LayerParse<FormLayer> {
      return isObject(value) && value["schema"] === form.schema ? { ok: true, layer: value as FormLayer } : { ok: false, errors: [`The value is not a layer "${form.schema}".`] };
    },
    anchors(layer: FormLayer): ReadonlyMap<string, Anchor> {
      const anchors = new Map<string, Anchor>();
      for (const name of placed) {
        for (const item of itemsOf(layer, name)) {
          const { id, anchor } = item;
          if (typeof id === "string" && isObject(anchor)) anchors.set(id, anchor as unknown as Anchor);
        }
      }
      return anchors;
    },
    withAnchors(layer: FormLayer, anchors: ReadonlyMap<string, Anchor>): FormLayer {
      const moved = placed
        .filter((name) => Object.hasOwn(layer, name))
        .map((name): [string, readonly Item[]] => [
          name,
          itemsOf(layer, name).map((item): Item => {
            const anchor = typeof item["id"] === "string" ? anchors.get(item["id"]) : undefined;
            return anchor === undefined ? item : { ...item, anchor };
          }),
        ]);
      return { ...layer, ...Object.fromEntries(moved) };
    },
    check: () => [],
  };
}

/** This function makes the add-on of the page for a form, with the test add-on of the core. It reads no old file. */
export function pageAddOn(form: LayerForm): PageAddOn<FormLayer> {
  return { form, core: formAddOn(form) };
}
