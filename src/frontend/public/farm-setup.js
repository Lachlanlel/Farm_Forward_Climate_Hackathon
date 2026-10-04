import { ensureBaseline, invalidateLocation } from '/frontend/services/baseline-client.js';
(() => {
  const form = document.getElementById('farm-form');
  if (!form || !window.farmForwardState) return;
  const store = window.farmForwardState;
  const locationInput = document.getElementById('farm-location');
  const locationOptions = document.getElementById('location-options');
  const paddockInput = document.getElementById('paddock-size');
  const status = document.getElementById('form-status');
  const errorIds = {
    farmLocation: 'location-error', paddockSizeHa: 'paddock-error',
    soilType: 'soil-error', waterSupply: 'water-error'
  };
  let initial = store.get();
  // A partially saved setup with no farm details is a fresh start, not a
  // deliberate soil or water choice for the next farm.
  if (!initial.farmLocation && !initial.paddockSizeHa && (initial.soilType || initial.waterSupply)) {
    initial = store.update({ soilType: null, waterSupply: null });
  }
  if (initial.farmLocation?.displayName) locationInput.value = initial.farmLocation.displayName;
  if (typeof initial.paddockSizeHa === 'number' && initial.paddockSizeHa > 0)
    paddockInput.value = String(initial.paddockSizeHa);
  function restoreChoices() {
    const saved = store.get();
    for (const name of ['soilType', 'waterSupply']) {
      form.elements[name].value = saved[name] || '';
    }
  }
  restoreChoices();
  window.addEventListener('pageshow', () => requestAnimationFrame(restoreChoices));

  let suggestions = [];
  let active = -1;
  let searchTimer = null;
  let searchController = null;
  let searchSerial = 0;

  function setError(name, message = '') {
    const group = form.querySelector(`[data-field="${name}"]`);
    group.classList.toggle('is-invalid', Boolean(message));
    document.getElementById(errorIds[name]).textContent = message;
    const control = name === 'farmLocation' ? locationInput : name === 'paddockSizeHa' ? paddockInput : form.elements[name];
    if (message) control.setAttribute('aria-invalid', 'true');
    else control.removeAttribute('aria-invalid');
  }

  function closeSuggestions() {
    locationOptions.hidden = true;
    locationOptions.replaceChildren();
    locationInput.setAttribute('aria-expanded', 'false');
    locationInput.removeAttribute('aria-activedescendant');
    suggestions = [];
    active = -1;
  }

  function setActive(index) {
    active = index;
    [...locationOptions.children].forEach((option, i) => {
      option.setAttribute('aria-selected', String(i === index));
      option.querySelector('button').classList.toggle('is-active', i === index);
    });
    if (index >= 0) locationInput.setAttribute('aria-activedescendant', `location-option-${index}`);
    else locationInput.removeAttribute('aria-activedescendant');
  }

  function selectLocation(location) {
    locationInput.value = location.displayName;
    store.update({ farmLocation: location });
    ensureBaseline(location);
    setError('farmLocation');
    status.textContent = '';
    closeSuggestions();
  }

  function showSuggestions(results) {
    suggestions = results;
    active = -1;
    locationOptions.replaceChildren();
    results.forEach((location, index) => {
      const option = document.createElement('li');
      option.id = `location-option-${index}`;
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', 'false');
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = location.displayName;
      button.addEventListener('pointerdown', event => event.preventDefault());
      button.addEventListener('click', () => selectLocation(location));
      option.appendChild(button);
      locationOptions.appendChild(option);
    });
    locationOptions.hidden = !results.length;
    locationInput.setAttribute('aria-expanded', String(Boolean(results.length)));
  }

  function asLocation(feature) {
    const p = feature.properties || {};
    const [longitude, latitude] = feature.geometry?.coordinates || [];
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) ||
        latitude < -37.7 || latitude > -28.1 || longitude < 140.9 || longitude > 153.7 ||
        p.countrycode !== 'AU' || !/^(New South Wales|NSW)$/i.test(p.state || '') ||
        !(p.osm_key === 'place' || p.osm_key === 'highway' || p.housenumber)) return null;
    const suburb = p.city || p.locality || p.district || (p.osm_key === 'place' ? p.name : '') || '';
    const postcode = p.postcode || ({ Narrabri: '2390', Narrandera: '2700' })[suburb] || null;
    const address = p.housenumber && p.street ? `${p.housenumber} ${p.street}` : p.name || p.street || suburb;
    const place = suburb && suburb !== address ? `${address}, ${suburb}` : address;
    return {
      displayName: `${place} NSW${postcode ? ` ${postcode}` : ''}`,
      suburb, suburbOrTown: suburb, postcode, latitude, longitude,
      precision: p.housenumber ? 'address' : p.osm_key === 'highway' ? 'street' : 'locality'
    };
  }

  async function searchLocations(query, serial) {
    searchController?.abort();
    searchController = new AbortController();
    const params = new URLSearchParams({ q: query, limit: '16', bbox: '140.9,-37.7,153.7,-28.1', countrycode: 'AU' });
    for (const layer of ['house', 'street', 'locality', 'district', 'city']) params.append('layer', layer);
    try {
      const response = await fetch(`https://photon.komoot.io/api/?${params}`, { signal: searchController.signal });
      if (!response.ok) throw new Error('Location search unavailable');
      const data = await response.json();
      if (serial !== searchSerial || locationInput.value.trim() !== query) return;
      const seen = new Set();
      const results = (data.features || []).map(asLocation).filter(Boolean).filter(location => {
        if (seen.has(location.displayName)) return false;
        seen.add(location.displayName);
        return true;
      }).slice(0, 7);
      showSuggestions(results);
      if (!results.length) setError('farmLocation', 'No matching NSW locations. Try a nearby town or full address.');
      else setError('farmLocation');
    } catch (error) {
      if (error.name === 'AbortError' || serial !== searchSerial) return;
      closeSuggestions();
      setError('farmLocation', 'Location search is unavailable. Please try again.');
    }
  }

  locationInput.addEventListener('input', () => {
    const query = locationInput.value.trim();
    if (store.get().farmLocation?.displayName !== query) { store.update({ farmLocation: null }); invalidateLocation(null); }
    setError('farmLocation');
    status.textContent = '';
    clearTimeout(searchTimer);
    searchController?.abort();
    searchSerial++;
    closeSuggestions();
    if (query.length < 2) return;
    const serial = searchSerial;
    searchTimer = setTimeout(() => searchLocations(query, serial), 280);
  });
  locationInput.addEventListener('keydown', event => {
    if (locationOptions.hidden || !suggestions.length) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((active + (event.key === 'ArrowDown' ? 1 : -1) + suggestions.length) % suggestions.length);
    } else if (event.key === 'Enter' && active >= 0) {
      event.preventDefault();
      selectLocation(suggestions[active]);
    } else if (event.key === 'Escape') closeSuggestions();
  });
  locationInput.addEventListener('blur', () => setTimeout(closeSuggestions, 140));

  paddockInput.addEventListener('input', () => {
    let value = paddockInput.value.includes('-') ? '' : paddockInput.value.replace(/[^\d.]/g, '');
    const dot = value.indexOf('.');
    if (dot >= 0) value = value.slice(0, dot + 1) + value.slice(dot + 1).replace(/\./g, '');
    if (value.startsWith('.')) value = `0${value}`;
    if (paddockInput.value !== value) paddockInput.value = value;
    const number = Number(value);
    store.update({ paddockSizeHa: value && Number.isFinite(number) && number > 0 ? number : null });
    setError('paddockSizeHa');
    status.textContent = '';
  });
  for (const name of ['soilType', 'waterSupply']) {
    form.elements[name].addEventListener('change', event => {
      store.update({ [name]: event.target.value || null });
      setError(name);
      status.textContent = '';
    });
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    const farm = store.get();
    const invalid = [];
    if (!farm.farmLocation || !Number.isFinite(farm.farmLocation.latitude) || !Number.isFinite(farm.farmLocation.longitude)) {
      setError('farmLocation', 'Choose a NSW location from the suggestions.'); invalid.push(locationInput);
    }
    if (!Number.isFinite(farm.paddockSizeHa) || farm.paddockSizeHa < 1 || farm.paddockSizeHa > 10000) {
      setError('paddockSizeHa', 'Enter a paddock size from 1 to 10,000 hectares.'); invalid.push(paddockInput);
    }
    if (!['sandy', 'clay'].includes(farm.soilType)) {
      setError('soilType', 'Choose a soil type.'); invalid.push(form.elements.soilType);
    }
    if (!['rain-fed', 'irrigated'].includes(farm.waterSupply)) {
      setError('waterSupply', 'Choose a water supply.'); invalid.push(form.elements.waterSupply);
    }
    if (invalid.length) { status.textContent = ''; invalid[0].focus(); return; }
    ensureBaseline(farm.farmLocation);
    if (window.farmForwardTransition) window.farmForwardTransition.navigate('/simulation/');
    else window.location.assign('/simulation/');
  });
})();
