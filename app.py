from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Dict, List, Optional
from flask import Flask, render_template, request, jsonify, redirect, url_for, session
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__)
app.secret_key = "secret-key-go-here"  # Session key for local development


# -------------------------------------------------
# In-memory data models
# These keep the application state alive while the
# server is running. Later, these structures can be
# moved into SQLite tables with very similar fields.
# -------------------------------------------------

@dataclass
class Pin:
    id: int
    x: float
    y: float
    name: str
    color: str
    description: str


@dataclass
class PinCollection:
    id: int
    name: str
    pins: List[dict]


PINS: List[Pin] = []
COLLECTIONS: List[PinCollection] = []

NEXT_PIN_ID = 1
NEXT_COLLECTION_ID = 1

USERS: Dict[str, str] = {}  # username -> password_hash


# -------------------------------------------------
# Session helper
# This returns the current logged-in username, if
# one exists in the Flask session.
# -------------------------------------------------

def current_user() -> Optional[str]:
    return session.get("username")


# -------------------------------------------------
# Serialization helpers
# These convert Pin objects into plain dictionaries
# that can be returned as JSON to the front end.
# -------------------------------------------------

def pin_to_dict(pin: Pin) -> dict:
    return {
        "id": pin.id,
        "x": pin.x,
        "y": pin.y,
        "name": pin.name,
        "color": pin.color,
        "description": pin.description,
    }


def collection_to_dict(collection: PinCollection) -> dict:
    return {
        "id": collection.id,
        "name": collection.name,
        "pin_count": len(collection.pins),
        "pins": collection.pins,
    }


# -------------------------------------------------
# Page routes
# These render the main app pages.
# -------------------------------------------------

@app.get("/")
def home():
    return render_template("home.html", username=current_user())


@app.get("/login")
def login():
    return render_template("login.html", username=current_user(), error=None)


@app.post("/login")
def login_post():
    username = (request.form.get("username") or "").strip()
    password = request.form.get("password") or ""

    if not username or not password:
        return render_template(
            "login.html",
            username=current_user(),
            error="Please enter username and password."
        )

    pw_hash = USERS.get(username)
    if not pw_hash or not check_password_hash(pw_hash, password):
        return render_template(
            "login.html",
            username=current_user(),
            error="Invalid username or password."
        )

    session["username"] = username
    return redirect(url_for("home"))


@app.get("/logout")
def logout():
    session.pop("username", None)
    return redirect(url_for("home"))


@app.get("/register")
def register():
    return render_template("register.html", username=current_user(), error=None)


@app.post("/register")
def register_post():
    username = (request.form.get("username") or "").strip()
    password = request.form.get("password") or ""
    confirm = request.form.get("confirm") or ""

    if not username or not password or not confirm:
        return render_template(
            "register.html",
            username=current_user(),
            error="All fields are required."
        )

    if password != confirm:
        return render_template(
            "register.html",
            username=current_user(),
            error="Passwords do not match."
        )

    if username in USERS:
        return render_template(
            "register.html",
            username=current_user(),
            error="Username already exists."
        )

    USERS[username] = generate_password_hash(password)
    session["username"] = username
    return redirect(url_for("home"))


# -------------------------------------------------
# Current working pin API
# These endpoints manage the active pins shown on
# the map and in the top-right pin editor panel.
# -------------------------------------------------

@app.get("/api/pins")
def api_pins():
    return jsonify([pin_to_dict(p) for p in PINS])


@app.post("/api/pins")
def api_create_pin():
    global NEXT_PIN_ID

    data = request.get_json(force=True)
    x = float(data["x"])
    y = float(data["y"])

    pin = Pin(
        id=NEXT_PIN_ID,
        x=x,
        y=y,
        name=f"Pin {NEXT_PIN_ID}",
        color="gold",
        description="",
    )

    NEXT_PIN_ID += 1
    PINS.append(pin)

    return jsonify({"ok": True, "pin": pin_to_dict(pin)})


@app.patch("/api/pins/<int:pin_id>")
def api_update_pin(pin_id: int):
    data = request.get_json(force=True)

    for pin in PINS:
        if pin.id == pin_id:
            if "name" in data:
                new_name = (data.get("name") or "").strip()
                if not new_name:
                    return jsonify({"ok": False, "error": "Name cannot be empty"}), 400
                pin.name = new_name

            if "color" in data:
                new_color = (data.get("color") or "").strip()
                if not new_color:
                    return jsonify({"ok": False, "error": "Color cannot be empty"}), 400
                pin.color = new_color

            if "description" in data:
                pin.description = (data.get("description") or "").strip()

            if "x" in data:
                pin.x = float(data["x"])

            if "y" in data:
                pin.y = float(data["y"])

            return jsonify({"ok": True, "pin": pin_to_dict(pin)})

    return jsonify({"ok": False, "error": "Pin not found"}), 404


@app.delete("/api/pins/<int:pin_id>")
def api_delete_pin(pin_id: int):
    global PINS
    original_count = len(PINS)
    PINS = [pin for pin in PINS if pin.id != pin_id]

    if len(PINS) == original_count:
        return jsonify({"ok": False, "error": "Pin not found"}), 404

    return jsonify({"ok": True})


@app.delete("/api/pins")
def api_clear_pins():
    PINS.clear()
    return jsonify({"ok": True})


# -------------------------------------------------
# Collection API
# These endpoints save the current active pins into
# named collections and reload a collection back
# into the working pin state.
# -------------------------------------------------

@app.get("/api/collections")
def api_collections():
    return jsonify([collection_to_dict(c) for c in COLLECTIONS])


@app.post("/api/collections")
def api_create_collection():
    global NEXT_COLLECTION_ID

    data = request.get_json(force=True)
    name = (data.get("name") or "").strip()

    if not name:
        return jsonify({"ok": False, "error": "Collection name is required"}), 400

    if not PINS:
        return jsonify({"ok": False, "error": "There are no current pins to save"}), 400

    snapshot = [pin_to_dict(pin) for pin in PINS]

    collection = PinCollection(
        id=NEXT_COLLECTION_ID,
        name=name,
        pins=snapshot,
    )

    NEXT_COLLECTION_ID += 1
    COLLECTIONS.append(collection)

    # Clear current working pins after save
    PINS.clear()

    return jsonify({
        "ok": True,
        "collection": collection_to_dict(collection),
        "pins": [],
    })


@app.patch("/api/collections/<int:collection_id>")
def api_rename_collection(collection_id: int):
    data = request.get_json(force=True)
    new_name = (data.get("name") or "").strip()

    if not new_name:
        return jsonify({"ok": False, "error": "Collection name cannot be empty"}), 400

    for collection in COLLECTIONS:
        if collection.id == collection_id:
            collection.name = new_name
            return jsonify({"ok": True, "collection": collection_to_dict(collection)})

    return jsonify({"ok": False, "error": "Collection not found"}), 404


@app.post("/api/collections/<int:collection_id>/load")
def api_load_collection(collection_id: int):
    global NEXT_PIN_ID

    for collection in COLLECTIONS:
        if collection.id == collection_id:
            PINS.clear()

            for saved_pin in collection.pins:
                pin = Pin(
                    id=NEXT_PIN_ID,
                    x=float(saved_pin["x"]),
                    y=float(saved_pin["y"]),
                    name=saved_pin["name"],
                    color=saved_pin["color"],
                    description=saved_pin["description"],
                )
                NEXT_PIN_ID += 1
                PINS.append(pin)

            return jsonify({
                "ok": True,
                "pins": [pin_to_dict(pin) for pin in PINS]
            })

    return jsonify({"ok": False, "error": "Collection not found"}), 404


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)