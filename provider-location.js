(() => {
  const mapEl = document.getElementById('providerLocationMap');
  const useButton = document.getElementById('providerUseLocation');
  const stateEl = document.getElementById('providerLocationState');
  const summaryEl = document.getElementById('mapSummary');
  if (!mapEl || !useButton) return;

  let map = null;
  let marker = null;
  let radiusCircle = null;
  let initialized = false;

  function setText(el, value) { if (el) el.textContent = value; }
  function coordsAreValid() {
    return Number.isFinite(Number(provider?.latitude)) && Number.isFinite(Number(provider?.longitude));
  }
  function updateSummary() {
    if (!coordsAreValid()) {
      setText(stateEl, 'No exact location selected yet. Tap the map or use GPS.');
      setText(summaryEl, (provider?.area || 'Locality') + ', ' + (provider?.radius || '5') + ' km radius');
      return;
    }
    const lat = Number(provider.latitude).toFixed(5);
    const lng = Number(provider.longitude).toFixed(5);
    setText(stateEl, 'Service point locked at ' + lat + ', ' + lng);
    setText(summaryEl, (provider?.area || 'Locality') + ' · ' + (provider?.radius || '5') + ' km radius');
  }

  function draw() {
    if (!map || !coordsAreValid()) return;
    const point = [Number(provider.latitude), Number(provider.longitude)];
    if (!marker) {
      marker = L.marker(point, { keyboard: false, title: 'Provider service point' }).addTo(map);
      marker.bindPopup('<b>Your service point</b><br>Customers will discover you around this location.');
    } else marker.setLatLng(point);
    if (radiusCircle) radiusCircle.remove();
    radiusCircle = L.circle(point, { radius: Number(provider.radius || 5) * 1000, weight: 1, fillOpacity: 0.08 }).addTo(map);
    map.setView(point, Math.max(map.getZoom(), 14), { animate: true });
    updateSummary();
  }

  function init() {
    if (initialized) { setTimeout(() => map?.invalidateSize(), 80); draw(); return; }
    if (!window.L) { setText(stateEl, 'Map library could not load. GPS will still be available.'); return; }
    initialized = true;
    const initial = coordsAreValid() ? [Number(provider.latitude), Number(provider.longitude)] : [23.0225, 72.5714];
    map = L.map(mapEl, { zoomControl: true, attributionControl: true, preferCanvas: true }).setView(initial, coordsAreValid() ? 14 : 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
    map.on('click', event => {
      provider.latitude = Number(event.latlng.lat.toFixed(7));
      provider.longitude = Number(event.latlng.lng.toFixed(7));
      provider.accuracy = null;
      if (typeof save === 'function') save();
      draw();
      setText(stateEl, 'Service point selected. Tap “Save area” to sync it to Doodhwala.');
    });
    setTimeout(() => map.invalidateSize(), 100);
    draw();
    updateSummary();
  }

  async function useCurrentLocation() {
    if (!navigator.geolocation) { setText(stateEl, 'Location services are unavailable on this device.'); return; }
    useButton.disabled = true;
    useButton.textContent = 'Finding location…';
    setText(stateEl, 'Requesting precise GPS location…');
    navigator.geolocation.getCurrentPosition(
      position => {
        provider.latitude = Number(position.coords.latitude.toFixed(7));
        provider.longitude = Number(position.coords.longitude.toFixed(7));
        provider.accuracy = Number(position.coords.accuracy) || null;
        if (typeof save === 'function') save();
        init();
        draw();
        setText(stateEl, 'GPS location selected. Tap “Save area” to sync it to Doodhwala.');
        useButton.disabled = false;
        useButton.textContent = '⌖ Use current location';
      },
      error => {
        useButton.disabled = false;
        useButton.textContent = '⌖ Use current location';
        setText(stateEl, error?.code === 1 ? 'Location permission was denied. Enable it in browser settings and try again.' : 'GPS location could not be found. Try again outdoors or near a window.');
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
    );
  }

  document.querySelectorAll('[data-view="service"]').forEach(button => button.addEventListener('click', () => setTimeout(init, 120)));
  useButton.addEventListener('click', () => { init(); useCurrentLocation(); });
  window.addEventListener('doodhwala:provider-service-updated', () => { if (initialized) draw(); });
  updateSummary();
})();