# tests/test_app.py
import pytest
from app import app, PINS, USERS

@pytest.fixture
def client():
    app.config["TESTING"] = True
    with app.test_client() as client:
        PINS.clear()
        USERS.clear()
        yield client
        PINS.clear()
        USERS.clear()

def test_home_page_loads(client):
    response = client.get("/")
    assert response.status_code == 200

def test_api_pins_starts_empty(client):
    response = client.get("/api/pins")
    assert response.status_code == 200
    assert response.get_json() == []

def test_create_pin(client):
    response = client.post("/api/pins", json={"x": 100, "y": 200})
    assert response.status_code == 200
    data = response.get_json()
    assert data["ok"] is True
    assert data["pin"]["x"] == 100
    assert data["pin"]["y"] == 200
    assert data["pin"]["name"].startswith("Pin ")

def test_rename_pin(client):
    created = client.post("/api/pins", json={"x": 10, "y": 20}).get_json()
    pin_id = created["pin"]["id"]

    response = client.patch(f"/api/pins/{pin_id}", json={"name": "Castle"})
    assert response.status_code == 200
    assert response.get_json()["ok"] is True

def test_rename_pin_rejects_empty_name(client):
    created = client.post("/api/pins", json={"x": 10, "y": 20}).get_json()
    pin_id = created["pin"]["id"]

    response = client.patch(f"/api/pins/{pin_id}", json={"name": ""})
    assert response.status_code == 400