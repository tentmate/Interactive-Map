from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional
from pathlib import Path
from uuid import uuid4

from flask import (
    Flask,
    render_template,
    request,
    jsonify,
    redirect,
    url_for,
    session,
    send_from_directory,
)
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename
from PIL import Image

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "dev-secret-change-me")


# -------------------------------------------------
# File upload configuration
# These settings define where uploaded map images
# are stored and which file types are allowed.
# -------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent
UPLOAD_FOLDER = BASE_DIR / "uploads"
UPLOAD_FOLDER.mkdir(exist_ok=True)

ALLOWED_IMAGE_EXTENSIONS = {"png", "jpg", "jpeg", "webp"}


# -------------------------------------------------
# In-memory data models
# These keep the current working state of the app
# while the Flask server is running.
# -------------------------------------------------

@dataclass
class Pin:
    id: int
    x: float
    y: float
    name: str
    color: str
    description: str


PINS: List[Pin] = []
NEXT_PIN_ID = 1

USERS: Dict[str, str] = {}  # username -> password_hash


# -------------------------------------------------
# Current map state
# This stores which image is currently being used
# as the active map, along with its pixel size.
# -------------------------------------------------

CURRENT_MAP = {
    "filename": "eldenringmap.jpg",
    "url": "/static/eldenringmap.jpg",
    "width": 6780,
    "height": 7049,
    "source": "static",
}


# -------------------------------------------------
# Helper utilities
# These functions keep small repeated logic out of
# the route handlers.
# -------------------------------------------------

def current_user() -> Optional[str]:
    return session.get("username")


def pin_to_dict(pin: Pin) -> dict:
    return {
        "id": pin.id,
        "x": pin.x,
        "y": pin.y,
        "name": pin.name,
        "color": pin.color,
        "description": pin.description,
    }


def allowed_image_file(filename: str) -> bool:
    if "." not in filename:
        return False

    ext = filename.rsplit(".", 1)[1].lower()
    return ext in ALLOWED_IMAGE_EXTENSIONS


# -------------------------------------------------
# Page routes
# These render the visible HTML pages.
# -------------------------------------------------

@app.get("/")
def home():
    return render_template(
        "home.html",
        username=current_user(),
        current_map=CURRENT_MAP,
    )


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
# Uploaded map serving route
# This lets the browser load user-uploaded files
# from the uploads folder.
# -------------------------------------------------

@app.get("/uploads/<path:filename>")
def uploaded_file(filename: str):
    return send_from_directory(UPLOAD_FOLDER, filename)


# -------------------------------------------------
# Map API routes
# These provide the current map metadata and let the
# user upload a new map image. Uploading a new map
# clears all current pins by design.
# -------------------------------------------------

@app.get("/api/map")
def api_get_map():
    return jsonify(CURRENT_MAP)


@app.post("/api/map/upload")
def api_upload_map():
    global NEXT_PIN_ID

    if "map_file" not in request.files:
        return jsonify({"ok": False, "error": "No file was uploaded."}), 400

    file = request.files["map_file"]

    if not file or not file.filename:
        return jsonify({"ok": False, "error": "No file was selected."}), 400

    if not allowed_image_file(file.filename):
        return jsonify({"ok": False, "error": "Unsupported file type."}), 400

    safe_name = secure_filename(file.filename)
    ext = safe_name.rsplit(".", 1)[1].lower()
    unique_name = f"{uuid4().hex}.{ext}"
    saved_path = UPLOAD_FOLDER / unique_name

    file.save(saved_path)

    try:
        with Image.open(saved_path) as img:
            width, height = img.size
    except Exception:
        saved_path.unlink(missing_ok=True)
        return jsonify({"ok": False, "error": "Could not read image dimensions."}), 400

    CURRENT_MAP["filename"] = unique_name
    CURRENT_MAP["url"] = f"/uploads/{unique_name}"
    CURRENT_MAP["width"] = width
    CURRENT_MAP["height"] = height
    CURRENT_MAP["source"] = "upload"

    # Option A behavior:
    # when a new map is uploaded, all current pins are erased
    PINS.clear()
    NEXT_PIN_ID = 1

    return jsonify({
        "ok": True,
        "message": "Map uploaded successfully. Current pins were cleared.",
        "map": CURRENT_MAP,
        "pins": [],
    })


# -------------------------------------------------
# Pin API routes
# These manage the active working pins shown on the
# current map and in the pin sidebar.
# -------------------------------------------------

@app.get("/api/pins")
def api_pins():
    return jsonify([pin_to_dict(pin) for pin in PINS])


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
    global NEXT_PIN_ID
    PINS.clear()
    NEXT_PIN_ID = 1
    return jsonify({"ok": True})


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
