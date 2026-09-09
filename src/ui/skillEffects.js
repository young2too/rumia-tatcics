import { Application, Container, Graphics } from "pixi.js";

export function createSkillEffectRenderer() {
  let canvas = null;
  let context = null;
  let pixiApp = null;
  let pixiLayer = null;
  let pixiHost = null;
  let pixiInitPromise = null;
  let pixiFrame = 0;
  let pixiGeneration = 0;
  const animations = [];
  const pixiAnimations = [];
  let frame = 0;
  const pixiEffectTypes = new Set(Object.keys({
    "yuki-cast": true,
    "yuki-bloom": true,
    "hisui-tsubame-gaeshi": true,
    "fate-absorb": true,
    "nadine-wolf": true,
    "cathy-needle": true,
    "rozzi-double-shot": true,
    "aya-double-burst": true,
    "shoichi-dagger-ride": true,
    "shoichi-seven-elixir": true,
    "leni-carrot-bazooka": true,
    "hart-peacemaker": true,
    "sissela-channel": true,
    "sissela-liberation": true,
    "elena-danse-macabre": true,
    "priya-earth-echo": true,
    "theodore-energy-field": true,
    "emma-magic-hat": true,
    "haze-rocket-launcher": true,
    "isol-semtex-throw": true,
    "isol-semtex-explosion": true,
    "martina-fast-forward": true,
    "katja-sniping-aim": true,
    "katja-sniping-shot": true,
    "justyna-laser-barrage": true,
    "bernice-snare-trap": true,
    "rio-kaeyumi": true,
    "celine-plasma-arm": true,
    "celine-plasma-bomb": true,
    "tia-perfect-drawing": true,
    "xiukai-hot-taste": true,
    "xiukai-flame": true,
    "zahir-vayvayastra": true,
    "abigail-horizon-cleave": true,
    "darko-forced-capture": true,
    "darko-forced-impact": true,
    "luke-obsession": true,
    "silvia-speed-gun": true,
    "bianca-reign": true,
  }));
  const benchmarkEffectTypes = Array.from(pixiEffectTypes);

  function ensureLayout() {
    const battlefield = document.querySelector(".battlefield");
    if (!battlefield) return null;
    const rect = battlefield.getBoundingClientRect();
    return { battlefield, rect, width: rect.width, height: rect.height };
  }

  function isLowSpecEffectMode() {
    return window.innerWidth <= 760 || window.matchMedia?.("(pointer: coarse)")?.matches;
  }

  function effectResolutionCap(kind = "canvas") {
    if (isLowSpecEffectMode()) return kind === "pixi" ? 0.85 : 0.9;
    return kind === "pixi" ? 1.25 : 1.35;
  }

  function effectParticleCount(count) {
    return Math.max(8, Math.round(count * (isLowSpecEffectMode() ? 0.55 : 1)));
  }

  function ensureCanvas() {
    const layout = ensureLayout();
    if (!layout) return null;
    const { battlefield, rect } = layout;
    if (!canvas || canvas.parentElement !== battlefield) {
      canvas?.remove();
      canvas = document.createElement("canvas");
      canvas.className = "skill-effect-canvas";
      canvas.setAttribute("aria-hidden", "true");
      battlefield.append(canvas);
      context = canvas.getContext("2d");
    }
    const ratio = Math.min(window.devicePixelRatio || 1, effectResolutionCap("canvas"));
    const width = Math.max(1, Math.round(rect.width * ratio));
    const height = Math.max(1, Math.round(rect.height * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    return layout;
  }

  async function ensurePixiLayer(layout) {
    if (pixiApp && pixiHost === layout.battlefield) {
      pixiApp.renderer.resize(layout.width, layout.height, Math.min(window.devicePixelRatio || 1, effectResolutionCap("pixi")));
      return pixiApp;
    }
    if (pixiInitPromise) return pixiInitPromise;
    const generation = pixiGeneration;
    pixiInitPromise = (async () => {
      destroyPixiApp();
      pixiApp = new Application();
      await pixiApp.init({
        width: layout.width,
        height: layout.height,
        resolution: Math.min(window.devicePixelRatio || 1, effectResolutionCap("pixi")),
        backgroundAlpha: 0,
        antialias: false,
        preference: "webgl",
        autoStart: false,
      });
      if (generation !== pixiGeneration || !layout.battlefield.isConnected) {
        destroyPixiApp();
        pixiApp = null;
        return null;
      }
      pixiHost = layout.battlefield;
      pixiLayer = pixiApp.canvas;
      pixiLayer.className = "skill-effect-canvas pixi-skill-effect-canvas";
      pixiLayer.setAttribute("aria-hidden", "true");
      pixiLayer.style.width = `${layout.width}px`;
      pixiLayer.style.height = `${layout.height}px`;
      layout.battlefield.append(pixiLayer);
      return pixiApp;
    })().finally(() => {
      pixiInitPromise = null;
    });
    return pixiInitPromise;
  }

  function unitPoint(id, fieldRect) {
    const node = document.querySelector(`[data-unit-id="${id}"]`);
    if (!node) return null;
    const rect = node.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2 - fieldRect.left,
      y: rect.top + rect.height * 0.66 - fieldRect.top,
    };
  }

  function seededPetals(origin, count = 22) {
    return Array.from({ length: count }, (_, index) => {
      const angle = (Math.PI * 2 * index) / count + ((index * 47) % 11) * 0.03;
      return {
        angle,
        distance: 30 + ((index * 29) % 70),
        size: 2.5 + ((index * 13) % 5),
        spin: ((index % 2) * 2 - 1) * (1.4 + (index % 4) * 0.25),
      };
    });
  }

  function effectDuration(type) {
    return {
      "yuki-bloom": 900,
      "yuki-cast": 760,
      "hisui-tsubame-gaeshi": 980,
      "nadine-wolf": 680,
      "cathy-needle": 520,
      "rozzi-double-shot": 620,
      "aya-double-burst": 560,
      "shoichi-dagger-ride": 800,
      "shoichi-seven-elixir": 1380,
      "leni-carrot-bazooka": 720,
      "hart-peacemaker": 1400,
      "sissela-channel": 760,
      "sissela-liberation": 850,
      "elena-danse-macabre": 680,
      "priya-earth-echo": 1250,
      "theodore-energy-field": 760,
      "emma-magic-hat": 760,
      "haze-rocket-launcher": 780,
      "isol-semtex-throw": 620,
      "isol-semtex-explosion": 780,
      "martina-fast-forward": 560,
      "katja-sniping-aim": 1000,
      "katja-sniping-shot": 680,
      "justyna-laser-barrage": 820,
      "bernice-snare-trap": 760,
      "rio-kaeyumi": 660,
      "celine-plasma-arm": 560,
      "celine-plasma-bomb": 880,
      "tia-perfect-drawing": 980,
      "xiukai-hot-taste": 900,
      "xiukai-flame": 560,
      "zahir-vayvayastra": 1080,
      "abigail-horizon-cleave": 980,
      "darko-forced-capture": 560,
      "darko-forced-impact": 620,
      "luke-obsession": 760,
      "silvia-speed-gun": 680,
      "bianca-reign": 1150,
    }[type] || 760;
  }

  function hexColor(value) {
    return Number.parseInt(value.replace("#", ""), 16);
  }

  function pixiStroke(graphics, color, width, alpha = 1) {
    graphics.stroke({ color: hexColor(color), width, alpha, cap: "round", join: "round" });
  }

  function pixiFill(graphics, color, alpha = 1) {
    graphics.fill({ color: hexColor(color), alpha });
  }

  function destroyPixiApp() {
    if (!pixiApp) return;
    const app = pixiApp;
    pixiApp = null;
    try {
      if (typeof app._cancelResize !== "function") app._cancelResize = () => {};
      app.destroy(true);
    } catch (error) {
      if (!String(error?.message || error).includes("_cancelResize")) console.warn("[rumia-pixi-destroy]", error);
      pixiLayer?.remove();
    }
  }

  function drawPixiVortex(graphics, center, progress, options = {}) {
    const {
      radius = 26,
      height = 0.42,
      vertical = 48,
      waist = 0.5,
      arms = 3,
      turns = 2.4,
      color = "#f2ffff",
      accent = "#5dffeb",
      rotation = 0,
      alpha = 1,
      segments = 14,
      body = true,
    } = options;
    if (alpha <= 0.01) return;
    for (let arm = 0; arm < arms; arm += 1) {
      const base = rotation + progress * Math.PI * 6 + (Math.PI * 2 * arm) / arms;
      for (let step = 0; step <= segments; step += 1) {
        const ratio = step / segments;
        const angle = base + ratio * Math.PI * 2 * turns;
        const funnel = 0.92 - Math.sin(Math.PI * ratio) * waist + ratio * 0.24;
        const localRadius = radius * funnel * (0.78 + Math.sin(progress * Math.PI) * 0.22);
        const x = center.x + Math.cos(angle) * localRadius;
        const y = center.y + Math.sin(angle) * localRadius * height - ratio * vertical;
        if (step === 0) graphics.moveTo(x, y);
        else graphics.lineTo(x, y);
      }
      pixiStroke(graphics, arm % 2 ? accent : color, arm % 2 ? 2 : 3, alpha * (0.34 + arm * 0.12));
    }
    graphics.ellipse(center.x, center.y + 4, radius * 0.62, radius * height * 0.28);
    pixiFill(graphics, accent, alpha * 0.18);
    if (body) {
      graphics.moveTo(center.x - radius * 0.5, center.y + 6);
      graphics.quadraticCurveTo(center.x - radius * 0.1, center.y - vertical * 0.5, center.x - radius * 0.28, center.y - vertical);
      graphics.lineTo(center.x + radius * 0.28, center.y - vertical);
      graphics.quadraticCurveTo(center.x + radius * 0.1, center.y - vertical * 0.5, center.x + radius * 0.5, center.y + 6);
      graphics.closePath();
      pixiFill(graphics, accent, alpha * 0.08);
    }
  }

  function drawPixiImpact(graphics, point, progress, color, radius = 18, alpha = 1) {
    if (progress <= 0) return;
    graphics.circle(point.x, point.y, 8 + progress * radius);
    pixiStroke(graphics, color, 3, Math.sin(Math.PI * progress) * alpha);
  }

  function drawPixiZahir(animation, progress, graphics) {
    const rawTarget = animation.targets[0];
    if (!rawTarget) return;
    const start = { x: animation.origin.x, y: animation.origin.y + 18 };
    const target = { x: rawTarget.x, y: rawTarget.y + 16 };
    const dx = target.x - start.x;
    const dy = target.y - start.y;
    const angle = Math.atan2(dy, dx);
    const length = Math.hypot(dx, dy) || 1;
    const unitX = dx / length;
    const unitY = dy / length;
    const summonPoint = { x: start.x + unitX * 26, y: start.y + unitY * 26 - 8 };
    const travelStart = Math.min(1, progress / 0.24);
    const travel = Math.min(1, Math.max(0, (progress - 0.18) / 0.62));
    const easedTravel = travel < 0.5 ? 2 * travel * travel : 1 - Math.pow(-2 * travel + 2, 2) / 2;
    const center = {
      x: summonPoint.x + (target.x - summonPoint.x) * easedTravel,
      y: summonPoint.y + (target.y - summonPoint.y) * easedTravel - Math.sin(Math.PI * easedTravel) * 18,
    };
    const visibleAlpha = Math.min(1, progress * 7) * Math.max(0, 1.2 - progress * 0.35) * 0.52;
    drawPixiVortex(graphics, summonPoint, progress, {
      radius: 12 + travelStart * 17,
      vertical: 39,
      arms: 2,
      turns: 2.1,
      segments: 12,
      body: false,
      rotation: angle,
      alpha: Math.sin(Math.PI * Math.min(1, travelStart)) * Math.max(0, 1 - travel),
    });
    drawPixiVortex(graphics, center, progress, {
      radius: 25 + Math.sin(progress * Math.PI * 8) * 2,
      vertical: 48,
      arms: 3,
      turns: 2.3,
      segments: 14,
      rotation: angle,
      alpha: visibleAlpha,
    });
    for (const hitPoint of animation.targets) {
      const hit = { x: hitPoint.x, y: hitPoint.y + 16 };
      const local = Math.min(1, Math.max(0, (progress - 0.68) / 0.32));
      if (local > 0) {
        drawPixiVortex(graphics, hit, local, {
          radius: 28,
          vertical: 52,
          arms: 3,
          turns: 2.2,
          segments: 14,
          rotation: angle,
          alpha: Math.sin(Math.PI * local) * 0.5,
        });
        drawPixiImpact(graphics, hit, local, "#eaffff", 16, 0.72);
      }
    }
  }

  function drawPixiElena(animation, progress, graphics) {
    const center = animation.targets[0];
    if (!center) return;
    const alpha = Math.sin(Math.PI * progress) * 0.75;
    graphics.ellipse(center.x, center.y + 8, 52 + progress * 10, 20 + progress * 4);
    pixiFill(graphics, "#7ad6ff", alpha * 0.12);
    pixiStroke(graphics, "#dff8ff", 3, alpha);
    for (let blade = 0; blade < 4; blade += 1) {
      const angle = progress * 6 + (Math.PI * 2 * blade) / 4;
      graphics.moveTo(center.x + Math.cos(angle) * 22, center.y + 8 + Math.sin(angle) * 8);
      graphics.lineTo(center.x + Math.cos(angle) * (55 + progress * 10), center.y + 8 + Math.sin(angle) * (22 + progress * 5));
      pixiStroke(graphics, "#ffffff", 2, alpha * 0.8);
    }
    for (const target of animation.targets.slice(0, 4)) {
      drawPixiImpact(graphics, { x: target.x, y: target.y + 8 }, progress, target === center ? "#f4fdff" : "#aeeeff", target === center ? 22 : 14, target === center ? 0.9 : 0.58);
    }
  }

  function drawPixiPriya(animation, progress, graphics) {
    const origin = animation.origin;
    const maxRadius = Math.max(origin.x, origin.y, Math.abs(animation.width - origin.x), Math.abs(animation.height - origin.y)) + 90;
    const eased = 1 - Math.pow(1 - progress, 2.4);
    const radius = 18 + maxRadius * eased;
    graphics.circle(origin.x, origin.y + 4, radius);
    pixiStroke(graphics, "#dfffb3", Math.max(2, 7 - progress * 4), Math.max(0, 1 - progress * 0.82));
    for (const target of animation.targets) {
      const local = Math.min(1, Math.max(0, progress * 1.6 - 0.35));
      drawPixiImpact(graphics, target, local, "#f4ffd5", 22, 0.68);
    }
  }

  function drawPixiBianca(animation, progress, graphics) {
    const origin = animation.origin;
    const maxRadius = Math.max(origin.x, origin.y, Math.abs(animation.width - origin.x), Math.abs(animation.height - origin.y)) + 60;
    graphics.circle(origin.x, origin.y, 24 + maxRadius * progress);
    pixiFill(graphics, "#7a0c34", Math.max(0, 1 - progress * 0.78) * 0.08);
    pixiStroke(graphics, "#ff7aa8", Math.max(2, 6 - progress * 3), Math.max(0, 1 - progress * 0.78) * 0.72);
    for (const target of animation.targets) {
      graphics.ellipse(target.x, target.y + 4, 28 + progress * 16, 13 + progress * 8);
      pixiFill(graphics, "#ff2e69", Math.sin(Math.PI * progress) * 0.14);
      pixiStroke(graphics, "#ffd1df", 3, Math.sin(Math.PI * progress) * 0.75);
    }
  }

  function pointAt(start, end, progress, lift = 0) {
    const eased = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
    return {
      x: start.x + (end.x - start.x) * eased,
      y: start.y + (end.y - start.y) * eased - Math.sin(Math.PI * eased) * lift,
    };
  }

  function drawPixiLineProjectile(graphics, start, target, progress, options = {}) {
    if (!target) return;
    const {
      color = "#ffffff",
      accent = "#86eaff",
      width = 4,
      radius = 5,
      lift = 16,
      trail = 34,
      alpha = 1,
      double = false,
      offset = 0,
    } = options;
    const local = Math.max(0, Math.min(1, progress));
    if (local <= 0) return;
    const angle = Math.atan2(target.y - start.y, target.x - start.x);
    const sideX = Math.cos(angle + Math.PI / 2) * offset;
    const sideY = Math.sin(angle + Math.PI / 2) * offset;
    const from = { x: start.x + sideX, y: start.y + sideY };
    const to = { x: target.x + sideX, y: target.y + sideY };
    const head = pointAt(from, to, local, lift);
    const tailProgress = Math.max(0, local - trail / Math.max(1, Math.hypot(to.x - from.x, to.y - from.y)));
    const tail = pointAt(from, to, tailProgress, lift);
    graphics.moveTo(tail.x, tail.y);
    graphics.lineTo(head.x, head.y);
    pixiStroke(graphics, accent, width + (double ? 2 : 0), alpha * 0.45);
    graphics.moveTo((tail.x + head.x) / 2, (tail.y + head.y) / 2);
    graphics.lineTo(head.x, head.y);
    pixiStroke(graphics, color, Math.max(2, width * 0.55), alpha);
    graphics.circle(head.x, head.y, radius);
    pixiFill(graphics, color, alpha * 0.9);
  }

  function drawPixiRadial(graphics, center, progress, options = {}) {
    if (!center) return;
    const { color = "#ffffff", fill = "#ffffff", radius = 48, squash = 0.5, alpha = 1, rings = 2 } = options;
    const pulse = Math.sin(Math.PI * progress);
    for (let ring = 0; ring < rings; ring += 1) {
      const local = Math.max(0, Math.min(1, progress - ring * 0.14));
      if (local <= 0) continue;
      graphics.ellipse(center.x, center.y + 6, 12 + radius * local, (12 + radius * local) * squash);
      pixiStroke(graphics, color, Math.max(2, 5 - ring), Math.max(0, 1 - local) * alpha);
    }
    graphics.ellipse(center.x, center.y + 6, radius * 0.45 + pulse * radius * 0.18, radius * squash * 0.34);
    pixiFill(graphics, fill, pulse * alpha * 0.14);
  }

  function drawPixiPetal(graphics, x, y, size, angle, color = "#ff667e", alpha = 1) {
    const length = size * 2.2;
    const width = size * 0.82;
    const tip = { x: x + Math.cos(angle) * length, y: y + Math.sin(angle) * length };
    const tail = { x: x - Math.cos(angle) * length * 0.55, y: y - Math.sin(angle) * length * 0.55 };
    const sideX = Math.cos(angle + Math.PI / 2) * width;
    const sideY = Math.sin(angle + Math.PI / 2) * width;
    graphics.moveTo(tip.x, tip.y);
    graphics.quadraticCurveTo(x + sideX, y + sideY, tail.x, tail.y);
    graphics.quadraticCurveTo(x - sideX, y - sideY, tip.x, tip.y);
    graphics.closePath();
    pixiFill(graphics, color, alpha);
  }

  function drawPixiPetalBurst(animation, progress, graphics, options = {}) {
    const { origin, petals = [] } = animation;
    const { color = "#ff667e", accent = "#ffd6e1", radius = 105, targetImpact = false } = options;
    const centers = targetImpact && animation.targets.length ? animation.targets : [origin];
    for (const [centerIndex, center] of centers.entries()) {
      for (const petal of petals.slice(0, animation.type === "yuki-bloom" ? 34 : 28)) {
        const angle = petal.angle + centerIndex * 0.67;
        const distance = petal.distance * (0.25 + progress * 1.05);
        const x = center.x + Math.cos(angle) * distance;
        const y = center.y + Math.sin(angle) * distance * 0.65;
        drawPixiPetal(graphics, x, y, petal.size * 1.15, angle + progress * petal.spin, color, Math.sin(Math.PI * progress) * 0.9);
      }
      drawPixiRadial(graphics, center, progress, { color: accent, fill: color, radius, alpha: 0.78, rings: 3 });
    }
    if (targetImpact && centers[0] !== origin) {
      drawPixiRadial(graphics, origin, progress, { color: accent, fill: color, radius: 34, alpha: 0.42, rings: 1 });
    }
  }

  function drawPixiYukiCrescent(animation, progress, graphics) {
    const targets = animation.targets.length ? animation.targets : [animation.target].filter(Boolean);
    if (!targets.length) return;
    const origin = animation.origin;
    const average = targets.reduce((sum, target) => ({ x: sum.x + target.x, y: sum.y + target.y }), { x: 0, y: 0 });
    average.x /= targets.length;
    average.y /= targets.length;
    const angle = Math.atan2(average.y - origin.y, average.x - origin.x);
    const forward = { x: Math.cos(angle), y: Math.sin(angle) };
    const normal = { x: -forward.y, y: forward.x };
    const center = {
      x: origin.x + forward.x * 54,
      y: origin.y + forward.y * 54 - 4,
    };
    const reveal = Math.min(1, progress * 1.45);
    const fade = Math.max(0, 1 - Math.max(0, progress - 0.72) / 0.28);
    const alpha = Math.min(1, progress * 6) * fade;
    const startTheta = -1.42;
    const endTheta = 1.42;
    const steps = 30;
    const visibleSteps = Math.max(1, Math.floor(steps * reveal));
    const slashPoint = (theta, width = 78, depth = 26) => ({
      x: center.x + normal.x * Math.sin(theta) * width + forward.x * Math.cos(theta) * depth,
      y: center.y + normal.y * Math.sin(theta) * width + forward.y * Math.cos(theta) * depth,
    });

    graphics.moveTo(origin.x + forward.x * 10, origin.y + forward.y * 10 - 8);
    graphics.lineTo(center.x + forward.x * 12, center.y + forward.y * 12);
    pixiStroke(graphics, "#fff2f5", 2, alpha * 0.35);

    const drawArc = (width, depth, color, strokeWidth, strokeAlpha, offset = 0) => {
      let previous = null;
      for (let step = 0; step <= visibleSteps; step += 1) {
        const ratio = step / steps;
        const theta = startTheta + (endTheta - startTheta) * ratio + offset;
        const point = slashPoint(theta, width, depth);
        if (!previous) graphics.moveTo(point.x, point.y);
        else graphics.lineTo(point.x, point.y);
        previous = point;
      }
      pixiStroke(graphics, color, strokeWidth, strokeAlpha);
    };

    drawArc(82, 31, "#ff7f9e", 13, alpha * 0.24);
    drawArc(78, 26, "#ffeaf0", 6, alpha * 0.86);
    drawArc(70, 18, "#ffffff", 2, alpha);
    drawArc(91, 42, "#ff4f7c", 3, alpha * 0.46, 0.05);

    if (progress > 0.18) {
      const local = Math.min(1, (progress - 0.18) / 0.46);
      for (const target of targets) {
        const hitAngle = Math.atan2(target.y - origin.y, target.x - origin.x);
        const hitAlpha = Math.sin(Math.PI * local) * 0.86;
        graphics.moveTo(target.x - Math.cos(hitAngle + 0.8) * 24, target.y - Math.sin(hitAngle + 0.8) * 24);
        graphics.lineTo(target.x + Math.cos(hitAngle + 0.8) * 24, target.y + Math.sin(hitAngle + 0.8) * 24);
        pixiStroke(graphics, "#fff7fa", 3, hitAlpha);
        drawPixiImpact(graphics, target, local, "#ff9ab0", 20, 0.56);
      }
    }

    drawPixiRadial(graphics, origin, progress, { color: "#fff0f4", fill: "#ff7a95", radius: 28, alpha: 0.38, rings: 1 });
  }

  function drawPixiHisuiTsubameGaeshi(animation, progress, graphics) {
    const targets = animation.targets.length ? animation.targets : [animation.target].filter(Boolean);
    if (!targets.length) return;
    const origin = animation.origin;
    const average = targets.reduce((sum, target) => ({ x: sum.x + target.x, y: sum.y + target.y }), { x: 0, y: 0 });
    average.x /= targets.length;
    average.y /= targets.length;
    const angle = Math.atan2(average.y - origin.y, average.x - origin.x);
    const forward = { x: Math.cos(angle), y: Math.sin(angle) };
    const normal = { x: -forward.y, y: forward.x };
    const center = {
      x: origin.x + forward.x * 62,
      y: origin.y + forward.y * 62 - 6,
    };
    const drawStroke = (local, shape, color, glow) => {
      if (local <= 0 || local >= 1.04) return;
      const reveal = Math.min(1, local * 1.65);
      const fade = Math.max(0, 1 - Math.max(0, local - 0.62) / 0.38);
      const alpha = Math.sin(Math.PI * Math.min(1, local)) * fade;
      const toWorld = (point) => ({
        x: center.x + normal.x * point.x + forward.x * point.y,
        y: center.y + normal.y * point.x * 0.72 + forward.y * point.y,
      });
      const curvePoint = (from, control, to, ratio) => {
        const inv = 1 - ratio;
        return {
          x: inv * inv * from.x + 2 * inv * ratio * control.x + ratio * ratio * to.x,
          y: inv * inv * from.y + 2 * inv * ratio * control.y + ratio * ratio * to.y,
        };
      };
      const drawBlade = (from, to, bend, width, strokeColor, strokeAlpha, edge = false) => {
        const control = {
          x: (from.x + to.x) / 2 + bend.x,
          y: (from.y + to.y) / 2 + bend.y,
        };
        const tail = Math.max(0, reveal - 0.36);
        const steps = 16;
        let started = false;
        for (let step = 0; step <= steps; step += 1) {
          const ratio = tail + ((reveal - tail) * step) / steps;
          const point = toWorld(curvePoint(from, control, to, ratio));
          if (!started) {
            graphics.moveTo(point.x, point.y);
            started = true;
          } else {
            graphics.lineTo(point.x, point.y);
          }
        }
        graphics.stroke({ color: hexColor(strokeColor), width, alpha: alpha * strokeAlpha, cap: "butt", join: "miter" });
        if (!edge) return;
        const head = toWorld(curvePoint(from, control, to, reveal));
        const prev = toWorld(curvePoint(from, control, to, Math.max(0, reveal - 0.035)));
        const angle = Math.atan2(head.y - prev.y, head.x - prev.x);
        const size = 9;
        const length = 18;
        const tip = { x: head.x + Math.cos(angle) * length * 0.55, y: head.y + Math.sin(angle) * length * 0.55 };
        const back = { x: head.x - Math.cos(angle) * length * 0.45, y: head.y - Math.sin(angle) * length * 0.45 };
        const side = { x: Math.cos(angle + Math.PI / 2) * size, y: Math.sin(angle + Math.PI / 2) * size };
        graphics.moveTo(tip.x, tip.y);
        graphics.lineTo(back.x + side.x, back.y + side.y);
        graphics.lineTo(back.x - side.x, back.y - side.y);
        graphics.closePath();
        pixiFill(graphics, "#ffffff", alpha * 0.86);
      };
      const segmentSets = {
        horizontal: [[{ x: -86, y: 0 }, { x: 86, y: 0 }, { x: 0, y: -22 }]],
        vertical: [[{ x: 0, y: -62 }, { x: 0, y: 72 }, { x: -24, y: 4 }]],
        tee: [
          [{ x: -76, y: -24 }, { x: 76, y: -24 }, { x: 0, y: -18 }],
          [{ x: 0, y: -24 }, { x: 0, y: 76 }, { x: 26, y: 8 }],
        ],
      }[shape] || [];
      for (const [from, to, bend] of segmentSets) {
        drawBlade(from, to, bend, 46, glow, 0.12);
        drawBlade(from, to, bend, 28, color, 0.34);
        drawBlade(from, to, bend, 9, "#ffffff", 0.78, true);
      }
      if (shape === "tee" && reveal > 0.62) {
        const cross = toWorld({ x: 0, y: -22 });
        const size = 16 + (reveal - 0.62) * 18;
        graphics.rect(cross.x - size / 2, cross.y - size / 2, size, size);
        pixiFill(graphics, glow, alpha * 0.1);
        graphics.rect(cross.x - size / 2, cross.y - size / 2, size, size);
        graphics.stroke({ color: hexColor(color), width: 3, alpha: alpha * 0.48, cap: "butt", join: "miter" });
      }
    };

    const strokes = [
      { start: 0, shape: "horizontal", color: "#dff7ff", glow: "#72dfff" },
      { start: 0.24, shape: "vertical", color: "#fff7d7", glow: "#ffc957" },
      { start: 0.48, shape: "tee", color: "#f4e8ff", glow: "#b87dff" },
    ];
    for (const stroke of strokes) {
      const local = (progress - stroke.start) / 0.4;
      drawStroke(local, stroke.shape, stroke.color, stroke.glow);
    }
    for (const target of targets) {
      for (const stroke of strokes) {
        const local = (progress - stroke.start) / 0.4;
        if (local > 0.55 && local < 1) {
          drawPixiImpact(graphics, target, Math.min(1, (local - 0.55) / 0.45), stroke.glow, 16, 0.36);
        }
      }
    }
    drawPixiRadial(graphics, origin, progress, { color: "#d9fbff", fill: "#79e4ff", radius: 34, alpha: 0.4, rings: 1 });
  }

  function drawPixiAbigailHorizonCleave(animation, progress, graphics) {
    const center = animation.origin;
    const drawSweep = (local, direction, radius, color, glow, widthOffset = 0) => {
      if (local <= 0 || local >= 1.06) return;
      const reveal = Math.min(1, local * 1.35);
      const fade = Math.max(0, 1 - Math.max(0, local - 0.64) / 0.36);
      const alpha = Math.sin(Math.PI * Math.min(1, local)) * fade;
      const start = direction - Math.PI * 0.82;
      const end = direction + Math.PI * 0.82;
      const steps = 36;
      const visibleSteps = Math.max(2, Math.floor(steps * reveal));
      const drawArc = (arcRadius, yScale, strokeColor, strokeWidth, strokeAlpha, lift = 0) => {
        for (let step = 0; step <= visibleSteps; step += 1) {
          const ratio = step / steps;
          const theta = start + (end - start) * ratio;
          const x = center.x + Math.cos(theta) * arcRadius;
          const y = center.y + Math.sin(theta) * arcRadius * yScale - lift;
          if (step === 0) graphics.moveTo(x, y);
          else graphics.lineTo(x, y);
        }
        pixiStroke(graphics, strokeColor, strokeWidth, strokeAlpha);
      };

      drawArc(radius + widthOffset, 0.58, glow, 18, alpha * 0.18, 6);
      drawArc(radius - 8 + widthOffset, 0.56, color, 8, alpha * 0.72, 6);
      drawArc(radius - 18 + widthOffset, 0.54, "#fff8fb", 3, alpha * 0.98, 6);
    };

    const first = Math.min(1, progress / 0.58);
    const second = Math.min(1, Math.max(0, progress - 0.28) / 0.58);
    drawSweep(first, -Math.PI * 0.12, 158, "#ff7d9f", "#ff2e68", 0);
    drawSweep(first, -Math.PI * 0.1, 118, "#ffd2df", "#ff5d86", -4);
    drawSweep(second, Math.PI * 1.08, 166, "#a7e8ff", "#47cfff", 0);
    drawSweep(second, Math.PI * 1.06, 126, "#ecfbff", "#7de6ff", -4);

    const shock = Math.min(1, progress * 1.15);
    drawPixiRadial(graphics, center, shock, { color: "#ffe9f1", fill: "#ff4779", radius: 118, alpha: 0.28, rings: 1 });
    if (progress > 0.2) {
      const impact = Math.min(1, (progress - 0.2) / 0.62);
      for (const target of animation.targets) {
        drawPixiImpact(graphics, target, impact, "#ffd7e3", 18, 0.46);
        if (second > 0.18) drawPixiImpact(graphics, target, Math.min(1, (second - 0.18) / 0.7), "#b8f4ff", 15, 0.38);
      }
    }
  }

  function drawPixiDarkoForcedCapture(animation, progress, graphics) {
    const target = animation.targets[0];
    if (!target) return;
    const origin = animation.origin;
    const pull = Math.min(1, progress * 1.35);
    const alpha = Math.sin(Math.PI * Math.min(1, progress)) * 0.9;
    const mid = {
      x: (origin.x + target.x) / 2,
      y: Math.min(origin.y, target.y) - 76,
    };
    const lift = Math.sin(Math.PI * Math.min(1, progress / 0.86));
    graphics.ellipse(target.x, target.y + 17, 24 + pull * 15, 8 + pull * 4);
    pixiFill(graphics, "#000000", 0.24 * lift);
    for (let chain = 0; chain < 2; chain += 1) {
      const offset = chain ? 11 : -11;
      const wrapY = target.y - 10 - lift * 36;
      graphics.moveTo(origin.x, origin.y - 8 + offset * 0.2);
      graphics.quadraticCurveTo(mid.x, mid.y + offset, target.x, wrapY - offset * 0.2);
      pixiStroke(graphics, chain ? "#ffe0c8" : "#ff514a", chain ? 3 : 7, alpha * (chain ? 0.9 : 0.5));
    }
    for (let link = 0; link < 8; link += 1) {
      const local = Math.max(0, Math.min(1, pull - link * 0.055));
      const point = pointAt(origin, { x: target.x, y: target.y - 34 }, local, 56);
      graphics.roundRect(point.x - 5, point.y - 4, 10, 8, 2);
      pixiFill(graphics, link % 2 ? "#ffd7bd" : "#ff716b", alpha * 0.72);
    }
    const lifted = { x: target.x, y: target.y - 28 - lift * 28 };
    graphics.moveTo(lifted.x - 24, lifted.y - 6);
    graphics.lineTo(lifted.x + 24, lifted.y - 6);
    graphics.moveTo(lifted.x - 19, lifted.y + 8);
    graphics.lineTo(lifted.x + 19, lifted.y + 8);
    pixiStroke(graphics, "#fff0d5", 4, alpha * 0.84);
    drawPixiRadial(graphics, lifted, progress, { color: "#ffd0b5", fill: "#ff4f48", radius: 40, alpha: 0.55, rings: 2 });
  }

  function drawPixiDarkoForcedImpact(animation, progress, graphics) {
    const center = animation.targets[0] || animation.origin;
    const alpha = Math.max(0, 1 - progress) * 0.9;
    const radius = 34 + progress * 86;
    const drop = Math.max(0, 1 - progress * 1.4);
    graphics.ellipse(center.x, center.y + 17, 18 + progress * 54, 5 + progress * 18);
    pixiFill(graphics, "#000000", 0.26 * Math.max(0, 1 - progress));
    if (drop > 0) {
      graphics.moveTo(center.x - 18, center.y - 92 * drop);
      graphics.lineTo(center.x, center.y - 34 * drop);
      graphics.lineTo(center.x + 18, center.y - 92 * drop);
      pixiStroke(graphics, "#ffe4ca", 5, drop * 0.74);
    }
    graphics.circle(center.x, center.y + 4, radius);
    pixiFill(graphics, "#ff4f48", Math.sin(Math.PI * progress) * 0.12);
    pixiStroke(graphics, "#ffcaa8", Math.max(2, 9 - progress * 5), alpha);
    for (let spike = 0; spike < 10; spike += 1) {
      const angle = (Math.PI * 2 * spike) / 10 + progress * 0.35;
      const inner = 22 + progress * 18;
      const outer = 58 + progress * 62;
      graphics.moveTo(center.x + Math.cos(angle) * inner, center.y + Math.sin(angle) * inner * 0.58);
      graphics.lineTo(center.x + Math.cos(angle) * outer, center.y + Math.sin(angle) * outer * 0.58);
      pixiStroke(graphics, spike % 2 ? "#ff7b72" : "#ffe0c8", spike % 2 ? 3 : 2, alpha * 0.68);
    }
    for (const target of animation.targets) drawPixiImpact(graphics, target, progress, "#ffd0b5", 22, 0.72);
  }

  function drawPixiFateAbsorb(animation, progress, graphics) {
    const source = animation.targets[0];
    const target = animation.origin;
    if (!source || !target) return;
    const pull = Math.min(1, progress / 0.72);
    const alpha = Math.sin(Math.PI * progress);
    graphics.moveTo(source.x, source.y);
    const mid = { x: (source.x + target.x) / 2, y: Math.min(source.y, target.y) - 70 };
    graphics.quadraticCurveTo(mid.x, mid.y, target.x, target.y);
    pixiStroke(graphics, "#ff668f", 5, alpha * 0.7);
    graphics.moveTo(source.x, source.y + 10);
    graphics.quadraticCurveTo(mid.x + 30, mid.y + 18, target.x, target.y + 10);
    pixiStroke(graphics, "#f7d6ff", 2, alpha);
    for (let chain = 0; chain < 9; chain += 1) {
      const local = Math.max(0, Math.min(1, pull - chain * 0.045));
      const point = pointAt(source, target, local, 44);
      graphics.circle(point.x, point.y, 3 + (chain % 2) * 1.5);
      pixiFill(graphics, chain % 2 ? "#ffd4e1" : "#ff4876", alpha * 0.72);
    }
    drawPixiRadial(graphics, source, progress, { color: "#ff9db8", fill: "#ff4f82", radius: 34, alpha: 0.55, rings: 1 });
    drawPixiRadial(graphics, target, progress, { color: "#ffe8f0", fill: "#ff6b9b", radius: 42, alpha: 0.62, rings: 2 });
  }

  function drawPixiWolfRush(animation, progress, graphics) {
    const target = animation.targets[0];
    if (!target) return;
    const head = pointAt(animation.origin, target, Math.min(1, progress * 1.15), 18);
    const angle = Math.atan2(target.y - animation.origin.y, target.x - animation.origin.x);
    const alpha = Math.min(1, progress * 5) * Math.max(0, 1.15 - progress);
    for (let trail = 3; trail >= 0; trail -= 1) {
      const local = Math.max(0, Math.min(1, progress * 1.15 - trail * 0.07));
      const ghost = pointAt(animation.origin, target, local, 18);
      const points = [
        { x: 18, y: 0 },
        { x: -10, y: -13 },
        { x: -5, y: 0 },
        { x: -10, y: 13 },
      ].map((point) => ({
        x: ghost.x + Math.cos(angle) * point.x - Math.sin(angle) * point.y,
        y: ghost.y + Math.sin(angle) * point.x + Math.cos(angle) * point.y,
      }));
      graphics.moveTo(points[0].x, points[0].y);
      for (const point of points.slice(1)) graphics.lineTo(point.x, point.y);
      graphics.closePath();
      pixiFill(graphics, "#dff7ff", alpha * (0.18 + (3 - trail) * 0.11));
    }
    drawPixiImpact(graphics, target, Math.max(0, (progress - 0.62) / 0.38), "#eaffff", 20, 0.9);
    graphics.circle(head.x, head.y, 4);
    pixiFill(graphics, "#ffffff", alpha);
  }

  function drawPixiDoubleShot(animation, progress, graphics, style) {
    const target = animation.targets[0];
    if (!target) return;
    drawPixiLineProjectile(graphics, animation.origin, target, Math.min(1, progress / 0.68), style);
    drawPixiLineProjectile(graphics, animation.origin, target, Math.max(0, (progress - 0.22) / 0.72), { ...style, double: true, offset: style.secondOffset || 8 });
    if (progress > 0.58) drawPixiImpact(graphics, target, (progress - 0.58) / 0.42, style.accent || "#ffffff", 18, 0.8);
  }

  function drawPixiDaggerMarker(graphics, point, progress, color = "#d8f5ff") {
    const angle = progress * 5.8;
    const center = { x: point.x, y: point.y + 4 };
    const points = [
      { x: 0, y: -18 },
      { x: 6, y: 3 },
      { x: 0, y: 16 },
      { x: -6, y: 3 },
    ].map((vertex) => ({
      x: center.x + Math.cos(angle) * vertex.x - Math.sin(angle) * vertex.y,
      y: center.y + Math.sin(angle) * vertex.x + Math.cos(angle) * vertex.y,
    }));
    graphics.moveTo(points[0].x, points[0].y);
    for (const vertex of points.slice(1)) graphics.lineTo(vertex.x, vertex.y);
    graphics.closePath();
    pixiFill(graphics, color, 0.22 + Math.sin(progress * Math.PI * 6) * 0.14);
    pixiStroke(graphics, color, 2, 0.72);
  }

  function drawPixiShoichi(animation, progress, graphics) {
    const target = animation.targets[0];
    if (!target) return;
    const start = animation.origin;
    const away = progress < 0.5 ? progress / 0.5 : 1;
    const back = progress < 0.5 ? 0 : (progress - 0.5) / 0.5;
    drawPixiDaggerMarker(graphics, start, progress, "#b9f6ff");
    drawPixiDaggerMarker(graphics, target, progress + 0.2, "#ffffff");
    const routeA = pointAt(start, target, away, 0);
    const routeB = pointAt(target, start, back, 0);
    const body = progress < 0.5 ? routeA : routeB;
    for (let trail = 0; trail < 5; trail += 1) {
      const local = Math.max(0, progress - trail * 0.035);
      const position = local < 0.5 ? pointAt(start, target, local / 0.5, 0) : pointAt(target, start, (local - 0.5) / 0.5, 0);
      graphics.ellipse(position.x, position.y - 10, 13 - trail, 24 - trail * 2);
      pixiFill(graphics, "#bfefff", Math.max(0, 0.34 - trail * 0.055));
    }
    graphics.circle(body.x, body.y - 18, 8);
    pixiFill(graphics, "#f8fdff", 0.86);
    graphics.moveTo(start.x, start.y);
    graphics.lineTo(target.x, target.y);
    pixiStroke(graphics, "#a7f1ff", 2, Math.sin(Math.PI * progress) * 0.8);
    for (const hit of animation.targets) drawPixiImpact(graphics, hit, progress, "#e9fbff", 16, 0.58);
  }

  function drawPixiTheodore(animation, progress, graphics) {
    const origin = animation.origin;
    const alpha = Math.sin(Math.PI * progress);
    const eased = 1 - Math.pow(1 - progress, 2.2);
    for (const target of animation.targets) {
      drawPixiLineProjectile(graphics, origin, target, eased, {
        color: "#dff8ff",
        accent: "#83d9ff",
        width: 3,
        radius: 4,
        lift: 8,
      });
      graphics.circle(target.x, target.y + 2, 18 + progress * 12);
      pixiStroke(graphics, "#bff6ff", 3, alpha * 0.72);
      graphics.circle(target.x, target.y + 2, 8 + progress * 8);
      pixiFill(graphics, "#83d9ff", alpha * 0.12);
    }
    drawPixiRadial(graphics, origin, progress, { color: "#eafcff", fill: "#7fdcff", radius: 30, alpha: 0.45, rings: 1 });
  }

  function drawPixiSisselaLiberation(animation, progress, graphics) {
    drawPixiRadial(graphics, animation.origin, progress, { color: "#fff0ff", fill: "#b45cff", radius: 130, alpha: 0.78, rings: 4 });
    const local = Math.min(1, Math.max(0, progress * 1.45 - 0.22));
    for (const target of animation.targets) {
      drawPixiImpact(graphics, target, local, "#f4e9ff", 24, 0.82);
      const alpha = Math.sin(Math.PI * local) * 0.55;
      if (alpha <= 0) continue;
      graphics.ellipse(target.x, target.y + 4, 28 + local * 10, 11 + local * 4);
      pixiStroke(graphics, "#72dcff", 2, alpha);
    }
  }

  function drawPixiEmmaHat(animation, progress, graphics) {
    const target = animation.targets[0];
    if (!target) return;
    const flight = Math.min(1, progress / 0.62);
    drawPixiLineProjectile(graphics, animation.origin, target, flight, {
      color: "#f5dcff",
      accent: "#a86dff",
      width: 4,
      radius: 7,
      lift: 34,
    });
    const impact = Math.min(1, Math.max(0, (progress - 0.42) / 0.58));
    const alpha = Math.sin(Math.PI * impact);
    if (impact <= 0) return;
    drawPixiRadial(graphics, target, impact, { color: "#f5dcff", fill: "#9f67ff", radius: 42, alpha: 0.58, rings: 2 });
    for (let star = 0; star < 10; star += 1) {
      const angle = progress * 3.4 + star * 0.628;
      const distance = 12 + impact * (22 + (star % 3) * 7);
      const x = target.x + Math.cos(angle) * distance;
      const y = target.y - 4 + Math.sin(angle) * distance * 0.72;
      const size = 2.4 + (star % 2) + impact * 1.4;
      graphics.moveTo(x, y - size);
      graphics.lineTo(x + size * 0.4, y - size * 0.35);
      graphics.lineTo(x + size, y);
      graphics.lineTo(x + size * 0.4, y + size * 0.35);
      graphics.lineTo(x, y + size);
      graphics.lineTo(x - size * 0.4, y + size * 0.35);
      graphics.lineTo(x - size, y);
      graphics.lineTo(x - size * 0.4, y - size * 0.35);
      graphics.lineTo(x, y - size);
      pixiFill(graphics, star % 2 ? "#fff5a8" : "#f5dcff", alpha * 0.92);
    }
  }

  function shoichiSevenPoints(animation) {
    const width = Math.max(240, animation.width || 640);
    const height = Math.max(220, animation.height || 480);
    const battlefield = document.querySelector(".battlefield");
    const fieldRect = battlefield?.getBoundingClientRect();
    const cells = fieldRect ? Array.from(battlefield.querySelectorAll(".enemy-board .cell, .board .cell"))
      .map((cell) => {
        const rect = cell.getBoundingClientRect();
        return {
          x: rect.left + rect.width / 2 - fieldRect.left,
          y: rect.top + rect.height / 2 - fieldRect.top,
          left: rect.left - fieldRect.left,
          right: rect.right - fieldRect.left,
          top: rect.top - fieldRect.top,
          bottom: rect.bottom - fieldRect.top,
        };
      }) : [];
    const area = cells.length ? {
      left: Math.min(...cells.map((cell) => cell.left)),
      right: Math.max(...cells.map((cell) => cell.right)),
      top: Math.min(...cells.map((cell) => cell.top)),
      bottom: Math.max(...cells.map((cell) => cell.bottom)),
    } : {
      left: Math.max(24, width * 0.075),
      right: width - Math.max(24, width * 0.075),
      top: Math.max(24, height * 0.085),
      bottom: height - Math.max(24, height * 0.085),
    };
    const snap = (point) => cells.length
      ? cells.reduce((best, cell) => {
          const bestDistance = (best.x - point.x) ** 2 + (best.y - point.y) ** 2;
          const cellDistance = (cell.x - point.x) ** 2 + (cell.y - point.y) ** 2;
          return cellDistance < bestDistance ? cell : best;
        }, cells[0])
      : point;
    const bounds = { minX: 760, maxX: 1150, minY: 330, maxY: 735 };
    const map = ([x, y]) => snap({
      x: area.left + ((x - bounds.minX) / (bounds.maxX - bounds.minX)) * (area.right - area.left),
      y: area.top + ((y - bounds.minY) / (bounds.maxY - bounds.minY)) * (area.bottom - area.top),
    });
    return {
      daggers: [
        map([806, 696]),
        map([1106, 681]),
        map([1105, 385]),
        map([818, 388]),
      ],
      path: [
        map([962, 501]),
        map([1104, 384]),
        map([1111, 371]),
        map([923, 544]),
        map([1105, 681]),
        map([927, 472]),
        map([806, 696]),
        map([991, 471]),
        map([818, 388]),
        map([997, 543]),
      ],
    };
  }

  function drawPixiShoichiSeven(animation, progress, graphics) {
    const origin = animation.origin;
    const route = shoichiSevenPoints(animation);
    const chain = [origin, ...route.path];
    const segmentCount = chain.length - 1;
    const total = Math.max(0, Math.min(1, progress));
    const pulse = Math.sin(total * Math.PI * 8) * 0.5 + 0.5;
    for (const [index, point] of route.daggers.entries()) {
      const born = Math.max(0, Math.min(1, total * 4 - index * 0.12));
      drawPixiDaggerMarker(graphics, point, total + index * 0.23, index % 2 ? "#ffffff" : "#c9b8ff");
      if (born > 0) {
        graphics.circle(point.x, point.y + 4, 12 + pulse * 7);
        pixiStroke(graphics, "#9f6dff", 2, Math.max(0, 0.5 - total * 0.15));
      }
    }
    const routeProgress = Math.max(0, Math.min(1, (total - 0.12) / 0.78));
    const raw = routeProgress * segmentCount;
    const segment = Math.min(segmentCount - 1, Math.floor(raw));
    const local = raw - segment;
    for (let index = 0; index < segment; index += 1) {
      const start = chain[index];
      const end = chain[index + 1];
      if (!end) continue;
      const age = Math.max(0, segment - index);
      const alpha = Math.max(0.14, 0.52 - age * 0.045);
      graphics.moveTo(start.x, start.y);
      graphics.lineTo(end.x, end.y);
      pixiStroke(graphics, "#f5f0ff", 4, alpha);
      graphics.moveTo(start.x, start.y);
      graphics.lineTo(end.x, end.y);
      pixiStroke(graphics, "#7d45e8", 1.5, alpha * 0.45);
    }
    for (const hit of animation.targets) drawPixiImpact(graphics, hit, total, "#f4e9ff", 20, 0.7);
  }

  function drawPixiRocket(animation, progress, graphics, options = {}) {
    const target = animation.targets[0];
    if (!target) return;
    const { color = "#ffd181", accent = "#ff8a33", shots = 1, lift = 18 } = options;
    for (let shot = 0; shot < shots; shot += 1) {
      const local = Math.max(0, Math.min(1, (progress - shot * 0.12) / (0.72 - shot * 0.04)));
      drawPixiLineProjectile(graphics, animation.origin, target, local, {
        color,
        accent,
        width: 6,
        radius: 7,
        lift,
        trail: 44,
        offset: (shot - (shots - 1) / 2) * 6,
        alpha: Math.min(1, local * 4) * Math.max(0, 1.1 - local * 0.1),
      });
      if (local > 0.72) drawPixiImpact(graphics, target, (local - 0.72) / 0.28, color, 22, 0.75);
    }
  }

  function drawPixiMartinaFastForward(animation, progress, graphics) {
    const impact = animation.targets[0];
    if (!impact) return;
    const beamStart = { x: animation.origin.x, y: animation.origin.y - 8 };
    const beamEnd = { x: impact.x, y: impact.y - 10 };
    const beamAlpha = Math.max(0, 1 - progress / 0.34);
    if (beamAlpha > 0) {
      graphics.moveTo(beamStart.x, beamStart.y);
      graphics.lineTo(beamEnd.x, beamEnd.y);
      pixiStroke(graphics, "#ffb83d", 22, beamAlpha * 0.28);
      graphics.moveTo(beamStart.x, beamStart.y);
      graphics.lineTo(beamEnd.x, beamEnd.y);
      pixiStroke(graphics, "#ffe05f", 13, beamAlpha * 0.72);
      graphics.moveTo(beamStart.x, beamStart.y);
      graphics.lineTo(beamEnd.x, beamEnd.y);
      pixiStroke(graphics, "#ffffff", 5, beamAlpha);
      graphics.circle(beamStart.x, beamStart.y, 12 + progress * 26);
      pixiFill(graphics, "#fff5b8", beamAlpha * 0.32);
      graphics.circle(beamEnd.x, beamEnd.y, 16 + progress * 38);
      pixiFill(graphics, "#fff1a8", beamAlpha * 0.38);
    }
    const impactProgress = Math.max(0, Math.min(1, (progress - 0.56) / 0.44));
    if (impactProgress <= 0) return;
    for (const [index, target] of animation.targets.entries()) {
      const chain = Math.max(0, Math.min(1, (impactProgress - index * 0.1) / 0.72));
      if (chain <= 0) continue;
      const alpha = index === 0 ? 0.82 : 0.52;
      drawPixiImpact(graphics, target, chain, index === 0 ? "#fff7c7" : "#ffd15f", index === 0 ? 36 : 24, alpha);
      graphics.ellipse(target.x, target.y + 8, 26 + chain * 22, 10 + chain * 7);
      pixiFill(graphics, index === 0 ? "#fff0a8" : "#ffbe4d", Math.sin(Math.PI * chain) * alpha * 0.16);
      pixiStroke(graphics, "#ffda66", index === 0 ? 5 : 3, Math.max(0, 1 - chain) * alpha);
      if (index > 0) {
        graphics.moveTo(impact.x, impact.y + 7);
        graphics.lineTo(target.x, target.y + 7);
        pixiStroke(graphics, "#ffef9a", 4, Math.max(0, 1 - chain) * 0.42);
      }
    }
  }

  function drawPixiMartinaRecording(animation, progress, graphics) {
    const targets = animation.targets.length ? animation.targets : [animation.target].filter(Boolean);
    const origin = animation.origin;
    const aim = targets[0] || { x: origin.x, y: origin.y - 120 };
    const angle = Math.atan2(aim.y - origin.y, aim.x - origin.x);
    const forward = { x: Math.cos(angle), y: Math.sin(angle) };
    const normal = { x: -forward.y, y: forward.x };
    const toWorld = (point) => ({
      x: origin.x + normal.x * point.x + forward.x * point.y,
      y: origin.y + normal.y * point.x * 0.72 + forward.y * point.y,
    });
    const pulse = (progress * 3) % 1;
    const reveal = Math.min(1, pulse * 1.35);
    const alpha = (0.28 + Math.sin(Math.PI * pulse) * 0.52) * (1 - progress * 0.18);
    const tip = toWorld({ x: 0, y: 178 * reveal });
    const leftNear = toWorld({ x: -28, y: 22 });
    const rightNear = toWorld({ x: 28, y: 22 });
    const leftFar = toWorld({ x: -112 * reveal, y: 146 * reveal });
    const rightFar = toWorld({ x: 112 * reveal, y: 146 * reveal });
    graphics.moveTo(leftNear.x, leftNear.y);
    graphics.quadraticCurveTo(leftFar.x, leftFar.y, tip.x, tip.y);
    graphics.quadraticCurveTo(rightFar.x, rightFar.y, rightNear.x, rightNear.y);
    graphics.quadraticCurveTo(origin.x + forward.x * 30, origin.y + forward.y * 30, leftNear.x, leftNear.y);
    graphics.closePath();
    pixiFill(graphics, "#ffef9a", alpha * 0.14);
    graphics.moveTo(leftNear.x, leftNear.y);
    graphics.quadraticCurveTo(leftFar.x, leftFar.y, tip.x, tip.y);
    graphics.quadraticCurveTo(rightFar.x, rightFar.y, rightNear.x, rightNear.y);
    pixiStroke(graphics, "#ffd15f", 4, alpha * 0.42);
    for (let line = 1; line <= 2; line += 1) {
      const width = 36 + line * 34;
      const start = toWorld({ x: -width * reveal, y: 58 + line * 42 });
      const end = toWorld({ x: width * reveal, y: 58 + line * 42 });
      graphics.moveTo(start.x, start.y);
      graphics.lineTo(end.x, end.y);
      pixiStroke(graphics, "#fff6cf", 2, alpha * 0.5);
    }
    for (const target of targets) {
      drawPixiRadial(graphics, target, pulse, { color: "#ffe28a", fill: "#ffd15f", radius: 20, squash: 0.36, alpha: 0.42, rings: 1 });
    }
  }

  function drawPixiKatjaAim(animation, progress, graphics) {
    const targets = animation.targets.length ? animation.targets : [animation.target].filter(Boolean);
    if (!targets.length) return;
    const pulse = Math.sin(progress * Math.PI * 5) * 0.5 + 0.5;
    for (const target of targets) {
      graphics.moveTo(animation.origin.x, animation.origin.y - 18);
      graphics.lineTo(target.x, target.y - 10);
      pixiStroke(graphics, "#ffdf7a", 1.5, 0.26 + pulse * 0.18);
      graphics.circle(target.x, target.y - 10, 16 + pulse * 5);
      pixiStroke(graphics, "#ffd66e", 3, 0.72);
      graphics.circle(target.x, target.y - 10, 5);
      pixiStroke(graphics, "#fff8d6", 2, 0.88);
      graphics.moveTo(target.x - 26, target.y - 10);
      graphics.lineTo(target.x - 8, target.y - 10);
      graphics.moveTo(target.x + 8, target.y - 10);
      graphics.lineTo(target.x + 26, target.y - 10);
      graphics.moveTo(target.x, target.y - 36);
      graphics.lineTo(target.x, target.y - 18);
      graphics.moveTo(target.x, target.y - 2);
      graphics.lineTo(target.x, target.y + 16);
      pixiStroke(graphics, "#fff2bc", 2, 0.78);
    }
  }

  function projectionProgress(start, end, point) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSq = dx * dx + dy * dy;
    if (lengthSq <= 0.0001 || !point) return 1;
    return Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSq));
  }

  function drawPixiKatjaShot(animation, progress, graphics) {
    const targets = animation.targets.length ? animation.targets : [animation.target].filter(Boolean);
    targets.forEach((target, index) => {
      const local = Math.max(0, Math.min(1, (progress - index * 0.08) / 0.5));
      const flash = Math.sin(Math.PI * Math.min(1, local));
      const impactTarget = animation.impactTargets?.[index] || target;
      const shotStart = { x: animation.origin.x, y: animation.origin.y };
      const shotEnd = { x: target.x, y: target.y };
      const impactAt = projectionProgress(shotStart, shotEnd, impactTarget);
      if (local <= impactAt) {
        drawPixiLineProjectile(graphics, animation.origin, target, Math.min(local, impactAt), {
          color: "#ffffff",
          accent: "#ffbd45",
          width: 15,
          radius: 9,
          lift: 2,
          trail: 150,
          offset: (index - (targets.length - 1) / 2) * 6,
          alpha: Math.min(1, local * 10) * Math.max(0, 1.16 - local * 0.35),
        });
      }
      if (local > 0.06 && local < 0.86) {
        const beamStart = { x: animation.origin.x, y: animation.origin.y - 12 };
        const beamEnd = { x: target.x, y: target.y - 8 };
        graphics.moveTo(beamStart.x, beamStart.y);
        graphics.lineTo(beamEnd.x, beamEnd.y);
        pixiStroke(graphics, "#fff1a8", 5, flash * 0.38);
      }
      if (local >= impactAt) drawPixiImpact(graphics, impactTarget, Math.min(1, (local - impactAt) / Math.max(0.12, 1 - impactAt)), "#fff1a8", 34, 0.95);
    });
  }

  function drawPixiJustynaLaserBarrage(animation, progress, graphics) {
    const targets = animation.targets.length ? animation.targets : [animation.target].filter(Boolean);
    if (!targets.length) return;
    targets.forEach((target, index) => {
      const local = Math.max(0, Math.min(1, (progress - index * 0.18) / 0.5));
      if (local <= 0 || local >= 1) return;
      const alpha = Math.sin(Math.PI * local);
      const angle = Math.atan2(target.y - animation.origin.y, target.x - animation.origin.x);
      const nx = -Math.sin(angle) * 3;
      const ny = Math.cos(angle) * 3;
      graphics.moveTo(animation.origin.x + nx, animation.origin.y - 12 + ny);
      graphics.lineTo(target.x + nx, target.y - 8 + ny);
      pixiStroke(graphics, "#ffef9a", 13, alpha * 0.16);
      graphics.moveTo(animation.origin.x + nx, animation.origin.y - 12 + ny);
      graphics.lineTo(target.x + nx, target.y - 8 + ny);
      pixiStroke(graphics, "#ffe047", 5, alpha * 0.78);
      graphics.moveTo(animation.origin.x - nx, animation.origin.y - 12 - ny);
      graphics.lineTo(target.x - nx, target.y - 8 - ny);
      pixiStroke(graphics, "#ffffff", 2, alpha);
      drawPixiImpact(graphics, target, local, "#fff1a8", 18, 0.62);
    });
  }

  function drawPixiBomb(animation, progress, graphics, options = {}) {
    const center = animation.targets[0] || animation.origin;
    const { color = "#ff6e42", accent = "#ffd166", radius = 46 } = options;
    if (progress < 0.45) {
      drawPixiLineProjectile(graphics, animation.origin, center, progress / 0.45, { color: accent, accent: color, width: 5, radius: 6, lift: 32 });
      return;
    }
    const local = (progress - 0.45) / 0.55;
    graphics.circle(center.x, center.y, 16 + radius * local);
    pixiFill(graphics, color, Math.sin(Math.PI * local) * 0.18);
    pixiStroke(graphics, accent, Math.max(2, 8 - local * 4), Math.max(0, 1 - local) * 0.9);
    for (const target of animation.targets) drawPixiImpact(graphics, target, local, accent, 18, 0.72);
  }

  function drawPixiSemtexThrow(animation, progress, graphics) {
    const target = animation.targets[0];
    if (!target) return;
    drawPixiLineProjectile(graphics, animation.origin, target, Math.min(1, progress / 0.72), {
      color: "#f6ff9b",
      accent: "#ff8d3d",
      width: 5,
      radius: 4,
      lift: 22,
      trail: 22,
    });
    const local = Math.max(0, (progress - 0.58) / 0.42);
    if (local <= 0) return;
    const pulse = Math.sin(Math.PI * local);
    graphics.circle(target.x, target.y - 18, 9 + pulse * 5);
    pixiFill(graphics, "#ff4d32", 0.24 + pulse * 0.26);
    pixiStroke(graphics, "#fff1a6", 3, Math.max(0, 1 - local * 0.35));
    graphics.moveTo(target.x - 13, target.y - 18);
    graphics.lineTo(target.x + 13, target.y - 18);
    graphics.moveTo(target.x, target.y - 31);
    graphics.lineTo(target.x, target.y - 5);
    pixiStroke(graphics, "#ff6b3d", 2, 0.86);
  }

  function drawPixiSemtexExplosion(animation, progress, graphics) {
    const center = animation.targets[0] || animation.origin;
    const shock = Math.min(1, progress / 0.72);
    const flare = Math.sin(Math.PI * shock);
    const x = center.x;
    const y = center.y - 8;
    const burstRadius = 26 + shock * 64;
    const flamePoints = 14;
    graphics.moveTo(x + burstRadius, y);
    for (let point = 1; point <= flamePoints; point += 1) {
      const angle = (Math.PI * 2 * point) / flamePoints;
      const radius = burstRadius * (point % 2 ? 0.52 : 1);
      graphics.lineTo(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius * 0.72);
    }
    graphics.closePath();
    pixiFill(graphics, "#ff5a2f", flare * 0.38);
    pixiStroke(graphics, "#fff0a8", Math.max(2, 7 - shock * 4), Math.max(0, 1 - shock) * 0.82);
    graphics.circle(x, y, 8 + shock * 28);
    pixiFill(graphics, "#fff4ba", flare * 0.72);
    graphics.circle(x, y, 24 + shock * 82);
    pixiStroke(graphics, "#ffb347", Math.max(2, 10 - shock * 6), Math.max(0, 1 - shock) * 0.72);
    const smokeAlpha = Math.max(0, shock - 0.24) * 0.18;
    for (let puff = 0; puff < 5; puff += 1) {
      const angle = (Math.PI * 2 * puff) / 5 + 0.35;
      const distance = 20 + shock * (28 + puff * 5);
      graphics.circle(x + Math.cos(angle) * distance, y + Math.sin(angle) * distance * 0.55, 14 + shock * 10);
      pixiFill(graphics, "#3a3230", smokeAlpha);
    }
    const shards = effectParticleCount(18);
    for (let index = 0; index < shards; index += 1) {
      const angle = (Math.PI * 2 * index) / shards + 0.24;
      const inner = 18 + shock * 22;
      const outer = 34 + shock * 86;
      graphics.moveTo(x + Math.cos(angle) * inner, y + Math.sin(angle) * inner * 0.62);
      graphics.lineTo(x + Math.cos(angle) * outer, y + Math.sin(angle) * outer * 0.62);
    }
    pixiStroke(graphics, "#ffd15f", 4, Math.max(0, 1 - shock) * 0.82);
    for (const target of animation.targets.slice(1)) {
      drawPixiRadial(graphics, target, shock, { color: "#ffd66b", fill: "#ff8a35", radius: 30, squash: 0.42, alpha: 0.58, rings: 1 });
    }
  }

  function drawPixiDefaultCast(animation, progress, graphics) {
    drawPixiPetalBurst(animation, progress, graphics, { color: "#8be7ff", accent: "#ffffff", radius: 62 });
  }

  function drawPixiAnimation(animation, progress) {
    const graphics = animation.graphics;
    graphics.clear();
    if (animation.type === "yuki-cast") drawPixiYukiCrescent(animation, progress, graphics);
    else if (animation.type === "yuki-bloom") drawPixiPetalBurst(animation, progress, graphics, { color: "#ff416d", accent: "#fff0f5", radius: 120, targetImpact: true });
    else if (animation.type === "hisui-tsubame-gaeshi") drawPixiHisuiTsubameGaeshi(animation, progress, graphics);
    else if (animation.type === "fate-absorb") drawPixiFateAbsorb(animation, progress, graphics);
    else if (animation.type === "nadine-wolf") drawPixiWolfRush(animation, progress, graphics);
    else if (animation.type === "cathy-needle") drawPixiRocket(animation, progress, graphics, { color: "#f8fbff", accent: "#8ee9ff", shots: 1, lift: 8 });
    else if (animation.type === "rozzi-double-shot") drawPixiDoubleShot(animation, progress, graphics, { color: "#fff0a8", accent: "#ffb347", width: 5, radius: 5, lift: 12, secondOffset: 7 });
    else if (animation.type === "aya-double-burst") drawPixiDoubleShot(animation, progress, graphics, { color: "#d8f7ff", accent: "#68c8ff", width: 4, radius: 5, lift: 18, secondOffset: -7 });
    else if (animation.type === "shoichi-dagger-ride") drawPixiShoichi(animation, progress, graphics);
    else if (animation.type === "shoichi-seven-elixir") drawPixiShoichiSeven(animation, progress, graphics);
    else if (animation.type === "leni-carrot-bazooka") drawPixiRocket(animation, progress, graphics, { color: "#ffd587", accent: "#70ff98", shots: 1, lift: 26 });
    else if (animation.type === "hart-peacemaker") drawPixiRadial(graphics, animation.origin, progress, { color: "#ffeeb8", fill: "#8affc1", radius: 120, alpha: 0.7, rings: 3 });
    else if (animation.type === "sissela-channel") drawPixiRadial(graphics, animation.origin, progress, { color: "#d7c6ff", fill: "#6c54ff", radius: 70, alpha: 0.65, rings: 3 });
    else if (animation.type === "sissela-liberation") drawPixiSisselaLiberation(animation, progress, graphics);
    else if (animation.type === "elena-danse-macabre") drawPixiElena(animation, progress, graphics);
    else if (animation.type === "priya-earth-echo") drawPixiPriya(animation, progress, graphics);
    else if (animation.type === "theodore-energy-field") drawPixiTheodore(animation, progress, graphics);
    else if (animation.type === "emma-magic-hat") drawPixiEmmaHat(animation, progress, graphics);
    else if (animation.type === "haze-rocket-launcher") drawPixiRocket(animation, progress, graphics, { color: "#ffe29a", accent: "#ff6945", shots: 4, lift: 18 });
    else if (animation.type === "isol-semtex-throw") drawPixiSemtexThrow(animation, progress, graphics);
    else if (animation.type === "isol-semtex-explosion") drawPixiSemtexExplosion(animation, progress, graphics);
    else if (animation.type === "martina-fast-forward") drawPixiMartinaFastForward(animation, progress, graphics);
    else if (animation.type === "katja-sniping-aim") drawPixiKatjaAim(animation, progress, graphics);
    else if (animation.type === "katja-sniping-shot") drawPixiKatjaShot(animation, progress, graphics);
    else if (animation.type === "justyna-laser-barrage") drawPixiJustynaLaserBarrage(animation, progress, graphics);
    else if (animation.type === "bernice-snare-trap") drawPixiRocket(animation, progress, graphics, { color: "#ffd181", accent: "#ff8a33", shots: 1, lift: 12 });
    else if (animation.type === "rio-kaeyumi") drawPixiDoubleShot(animation, progress, graphics, { color: "#d9ffab", accent: "#7dff6c", width: 4, radius: 5, lift: 36, secondOffset: 5 });
    else if (animation.type === "celine-plasma-arm") drawPixiRocket(animation, progress, graphics, { color: "#ffc46b", accent: "#ff4b35", shots: 1, lift: 14 });
    else if (animation.type === "celine-plasma-bomb") drawPixiBomb(animation, progress, graphics, { color: "#ff593c", accent: "#ffd166", radius: 52 });
    else if (animation.type === "tia-perfect-drawing") drawPixiPetalBurst(animation, progress, graphics, { color: "#ff66b3", accent: "#fff8cf", radius: 84 });
    else if (animation.type === "xiukai-hot-taste") drawPixiRadial(graphics, animation.origin, progress, { color: "#ffd878", fill: "#ff6744", radius: 82, alpha: 0.72, rings: 3 });
    else if (animation.type === "xiukai-flame") drawPixiRocket(animation, progress, graphics, { color: "#ffbf50", accent: "#ff4f2e", shots: 1, lift: 8 });
    else if (animation.type === "zahir-vayvayastra") drawPixiZahir(animation, progress, graphics);
    else if (animation.type === "abigail-horizon-cleave") drawPixiAbigailHorizonCleave(animation, progress, graphics);
    else if (animation.type === "darko-forced-capture") drawPixiDarkoForcedCapture(animation, progress, graphics);
    else if (animation.type === "darko-forced-impact") drawPixiDarkoForcedImpact(animation, progress, graphics);
    else if (animation.type === "luke-obsession") drawPixiRadial(graphics, animation.origin, progress, { color: "#effcff", fill: "#6edcff", radius: 76, alpha: 0.72, rings: 3 });
    else if (animation.type === "silvia-speed-gun") {
      drawPixiRocket(animation, progress, graphics, { color: "#fff5a8", accent: "#ffe14d", shots: 1, lift: 18 });
      for (const ally of animation.targets.slice(1)) drawPixiRadial(graphics, ally, progress, { color: "#b8ffd8", fill: "#6cff9e", radius: 36, alpha: 0.5, rings: 1 });
    } else if (animation.type === "bianca-reign") drawPixiBianca(animation, progress, graphics);
    else drawPixiDefaultCast(animation, progress, graphics);
  }

  function drawPixi(now) {
    for (let index = pixiAnimations.length - 1; index >= 0; index -= 1) {
      const animation = pixiAnimations[index];
      const progress = Math.min(1, (now - animation.startedAt) / animation.duration);
      drawPixiAnimation(animation, progress);
      if (progress >= 1) {
        animation.container.removeFromParent();
        animation.container.destroy({ children: true });
        pixiAnimations.splice(index, 1);
      }
    }
    pixiApp?.render();
    pixiFrame = pixiAnimations.length ? requestAnimationFrame(drawPixi) : 0;
  }

  function playPixi(spec, layout, origin, targets, target, impactTargets = []) {
    const generation = pixiGeneration;
    ensurePixiLayer(layout)
      .then((app) => {
        if (generation !== pixiGeneration) return;
        if (!app || pixiHost !== layout.battlefield) return;
        const container = new Container();
        container.blendMode = "add";
        const graphics = new Graphics();
        container.addChild(graphics);
        app.stage.addChild(container);
        pixiAnimations.push({
          ...spec,
          origin,
          targets,
          impactTargets,
          target,
          petals: seededPetals(origin, effectParticleCount(spec.type === "yuki-bloom" ? 34 : 24)),
          width: layout.width,
          height: layout.height,
          startedAt: performance.now(),
          duration: effectDuration(spec.type),
          container,
          graphics,
        });
        if (!pixiFrame) pixiFrame = requestAnimationFrame(drawPixi);
      })
      .catch(() => {
        pushLegacyAnimation(spec, layout, origin, targets, target, impactTargets);
      });
  }

  function pushLegacyAnimation(spec, layout, origin, targets, target, impactTargets = []) {
    animations.push({
      ...spec,
      origin,
      targets,
      impactTargets,
      width: layout.width,
      height: layout.height,
      angle: Math.atan2(target.y - origin.y, target.x - origin.x),
      petals: seededPetals(origin, effectParticleCount(spec.type === "yuki-bloom" ? 34 : 24)),
      startedAt: performance.now(),
      duration: effectDuration(spec.type),
    });
    if (!frame) frame = requestAnimationFrame(draw);
  }

  function play(spec) {
    const layout = pixiEffectTypes.has(spec.type) ? ensureLayout() : ensureCanvas();
    if (!layout) return;
    const targets = (spec.targetIds || []).map((id) => unitPoint(id, layout.rect)).filter(Boolean);
    const impactTargets = (spec.impactTargetIds || []).map((id) => unitPoint(id, layout.rect)).filter(Boolean);
    const origin = unitPoint(spec.fromId, layout.rect) || targets[0];
    if (!origin) return;
    const fallbackTarget = { x: origin.x, y: origin.y - 80 };
    const target = targets[0] || fallbackTarget;
    if (pixiEffectTypes.has(spec.type)) {
      playPixi(spec, layout, origin, targets, target, impactTargets);
      return;
    }
    pushLegacyAnimation(spec, layout, origin, targets, target, impactTargets);
  }

  function drawPetal(ctx, x, y, size, rotation, alpha) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "#ff667e";
    ctx.beginPath();
    ctx.ellipse(0, 0, size * 1.8, size * 0.72, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawCast(ctx, animation, progress) {
    const { origin, angle, petals } = animation;
    const spread = Math.PI * 0.5;
    const radius = 55 + 90 * Math.min(1, progress * 1.7);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.translate(origin.x, origin.y);
    ctx.rotate(angle);
    ctx.globalAlpha = Math.sin(Math.PI * progress) * 0.9;
    ctx.strokeStyle = "#fff7df";
    ctx.lineWidth = 5;
    ctx.shadowColor = "#ff536f";
    ctx.shadowBlur = 18;
    for (let index = 0; index < 5; index += 1) {
      const offset = -spread / 2 + (spread * index) / 4;
      ctx.beginPath();
      ctx.arc(0, 0, radius - index * 4, offset - 0.28, offset + 0.28);
      ctx.stroke();
    }
    ctx.restore();
    for (const petal of petals) {
      const distance = petal.distance * Math.min(1, progress * 1.8);
      drawPetal(ctx, origin.x + Math.cos(petal.angle) * distance, origin.y + Math.sin(petal.angle) * distance * 0.65, petal.size, petal.angle + progress * petal.spin, Math.sin(Math.PI * progress));
    }
  }

  function drawHisuiTsubameGaeshi(ctx, animation, progress) {
    const targets = animation.targets.length ? animation.targets : [animation.target].filter(Boolean);
    if (!targets.length) return;
    const origin = animation.origin;
    const average = targets.reduce((sum, target) => ({ x: sum.x + target.x, y: sum.y + target.y }), { x: 0, y: 0 });
    average.x /= targets.length;
    average.y /= targets.length;
    const angle = Math.atan2(average.y - origin.y, average.x - origin.x);
    const forward = { x: Math.cos(angle), y: Math.sin(angle) };
    const normal = { x: -forward.y, y: forward.x };
    const center = {
      x: origin.x + forward.x * 62,
      y: origin.y + forward.y * 62 - 6,
    };
    const drawStroke = (local, shape, color, glow) => {
      if (local <= 0 || local >= 1.04) return;
      const reveal = Math.min(1, local * 1.65);
      const fade = Math.max(0, 1 - Math.max(0, local - 0.62) / 0.38);
      const alpha = Math.sin(Math.PI * Math.min(1, local)) * fade;
      const toWorld = (point) => ({
        x: center.x + normal.x * point.x + forward.x * point.y,
        y: center.y + normal.y * point.x * 0.72 + forward.y * point.y,
      });
      const curvePoint = (from, control, to, ratio) => {
        const inv = 1 - ratio;
        return {
          x: inv * inv * from.x + 2 * inv * ratio * control.x + ratio * ratio * to.x,
          y: inv * inv * from.y + 2 * inv * ratio * control.y + ratio * ratio * to.y,
        };
      };
      const drawBlade = (from, to, bend, width, strokeColor, strokeAlpha, edge = false) => {
        const control = {
          x: (from.x + to.x) / 2 + bend.x,
          y: (from.y + to.y) / 2 + bend.y,
        };
        const tail = Math.max(0, reveal - 0.36);
        const steps = 16;
        ctx.beginPath();
        for (let step = 0; step <= steps; step += 1) {
          const ratio = tail + ((reveal - tail) * step) / steps;
          const point = toWorld(curvePoint(from, control, to, ratio));
          if (step === 0) ctx.moveTo(point.x, point.y);
          else ctx.lineTo(point.x, point.y);
        }
        ctx.globalAlpha = alpha * strokeAlpha;
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = width;
        ctx.lineCap = "butt";
        ctx.lineJoin = "miter";
        ctx.shadowColor = glow;
        ctx.shadowBlur = width > 10 ? 22 : 12;
        ctx.stroke();
        if (!edge) return;
        const head = toWorld(curvePoint(from, control, to, reveal));
        const prev = toWorld(curvePoint(from, control, to, Math.max(0, reveal - 0.035)));
        const angle = Math.atan2(head.y - prev.y, head.x - prev.x);
        const size = 9;
        const length = 18;
        const tip = { x: head.x + Math.cos(angle) * length * 0.55, y: head.y + Math.sin(angle) * length * 0.55 };
        const back = { x: head.x - Math.cos(angle) * length * 0.45, y: head.y - Math.sin(angle) * length * 0.45 };
        const side = { x: Math.cos(angle + Math.PI / 2) * size, y: Math.sin(angle + Math.PI / 2) * size };
        ctx.globalAlpha = alpha * 0.86;
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.moveTo(tip.x, tip.y);
        ctx.lineTo(back.x + side.x, back.y + side.y);
        ctx.lineTo(back.x - side.x, back.y - side.y);
        ctx.closePath();
        ctx.fill();
      };
      const segmentSets = {
        horizontal: [[{ x: -86, y: 0 }, { x: 86, y: 0 }, { x: 0, y: -22 }]],
        vertical: [[{ x: 0, y: -62 }, { x: 0, y: 72 }, { x: -24, y: 4 }]],
        tee: [
          [{ x: -76, y: -24 }, { x: 76, y: -24 }, { x: 0, y: -18 }],
          [{ x: 0, y: -24 }, { x: 0, y: 76 }, { x: 26, y: 8 }],
        ],
      }[shape] || [];
      for (const [from, to, bend] of segmentSets) {
        drawBlade(from, to, bend, 46, glow, 0.12);
        drawBlade(from, to, bend, 28, color, 0.34);
        drawBlade(from, to, bend, 9, "#ffffff", 0.78, true);
      }
      if (shape === "tee" && reveal > 0.62) {
        const cross = toWorld({ x: 0, y: -22 });
        const size = 16 + (reveal - 0.62) * 18;
        ctx.globalAlpha = alpha * 0.54;
        ctx.strokeStyle = color;
        ctx.fillStyle = glow;
        ctx.lineWidth = 3;
        ctx.lineCap = "butt";
        ctx.lineJoin = "miter";
        ctx.beginPath();
        ctx.rect(cross.x - size / 2, cross.y - size / 2, size, size);
        ctx.fill();
        ctx.stroke();
      }
    };

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const strokes = [
      { start: 0, shape: "horizontal", color: "#dff7ff", glow: "#72dfff" },
      { start: 0.24, shape: "vertical", color: "#fff7d7", glow: "#ffc957" },
      { start: 0.48, shape: "tee", color: "#f4e8ff", glow: "#b87dff" },
    ];
    for (const stroke of strokes) {
      const local = (progress - stroke.start) / 0.4;
      drawStroke(local, stroke.shape, stroke.color, stroke.glow);
    }
    ctx.restore();
    for (const target of targets) {
      for (const stroke of strokes) {
        const local = (progress - stroke.start) / 0.4;
        if (local > 0.55 && local < 1) {
          drawImpactRing(ctx, target, Math.min(1, (local - 0.55) / 0.45), stroke.glow, stroke.glow, 16);
        }
      }
    }
  }

  function drawBloom(ctx, animation, progress) {
    const centers = animation.targets.length ? animation.targets : [animation.origin];
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const center of centers) {
      const radius = 18 + progress * 75;
      ctx.globalAlpha = Math.max(0, 1 - progress) * 0.95;
      ctx.strokeStyle = "#fff8e8";
      ctx.lineWidth = 7 - progress * 4;
      ctx.shadowColor = "#ff365f";
      ctx.shadowBlur = 24;
      ctx.beginPath();
      ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
      ctx.stroke();
      for (let index = 0; index < 8; index += 1) {
        const angle = (Math.PI * 2 * index) / 8 + progress * 1.4;
        const x = center.x + Math.cos(angle) * radius * 0.55;
        const y = center.y + Math.sin(angle) * radius * 0.55;
        drawPetal(ctx, x, y, 8 + progress * 5, angle, Math.max(0, 1 - progress));
      }
    }
    ctx.restore();
  }

  function drawFateAbsorb(ctx, animation, progress) {
    const target = animation.targets[0];
    if (!target) return;
    const start = animation.origin;
    const dx = target.x - start.x;
    const dy = target.y - start.y;
    const distance = Math.hypot(dx, dy) || 1;
    const nx = -dy / distance;
    const ny = dx / distance;
    const chainProgress = Math.min(1, progress * 2.4);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(235, 214, 184, 0.96)";
    ctx.shadowColor = "rgba(177, 38, 66, 0.95)";
    ctx.shadowBlur = 12;
    ctx.beginPath();
    for (let step = 0; step <= 18; step += 1) {
      const ratio = (step / 18) * chainProgress;
      const wave = Math.sin(step * 2.1 + progress * 18) * 4 * Math.sin(Math.PI * ratio);
      const x = start.x + dx * ratio + nx * wave;
      const y = start.y + dy * ratio + ny * wave;
      if (step === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    for (let step = 1; step < 18 * chainProgress; step += 2) {
      const ratio = step / 18;
      const x = start.x + dx * ratio;
      const y = start.y + dy * ratio;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.atan2(dy, dx) + (step % 4 ? 0.5 : -0.5));
      ctx.globalAlpha = Math.sin(Math.PI * Math.min(1, ratio)) * 0.85;
      ctx.strokeRect(-5, -3, 10, 6);
      ctx.restore();
    }
    const bindAlpha = Math.sin(Math.PI * Math.min(1, progress * 1.25));
    ctx.globalAlpha = bindAlpha;
    const ringWidth = 29 + progress * 8;
    const ringHeight = 12 + progress * 3;
    ctx.lineWidth = 5;
    ctx.strokeStyle = "#ff3f62";
    ctx.beginPath();
    ctx.ellipse(target.x, target.y, ringWidth, ringHeight, Math.PI * 0.25 + progress * 3.2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#ffe1b8";
    ctx.shadowColor = "rgba(255, 52, 91, 0.98)";
    ctx.shadowBlur = 15;
    ctx.beginPath();
    ctx.ellipse(target.x, target.y, ringWidth, ringHeight, -Math.PI * 0.25 - progress * 3.8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = bindAlpha * 0.72;
    ctx.fillStyle = "rgba(132, 17, 43, 0.36)";
    ctx.beginPath();
    ctx.arc(target.x, target.y, 20 + Math.sin(progress * Math.PI * 8) * 3, 0, Math.PI * 2);
    ctx.fill();
    if (progress > 0.48) {
      const pull = (progress - 0.48) / 0.52;
      for (const petal of animation.petals.slice(0, 18)) {
        const spreadX = target.x + Math.cos(petal.angle) * petal.distance * (1 - pull);
        const spreadY = target.y + Math.sin(petal.angle) * petal.distance * 0.55 * (1 - pull);
        const x = spreadX + (start.x - target.x) * pull;
        const y = spreadY + (start.y - target.y) * pull;
        drawPetal(ctx, x, y, petal.size, petal.angle + pull * 4, Math.sin(Math.PI * pull));
      }
    }
    ctx.restore();
  }

  function drawWolf(ctx, x, y, angle, scale, alpha) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.scale(scale, scale);
    ctx.globalAlpha = alpha;
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = "rgba(190, 255, 192, 0.72)";
    ctx.strokeStyle = "rgba(235, 255, 225, 0.96)";
    ctx.lineWidth = 2.2;
    ctx.shadowColor = "rgba(87, 220, 118, 0.95)";
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.moveTo(-28, 2);
    ctx.quadraticCurveTo(-16, -14, 4, -10);
    ctx.lineTo(16, -20);
    ctx.lineTo(15, -9);
    ctx.lineTo(29, -3);
    ctx.lineTo(17, 3);
    ctx.quadraticCurveTo(7, 15, -12, 11);
    ctx.lineTo(-25, 18);
    ctx.lineTo(-18, 7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-25, 1);
    ctx.quadraticCurveTo(-39, -7, -47, 4);
    ctx.quadraticCurveTo(-39, 0, -31, 10);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-9, 9);
    ctx.lineTo(-17, 25);
    ctx.moveTo(7, 10);
    ctx.lineTo(15, 24);
    ctx.stroke();
    ctx.fillStyle = "#fff7b8";
    ctx.beginPath();
    ctx.arc(20, -5, 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawNadineWolf(ctx, animation, progress) {
    const target = animation.targets[0];
    if (!target) return;
    const start = animation.origin;
    const eased = 1 - Math.pow(1 - Math.min(1, progress * 1.28), 3);
    const x = start.x + (target.x - start.x) * eased;
    const y = start.y + (target.y - start.y) * eased - Math.sin(Math.PI * eased) * 18;
    const angle = Math.atan2(target.y - start.y, target.x - start.x);
    for (let trail = 4; trail >= 1; trail -= 1) {
      const offset = trail * 13;
      drawWolf(ctx, x - Math.cos(angle) * offset, y - Math.sin(angle) * offset, angle, 0.72 + progress * 0.18, 0.07 * (5 - trail));
    }
    drawWolf(ctx, x, y, angle, 0.78 + Math.sin(progress * Math.PI) * 0.18, Math.min(1, progress * 5) * Math.max(0, 1.2 - progress));
    if (progress > 0.68) {
      const impact = (progress - 0.68) / 0.32;
      ctx.save();
      ctx.translate(target.x, target.y);
      ctx.rotate(angle - 0.25);
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = Math.sin(Math.PI * impact);
      ctx.strokeStyle = "#efffe8";
      ctx.lineWidth = 4;
      ctx.shadowColor = "#65e58a";
      ctx.shadowBlur = 18;
      for (let claw = -1; claw <= 1; claw += 1) {
        ctx.beginPath();
        ctx.moveTo(-22, claw * 9 - 12);
        ctx.quadraticCurveTo(0, claw * 9, 28 + impact * 18, claw * 9 + 12);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  function drawCathyNeedle(ctx, animation, progress) {
    const target = animation.targets[0];
    if (!target) return;
    const start = animation.origin;
    const eased = 1 - Math.pow(1 - Math.min(1, progress * 1.45), 3);
    const x = start.x + (target.x - start.x) * eased;
    const y = start.y + (target.y - start.y) * eased;
    const angle = Math.atan2(target.y - start.y, target.x - start.x);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = Math.min(1, progress * 7) * Math.max(0, 1.18 - progress);
    ctx.strokeStyle = "#f9fdff";
    ctx.lineWidth = 2;
    ctx.shadowColor = "#8fe5ff";
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.moveTo(-27, 0);
    ctx.lineTo(12, 0);
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.moveTo(18, 0);
    ctx.lineTo(8, -3);
    ctx.lineTo(8, 3);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(143, 229, 255, 0.4)";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-58, 0);
    ctx.lineTo(-12, 0);
    ctx.stroke();
    ctx.restore();
    if (progress > 0.62) {
      const impact = (progress - 0.62) / 0.38;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = Math.sin(Math.PI * impact);
      ctx.strokeStyle = "#c8f4ff";
      ctx.lineWidth = 3;
      ctx.shadowColor = "#56cdec";
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.arc(target.x, target.y, 8 + impact * 24, -0.7, 0.7);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawRozziShot(ctx, start, target, localProgress, second = false) {
    if (localProgress < 0 || localProgress > 1) return;
    const eased = 1 - Math.pow(1 - localProgress, 3);
    const dx = target.x - start.x;
    const dy = target.y - start.y;
    const distance = Math.hypot(dx, dy) || 1;
    const nx = -dy / distance;
    const ny = dx / distance;
    const lane = second ? 5 : -5;
    const origin = { x: start.x + nx * lane, y: start.y + ny * lane };
    const destination = { x: target.x - nx * lane, y: target.y - ny * lane };
    const x = origin.x + (destination.x - origin.x) * eased;
    const y = origin.y + (destination.y - origin.y) * eased;
    const angle = Math.atan2(destination.y - origin.y, destination.x - origin.x);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = Math.sin(Math.PI * localProgress);
    ctx.strokeStyle = second ? "#ffef9a" : "#ff9f72";
    ctx.lineWidth = second ? 5 : 3;
    ctx.shadowColor = second ? "#ffd95c" : "#ff5d55";
    ctx.shadowBlur = second ? 22 : 16;
    ctx.beginPath();
    ctx.moveTo(origin.x, origin.y);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(-10, -2.5, 22, 5);
    ctx.restore();
    if (localProgress < 0.28) {
      const flash = localProgress / 0.28;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = Math.sin(Math.PI * flash);
      ctx.fillStyle = second ? "#fff3a8" : "#ffb17c";
      ctx.shadowColor = second ? "#ffe45d" : "#ff6755";
      ctx.shadowBlur = 20;
      ctx.beginPath();
      ctx.arc(origin.x, origin.y, 5 + flash * 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    if (localProgress > 0.72) {
      const impact = (localProgress - 0.72) / 0.28;
      ctx.save();
      ctx.translate(destination.x, destination.y);
      ctx.rotate(angle + (second ? 0.7 : -0.7));
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = Math.sin(Math.PI * impact);
      ctx.strokeStyle = second ? "#fff4ae" : "#ffc2a3";
      ctx.lineWidth = 4;
      ctx.shadowColor = "#ff574f";
      ctx.shadowBlur = 15;
      ctx.beginPath();
      ctx.moveTo(-16, -11);
      ctx.lineTo(16, 11);
      ctx.moveTo(-16, 11);
      ctx.lineTo(16, -11);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawRozziDoubleShot(ctx, animation, progress) {
    const target = animation.targets[0];
    if (!target) return;
    drawRozziShot(ctx, animation.origin, target, Math.min(1, progress / 0.66), false);
    drawRozziShot(ctx, animation.origin, target, Math.max(0, (progress - 0.24) / 0.76), true);
  }

  function drawAyaRound(ctx, start, target, localProgress, second = false) {
    if (localProgress < 0 || localProgress > 1) return;
    const eased = Math.min(1, localProgress * 1.35);
    const x = start.x + (target.x - start.x) * eased;
    const y = start.y + (target.y - start.y) * eased;
    const angle = Math.atan2(target.y - start.y, target.x - start.x);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = Math.min(1, localProgress * 8) * Math.max(0, 1.15 - localProgress);
    ctx.strokeStyle = second ? "#e9f8ff" : "#80c9ff";
    ctx.lineWidth = second ? 4 : 2;
    ctx.shadowColor = "#409cff";
    ctx.shadowBlur = second ? 20 : 12;
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(-8, -2, 18, 4);
    ctx.restore();
    if (localProgress > 0.7) {
      const impact = (localProgress - 0.7) / 0.3;
      ctx.save();
      ctx.translate(target.x, target.y);
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = Math.sin(Math.PI * impact);
      ctx.strokeStyle = second ? "#eaf8ff" : "#72bdff";
      ctx.lineWidth = second ? 4 : 2;
      ctx.shadowColor = "#4d9fff";
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.arc(0, 0, 8 + impact * (second ? 28 : 18), 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-25, 0);
      ctx.lineTo(25, 0);
      ctx.moveTo(0, -25);
      ctx.lineTo(0, 25);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawAyaDoubleBurst(ctx, animation, progress) {
    const target = animation.targets[0];
    if (!target) return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = Math.sin(Math.PI * Math.min(1, progress * 1.4)) * 0.55;
    ctx.setLineDash([5, 7]);
    ctx.strokeStyle = "#79bfff";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(animation.origin.x, animation.origin.y);
    ctx.lineTo(target.x, target.y);
    ctx.stroke();
    ctx.restore();
    drawAyaRound(ctx, animation.origin, target, Math.min(1, progress / 0.7), false);
    drawAyaRound(ctx, animation.origin, target, Math.max(0, (progress - 0.2) / 0.8), true);
  }

  function drawDaggerMarker(ctx, point, angle, alpha, pulse) {
    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.rotate(angle);
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = "#f8f3ff";
    ctx.fillStyle = "rgba(152, 104, 255, 0.64)";
    ctx.lineWidth = 2;
    ctx.shadowColor = "#9d65ff";
    ctx.shadowBlur = 17;
    ctx.beginPath();
    ctx.moveTo(-3, -24 - pulse * 4);
    ctx.lineTo(5, 3);
    ctx.lineTo(0, 17);
    ctx.lineTo(-5, 3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 5, 13 + pulse * 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawShoichiDaggerRide(ctx, animation, progress) {
    const target = animation.targets[0];
    if (!target) return;
    const start = animation.origin;
    const end = {
      x: start.x + (target.x - start.x) * 1.16,
      y: start.y + (target.y - start.y) * 1.16,
    };
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const angle = Math.atan2(dy, dx);
    const markerAlpha = Math.min(1, progress * 8) * Math.max(0, 1.25 - progress);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = markerAlpha * 0.28;
    ctx.setLineDash([9, 7]);
    ctx.lineDashOffset = -progress * 70;
    ctx.strokeStyle = "#a873ff";
    ctx.lineWidth = 1.5;
    ctx.shadowColor = "#7d45e8";
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    ctx.restore();
    drawDaggerMarker(ctx, start, -0.45 + progress * 2.2, markerAlpha, Math.sin(progress * Math.PI * 6) * 0.5 + 0.5);
    drawDaggerMarker(ctx, end, 0.45 - progress * 2.4, markerAlpha, Math.sin(progress * Math.PI * 6 + 1) * 0.5 + 0.5);

    let travel = 0;
    let visible = false;
    if (progress >= 0.04 && progress <= 0.25) {
      travel = (progress - 0.04) / 0.21;
      visible = true;
    } else if (progress >= 0.7 && progress <= 0.95) {
      travel = 1 - (progress - 0.7) / 0.25;
      visible = true;
    }
    if (!visible) return;
    const eased = 1 - Math.pow(1 - travel, 3);
    const x = start.x + dx * eased;
    const y = start.y + dy * eased;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = Math.sin(Math.PI * Math.min(1, travel)) * 0.9;
    ctx.translate(x, y);
    ctx.rotate(angle + (progress > 0.5 ? Math.PI : 0));
    ctx.strokeStyle = "#fff5ff";
    ctx.lineWidth = 7;
    ctx.shadowColor = "#bc78ff";
    ctx.shadowBlur = 22;
    ctx.beginPath();
    ctx.moveTo(-34, 0);
    ctx.lineTo(28, 0);
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#f05a8a";
    ctx.beginPath();
    ctx.moveTo(-22, -10);
    ctx.lineTo(20, 10);
    ctx.stroke();
    ctx.restore();
  }

  function drawShoichiSevenElixir(ctx, animation, progress) {
    const origin = animation.origin;
    const route = shoichiSevenPoints(animation);
    const chain = [origin, ...route.path];
    const segmentCount = chain.length - 1;
    const total = Math.max(0, Math.min(1, progress));
    const routeProgress = Math.max(0, Math.min(1, (total - 0.12) / 0.78));
    const raw = routeProgress * segmentCount;
    const segment = Math.min(segmentCount - 1, Math.floor(raw));
    const local = raw - segment;
    const pulse = Math.sin(total * Math.PI * 8) * 0.5 + 0.5;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const [index, point] of route.daggers.entries()) {
      const alpha = Math.min(1, total * 5 - index * 0.16) * Math.max(0.35, 1 - total * 0.18);
      if (alpha <= 0) continue;
      drawDaggerMarker(ctx, point, total * 2.8 + index * 0.35, alpha, pulse);
    }
    for (let index = 0; index < segment; index += 1) {
      const start = chain[index];
      const end = chain[index + 1];
      if (!end) continue;
      const age = Math.max(0, segment - index);
      const alpha = Math.max(0.14, 0.52 - age * 0.045);
      ctx.strokeStyle = `rgba(245, 240, 255, ${alpha})`;
      ctx.lineWidth = 4;
      ctx.shadowColor = "#a873ff";
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
    }
    ctx.restore();
    for (const hit of animation.targets) {
      drawDaggerMarker(ctx, hit, -total * 3, Math.sin(Math.PI * total) * 0.38, pulse);
    }
  }

  function drawLeniCarrotBazooka(ctx, animation, progress) {
    const target = animation.targets[0];
    if (!target) return;
    const start = animation.origin;
    const flight = Math.min(1, progress / 0.72);
    const eased = 1 - Math.pow(1 - flight, 2.5);
    const x = start.x + (target.x - start.x) * eased;
    const y = start.y + (target.y - start.y) * eased - Math.sin(Math.PI * eased) * 58;
    const nextRatio = Math.min(1, eased + 0.015);
    const nextX = start.x + (target.x - start.x) * nextRatio;
    const nextY = start.y + (target.y - start.y) * nextRatio - Math.sin(Math.PI * nextRatio) * 58;
    const angle = Math.atan2(nextY - y, nextX - x);

    if (flight < 1) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = Math.min(1, progress * 9);
      ctx.strokeStyle = "rgba(255, 224, 121, 0.5)";
      ctx.lineWidth = 6;
      ctx.shadowColor = "#ffb43d";
      ctx.shadowBlur = 15;
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.quadraticCurveTo((start.x + target.x) / 2, Math.min(start.y, target.y) - 78, x, y);
      ctx.stroke();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.fillStyle = "#ff8a2b";
      ctx.strokeStyle = "#fff0a6";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(18, 0);
      ctx.quadraticCurveTo(2, -9, -18, -5);
      ctx.lineTo(-18, 5);
      ctx.quadraticCurveTo(2, 9, 18, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#75dc69";
      for (let leaf = -1; leaf <= 1; leaf += 1) {
        ctx.save();
        ctx.rotate(leaf * 0.38);
        ctx.beginPath();
        ctx.ellipse(-22, 0, 10, 3.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();
    }

    if (progress > 0.56) {
      const impact = Math.min(1, (progress - 0.56) / 0.44);
      ctx.save();
      ctx.translate(target.x, target.y);
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = Math.sin(Math.PI * impact) * 0.95;
      ctx.strokeStyle = "#dfffb0";
      ctx.fillStyle = "rgba(105, 224, 116, 0.2)";
      ctx.lineWidth = 5 - impact * 2;
      ctx.shadowColor = "#79f27e";
      ctx.shadowBlur = 22;
      ctx.beginPath();
      ctx.arc(0, 0, 13 + impact * 34, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, -10, 20 + impact * 12, Math.PI * 1.08, Math.PI * 1.92);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawHartPeacemaker(ctx, animation, progress) {
    const centers = animation.targets.length ? animation.targets : [animation.origin];
    const pulse = Math.sin(progress * Math.PI * 5) * 0.5 + 0.5;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const center of centers) {
      const radius = 30 + progress * 18 + pulse * 4;
      ctx.globalAlpha = Math.max(0, 1 - progress * 0.7) * 0.72;
      ctx.fillStyle = "rgba(105, 255, 178, 0.12)";
      ctx.strokeStyle = "#b8ffd2";
      ctx.lineWidth = 4;
      ctx.shadowColor = "#65ff9f";
      ctx.shadowBlur = 22;
      ctx.beginPath();
      ctx.ellipse(center.x, center.y + 8, radius * 1.35, radius * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "#ffb3df";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(center.x, center.y + 8, radius * 0.82, radius * 0.32, 0, 0, Math.PI * 2);
      ctx.stroke();
      for (let note = 0; note < 5; note += 1) {
        const angle = progress * Math.PI * 2 + note * 1.25;
        const x = center.x + Math.cos(angle) * radius;
        const y = center.y - 8 + Math.sin(angle) * radius * 0.36 - progress * 22;
        ctx.globalAlpha = Math.max(0, 1 - progress) * 0.8;
        ctx.fillStyle = note % 2 ? "#baffcf" : "#ffd1ec";
        ctx.font = "bold 18px sans-serif";
        ctx.fillText(note % 2 ? "♪" : "♬", x, y);
      }
    }
    ctx.restore();
  }

  function drawSisselaChannel(ctx, animation, progress) {
    const origin = animation.origin;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const charge = Math.min(1, progress * 1.2);
    ctx.globalAlpha = 0.3 + charge * 0.55;
    ctx.fillStyle = "rgba(85, 39, 130, 0.28)";
    ctx.strokeStyle = "#d8b6ff";
    ctx.lineWidth = 3;
    ctx.shadowColor = "#9d5cff";
    ctx.shadowBlur = 26;
    ctx.beginPath();
    ctx.arc(origin.x, origin.y - 8, 22 + charge * 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    for (let ring = 0; ring < 3; ring += 1) {
      ctx.save();
      ctx.translate(origin.x, origin.y - 8);
      ctx.rotate(progress * (ring % 2 ? -4 : 4) + ring);
      ctx.globalAlpha = (0.85 - ring * 0.2) * charge;
      ctx.beginPath();
      ctx.ellipse(0, 0, 42 + ring * 13, 11 + ring * 4, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  function drawSisselaLiberation(ctx, animation, progress) {
    const origin = animation.origin;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const wave = 20 + progress * 260;
    ctx.globalAlpha = Math.max(0, 1 - progress) * 0.95;
    ctx.strokeStyle = "#f4e8ff";
    ctx.lineWidth = 7 - progress * 4;
    ctx.shadowColor = "#a45dff";
    ctx.shadowBlur = 30;
    ctx.beginPath();
    ctx.arc(origin.x, origin.y - 8, wave, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = "#72dcff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(origin.x, origin.y - 8, wave * 0.72, 0, Math.PI * 2);
    ctx.stroke();
    for (const target of animation.targets) {
      const local = Math.min(1, Math.max(0, progress * 1.4 - 0.25));
      ctx.globalAlpha = Math.sin(Math.PI * local) * 0.85;
      ctx.strokeStyle = "#e9d6ff";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(target.x, target.y, 8 + local * 26, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = Math.sin(Math.PI * local) * 0.38;
      ctx.fillStyle = "rgba(114, 220, 255, 0.2)";
      ctx.beginPath();
      ctx.ellipse(target.x, target.y + 4, 28 + local * 10, 11 + local * 4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawPriyaEarthEcho(ctx, animation, progress) {
    const origin = animation.origin;
    const maxRadius = Math.max(origin.x, origin.y, Math.abs(animation.width - origin.x), Math.abs(animation.height - origin.y)) + 90;
    const eased = 1 - Math.pow(1 - progress, 2.4);
    const radius = 18 + maxRadius * eased;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = Math.max(0, 1 - progress * 0.82);
    ctx.strokeStyle = "#dfffb3";
    ctx.lineWidth = 9 - progress * 4;
    ctx.shadowColor = "#a8ff6d";
    ctx.shadowBlur = 34;
    ctx.beginPath();
    ctx.arc(origin.x, origin.y + 4, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = Math.max(0, 1 - progress) * 0.55;
    ctx.strokeStyle = "#fff7c9";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(origin.x, origin.y + 4, radius * 0.72, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = Math.sin(Math.PI * progress) * 0.28;
    ctx.fillStyle = "rgba(145, 255, 130, 0.18)";
    ctx.beginPath();
    ctx.arc(origin.x, origin.y + 4, radius * 0.38, 0, Math.PI * 2);
    ctx.fill();
    for (const target of animation.targets) {
      const local = Math.min(1, Math.max(0, progress * 1.6 - 0.35));
      ctx.globalAlpha = Math.sin(Math.PI * local) * 0.8;
      ctx.strokeStyle = "#f4ffd5";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(target.x, target.y, 10 + local * 28, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawEmmaMagicHat(ctx, animation, progress) {
    const target = animation.targets[0];
    if (!target) return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    drawArcProjectile(ctx, animation.origin, target, Math.min(1, progress / 0.62), "#f5dcff", "#a86dff", 5, 34);
    const impact = Math.min(1, Math.max(0, (progress - 0.42) / 0.58));
    const alpha = Math.sin(Math.PI * impact);
    if (impact > 0) {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "rgba(142, 88, 255, 0.16)";
      ctx.strokeStyle = "#f5dcff";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(target.x, target.y, 14 + impact * 34, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      for (let star = 0; star < 10; star += 1) {
        const angle = progress * 3.4 + star * 0.628;
        const distance = 12 + impact * (22 + (star % 3) * 7);
        const x = target.x + Math.cos(angle) * distance;
        const y = target.y - 4 + Math.sin(angle) * distance * 0.72;
        const size = 3 + (star % 2) + impact * 1.5;
        ctx.fillStyle = star % 2 ? "#fff5a8" : "#f5dcff";
        ctx.beginPath();
        ctx.moveTo(x, y - size);
        ctx.lineTo(x + size * 0.4, y - size * 0.35);
        ctx.lineTo(x + size, y);
        ctx.lineTo(x + size * 0.4, y + size * 0.35);
        ctx.lineTo(x, y + size);
        ctx.lineTo(x - size * 0.4, y + size * 0.35);
        ctx.lineTo(x - size, y);
        ctx.lineTo(x - size * 0.4, y - size * 0.35);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawElenaDanseMacabre(ctx, animation, progress) {
    const center = animation.targets[0];
    if (!center) return;
    const targets = animation.targets.length ? animation.targets.slice(0, 4) : [center];
    const alpha = Math.sin(Math.PI * progress);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.translate(center.x, center.y + 8);
    ctx.globalAlpha = alpha * 0.72;
    ctx.fillStyle = "rgba(122, 214, 255, 0.14)";
    ctx.strokeStyle = "#dff8ff";
    ctx.lineWidth = 4;
    ctx.shadowColor = "#6fd9ff";
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.ellipse(0, 0, 52 + progress * 10, 20 + progress * 4, progress * 2.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    for (let blade = 0; blade < 4; blade += 1) {
      const angle = progress * 6 + (Math.PI * 2 * blade) / 4;
      const innerX = Math.cos(angle) * 22;
      const innerY = Math.sin(angle) * 8;
      const outerX = Math.cos(angle) * (55 + progress * 12);
      const outerY = Math.sin(angle) * (22 + progress * 5);
      ctx.beginPath();
      ctx.moveTo(innerX, innerY);
      ctx.lineTo(outerX, outerY);
      ctx.stroke();
    }

    ctx.globalAlpha = alpha * 0.48;
    ctx.strokeStyle = "#8fe8ff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(0, 0, 28 + progress * 18, 10 + progress * 7, -progress * 4.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    for (const target of targets) {
      ctx.save();
      ctx.translate(target.x, target.y + 8);
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = alpha * (target === center ? 0.95 : 0.62);
      ctx.strokeStyle = target === center ? "#f4fdff" : "#aeeeff";
      ctx.lineWidth = target === center ? 4 : 3;
      ctx.shadowColor = "#73dcff";
      ctx.shadowBlur = target === center ? 10 : 6;
      ctx.beginPath();
      ctx.arc(0, 0, target === center ? 24 + progress * 18 : 16 + progress * 12, 0, Math.PI * 2);
      ctx.stroke();
      for (let flake = 0; flake < 4; flake += 1) {
        const angle = progress * -5 + (Math.PI * 2 * flake) / 4;
        ctx.beginPath();
        ctx.moveTo(Math.cos(angle) * 5, Math.sin(angle) * 5);
        ctx.lineTo(Math.cos(angle) * (target === center ? 28 : 20), Math.sin(angle) * (target === center ? 28 : 20));
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  function drawHazeRocketLauncher(ctx, animation, progress) {
    const target = animation.targets[0];
    if (!target) return;
    const start = animation.origin;
    for (let shot = 0; shot < 4; shot += 1) {
      const local = (progress - shot * 0.16) / 0.42;
      if (local < 0 || local > 1) continue;
      const eased = 1 - Math.pow(1 - local, 3);
      const angle = Math.atan2(target.y - start.y, target.x - start.x);
      const offset = (shot - 1.5) * 7;
      const nx = -Math.sin(angle);
      const ny = Math.cos(angle);
      const x = start.x + (target.x - start.x) * eased + nx * offset;
      const y = start.y + (target.y - start.y) * eased + ny * offset - Math.sin(Math.PI * eased) * 12;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = Math.sin(Math.PI * local);
      ctx.strokeStyle = "rgba(255, 180, 80, 0.65)";
      ctx.lineWidth = 7;
      ctx.shadowColor = "#ff853d";
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.moveTo(start.x + nx * offset, start.y + ny * offset);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.fillStyle = "#ff5f3d";
      ctx.strokeStyle = "#fff0b8";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(18, 0);
      ctx.lineTo(-10, -7);
      ctx.lineTo(-17, 0);
      ctx.lineTo(-10, 7);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      if (local > 0.72) {
        const impact = (local - 0.72) / 0.28;
        ctx.save();
        ctx.translate(target.x, target.y);
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = Math.sin(Math.PI * impact) * 0.85;
        ctx.fillStyle = "rgba(255, 92, 53, 0.22)";
        ctx.strokeStyle = "#ffd15f";
        ctx.lineWidth = 5;
        ctx.shadowColor = "#ff633d";
        ctx.shadowBlur = 20;
        ctx.beginPath();
        ctx.arc(0, 0, 12 + impact * 26, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  function drawMartinaFastForward(ctx, animation, progress) {
    const impact = animation.targets[0];
    if (!impact) return;
    const start = { x: animation.origin.x, y: animation.origin.y - 8 };
    const end = { x: impact.x, y: impact.y - 10 };
    const beamAlpha = Math.max(0, 1 - progress / 0.34);
    if (beamAlpha > 0) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";
      ctx.shadowColor = "#ffd15f";
      ctx.shadowBlur = 26;
      ctx.globalAlpha = beamAlpha * 0.28;
      ctx.strokeStyle = "#ffb83d";
      ctx.lineWidth = 22;
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
      ctx.globalAlpha = beamAlpha * 0.72;
      ctx.strokeStyle = "#ffe05f";
      ctx.lineWidth = 13;
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
      ctx.globalAlpha = beamAlpha;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
      ctx.globalAlpha = beamAlpha * 0.32;
      ctx.fillStyle = "#fff5b8";
      ctx.beginPath();
      ctx.arc(start.x, start.y, 12 + progress * 26, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = beamAlpha * 0.38;
      ctx.fillStyle = "#fff1a8";
      ctx.beginPath();
      ctx.arc(end.x, end.y, 16 + progress * 38, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    const impactProgress = Math.max(0, Math.min(1, (progress - 0.56) / 0.44));
    if (impactProgress <= 0) return;
    for (const [index, target] of animation.targets.entries()) {
      const chain = Math.max(0, Math.min(1, (impactProgress - index * 0.1) / 0.72));
      if (chain <= 0) continue;
      const alpha = Math.sin(Math.PI * chain) * (index === 0 ? 0.9 : 0.62);
      if (index > 0) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = Math.max(0, 1 - chain) * 0.35;
        ctx.strokeStyle = "#ffef9a";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(impact.x, impact.y + 7);
        ctx.lineTo(target.x, target.y + 7);
        ctx.stroke();
        ctx.restore();
      }
      ctx.save();
      ctx.translate(target.x, target.y + 9);
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = index === 0 ? "#fff7c7" : "#ffd15f";
      ctx.fillStyle = index === 0 ? "rgba(255, 240, 168, 0.18)" : "rgba(255, 190, 77, 0.14)";
      ctx.lineWidth = index === 0 ? 6 : 4;
      ctx.shadowColor = "#ffd15f";
      ctx.shadowBlur = index === 0 ? 22 : 12;
      ctx.beginPath();
      ctx.ellipse(0, 0, 26 + chain * 24, 10 + chain * 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, 12 + chain * (index === 0 ? 32 : 22), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawMartinaRecording(ctx, animation, progress) {
    const targets = animation.targets.length ? animation.targets : [animation.target].filter(Boolean);
    const origin = animation.origin;
    const aim = targets[0] || { x: origin.x, y: origin.y - 120 };
    const angle = Math.atan2(aim.y - origin.y, aim.x - origin.x);
    const forward = { x: Math.cos(angle), y: Math.sin(angle) };
    const normal = { x: -forward.y, y: forward.x };
    const toWorld = (point) => ({
      x: origin.x + normal.x * point.x + forward.x * point.y,
      y: origin.y + normal.y * point.x * 0.72 + forward.y * point.y,
    });
    const pulse = (progress * 3) % 1;
    const reveal = Math.min(1, pulse * 1.35);
    const alpha = (0.28 + Math.sin(Math.PI * pulse) * 0.52) * (1 - progress * 0.18);
    const tip = toWorld({ x: 0, y: 178 * reveal });
    const leftNear = toWorld({ x: -28, y: 22 });
    const rightNear = toWorld({ x: 28, y: 22 });
    const leftFar = toWorld({ x: -112 * reveal, y: 146 * reveal });
    const rightFar = toWorld({ x: 112 * reveal, y: 146 * reveal });
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = alpha * 0.14;
    ctx.fillStyle = "#ffef9a";
    ctx.shadowColor = "#ffd15f";
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.moveTo(leftNear.x, leftNear.y);
    ctx.quadraticCurveTo(leftFar.x, leftFar.y, tip.x, tip.y);
    ctx.quadraticCurveTo(rightFar.x, rightFar.y, rightNear.x, rightNear.y);
    ctx.quadraticCurveTo(origin.x + forward.x * 30, origin.y + forward.y * 30, leftNear.x, leftNear.y);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = alpha * 0.42;
    ctx.strokeStyle = "#ffd15f";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(leftNear.x, leftNear.y);
    ctx.quadraticCurveTo(leftFar.x, leftFar.y, tip.x, tip.y);
    ctx.quadraticCurveTo(rightFar.x, rightFar.y, rightNear.x, rightNear.y);
    ctx.stroke();
    for (let line = 1; line <= 2; line += 1) {
      const width = 36 + line * 34;
      const start = toWorld({ x: -width * reveal, y: 58 + line * 42 });
      const end = toWorld({ x: width * reveal, y: 58 + line * 42 });
      ctx.globalAlpha = alpha * 0.5;
      ctx.strokeStyle = "#fff6cf";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
    }
    ctx.restore();
    for (const target of targets) {
      drawImpactRing(ctx, target, pulse, "#ffe28a", "#ffd15f", 20);
    }
  }

  function drawIsolSemtexThrow(ctx, animation, progress) {
    const target = animation.targets[0];
    if (!target) return;
    drawArcProjectile(ctx, animation.origin, target, Math.min(1, progress / 0.72), "#f6ff9b", "#ff8d3d", 5, 22);
    const local = Math.max(0, (progress - 0.58) / 0.42);
    if (local <= 0) return;
    const pulse = Math.sin(Math.PI * local);
    ctx.save();
    ctx.translate(target.x, target.y - 18);
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.72 + pulse * 0.25;
    ctx.fillStyle = "rgba(255, 77, 50, 0.35)";
    ctx.strokeStyle = "#fff1a6";
    ctx.lineWidth = 3;
    ctx.shadowColor = "#ff6b3d";
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.arc(0, 0, 9 + pulse * 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = "#ff6b3d";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-13, 0);
    ctx.lineTo(13, 0);
    ctx.moveTo(0, -13);
    ctx.lineTo(0, 13);
    ctx.stroke();
    ctx.restore();
  }

  function drawIsolSemtexExplosion(ctx, animation, progress) {
    const center = animation.targets[0] || animation.origin;
    const shock = Math.min(1, progress / 0.72);
    const flare = Math.sin(Math.PI * shock);
    const x = center.x;
    const y = center.y - 8;
    const burstRadius = 26 + shock * 64;
    ctx.save();
    ctx.translate(x, y);
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = flare;
    ctx.fillStyle = "rgba(255, 90, 47, 0.38)";
    ctx.strokeStyle = "#fff0a8";
    ctx.lineWidth = Math.max(2, 7 - shock * 4);
    ctx.shadowColor = "#ff6b35";
    ctx.shadowBlur = 26;
    ctx.beginPath();
    for (let point = 0; point <= 14; point += 1) {
      const angle = (Math.PI * 2 * point) / 14;
      const radius = burstRadius * (point % 2 ? 0.52 : 1);
      const px = Math.cos(angle) * radius;
      const py = Math.sin(angle) * radius * 0.72;
      if (point === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.globalAlpha = flare * 0.72;
    ctx.fillStyle = "rgba(255, 244, 186, 0.78)";
    ctx.beginPath();
    ctx.arc(0, 0, 8 + shock * 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = Math.max(0, 1 - shock) * 0.72;
    ctx.strokeStyle = "#ffb347";
    ctx.lineWidth = Math.max(2, 10 - shock * 6);
    ctx.beginPath();
    ctx.arc(0, 0, 24 + shock * 82, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = Math.max(0, shock - 0.24) * 0.18;
    ctx.fillStyle = "#3a3230";
    for (let puff = 0; puff < 5; puff += 1) {
      const angle = (Math.PI * 2 * puff) / 5 + 0.35;
      const distance = 20 + shock * (28 + puff * 5);
      ctx.beginPath();
      ctx.arc(Math.cos(angle) * distance, Math.sin(angle) * distance * 0.55, 14 + shock * 10, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = Math.max(0, 1 - shock) * 0.82;
    ctx.strokeStyle = "#ffd15f";
    ctx.lineWidth = 4;
    const shards = effectParticleCount(18);
    for (let index = 0; index < shards; index += 1) {
      const angle = (Math.PI * 2 * index) / shards + 0.24;
      const inner = 18 + shock * 22;
      const outer = 34 + shock * 86;
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner * 0.62);
      ctx.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer * 0.62);
      ctx.stroke();
    }
    ctx.restore();
    for (const target of animation.targets.slice(1)) {
      drawImpactRing(ctx, target, shock, "#ffd66b", "#ff8a35", 30);
    }
  }

  function drawKatjaSnipingAim(ctx, animation, progress) {
    const targets = animation.targets.length ? animation.targets : [animation.target].filter(Boolean);
    const pulse = Math.sin(progress * Math.PI * 5) * 0.5 + 0.5;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const target of targets) {
      ctx.globalAlpha = 0.24 + pulse * 0.18;
      ctx.strokeStyle = "#ffdf7a";
      ctx.lineWidth = 1.5;
      ctx.shadowColor = "#ffbd45";
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(animation.origin.x, animation.origin.y - 18);
      ctx.lineTo(target.x, target.y - 10);
      ctx.stroke();
      ctx.globalAlpha = 0.78;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(target.x, target.y - 10, 16 + pulse * 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#fff2bc";
      ctx.beginPath();
      ctx.moveTo(target.x - 26, target.y - 10);
      ctx.lineTo(target.x - 8, target.y - 10);
      ctx.moveTo(target.x + 8, target.y - 10);
      ctx.lineTo(target.x + 26, target.y - 10);
      ctx.moveTo(target.x, target.y - 36);
      ctx.lineTo(target.x, target.y - 18);
      ctx.moveTo(target.x, target.y - 2);
      ctx.lineTo(target.x, target.y + 16);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawKatjaSnipingShot(ctx, animation, progress) {
    const targets = animation.targets.length ? animation.targets : [animation.target].filter(Boolean);
    for (const [index, target] of targets.entries()) {
      const local = Math.max(0, Math.min(1, (progress - index * 0.08) / 0.5));
      if (local <= 0) continue;
      const start = { x: animation.origin.x, y: animation.origin.y - 12 };
      const end = { x: target.x, y: target.y - 8 };
      const impactTarget = animation.impactTargets?.[index] || target;
      const impact = { x: impactTarget.x, y: impactTarget.y - 8 };
      const impactAt = projectionProgress(start, end, impact);
      const angle = Math.atan2(end.y - start.y, end.x - start.x);
      const side = (index - (targets.length - 1) / 2) * 6;
      const sideX = Math.cos(angle + Math.PI / 2) * side;
      const sideY = Math.sin(angle + Math.PI / 2) * side;
      const alpha = Math.min(1, local * 10) * Math.max(0, 1.16 - local * 0.35);
      if (local <= impactAt) {
        const eased = Math.min(impactAt, 1 - Math.pow(1 - local, 3));
        const head = {
          x: start.x + (end.x - start.x) * eased + sideX,
          y: start.y + (end.y - start.y) * eased + sideY - Math.sin(Math.PI * eased) * 2,
        };
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.lineCap = "round";
        ctx.shadowColor = "#ffbd45";
        ctx.shadowBlur = 24;
        ctx.globalAlpha = alpha * 0.36;
        ctx.strokeStyle = "#ffbd45";
        ctx.lineWidth = 17;
        ctx.beginPath();
        ctx.moveTo(start.x + sideX, start.y + sideY);
        ctx.lineTo(head.x, head.y);
        ctx.stroke();
        ctx.globalAlpha = alpha * 0.88;
        ctx.strokeStyle = "#fff3b0";
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.moveTo((start.x + head.x) / 2, (start.y + head.y) / 2);
        ctx.lineTo(head.x, head.y);
        ctx.stroke();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.ellipse(head.x, head.y, 12, 5, angle, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      if (local > 0.06 && local < 0.86) {
        const flash = Math.sin(Math.PI * local);
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = flash * 0.38;
        ctx.strokeStyle = "#fff1a8";
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
        ctx.restore();
      }
      if (local >= impactAt) drawImpactRing(ctx, impactTarget, Math.min(1, (local - impactAt) / Math.max(0.12, 1 - impactAt)), "#fff1a8", "#ffbd45", 34);
    }
  }

  function drawJustynaLaserBarrage(ctx, animation, progress) {
    const targets = animation.targets.length ? animation.targets : [animation.target].filter(Boolean);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const [index, target] of targets.entries()) {
      const local = Math.max(0, Math.min(1, (progress - index * 0.18) / 0.5));
      if (local <= 0 || local >= 1) continue;
      const alpha = Math.sin(Math.PI * local);
      const angle = Math.atan2(target.y - animation.origin.y, target.x - animation.origin.x);
      const nx = -Math.sin(angle) * 3;
      const ny = Math.cos(angle) * 3;
      ctx.shadowColor = "#ffe047";
      ctx.shadowBlur = 20;
      ctx.globalAlpha = alpha * 0.16;
      ctx.strokeStyle = "#ffef9a";
      ctx.lineWidth = 13;
      ctx.beginPath();
      ctx.moveTo(animation.origin.x + nx, animation.origin.y - 12 + ny);
      ctx.lineTo(target.x + nx, target.y - 8 + ny);
      ctx.stroke();
      ctx.globalAlpha = alpha * 0.78;
      ctx.strokeStyle = "#ffe047";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(animation.origin.x + nx, animation.origin.y - 12 + ny);
      ctx.lineTo(target.x + nx, target.y - 8 + ny);
      ctx.stroke();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(animation.origin.x - nx, animation.origin.y - 12 - ny);
      ctx.lineTo(target.x - nx, target.y - 8 - ny);
      ctx.stroke();
      drawImpactRing(ctx, target, local, "#fff1a8", "#ffe047", 18);
    }
    ctx.restore();
  }

  function drawArcProjectile(ctx, start, target, progress, color, glow, width = 4, lift = 22) {
    const eased = 1 - Math.pow(1 - Math.min(1, progress), 3);
    const x = start.x + (target.x - start.x) * eased;
    const y = start.y + (target.y - start.y) * eased - Math.sin(Math.PI * eased) * lift;
    const angle = Math.atan2(target.y - start.y, target.x - start.x);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = Math.min(1, progress * 8) * Math.max(0, 1.15 - progress);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.shadowColor = glow;
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(-10, -2, 22, 4);
    ctx.restore();
  }

  function drawImpactRing(ctx, target, progress, color, glow, radius = 28) {
    ctx.save();
    ctx.translate(target.x, target.y);
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = Math.sin(Math.PI * progress);
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.shadowColor = glow;
    ctx.shadowBlur = 20;
    ctx.beginPath();
    ctx.arc(0, 0, 8 + progress * radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawVortex(ctx, center, progress, options = {}) {
    const {
      radius = 46,
      height = 0.62,
      vertical = 0,
      waist = 0.34,
      arms = 4,
      turns = 2.4,
      color = "#dffcff",
      accent = "#4df4d2",
      glow = "#42eaff",
      rotation = 0,
      alpha = 1,
      segments = 26,
      body = true,
      rings = true,
    } = options;
    ctx.save();
    ctx.translate(center.x, center.y);
    ctx.globalCompositeOperation = "lighter";
    ctx.shadowColor = glow;
    ctx.shadowBlur = 24;
    for (let arm = 0; arm < arms; arm += 1) {
      const base = rotation + progress * Math.PI * 6 + (Math.PI * 2 * arm) / arms;
      ctx.beginPath();
      for (let step = 0; step <= segments; step += 1) {
        const ratio = step / segments;
        const angle = base + ratio * Math.PI * 2 * turns;
        const funnel = vertical > 0
          ? (0.92 - Math.sin(Math.PI * ratio) * waist + ratio * 0.24)
          : (1 - ratio * 0.72);
        const localRadius = radius * funnel * (0.78 + Math.sin(progress * Math.PI) * 0.22);
        const x = Math.cos(angle) * localRadius;
        const y = Math.sin(angle) * localRadius * height - ratio * vertical;
        if (step === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.globalAlpha = alpha * (0.35 + arm * 0.11);
      ctx.strokeStyle = arm % 2 ? accent : color;
      ctx.lineWidth = arm % 2 ? 3 : 5;
      ctx.stroke();
    }
    ctx.globalAlpha = alpha * 0.36;
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.ellipse(0, 4, radius * 0.65, radius * height * 0.28, progress * 5, 0, Math.PI * 2);
    ctx.fill();
    if (vertical > 0 && body) {
      ctx.globalAlpha = alpha * 0.16;
      ctx.fillStyle = "rgba(90, 255, 235, 0.12)";
      ctx.beginPath();
      ctx.moveTo(-radius * 0.58, 6);
      ctx.quadraticCurveTo(-radius * 0.12, -vertical * 0.5, -radius * 0.32, -vertical);
      ctx.lineTo(radius * 0.32, -vertical);
      ctx.quadraticCurveTo(radius * 0.12, -vertical * 0.5, radius * 0.58, 6);
      ctx.closePath();
      ctx.fill();
    }
    if (vertical > 0 && rings) {
      ctx.globalAlpha = alpha * 0.58;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, -vertical * 0.96, radius * 0.42, radius * height * 0.16, progress * 7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = alpha * 0.42;
      ctx.beginPath();
      ctx.ellipse(0, -vertical * 0.48, radius * 0.22, radius * height * 0.09, -progress * 9, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawBerniceSnareTrap(ctx, animation, progress) {
    const target = animation.targets[0];
    if (!target) return;
    const arm = Math.min(1, progress * 1.8);
    if (progress < 0.72) drawArcProjectile(ctx, animation.origin, target, arm, "#ffd181", "#ff8a33", 4, 12);
    const trap = Math.min(1, Math.max(0, (progress - 0.34) / 0.66));
    ctx.save();
    ctx.translate(target.x, target.y + 4);
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = Math.sin(Math.PI * trap) * 0.95;
    ctx.strokeStyle = "#ffe0a3";
    ctx.lineWidth = 4;
    ctx.shadowColor = "#ff7a2e";
    ctx.shadowBlur = 20;
    ctx.beginPath();
    ctx.ellipse(0, 0, 34 + trap * 8, 15 + trap * 4, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = "#ff7b4c";
    for (let index = 0; index < 6; index += 1) {
      const angle = (Math.PI * 2 * index) / 6 + trap * 1.5;
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * 10, Math.sin(angle) * 5);
      ctx.lineTo(Math.cos(angle) * 44, Math.sin(angle) * 20);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawRioKaeyumi(ctx, animation, progress) {
    const target = animation.targets[0];
    if (!target) return;
    drawArcProjectile(ctx, animation.origin, target, Math.min(1, progress / 0.72), "#d9ffab", "#7dff6c", 3, 28);
    drawArcProjectile(ctx, animation.origin, target, Math.max(0, (progress - 0.2) / 0.8), "#9fffd1", "#4de8a2", 5, 40);
    if (progress > 0.64) drawImpactRing(ctx, target, (progress - 0.64) / 0.36, "#eaffc7", "#8dff65", 30);
  }

  function drawCelinePlasmaArm(ctx, animation, progress) {
    const target = animation.targets[0];
    if (!target) return;
    drawArcProjectile(ctx, animation.origin, target, Math.min(1, progress * 1.4), "#ffc46b", "#ff4b35", 5, 14);
    const mark = Math.min(1, Math.max(0, progress - 0.35) / 0.65);
    ctx.save();
    ctx.translate(target.x, target.y);
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = Math.sin(Math.PI * mark) * 0.9;
    ctx.strokeStyle = "#ffef9d";
    ctx.lineWidth = 3;
    ctx.shadowColor = "#ff4c34";
    ctx.shadowBlur = 18;
    ctx.rotate(mark * 5);
    ctx.strokeRect(-18, -18, 36, 36);
    ctx.restore();
  }

  function drawCelinePlasmaBomb(ctx, animation, progress) {
    const centers = animation.targets.length ? animation.targets : [animation.origin];
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const center of centers) {
      ctx.globalAlpha = Math.max(0, 1 - progress) * 0.92;
      ctx.fillStyle = "rgba(255, 86, 36, 0.28)";
      ctx.strokeStyle = "#ffe56f";
      ctx.lineWidth = 7 - progress * 4;
      ctx.shadowColor = "#ff4a2e";
      ctx.shadowBlur = 28;
      ctx.beginPath();
      ctx.arc(center.x, center.y, 18 + progress * 72, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(center.x, center.y, 7 + progress * 38, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawTiaPerfectDrawing(ctx, animation, progress) {
    const centers = animation.targets.length ? animation.targets : [animation.origin];
    const palette = ["#ff5f8d", "#ffe76b", "#75d6ff", "#9cff87", "#c89bff"];
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const center of centers) {
      for (let index = 0; index < 14; index += 1) {
        const angle = (Math.PI * 2 * index) / 14 + progress * 1.8;
        const distance = 12 + progress * (34 + (index % 4) * 8);
        ctx.globalAlpha = Math.sin(Math.PI * progress) * 0.75;
        ctx.fillStyle = palette[index % palette.length];
        ctx.shadowColor = palette[index % palette.length];
        ctx.shadowBlur = 15;
        ctx.beginPath();
        ctx.arc(center.x + Math.cos(angle) * distance, center.y + Math.sin(angle) * distance * 0.55, 5 + (index % 3) * 2, 0, Math.PI * 2);
        ctx.fill();
      }
      drawImpactRing(ctx, center, progress, "#fff8cf", "#ff66b3", 42);
    }
    ctx.restore();
  }

  function drawXiukaiHotTaste(ctx, animation, progress) {
    const origin = animation.origin;
    ctx.save();
    ctx.translate(origin.x, origin.y);
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = Math.sin(Math.PI * progress) * 0.88;
    ctx.strokeStyle = "#ffe06f";
    ctx.lineWidth = 5;
    ctx.shadowColor = "#ff6534";
    ctx.shadowBlur = 26;
    for (let ring = 0; ring < 3; ring += 1) {
      ctx.beginPath();
      ctx.ellipse(0, 6, 24 + ring * 14 + progress * 12, 11 + ring * 4, progress * 4 + ring, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(255, 92, 31, 0.26)";
    ctx.beginPath();
    ctx.arc(0, 0, 18 + progress * 38, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawXiukaiFlame(ctx, animation, progress) {
    const targets = animation.targets.length ? animation.targets : [{ x: animation.origin.x + 70, y: animation.origin.y }];
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const target of targets) {
      drawArcProjectile(ctx, animation.origin, target, Math.min(1, progress * 1.35), "#ffbf50", "#ff4f2e", 7, 8);
      if (progress > 0.45) drawImpactRing(ctx, target, (progress - 0.45) / 0.55, "#ffd96d", "#ff552c", 24);
    }
    ctx.restore();
  }

  function drawZahirVayvayastra(ctx, animation, progress) {
    const rawTarget = animation.targets[0];
    if (!rawTarget) return;
    const start = {
      x: animation.origin.x,
      y: animation.origin.y + 18,
    };
    const target = {
      x: rawTarget.x,
      y: rawTarget.y + 16,
    };
    const dx = target.x - start.x;
    const dy = target.y - start.y;
    const angle = Math.atan2(dy, dx);
    const length = Math.hypot(dx, dy) || 1;
    const unitX = dx / length;
    const unitY = dy / length;
    const summonPoint = {
      x: start.x + unitX * 26,
      y: start.y + unitY * 26 - 8,
    };
    const travelStart = Math.min(1, progress / 0.24);
    const travel = Math.min(1, Math.max(0, (progress - 0.18) / 0.62));
    const easedTravel = travel < 0.5
      ? 2 * travel * travel
      : 1 - Math.pow(-2 * travel + 2, 2) / 2;
    const center = {
      x: summonPoint.x + (target.x - summonPoint.x) * easedTravel,
      y: summonPoint.y + (target.y - summonPoint.y) * easedTravel - Math.sin(Math.PI * easedTravel) * 18,
    };
    const visibleAlpha = Math.min(1, progress * 7) * Math.max(0, 1.2 - progress * 0.35) * 0.58;

    drawVortex(ctx, summonPoint, progress, {
      radius: 12 + travelStart * 17,
      height: 0.42,
      vertical: 39,
      waist: 0.46,
      arms: 3,
      turns: 2.35,
      rings: false,
      segments: 22,
      color: "#eaffff",
      accent: "#5affea",
      glow: "#42eaff",
      rotation: angle,
      alpha: Math.sin(Math.PI * Math.min(1, travelStart)) * Math.max(0, 1 - travel * 0.9),
    });

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.shadowColor = "#43eaff";
    ctx.shadowBlur = 20;
    for (let trail = 2; trail >= 1; trail -= 1) {
      const ratio = Math.max(0, easedTravel - trail * 0.075);
      const ghost = {
        x: summonPoint.x + (target.x - summonPoint.x) * ratio,
        y: summonPoint.y + (target.y - summonPoint.y) * ratio - Math.sin(Math.PI * ratio) * 18,
      };
      drawVortex(ctx, ghost, progress + trail * 0.07, {
        radius: 23 - trail * 2,
        height: 0.4,
        vertical: 32,
        waist: 0.44,
      arms: 2,
      turns: 1.8,
      segments: 12,
      body: false,
      rings: false,
        color: "#c7fbff",
        accent: "#46e6d8",
        glow: "#38d4e8",
        rotation: angle,
        alpha: visibleAlpha * (0.1 + (2 - trail) * 0.05) * travel,
      });
    }
    ctx.restore();

    drawVortex(ctx, center, progress, {
      radius: 26 + Math.sin(progress * Math.PI * 8) * 2,
      height: 0.42,
      vertical: 48,
      waist: 0.5,
      arms: 3,
      turns: 2.45,
      segments: 18,
      color: "#f2ffff",
      accent: "#5dffeb",
      glow: "#43eaff",
      rotation: angle,
      alpha: visibleAlpha,
    });

    ctx.save();
    ctx.translate(center.x, center.y + 7);
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = visibleAlpha * 0.28;
    ctx.strokeStyle = "#bffcff";
    ctx.lineWidth = 3;
    ctx.shadowColor = "#3fdff1";
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.ellipse(0, 0, 22 + Math.sin(progress * 18) * 2, 8, progress * 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    for (const hitPoint of animation.targets) {
      const hit = {
        x: hitPoint.x,
        y: hitPoint.y + 16,
      };
      const local = Math.min(1, Math.max(0, (progress - 0.68) / 0.32));
      if (local > 0) {
        drawVortex(ctx, hit, local, {
          radius: 28,
          height: 0.42,
          vertical: 52,
          waist: 0.52,
          arms: 3,
          turns: 2.35,
          segments: 18,
          color: "#eaffff",
          accent: "#58f3ff",
          glow: "#42eaff",
          rotation: angle,
          alpha: Math.sin(Math.PI * local) * 0.62,
        });
        drawImpactRing(ctx, hit, local, "#eaffff", "#42eaff", 18);
      }
    }
  }

  function drawLukeObsession(ctx, animation, progress) {
    const center = animation.origin;
    ctx.save();
    ctx.translate(center.x, center.y);
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = Math.sin(Math.PI * progress) * 0.86;
    ctx.strokeStyle = "#d7f7ff";
    ctx.lineWidth = 5;
    ctx.shadowColor = "#6edcff";
    ctx.shadowBlur = 22;
    for (let arc = 0; arc < 3; arc += 1) {
      ctx.beginPath();
      ctx.arc(0, 0, 28 + arc * 13, progress * 6 + arc, progress * 6 + arc + Math.PI * 1.25);
      ctx.stroke();
    }
    ctx.restore();
    for (const target of animation.targets) drawImpactRing(ctx, target, progress, "#effcff", "#6edcff", 20);
  }

  function drawAbigailHorizonCleave(ctx, animation, progress) {
    const center = animation.origin;
    const drawSweep = (local, direction, radius, color, glow, widthOffset = 0) => {
      if (local <= 0 || local >= 1.06) return;
      const reveal = Math.min(1, local * 1.35);
      const fade = Math.max(0, 1 - Math.max(0, local - 0.64) / 0.36);
      const alpha = Math.sin(Math.PI * Math.min(1, local)) * fade;
      const start = direction - Math.PI * 0.82;
      const end = direction + Math.PI * 0.82;
      const steps = 36;
      const visibleSteps = Math.max(2, Math.floor(steps * reveal));
      const drawArc = (arcRadius, yScale, strokeColor, strokeWidth, strokeAlpha, lift = 0) => {
        ctx.beginPath();
        for (let step = 0; step <= visibleSteps; step += 1) {
          const ratio = step / steps;
          const theta = start + (end - start) * ratio;
          const x = center.x + Math.cos(theta) * arcRadius;
          const y = center.y + Math.sin(theta) * arcRadius * yScale - lift;
          if (step === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = strokeWidth;
        ctx.globalAlpha = strokeAlpha;
        ctx.shadowColor = glow;
        ctx.shadowBlur = 20;
        ctx.stroke();
      };

      drawArc(radius + widthOffset, 0.58, glow, 18, alpha * 0.18, 6);
      drawArc(radius - 8 + widthOffset, 0.56, color, 8, alpha * 0.72, 6);
      drawArc(radius - 18 + widthOffset, 0.54, "#fff8fb", 3, alpha * 0.98, 6);
    };

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const first = Math.min(1, progress / 0.58);
    const second = Math.min(1, Math.max(0, progress - 0.28) / 0.58);
    drawSweep(first, -Math.PI * 0.12, 158, "#ff7d9f", "#ff2e68", 0);
    drawSweep(first, -Math.PI * 0.1, 118, "#ffd2df", "#ff5d86", -4);
    drawSweep(second, Math.PI * 1.08, 166, "#a7e8ff", "#47cfff", 0);
    drawSweep(second, Math.PI * 1.06, 126, "#ecfbff", "#7de6ff", -4);
    ctx.restore();
    drawImpactRing(ctx, center, Math.min(1, progress * 1.15), "#ffe9f1", "#ff4779", 44);
    if (progress > 0.2) {
      const impact = Math.min(1, (progress - 0.2) / 0.62);
      for (const target of animation.targets) drawImpactRing(ctx, target, impact, "#ffd7e3", "#ff5d86", 18);
    }
  }

  function drawDarkoForcedCapture(ctx, animation, progress) {
    const target = animation.targets[0];
    if (!target) return;
    const origin = animation.origin;
    const pull = Math.min(1, progress * 1.35);
    const alpha = Math.sin(Math.PI * Math.min(1, progress)) * 0.9;
    const lift = Math.sin(Math.PI * Math.min(1, progress / 0.86));
    ctx.save();
    ctx.globalAlpha = 0.24 * lift;
    ctx.fillStyle = "#000000";
    ctx.beginPath();
    ctx.ellipse(target.x, target.y + 17, 24 + pull * 15, 8 + pull * 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    ctx.shadowColor = "#ff534a";
    ctx.shadowBlur = 24;
    const mid = {
      x: (origin.x + target.x) / 2,
      y: Math.min(origin.y, target.y) - 76,
    };
    for (let chain = 0; chain < 2; chain += 1) {
      const offset = chain ? 11 : -11;
      const wrapY = target.y - 10 - lift * 36;
      ctx.globalAlpha = alpha * (chain ? 0.9 : 0.5);
      ctx.strokeStyle = chain ? "#ffe0c8" : "#ff514a";
      ctx.lineWidth = chain ? 3 : 7;
      ctx.beginPath();
      ctx.moveTo(origin.x, origin.y - 8 + offset * 0.2);
      ctx.quadraticCurveTo(mid.x, mid.y + offset, target.x, wrapY - offset * 0.2);
      ctx.stroke();
    }
    for (let link = 0; link < 8; link += 1) {
      const local = Math.max(0, Math.min(1, pull - link * 0.055));
      const point = pointAt(origin, { x: target.x, y: target.y - 34 }, local, 56);
      ctx.globalAlpha = alpha * 0.72;
      ctx.fillStyle = link % 2 ? "#ffd7bd" : "#ff716b";
      ctx.fillRect(point.x - 5, point.y - 4, 10, 8);
    }
    const lifted = { x: target.x, y: target.y - 28 - lift * 28 };
    ctx.globalAlpha = alpha * 0.84;
    ctx.strokeStyle = "#fff0d5";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(lifted.x - 24, lifted.y - 6);
    ctx.lineTo(lifted.x + 24, lifted.y - 6);
    ctx.moveTo(lifted.x - 19, lifted.y + 8);
    ctx.lineTo(lifted.x + 19, lifted.y + 8);
    ctx.stroke();
    ctx.restore();
    drawImpactRing(ctx, { x: target.x, y: target.y - 28 - lift * 28 }, progress, "#ffd0b5", "#ff4f48", 34);
  }

  function drawDarkoForcedImpact(ctx, animation, progress) {
    const center = animation.targets[0] || animation.origin;
    const alpha = Math.max(0, 1 - progress) * 0.9;
    const drop = Math.max(0, 1 - progress * 1.4);
    ctx.save();
    ctx.globalAlpha = 0.26 * Math.max(0, 1 - progress);
    ctx.fillStyle = "#000000";
    ctx.beginPath();
    ctx.ellipse(center.x, center.y + 17, 18 + progress * 54, 5 + progress * 18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    if (drop > 0) {
      ctx.globalAlpha = drop * 0.74;
      ctx.strokeStyle = "#ffe4ca";
      ctx.lineWidth = 5;
      ctx.shadowColor = "#ff534a";
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.moveTo(center.x - 18, center.y - 92 * drop);
      ctx.lineTo(center.x, center.y - 34 * drop);
      ctx.lineTo(center.x + 18, center.y - 92 * drop);
      ctx.stroke();
    }
    ctx.globalAlpha = Math.sin(Math.PI * progress) * 0.16;
    ctx.fillStyle = "#ff4f48";
    ctx.beginPath();
    ctx.arc(center.x, center.y + 4, 34 + progress * 86, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = "#ffcaa8";
    ctx.lineWidth = Math.max(2, 9 - progress * 5);
    ctx.shadowColor = "#ff534a";
    ctx.shadowBlur = 20;
    ctx.beginPath();
    ctx.arc(center.x, center.y + 4, 34 + progress * 86, 0, Math.PI * 2);
    ctx.stroke();
    for (let spike = 0; spike < 10; spike += 1) {
      const angle = (Math.PI * 2 * spike) / 10 + progress * 0.35;
      const inner = 22 + progress * 18;
      const outer = 58 + progress * 62;
      ctx.globalAlpha = alpha * 0.68;
      ctx.strokeStyle = spike % 2 ? "#ff7b72" : "#ffe0c8";
      ctx.lineWidth = spike % 2 ? 3 : 2;
      ctx.beginPath();
      ctx.moveTo(center.x + Math.cos(angle) * inner, center.y + Math.sin(angle) * inner * 0.58);
      ctx.lineTo(center.x + Math.cos(angle) * outer, center.y + Math.sin(angle) * outer * 0.58);
      ctx.stroke();
    }
    ctx.restore();
    for (const target of animation.targets) drawImpactRing(ctx, target, progress, "#ffd0b5", "#ff4f48", 20);
  }

  function drawSilviaSpeedGun(ctx, animation, progress) {
    const target = animation.targets[0];
    if (!target) return;
    drawArcProjectile(ctx, animation.origin, target, Math.min(1, progress * 1.2), "#fff5a8", "#ffe14d", 5, 18);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const ally of animation.targets.slice(1)) {
      ctx.globalAlpha = Math.sin(Math.PI * progress) * 0.72;
      ctx.strokeStyle = "#b8ffd8";
      ctx.lineWidth = 3;
      ctx.shadowColor = "#6cff9e";
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.arc(ally.x, ally.y, 12 + progress * 26, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawBiancaReign(ctx, animation, progress) {
    const origin = animation.origin;
    const maxRadius = Math.max(origin.x, origin.y, Math.abs(animation.width - origin.x), Math.abs(animation.height - origin.y)) + 60;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = Math.max(0, 1 - progress * 0.78) * 0.82;
    ctx.fillStyle = "rgba(122, 12, 52, 0.18)";
    ctx.strokeStyle = "#ff7aa8";
    ctx.lineWidth = 8 - progress * 4;
    ctx.shadowColor = "#ff356f";
    ctx.shadowBlur = 30;
    ctx.beginPath();
    ctx.arc(origin.x, origin.y, 24 + maxRadius * progress, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    for (const target of animation.targets) {
      ctx.globalAlpha = Math.sin(Math.PI * progress) * 0.92;
      ctx.fillStyle = "rgba(255, 46, 105, 0.24)";
      ctx.strokeStyle = "#ffd1df";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.ellipse(target.x, target.y + 4, 28 + progress * 16, 13 + progress * 8, progress * 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  function draw(now) {
    const layout = ensureCanvas();
    if (!layout || !context) {
      frame = 0;
      return;
    }
    context.clearRect(0, 0, layout.width, layout.height);
    for (let index = animations.length - 1; index >= 0; index -= 1) {
      const animation = animations[index];
      const progress = Math.min(1, (now - animation.startedAt) / animation.duration);
      if (animation.type === "yuki-bloom") drawBloom(context, animation, progress);
      else if (animation.type === "hisui-tsubame-gaeshi") drawHisuiTsubameGaeshi(context, animation, progress);
      else if (animation.type === "fate-absorb") drawFateAbsorb(context, animation, progress);
      else if (animation.type === "nadine-wolf") drawNadineWolf(context, animation, progress);
      else if (animation.type === "cathy-needle") drawCathyNeedle(context, animation, progress);
      else if (animation.type === "rozzi-double-shot") drawRozziDoubleShot(context, animation, progress);
      else if (animation.type === "aya-double-burst") drawAyaDoubleBurst(context, animation, progress);
      else if (animation.type === "shoichi-dagger-ride") drawShoichiDaggerRide(context, animation, progress);
      else if (animation.type === "shoichi-seven-elixir") drawShoichiSevenElixir(context, animation, progress);
      else if (animation.type === "leni-carrot-bazooka") drawLeniCarrotBazooka(context, animation, progress);
      else if (animation.type === "hart-peacemaker") drawHartPeacemaker(context, animation, progress);
      else if (animation.type === "sissela-channel") drawSisselaChannel(context, animation, progress);
      else if (animation.type === "sissela-liberation") drawSisselaLiberation(context, animation, progress);
      else if (animation.type === "elena-danse-macabre") drawElenaDanseMacabre(context, animation, progress);
      else if (animation.type === "priya-earth-echo") drawPriyaEarthEcho(context, animation, progress);
      else if (animation.type === "emma-magic-hat") drawEmmaMagicHat(context, animation, progress);
      else if (animation.type === "haze-rocket-launcher") drawHazeRocketLauncher(context, animation, progress);
      else if (animation.type === "isol-semtex-throw") drawIsolSemtexThrow(context, animation, progress);
      else if (animation.type === "isol-semtex-explosion") drawIsolSemtexExplosion(context, animation, progress);
      else if (animation.type === "martina-fast-forward") drawMartinaFastForward(context, animation, progress);
      else if (animation.type === "katja-sniping-aim") drawKatjaSnipingAim(context, animation, progress);
      else if (animation.type === "katja-sniping-shot") drawKatjaSnipingShot(context, animation, progress);
      else if (animation.type === "justyna-laser-barrage") drawJustynaLaserBarrage(context, animation, progress);
      else if (animation.type === "bernice-snare-trap") drawBerniceSnareTrap(context, animation, progress);
      else if (animation.type === "rio-kaeyumi") drawRioKaeyumi(context, animation, progress);
      else if (animation.type === "celine-plasma-arm") drawCelinePlasmaArm(context, animation, progress);
      else if (animation.type === "celine-plasma-bomb") drawCelinePlasmaBomb(context, animation, progress);
      else if (animation.type === "tia-perfect-drawing") drawTiaPerfectDrawing(context, animation, progress);
      else if (animation.type === "xiukai-hot-taste") drawXiukaiHotTaste(context, animation, progress);
      else if (animation.type === "xiukai-flame") drawXiukaiFlame(context, animation, progress);
      else if (animation.type === "zahir-vayvayastra") drawZahirVayvayastra(context, animation, progress);
      else if (animation.type === "abigail-horizon-cleave") drawAbigailHorizonCleave(context, animation, progress);
      else if (animation.type === "darko-forced-capture") drawDarkoForcedCapture(context, animation, progress);
      else if (animation.type === "darko-forced-impact") drawDarkoForcedImpact(context, animation, progress);
      else if (animation.type === "luke-obsession") drawLukeObsession(context, animation, progress);
      else if (animation.type === "silvia-speed-gun") drawSilviaSpeedGun(context, animation, progress);
      else if (animation.type === "bianca-reign") drawBiancaReign(context, animation, progress);
      else drawCast(context, animation, progress);
      if (progress >= 1) animations.splice(index, 1);
    }
    frame = animations.length ? requestAnimationFrame(draw) : 0;
    if (!frame) context.clearRect(0, 0, layout.width, layout.height);
  }

  function clear() {
    pixiGeneration += 1;
    animations.length = 0;
    for (const animation of pixiAnimations) {
      try {
        animation.container.removeFromParent();
        animation.container.destroy({ children: true });
      } catch (error) {
        console.warn("[rumia-pixi-animation-destroy]", error);
      }
    }
    pixiAnimations.length = 0;
    if (frame) cancelAnimationFrame(frame);
    if (pixiFrame) cancelAnimationFrame(pixiFrame);
    frame = 0;
    pixiFrame = 0;
    canvas?.remove();
    destroyPixiApp();
    canvas = null;
    context = null;
    pixiApp = null;
    pixiLayer = null;
    pixiHost = null;
    pixiInitPromise = null;
  }

  async function benchmark(options = {}) {
    const renderer = options.renderer || "pixi";
    const layout = renderer === "legacy" ? ensureCanvas() : ensureLayout();
    if (!layout) return null;
    const type = options.type || "zahir-vayvayastra";
    const count = Math.max(1, Math.min(40, Math.round(options.count || 8)));
    clear();
    const freshLayout = renderer === "legacy" ? ensureCanvas() : ensureLayout();
    if (!freshLayout) return null;
    const origin = { x: freshLayout.width * 0.34, y: freshLayout.height * 0.72 };
    const target = { x: freshLayout.width * 0.66, y: freshLayout.height * 0.36 };
    for (let index = 0; index < count; index += 1) {
      const offset = (index - (count - 1) / 2) * 10;
      const shiftedOrigin = { x: origin.x + offset * 0.35, y: origin.y + offset * 0.12 };
      const shiftedTarget = { x: target.x + offset, y: target.y + offset * 0.2 };
      const spec = { type, fromId: "__benchmark_origin__", targetIds: ["__benchmark_target__"] };
      if (renderer === "legacy") pushLegacyAnimation(spec, freshLayout, shiftedOrigin, [shiftedTarget], shiftedTarget);
      else playPixi(spec, freshLayout, shiftedOrigin, [shiftedTarget], shiftedTarget);
    }
    await new Promise((resolve) => setTimeout(resolve, renderer === "pixi" ? 80 : 0));
    const samples = [];
    let last = performance.now();
    const sampleCount = Math.max(20, Math.min(120, Math.round(options.samples || 45)));
    for (let index = 0; index < sampleCount; index += 1) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const now = performance.now();
      samples.push(now - last);
      last = now;
    }
    const sorted = samples.slice().sort((a, b) => a - b);
    return {
      type,
      renderer,
      count,
      avg: samples.reduce((sum, value) => sum + value, 0) / samples.length,
      p95: sorted[Math.floor(sorted.length * 0.95)],
      max: Math.max(...samples),
      pixiAnimations: pixiAnimations.length,
      legacyAnimations: animations.length,
      pixiCanvasCount: document.querySelectorAll(".pixi-skill-effect-canvas").length,
      legacyCanvasCount: document.querySelectorAll("canvas.skill-effect-canvas:not(.pixi-skill-effect-canvas)").length,
    };
  }

  return {
    activeCount: () => pixiAnimations.length + animations.length,
    benchmark,
    clear,
    effectTypes: benchmarkEffectTypes,
    play,
  };
}
