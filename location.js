(() => {
  const boot = () => {

  const LOCATION_KEY = "doodhwala-customer-location-v1";
  const modal = document.getElementById("locationModalBackdrop");
  const mapEl = document.getElementById("locationMap");
  const stateEl = document.getElementById("locationState");
  const accuracyEl = document.getElementById("locationAccuracy");
  const nearbyEl = document.getElementById("locationNearbyCount");
  const labelEl = document.getElementById("locationLabel");
  const heroLabelEl = document.getElementById("heroLocationLabel");
  const heroButton = document.getElementById("locationHero");
  const sidebarButton = document.getElementById("locationBtn");
  const closeButton = document.getElementById("locationModalClose");
  const useMeButton = document.getElementById("locationUseMe");
  const doneButton = document.getElementById("locationUse");
  if (!modal || !mapEl) return;

  let saved = readSavedLocation();
  let map = null;
  let userMarker = null;
  let accuracyCircle = null;
  let providerLayer = null;
  let lastPosition = saved;

  function readSavedLocation() {
    try {
      const value = JSON.parse(localStorage.getItem(LOCATION_KEY) || "null");
      if (!value || !Number.isFinite(Number(value.latitude)) || !Number.isFinite(Number(value.longitude))) return null;
      return { latitude: Number(value.latitude), longitude: Number(value.longitude), accuracy: Number(value.accuracy) || null, savedAt: value.savedAt || null };
    } catch (_) { return null; }
  }

  function setText(el, value) { if (el) el.textContent = value; }
  function escapeHtml(value) { const el = document.createElement('div'); el.textContent = String(value ?? ''); return el.innerHTML; }

  function formatDistance(km) {
    if (km == null || !Number.isFinite(Number(km))) return "Nearby";
    const value = Number(km);
    return value < 1 ? Math.max(100, Math.round(value * 1000)) + " m" : value.toFixed(value < 10 ? 1 : 0) + " km";
  }

  function setPageLocationLabel(label) {
    const value = label || "Near me";
    setText(labelEl, value);
    setText(heroLabelEl, value === "Near me" ? "Near you" : value);
    const sideText = sidebarButton?.querySelector("b");
    if (sideText) sideText.textContent = value;
  }

  function ensureMap() {
    if (map || !window.L) {
      if (!window.L) setText(stateEl, "Map is unavailable right now. Location still works and nearby providers can be loaded.");
      return map;
    }
    map = L.map(mapEl, { zoomControl: true, attributionControl: true, preferCanvas: true }).setView([23.0225, 72.5714], 12);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap contributors" }).addTo(map);
    providerLayer = L.layerGroup().addTo(map);
    map.on("click", event => {
      const accuracy = lastPosition?.accuracy || null;
      lastPosition = {
        latitude: Number(event.latlng.lat.toFixed(7)),
        longitude: Number(event.latlng.lng.toFixed(7)),
        accuracy,
        savedAt: new Date().toISOString()
      };
      saved = lastPosition;
      localStorage.setItem(LOCATION_KEY, JSON.stringify(lastPosition));
      setPageLocationLabel("Pinned location");
      drawUser(lastPosition, true);
      setText(stateEl, "Pin moved. Tap Done to use this delivery location.");
      setText(accuracyEl, "Pinned on map");
      if (typeof window.loadRemoteProviders === 'function') {
        window.loadRemoteProviders(lastPosition.latitude, lastPosition.longitude)
          .then(refreshProviderMarkers)
          .catch(() => {});
      }
    });
    if (lastPosition) {
      drawUser(lastPosition, false);
      map.setView([lastPosition.latitude, lastPosition.longitude], 14);
      setText(stateEl, "Saved delivery location. Tap “Use my current location” to refresh it.");
    }
    refreshProviderMarkers();
    setTimeout(() => map.invalidateSize(), 80);
    return map;
  }

  function drawUser(position, pan = true) {
    if (!map || !position) return;
    const point = [position.latitude, position.longitude];
    if (!userMarker) {
      userMarker = L.circleMarker(point, { radius: 9, weight: 3, fillOpacity: 1 }).addTo(map);
      userMarker.bindPopup("<b>Your delivery location</b>");
    } else userMarker.setLatLng(point);
    if (accuracyCircle) accuracyCircle.remove();
    if (position.accuracy && Number(position.accuracy) > 0) {
      accuracyCircle = L.circle(point, { radius: Math.min(Number(position.accuracy), 1000), weight: 1, fillOpacity: 0.08 }).addTo(map);
    }
    if (pan) map.setView(point, Math.max(map.getZoom(), 14), { animate: true });
    setText(accuracyEl, position.accuracy ? "±" + Math.round(position.accuracy) + " m accuracy" : "Current location");
  }

  function refreshProviderMarkers() {
    if (!providerLayer) return;
    providerLayer.clearLayers();
    const list = Array.isArray(window.providers) ? window.providers : [];
    let count = 0;
    const bounds = [];
    for (const provider of list) {
      const lat = Number(provider.latitude);
      const lng = Number(provider.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      count += 1;
      const marker = L.circleMarker([lat, lng], { radius: 7, weight: 2, fillOpacity: 0.95 });
      const distanceText = provider.distanceKm != null ? " · " + formatDistance(provider.distanceKm) : "";
      marker.bindPopup("<b>" + escapeHtml(provider.name || "Local milk provider") + "</b><br><span>" + escapeHtml(provider.area || "Nearby") + escapeHtml(distanceText) + "</span><br><span>" + escapeHtml(provider.tag || "Milk") + "</span>");
      marker.addTo(providerLayer);
      bounds.push([lat, lng]);
    }
    setText(nearbyEl, String(count));
    if (lastPosition && map && count) {
      bounds.push([lastPosition.latitude, lastPosition.longitude]);
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
    } else if (lastPosition && map) map.setView([lastPosition.latitude, lastPosition.longitude], 14);
  }

  async function syncProfileLocation(position) {
    if (!window.Doodhwala?.configured || !position) return;
    try {
      const { data } = await Doodhwala.supabase.auth.getUser();
      const user = data?.user;
      if (!user) return;
      await Doodhwala.supabase.from("profiles").update({ default_latitude: position.latitude, default_longitude: position.longitude, updated_at: new Date().toISOString() }).eq("id", user.id);
    } catch (_) {}
  }

  async function applyPosition(position) {
    lastPosition = { latitude: Number(position.latitude), longitude: Number(position.longitude), accuracy: Number(position.accuracy) || null, savedAt: new Date().toISOString() };
    saved = lastPosition;
    localStorage.setItem(LOCATION_KEY, JSON.stringify(lastPosition));
    setPageLocationLabel("Near you");
    drawUser(lastPosition, true);
    setText(stateEl, "Location found. Loading independent milk providers around you…");
    try {
      if (typeof window.loadRemoteProviders === 'function') await window.loadRemoteProviders(lastPosition.latitude, lastPosition.longitude);
      refreshProviderMarkers();
      setText(stateEl, "Your nearby local milk providers are now shown on the map.");
      await syncProfileLocation(lastPosition);
    } catch (error) {
      console.error(error);
      setText(stateEl, "Location is set, but nearby providers could not be refreshed. Please try again.");
    }
  }

  function locateMe() {
    if (!navigator.geolocation) { setText(stateEl, "This device/browser does not provide location services."); return; }
    useMeButton.disabled = true;
    useMeButton.textContent = "Finding location…";
    setText(stateEl, "Requesting precise location from your device…");
    navigator.geolocation.getCurrentPosition(
      position => {
        useMeButton.disabled = false;
        useMeButton.textContent = "⌖ Use my current location";
        applyPosition(position.coords);
      },
      error => {
        useMeButton.disabled = false;
        useMeButton.textContent = "⌖ Use my current location";
        const message = error?.code === 1 ? "Location permission was denied. Enable location permission in your browser settings and try again." : "We could not get your location. Check GPS/location services and try again.";
        setText(stateEl, message);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
    );
  }

  function open() {
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    ensureMap();
    if (lastPosition) { drawUser(lastPosition, false); refreshProviderMarkers(); }
    setTimeout(() => map?.invalidateSize(), 120);
  }

  function close() {
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
  }

  sidebarButton?.addEventListener('click', open);
  heroButton?.addEventListener('click', open);
  heroButton?.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); }
  });
  document.getElementById('locationTop')?.addEventListener('click', open);
  closeButton?.addEventListener('click', close);
  doneButton?.addEventListener('click', close);
  modal.addEventListener('click', event => { if (event.target === modal) close(); });
  useMeButton?.addEventListener('click', locateMe);
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && modal.classList.contains('open')) close(); });

  if (saved) {
    setPageLocationLabel("Near you");
    setText(accuracyEl, saved.accuracy ? "±" + Math.round(saved.accuracy) + " m accuracy" : "Saved location");
    if (window.Doodhwala?.configured && typeof window.loadRemoteProviders === 'function') window.loadRemoteProviders(saved.latitude, saved.longitude).then(refreshProviderMarkers).catch(() => {});
  }

  window.DoodhwalaLocation = { open, close, locateMe, getSaved: () => lastPosition };
  window.addEventListener('doodhwala:providers-updated', refreshProviderMarkers);

  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();