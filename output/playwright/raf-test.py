from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path.cwd()
with sync_playwright() as p:
  b=p.chromium.launch(headless=True)
  page=b.new_page(viewport={"width":1252,"height":576})
  page.goto((root/'index.html').as_uri(), wait_until='domcontentloaded', timeout=15000)
  page.wait_for_timeout(100)
  print('before eval', flush=True)
  page.evaluate("""() => {
    window.__perfIntervals=[]; window.__perfLast=0;
    const tick=t=>{ if(window.__perfLast) window.__perfIntervals.push(t-window.__perfLast); window.__perfLast=t; requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }""")
  print('after eval', flush=True)
  page.wait_for_timeout(500)
  print('after wait', page.evaluate('() => window.__perfIntervals.length'), flush=True)
  page.close(); b.close()
