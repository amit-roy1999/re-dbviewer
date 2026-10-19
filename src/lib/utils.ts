export { cn } from "cn";

/** Mount Radix overlays inside #root so they share app zoom. */
export function overlayPortalContainer(): HTMLElement {
  return document.getElementById("root") ?? document.body;
}
