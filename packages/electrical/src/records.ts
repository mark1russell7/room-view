// The records of a layer by their `id`. The entries do not export this module.

/** This function gives the first record of each `id` of a list, in the sequence of the list. */
export function firsts<Item extends { readonly id: string }>(list: readonly Item[]): readonly Item[] {
  const seen = new Set<string>();
  return list.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}
