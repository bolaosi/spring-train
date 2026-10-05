(function () {
  "use strict";

  const SCENE_WIDTH = 1252;
  const SCENE_HEIGHT = 576;
  const SKYLINE = 118;
  const canvas = document.getElementById("landscape");
  const context = canvas.getContext("2d", { alpha: false, desynchronized: true });
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
    { baseline: 236, height: 128, depth: 0.16, spacing: 116, blobWidth: 205, blobHeight: 82, baseJitter: 12, relief: 24, contourStep: 15, blur: 3.2, opacity: 0.54, phase: 0.2, seed: 113, palette: ["#afc4b7", "#97b1a3", "#bdcabd"] },
    { baseline: 292, height: 158, depth: 0.29, spacing: 92, blobWidth: 180, blobHeight: 103, baseJitter: 15, relief: 28, contourStep: 13, blur: 2.6, opacity: 0.65, phase: 1.1, seed: 227, palette: ["#97b29f", "#80a18e", "#a8bba8"] },
    { baseline: 350, height: 185, depth: 0.47, spacing: 74, blobWidth: 176, blobHeight: 124, baseJitter: 19, relief: 34, contourStep: 12, blur: 2.0, opacity: 0.76, phase: 2.15, seed: 349, palette: ["#77a17e", "#5d8e6d", "#86aa80"] },
    { baseline: 404, height: 210, depth: 0.66, spacing: 62, blobWidth: 188, blobHeight: 151, baseJitter: 24, relief: 42, contourStep: 11, blur: 1.6, opacity: 0.88, phase: 3.2, seed: 461, palette: ["#5d8c64", "#477d54", "#71996a"] },
    { baseline: 451, height: 224, depth: 0.82, spacing: 56, blobWidth: 204, blobHeight: 171, baseJitter: 28, relief: 48, contourStep: 10, blur: 1.25, opacity: 0.94, phase: 4.1, seed: 587, palette: ["#477b50", "#326b44", "#578857"] }
  ];

  const foregroundLayers = [
    { baseline: 620, height: 380, depth: 1.18, spacing: 98, blobWidth: 280, blobHeight: 292, baseJitter: 48, relief: 82, contourStep: 13, blur: 5.6, opacity: 0.78, phase: 5.15, seed: 719, foreground: true, palette: ["#4b8056", "#3d724b", "#5f8d59"] },
    { baseline: 710, height: 292, depth: 1.58, spacing: 118, blobWidth: 352, blobHeight: 348, baseJitter: 56, relief: 96, contourStep: 15, blur: 6.8, opacity: 0.82, phase: 6.05, seed: 853, foreground: true, palette: ["#315f42", "#28563b", "#416d48"] }
  ];

  let view = { width: 0, height: 0, scale: 1, offsetX: 0, offsetY: 0, pixelRatio: 1, portraitShift: 0 };
  let elapsed = 0;
  let previousFrame = 0;
  let frameHandle = 0;
  let visible = document.visibilityState === "visible";
  let reduced = motionPreference.matches;

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const unit = (value, min, max) => clamp((value - min) / (max - min), 0, 1);

  function randomAt(seed) {
    let value = seed | 0;
    value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
    value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
    value ^= value >>> 16;
    return (value >>> 0) / 4294967296;
  }

  function valueNoise(value, seed) {
    const floor = Math.floor(value);
    const fraction = value - floor;
    const smooth = fraction * fraction * (3 - 2 * fraction);
    const a = randomAt(seed + floor * 374761393);
    const b = randomAt(seed + (floor + 1) * 374761393);
    return a + (b - a) * smooth;
  }

  function smoothNoise(worldX, seed, scale) {
    const broad = valueNoise(worldX / scale, seed);
    const middle = valueNoise(worldX / (scale * 0.46), seed + 7919);
    const fine = valueNoise(worldX / (scale * 0.18), seed + 15413);
    return broad * 0.58 + middle * 0.3 + fine * 0.12;
  }

  function resizeCanvas() {
    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const scale = Math.max(width / SCENE_WIDTH, height / SCENE_HEIGHT);
    view = {
      width: width,
      height: height,
      scale: scale,
      offsetX: (width - SCENE_WIDTH * scale) / 2,
      offsetY: (height - SCENE_HEIGHT * scale) / 2,
      pixelRatio: pixelRatio,
      portraitShift: width / height < 0.75 ? -96 : 0
    };
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    applyExposure();
  }

  function applyExposure() {
    const value = settings.exposure;
    const normalized = unit(value, 0.74, 1.3);
    canvas.style.filter = "brightness(" + value.toFixed(3) + ") contrast(" + (0.9 + normalized * 0.2).toFixed(3) + ") saturate(" + (0.88 + normalized * 0.2).toFixed(3) + ")";
  }

  function updateInput(input) {
    const name = input.dataset.param;
    const value = Number(input.value);
    const min = Number(input.min);
    const max = Number(input.max);
    const output = document.getElementById(name + "-value");
    settings[name] = value;
    input.style.setProperty("--range-progress", ((value - min) / (max - min)) * 100 + "%");
    if (output) {
      if (["mountains", "canopy", "detail"].includes(name)) output.value = Math.round(unit(value, min, max) * 100) + "%";
      else if (name === "height") output.value = (value > 0 ? "+" : "") + Math.round(value) + " px";
      else output.value = value.toFixed(2) + "×";
    }
    input.setAttribute("aria-valuetext", output ? output.value : String(value));
    if (name === "exposure") applyExposure();
  }

  function screenX(worldX, depth, travel) {
    return view.offsetX + (worldX - travel * depth) * view.scale;
  }

  function screenY(sceneY) {
    return view.offsetY + sceneY * view.scale;
  }

  function drawSky() {
    const skyBottom = screenY(SKYLINE);
    const gradient = context.createLinearGradient(0, 0, 0, Math.max(1, skyBottom));
    gradient.addColorStop(0, "#74a7df");
    gradient.addColorStop(0.58, "#86b5df");
    gradient.addColorStop(1, "#a4c8df");
    context.fillStyle = gradient;
    context.fillRect(0, 0, view.width, view.height);
  }

  function makeVerticalGradient(top, bottom, topColor, bottomColor) {
    const gradient = context.createLinearGradient(0, screenY(top), 0, screenY(bottom));
    gradient.addColorStop(0, topColor);
    gradient.addColorStop(1, bottomColor);
    return gradient;
  }

  function drawMountain(depth, base, phase, amplitude, colors, time, travel, layerIndex) {
    const step = Math.max(14, 22 * view.scale);
    const points = [];
    for (let x = -step * 2; x <= view.width + step * 2; x += step) {
      const worldX = travel * depth + (x - view.offsetX) / view.scale;
      const broad = (smoothNoise(worldX, 1700 + layerIndex * 71, 260) - 0.5) * amplitude * 1.6;
      const ridge = (smoothNoise(worldX, 2300 + layerIndex * 97, 88) - 0.5) * amplitude * 0.44;
      const drift = Math.sin(time * 0.18 + worldX * 0.002 + phase) * (2 + settings.mountains * 7);
      points.push({ x: x, y: screenY(base + broad + ridge + drift) });
    }
    if (points.length < 2) return;
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length - 1; index += 1) {
      const current = points[index];
      const next = points[index + 1];
      context.quadraticCurveTo(current.x, current.y, (current.x + next.x) / 2, (current.y + next.y) / 2);
    }
    const last = points[points.length - 1];
    context.lineTo(last.x, last.y);
    context.lineTo(view.width + 30, view.height + 50);
    context.lineTo(-30, view.height + 50);
    context.closePath();
    context.save();
    context.filter = "blur(" + ((3.9 - layerIndex * 0.7) * view.scale) + "px)";
    context.fillStyle = makeVerticalGradient(base - amplitude, SCENE_HEIGHT, colors[0], colors[1]);
    context.globalAlpha = 0.86 - layerIndex * 0.08;
    context.fill();
    context.restore();
  }

  function smoothClosedPath(points) {
    if (points.length < 3) return;
    const firstMid = { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 };
    context.beginPath();
    context.moveTo(firstMid.x, firstMid.y);
    for (let index = 1; index <= points.length; index += 1) {
      const current = points[index % points.length];
      const next = points[(index + 1) % points.length];
      context.quadraticCurveTo(current.x, current.y, (current.x + next.x) / 2, (current.y + next.y) / 2);
    }
    context.closePath();
  }

  function drawCloud(spec, travel, time, activity, foregroundCloud) {
    const centerX = screenX(spec.x, spec.depth, travel);
    const broadPulse = Math.sin(time * 0.24 + spec.phase) * activity * 0.2;
    const secondaryPulse = Math.cos(time * 0.17 + spec.phase * 1.7) * activity * 0.14;
    const width = spec.width * (0.92 + broadPulse + secondaryPulse * 0.45);
    const height = spec.height * (0.88 + secondaryPulse + Math.sin(time * 0.29 + spec.phase * 0.4) * activity * 0.18);
    const centerY = screenY(spec.y + Math.sin(time * 0.15 + spec.phase) * (1.2 + activity * 4));
    const pointCount = 46;
    const points = [];

    for (let index = 0; index < pointCount; index += 1) {
      const angle = (Math.PI * 2 * index) / pointCount;
      const texture = randomAt(spec.seed + index * 43) - 0.5;
      const broadLobes = Math.sin(angle * 2.35 + spec.phase) * (0.11 + activity * 0.12);
      const irregularLobes = Math.cos(angle * 4.2 - spec.phase * 0.8) * (0.07 + activity * 0.1);
      const localSwell = Math.sin(time * 0.31 + spec.phase + angle * 3.4) * activity * 0.19;
      const localShrink = Math.cos(time * 0.22 + spec.phase * 1.3 + angle * 5.7) * activity * 0.11;
      const radius = 0.96 + broadLobes + irregularLobes + localSwell + localShrink + texture * (0.07 + activity * 0.18);
      const lowerDepth = Math.sin(angle) > 0 ? 0.63 : 0.52;
      points.push({
        x: centerX + Math.cos(angle) * width * radius * view.scale,
        y: centerY + Math.sin(angle) * height * lowerDepth * radius * view.scale
      });
    }

    smoothClosedPath(points);
    const cloudFill = context.createLinearGradient(centerX, centerY - height * view.scale, centerX, centerY + height * view.scale);
    cloudFill.addColorStop(0, foregroundCloud ? "rgba(244, 250, 240, 0.17)" : "rgba(250, 253, 250, 0.64)");
    cloudFill.addColorStop(0.64, foregroundCloud ? "rgba(234, 244, 230, 0.12)" : "rgba(244, 249, 246, 0.52)");
    cloudFill.addColorStop(1, foregroundCloud ? "rgba(221, 237, 222, 0.07)" : "rgba(229, 240, 237, 0.31)");
    context.save();
    context.filter = "blur(" + ((foregroundCloud ? 4.8 : 2.25) + activity * 0.9) + "px)";
    context.fillStyle = cloudFill;
    context.fill();
    context.restore();
  }

  function drawCloudLayer(depth, lane, time, travel, foregroundCloud) {
    const activity = unit(settings.clouds, 0, 1.8);
    const spacing = lane.spacing;
    const leftWorld = travel * depth + (-view.offsetX) / view.scale - spacing;
    const rightWorld = travel * depth + (view.width - view.offsetX) / view.scale + spacing;
    const first = Math.floor(leftWorld / spacing);
    const last = Math.ceil(rightWorld / spacing);
    for (let index = first; index <= last; index += 1) {
      const seed = lane.seed + index * 104729;
      if (foregroundCloud && randomAt(seed) < 0.3) continue;
      const x = index * spacing + (randomAt(seed + 5) - 0.5) * spacing * 0.74;
      const width = lane.minWidth + randomAt(seed + 9) * (lane.maxWidth - lane.minWidth);
      const height = lane.minHeight + randomAt(seed + 13) * (lane.maxHeight - lane.minHeight);
      const y = lane.minY + randomAt(seed + 17) * (lane.maxY - lane.minY);
      drawCloud({ x: x, y: y, width: width, height: height, depth: depth, phase: randomAt(seed + 23) * Math.PI * 2, seed: seed }, travel, time, activity, foregroundCloud);
    }
  }

  function drawForestLayer(layer, layerIndex, time, travel, canopy, detail) {
    const density = clamp(canopy, 0, 1);
    const spacing = Math.max(38, layer.spacing * (1.42 - density * 0.56));
    const depth = layer.depth;
    const leftWorld = travel * depth + (-view.offsetX) / view.scale - spacing * 2;
    const rightWorld = travel * depth + (view.width - view.offsetX) / view.scale + spacing * 2;
    const first = Math.floor(leftWorld / spacing) - 2;
    const last = Math.ceil(rightWorld / spacing) + 2;
    const bottom = screenY(SCENE_HEIGHT + 165);
    const cover = layer.foreground ? 0.55 + density * 0.55 : 0.45 + density * 0.48;
    const softness = (layer.blur + (1 - detail) * (layer.foreground ? 2.9 : 2.2)) * view.scale;
    const contour = [];

    const contourStep = Math.max(8, layer.contourStep * view.scale);
    for (let x = -contourStep * 3; x <= view.width + contourStep * 3; x += contourStep) {
      const worldX = travel * depth + (x - view.offsetX) / view.scale;
      const broad = smoothNoise(worldX, layer.seed + 21, layer.foreground ? 245 : 205) - 0.5;
      const middle = smoothNoise(worldX, layer.seed + 37, layer.foreground ? 92 : 76) - 0.5;
      const fine = smoothNoise(worldX, layer.seed + 59, layer.foreground ? 34 : 28) - 0.5;
      const gapField = smoothNoise(worldX, layer.seed + 83, 330);
      const wind = Math.sin(time * (0.14 + depth * 0.055) + worldX * 0.0019 + layer.phase) * (0.14 + detail * 0.34);
      const rough = broad * 0.92 + middle * 0.48 + fine * (0.1 + detail * 0.2) + wind;
      const openGap = (1 - density) * Math.max(0, gapField - 0.42) * 0.25;
      const topRatio = clamp(0.55 + cover * 0.28 + rough * (0.56 + detail * 0.22) - openGap, 0.25, 1.02);
      const y = layer.baseline + (gapField - 0.5) * layer.baseJitter + layer.relief * rough * 0.38 - layer.height * topRatio;
      contour.push({ x: x, y: screenY(y) });
    }

    context.save();
    context.filter = "blur(" + softness + "px)";
    context.globalAlpha = layer.opacity;
    context.beginPath();
    context.moveTo(contour[0].x, contour[0].y);
    for (let index = 1; index < contour.length - 1; index += 1) {
      const current = contour[index];
      const next = contour[index + 1];
      context.quadraticCurveTo(current.x, current.y, (current.x + next.x) / 2, (current.y + next.y) / 2);
    }
    const lastContour = contour[contour.length - 1];
    context.lineTo(lastContour.x, lastContour.y);
    context.lineTo(view.width + 40, bottom);
    context.lineTo(-40, bottom);
    context.closePath();
    const baseGradient = makeVerticalGradient(layer.baseline - layer.height, SCENE_HEIGHT + 130, layer.palette[0], layer.palette[1]);
    context.fillStyle = baseGradient;
    context.fill();
    context.restore();

    const patchAlpha = ((layer.foreground ? 0.29 : 0.16) + density * (layer.foreground ? 0.2 : 0.17)) * layer.opacity;
    context.save();
    context.filter = "blur(" + ((layer.foreground ? 2.8 : 0.9) + (1 - detail) * 1.4) * view.scale + "px)";
    for (let index = first; index <= last; index += 1) {
      const seed = layer.seed + index * 8191;
      const skipChance = layer.foreground ? 0.04 + (1 - density) * 0.28 : 0.02 + (1 - density) * 0.13;
      if (randomAt(seed + 41) < skipChance) continue;
      const worldX = index * spacing + (randomAt(seed + 1) - 0.5) * spacing * 0.88;
      const width = layer.blobWidth * (0.75 + density * 0.7) * (0.42 + randomAt(seed + 3) * 1.08);
      const height = layer.blobHeight * (0.64 + density * 0.36) * (0.48 + randomAt(seed + 5) * 0.58);
      const base = layer.baseline + (randomAt(seed + 6) - 0.5) * layer.baseJitter * 1.6;
      const centerY = base - height * (0.48 + randomAt(seed + 7) * 0.2);
      const points = [];
      const pointCount = Math.round(15 + detail * 9);
      const localPhase = randomAt(seed + 13) * Math.PI * 2;
      for (let point = 0; point < pointCount; point += 1) {
        const angle = (Math.PI * 2 * point) / pointCount;
        const lobe = Math.sin(angle * (1.35 + randomAt(seed + 17) * 2.8) + localPhase) * (0.12 + density * 0.12);
        const irregular = Math.cos(angle * (4.3 + randomAt(seed + 29) * 3.2) + localPhase) * (0.06 + detail * 0.09);
        const notch = Math.sin(angle * 8.4 + localPhase * 1.7) * (0.025 + detail * 0.055);
        const radius = 0.94 + lobe + irregular + notch + (randomAt(seed + 23 + point * 19) - 0.5) * (0.12 + detail * 0.16);
        points.push({
          x: screenX(worldX, depth, travel) + Math.cos(angle) * width * 0.5 * radius * view.scale,
          y: screenY(centerY + Math.sin(angle) * height * 0.49 * radius)
        });
      }
      smoothClosedPath(points);
      context.globalAlpha = patchAlpha;
      context.fillStyle = layer.palette[(index + layerIndex + 3) % layer.palette.length];
      context.fill();
    }
    context.restore();

    if (detail > 0.06) {
      context.save();
      context.filter = "blur(" + ((1.8 + (1 - detail) * 1.5) * view.scale) + "px)";
      for (let index = first; index <= last; index += 1) {
        const seed = layer.seed + index * 8191;
        if (randomAt(seed + 101) > 0.18 + detail * 0.42) continue;
        const worldX = index * spacing + (randomAt(seed + 1) - 0.5) * spacing;
        const x = screenX(worldX, depth, travel);
        const y = screenY(layer.baseline - layer.height * (0.45 + randomAt(seed + 3) * 0.34));
        const radiusX = (12 + randomAt(seed + 5) * 25 + detail * 16) * view.scale;
        const radiusY = (3 + randomAt(seed + 7) * 8) * view.scale;
        context.globalAlpha = (layer.foreground ? 0.1 : 0.06) + detail * (layer.foreground ? 0.12 : 0.085);
        context.fillStyle = layer.palette[2];
        context.beginPath();
        context.ellipse(x, y, radiusX, radiusY, -0.15, 0, Math.PI * 2);
        context.fill();
      }
      context.restore();
    }
  }

  function bridgeVisibility(worldX, time) {
    const staticField = smoothNoise(worldX, 9901, 205);
    const breathing = 0.5 + 0.5 * Math.sin(worldX * 0.012 + time * 0.12);
    return clamp(staticField * 0.62 + breathing * 0.38, 0, 1);
  }

  function drawBridge(time, travel) {
    const depth = 0.82;
    const deckY = 340;
    const towerHeight = 29;
    const span = 276;
    const segment = 86;
    const start = travel * depth + (-view.offsetX) / view.scale - span;
    const end = travel * depth + (view.width - view.offsetX) / view.scale + span;
    const firstSegment = Math.floor(start / segment) - 1;
    const lastSegment = Math.ceil(end / segment) + 1;
    const deckScreenY = screenY(deckY);

    context.save();
    context.strokeStyle = "#203a32";
    context.lineCap = "round";

    for (let index = firstSegment; index <= lastSegment; index += 1) {
      const worldX = index * segment;
      const nextWorldX = worldX + segment * 0.72;
      const visibility = bridgeVisibility(worldX, time);
      if (visibility < 0.34) continue;
      const alpha = 0.12 + visibility * 0.42;
      context.globalAlpha = alpha;
      context.lineWidth = Math.max(0.72, 1.08 * view.scale);
      context.beginPath();
      context.moveTo(screenX(worldX, depth, travel), deckScreenY);
      context.lineTo(screenX(nextWorldX, depth, travel), deckScreenY);
      context.stroke();
      if (visibility > 0.3) {
        context.globalAlpha = alpha * 0.48;
        context.lineWidth = Math.max(0.45, 0.58 * view.scale);
        context.beginPath();
        context.moveTo(screenX(worldX, depth, travel), deckScreenY + 2.5 * view.scale);
        context.lineTo(screenX(nextWorldX, depth, travel), deckScreenY + 2.5 * view.scale);
        context.stroke();
      }
    }

    const firstTower = Math.floor(start / span) - 1;
    const lastTower = Math.ceil(end / span) + 1;
    for (let index = firstTower; index <= lastTower; index += 1) {
      const worldX = index * span;
      const leftX = screenX(worldX, depth, travel);
      const rightX = screenX(worldX + span, depth, travel);
      const localVisibility = bridgeVisibility(worldX + span * 0.5, time);
      if (localVisibility < 0.36) continue;
      const towerY = screenY(deckY - towerHeight - (localVisibility > 0.68 ? 4 : 0));
      const midX = (leftX + rightX) / 2;
      const cableMidY = screenY(deckY - 5 - Math.sin(time * 0.14 + index * 0.4) * 2.4);
      context.globalAlpha = 0.18 + localVisibility * 0.31;
      context.lineWidth = Math.max(0.46, 0.72 * view.scale);
      context.beginPath();
      context.moveTo(leftX, towerY);
      context.quadraticCurveTo(midX, cableMidY, rightX, towerY);
      context.stroke();
      if (localVisibility > 0.38) {
        context.globalAlpha *= 0.82;
        context.lineWidth = Math.max(0.4, 0.53 * view.scale);
        context.beginPath();
        for (let hanger = 1; hanger < 9; hanger += 1) {
          const ratio = hanger / 9;
          const x = leftX + (rightX - leftX) * ratio;
          const y = towerY * (1 - ratio) * (1 - ratio) + cableMidY * 2 * ratio * (1 - ratio) + towerY * ratio * ratio;
          context.moveTo(x, y);
          context.lineTo(x, deckScreenY - 0.4 * view.scale);
        }
        context.stroke();
      }
      context.globalAlpha = 0.2 + localVisibility * 0.3;
      context.lineWidth = Math.max(0.56, 0.82 * view.scale);
      context.beginPath();
      context.moveTo(leftX, deckScreenY);
      context.lineTo(leftX, towerY);
      context.moveTo(rightX, deckScreenY);
      context.lineTo(rightX, towerY);
      context.stroke();
      context.globalAlpha = 0.16 + localVisibility * 0.21;
      context.lineWidth = Math.max(0.46, 0.62 * view.scale);
      context.beginPath();
      context.moveTo(leftX - 4 * view.scale, towerY + 4 * view.scale);
      context.lineTo(leftX + 4 * view.scale, towerY + 4 * view.scale);
      context.moveTo(rightX - 4 * view.scale, towerY + 4 * view.scale);
      context.lineTo(rightX + 4 * view.scale, towerY + 4 * view.scale);
      context.stroke();
    }
    context.restore();
  }

  function drawTrain() {
    const targetScreenX = view.width * 0.2;
    const targetBaseX = view.width / 2 + (targetScreenX - view.width / 2) / settings.zoom;
    // A long, small-scale consist: the camera follows its front while the
    // rear carriages stretch back through the landscape.
    const trainScale = 0.235 * clamp(view.width / 850, 0.48, 1.08);
    const trainWidth = 356 * trainScale * view.scale;
    const x = targetBaseX - trainWidth / 2;
    const y = screenY(340 + Math.sin(elapsed * 1.75) * 0.5);

    context.save();
    context.translate(x, y + 1.1 * view.scale);
    context.scale(trainScale * view.scale, trainScale * view.scale);

    // Soft, rising smoke puffs identify the early steam locomotive without
    // adding a separate image asset. The motion is continuous and fixed by
    // elapsed time, so the puffs never jump or randomly flicker.
    context.save();
    context.filter = "blur(2.2px)";
    context.fillStyle = "rgba(213, 223, 211, 0.42)";
    for (let puff = 0; puff < 5; puff += 1) {
      const phase = elapsed * (0.62 + puff * 0.035) + puff * 1.37;
      const rise = (phase * 17) % 62;
      const drift = Math.sin(phase * 0.9 + puff) * (4 + puff * 1.7);
      const puffX = 43 + drift + puff * 2.5;
      const puffY = -35 - rise;
      const puffRadius = 8 + puff * 1.8 + Math.sin(phase * 1.2) * 1.5;
      context.globalAlpha = 0.38 - puff * 0.035;
      context.beginPath();
      context.arc(puffX, puffY, puffRadius, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();

    context.fillStyle = "rgba(18, 37, 31, 0.17)";
    context.beginPath();
    context.ellipse(178, 1.5, 174, 3.4, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#1b352d";
    context.strokeStyle = "#142b25";
    context.lineWidth = 1.1;
    context.beginPath();
    context.moveTo(6, -18);
    context.lineTo(51, -18);
    context.lineTo(61, -10);
    context.lineTo(61, -2);
    context.lineTo(6, -2);
    context.closePath();
    context.fill();
    context.stroke();
    context.fillStyle = "#254437";
    context.beginPath();
    context.moveTo(25, -28);
    context.lineTo(48, -28);
    context.lineTo(59, -18);
    context.lineTo(25, -18);
    context.closePath();
    context.fill();
    context.fillStyle = "#cbdc9f";
    context.fillRect(31, -25, 7, 6);
    context.fillRect(43, -25, 7, 6);
    context.fillStyle = "#19332b";
    context.fillRect(13, -26, 7, 8);
    context.fillRect(12, -30, 9, 4);
    context.fillStyle = "#e0e9b8";
    context.fillRect(54, -13, 5, 3);
    // Five compact carriages make the train read as a long consist while it
    // remains deliberately smaller than the surrounding forest.
    [
      { x: 66, color: "#315441" },
      { x: 119, color: "#294a3a" },
      { x: 172, color: "#315441" },
      { x: 225, color: "#294a3a" },
      { x: 278, color: "#315441" }
    ].forEach((car) => {
      context.fillStyle = car.color;
      context.fillRect(car.x, -17, 48, 15);
      context.fillStyle = "#1b352c";
      context.fillRect(car.x - 2, -21, 52, 4);
      context.fillStyle = "#cbdba0";
      context.fillRect(car.x + 7, -14, 7, 5);
      context.fillRect(car.x + 20, -14, 7, 5);
      context.fillRect(car.x + 33, -14, 7, 5);
    });
    context.fillStyle = "#172f28";
    [20, 48, 79, 103, 132, 156, 185, 209, 238, 262, 291, 315, 340].forEach((wheelX) => {
      context.beginPath();
      context.arc(wheelX, -1, 4.2, 0, Math.PI * 2);
      context.fill();
    });
    context.restore();
  }

  function drawFrame(time) {
    const travel = time * 92;
    const canopy = unit(settings.canopy, 0.58, 1.55);
    const detail = unit(settings.detail, 0, 1.4);
    const mountainStrength = settings.mountains;
    const verticalOffset = settings.height + view.portraitShift;

    context.setTransform(view.pixelRatio, 0, 0, view.pixelRatio, 0, 0);
    context.clearRect(0, 0, view.width, view.height);
    drawSky();

    context.save();
    context.translate(view.width / 2, view.height / 2 + verticalOffset);
    context.scale(settings.zoom, settings.zoom);
    context.translate(-view.width / 2, -view.height / 2);

    drawCloudLayer(0.045, { spacing: 600, minWidth: 125, maxWidth: 225, minHeight: 28, maxHeight: 53, minY: 18, maxY: 95, seed: 61 }, time, travel, false);
    drawMountain(0.075, 219, 0.45, 20 + mountainStrength * 35, ["#a9bdb5", "#819b8e"], time, travel, 0);
    drawMountain(0.14, 266, 2.35, 15 + mountainStrength * 31, ["#93aa9d", "#718b7d"], time, travel, 1);
    drawForestLayer(forestLayers[0], 0, time, travel, canopy, detail);
    drawCloudLayer(0.18, { spacing: 750, minWidth: 135, maxWidth: 245, minHeight: 30, maxHeight: 64, minY: 82, maxY: 172, seed: 151 }, time, travel, false);
    drawForestLayer(forestLayers[1], 1, time, travel, canopy, detail);
    drawForestLayer(forestLayers[2], 2, time, travel, canopy, detail);
    drawForestLayer(forestLayers[3], 3, time, travel, canopy, detail);
    drawForestLayer(forestLayers[4], 4, time, travel, canopy, detail);
    drawBridge(time, travel);
    drawTrain();
    drawForestLayer(foregroundLayers[0], 5, time, travel, canopy, detail);
    drawForestLayer(foregroundLayers[1], 6, time, travel, canopy, detail);
    drawCloudLayer(1.34, { spacing: 920, minWidth: 250, maxWidth: 420, minHeight: 50, maxHeight: 96, minY: 335, maxY: 462, seed: 257 }, time, travel, true);

    context.restore();
  }

  function renderFrame(timestamp) {
    frameHandle = 0;
    if (!visible || reduced) return;
    if (!previousFrame) previousFrame = timestamp;
    const delta = clamp((timestamp - previousFrame) / 1000, 0, 0.05);
    previousFrame = timestamp;
    elapsed += delta * settings.speed;
    drawFrame(elapsed);
    frameHandle = window.requestAnimationFrame(renderFrame);
  }

  function startAnimation() {
    if (frameHandle || !visible || reduced) return;
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
      if (reduced) drawFrame(elapsed);
    });
  });

  resetButton.addEventListener("click", () => {
    controls.forEach((input) => { input.value = input.defaultValue; updateInput(input); });
    drawFrame(elapsed);
    controls[0].focus({ preventScroll: true });
  });

  document.addEventListener("visibilitychange", () => {
    visible = document.visibilityState === "visible";
    if (visible) startAnimation();
    else stopAnimation();
  });

  window.addEventListener("resize", () => {
    resizeCanvas();
    drawFrame(elapsed);
  });

  function onMotionPreferenceChange(event) {
    reduced = event.matches;
    if (reduced) {
      stopAnimation();
      drawFrame(elapsed);
    } else startAnimation();
  }

  if (typeof motionPreference.addEventListener === "function") motionPreference.addEventListener("change", onMotionPreferenceChange);
  else if (typeof motionPreference.addListener === "function") motionPreference.addListener(onMotionPreferenceChange);

  controls.forEach(updateInput);
  resizeCanvas();
  drawFrame(0);
  if (!reduced) startAnimation();
})();
