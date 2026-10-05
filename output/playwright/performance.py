import json
import statistics
from pathlib import Path
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[2]

def summarize(values):
    values = [float(v) for v in values if v > 0]
    if not values:
        return {"frames": 0}
    ordered = sorted(values)
    return {
        "frames": len(values),
        "avgMs": round(statistics.mean(values), 2),
        "p95Ms": round(ordered[min(len(ordered)-1, int(len(ordered)*0.95))], 2),
        "maxMs": round(max(values), 2),
        "over25ms": sum(v > 25 for v in values),
        "over33ms": sum(v > 33 for v in values),
        "over50ms": sum(v > 50 for v in values),
    }

with sync_playwright() as playwright:
    print("launch", flush=True)
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1252, "height": 576})
    print("goto", flush=True)
    page.goto(root.joinpath("index.html").as_uri(), wait_until="domcontentloaded", timeout=15000)
    page.wait_for_timeout(300)
    print("collect normal", flush=True)
    page.evaluate("""() => {
      window.__perfIntervals = [];
      window.__perfLast = 0;
      window.__perfCollect = true;
      const tick = t => {
        if (!window.__perfCollect) return;
        if (window.__perfLast) window.__perfIntervals.push(t - window.__perfLast);
        window.__perfLast = t;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }""")
    page.wait_for_timeout(1200)
    normal = page.evaluate("() => window.__perfIntervals.slice()")
    print("normal done", len(normal), flush=True)

    print("collect drag", flush=True)
    page.evaluate("""() => {
      window.__perfIntervals = [];
      window.__perfLast = 0;
      const input = document.querySelector('#canopy');
      input.dispatchEvent(new PointerEvent('pointerdown', {bubbles: true, pointerId: 1}));
      for (let step = 0; step < 160; step += 1) {
        input.value = String(0.58 + (1.55 - 0.58) * step / 159);
        input.dispatchEvent(new Event('input', {bubbles: true}));
      }
      input.dispatchEvent(new PointerEvent('pointerup', {bubbles: true, pointerId: 1}));
      window.__perfCollect = true;
      const tick = t => {
        if (!window.__perfCollect) return;
        if (window.__perfLast) window.__perfIntervals.push(t - window.__perfLast);
        window.__perfLast = t;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }""")
    page.wait_for_timeout(1200)
    drag = page.evaluate("() => window.__perfIntervals.slice()")
    print("drag done", len(drag), flush=True)
    result = {"normal": summarize(normal), "continuousInput": summarize(drag)}
    out = root / "output" / "playwright" / "performance-report.json"
    out.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False, indent=2), flush=True)
    page.close()
    browser.close()
