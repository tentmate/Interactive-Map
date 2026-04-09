// -------------------------------------------------
// Image map configuration
// These constants define which image is used as the
// map and what its pixel dimensions are.
// -------------------------------------------------

const IMAGE_URL = "/static/eldenringmap.jpg";
const IMAGE_WIDTH = 6780;
const IMAGE_HEIGHT = 7049;


// -------------------------------------------------
// Leaflet map setup
// CRS.Simple makes Leaflet use image pixel-style
// coordinates instead of latitude/longitude.
// maxBounds keeps the map locked inside the box
// so the user cannot drag it into empty space.
// -------------------------------------------------

const bounds = [[0, 0], [IMAGE_HEIGHT, IMAGE_WIDTH]];

const map = L.map("map", {
  crs: L.CRS.Simple,
  minZoom: -5,
  maxZoom: 2,
  maxBounds: bounds,
  maxBoundsViscosity: 1.0,
});

L.imageOverlay(IMAGE_URL, bounds).addTo(map);
map.fitBounds(bounds);


// -------------------------------------------------
// This helps Leaflet recalculate sizing after the
// page layout finishes, which prevents odd blank
// areas during initial render.
// -------------------------------------------------

setTimeout(() => {
  map.invalidateSize();
  map.fitBounds(bounds);
}, 100);


// -------------------------------------------------
// Marker utilities
// These create simple colored pin markers using
// HTML/CSS instead of the default Leaflet icon.
// -------------------------------------------------

const markerById = new Map();

function createMarkerIcon(color) {
  return L.divIcon({
    className: "custom-pin-wrapper",
    html: `<div style="
      width: 18px;
      height: 18px;
      background: ${color};
      border: 2px solid white;
      border-radius: 999px;
      box-shadow: 0 0 8px rgba(0,0,0,0.45);
    "></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

function addMarker(pin) {
  const marker = L.marker([pin.y, pin.x], {
    icon: createMarkerIcon(pin.color),
  }).addTo(map);

  marker.bindPopup(`<strong>${pin.name}</strong><br>${pin.description || "No description"}`);
  markerById.set(pin.id, marker);
}

function updateMarker(pin) {
  const marker = markerById.get(pin.id);
  if (!marker) return;

  marker.setIcon(createMarkerIcon(pin.color));
  marker.bindPopup(`<strong>${pin.name}</strong><br>${pin.description || "No description"}`);
}


// -------------------------------------------------
// Sidebar references
// These point to the pin list and the empty-state
// message shown before any pins are added.
// -------------------------------------------------

const pinList = document.getElementById("pinList");
const emptyState = document.getElementById("emptyState");

function setEmptyStateVisible(visible) {
  if (!emptyState) return;
  emptyState.style.display = visible ? "block" : "none";
}


// -------------------------------------------------
// API helper for updating one pin field at a time.
// This keeps the rename/color/description actions
// all using the same backend endpoint.
// -------------------------------------------------

async function patchPin(pinId, payload) {
  const res = await fetch(`/api/pins/${pinId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const msg = await res.text();
    throw new Error(msg);
  }
}


// -------------------------------------------------
// Pin card UI builder
// This creates the stacked sidebar card for a pin,
/// including name editing, color selection, and
// description editing.
// -------------------------------------------------

function makePinCard(pin) {
  const card = document.createElement("div");
  card.className = "pin-card";
  card.dataset.pinId = String(pin.id);

  const row = document.createElement("div");
  row.className = "pin-row";

  const leftGroup = document.createElement("div");
  leftGroup.style.display = "flex";
  leftGroup.style.alignItems = "center";
  leftGroup.style.gap = "8px";

  const preview = document.createElement("div");
  preview.className = "pin-preview";
  preview.style.background = pin.color;

  const nameEl = document.createElement("div");
  nameEl.className = "pin-name";
  nameEl.textContent = pin.name;

  nameEl.addEventListener("click", async () => {
    const newName = prompt("Enter a name for this pin:", nameEl.textContent || "");
    if (newName === null) return;

    const trimmed = newName.trim();
    if (!trimmed) return;

    try {
      await patchPin(pin.id, { name: trimmed });
      pin.name = trimmed;
      nameEl.textContent = trimmed;
      updateMarker(pin);
    } catch (err) {
      alert("Rename failed.");
      console.error(err);
    }
  });

  leftGroup.appendChild(preview);
  leftGroup.appendChild(nameEl);
  row.appendChild(leftGroup);
  card.appendChild(row);

  const meta = document.createElement("div");
  meta.className = "pin-meta";
  meta.textContent = `x: ${pin.x.toFixed(1)}, y: ${pin.y.toFixed(1)}`;
  card.appendChild(meta);

  const controls = document.createElement("div");
  controls.className = "pin-controls";

  const colorField = document.createElement("div");
  colorField.className = "pin-field";

  const colorLabel = document.createElement("label");
  colorLabel.textContent = "Pin Color";

  const colorSelect = document.createElement("select");
  const colors = [
    { value: "gold", label: "Gold" },
    { value: "red", label: "Red" },
    { value: "blue", label: "Blue" },
    { value: "green", label: "Green" },
    { value: "purple", label: "Purple" },
    { value: "white", label: "White" },
  ];

  colors.forEach((c) => {
    const option = document.createElement("option");
    option.value = c.value;
    option.textContent = c.label;
    if (c.value === pin.color) {
      option.selected = true;
    }
    colorSelect.appendChild(option);
  });

  colorSelect.addEventListener("change", async () => {
    const newColor = colorSelect.value;

    try {
      await patchPin(pin.id, { color: newColor });
      pin.color = newColor;
      preview.style.background = newColor;
      updateMarker(pin);
    } catch (err) {
      alert("Color update failed.");
      console.error(err);
    }
  });

  colorField.appendChild(colorLabel);
  colorField.appendChild(colorSelect);

  const descriptionField = document.createElement("div");
  descriptionField.className = "pin-field";

  const descriptionLabel = document.createElement("label");
  descriptionLabel.textContent = "Description";

  const descriptionBox = document.createElement("textarea");
  descriptionBox.placeholder = "Add a description for this pin...";
  descriptionBox.value = pin.description || "";

  descriptionBox.addEventListener("change", async () => {
    const newDescription = descriptionBox.value.trim();

    try {
      await patchPin(pin.id, { description: newDescription });
      pin.description = newDescription;
      updateMarker(pin);
    } catch (err) {
      alert("Description update failed.");
      console.error(err);
    }
  });

  descriptionField.appendChild(descriptionLabel);
  descriptionField.appendChild(descriptionBox);

  controls.appendChild(colorField);
  controls.appendChild(descriptionField);
  card.appendChild(controls);

  return card;
}

function addPinToUI(pin) {
  setEmptyStateVisible(false);
  const card = makePinCard(pin);
  pinList.appendChild(card);
}


// -------------------------------------------------
// Initial pin loading
// This restores all existing pins from the backend
// when the page first opens.
// -------------------------------------------------

async function loadPins() {
  const res = await fetch("/api/pins");
  const pins = await res.json();

  pinList.innerHTML = "";
  pinList.appendChild(emptyState);

  if (!pins.length) {
    setEmptyStateVisible(true);
    return;
  }

  setEmptyStateVisible(false);

  pins.forEach((pin) => {
    addMarker(pin);
    addPinToUI(pin);
  });
}


// -------------------------------------------------
// Map click behavior
// Clicking the map creates a new pin on the backend,
// adds a marker to the map, and adds a card to the
// sidebar.
// -------------------------------------------------

map.on("click", async (e) => {
  const y = e.latlng.lat;
  const x = e.latlng.lng;

  const res = await fetch("/api/pins", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ x, y }),
  });

  const data = await res.json();
  if (!data.ok) {
    alert("Failed to create pin");
    return;
  }

  const pin = data.pin;
  addMarker(pin);
  addPinToUI(pin);
});


// -------------------------------------------------
// Start-up
// This loads any saved pins as soon as the page
// finishes initializing.
// -------------------------------------------------

loadPins();