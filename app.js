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
    {
      baseline: 250, spacing: 74, height: 178, depth: 0.19, motion: 6, phase: 0.3, seed: 113, blur: 1.25,
      tones: [
        { top: "#b8cabb", bottom: "#8da596", light: "#d8e2b9" },
        { top: "#a9c1b0", bottom: "#809a8d", light: "#d3dfb4" },
        { top: "#bfd0bc", bottom: "#94aa99", light: "#e0e6c2" }
      ]
    },
    {
      baseline: 318, spacing: 64, height: 140, depth: 0.37, motion: 10, phase: 1.2, seed: 227, blur: 1.05,
      tones: [
        { top: "#91b79a", bottom: "#66866f", light: "#c9d99e" },
        { top: "#9cc29e", bottom: "#6d9276", light: "#d3dfa5" },
        { top: "#85ad92", bottom: "#5d7f6d", light: "#c2d49e" }
      ]
    },
    {
      baseline: 370, spacing: 55, height: 144, depth: 0.58, motion: 15, phase: 2.25, seed: 349, blur: 0.9,
      tones: [
        { top: "#73a875", bottom: "#3f7551", light: "#c7dc91" },
        { top: "#7bb27a", bottom: "#477d53", light: "#d3e39b" },
        { top: "#669c6f", bottom: "#356b49", light: "#bdd684" }
      ]
    },
    {
      baseline: 415, spacing: 48, height: 150, depth: 0.82, motion: 21, phase: 3.4, seed: 461, blur: 0.75,
      tones: [
        { top: "#4f8e59", bottom: "#285b3d", light: "#b6d27d" },
        { top: "#58965c", bottom: "#2b6441", light: "#c8d988" },
        { top: "#477f50", bottom: "#244f38", light: "#a9ca73" }
      ]
    }
  ];

  const foreground = {
    baseline: 590,
    spacing: 225,
    height: 268,
    depth: 1.25,
    motion: 23,
    phase: 4.2,
    seed: 587,
    blur: 1.0,
    foreground: true,
    tones: [
      { top: "#4c8051", bottom: "#214a35", light: "#b0ca77" },
      { top: "#3f7549", bottom: "#1b4431", light: "#9fbd6c" },
      { top: "#628b50", bottom: "#2b5638", light: "#c2d27f" }
    ]
  };

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

  function resizeCanvas() {
    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const scale = Math.max(width / SCENE_WIDTH, height / SCENE_HEIGHT);
    view = {
      width,
      height,
      scale,
      offsetX: (width - SCENE_WIDTH * scale) / 2,
      offsetY: (height - SCENE_HEIGHT * scale) / 2,
      pixelRatio,
      portraitShift: width / height < 0.75 ? -96 : 0
    };
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    applyExposure();
  }

  function applyExposure() {
    const value = settings.exposure;
    canvas.style.filter = `brightness(${value.toFixed(3)}) contrast(${(0.94 + unit(value, 0.74, 1.3) * 0.16).toFixed(3)}) saturate(${(0.94 + unit(value, 0.74, 1.3) * 0.14).toFixed(3)})`;
  }

  function updateInput(input) {
    const name = input.dataset.param;
    const value = Number(input.value);
    const min = Number(input.min);
    const max = Number(input.max);
    const output = document.getElementById(`${name}-value`);
    settings[name] = value;
    input.style.setProperty("--range-progress", `${((value - min) / (max - min)) * 100}%`);
    if (output) {
      if (["mountains", "canopy", "detail"].includes(name)) output.value = `${Math.round(unit(value, min, max) * 100)}%`;
      else if (name === "height") output.value = `${value > 0 ? "+" : ""}${Math.round(value)} px`;
      else output.value = `${value.toFixed(2)}×`;
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
    gradient.addColorStop(0, "#78a9e1");
    gradient.addColorStop(0.58, "#88b8e3");
    gradient.addColorStop(1, "#a6cbe2");
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
      const broad = Math.sin(worldX * 0.0054 + phase) * amplitude;
      const secondary = Math.sin(worldX * 0.013 + phase * 1.6) * amplitude * 0.29;
      const ridge = Math.sin(worldX * 0.031 + phase * 2.2) * amplitude * 0.1;
      const drift = Math.sin(time * 0.24 + worldX * 0.002 + phase) * (3 + settings.mountains * 7.2);
      points.push({ x, y: screenY(base + broad + secondary + ridge + drift) });
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
    context.filter = `blur(${(1.5 - layerIndex * 0.25) * view.scale}px)`;
    context.fillStyle = makeVerticalGradient(base - amplitude, view.height / view.scale, colors[0], colors[1]);
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
    const pulse = Math.sin(time * 0.19 + spec.phase) * activity * 0.13;
    const width = spec.width * (0.93 + pulse);
    const height = spec.height * (0.93 + Math.cos(time * 0.23 + spec.phase) * activity * 0.16);
    const centerY = screenY(spec.y + Math.sin(time * 0.16 + spec.phase) * (1.5 + activity * 5));
    const pointCount = 48;
    const points = [];

    for (let index = 0; index < pointCount; index += 1) {
      const angle = (Math.PI * 2 * index) / pointCount;
      const texture = randomAt(spec.seed + index * 43) - 0.5;
      const broadLobes = Math.sin(angle * 2.35 + spec.phase) * 0.16 + Math.cos(angle * 4.9 - spec.phase * 0.8) * 0.1;
      const smallLobes = Math.sin(angle * 7.1 + spec.phase * 1.5) * 0.055;
      const breathing = Math.sin(time * 0.29 + spec.phase + angle * 3.2) * activity * 0.14;
      const localSwell = Math.cos(time * 0.21 + spec.phase * 1.7 + angle * 5.1) * activity * 0.065;
      const radius = 0.96 + broadLobes + smallLobes + texture * (0.13 + activity * 0.2) + breathing + localSwell;
      const lowerDepth = Math.sin(angle) > 0 ? 0.74 : 0.61;
      points.push({
        x: centerX + Math.cos(angle) * width * radius * view.scale,
        y: centerY + Math.sin(angle) * height * lowerDepth * radius * view.scale
      });
    }

    smoothClosedPath(points);
    const cloudFill = context.createLinearGradient(centerX, centerY - height * view.scale, centerX, centerY + height * view.scale);
    cloudFill.addColorStop(0, foregroundCloud ? "rgba(245, 249, 237, 0.24)" : "rgba(250, 252, 249, 0.68)");
    cloudFill.addColorStop(0.68, foregroundCloud ? "rgba(239, 246, 231, 0.20)" : "rgba(244, 249, 245, 0.58)");
    cloudFill.addColorStop(1, foregroundCloud ? "rgba(225, 237, 224, 0.13)" : "rgba(231, 241, 238, 0.38)");
    context.save();
    context.filter = `blur(${(1.1 + activity * 0.55) * view.scale}px)`;
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
      if (foregroundCloud && randomAt(seed) < 0.43) continue;
      const x = index * spacing + (randomAt(seed + 5) - 0.5) * spacing * 0.66;
      const width = lane.minWidth + randomAt(seed + 9) * (lane.maxWidth - lane.minWidth);
      const height = lane.minHeight + randomAt(seed + 13) * (lane.maxHeight - lane.minHeight);
      const y = lane.minY + randomAt(seed + 17) * (lane.maxY - lane.minY);
      drawCloud({ x, y, width, height, depth, phase: randomAt(seed + 23) * Math.PI * 2, seed }, travel, time, activity, foregroundCloud);
    }
  }

  function drawForestLayer(layer, layerIndex, time, travel, canopy, detail) {
    const spacing = layer.spacing * (1.18 - canopy * 0.42);
    const depth = layer.depth;
    const leftWorld = travel * depth + (-view.offsetX) / view.scale - spacing * 2;
    const rightWorld = travel * depth + (view.width - view.offsetX) / view.scale + spacing * 2;
    const first = Math.floor(leftWorld / spacing) - 1;
    const last = Math.ceil(rightWorld / spacing) + 1;
    const bottom = screenY(SCENE_HEIGHT + 155);
    const crownPoints = Math.round(10 + detail * 13);
    const blur = (layer.blur + (1 - detail) * (layer.foreground ? 2.2 : 1.9)) * view.scale;
    const trees = [];

    context.save();
    context.filter = `blur(${blur}px)`;

    const terrainPoints = [];
    const terrainStep = Math.max(22, 34 * view.scale);
    for (let x = -terrainStep * 2; x <= view.width + terrainStep * 2; x += terrainStep) {
      const worldX = travel * depth + (x - view.offsetX) / view.scale;
      const terrainWave = Math.sin(worldX * 0.006 + layer.phase + time * 0.16) * layer.motion * 0.36
        + Math.sin(worldX * 0.014 + layer.phase * 1.8 + time * 0.11) * layer.motion * 0.14;
      terrainPoints.push({ x, y: screenY(layer.baseline + terrainWave + (1 - canopy) * layer.height * 0.065) });
    }
    context.beginPath();
    context.moveTo(terrainPoints[0].x, terrainPoints[0].y);
    for (let point = 1; point < terrainPoints.length - 1; point += 1) {
      const current = terrainPoints[point];
      const next = terrainPoints[point + 1];
      context.quadraticCurveTo(current.x, current.y, (current.x + next.x) / 2, (current.y + next.y) / 2);
    }
    context.lineTo(terrainPoints[terrainPoints.length - 1].x, terrainPoints[terrainPoints.length - 1].y);
    context.lineTo(view.width + 30, bottom);
    context.lineTo(-30, bottom);
    context.closePath();
    const baseFill = context.createLinearGradient(0, screenY(layer.baseline - 12), 0, bottom);
    baseFill.addColorStop(0, layer.tones[0].bottom);
    baseFill.addColorStop(1, layer.tones[1].bottom);
    context.fillStyle = baseFill;
    context.fill();

    for (let index = first; index <= last; index += 1) {
      const seed = layer.seed + index * 8191;
      if (layer.foreground && randomAt(seed + 41) > 0.6 + canopy * 0.25) continue;
      const worldX = index * spacing + (randomAt(seed + 1) - 0.5) * spacing * 0.3;
      const perspectiveWidth = layer.foreground ? 1.06 : 1 + layerIndex * 0.16;
      const width = layer.spacing * (0.9 + canopy * 1.1) * (0.82 + randomAt(seed + 3) * 0.34) * perspectiveWidth;
      const heightFactor = layer.foreground
        ? (0.65 + randomAt(seed + 5) * 0.5) * (0.8 + canopy * 0.4)
        : (0.45 + randomAt(seed + 5) * 0.38) * (0.74 + canopy * 0.45);
      const height = layer.height * heightFactor;
      const base = layer.baseline
        + Math.sin(time * 0.31 + index * 0.43 + layer.phase) * layer.motion
        + (1 - canopy) * layer.height * 0.065;
      const apex = base - height * (0.91 + Math.sin(time * 0.22 + index * 0.7 + layer.phase) * (0.018 + canopy * 0.018));
      const screenCenter = screenX(worldX, depth, travel);
      const halfWidth = width * view.scale * 0.5;
      const tone = layer.tones[Math.floor(randomAt(seed + 7) * layer.tones.length)];

      context.beginPath();
      const crownBottom = screenY(base + height * 0.14);
      context.moveTo(screenCenter - halfWidth, crownBottom);
      for (let point = 0; point <= crownPoints; point += 1) {
        const ratio = point / crownPoints;
        const envelope = Math.max(0, 1 - Math.abs(2 * ratio - 1) ** 2.1) ** 0.43;
        const lobeOne = Math.sin(ratio * Math.PI * 2.2 + randomAt(seed + 11) * 6) * 0.055;
        const lobeTwo = Math.cos(ratio * Math.PI * 4.4 + randomAt(seed + 17) * 6) * 0.024;
        const edgeSeed = randomAt(seed + 29 + point * 67) - 0.5;
        const edgeRoughness = edgeSeed * detail * 0.075;
        const edgeBreath = Math.sin(time * 0.37 + index * 0.9 + ratio * 9 + layer.phase) * detail * 0.024;
        const crownY = base - height * envelope * (0.91 + lobeOne + lobeTwo + edgeRoughness + edgeBreath);
        context.lineTo(screenCenter - halfWidth + ratio * width * view.scale, screenY(crownY));
      }
      context.lineTo(screenCenter + halfWidth, crownBottom);
      context.lineTo(screenCenter - halfWidth, crownBottom);
      context.closePath();

      const fill = context.createLinearGradient(0, screenY(apex), 0, bottom);
      fill.addColorStop(0, tone.top);
      fill.addColorStop(1, tone.bottom);
      context.fillStyle = fill;
      context.fill();
      trees.push({ seed, x: screenCenter, width, height, base, tone });
    }
    context.restore();

    if (detail < 0.14) return;
    context.save();
    context.filter = `blur(${(0.6 + (1 - detail) * 0.8) * view.scale}px)`;
    for (const tree of trees) {
      if (randomAt(tree.seed + 31) > 0.44 + detail * 0.3) continue;
      const patches = detail > 0.72 ? 3 : 2;
      context.globalAlpha = 0.075 + detail * 0.11;
      context.fillStyle = tree.tone.light;
      for (let patch = 0; patch < patches; patch += 1) {
        const patchSeed = tree.seed + patch * 223;
        const x = tree.x + (randomAt(patchSeed + 1) - 0.5) * tree.width * view.scale * 0.58;
        const y = screenY(tree.base - tree.height * (0.45 + randomAt(patchSeed + 3) * 0.36));
        const radiusX = (5 + randomAt(patchSeed + 5) * 12 + detail * 6) * view.scale;
        const radiusY = (1.5 + randomAt(patchSeed + 7) * 4) * view.scale;
        context.beginPath();
        context.ellipse(x, y, radiusX, radiusY, -0.18, 0, Math.PI * 2);
        context.fill();
      }
    }
    context.restore();
  }

  function drawBridge(time, travel) {
    const depth = 0.84;
    const deckY = 315;
    const towerHeight = 24;
    const span = 330;
    const start = travel * depth + (-view.offsetX) / view.scale - span;
    const end = travel * depth + (view.width - view.offsetX) / view.scale + span;
    const firstTower = Math.floor(start / span);
    const lastTower = Math.ceil(end / span);
    const deckScreenY = screenY(deckY);

    context.save();
    context.strokeStyle = "#203a32";
    context.lineWidth = Math.max(0.75, 1.05 * view.scale);
    context.globalAlpha = 0.56;
    context.beginPath();
    context.moveTo(-30, deckScreenY);
    context.lineTo(view.width + 30, deckScreenY);
    context.moveTo(-30, deckScreenY + 2.6 * view.scale);
    context.lineTo(view.width + 30, deckScreenY + 2.6 * view.scale);
    context.stroke();

    const tieSpacing = 19;
    const firstTie = Math.floor(start / tieSpacing);
    const lastTie = Math.ceil(end / tieSpacing);
    context.globalAlpha = 0.3;
    context.lineWidth = Math.max(0.5, 0.6 * view.scale);
    context.beginPath();
    for (let index = firstTie; index <= lastTie; index += 1) {
      const x = screenX(index * tieSpacing, depth, travel);
      context.moveTo(x, deckScreenY - 0.5 * view.scale);
      context.lineTo(x, deckScreenY + 3.1 * view.scale);
    }
    context.stroke();

    for (let index = firstTower; index < lastTower; index += 1) {
      const seed = 3701 + index * 811;
      const leftX = screenX(index * span, depth, travel);
      const rightX = screenX((index + 1) * span, depth, travel);
      const towerY = screenY(deckY - towerHeight);
      const midX = (leftX + rightX) / 2;
      const cableMidY = screenY(deckY - 3.4 - 2 * Math.sin(time * 0.15 + index * 0.3));
      context.globalAlpha = 0.4 + randomAt(seed) * 0.16;
      context.strokeStyle = "#1e3931";
      context.lineWidth = Math.max(0.55, 0.75 * view.scale);
      context.beginPath();
      context.moveTo(leftX, towerY);
      context.quadraticCurveTo(midX, cableMidY, rightX, towerY);
      context.stroke();

      const hangerCount = 9;
      context.globalAlpha = 0.28 + randomAt(seed + 3) * 0.1;
      context.lineWidth = Math.max(0.45, 0.55 * view.scale);
      context.beginPath();
      for (let hanger = 1; hanger < hangerCount; hanger += 1) {
        const ratio = hanger / hangerCount;
        const x = leftX + (rightX - leftX) * ratio;
        const y = towerY * (1 - ratio) * (1 - ratio) + cableMidY * 2 * ratio * (1 - ratio) + towerY * ratio * ratio;
        context.moveTo(x, y);
        context.lineTo(x, deckScreenY - 0.6 * view.scale);
      }
      context.stroke();

      context.globalAlpha = 0.46;
      context.lineWidth = Math.max(0.75, 0.95 * view.scale);
      context.beginPath();
      context.moveTo(leftX, deckScreenY);
      context.lineTo(leftX, towerY);
      context.moveTo(rightX, deckScreenY);
      context.lineTo(rightX, towerY);
      context.stroke();
      context.globalAlpha = 0.3;
      context.beginPath();
      context.moveTo(leftX - 3.6 * view.scale, towerY + 4 * view.scale);
      context.lineTo(leftX + 3.6 * view.scale, towerY + 4 * view.scale);
      context.moveTo(rightX - 3.6 * view.scale, towerY + 4 * view.scale);
      context.lineTo(rightX + 3.6 * view.scale, towerY + 4 * view.scale);
      context.stroke();
    }
    context.restore();
  }

  function drawTrain(travel) {
    const targetScreenX = view.width * 0.2;
    const targetBaseX = view.width / 2 + (targetScreenX - view.width / 2) / settings.zoom;
    const trainScale = 0.31 * clamp(view.width / 850, 0.48, 1.08);
    const trainWidth = 171 * trainScale * view.scale;
    const x = targetBaseX - trainWidth / 2;
    const y = screenY(315 + Math.sin(elapsed * 1.8) * 0.45);

    context.save();
    context.translate(x, y + 1.25 * view.scale);
    context.scale(trainScale * view.scale, trainScale * view.scale);
    context.fillStyle = "rgba(18, 37, 31, 0.18)";
    context.beginPath();
    context.ellipse(87, 1.5, 86, 3.6, 0, 0, Math.PI * 2);
    context.fill();

    context.fillStyle = "#1b352d";
    context.strokeStyle = "#142b25";
    context.lineWidth = 1.2;
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

    [
      { x: 66, color: "#315441" },
      { x: 119, color: "#294a3a" }
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
    [20, 48, 79, 103, 134, 157].forEach((wheelX) => {
      context.beginPath();
      context.arc(wheelX, -1, 4.4, 0, Math.PI * 2);
      context.fill();
    });
    context.restore();
  }

  function drawFrame(time) {
    const travel = time * 82;
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
    drawMountain(0.075, 220, 0.45, 25 + mountainStrength * 32, ["#a8beb6", "#829f92"], time, travel, 0);
    drawMountain(0.14, 265, 2.35, 17 + mountainStrength * 28, ["#91aa9b", "#718b7d"], time, travel, 1);
    drawForestLayer(forestLayers[0], 0, time, travel, canopy, detail);
    drawCloudLayer(0.18, { spacing: 750, minWidth: 135, maxWidth: 245, minHeight: 30, maxHeight: 64, minY: 82, maxY: 172, seed: 151 }, time, travel, false);
    drawForestLayer(forestLayers[1], 1, time, travel, canopy, detail);
    drawForestLayer(forestLayers[2], 2, time, travel, canopy, detail);

    // The mid-distance canopy passes in front of the bridge, so its spans appear and disappear with the camera travel.
    drawBridge(time, travel);
    drawForestLayer(forestLayers[3], 3, time, travel, canopy, detail);
    drawTrain(travel);
    drawForestLayer(foreground, 4, time, travel, canopy, detail);
    drawCloudLayer(1.31, { spacing: 920, minWidth: 250, maxWidth: 420, minHeight: 50, maxHeight: 96, minY: 340, maxY: 455, seed: 257 }, time, travel, true);

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
