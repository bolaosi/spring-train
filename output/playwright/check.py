import json
from pathlib import Path
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[2]
report = {"errors": [], "layouts": [], "parameters": {}}
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1600, "height": 900}, reduced_motion="reduce")
    page.on("pageerror", lambda e: report["errors"].append(str(e)))
    page.on("console", lambda m: report["errors"].append(m.text) if m.type == "error" else None)
    page.goto(root.joinpath("index.html").as_uri())
    page.wait_for_timeout(100)
    report["directFile"] = page.title()
    for width, height in [(1600,900),(1280,720),(390,844),(320,568),(844,390),(667,375)]:
        page.set_viewport_size({"width":width,"height":height})
        page.wait_for_timeout(80)
        result = page.evaluate("""() => {
          const panel=document.querySelector('.parameter-panel').getBoundingClientRect();
          const rect=document.querySelector('.reset-button').getBoundingClientRect();
          return {viewport:[innerWidth,innerHeight],scroll:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],panel:[panel.left,panel.top,panel.right,panel.bottom],button:[rect.left,rect.top,rect.right,rect.bottom]};
        }""")
        assert result['scroll']==[width,height], result
        assert result['panel'][0]>=0 and result['panel'][1]>=0 and result['panel'][2]<=width and result['panel'][3]<=height, result
        assert result['button'][3]<=height, result
        report['layouts'].append(result)
        if (width,height) in [(1600,900),(390,844)]:
            page.screenshot(path=str(root/f'output/playwright/{width}x{height}.png'))
    page.set_viewport_size({"width":1600,"height":900})
    selectors={'zoom':'#camera','height':'#camera','clouds':'#clouds-far','mountains':'#mountain-far','canopy':'#forest-3 .forest-shape','detail':'#forest-3 .forest-shape','exposure':'.landscape'}
    for name,selector in selectors.items():
        result=page.evaluate("""({name,selector})=>{
          const input=document.getElementById(name), target=document.querySelector(selector);
          const read=()=> name==='exposure'?target.getAttribute('style'):(target.getAttribute('d')||target.getAttribute('transform'));
          input.value=input.min; input.dispatchEvent(new Event('input',{bubbles:true})); const a=read();
          input.value=input.max; input.dispatchEvent(new Event('input',{bubbles:true})); const b=read();
          const output=document.getElementById(name+'-value').value;
          document.getElementById('reset-controls').click();
          return {changed:a!==b,output};
        }""",{'name':name,'selector':selector})
        assert result['changed'], (name,result)
        report['parameters'][name]=result
    page.locator('#speed').focus()
    before=page.locator('#speed').input_value()
    page.keyboard.press('ArrowUp')
    after=page.locator('#speed').input_value()
    assert float(after)>float(before), (before,after)
    report['keyboard']={'before':before,'after':after}
    brightness=[]
    for value in [0.78,1.24]:
        page.locator('#exposure').evaluate('(el,v)=>{el.value=v;el.dispatchEvent(new Event("input",{bubbles:true}));}',value)
        page.wait_for_function("value => getComputedStyle(document.querySelector('.landscape')).filter.includes(String(value))",arg=value)
        brightness.append(page.locator('.landscape').evaluate('(el)=>getComputedStyle(el).filter'))
    assert brightness[0]!=brightness[1],brightness
    report['exposureRendered']=brightness
    page.locator('#reset-controls').click()
    a=page.locator('#forest-3 .forest-shape').get_attribute('d')
    page.wait_for_timeout(160)
    assert a==page.locator('#forest-3 .forest-shape').get_attribute('d')
    report['reducedMotionStatic']=True
    page.goto(root.joinpath('index.html').as_uri())
    page.emulate_media(reduced_motion='no-preference')
    page.wait_for_timeout(100)
    a=page.locator('#forest-3 .forest-shape').get_attribute('d')
    page.wait_for_timeout(300)
    assert a!=page.locator('#forest-3 .forest-shape').get_attribute('d')
    report['automaticMotion']=True
    page.evaluate("""() => { window.__perf={costs:[],intervals:[],last:0}; const native=window.requestAnimationFrame.bind(window);window.requestAnimationFrame=callback=>native(t=>{const start=performance.now();callback(t);window.__perf.costs.push(performance.now()-start);if(window.__perf.last)window.__perf.intervals.push(t-window.__perf.last);window.__perf.last=t;}); }""")
    page.wait_for_timeout(2500)
    report['performance']=page.evaluate("""()=> {const p=window.__perf,c=p.costs.sort((a,b)=>a-b),i=p.intervals.sort((a,b)=>a-b);return {frames:c.length,averageCostMs:p.costs.reduce((a,b)=>a+b,0)/c.length,p95CostMs:c[Math.floor(c.length*.95)],medianFrameMs:i[Math.floor(i.length*.5)],p95FrameMs:i[Math.floor(i.length*.95)]};}""")
    for rate in [0.2,1.8]:
        page.locator('#speed').evaluate('(el,v)=>{el.value=v;el.dispatchEvent(new Event("input",{bubbles:true}));}', rate)
        a=page.locator('#clouds-far').get_attribute('transform')
        page.wait_for_timeout(300)
        b=page.locator('#clouds-far').get_attribute('transform')
        assert a!=b
        report['parameters'][f'speed-{rate}']={'animated':True}
    assert not report['errors'], report['errors']
    browser.close()
root.joinpath('output/playwright/report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=False,indent=2))
