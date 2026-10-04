export function renderSimulationViewport() {
  return `<section class="simulation-stage" aria-label="Farm simulation">
    <div class="simulation-viewport" id="simulation-viewport">
      <div class="scene-host" id="scene-host"></div>
      <p class="scene-status" id="scene-status" role="status">Loading 3D farm…</p>
      <p class="scene-status scene-asset-status" id="scene-asset-status" role="status" hidden></p>
      <div class="simulation-timeline" aria-label="Simulation timeline">
        <div class="timeline-heading"><strong id="timeline-week">Week 0 of 12</strong><span id="simulation-process">Official NSW baseline</span></div>
        <input id="simulation-scrub" type="range" min="0" max="84" step="0.1" value="0" aria-label="Simulation day" disabled>
        <div class="timeline-landmarks" aria-hidden="true"><span>0</span><span>4</span><span>8</span><span>12</span></div>
        <div class="timeline-actions"><button type="button" id="simulation-playback" disabled>Play</button><button type="button" id="simulation-restart" disabled>Restart</button><button type="button" id="simulation-reset-view" disabled>Reset View</button></div>
        <p class="scene-disclaimer">Wheat and soil illustrate projected conditions. Water events and layer wetting are illustrative, not measured weather or a water-balance forecast.</p>
      </div>
    </div>
    <details class="soil-layer-readout">
      <summary>Soil layers · illustrative wetness</summary>
      <dl>${[['topsoil', 'Topsoil'], ['rootZone', 'Root zone'], ['deepSoil', 'Deep soil']].map(([key, label]) => `<div><dt>${label}</dt><dd id="layer-${key}">—</dd></div>`).join('')}</dl>
      <p>Relative visual scale, 0 dry to 1 wet. These are not measured water percentages. Deeper layers respond more slowly to the projected SWI.</p>
    </details>
  </section>`;
}
