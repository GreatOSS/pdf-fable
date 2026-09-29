// Minimal inline stroke icons (24x24). Kept local so the app has no icon-font dependency.
const P: Record<string, string> = {
  sidebar: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
  open: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  up: '<path d="m6 15 6-6 6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  minus: '<path d="M5 12h14"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  cursor: '<path d="M5 3l14 8-6 2-3 6z"/>',
  hand: '<path d="M8 13V6a1.5 1.5 0 0 1 3 0v6M11 5a1.5 1.5 0 0 1 3 0v7M14 6.5a1.5 1.5 0 0 1 3 0V13M17 9.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-2a6 6 0 0 1-5-3l-3-5a1.6 1.6 0 0 1 2.7-1.6L8 13"/>',
  highlight: '<path d="m9 11 4-4 4 4-6 6H8v-3z"/><path d="M4 20h16"/>',
  text: '<path d="M5 6h14M12 6v13M9 19h6"/>',
  pen: '<path d="M4 20l4-1 10-10a2.1 2.1 0 0 0-3-3L5 16z"/><path d="m13 7 3 3"/>',
  image: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="m21 16-5-5-8 8"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="m20 20-4.5-4.5"/>',
  rotate: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 5v6h-6"/>',
  rotateccw: '<path d="M4 11a8 8 0 1 1 2.3 5.7"/><path d="M4 5v6h6"/>',
  save: '<path d="M12 4v11M8 11l4 4 4-4"/><path d="M4 19h16"/>',
  print: '<path d="M7 9V4h10v5"/><rect x="4" y="9" width="16" height="8" rx="2"/><path d="M7 14h10v6H7z"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  more: '<circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  undo: '<path d="M4 10h10a5 5 0 0 1 0 10H9"/><path d="m8 6-4 4 4 4"/>',
  redo: '<path d="M20 10H10a5 5 0 0 0 0 10h5"/><path d="m16 6 4 4-4 4"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  export: '<path d="M12 15V4M8 8l4-4 4 4"/><path d="M4 14v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5"/>',
};

export function icon(name: string): string {
  const d = P[name] ?? "";
  return `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
}

/** Fills every element with a data-icon attribute with its SVG icon. */
export function applyIcons(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>("[data-icon]").forEach((el) => {
    const name = el.dataset.icon!;
    const keep = el.querySelector(".dirty-dot");
    el.innerHTML = icon(name);
    if (keep) el.appendChild(keep);
  });
}
