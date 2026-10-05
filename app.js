(function () {
  "use strict";

  const SCENE_WIDTH = 1252;
  const SCENE_HEIGHT = 576;
  const SKYLINE = 118;
  const canvas = document.getElementById("landscape");
  const context = canvas.getContext("2d", { alpha: false, desynchronized: true });
  const controls = Array.from(document.querySelectorAll("[data-param]"));
  const resetButton = document.getElementById("reset-controls");
  const backgroundMusic = document.getElementById("background-music");
  const audioStatus = document.getElementById("audio-status");
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
  let audioContext = null;
  let musicGain = null;
  let trainRumbleBus = null;
  let audioUnlocked = false;
  let audioStarting = false;
  let rumbleTimer = 0;
  let rumbleEndTimer = 0;
  let activeRumble = null;

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const unit = (value, min, max) => clamp((value - min) / (max - min), 0, 1);

  function setAudioStatus(message, active) {
    if (!audioStatus) return;
    audioStatus.textContent = message;
    audioStatus.classList.toggle("is-active", Boolean(active));
  }

  function createAudioGraph() {
    if (musicGain && trainRumbleBus) return;
    const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextConstructor || !backgroundMusic) throw new Error("Web Audio is unavailable");
    if (!audioContext) audioContext = new AudioContextConstructor();
    const musicSource = audioContext.createMediaElementSource(backgroundMusic);
    musicGain = audioContext.createGain();
    musicGain.gain.value = 1;
    musicSource.connect(musicGain);
    musicGain.connect(audioContext.destination);
    trainRumbleBus = audioContext.createGain();
    trainRumbleBus.gain.value = 0.78;
    trainRumbleBus.connect(audioContext.destination);
  }

  function activateTrainSoundAfterAutoplay() {
    if (audioUnlocked || audioContext || !backgroundMusic) return;
    const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextConstructor) return;
    try {
      // If the browser permits media autoplay, also try to resume Web Audio.
      // Do not connect the music element until resume succeeds, so a browser
      // that still blocks Web Audio can keep the already-playing music intact.
      audioContext = new AudioContextConstructor();
      const context = audioContext;
      context.resume().then(() => {
        if (audioContext !== context || context.state !== "running") return;
        createAudioGraph();
        audioUnlocked = true;
        setAudioStatus("环境声已开启 · 火车声间歇出现", true);
        scheduleNextRumble(true);
      }).catch(() => {
        if (!audioUnlocked) setAudioStatus("背景音乐已播放 · 点击开启火车声", true);
      });
    } catch (error) {
      // Keep media autoplay independent from Web Audio support.
    }
  }

  function unlockAmbientSound() {
    if (audioUnlocked || audioStarting || !backgroundMusic) return;
    audioStarting = true;
    try {
      createAudioGraph();
      // Both calls run directly inside the user gesture to satisfy autoplay
      // policies. Any page interaction can unlock the sound; no player UI is used.
      const resumePromise = audioContext.resume();
      const musicPromise = backgroundMusic.play();
      Promise.all([resumePromise, musicPromise]).then(() => {
        audioUnlocked = true;
        audioStarting = false;
        setAudioStatus("环境声已开启 · 火车声间歇出现", true);
        scheduleNextRumble(true);
      }).catch(() => {
        audioStarting = false;
        setAudioStatus("点击/触摸开启声音", false);
      });
    } catch (error) {
      audioStarting = false;
      setAudioStatus("当前浏览器不支持声音", false);
    }
  }

  function scheduleNextRumble(firstEvent) {
    if (!audioUnlocked || !visible) return;
    if (rumbleTimer) window.clearTimeout(rumbleTimer);
    const delay = firstEvent ? 6500 + Math.random() * 7500 : 22000 + Math.random() * 26000;
    rumbleTimer = window.setTimeout(() => {
      rumbleTimer = 0;
      playTrainRumble();
      scheduleNextRumble(false);
    }, delay);
  }

  function playTrainRumble() {
    if (!audioUnlocked || !audioContext || !trainRumbleBus || !visible) return;
    const now = audioContext.currentTime;
    const duration = 4.2 + Math.random() * 3.1;
    const end = now + duration;
    const eventGain = audioContext.createGain();
    eventGain.gain.setValueAtTime(0.0001, now);
    eventGain.gain.exponentialRampToValueAtTime(0.48 + Math.random() * 0.12, now + 0.72);
    eventGain.gain.setTargetAtTime(0.36 + Math.random() * 0.12, now + 0.74, 0.5);
    eventGain.gain.setTargetAtTime(0.0001, end - 1.1, 0.55);
    eventGain.connect(trainRumbleBus);

    const lowPass = audioContext.createBiquadFilter();
    lowPass.type = "lowpass";
    lowPass.frequency.value = 150 + Math.random() * 55;
    lowPass.Q.value = 0.72;
    lowPass.connect(eventGain);

    const oscillators = [];
    const mainTone = audioContext.createOscillator();
    mainTone.type = "sawtooth";
    mainTone.frequency.setValueAtTime(31 + Math.random() * 8, now);
    const mainToneGain = audioContext.createGain();
    mainToneGain.gain.value = 0.2;
    mainTone.connect(mainToneGain).connect(lowPass);
    mainTone.start(now);
    mainTone.stop(end);
    oscillators.push(mainTone);

    const harmonic = audioContext.createOscillator();
    harmonic.type = "triangle";
    harmonic.frequency.setValueAtTime(63 + Math.random() * 14, now);
    const harmonicGain = audioContext.createGain();
    harmonicGain.gain.value = 0.14;
    harmonic.connect(harmonicGain).connect(lowPass);
    harmonic.start(now);
    harmonic.stop(end);
    oscillators.push(harmonic);

    const subTone = audioContext.createOscillator();
    subTone.type = "sine";
    subTone.frequency.setValueAtTime(24 + Math.random() * 6, now);
    const subGain = audioContext.createGain();
    subGain.gain.value = 0.23;
    subTone.connect(subGain).connect(eventGain);
    subTone.start(now);
    subTone.stop(end);
    oscillators.push(subTone);

    const sampleCount = Math.ceil(audioContext.sampleRate * 2);
    const noiseBuffer = audioContext.createBuffer(1, sampleCount, audioContext.sampleRate);
    const noiseData = noiseBuffer.getChannelData(0);
    for (let index = 0; index < sampleCount; index += 1) noiseData[index] = Math.random() * 2 - 1;
    const noise = audioContext.createBufferSource();
    noise.buffer = noiseBuffer;
    noise.loop = true;
    const noiseFilter = audioContext.createBiquadFilter();
    noiseFilter.type = "lowpass";
    noiseFilter.frequency.value = 190 + Math.random() * 70;
    const noiseGain = audioContext.createGain();
    noiseGain.gain.value = 0.12;
    noise.connect(noiseFilter).connect(noiseGain).connect(eventGain);
    noise.start(now);
    noise.stop(end);
    oscillators.push(noise);

    // Briefly lower the music under the train event so its low mechanical
    // rumble reads clearly without muting the ambience entirely.
    musicGain.gain.cancelScheduledValues(now);
    musicGain.gain.setValueAtTime(musicGain.gain.value, now);
    musicGain.gain.linearRampToValueAtTime(0.15, now + 0.55);
    musicGain.gain.setTargetAtTime(1, end - 0.45, 0.42);

    activeRumble = { eventGain, oscillators };
    oscillators.forEach((oscillator) => oscillator.addEventListener("ended", () => oscillator.disconnect(), { once: true }));
    rumbleEndTimer = window.setTimeout(() => {
      activeRumble = null;
      rumbleEndTimer = 0;
    }, duration * 1000 + 250);
  }

  function stopRumbleForHiddenPage() {
    if (rumbleTimer) window.clearTimeout(rumbleTimer);
    if (rumbleEndTimer) window.clearTimeout(rumbleEndTimer);
    rumbleTimer = 0;
    rumbleEndTimer = 0;
    if (!audioContext || !musicGain || !activeRumble) return;
    const now = audioContext.currentTime;
    activeRumble.eventGain.gain.cancelScheduledValues(now);
    activeRumble.eventGain.gain.setTargetAtTime(0.0001, now, 0.08);
    activeRumble.oscillators.forEach((oscillator) => {
      try { oscillator.stop(now + 0.35); } catch (error) { /* already ended */ }
    });
    musicGain.gain.cancelScheduledValues(now);
    musicGain.gain.setTargetAtTime(1, now, 0.18);
    activeRumble = null;
  }

  if (backgroundMusic) {
    backgroundMusic.volume = 0.3;
    backgroundMusic.addEventListener("error", () => setAudioStatus("背景音乐文件无法读取", false));
    const autoplayAttempt = backgroundMusic.play();
    if (autoplayAttempt && typeof autoplayAttempt.then === "function") {
      autoplayAttempt.then(() => {
        setAudioStatus("背景音乐正在播放", true);
        activateTrainSoundAfterAutoplay();
      }).catch(() => setAudioStatus("点击/触摸开启声音", false));
    }
    ["pointerdown", "touchstart", "keydown"].forEach((eventName) => {
      window.addEventListener(eventName, unlockAmbientSound, { passive: true, capture: true });
    });
  }

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
    // Keep the locomotive's right-facing front buffer near the 20% follow point;
    // the tender and long carriage consist trail to the left and leave frame.
    const trainScale = 0.43;
    const carriageCount = 40;
    const carriagePitch = 66;
    const trainWidth = 124 + carriageCount * carriagePitch;
    const x = targetBaseX;
    const y = screenY(340 + Math.sin(elapsed * 1.75) * 0.5);

    context.save();
    context.translate(x, y + 1.1 * view.scale);
    context.scale(-trainScale * view.scale, trainScale * view.scale);

    context.fillStyle = "rgba(18, 37, 31, 0.17)";
    context.beginPath();
    context.ellipse(trainWidth / 2, 1.5, trainWidth / 2, 3.4, 0, 0, Math.PI * 2);
    context.fill();

    // Local geometry is mirrored around the nose anchor, so the cowcatcher
    // leads to the right while the boiler, cab, tender and carriages trail left.
    context.fillStyle = "#1b352d";
    context.strokeStyle = "#142b25";
    context.lineWidth = 1.6;
    context.beginPath();
    context.moveTo(0, -6);
    context.lineTo(11, -23);
    context.lineTo(69, -23);
    context.lineTo(83, -18);
    context.lineTo(83, -5);
    context.lineTo(0, -5);
    context.closePath();
    context.fill();
    context.stroke();

    // Boiler, smokebox door, lamp and short chimney establish a classic steam
    // locomotive silhouette at the leading end of the train.
    context.fillStyle = "#254437";
    context.beginPath();
    context.ellipse(38, -24, 28, 9, 0, Math.PI, Math.PI * 2);
    context.lineTo(66, -14);
    context.lineTo(10, -14);
    context.closePath();
    context.fill();
    context.fillStyle = "#19332b";
    context.beginPath();
    context.arc(11, -17, 7, 0, Math.PI * 2);
    context.fill();
    context.fillRect(24, -39, 8, 15);
    context.fillRect(21, -41, 14, 4);
    context.fillRect(47, -34, 7, 8);
    context.fillStyle = "#d7e6ad";
    context.beginPath();
    context.arc(3.5, -15, 2.7, 0, Math.PI * 2);
    context.fill();

    // Cab and windows sit behind the boiler, with the tender immediately
    // behind the cab as on an early 20th-century steam locomotive.
    context.fillStyle = "#1b352d";
    context.fillRect(64, -38, 29, 22);
    context.fillRect(61, -41, 35, 4);
    context.fillStyle = "#cbdc9f";
    context.fillRect(70, -34, 7, 8);
    context.fillRect(82, -34, 7, 8);
    context.fillStyle = "#274635";
    context.fillRect(96, -24, 20, 18);
    context.fillRect(94, -27, 24, 4);
    context.fillStyle = "#e0e9b8";
    context.fillRect(105, -21, 3, 4);

    for (let index = 0; index < carriageCount; index += 1) {
      const carX = 123 + index * carriagePitch;
      const carColor = index % 3 === 1 ? "#294a3a" : index % 3 === 2 ? "#355640" : "#315441";
      context.fillStyle = carColor;
      context.fillRect(carX, -18, 58, 15);
      context.fillStyle = "#1b352c";
      context.fillRect(carX - 2, -22, 62, 4);
      context.fillStyle = "#cbdba0";
      context.fillRect(carX + 7, -15, 6, 5);
      context.fillRect(carX + 20, -15, 6, 5);
      context.fillRect(carX + 33, -15, 6, 5);
      context.fillRect(carX + 46, -15, 6, 5);
      context.fillStyle = "#172f28";
      context.beginPath();
      context.arc(carX + 9, -1, 3.5, 0, Math.PI * 2);
      context.arc(carX + 50, -1, 3.5, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
  }

  function drawSteam() {
    const targetScreenX = view.width * 0.2;
    const targetBaseX = view.width / 2 + (targetScreenX - view.width / 2) / settings.zoom;
    const trainScale = 0.43;
    const y = screenY(340 + Math.sin(elapsed * 1.75) * 0.5);
    context.save();
    context.translate(targetBaseX, y + 1.1 * view.scale);
    context.scale(-trainScale * view.scale, trainScale * view.scale);
    context.filter = "blur(7px)";
    for (let puff = 0; puff < 9; puff += 1) {
      const cycle = ((elapsed * 23 - puff * 19) % 220 + 220) % 220;
      const age = cycle / 220;
      const radius = 15 + age * 27 + Math.sin(elapsed * 1.2 + puff) * 2.2;
      // Positive local x is mirrored behind the right-facing locomotive,
      // making the rising smoke drift toward screen-left.
      const x = 29 + age * 35 + Math.sin(elapsed * 0.85 + puff * 1.1) * (3 + age * 7);
      const smokeY = -43 - age * 230;
      context.globalAlpha = (0.64 + (puff % 3) * 0.035) * (1 - age) * 0.88;
      context.fillStyle = puff % 2 ? "#edf1e9" : "#d7e1da";
      context.beginPath();
      context.ellipse(x, smokeY, radius * 1.2, radius * 0.8, -0.18, 0, Math.PI * 2);
      context.fill();
    }
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
    drawSteam();
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
    if (visible) {
      startAnimation();
      if (audioUnlocked) scheduleNextRumble(false);
    } else {
      stopAnimation();
      stopRumbleForHiddenPage();
    }
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
