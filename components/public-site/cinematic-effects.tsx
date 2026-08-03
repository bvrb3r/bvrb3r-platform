"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import styles from "./public-site.module.css";

type CustomStyle = CSSProperties & Record<`--${string}`, string | number>;

type Star = {
  left: number;
  top: number;
  size: number;
  opacity: number;
  duration: number;
  delay: number;
  color: string;
};

/** A fixed-seed generator keeps server and client output identical without
 * placing stars on the arithmetic rows produced by the previous modulo map. */
function createSeededRandom(seed: number) {
  let state = seed >>> 0;

  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function createStars(count: number, seed: number, minSize: number, maxSize: number): Star[] {
  const random = createSeededRandom(seed);

  return Array.from({ length: count }, () => {
    const colorRoll = random();
    return {
      left: random() * 100,
      top: random() * 100,
      size: minSize + random() * (maxSize - minSize),
      opacity: 0.14 + random() * 0.5,
      duration: 3.2 + random() * 4.8,
      delay: -random() * 7,
      color: colorRoll > 0.88 ? "#dfe8ff" : colorRoll < 0.12 ? "#fff6e6" : "#f5f1e8"
    };
  });
}

const starLayers = [
  { name: "far", stars: createStars(68, 0xb7b3f301, 0.55, 1.25) },
  { name: "near", stars: createStars(24, 0x3ba2c4e9, 1.15, 2.45) }
] as const;

const poleStripeRows = Array.from({ length: 13 }, (_, index) => -504 + index * 144);

const debris = Array.from({ length: 18 }, (_, index) => {
  const angle = (index / 18) * Math.PI * 2 + (index % 3) * 0.28;
  const speed = 0.62 + ((index * 37) % 60) / 100;
  return {
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed * 0.82,
    rotate: ((index * 131) % 620) - 310,
    width: 12 + ((index * 17) % 28),
    height: 14 + ((index * 23) % 34),
    color: ["#e23b3b", "#f5f1e8", "#2a6fdb", "#c4f24e"][index % 4]
  };
});

function clamp(value: number) {
  return Math.min(1, Math.max(0, value));
}

function segment(value: number, start: number, end: number) {
  return clamp((value - start) / (end - start));
}

function ease(value: number) {
  return value * value * (3 - 2 * value);
}

export function CinematicEffects() {
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) {
      return;
    }

    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
    if (reducedMotion) {
      stage.dataset.reducedMotion = "true";
      return;
    }

    const debrisElements = Array.from(stage.querySelectorAll<HTMLElement>("[data-debris]"));
    let frame = 0;
    let currentProgress = 0;
    let targetProgress = 0;

    const set = (name: string, value: string | number) => {
      stage.style.setProperty(name, String(value));
    };

    const updateTarget = () => {
      const scrollRange = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
      targetProgress = clamp(window.scrollY / scrollRange);
      if (!frame) {
        frame = window.requestAnimationFrame(render);
      }
    };

    const render = () => {
      currentProgress += (targetProgress - currentProgress) * 0.14;
      const p = currentProgress;
      const impact = segment(p, 0.43, 0.455) * (1 - segment(p, 0.465, 0.525));
      const detonation = ease(segment(p, 0.44, 0.58));
      const reveal = ease(segment(p, 0.56, 0.72)) * (1 - 0.72 * segment(p, 0.9, 0.985));
      const close = ease(segment(p, 0.88, 0.97));

      set("--hero-opacity", 1 - segment(p, 0.055, 0.135));
      set("--stars-far-y", `${p * -42}px`);
      set("--stars-near-y", `${p * -110}px`);
      set("--stars-far-scale", 1 + impact * 0.025);
      set("--stars-near-scale", 1 + impact * 0.055);
      const poleStart = window.innerWidth <= 720 ? 50 : window.innerWidth <= 1080 ? 73 : 67;
      const poleEnd = 50;
      set("--pole-left", `${poleStart - (poleStart - poleEnd) * ease(segment(p, 0.08, 0.4))}%`);
      set("--pole-x", `${Math.sin(p * 96) * segment(p, 0.3, 0.45) * 8}px`);
      set("--pole-y", `${Math.cos(p * 81) * segment(p, 0.3, 0.45) * 5}px`);
      set("--pole-rotate", `${Math.sin(p * 84) * segment(p, 0.3, 0.45) * 2.2}deg`);
      set("--pole-scale", 1 + 0.1 * ease(segment(p, 0.1, 0.43)));
      set("--pole-opacity", 1 - segment(p, 0.455, 0.485));
      set("--pole-glow", 0.38 + segment(p, 0.1, 0.43) * 0.62);
      set("--stripe-y", `${-((p * p * 4200) % 144)}px`);
      set("--crack-opacity", segment(p, 0.36, 0.425));

      const flight = ease(segment(p, 0.13, 0.448));
      let cometX: number;
      let cometY: number;
      let cometAngle: number;
      if (flight < 0.58) {
        const first = flight / 0.58;
        cometX = -24 + first * 138;
        cometY = 30 - Math.sin(first * Math.PI) * 20;
        cometAngle = -8;
      } else {
        const second = (flight - 0.58) / 0.42;
        cometX = 114 - second * 64;
        cometY = 10 + second * 40;
        cometAngle = 142 - second * 4;
      }
      set("--comet-x", `${cometX}vw`);
      set("--comet-y", `${cometY}vh`);
      set("--comet-angle", `${cometAngle}deg`);
      set("--comet-opacity", segment(p, 0.13, 0.19) * (1 - segment(p, 0.44, 0.455)));
      set("--comet-label-opacity", segment(p, 0.2, 0.27) * (1 - segment(p, 0.38, 0.43)));

      set("--impact-opacity", impact);
      set("--flare-scale", 0.4 + impact);
      set("--ring-opacity", detonation > 0.01 ? (1 - detonation) * 0.88 : 0);
      set("--ring-scale", 1 + detonation * 15);
      set("--letterbox", `${segment(p, 0.1, 0.17) * (1 - segment(p, 0.6, 0.68)) * 7.5}vh`);
      set("--reveal-opacity", reveal);
      set("--nebula-scale", 0.5 + reveal * 0.95);
      set("--nebula-rotate", `${p * 24}deg`);
      set("--phone-scale", 0.58 + reveal * 0.42 - close * 0.15);
      set("--phone-y", `${(1 - reveal) * 90 + close * 130}px`);
      set("--final-opacity", close);

      debrisElements.forEach((element, index) => {
        const config = debris[index];
        if (!config) {
          return;
        }
        const distance = Math.min(window.innerWidth, 1400) * 0.54 * detonation;
        element.style.setProperty("--debris-opacity", String(detonation > 0.01 ? (1 - segment(p, 0.83, 0.96)) * 0.84 : 0));
        element.style.setProperty("--debris-x", `${config.vx * distance}px`);
        element.style.setProperty("--debris-y", `${config.vy * distance}px`);
        element.style.setProperty("--debris-rotate", `${config.rotate * detonation}deg`);
      });

      if (Math.abs(targetProgress - currentProgress) > 0.0005) {
        frame = window.requestAnimationFrame(render);
      } else {
        currentProgress = targetProgress;
        frame = 0;
      }
    };

    window.addEventListener("scroll", updateTarget, { passive: true });
    window.addEventListener("resize", updateTarget);
    updateTarget();

    return () => {
      window.removeEventListener("scroll", updateTarget);
      window.removeEventListener("resize", updateTarget);
      if (frame) {
        window.cancelAnimationFrame(frame);
      }
    };
  }, []);

  return (
    <div ref={stageRef} className={styles.filmStage} aria-hidden="true">
      {starLayers.map((layer) => (
        <div
          key={layer.name}
          className={`${styles.starField} ${layer.name === "far" ? styles.starFieldFar : styles.starFieldNear}`}
          data-star-layer={layer.name}
        >
          {layer.stars.map((star, index) => (
            <span
              key={`${layer.name}-${index}`}
              className={styles.star}
              style={{
                "--star-left": `${star.left}%`,
                "--star-top": `${star.top}%`,
                "--star-size": `${star.size}px`,
                "--star-opacity": star.opacity,
                "--star-duration": `${star.duration}s`,
                "--star-delay": `${star.delay}s`,
                "--star-color": star.color
              } as CustomStyle}
            />
          ))}
        </div>
      ))}
      <div className={styles.nebula} />
      <div className={styles.vignette} />

      <div className={styles.comet} />
      <div className={styles.cometLabel}>BVRB3R — incoming</div>

      <div className={styles.poleScene}>
        <div className={styles.poleGlow}>
          <span className={`${styles.poleBloom} ${styles.poleBloomCream}`} />
          <span className={`${styles.poleBloom} ${styles.poleBloomRed}`} />
          <span className={`${styles.poleBloom} ${styles.poleBloomBlue}`} />
        </div>
        <svg
          className={styles.barberPole}
          viewBox="0 0 240 720"
          preserveAspectRatio="xMidYMid meet"
          focusable="false"
          aria-hidden="true"
          shapeRendering="geometricPrecision"
        >
          <defs>
            <clipPath id="bvrb3r-public-pole-glass-clip">
              <rect x="40" y="119" width="160" height="482" rx="43" />
            </clipPath>
            <linearGradient id="bvrb3r-public-pole-metal" x1="0" x2="1">
              <stop offset="0" stopColor="#070808" />
              <stop offset="0.42" stopColor="#2a2b2b" />
              <stop offset="0.54" stopColor="#fff6e6" stopOpacity="0.78" />
              <stop offset="0.64" stopColor="#1d1e1e" />
              <stop offset="1" stopColor="#050606" />
            </linearGradient>
            <linearGradient id="bvrb3r-public-pole-glass" x1="0" x2="1">
              <stop offset="0" stopColor="#020303" stopOpacity="0.92" />
              <stop offset="0.22" stopColor="#fff6e6" stopOpacity="0.05" />
              <stop offset="0.47" stopColor="#fff6e6" stopOpacity="0.16" />
              <stop offset="0.58" stopColor="#060707" stopOpacity="0.02" />
              <stop offset="0.82" stopColor="#020303" stopOpacity="0.58" />
              <stop offset="1" stopColor="#010202" stopOpacity="0.94" />
            </linearGradient>
          </defs>

          <circle className={styles.poleMetalCore} cx="120" cy="10" r="10" />
          <path
            className={styles.poleMetalCore}
            d="M62 84V58c0-23 25-38 58-38s58 15 58 38v26H62Z"
          />
          <rect className={styles.poleMetalCore} x="10" y="79" width="220" height="42" rx="21" />
          <rect className={styles.poleCollarLine} x="20" y="98" width="200" height="23" rx="11.5" />

          <rect className={styles.poleGlassBase} x="40" y="113" width="160" height="494" rx="45" />
          <g clipPath="url(#bvrb3r-public-pole-glass-clip)">
            <g className={`${styles.poleStripeTrack} ${styles.poleCreamCore}`}>
              {poleStripeRows.map((row) => (
                <path key={`cream-${row}`} d={`M-54 ${row} C18 ${row - 42} 80 ${row - 34} 135 ${row - 2} S244 ${row + 42} 296 ${row + 1}`} />
              ))}
            </g>
            <g className={`${styles.poleStripeTrack} ${styles.poleRedCore}`}>
              {poleStripeRows.map((row) => (
                <path key={`red-${row}`} d={`M-54 ${row + 48} C18 ${row + 6} 80 ${row + 14} 135 ${row + 46} S244 ${row + 90} 296 ${row + 49}`} />
              ))}
            </g>
            <g className={`${styles.poleStripeTrack} ${styles.poleBlueCore}`}>
              {poleStripeRows.map((row) => (
                <path key={`blue-${row}`} d={`M-54 ${row + 96} C18 ${row + 54} 80 ${row + 62} 135 ${row + 94} S244 ${row + 138} 296 ${row + 97}`} />
              ))}
            </g>
            <rect className={styles.poleGlassShine} x="40" y="119" width="160" height="482" rx="43" />
            <path className={styles.poleCrack} d="m127 252 9 67-14 38 11 82-18 42" />
            <path className={styles.poleCrack} d="m134 319 22 18-15 25" />
            <path className={styles.poleCrack} d="m126 404-23 21 17 20" />
          </g>

          <rect className={styles.poleRail} x="12" y="112" width="10" height="496" rx="5" />
          <rect className={styles.poleRail} x="218" y="112" width="10" height="496" rx="5" />

          <rect className={styles.poleMetalCore} x="10" y="599" width="220" height="42" rx="21" />
          <rect className={styles.poleCollarLine} x="20" y="599" width="200" height="23" rx="11.5" />
          <path
            className={styles.poleMetalCore}
            d="M62 636h116v26c0 23-25 38-58 38s-58-15-58-38v-26Z"
          />
          <circle className={styles.poleMetalCore} cx="120" cy="710" r="10" />
        </svg>
        <div className={styles.poleLabel}>Est. spinning since 1651</div>
      </div>

      <div className={styles.impactFlash} />
      <div className={styles.lensFlare} />
      <div className={styles.shockRing} />
      {debris.map((piece, index) => (
        <span
          key={index}
          data-debris
          className={styles.debris}
          style={{
            "--debris-width": `${piece.width}px`,
            "--debris-height": `${piece.height}px`,
            "--debris-color": piece.color
          } as CustomStyle}
        />
      ))}

      <div className={styles.phoneScene}>
        <div className={styles.phone}>
          <div className={styles.phoneScreen}>
            <div className={styles.phoneStatus}>
              <span>9:41</span>
              <span className={styles.phoneBrand}>BVRB<span>3</span>R</span>
              <span>●●●</span>
            </div>
            <p className={styles.phoneKicker}>Book fast</p>
            <p className={styles.phoneTitle}>Good to see you, Alex.</p>
            <div className={styles.phoneAction}>
              <strong>⚡ Get a cut now</strong>
              <span>Next chair opens 2:15 PM · 0.4 mi</span>
              <span className={styles.phoneButton}>Find the next chair →</span>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.letterboxTop} />
      <div className={styles.letterboxBottom} />
      <div className={styles.filmGrain} />
      <div className={styles.filmGrade} />
    </div>
  );
}
