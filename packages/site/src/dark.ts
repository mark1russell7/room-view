import { currentTheme } from "@mark1russell7/site-pages/chrome";

const darkScheme = matchMedia("(prefers-color-scheme: dark)");

/** This function tells if the page shows its dark colors: the choice of the visitor, else the theme of the system. */
export function isDark(): boolean {
  const theme = currentTheme();
  return theme === "dark" || (theme === "auto" && darkScheme.matches);
}

/** This function starts `change` each time the page changes between its light colors and its dark colors. */
export function onThemeChange(change: () => void): void {
  new MutationObserver(change).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  darkScheme.addEventListener("change", change);
}
