import {
  Application,
  Container,
  Graphics,
  type Ticker,
} from "pixi.js";
import { useEffect, useRef, useState } from "react";

const WORLD_WIDTH = 960;
const WORLD_HEIGHT = 420;
const INK = 0x26382f;

interface ExpeditionStageProps {
  ariaLabel: string;
  demoClockMs: number;
  reducedMotion: boolean;
  variant?: "full" | "compact";
}

interface RuntimeHandle {
  setTime: (timeMs: number) => void;
}

function outlinedEllipse(
  x: number,
  y: number,
  width: number,
  height: number,
  color: number,
  outlineWidth = 5,
) {
  return new Graphics()
    .ellipse(x, y, width, height)
    .fill({ color })
    .stroke({ color: INK, width: outlineWidth, join: "round" });
}

function outlinedCircle(x: number, y: number, radius: number, color: number, outlineWidth = 5) {
  return new Graphics()
    .circle(x, y, radius)
    .fill({ color })
    .stroke({ color: INK, width: outlineWidth });
}

function makeCloud(x: number, y: number, scale: number) {
  const cloud = new Container();
  const shadow = new Graphics()
    .roundRect(-45, -1, 105, 22, 12)
    .fill({ color: 0xbfd5d4, alpha: 0.48 });
  const puff = new Graphics()
    .circle(-24, -5, 22)
    .circle(4, -17, 31)
    .circle(36, -6, 24)
    .roundRect(-45, -8, 105, 26, 13)
    .fill({ color: 0xfffdf0, alpha: 0.88 });
  cloud.addChild(shadow, puff);
  cloud.position.set(x, y);
  cloud.scale.set(scale);
  return cloud;
}

function makeWindmill(x: number, y: number, scale: number) {
  const windmill = new Container();
  const tower = new Graphics()
    .moveTo(-24, 82)
    .lineTo(-15, 2)
    .lineTo(18, 2)
    .lineTo(29, 82)
    .closePath()
    .fill({ color: 0xf4dfad })
    .stroke({ color: INK, width: 4, join: "round" });
  const roof = new Graphics()
    .moveTo(-24, 8)
    .lineTo(2, -17)
    .lineTo(28, 8)
    .closePath()
    .fill({ color: 0xc96c49 })
    .stroke({ color: INK, width: 4, join: "round" });
  const door = new Graphics()
    .roundRect(-7, 51, 17, 31, 8)
    .fill({ color: 0x8b5b3f })
    .stroke({ color: INK, width: 3 });
  const blades = new Container();
  for (let index = 0; index < 4; index += 1) {
    const blade = new Graphics()
      .moveTo(-5, -4)
      .lineTo(-10, -54)
      .lineTo(5, -64)
      .lineTo(7, -5)
      .closePath()
      .fill({ color: 0xfff4ce })
      .stroke({ color: INK, width: 3, join: "round" });
    blade.rotation = (Math.PI / 2) * index;
    blades.addChild(blade);
  }
  blades.addChild(outlinedCircle(0, 0, 8, 0xe8ad52, 3));
  blades.position.set(2, 10);
  blades.label = "windmill-blades";
  windmill.addChild(tower, door, roof, blades);
  windmill.position.set(x, y);
  windmill.scale.set(scale);
  return windmill;
}

function makeCaravan(x: number, y: number) {
  const caravan = new Container();
  const body = new Graphics()
    .roundRect(-45, -31, 90, 48, 13)
    .fill({ color: 0xb85b43 })
    .stroke({ color: INK, width: 4 });
  const canvas = new Graphics()
    .moveTo(-38, -30)
    .bezierCurveTo(-25, -62, 23, -62, 38, -30)
    .lineTo(38, -16)
    .lineTo(-38, -16)
    .closePath()
    .fill({ color: 0xf8e7bb })
    .stroke({ color: INK, width: 4, join: "round" });
  const stripe = new Graphics()
    .moveTo(-10, -48)
    .lineTo(-7, -17)
    .stroke({ color: 0xd49b57, width: 8 });
  const wheelLeft = outlinedCircle(-29, 19, 14, 0x84553d, 4);
  const wheelRight = outlinedCircle(29, 19, 14, 0x84553d, 4);
  caravan.addChild(body, canvas, stripe, wheelLeft, wheelRight);
  caravan.position.set(x, y);
  caravan.scale.set(0.72);
  return caravan;
}

function makeHammerpaw() {
  const monster = new Container();
  const shadow = new Graphics().ellipse(0, 39, 58, 13).fill({ color: 0x344534, alpha: 0.22 });
  const tail = new Graphics()
    .moveTo(-39, 12)
    .bezierCurveTo(-75, 0, -76, -31, -50, -35)
    .bezierCurveTo(-57, -13, -37, -5, -26, 1)
    .closePath()
    .fill({ color: 0xc77947 })
    .stroke({ color: INK, width: 5, join: "round" });
  const body = outlinedEllipse(0, 10, 47, 37, 0xd88d4f);
  const belly = new Graphics().ellipse(5, 18, 27, 22).fill({ color: 0xf1bb70 });
  const leftPaw = outlinedEllipse(-34, 30, 22, 16, 0xb86b43, 4);
  const rightPaw = outlinedEllipse(36, 30, 22, 16, 0xb86b43, 4);
  const head = outlinedCircle(0, -29, 43, 0xda9151);
  const leftEar = new Graphics()
    .moveTo(-35, -50)
    .lineTo(-32, -88)
    .lineTo(-4, -63)
    .closePath()
    .fill({ color: 0xc47749 })
    .stroke({ color: INK, width: 5, join: "round" });
  const rightEar = new Graphics()
    .moveTo(35, -50)
    .lineTo(32, -88)
    .lineTo(4, -63)
    .closePath()
    .fill({ color: 0xc47749 })
    .stroke({ color: INK, width: 5, join: "round" });
  const brow = new Graphics()
    .moveTo(-22, -41)
    .lineTo(-8, -36)
    .moveTo(22, -41)
    .lineTo(8, -36)
    .stroke({ color: INK, width: 4, cap: "round" });
  const eyes = new Graphics()
    .circle(-14, -29, 5)
    .circle(14, -29, 5)
    .fill({ color: INK });
  const glints = new Graphics()
    .circle(-12, -31, 1.6)
    .circle(16, -31, 1.6)
    .fill({ color: 0xfff8dd });
  const muzzle = new Graphics().ellipse(0, -13, 20, 12).fill({ color: 0xf3c27f });
  const nose = new Graphics().circle(0, -18, 5).fill({ color: INK });
  const rune = new Graphics()
    .moveTo(-8, 4)
    .lineTo(1, -5)
    .lineTo(9, 5)
    .lineTo(0, 15)
    .closePath()
    .stroke({ color: 0xffe177, width: 4, join: "round" });
  const scarf = new Graphics()
    .moveTo(-35, -2)
    .bezierCurveTo(-9, 10, 16, 10, 35, -4)
    .stroke({ color: 0x3a7f77, width: 9, cap: "round" });
  monster.addChild(
    shadow,
    tail,
    body,
    belly,
    leftPaw,
    rightPaw,
    leftEar,
    rightEar,
    head,
    scarf,
    brow,
    eyes,
    glints,
    muzzle,
    nose,
    rune,
  );
  monster.label = "hammerpaw";
  return monster;
}

function makeSwiftwing() {
  const monster = new Container();
  const shadow = new Graphics().ellipse(0, 52, 54, 11).fill({ color: 0x344534, alpha: 0.18 });
  const backWing = new Graphics()
    .moveTo(-5, 1)
    .bezierCurveTo(-58, -33, -67, 2, -36, 31)
    .bezierCurveTo(-29, 16, -17, 13, -3, 18)
    .closePath()
    .fill({ color: 0x77aab0 })
    .stroke({ color: INK, width: 5, join: "round" });
  const tail = new Graphics()
    .moveTo(29, 28)
    .bezierCurveTo(68, 13, 83, 28, 66, 47)
    .lineTo(93, 53)
    .bezierCurveTo(63, 72, 37, 55, 20, 39)
    .closePath()
    .fill({ color: 0x8fc6c6 })
    .stroke({ color: INK, width: 5, join: "round" });
  const body = outlinedEllipse(6, 19, 43, 33, 0x93c7c2);
  const chest = new Graphics().ellipse(-4, 24, 24, 25).fill({ color: 0xd9eee0 });
  const frontWing = new Graphics()
    .moveTo(2, 2)
    .bezierCurveTo(49, -30, 67, 1, 40, 34)
    .bezierCurveTo(31, 20, 18, 15, 3, 19)
    .closePath()
    .fill({ color: 0x66a1aa })
    .stroke({ color: INK, width: 5, join: "round" });
  frontWing.label = "swiftwing-wing";
  const head = outlinedCircle(-8, -22, 35, 0xa4d0c9);
  const crest = new Graphics()
    .moveTo(-20, -51)
    .bezierCurveTo(-13, -78, 6, -75, 3, -49)
    .bezierCurveTo(20, -69, 33, -51, 14, -37)
    .closePath()
    .fill({ color: 0x4d929d })
    .stroke({ color: INK, width: 4, join: "round" });
  const beak = new Graphics()
    .moveTo(-39, -18)
    .lineTo(-62, -8)
    .lineTo(-37, 0)
    .closePath()
    .fill({ color: 0xf0b94f })
    .stroke({ color: INK, width: 4, join: "round" });
  const eye = new Graphics().circle(-18, -27, 6).fill({ color: INK });
  const glint = new Graphics().circle(-16, -29, 2).fill({ color: 0xfff8dd });
  const feet = new Graphics()
    .moveTo(-9, 47)
    .lineTo(-16, 58)
    .moveTo(18, 45)
    .lineTo(13, 57)
    .stroke({ color: 0xd28b3e, width: 5, cap: "round" });
  const ribbon = new Graphics()
    .moveTo(-27, 3)
    .bezierCurveTo(-2, 14, 14, 10, 31, -1)
    .stroke({ color: 0xd25d59, width: 8, cap: "round" });
  monster.addChild(shadow, backWing, tail, body, chest, frontWing, crest, head, beak, eye, glint, feet, ribbon);
  monster.label = "swiftwing";
  return monster;
}

function makeScene() {
  const scene = new Container();
  const sky = new Graphics().rect(0, 0, WORLD_WIDTH, WORLD_HEIGHT).fill({ color: 0xaedbdc });
  const sunGlow = new Graphics().circle(806, 88, 72).fill({ color: 0xffe69a, alpha: 0.2 });
  const sun = new Graphics()
    .circle(806, 88, 43)
    .fill({ color: 0xffdd75 })
    .stroke({ color: 0xd79a4a, width: 4, alpha: 0.7 });
  const farHills = new Graphics()
    .moveTo(0, 214)
    .bezierCurveTo(120, 108, 231, 204, 341, 158)
    .bezierCurveTo(473, 98, 594, 201, 706, 148)
    .bezierCurveTo(833, 88, 900, 162, 960, 130)
    .lineTo(960, 420)
    .lineTo(0, 420)
    .closePath()
    .fill({ color: 0x83b88a });
  const nearHills = new Graphics()
    .moveTo(0, 253)
    .bezierCurveTo(150, 185, 250, 274, 395, 212)
    .bezierCurveTo(528, 161, 653, 259, 789, 197)
    .bezierCurveTo(860, 168, 924, 188, 960, 181)
    .lineTo(960, 420)
    .lineTo(0, 420)
    .closePath()
    .fill({ color: 0x5f9b69 });
  const ground = new Graphics().rect(0, 267, WORLD_WIDTH, 153).fill({ color: 0x6fab61 });
  const path = new Graphics()
    .moveTo(962, 319)
    .bezierCurveTo(789, 289, 662, 307, 541, 326)
    .bezierCurveTo(377, 351, 215, 317, -20, 404)
    .lineTo(-20, 440)
    .lineTo(980, 440)
    .closePath()
    .fill({ color: 0xe8ca85 })
    .stroke({ color: 0xd2ab64, width: 5, alpha: 0.7 });
  const foreground = new Graphics()
    .moveTo(0, 394)
    .bezierCurveTo(170, 361, 273, 408, 416, 386)
    .bezierCurveTo(578, 361, 717, 415, 960, 371)
    .lineTo(960, 420)
    .lineTo(0, 420)
    .closePath()
    .fill({ color: 0x3f7c51 });

  const cloudA = makeCloud(132, 81, 0.92);
  const cloudB = makeCloud(563, 69, 0.58);
  const cloudC = makeCloud(887, 164, 0.42);
  const windmillA = makeWindmill(178, 189, 0.82);
  const windmillB = makeWindmill(711, 207, 0.55);
  const caravan = makeCaravan(822, 300);

  const grasses = new Container();
  for (let index = 0; index < 27; index += 1) {
    const x = 18 + ((index * 83) % 930);
    const y = 286 + ((index * 47) % 116);
    const blade = new Graphics()
      .moveTo(0, 8)
      .quadraticCurveTo(-5, -3, -9, -9)
      .moveTo(0, 8)
      .quadraticCurveTo(2, -4, 8, -12)
      .moveTo(0, 8)
      .lineTo(0, -10)
      .stroke({ color: index % 3 === 0 ? 0x2f6b49 : 0x4e8b4c, width: 3, cap: "round" });
    blade.position.set(x, y);
    blade.alpha = 0.72;
    grasses.addChild(blade);
  }

  const flowers = new Container();
  for (let index = 0; index < 12; index += 1) {
    const flower = new Graphics()
      .circle(0, 0, 3)
      .fill({ color: index % 2 === 0 ? 0xffe57f : 0xf28a7f })
      .circle(0, 0, 1)
      .fill({ color: 0xfff4c4 });
    flower.position.set(40 + ((index * 137) % 890), 300 + ((index * 61) % 105));
    flowers.addChild(flower);
  }

  const hammerpaw = makeHammerpaw();
  hammerpaw.position.set(442, 329);
  hammerpaw.scale.set(0.86);
  const swiftwing = makeSwiftwing();
  swiftwing.position.set(582, 289);
  swiftwing.scale.set(0.82);

  const particles = new Container();
  const motes: Array<{ node: Graphics; baseX: number; baseY: number; phase: number; speed: number }> = [];
  for (let index = 0; index < 18; index += 1) {
    const golden = index % 3 === 0;
    const particle = golden
      ? new Graphics().circle(0, 0, 2.5 + (index % 2)).fill({ color: 0xffdf71, alpha: 0.86 })
      : new Graphics()
          .moveTo(-4, 0)
          .quadraticCurveTo(0, -4, 5, 0)
          .quadraticCurveTo(0, 4, -4, 0)
          .fill({ color: index % 2 ? 0xeecf68 : 0x8fc969, alpha: 0.8 });
    const baseX = 310 + ((index * 89) % 395);
    const baseY = 180 + ((index * 53) % 155);
    particle.position.set(baseX, baseY);
    particles.addChild(particle);
    motes.push({ node: particle, baseX, baseY, phase: index * 0.73, speed: 0.45 + (index % 5) * 0.08 });
  }

  const foregroundGrass = new Graphics();
  for (let index = 0; index < 40; index += 1) {
    const x = index * 25 - 7;
    foregroundGrass
      .moveTo(x, 420)
      .quadraticCurveTo(x - 4, 403 - (index % 3) * 4, x - 9, 390 - (index % 5) * 3)
      .moveTo(x, 420)
      .quadraticCurveTo(x + 4, 404, x + 9, 394 - (index % 4) * 3);
  }
  foregroundGrass.stroke({ color: 0x2c6748, width: 4, cap: "round", alpha: 0.9 });

  scene.addChild(
    sky,
    sunGlow,
    sun,
    cloudA,
    cloudB,
    cloudC,
    farHills,
    windmillB,
    nearHills,
    ground,
    path,
    grasses,
    flowers,
    windmillA,
    caravan,
    hammerpaw,
    swiftwing,
    particles,
    foreground,
    foregroundGrass,
  );

  return {
    scene,
    cloudA,
    cloudB,
    windmillA,
    windmillB,
    hammerpaw,
    swiftwing,
    motes,
  };
}

export function ExpeditionStage({
  ariaLabel,
  demoClockMs,
  reducedMotion,
  variant = "full",
}: ExpeditionStageProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<RuntimeHandle | null>(null);
  const initialTimeRef = useRef(demoClockMs);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let disposed = false;
    let initialized = false;
    let application: Application | null = null;
    let resizeObserver: ResizeObserver | null = null;

    const start = async () => {
      const app = new Application();
      application = app;
      try {
        await app.init({
          antialias: true,
          autoDensity: true,
          backgroundAlpha: 0,
          preference: "webgl",
          resolution: Math.min(window.devicePixelRatio || 1, 2),
          width: Math.max(host.clientWidth, 320),
          height: Math.max(host.clientHeight, variant === "compact" ? 180 : 280),
        });
        initialized = true;
      } catch {
        if (!disposed) setFailed(true);
        return;
      }

      if (disposed) {
        app.destroy(true, { children: true });
        return;
      }

      app.canvas.className = "expedition-canvas";
      app.canvas.setAttribute("aria-hidden", "true");
      host.appendChild(app.canvas);
      app.ticker.maxFPS = reducedMotion ? 2 : 30;

      const sceneParts = makeScene();
      app.stage.addChild(sceneParts.scene);
      let timeMs = initialTimeRef.current;

      const resize = () => {
        const width = Math.max(host.clientWidth, 1);
        const height = Math.max(host.clientHeight, 1);
        app.renderer.resize(width, height);
        const scale = Math.max(width / WORLD_WIDTH, height / WORLD_HEIGHT);
        sceneParts.scene.scale.set(scale);
        sceneParts.scene.position.set(
          Math.round((width - WORLD_WIDTH * scale) / 2),
          Math.round((height - WORLD_HEIGHT * scale) / 2),
        );
      };

      const updateScene = () => {
        const seconds = timeMs / 1_000;
        sceneParts.hammerpaw.y = 329 + Math.sin(seconds * 3.1) * (reducedMotion ? 0.5 : 3.5);
        sceneParts.hammerpaw.rotation = Math.sin(seconds * 1.5) * (reducedMotion ? 0 : 0.012);
        sceneParts.swiftwing.y = 289 + Math.sin(seconds * 2.5 + 1.3) * (reducedMotion ? 0.7 : 7);
        sceneParts.swiftwing.rotation = Math.sin(seconds * 1.8) * (reducedMotion ? 0 : 0.018);
        sceneParts.cloudA.x = 132 + Math.sin(seconds * 0.12) * (reducedMotion ? 0 : 18);
        sceneParts.cloudB.x = 563 + Math.sin(seconds * 0.1 + 2) * (reducedMotion ? 0 : 12);
        const bladesA = sceneParts.windmillA.getChildByLabel("windmill-blades");
        const bladesB = sceneParts.windmillB.getChildByLabel("windmill-blades");
        if (bladesA) bladesA.rotation = seconds * (reducedMotion ? 0.03 : 0.22);
        if (bladesB) bladesB.rotation = seconds * (reducedMotion ? 0.02 : 0.16);
        for (const mote of sceneParts.motes) {
          const drift = seconds * mote.speed;
          mote.node.x = mote.baseX + Math.sin(drift + mote.phase) * (reducedMotion ? 2 : 18);
          mote.node.y = mote.baseY + Math.cos(drift * 0.8 + mote.phase) * (reducedMotion ? 2 : 11);
          mote.node.rotation = drift + mote.phase;
        }
      };

      runtimeRef.current = {
        setTime(nextTimeMs) {
          timeMs = nextTimeMs;
          updateScene();
          app.render();
        },
      };

      const tick = (ticker: Ticker) => {
        if (!reducedMotion) timeMs += ticker.deltaMS;
        updateScene();
      };
      app.ticker.add(tick);
      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(host);
      resize();
      updateScene();
    };

    void start();
    return () => {
      disposed = true;
      runtimeRef.current = null;
      resizeObserver?.disconnect();
      if (application && initialized) application.destroy(true, { children: true });
    };
  }, [reducedMotion, variant]);

  useEffect(() => {
    runtimeRef.current?.setTime(demoClockMs);
  }, [demoClockMs]);

  return (
    <div
      ref={hostRef}
      className={`expedition-stage expedition-stage-${variant}${failed ? " is-fallback" : ""}`}
      role="img"
      aria-label={ariaLabel}
    >
      {failed && (
        <div className="stage-fallback" aria-hidden="true">
          <span className="fallback-hill" />
          <span className="fallback-monster fallback-hammerpaw" />
          <span className="fallback-monster fallback-swiftwing" />
        </div>
      )}
    </div>
  );
}
