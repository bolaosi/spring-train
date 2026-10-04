(function () {
  "use strict";

  const WORLD_WIDTH = 1252;
  const WORLD_HEIGHT = 576;
  const svg = document.querySelector(".landscape");
  const camera = document.getElementById("camera");
  const farMountain = document.getElementById("mountain-far");
  const nearMountain = document.getElementById("mountain-near");
  const farClouds = document.getElementById("clouds-far");
  const nearClouds = document.getElementById("clouds-near");
  const waterShimmers = document.getElementById("water-shimmers");
  const train = document.getElementById("train");
  const trainWheels = document.getElementById("train-wheels");
  const bridgeHangers = document.getElementById("bridge-hangers");
  const forestBlur = document.getElementById("forest-blur");
  const forestDisplace = document.getElementById("forest-displace");
  const mountainBlur = document.getElementById("mountain-blur");
  const controls = Array.from(document.querySelectorAll("[data-param]"));
  const resetButton = document.getElementById("reset-controls");
  const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");

  const settings = {
    speed: 1.05,
    zoom: 1,
    height: 0,
    clouds: 0.8,
    mountains: 0.78,
    canopy: 1.05,
    detail: 0.58,
    exposure: 1
  };

  const forestLayers = [
    { id: "forest-0", baseline: 389, spacing: 62, height: 67, motion: 12, parallax: 7, phase: 0.3, tempo: 0.22, seed: 113 },
    { id: "forest-1", baseline: 421, spacing: 55, height: 86, motion: 17, parallax: 12, phase: 1.1, tempo: 0.27, seed: 227 },
    { id: "forest-2", baseline: 454, spacing: 47, height: 112, motion: 23, parallax: 18, phase: 2.0, tempo: 0.32, seed: 349 },
    { id: "forest-3", baseline: 493, spacing: 40, height: 145, motion: 30, parallax: 26, phase: 3.1, tempo: 0.37, seed: 461 },
    { id: "forest-4", baseline: 536, spacing: 34, height: 177, motion: 38, parallax: 36, phase: 4.0, tempo: 0.42, seed: 587 }
  ].map((layer) => ({
    ...layer,
    group: document.getElementById(layer.id),
    shape: document.querySelector(`#${layer.id} .forest-shape`),
    glints: document.querySelector(`#${layer.id} .forest-glints`)
  }));

  let elapsed = 0;
  let previousFrame = 0;
  let previousShapeUpdate = -Infinity;
  let frameHandle = 0;
  let isVisible = document.visibilityState === "visible";
  let isReduced = motionPreference.matches;
  let appliedExposure = null;
  let appliedCamera = "";
  let appliedDetail = null;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function normalize(value, min, max) {
    return clamp((value - min) / (max - min), 0, 1);
  }

  function seededRandom(seed) {
    let state = seed >>> 0;
    return function () {
      state += 0x6d2b79f5;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }

  function quadraticContour(points) {
    if (points.length < 2) return "";
    let path = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
    for (let index = 1; index < points.length - 1; index += 1) {
      const current = points[index];
      const next = points[index + 1];
      const midX = (current.x + next.x) / 2;
      const midY = (current.y + next.y) / 2;
      path += ` Q ${current.x.toFixed(1)} ${current.y.toFixed(1)} ${midX.toFixed(1)} ${midY.toFixed(1)}`;
    }
    const last = points[points.length - 1];
    path += ` Q ${last.x.toFixed(1)} ${last.y.toFixed(1)} ${last.x.toFixed(1)} ${last.y.toFixed(1)}`;
    return path;
  }

  function mountainPath(base, time, phase, strength, detail) {
    const points = [];
    const broadAmount = 17 + strength * 29;
    const ridgeAmount = 6 + detail * 10;
    const motionAmount = 7 + strength * 21;
    for (let x = -70; x <= WORLD_WIDTH + 70; x += 24) {
      const broad = Math.sin(x * 0.008 + phase) * broadAmount + Math.sin(x * 0.017 + phase * 1.7) * (8 + strength * 15);
      const ridge = Math.sin(x * 0.038 + phase * 2.1) * ridgeAmount;
      const drift = Math.sin(time * 0.34 + x * 0.006 + phase) * motionAmount;
      const secondary = Math.sin(time * 0.19 + x * 0.013 + phase * 1.4) * (4 + detail * 6);
      points.push({ x, y: base + broad + ridge + (drift + secondary) * (0.65 + strength * 0.28) });
    }
    return `${quadraticContour(points)} L ${WORLD_WIDTH + 70} ${WORLD_HEIGHT + 40} L -70 ${WORLD_HEIGHT + 40} Z`;
  }

  function highlightBlob(x, y, width, height, phase) {
    const wobble = Math.sin(phase) * height * 0.16;
    return `M ${(x - width * 0.48).toFixed(1)} ${(y + wobble).toFixed(1)} `
      + `c ${(width * 0.13).toFixed(1)} ${(-height * 0.8).toFixed(1)} ${(width * 0.57).toFixed(1)} ${(-height * 0.72).toFixed(1)} ${(width * 0.98).toFixed(1)} 0 `
      + `c ${(-width * 0.11).toFixed(1)} ${(height * 0.62).toFixed(1)} ${(-width * 0.62).toFixed(1)} ${(height * 0.74).toFixed(1)} ${(-width * 0.98).toFixed(1)} 0Z `;
  }

  function forestPaths(layer, time) {
    const canopyRatio = normalize(settings.canopy, 0.58, 1.55);
    const detailRatio = normalize(settings.detail, 0, 1.4);
    const count = Math.round(19 + canopyRatio * 20 + (4 - forestLayers.indexOf(layer)) * 2);
    const spacing = WORLD_WIDTH / count;
    const points = [];
    let highlights = "";

    for (let index = -2; index <= count + 2; index += 1) {
      const random = seededRandom(layer.seed + index * 7919);
      const x = index * spacing + spacing * (0.45 + (random() - 0.5) * 0.36);
      const broad = Math.sin(index * 1.18 + layer.phase) * layer.height * 0.12;
      const local = (0.72 + random() * 0.36) * layer.height;
      const largeWave = Math.sin(time * layer.tempo + x * 0.0057 + layer.phase) * layer.motion;
      const secondWave = Math.sin(time * (layer.tempo * 0.61) + x * 0.012 + layer.phase * 1.6) * layer.motion * 0.38;
      const edgeWave = Math.sin(time * (layer.tempo * 1.37) + x * 0.032 + layer.phase) * (2 + detailRatio * 7);
      const top = layer.baseline - local - broad + largeWave + secondWave + edgeWave;
      points.push({ x, y: top });

      if (index % 2 === 0 && random() < 0.76) {
        const patchWidth = spacing * (0.34 + random() * 0.36);
        const patchHeight = 3 + layer.height * (0.035 + detailRatio * 0.045);
        highlights += highlightBlob(
          x + (random() - 0.5) * spacing * 0.28,
          top + layer.height * (0.22 + random() * 0.32),
          patchWidth,
          patchHeight,
          time * 0.12 + random() * Math.PI * 2
        );
      }
    }

    const silhouette = `${quadraticContour(points)} L ${WORLD_WIDTH + 90} ${WORLD_HEIGHT + 30} L -90 ${WORLD_HEIGHT + 30} Z`;
    return { silhouette, highlights };
  }

  function formatValue(name, value) {
    switch (name) {
      case "speed":
      case "clouds":
      case "exposure":
      case "zoom":
        return `${value.toFixed(2)}×`;
      case "height":
        return `${value > 0 ? "+" : ""}${Math.round(value)} px`;
      case "mountains":
      case "canopy":
      case "detail":
        return `${Math.round(normalize(value, Number(document.getElementById(name).min), Number(document.getElementById(name).max)) * 100)}%`;
      default:
        return value.toFixed(2);
    }
  }

  function updateInput(input) {
    const name = input.dataset.param;
    const value = Number(input.value);
    const min = Number(input.min);
    const max = Number(input.max);
    const ratio = ((value - min) / (max - min)) * 100;
    const output = document.getElementById(`${name}-value`);
    settings[name] = value;
    input.style.setProperty("--range-progress", `${ratio}%`);
    if (output) output.value = formatValue(name, value);
    input.setAttribute("aria-valuetext", formatValue(name, value));
  }

  function updateFilters() {
    if (settings.detail === appliedDetail) return;
    const detailRatio = normalize(settings.detail, 0, 1.4);
    const blur = 3.5 - detailRatio * 2.75;
    const displacement = 18 - detailRatio * 9.5;
    forestBlur.setAttribute("stdDeviation", blur.toFixed(2));
    forestDisplace.setAttribute("scale", displacement.toFixed(2));
    mountainBlur.setAttribute("stdDeviation", (1.55 - detailRatio * 0.82).toFixed(2));
    appliedDetail = settings.detail;
  }

  function updateForest(time) {
    updateFilters();
    for (const layer of forestLayers) {
      const paths = forestPaths(layer, time);
      layer.shape.setAttribute("d", paths.silhouette);
      layer.glints.setAttribute("d", paths.highlights);
      const index = forestLayers.indexOf(layer);
      const detailRatio = normalize(settings.detail, 0, 1.4);
      layer.group.style.opacity = (0.82 + detailRatio * 0.18 + index * 0.012).toFixed(3);
    }
  }

  function updateHangers() {
    const pieces = [];
    const spans = [
      [[38, 419], [131, 419], [198, 353], [276, 353]],
      [[276, 353], [330, 353], [405, 419], [490, 419]],
      [[490, 419], [570, 419], [640, 353], [700, 353]],
      [[700, 353], [780, 353], [855, 419], [920, 419]],
      [[920, 419], [995, 419], [1085, 353], [1210, 353]]
    ];
    for (const span of spans) {
      for (let index = 1; index < 10; index += 1) {
        const t = index / 10;
        const u = 1 - t;
        const x = u * u * u * span[0][0] + 3 * u * u * t * span[1][0] + 3 * u * t * t * span[2][0] + t * t * t * span[3][0];
        const y = u * u * u * span[0][1] + 3 * u * u * t * span[1][1] + 3 * u * t * t * span[2][1] + t * t * t * span[3][1];
        pieces.push(`M ${x.toFixed(1)} ${y.toFixed(1)} V 414`);
      }
    }
    bridgeHangers.setAttribute("d", pieces.join(" "));
  }

  function updateTrain(time) {
    const trainSpeed = 29 + settings.speed * 28;
    const trainX = ((time * trainSpeed + 1020) % 1490) - 175;
    const bob = Math.sin(time * 2.3) * 0.8;
    train.setAttribute("transform", `translate(${trainX.toFixed(2)} ${bob.toFixed(2)})`);
    trainWheels.setAttribute("transform", `rotate(${(time * trainSpeed * 2.6).toFixed(2)} 88 410)`);
  }

  function updateScene(time, shapeUpdate) {
    const zoom = settings.zoom;
    const cameraTransform = `translate(626 288) scale(${zoom.toFixed(4)}) translate(-626 ${(settings.height * -0.72 - 288).toFixed(2)})`;
    if (cameraTransform !== appliedCamera) {
      camera.setAttribute("transform", cameraTransform);
      appliedCamera = cameraTransform;
    }

    if (settings.exposure !== appliedExposure) {
      const contrast = 0.92 + normalize(settings.exposure, 0.74, 1.3) * 0.2;
      const saturation = 0.92 + normalize(settings.exposure, 0.74, 1.3) * 0.14;
      svg.style.filter = `brightness(${settings.exposure.toFixed(3)}) contrast(${contrast.toFixed(3)}) saturate(${saturation.toFixed(3)})`;
      appliedExposure = settings.exposure;
    }

    const cloudRatio = normalize(settings.clouds, 0, 1.8);
    const cloudAmplitude = 24 + cloudRatio * 92;
    const farX = Math.sin(time * 0.26 + 0.7) * cloudAmplitude + Math.sin(time * 0.09) * 16;
    const farY = Math.sin(time * 0.38 + 0.3) * (3 + cloudRatio * 14);
    const nearX = Math.sin(time * 0.34 + 2.2) * (cloudAmplitude * 1.22) + Math.sin(time * 0.12 + 1) * 21;
    const nearY = Math.sin(time * 0.44 + 1.5) * (4 + cloudRatio * 18);
    farClouds.setAttribute("transform", `translate(${farX.toFixed(2)} ${farY.toFixed(2)})`);
    nearClouds.setAttribute("transform", `translate(${nearX.toFixed(2)} ${nearY.toFixed(2)})`);

    const mountainRatio = normalize(settings.mountains, 0, 1.6);
    document.querySelector(".mountain--far").setAttribute("transform", `translate(${(Math.sin(time * 0.17 + 0.4) * (5 + mountainRatio * 13)).toFixed(2)} 0)`);
    document.querySelector(".mountain--near").setAttribute("transform", `translate(${(Math.sin(time * 0.23 + 1.7) * (9 + mountainRatio * 20)).toFixed(2)} 0)`);

    forestLayers.forEach((layer, index) => {
      const x = Math.sin(time * (0.18 + index * 0.035) + layer.phase) * layer.parallax;
      const y = Math.sin(time * (0.25 + index * 0.04) + layer.phase * 1.3) * (2 + index * 2.2);
      layer.group.setAttribute("transform", `translate(${x.toFixed(2)} ${y.toFixed(2)})`);
    });

    const waterX = Math.sin(time * 0.32) * 22 + Math.sin(time * 0.11 + 1.4) * 13;
    const waterY = Math.sin(time * 0.4 + 0.8) * 3.5;
    waterShimmers.setAttribute("transform", `translate(${waterX.toFixed(2)} ${waterY.toFixed(2)})`);
    updateTrain(time);

    if (shapeUpdate) {
      const detail = settings.detail;
      farMountain.setAttribute("d", mountainPath(319, time, 0.6, mountainRatio * 0.8, detail));
      nearMountain.setAttribute("d", mountainPath(354, time, 2.4, mountainRatio, detail));
      updateForest(time);
    }
  }

  function applyAllControls() {
    controls.forEach(updateInput);
    updateScene(elapsed, true);
  }

  function renderFrame(timestamp) {
    if (!isVisible || isReduced) {
      frameHandle = 0;
      return;
    }
    if (!previousFrame) previousFrame = timestamp;
    const delta = clamp((timestamp - previousFrame) / 1000, 0, 0.05);
    previousFrame = timestamp;
    elapsed += delta * settings.speed;
    const shouldUpdateShapes = timestamp - previousShapeUpdate >= 26;
    if (shouldUpdateShapes) previousShapeUpdate = timestamp;
    updateScene(elapsed, shouldUpdateShapes);
    frameHandle = window.requestAnimationFrame(renderFrame);
  }

  function startAnimation() {
    if (frameHandle || !isVisible || isReduced) return;
    previousFrame = 0;
    frameHandle = window.requestAnimationFrame(renderFrame);
  }

  function stopAnimation() {
    if (frameHandle) window.cancelAnimationFrame(frameHandle);
    frameHandle = 0;
    previousFrame = 0;
  }

  controls.forEach((input) => {
    input.addEventListener("input", () => {
      updateInput(input);
      const shapeParameter = ["canopy", "detail", "mountains"].includes(input.dataset.param);
      updateScene(elapsed, shapeParameter);
      if (shapeParameter) previousShapeUpdate = performance.now();
    });
  });

  resetButton.addEventListener("click", () => {
    controls.forEach((input) => {
      input.value = input.defaultValue;
    });
    applyAllControls();
    controls[0].focus({ preventScroll: true });
  });

  document.addEventListener("visibilitychange", () => {
    isVisible = document.visibilityState === "visible";
    if (isVisible) startAnimation();
    else stopAnimation();
  });

  window.addEventListener("resize", () => updateScene(elapsed, false));

  function onMotionPreferenceChange(event) {
    isReduced = event.matches;
    if (isReduced) {
      stopAnimation();
      updateScene(0, true);
    } else {
      startAnimation();
    }
  }

  if (typeof motionPreference.addEventListener === "function") {
    motionPreference.addEventListener("change", onMotionPreferenceChange);
  } else if (typeof motionPreference.addListener === "function") {
    motionPreference.addListener(onMotionPreferenceChange);
  }

  updateHangers();
  applyAllControls();
  if (!isReduced) startAnimation();
})();
