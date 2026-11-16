// The order of texts in the results of the core. The entries do not export this module.

/** This function compares two texts by their code points, so the order does not change with the language of a computer. */
export function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
