(function () {
  function buildFallbackImageDataUri(label, accent = '#f4c7b6') {
    const safeLabel = String(label || 'FoodXpress').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" role="img" aria-label="${safeLabel}">
        <defs>
          <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stop-color="#fffaf4" />
            <stop offset="100%" stop-color="#f5e9df" />
          </linearGradient>
        </defs>
        <rect width="800" height="600" rx="36" fill="url(#bg)"/>
        <circle cx="610" cy="165" r="88" fill="${accent}" opacity="0.38"/>
        <circle cx="162" cy="440" r="120" fill="#f9d4be" opacity="0.38"/>
        <rect x="120" y="120" width="560" height="360" rx="30" fill="#fffdfa" opacity="0.92"/>
        <path d="M220 330c42-84 106-126 183-126 83 0 142 46 179 122" fill="none" stroke="#ed6c3b" stroke-width="18" stroke-linecap="round" opacity="0.8"/>
        <circle cx="310" cy="282" r="9" fill="#ed6c3b"/>
        <circle cx="455" cy="273" r="9" fill="#ed6c3b"/>
        <path d="M250 392h300" stroke="#d8c4b6" stroke-width="12" stroke-linecap="round"/>
        <text x="400" y="468" text-anchor="middle" fill="#241d1a" font-size="42" font-family="Arial, sans-serif" font-weight="700">${safeLabel}</text>
      </svg>
    `;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  }

  const api = { buildFallbackImageDataUri };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (typeof window !== 'undefined') {
    window.buildFallbackImageDataUri = buildFallbackImageDataUri;
  }
  if (typeof globalThis !== 'undefined') {
    globalThis.buildFallbackImageDataUri = buildFallbackImageDataUri;
  }
})();
