(() => {
  const frame = document.getElementById('decomposer-viewer');
  if (!frame) return;
  window.addEventListener('message', (event) => {
    if (event.origin !== window.location.origin || event.source !== frame.contentWindow) return;
    const data = event.data;
    if (!data || data.type !== 'decomposer:height' || !Number.isFinite(data.height)) return;
    frame.style.height = `${Math.max(360, Math.min(2200, data.height))}px`;
  });
})();
