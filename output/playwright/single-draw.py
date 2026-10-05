from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path.cwd()
with sync_playwright() as p:
  b=p.chromium.launch(headless=True)
  page=b.new_page(viewport={"width":1252,"height":576}, reduced_motion="reduce")
  page.goto((root/'index.html').as_uri(), wait_until='domcontentloaded', timeout=15000)
  page.wait_for_timeout(100)
  values=page.evaluate("""() => {
    const input=document.querySelector('#canopy');
    const out=[];
    for(let i=0;i<10;i++){
      const start=performance.now();
      input.value=String(0.58+(1.55-0.58)*i/9);
      input.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:1}));
      input.dispatchEvent(new Event('input',{bubbles:true}));
      input.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:1}));
      out.push(performance.now()-start);
    }
    return out;
  }""")
  print(values, flush=True)
  page.close(); b.close()
