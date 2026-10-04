import { icons } from './icons.js';

const options = [
  { value: 'moderate', label: 'Moderate', icon: icons.cloud },
  { value: 'severe', label: 'Severe', icon: icons.sun },
  { value: 'extreme', label: 'Extreme', icon: icons.haze }
];

export function renderSimulatorSettings(selected) {
  return `<section class="control-panel simulator-settings" aria-labelledby="settings-heading">
    <div class="panel-heading"><span class="heading-icon">${icons.gear}</span><h2 id="settings-heading">Simulator settings</h2></div>
    <fieldset class="intensity-fieldset"><legend>Drought Intensity <span class="info-tooltip-wrap"><button class="info-mark" id="drought-info" type="button" aria-label="About drought intensity" aria-controls="drought-tooltip" aria-expanded="false" aria-describedby="drought-tooltip">${icons.info}</button><span class="info-tooltip" id="drought-tooltip" role="tooltip" hidden><strong>Drought intensity</strong><span>Sets the severity of the 12-week drought scenario relative to typical conditions for your NSW location. Higher intensity means lower rainfall and soil moisture, higher evaporative demand, and greater crop stress.</span><span><b>Moderate:</b> ~20th percentile rainfall</span><span><b>Severe:</b> ~5th percentile rainfall</span><span><b>Extreme:</b> ~1st–3rd percentile rainfall</span></span></span></legend>
      <div class="intensity-options" role="radiogroup" aria-label="Drought intensity">
        ${options.map(option => `<label class="intensity-option"><input type="radio" name="droughtIntensity" value="${option.value}" ${option.value === selected ? 'checked' : ''}><span class="intensity-option-face">${option.icon}<span>${option.label}</span><span class="choice-indicator" aria-hidden="true"></span></span></label>`).join('')}
      </div>
    </fieldset>
  </section>`;
}
