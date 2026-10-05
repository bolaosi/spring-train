from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path.cwd()
with sync_playwright() as p:
  b=p.chromium.launch(headless=True)
  page=b.new_page(viewport={"width":1252,"height":576})
  page.goto((root/'index.html').as_uri(), wait_until='domcontentloaded', timeout=15000)
  print('loaded', flush=True)
  page.wait_for_timeout(500)
  print('waited', flush=True)
  page.close(); b.close()
