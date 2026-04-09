from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional
from flask import Flask, render_template, request, jsonify, redirect, url_for, session
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__)
app.secret_key = "dev-secret-change-me"  # Session key for login state during development


# -------------------------------------------------
# In-memory data storage
# This keeps users and pins available while the app
# is running, but resets when the server restarts.
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
# Helper function to get the currently logged-in user
# from the Flask session.
# -------------------------------------------------

def current_user() -> Optional[str]:
    return session.get("username")


# -------------------------------------------------
# Page routes
# These render the main pages of the site.
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
# Pin API routes
# These endpoints let the front end create, read,
# and update pin data.
# -------------------------------------------------

@app.get("/api/pins")
def api_pins():
    return jsonify([
        {
            "id": p.id,
            "x": p.x,
            "y": p.y,
            "name": p.name,
            "color": p.color,
            "description": p.description,
        }
        for p in PINS
    ])


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
        description=""
    )

    NEXT_PIN_ID += 1
    PINS.append(pin)

    return jsonify({
        "ok": True,
        "pin": {
            "id": pin.id,
            "x": pin.x,
            "y": pin.y,
            "name": pin.name,
            "color": pin.color,
            "description": pin.description,
        }
    })


@app.patch("/api/pins/<int:pin_id>")
def api_update_pin(pin_id: int):
    data = request.get_json(force=True)

    for p in PINS:
        if p.id == pin_id:
            if "name" in data:
                new_name = (data.get("name") or "").strip()
                if not new_name:
                    return jsonify({"ok": False, "error": "Name cannot be empty"}), 400
                p.name = new_name

            if "color" in data:
                new_color = (data.get("color") or "").strip()
                if not new_color:
                    return jsonify({"ok": False, "error": "Color cannot be empty"}), 400
                p.color = new_color

            if "description" in data:
                p.description = (data.get("description") or "").strip()

            return jsonify({"ok": True})

    return jsonify({"ok": False, "error": "Pin not found"}), 404


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)