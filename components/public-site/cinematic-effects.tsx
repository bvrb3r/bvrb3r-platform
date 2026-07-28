"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import styles from "./public-site.module.css";

type CustomStyle = CSSProperties & Record<`--${string}`, string | number>;

const stars = Array.from({ length: 62 }, (_, index) => ({
  left: (index * 37 + 3) % 100,
  top: (index * 61 + 7) % 100,
  size: 1 + ((index * 13) % 18) / 10,
  opacity: 0.16 + ((index * 29) % 48) / 100,
  duration: 2.4 + ((index * 7) % 40) / 10,
  delay: ((index * 11) % 50) / 10,
  color: index % 7 === 0 ? "#e4f9b8" : "#f5f1e8"
}));

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

    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
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
      set("--stars-y", `${p * -110}px`);
      set("--stars-scale", 1 + impact * 0.055);
      set("--pole-left", `${67 - 17 * ease(segment(p, 0.08, 0.4))}%`);
      set("--pole-x", `${Math.sin(p * 96) * segment(p, 0.3, 0.45) * 8}px`);
      set("--pole-y", `${Math.cos(p * 81) * segment(p, 0.3, 0.45) * 5}px`);
      set("--pole-rotate", `${Math.sin(p * 84) * segment(p, 0.3, 0.45) * 2.2}deg`);
      set("--pole-scale", 1 + 0.1 * ease(segment(p, 0.1, 0.43)));
      set("--pole-opacity", 1 - segment(p, 0.455, 0.485));
      set("--pole-glow", 0.38 + segment(p, 0.1, 0.43) * 0.62);
      set("--stripe-y", `${-((p * p * 4200) % 154)}px`);
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
      <div className={styles.starField}>
        {stars.map((star, index) => (
          <span
            key={index}
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
      <div className={styles.nebula} />
      <div className={styles.vignette} />

      <div className={styles.comet} />
      <div className={styles.cometLabel}>BVRB3R — incoming</div>

      <div className={styles.poleScene}>
        <div className={styles.poleGlow} />
        <div className={styles.barberPole}>
          <div className={styles.poleCap} />
          <div className={styles.poleGlass}>
            <div className={styles.poleStripes} />
            <div className={styles.poleCrack} />
          </div>
          <div className={styles.poleCap} />
          <div className={styles.poleLabel}>Est. spinning since 1651</div>
        </div>
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
