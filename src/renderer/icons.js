// Toolbar symbols, drawn on a 20-point grid with the current text color.
window.CCIcons = (() => {
  const paths = {
    home: '<path d="M3.5 9.5 10 4l6.5 5.5"/><path d="M5.5 8v7.5h3.5v-4h2v4h3.5V8"/>',
    back: '<path d="M12.5 4.5 7 10l5.5 5.5"/>',
    forward: '<path d="M7.5 4.5 13 10l-5.5 5.5"/>',
    reload: '<path d="M15.5 10a5.5 5.5 0 1 1-1.6-3.9"/><path d="M14.5 3.5v3h-3"/>',
    stop: '<path d="M5.5 5.5l9 9M14.5 5.5l-9 9"/>',
    plus: '<path d="M10 4.5v11M4.5 10h11"/>',
    gear: '<circle cx="10" cy="10" r="2.6"/><path d="M10 2.8v2M10 15.2v2M2.8 10h2M15.2 10h2M4.9 4.9l1.4 1.4M13.7 13.7l1.4 1.4M4.9 15.1l1.4-1.4M13.7 6.3l1.4-1.4"/>',
    pip: '<rect x="2.5" y="4" width="15" height="12" rx="2"/><rect x="10" y="10" width="5.5" height="4" rx="1" fill="currentColor"/>',
    film: '<rect x="3" y="4" width="14" height="12" rx="2"/><path d="M6.5 4v12M13.5 4v12M3 8h3.5M3 12h3.5M13.5 8H17M13.5 12H17"/>',
    megaphone: '<path d="M3.5 8.5v3h2l6 3.5v-10l-6 3.5z"/><path d="M14 8a2.5 2.5 0 0 1 0 4M5.5 11.5l1 4h2l-.8-3.3"/>',
    megaphoneOn: '<path fill="currentColor" d="M3.5 8.5v3h2l6 3.5v-10l-6 3.5z"/><path d="M14 8a2.5 2.5 0 0 1 0 4M5.5 11.5l1 4h2l-.8-3.3"/>',
    warning: '<path d="M10 3.5 17 16H3z"/><path d="M10 8.5v3.5M10 14v.2"/>',
  };
  return name => `<svg class="icon" viewBox="0 0 20 20" aria-hidden="true">${paths[name] || ""}</svg>`;
})();
