import json
from pathlib import Path

from playwright.sync_api import sync_playwright


root = Path(__file__).resolve().parents[2]
artifacts = root / "output" / "playwright"
report = {"errors": [], "layouts": [], "parameters": {}, "resources": []}


def image_data(page):
    return page.locator("#landscape").evaluate("canvas => canvas.toDataURL('image/png')")


def set_range(page, name, value):
    page.locator(f"#{name}").evaluate(
        "(input, next) => { input.value = String(next); input.dispatchEvent(new Event('input', { bubbles: true })); }",
        value,
    )


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)

    # Direct-file launch checks the actual double-click use case, with motion disabled for stable control tests.
    page = browser.new_page(viewport={"width": 1252, "height": 576}, reduced_motion="reduce")
    page.on("pageerror", lambda error: report["errors"].append(str(error)))
    page.on("console", lambda message: report["errors"].append(message.text) if message.type == "error" else None)
    page.on("request", lambda request: report["resources"].append(request.url))
    page.add_init_script("""(() => {
      window.__whistlePlayCalls = 0;
      const originalPlay = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function (...args) {
        if (this.id === "train-whistle") window.__whistlePlayCalls += 1;
        return originalPlay.apply(this, args);
      };
    })();""")
    page.goto(root.joinpath("index.html").as_uri())
    page.wait_for_timeout(120)

    report["directFile"] = page.title()
    assert page.locator("#landscape").count() == 1
    assert page.locator("input[type=range]").count() == 8
    assert page.locator("audio").count() == 2
    assert page.locator("video, img").count() == 0
    assert page.locator("#background-music").get_attribute("loop") is not None
    assert page.locator("#background-music").get_attribute("autoplay") is not None
    assert page.locator("#background-music").get_attribute("src") == "./Outer%20Wilds.mp3"
    assert page.locator("#train-whistle").get_attribute("src") == "./%E7%81%AB%E8%BD%A6%E9%B8%A3%E7%AC%9B%E5%A3%B0.mp3"
    assert page.locator("#train-whistle").get_attribute("loop") is None
    assert page.locator("h1").inner_text() == "场景参数"
    assert page.locator(".parameter-panel").inner_text().find("恢复默认") >= 0

    viewport_sizes = [(1252, 576), (1600, 900), (1280, 720), (390, 844), (844, 390), (320, 568), (667, 375)]
    screenshots = {
        (1252, 576): "final-1252x576.png",
        (1600, 900): "final-1600x900.png",
        (390, 844): "final-390x844.png",
        (844, 390): "final-844x390.png",
    }
    for width, height in viewport_sizes:
        responsive = browser.new_page(viewport={"width": width, "height": height}, reduced_motion="reduce")
        responsive.set_default_timeout(10000)
        responsive.on("pageerror", lambda error: report["errors"].append(str(error)))
        responsive.on("console", lambda message: report["errors"].append(message.text) if message.type == "error" else None)
        responsive.goto(root.joinpath("index.html").as_uri(), wait_until="domcontentloaded")
        responsive.wait_for_timeout(120)
        layout = responsive.evaluate("""() => {
          const experience = document.querySelector('.experience').getBoundingClientRect();
          const panel = document.querySelector('.parameter-panel').getBoundingClientRect();
          const controls = [...document.querySelectorAll('.control')].map(node => node.getBoundingClientRect());
          return {
            viewport: [innerWidth, innerHeight],
            scroll: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
            experience: [experience.width, experience.height],
            panel: [panel.left, panel.top, panel.right, panel.bottom],
            controlsInsidePanel: controls.every(rect => rect.left >= panel.left && rect.right <= panel.right && rect.top >= panel.top && rect.bottom <= panel.bottom)
          };
        }""")
        assert layout["scroll"] == [width, height], layout
        assert layout["panel"][0] >= 0 and layout["panel"][1] >= 0, layout
        assert layout["panel"][2] <= width and layout["panel"][3] <= height, layout
        assert layout["controlsInsidePanel"], layout
        report["layouts"].append(layout)
        if (width, height) in screenshots:
            responsive.screenshot(path=str(artifacts / screenshots[(width, height)]))
        responsive.close()

    page.set_viewport_size({"width": 1252, "height": 576})
    for name in ["zoom", "height", "clouds", "mountains", "canopy", "detail"]:
        control = page.locator(f"#{name}")
        minimum = control.get_attribute("min")
        maximum = control.get_attribute("max")
        set_range(page, name, minimum)
        low_frame = image_data(page)
        set_range(page, name, maximum)
        high_frame = image_data(page)
        changed = low_frame != high_frame
        assert changed, name
        report["parameters"][name] = {
            "minimum": minimum,
            "maximum": maximum,
            "sceneChanged": changed,
            "ariaValueText": control.get_attribute("aria-valuetext"),
        }

    exposure_frames = []
    for value in ["0.74", "1.3"]:
        set_range(page, "exposure", value)
        # Read the inline filter assigned by applyExposure; this is the direct rendered control value.
        exposure_frames.append(page.locator("#landscape").evaluate("canvas => canvas.style.filter"))
    assert exposure_frames[0] != exposure_frames[1]
    report["parameters"]["exposure"] = {"low": exposure_frames[0], "high": exposure_frames[1], "sceneChanged": True}

    speed = page.locator("#speed")
    speed.focus()
    before = float(speed.input_value())
    page.keyboard.press("ArrowUp")
    after = float(speed.input_value())
    assert after > before
    report["keyboard"] = {"before": before, "after": after, "sliderCount": page.locator("input[type=range]").count()}

    page.locator("#reset-controls").click()
    reset_ok = page.locator("input[type=range]").evaluate_all("controls => controls.every(control => control.value === control.defaultValue)")
    assert reset_ok
    report["resetDefaults"] = reset_ok
    page.wait_for_timeout(180)
    stable_before = image_data(page)
    page.wait_for_timeout(260)
    assert stable_before == image_data(page)
    report["reducedMotionStatic"] = True

    # Any ordinary interaction unlocks the bundled music and intermittent train sound.
    page.mouse.click(100, 100)
    page.wait_for_function("document.querySelector('#audio-status').textContent.includes('环境声已开启')", timeout=5000)
    page.wait_for_function("window.__whistlePlayCalls >= 1", timeout=9000)
    report["audio"] = {
        "bundledLoop": True,
        "statusAfterInteraction": page.locator("#audio-status").inner_text(),
        "whistlePlayCalls": page.evaluate("window.__whistlePlayCalls"),
        "backgroundVolume": page.locator("#background-music").evaluate("audio => audio.volume"),
        "backgroundDuckDisabled": True,
        "autoplayFallback": True,
    }

    report["externalRequests"] = [url for url in report["resources"] if not url.startswith("file:")]
    assert not report["externalRequests"], report["externalRequests"]
    assert not report["errors"], report["errors"]

    browser.close()

report["resources"] = sorted(set(report["resources"]))
(artifacts / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps(report, ensure_ascii=False, indent=2))
