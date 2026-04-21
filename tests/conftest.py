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