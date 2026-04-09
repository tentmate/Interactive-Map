// -------------------------------------------------
// Image map configuration
// These values define the image file and its real
// pixel dimensions for Leaflet's simple coordinate
// system.
// -------------------------------------------------

const IMAGE_URL = "/static/eldenringmap.jpg";
const IMAGE_WIDTH = 6780;
const IMAGE_HEIGHT = 7049;


// -------------------------------------------------
// Leaflet map setup
// CRS.Simple makes the map use pixel-style image
// coordinates. maxBounds locks the map so it stays
// inside its visible frame instead of drifting into
// empty space.
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

setTimeout(() => {
  map.invalidateSize();
  map.fitBounds(bounds);
}, 100);


// -------------------------------------------------
// Front-end state
// These variables keep track of the visible markers,
// current moving pin mode, and the sidebar elements.
// -------------------------------------------------

const markerById = new Map();
let movingPinId = null;

const pinList = document.getElementById("pinList");
const emptyState = document.getElementById("emptyState");

const collectionList = document.getElementById("collectionList");
const collectionEmptyState = document.getElementById("collectionEmptyState");
const collectionNameInput = document.getElementById("collectionName");

const clearPinsBtn = document.getElementById("clearPinsBtn");
const saveCollectionBtn = document.getElementById("saveCollectionBtn");


// -------------------------------------------------
// Marker creation and updates
// These helpers create colored custom markers and
// keep their icons and popup content in sync.
// -------------------------------------------------

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

  marker.setLatLng([pin.y, pin.x]);
  marker.setIcon(createMarkerIcon(pin.color));
  marker.bindPopup(`<strong>${pin.name}</strong><br>${pin.description || "No description"}`);
}

function removeMarker(pinId) {
  const marker = markerById.get(pinId);
  if (!marker) return;

  map.removeLayer(marker);
  markerById.delete(pinId);
}

function clearAllMarkers() {
  for (const marker of markerById.values()) {
    map.removeLayer(marker);
  }
  markerById.clear();
}


// -------------------------------------------------
// Cursor and move mode
// This turns the map cursor into a colored pin-like
// marker while the user is choosing a new position.
// -------------------------------------------------

function buildMoveCursor(color) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">
      <circle cx="14" cy="14" r="7" fill="${color}" stroke="white" stroke-width="2"/>
    </svg>
  `;
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}") 14 14, crosshair`;
}

function setMoveCursor(color) {
  const mapEl = document.getElementById("map");
  mapEl.style.cursor = buildMoveCursor(color);
}

function resetMapCursor() {
  const mapEl = document.getElementById("map");
  mapEl.style.cursor = "";
}

function exitMoveMode() {
  movingPinId = null;
  resetMapCursor();

  document.querySelectorAll(".move-btn").forEach((btn) => {
    btn.classList.remove("move-active");
    btn.textContent = "Move";
  });
}


// -------------------------------------------------
// Shared UI helpers
// These toggle empty messages and rebuild the pin
// and collection panels after backend changes.
// -------------------------------------------------

function setEmptyStateVisible(visible) {
  if (!emptyState) return;
  emptyState.style.display = visible ? "block" : "none";
}

function setCollectionEmptyStateVisible(visible) {
  if (!collectionEmptyState) return;
  collectionEmptyState.style.display = visible ? "block" : "none";
}

function clearPinUI() {
  pinList.innerHTML = "";
  pinList.appendChild(emptyState);
  setEmptyStateVisible(true);
}

function clearCollectionUI() {
  collectionList.innerHTML = "";
  collectionList.appendChild(collectionEmptyState);
  setCollectionEmptyStateVisible(true);
}


// -------------------------------------------------
// API helpers
// These keep fetch logic centralized so all create,
// update, delete, save, and load actions behave
// consistently.
// -------------------------------------------------

async function patchPin(pinId, payload) {
  const res = await fetch(`/api/pins/${pinId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Pin update failed");
  }

  return data;
}

async function deletePin(pinId) {
  const res = await fetch(`/api/pins/${pinId}`, {
    method: "DELETE",
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Pin delete failed");
  }

  return data;
}

async function clearPins() {
  const res = await fetch("/api/pins", {
    method: "DELETE",
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Clear pins failed");
  }

  return data;
}

async function createCollection(name) {
  const res = await fetch("/api/collections", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Collection save failed");
  }

  return data;
}

async function renameCollection(collectionId, name) {
  const res = await fetch(`/api/collections/${collectionId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Collection rename failed");
  }

  return data;
}

async function loadCollectionById(collectionId) {
  const res = await fetch(`/api/collections/${collectionId}/load`, {
    method: "POST",
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Collection load failed");
  }

  return data;
}


// -------------------------------------------------
// Pin card builder
// This creates one editable card for each current
// working pin, including rename, color, description,
// remove, and move actions.
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
    const newName = prompt("Enter a name for this pin:", pin.name);
    if (newName === null) return;

    const trimmed = newName.trim();
    if (!trimmed) return;

    try {
      const data = await patchPin(pin.id, { name: trimmed });
      pin.name = data.pin.name;
      nameEl.textContent = pin.name;
      updateMarker(pin);
    } catch (err) {
      alert(err.message);
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

  colors.forEach((color) => {
    const option = document.createElement("option");
    option.value = color.value;
    option.textContent = color.label;
    if (color.value === pin.color) {
      option.selected = true;
    }
    colorSelect.appendChild(option);
  });

  colorSelect.addEventListener("change", async () => {
    try {
      const data = await patchPin(pin.id, { color: colorSelect.value });
      pin.color = data.pin.color;
      preview.style.background = pin.color;
      updateMarker(pin);

      if (movingPinId === pin.id) {
        setMoveCursor(pin.color);
      }
    } catch (err) {
      alert(err.message);
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
    try {
      const data = await patchPin(pin.id, { description: descriptionBox.value.trim() });
      pin.description = data.pin.description;
      updateMarker(pin);
    } catch (err) {
      alert(err.message);
    }
  });

  descriptionField.appendChild(descriptionLabel);
  descriptionField.appendChild(descriptionBox);

  const actionRow = document.createElement("div");
  actionRow.className = "pin-action-row";

  const removeBtn = document.createElement("button");
  removeBtn.className = "btn";
  removeBtn.type = "button";
  removeBtn.textContent = "Remove";

  removeBtn.addEventListener("click", async () => {
    try {
      await deletePin(pin.id);
      removeMarker(pin.id);
      card.remove();

      if (!pinList.querySelector(".pin-card")) {
        setEmptyStateVisible(true);
      }

      if (movingPinId === pin.id) {
        exitMoveMode();
      }
    } catch (err) {
      alert(err.message);
    }
  });

  const moveBtn = document.createElement("button");
  moveBtn.className = "btn move-btn";
  moveBtn.type = "button";
  moveBtn.textContent = "Move";

  moveBtn.addEventListener("click", () => {
    if (movingPinId === pin.id) {
      exitMoveMode();
      return;
    }

    exitMoveMode();
    movingPinId = pin.id;
    moveBtn.classList.add("move-active");
    moveBtn.textContent = "Click map...";
    setMoveCursor(pin.color);
  });

  actionRow.appendChild(removeBtn);
  actionRow.appendChild(moveBtn);

  controls.appendChild(colorField);
  controls.appendChild(descriptionField);
  controls.appendChild(actionRow);
  card.appendChild(controls);

  return card;
}


// -------------------------------------------------
// Collection card builder
// This creates one saved collection card. Clicking
// the card loads its pins into the working area,
// while clicking the name lets the user rename it.
// -------------------------------------------------

function makeCollectionCard(collection) {
  const card = document.createElement("div");
  card.className = "collection-card";
  card.dataset.collectionId = String(collection.id);

  const row = document.createElement("div");
  row.className = "collection-row";

  const nameEl = document.createElement("div");
  nameEl.className = "collection-name";
  nameEl.textContent = collection.name;

  nameEl.addEventListener("click", async (event) => {
    event.stopPropagation();

    const newName = prompt("Rename this collection:", collection.name);
    if (newName === null) return;

    const trimmed = newName.trim();
    if (!trimmed) return;

    try {
      const data = await renameCollection(collection.id, trimmed);
      collection.name = data.collection.name;
      nameEl.textContent = collection.name;
    } catch (err) {
      alert(err.message);
    }
  });

  row.appendChild(nameEl);
  card.appendChild(row);

  const meta = document.createElement("div");
  meta.className = "collection-meta";
  meta.textContent = `${collection.pin_count} pin(s) saved`;
  card.appendChild(meta);

  card.addEventListener("click", async () => {
    try {
      const data = await loadCollectionById(collection.id);
      replaceCurrentPins(data.pins);
    } catch (err) {
      alert(err.message);
    }
  });

  return card;
}


// -------------------------------------------------
// Panel rendering
// These functions rebuild the current pins section
// and collection section from the latest data.
// -------------------------------------------------

function addPinToUI(pin) {
  setEmptyStateVisible(false);
  const card = makePinCard(pin);
  pinList.appendChild(card);
}

function addCollectionToUI(collection) {
  setCollectionEmptyStateVisible(false);
  const card = makeCollectionCard(collection);
  collectionList.appendChild(card);
}

function replaceCurrentPins(pins) {
  exitMoveMode();
  clearAllMarkers();
  clearPinUI();

  if (!pins.length) {
    setEmptyStateVisible(true);
    return;
  }

  pins.forEach((pin) => {
    addMarker(pin);
    addPinToUI(pin);
  });
}

async function loadPins() {
  const res = await fetch("/api/pins");
  const pins = await res.json();
  replaceCurrentPins(pins);
}

async function loadCollections() {
  const res = await fetch("/api/collections");
  const collections = await res.json();

  clearCollectionUI();

  if (!collections.length) {
    setCollectionEmptyStateVisible(true);
    return;
  }

  collections.forEach((collection) => {
    addCollectionToUI(collection);
  });
}


// -------------------------------------------------
// Map click behavior
// A normal click creates a new pin. If move mode is
// active, the click repositions the selected pin
// instead of creating a new one.
// -------------------------------------------------

map.on("click", async (event) => {
  const y = event.latlng.lat;
  const x = event.latlng.lng;

  if (movingPinId !== null) {
    try {
      const data = await patchPin(movingPinId, { x, y });
      const updatedPin = data.pin;

      updateMarker(updatedPin);

      const existingCard = pinList.querySelector(`[data-pin-id="${updatedPin.id}"]`);
      if (existingCard) {
        existingCard.querySelector(".pin-meta").textContent =
          `x: ${updatedPin.x.toFixed(1)}, y: ${updatedPin.y.toFixed(1)}`;
      }

      exitMoveMode();
      return;
    } catch (err) {
      alert(err.message);
      exitMoveMode();
      return;
    }
  }

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

  addMarker(data.pin);
  addPinToUI(data.pin);
});


// -------------------------------------------------
// Toolbar actions
// These buttons clear the current working pins or
// save the current working pins into a collection.
// -------------------------------------------------

clearPinsBtn.addEventListener("click", async () => {
  try {
    await clearPins();
    exitMoveMode();
    clearAllMarkers();
    clearPinUI();
  } catch (err) {
    alert(err.message);
  }
});

saveCollectionBtn.addEventListener("click", async () => {
  const name = collectionNameInput.value.trim();

  if (!name) {
    alert("Please enter a collection name.");
    return;
  }

  try {
    const data = await createCollection(name);

    collectionNameInput.value = "";
    addCollectionToUI(data.collection);

    exitMoveMode();
    clearAllMarkers();
    clearPinUI();
  } catch (err) {
    alert(err.message);
  }
});


// -------------------------------------------------
// Start-up
// These initial calls populate the page with the
// current working pins and any saved collections.
// -------------------------------------------------

loadPins();
loadCollections();