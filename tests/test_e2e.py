# tests/test_e2e.py
from playwright.sync_api import sync_playwright
import subprocess
import time

def test_home_page_shows_map():
    server = subprocess.Popen(["python", "app.py"])
    time.sleep(2)

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page()
            page.goto("http://127.0.0.1:5000/")
            assert page.locator("#map").is_visible()
            assert page.locator("#pinList").is_visible()
            browser.close()
    finally:
        server.terminate()