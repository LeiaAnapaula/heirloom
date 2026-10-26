import * as THREE from "three";
import { SparkRenderer, SplatMesh } from "@sparkjsdev/spark";
import { MOMENTS, WORLD, buildOf, momentOf, type BuildKind, type MomentId, type TimeOfDay } from "./config";
import { actions, hud, registerWorld, type HudState, type Piece } from "./store";
import { disposeObject, disposeSharedMaterials, makeGhost, makePiece, makeSelectionRing, tintGhost } from "./pieces";

/**
 * The 3D world: Grandpa's Marble world drawn with Spark, the child's pieces on top,
 * and the camera a child can walk around. It reads and writes the HUD store and
 * never touches React.
 */

const DEG = Math.PI / 180;
const WALK_SPEED = 2.4; // meters per second
const LOOK_SPEED = 0.0045; // radians per pixel dragged
const MIN_HEIGHT = 0.3; // the camera never sinks closer to the ground than this
const MAX_REACH = 40; // the farthest a piece can be placed, in meters
const TAP_SLOP = 8; // pixels a finger may wander and still count as a tap
const TAP_MS = 1000; // young children press and hold; moving past TAP_SLOP is what makes a drag
const FULL_PIXEL_RATIO = 1.5; // the full world costs its splats, not its pixels, so it gets fewer of them
const SMOOTH_MS = 20; // one frame in ten slower than this, and the world isn't running smoothly

type Pose = { position: THREE.Vector3; yaw: number; pitch: number };

/**
 * Which way each piece turns when placed, relative to the child's view. Most face
 * the child; the bridge lands at a slant so it reads as a bridge and crosses the
 * river in front of you.
 */
const FACING: Partial<Record<BuildKind, number>> = { bridge: -45 };

const TINTS: Record<TimeOfDay, { splat: number; sky: number; hemi: number; sun: number; sunColor: number }> = {
  morning: { splat: 0xf4eef2, sky: 0xdfe6ef, hemi: 1.6, sun: 1.6, sunColor: 0xffe4cf },
  day: { splat: 0xffffff, sky: 0xcfdde6, hemi: 1.9, sun: 2.0, sunColor: 0xffffff },
  golden: { splat: 0xffd2a8, sky: 0xf0b98a, hemi: 1.3, sun: 2.4, sunColor: 0xffb46b },
  night: { splat: 0x5a6a9c, sky: 0x141b33, hemi: 0.45, sun: 0.25, sunColor: 0x9fb4ff },
};

export type StartOptions = {
  container: HTMLElement;
  quality: "auto" | "preview" | "full";
};

/** Starts the world inside `container` and returns a function that tears it all down. */
export function startWorld({ container, quality }: StartOptions): () => void {
  // A fresh canvas every time: React may mount, unmount and mount again, and a
  // WebGL context cannot be reused once it is released.
  const canvas = document.createElement("canvas");
  canvas.className = "block h-full w-full touch-none outline-none";
  canvas.setAttribute("aria-label", "Grandpa's world. Drag to look around.");
  canvas.tabIndex = -1;
  container.appendChild(canvas);

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
  } catch {
    hud.set({ status: "error", errorKind: "webgl", error: "This device can't draw 3D worlds. Try Chrome or Safari on a newer device." });
    canvas.remove();
    return () => {};
  }
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const pixelRatio = Math.min(window.devicePixelRatio, coarse ? 1.5 : 2);
  renderer.setPixelRatio(pixelRatio);
  // Read each time, so changing the setting while the world is open counts straight away.
  const still = window.matchMedia("(prefers-reduced-motion: reduce)");

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(TINTS.day.sky);
  const camera = new THREE.PerspectiveCamera(62, 1, 0.05, 400);
  const spark = new SparkRenderer({ renderer });
  scene.add(spark);

  // Light for the child's pieces only; the splats carry their own baked light.
  const hemi = new THREE.HemisphereLight(0xfff6e6, 0x5b6b4a, TINTS.day.hemi);
  const sun = new THREE.DirectionalLight(0xffffff, TINTS.day.sun);
  sun.position.set(6, 10, 4);
  scene.add(hemi, sun);

  const piecesGroup = new THREE.Group();
  const markersGroup = new THREE.Group();
  scene.add(piecesGroup, markersGroup);

  // ---------- camera ----------
  const pose: Pose = {
    position: new THREE.Vector3(...WORLD.start.position),
    yaw: WORLD.start.yawDeg * DEG,
    pitch: WORLD.start.pitchDeg * DEG,
  };
  const startPose = (): Pose => ({ position: new THREE.Vector3(...WORLD.start.position), yaw: WORLD.start.yawDeg * DEG, pitch: WORLD.start.pitchDeg * DEG });
  const euler = new THREE.Euler(0, 0, 0, "YXZ");
  function applyPose() {
    camera.position.copy(pose.position);
    euler.set(pose.pitch, pose.yaw, 0);
    camera.quaternion.setFromEuler(euler);
  }
  applyPose();

  let worldBox: THREE.Box3 | null = null; // the part of the world with splats in it, sky included
  let placeBox: THREE.Box3 | null = null; // where pieces may go: the same, minus the sky
  let groundY: number = WORLD.groundY; // ground under the camera, last time we looked
  const walkCenter = new THREE.Vector3(...WORLD.walk.center);

  // ---------- the world itself ----------
  let proxy: SplatMesh | null = null; // the light version, kept for raycasting
  let shown: SplatMesh | null = null; // whichever version is on screen
  let disposed = false;

  function loadSplat(url: string, raycastable: boolean, onProgress: (p: number) => void, expectedBytes: number): Promise<SplatMesh> {
    return new Promise((resolve, reject) => {
      const mesh = new SplatMesh({
        url,
        raycastable,
        onProgress: (e) => onProgress(Math.min(1, e.loaded / (e.lengthComputable && e.total ? e.total : expectedBytes))),
        onLoad: (m) => resolve(m),
      });
      // Marble writes splats with y down and z forward; turn them the three.js way up.
      mesh.quaternion.set(1, 0, 0, 0);
      mesh.updateMatrixWorld(true);
      mesh.initialized.catch(reject);
    });
  }

  loadSplat(WORLD.splats.preview, true, (p) => hud.set({ progress: p }), 2_379_965)
    .then((mesh) => {
      if (disposed) return mesh.dispose();
      proxy = shown = mesh;
      scene.add(mesh);
      measureWorld(mesh);
      applyTime(hud.get().timeOfDay);
      hud.set({ status: "ready", progress: 1 });
      if (quality === "full") sharpen(false);
      else if (quality === "auto" && !coarse && !(navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData) {
        watch = { phase: "light", from: performance.now() + 1000 };
      }
    })
    .catch(() => {
      if (!disposed) hud.set({ status: "error", errorKind: "network", error: "The world didn't load. Check the internet connection and try again." });
    });

  /** Swap in the full world once it has downloaded, keeping the light one for picking spots. */
  function sharpen(checkAfter: boolean) {
    hud.set({ sharpening: 0 });
    loadSplat(WORLD.splats.full, false, (p) => hud.set({ sharpening: p }), 68_524_366)
      .then((full) => {
        if (disposed) return full.dispose();
        scene.add(full);
        if (proxy) scene.remove(proxy); // still raycastable while out of the scene
        shown = full;
        renderer.setPixelRatio(Math.min(pixelRatio, FULL_PIXEL_RATIO));
        applyTime(hud.get().timeOfDay);
        hud.set({ quality: "full", sharpening: null });
        // Give it a moment to settle in, then make sure it keeps up.
        if (checkAfter) watch = { phase: "full", from: performance.now() + 1500 };
      })
      .catch(() => hud.set({ sharpening: null }));
  }

  /** The full world can't keep up on this device: back to the light one for the rest of the visit. */
  function soften() {
    if (!proxy || !shown || shown === proxy) return;
    const full = shown;
    scene.add(proxy);
    scene.remove(full);
    full.dispose();
    shown = proxy;
    renderer.setPixelRatio(pixelRatio);
    applyTime(hud.get().timeOfDay);
    hud.set({ quality: "preview" });
  }

  // On "auto" the full world, about 30 times the splats, only loads where the light
  // one runs smoothly, and goes away again if it turns out too heavy.
  let watch: { phase: "light" | "full"; from: number } | null = null;
  const gaps: number[] = []; // time between frames while watching, in ms
  let watched = 0;

  function watchFrames(gap: number, now: number) {
    if (!watch || now < watch.from || gap > 1000) return; // a hidden tab is not a slow device
    gaps.push(gap);
    watched += gap;
    if (watched < 2000) return;
    gaps.sort((a, b) => a - b);
    const smooth = gaps[Math.floor(gaps.length * 0.9)] <= SMOOTH_MS;
    const phase = watch.phase;
    watch = null;
    gaps.length = 0;
    watched = 0;
    if (phase === "light" && smooth) sharpen(true);
    else if (phase === "full" && !smooth) soften();
  }

  /** Find the part of the world worth walking in, ignoring stray far-away splats. */
  function measureWorld(mesh: SplatMesh) {
    const xs: number[] = [];
    const ys: number[] = [];
    const zs: number[] = [];
    let i = 0;
    const p = new THREE.Vector3();
    mesh.forEachSplat((_index, center, _scales, _quat, opacity) => {
      if (opacity < 0.3 || (i++ & 3) !== 0) return;
      p.copy(center).applyMatrix4(mesh.matrixWorld);
      xs.push(p.x);
      ys.push(p.y);
      zs.push(p.z);
    });
    const pct = (a: number[], q: number) => {
      a.sort((m, n) => m - n);
      return a[Math.min(a.length - 1, Math.max(0, Math.floor(q * a.length)))];
    };
    const lo = new THREE.Vector3(pct(xs, 0.02), pct(ys, 0.02), pct(zs, 0.02));
    const hi = new THREE.Vector3(pct(xs, 0.98), pct(ys, 0.98), pct(zs, 0.98));
    worldBox = new THREE.Box3(lo, hi);
    // The splats include the sky dome high over the hills; a piece placed up there would be lost.
    placeBox = worldBox.clone().expandByScalar(1);
    placeBox.max.y = Math.min(placeBox.max.y, WORLD.walk.maxY + 1.5);
    debug.bounds = worldBox;
    debug.splats = xs.length * 4;
  }

  // ---------- picking ----------
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  type Hit = { distance: number; point: THREE.Vector3; object: THREE.Object3D };

  function toNdc(x: number, y: number): THREE.Vector2 {
    const r = canvas.getBoundingClientRect();
    return ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
  }

  function hitWorld(at: THREE.Vector2): Hit | null {
    if (!proxy) return null;
    raycaster.setFromCamera(at, camera);
    const hits: Hit[] = [];
    proxy.raycast(raycaster, hits);
    hits.sort((a, b) => a.distance - b.distance);
    return hits[0] ?? null;
  }

  function hitTagged(at: THREE.Vector2, group: THREE.Object3D, tag: string): string | null {
    raycaster.setFromCamera(at, camera);
    for (const h of raycaster.intersectObjects(group.children, true)) {
      let o: THREE.Object3D | null = h.object;
      while (o && o.userData[tag] === undefined) o = o.parent;
      if (o) return o.userData[tag] as string;
    }
    return null;
  }

  // Splat surfaces are thin seen from straight above, so every ground check looks
  // the way the camera does: from where the child stands, down toward the spot.
  const aim = new THREE.Vector3();
  function rayFromCamera(target: THREE.Vector3): Hit | null {
    if (!proxy) return null;
    aim.copy(target).sub(pose.position).normalize();
    raycaster.set(pose.position, aim);
    const hits: Hit[] = [];
    proxy.raycast(raycaster, hits);
    hits.sort((a, b) => a.distance - b.distance);
    return hits[0] ?? null;
  }

  // Each splat raycast costs several milliseconds, so the ground is only measured again after the camera moves.
  const groundFrom = new THREE.Vector3(Infinity, 0, 0);
  let groundYaw = 0;
  let castThisFrame = false;

  function measureGround() {
    if (!proxy || (pose.position.distanceToSquared(groundFrom) < 1e-4 && Math.abs(pose.yaw - groundYaw) < 1e-3)) return;
    groundFrom.copy(pose.position);
    groundYaw = pose.yaw;
    castThisFrame = true;
    // A little ahead of the feet: Marble leaves a hole right under its own camera.
    const ahead = new THREE.Vector3(pose.position.x - Math.sin(pose.yaw) * 0.6, pose.position.y - 3, pose.position.z - Math.cos(pose.yaw) * 0.6);
    const hit = rayFromCamera(ahead);
    groundY = hit && hit.distance < 6 ? hit.point.y : WORLD.groundY;
  }

  /** How high the ground is near a spot, as the camera sees it (null if nothing is there). */
  function groundAt(x: number, y: number, z: number): number | null {
    const hit = rayFromCamera(new THREE.Vector3(x, y, z));
    if (!hit) return null;
    // A bank in the way stops the ray short of the spot; that bank is the ground we want.
    return Math.hypot(hit.point.x - x, hit.point.z - z) < 1.5 ? hit.point.y : null;
  }

  /**
   * A bridge aimed at the water would sink into the banks. Look at the ground under
   * both ends and lift it so it rests on the lower bank.
   */
  function fitToBanks(point: THREE.Vector3, length: number, turn: number) {
    const half = length / 2;
    const dx = Math.cos(turn) * half;
    const dz = -Math.sin(turn) * half;
    const ends = [groundAt(point.x + dx, point.y, point.z + dz), groundAt(point.x - dx, point.y, point.z - dz)].filter((v): v is number => v !== null);
    if (ends.length) point.y = Math.max(point.y, Math.min(...ends) - 0.22);
  }

  /** Keep the camera inside the part of the world that looks right. */
  function clampToWalk(p: THREE.Vector3) {
    const dx = p.x - walkCenter.x;
    const dz = p.z - walkCenter.z;
    const d = Math.hypot(dx, dz);
    if (d > WORLD.walk.radius) {
      p.x = walkCenter.x + (dx / d) * WORLD.walk.radius;
      p.z = walkCenter.z + (dz / d) * WORLD.walk.radius;
    }
    p.y = Math.max(WORLD.walk.minY, Math.min(WORLD.walk.maxY, p.y));
  }

  /** The turn a piece gets when placed now: facing the child, plus any turns they asked for. */
  function facingDeg(kind: BuildKind, extra: number): number {
    return (((pose.yaw / DEG + (FACING[kind] ?? 0) + extra) % 360) + 360) % 360;
  }

  // ---------- the child's pieces ----------
  const meshes = new Map<string, THREE.Group>();
  const pops = new Map<THREE.Object3D, number>(); // pieces growing in, and when they started

  function syncPieces(pieces: Piece[], animate: boolean) {
    const ids = new Set(pieces.map((p) => p.id));
    for (const [id, g] of meshes) {
      if (!ids.has(id)) {
        piecesGroup.remove(g);
        disposeObject(g);
        meshes.delete(id);
      }
    }
    for (const p of pieces) {
      if (meshes.has(p.id)) continue;
      const g = makePiece(p.kind, p.length);
      g.position.set(...p.position);
      g.rotation.y = p.rotation * DEG;
      g.userData.pieceId = p.id;
      piecesGroup.add(g);
      meshes.set(p.id, g);
      if (animate && !still.matches) pops.set(g, performance.now());
    }
    applyTime(hud.get().timeOfDay);
  }

  let ring: THREE.Mesh | null = null;
  function syncSelection(id: string | null) {
    if (ring) {
      scene.remove(ring);
      disposeObject(ring);
      ring = null;
    }
    const target = id ? meshes.get(id) : null;
    if (!target) return;
    ring = makeSelectionRing(target);
    ring.position.copy(target.position).setY(target.position.y + 0.04);
    ring.renderOrder = 10;
    scene.add(ring);
  }

  // ---------- the ghost: where the next piece would go ----------
  let ghost: THREE.Group | null = null;
  let ghostKey = "";
  let ghostValid = false;
  const ghostPoint = new THREE.Vector3();

  function syncGhost(s: HudState) {
    const key = s.mode === "build" && s.status === "ready" ? `${s.tool}:${buildOf(s.tool).stretch ? s.length : 1}` : "";
    if (key !== ghostKey) {
      if (ghost) {
        scene.remove(ghost);
        disposeObject(ghost);
        ghost = null;
      }
      ghostKey = key;
      if (key) {
        ghost = makeGhost(s.tool, buildOf(s.tool).stretch ? s.length : 1);
        ghost.renderOrder = 10;
        ghost.traverse((o) => (o.renderOrder = 10));
        ghost.visible = false;
        scene.add(ghost);
        ghostDirty = true;
      }
    }
  }

  // Where the ghost follows: the mouse when there is one over the world, else the screen center.
  let hover: { x: number; y: number } | null = null;
  let ghostDirty = true;
  let lastGhostCast = 0;

  /** Ground a piece can stand on: within reach, inside the world, and not up in the sky. */
  function placeable(hit: Hit | null): hit is Hit {
    return !!hit && hit.distance <= MAX_REACH && !!placeBox?.containsPoint(hit.point);
  }

  function updateGhost(now: number) {
    // One splat raycast per frame at most: the ground check may already have had this one.
    if (!ghost || !ghostDirty || castThisFrame || now - lastGhostCast < (coarse ? 150 : 70)) return;
    ghostDirty = false;
    lastGhostCast = now;
    const at = hover ? toNdc(hover.x, hover.y) : ndc.set(0, 0);
    const hit = hitWorld(at);
    ghostValid = placeable(hit);
    if (hit) {
      ghostPoint.copy(hit.point);
      ghost.position.copy(hit.point);
      ghost.visible = true;
    } else {
      ghost.visible = false;
    }
    tintGhost(ghost, ghostValid);
    const prev = hud.get().ghost;
    const distanceM = hit ? Math.round(hit.distance * WORLD.metersPerUnit * 10) / 10 : null;
    if (prev.valid !== ghostValid || prev.distanceM !== distanceM) hud.set({ ghost: { valid: ghostValid, distanceM } });
  }

  function place(at: THREE.Vector2 | null) {
    const s = hud.get();
    if (s.mode !== "build" || s.status !== "ready") return;
    const hit = at ? hitWorld(at) : null;
    let point: THREE.Vector3 | null = null;
    if (at) {
      if (placeable(hit)) point = hit.point.clone();
    } else if (ghostValid && ghost?.visible) {
      point = ghostPoint.clone();
    }
    if (!point) {
      actions.notify(hit && hit.distance > MAX_REACH ? "That's too far away. Walk a little closer." : "Pick a spot on the ground.");
      return;
    }
    const build = buildOf(s.tool);
    if (build.stretch) fitToBanks(point, s.length * build.stretch.unitM, facingDeg(s.tool, s.rotation) * DEG);
    actions.addPiece({
      kind: s.tool,
      position: [point.x, point.y, point.z],
      rotation: facingDeg(s.tool, s.rotation),
      length: build.stretch ? s.length : 1,
    });
    actions.notify(build.stretch ? `Your ${build.noun} is in. ${s.length} ${build.stretch.unit}s!` : `Your ${build.noun} is in!`);
  }

  // ---------- story markers ----------
  const markerSprites = new Map<MomentId, THREE.Sprite>();
  MOMENTS.forEach((m, i) => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: markerTexture(i + 1), depthTest: false, transparent: true }));
    sprite.position.set(...m.focus);
    sprite.scale.setScalar(0.9);
    sprite.renderOrder = 20;
    sprite.userData.moment = m.id;
    markersGroup.add(sprite);
    markerSprites.set(m.id, sprite);
  });

  // ---------- fireflies at night ----------
  const FLIES = 140;
  const flyBase = new Float32Array(FLIES * 3);
  const flyGeo = new THREE.BufferGeometry();
  flyGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(FLIES * 3), 3));
  const flyDot = glowTexture();
  const flies = new THREE.Points(
    flyGeo,
    new THREE.PointsMaterial({ color: 0xffd98a, map: flyDot, size: 0.14, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  flies.renderOrder = 15;
  flies.visible = false;
  flies.frustumCulled = false;
  scene.add(flies);
  function scatterFlies() {
    const b = worldBox;
    for (let i = 0; i < FLIES; i++) {
      const r = 3 + Math.random() * 14;
      const a = Math.random() * Math.PI * 2;
      flyBase[i * 3] = pose.position.x + Math.cos(a) * r;
      flyBase[i * 3 + 1] = (b ? b.min.y : pose.position.y - 2) + 0.4 + Math.random() * 2.2;
      flyBase[i * 3 + 2] = pose.position.z + Math.sin(a) * r;
    }
  }

  function applyTime(t: TimeOfDay) {
    const tint = TINTS[t];
    // Spark multiplies the splats' own sRGB colors by recolor as is, so the tint goes in
    // unconverted; through three's color management night would come out far too dark.
    for (const m of [proxy, shown]) if (m) m.recolor.setHex(tint.splat, THREE.LinearSRGBColorSpace);
    (scene.background as THREE.Color).setHex(tint.sky);
    hemi.intensity = tint.hemi;
    sun.intensity = tint.sun;
    sun.color.setHex(tint.sunColor);
    if (t === "night" && !flies.visible) scatterFlies();
    flies.visible = t === "night";
    piecesGroup.traverse((o) => {
      if (o instanceof THREE.Mesh && o.userData.glow) (o.material as THREE.MeshStandardMaterial).emissiveIntensity = t === "night" ? 2.4 : 0.6;
    });
  }

  // ---------- flying to a story moment ----------
  let flight: { from: Pose; to: Pose; start: number; ms: number; moment: MomentId } | null = null;

  function flyTo(id: MomentId) {
    const m = momentOf(id);
    const to: Pose = { position: new THREE.Vector3(...m.camera.position), yaw: m.camera.yawDeg * DEG, pitch: m.camera.pitchDeg * DEG };
    // Turn the short way round.
    let dy = to.yaw - pose.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    to.yaw = pose.yaw + dy;
    const dist = pose.position.distanceTo(to.position);
    // With reduced motion the camera cuts straight there instead of gliding.
    const ms = still.matches ? 1 : Math.min(2600, 900 + dist * 120 + Math.abs(dy) * 300);
    flight = { from: { position: pose.position.clone(), yaw: pose.yaw, pitch: pose.pitch }, to, start: performance.now(), ms, moment: id };
    look.vx = look.vy = 0;
    turnLeft = 0; // a turn still queued from the buttons would swing the view away on arrival
    hud.set({ flying: true });
  }

  function stepFlight(now: number) {
    if (!flight) return;
    const t = Math.min(1, (now - flight.start) / flight.ms);
    const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    pose.position.lerpVectors(flight.from.position, flight.to.position, e);
    pose.yaw = flight.from.yaw + (flight.to.yaw - flight.from.yaw) * e;
    pose.pitch = flight.from.pitch + (flight.to.pitch - flight.from.pitch) * e;
    if (t >= 1) {
      arrive(flight.moment);
      flight = null;
      hud.set({ flying: false });
    }
  }

  function arrive(id: MomentId) {
    hud.set((s) => ({ moment: id, visited: s.visited.includes(id) ? s.visited : [...s.visited, id] }));
  }

  function cancelFlight() {
    if (!flight) return;
    flight = null;
    hud.set({ flying: false });
  }

  // ---------- input: look, walk, tap ----------
  const look = { vx: 0, vy: 0 }; // leftover spin after a flick, radians per second
  const pointers = new Map<number, { x: number; y: number; sx: number; sy: number; t: number }>();
  let pinch: number | null = null;
  let multi = false; // a second finger came down during this touch, so lifting the last one is not a tap
  let turnLeft = 0; // radians still to turn from the turn buttons
  const pad = new THREE.Vector3(); // held movement from the on-screen pad
  const keys = new Set<string>();

  // Lets the story tour know the child is moving or looking around on their own. A few
  // times a second is plenty, and it keeps a drag from waking every HUD listener.
  let lastSteer = -Infinity;
  function steered() {
    const now = performance.now();
    if (now - lastSteer < 250) return;
    lastSteer = now;
    actions.steered();
  }

  function onPointerDown(e: PointerEvent) {
    // Right and middle clicks do nothing in the world (the context menu is off, so a piece would appear unasked).
    if (e.pointerType === "mouse" && e.button !== 0) return;
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now() });
    look.vx = look.vy = 0;
    turnLeft = 0; // grabbing the world stops a turn from the buttons too
    cancelFlight();
    if (pointers.size >= 2) multi = true;
    if (pointers.size === 2) pinch = spread();
  }

  function spread(): number {
    const [a, b] = [...pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  let lastMoveT = 0;
  function onPointerMove(e: PointerEvent) {
    if (e.pointerType === "mouse") {
      hover = { x: e.clientX, y: e.clientY };
      ghostDirty = true;
    }
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (pointers.size === 1) {
      pose.yaw += dx * LOOK_SPEED;
      pose.pitch = clampPitch(pose.pitch + dy * LOOK_SPEED);
      const now = performance.now();
      const dt = Math.max(8, now - lastMoveT) / 1000;
      lastMoveT = now;
      look.vx = (dx * LOOK_SPEED) / dt;
      look.vy = (dy * LOOK_SPEED) / dt;
      // A tap wobbles a little; past TAP_SLOP the child is really looking around.
      if (Math.hypot(e.clientX - p.sx, e.clientY - p.sy) >= TAP_SLOP) steered();
    } else if (pointers.size === 2 && pinch !== null) {
      // Pinch out walks forward, pinch in walks back.
      const s = spread();
      if (s !== pinch) steered();
      walk(0, 0, (s - pinch) * 0.02);
      pinch = s;
    }
    ghostDirty = true;
  }

  function onPointerUp(e: PointerEvent) {
    const p = pointers.get(e.pointerId);
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    const wasMulti = multi;
    if (pointers.size === 0) multi = false;
    if (!p) return;
    if (performance.now() - lastMoveT > 80) look.vx = look.vy = 0; // held still before letting go: no spin
    const moved = Math.hypot(e.clientX - p.sx, e.clientY - p.sy);
    if (moved < TAP_SLOP && performance.now() - p.t < TAP_MS && pointers.size === 0 && !wasMulti) {
      look.vx = look.vy = 0;
      tap(e.clientX, e.clientY);
    }
  }

  function tap(x: number, y: number) {
    const at = toNdc(x, y).clone();
    const s = hud.get();
    const pieceId = hitTagged(at, piecesGroup, "pieceId");
    if (pieceId) {
      actions.select(s.selected === pieceId ? null : pieceId);
      return;
    }
    const moment = hitTagged(at, markersGroup, "moment") as MomentId | null;
    if (moment && s.mode === "explore") return flyTo(moment);
    if (s.mode === "build") {
      if (s.selected) actions.select(null);
      place(at);
    } else if (s.selected) {
      actions.select(null);
    }
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    cancelFlight();
    steered();
    walk(0, 0, -e.deltaY * 0.01);
  }

  function onPointerLeave() {
    hover = null;
    ghostDirty = true;
  }

  const MOVE_KEYS: Record<string, [number, number, number]> = {
    KeyW: [0, 0, 1],
    ArrowUp: [0, 0, 1],
    KeyS: [0, 0, -1],
    ArrowDown: [0, 0, -1],
    KeyA: [-1, 0, 0],
    KeyD: [1, 0, 0],
    KeyE: [0, 1, 0],
    KeyQ: [0, -1, 0],
  };

  function typing(e: KeyboardEvent): boolean {
    const t = e.target as HTMLElement | null;
    return !!t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));
  }

  function onKeyDown(e: KeyboardEvent) {
    if (typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
    const s = hud.get();
    if (s.postcardOpen) return;
    if (MOVE_KEYS[e.code] || e.code === "ArrowLeft" || e.code === "ArrowRight") {
      keys.add(e.code);
      cancelFlight();
      steered();
      e.preventDefault();
      return;
    }
    // Walking may repeat while a key is held; nothing else does. A child leaning on Enter or
    // Backspace would otherwise stack dozens of pieces or take the whole build away. Stopping
    // the repeated Enter here also keeps a focused HUD button from firing again and again.
    if (e.repeat) {
      if (e.key === "Enter") e.preventDefault();
      return;
    }
    // The key's place, not its letter: on a French keyboard the key printed 1 sends "&".
    const digit = /^(?:Digit|Numpad)([1-8])$/.exec(e.code)?.[1];
    const tool = digit ? buildByKey(digit) : null;
    if (tool) return actions.pickTool(tool);
    switch (e.code) {
      case "KeyB":
        return actions.setMode(s.mode === "build" ? "explore" : "build");
      case "Escape":
        return s.selected ? actions.select(null) : actions.setMode("explore");
      case "KeyR":
        return actions.rotate(e.shiftKey ? -45 : 45);
      case "KeyX":
      case "Delete":
      case "Backspace":
        // While exploring, only a piece the child picked can go; a stray key never takes the last one.
        if (s.mode !== "build" && !s.selected) return;
        e.preventDefault();
        return actions.removePiece();
      case "BracketLeft":
      case "BracketRight": {
        const st = buildOf(s.tool).stretch;
        if (!st) return;
        const next = s.length + (e.code === "BracketRight" ? 1 : -1);
        return actions.setLength(Math.max(st.min, Math.min(st.max, next)));
      }
      case "Enter":
        if (s.mode === "build" && (e.target as HTMLElement | null)?.tagName !== "BUTTON") {
          e.preventDefault();
          place(null);
        }
        return;
      case "KeyH":
        return goHome();
    }
  }

  function onKeyUp(e: KeyboardEvent) {
    keys.delete(e.code);
  }

  function onBlur() {
    keys.clear();
    pad.set(0, 0, 0);
  }

  // One signal takes every listener away at teardown. The canvas ones matter most: they
  // hold on to the whole world, so leaving them would keep it all in memory.
  const listening = new AbortController();
  const signal = listening.signal;
  canvas.addEventListener("pointerdown", onPointerDown, { signal });
  canvas.addEventListener("pointermove", onPointerMove, { signal });
  canvas.addEventListener("pointerup", onPointerUp, { signal });
  canvas.addEventListener("pointercancel", onPointerUp, { signal });
  canvas.addEventListener("pointerleave", onPointerLeave, { signal });
  canvas.addEventListener("wheel", onWheel, { passive: false, signal });
  canvas.addEventListener("contextmenu", (e) => e.preventDefault(), { signal });
  window.addEventListener("keydown", onKeyDown, { signal });
  window.addEventListener("keyup", onKeyUp, { signal });
  window.addEventListener("blur", onBlur, { signal });

  const fwd = new THREE.Vector3();
  const right = new THREE.Vector3();
  /** Move relative to where the camera faces, level with the ground: x right, y up, z forward. */
  function walk(x: number, y: number, z: number) {
    fwd.set(-Math.sin(pose.yaw), 0, -Math.cos(pose.yaw));
    right.set(Math.cos(pose.yaw), 0, -Math.sin(pose.yaw));
    pose.position.addScaledVector(fwd, z).addScaledVector(right, x);
    pose.position.y += y;
    ghostDirty = true;
  }

  function clampPitch(p: number) {
    return Math.max(-80 * DEG, Math.min(70 * DEG, p));
  }

  function goHome() {
    const home = startPose();
    flight = { from: { position: pose.position.clone(), yaw: pose.yaw, pitch: pose.pitch }, to: home, start: performance.now(), ms: still.matches ? 1 : 1400, moment: MOMENTS[0].id };
    look.vx = look.vy = 0;
    turnLeft = 0;
    hud.set({ flying: true });
  }

  // ---------- the frame loop ----------
  let last = performance.now();
  let lastGround = 0;
  let lastPublish = 0;
  const elapsed = { t: 0 };

  function frame(now: number) {
    const dt = Math.min(0.05, (now - last) / 1000);
    watchFrames(now - last, now);
    last = now;
    castThisFrame = false;
    elapsed.t += dt;

    if (flight) {
      stepFlight(now);
    } else {
      // Keys and the on-screen pad.
      const mv = new THREE.Vector3().copy(pad);
      for (const k of keys) {
        const m = MOVE_KEYS[k];
        if (m) mv.add(new THREE.Vector3(...m));
      }
      if (mv.lengthSq() > 0) {
        if (Math.hypot(mv.x, mv.z) > 1) {
          const l = Math.hypot(mv.x, mv.z);
          mv.x /= l;
          mv.z /= l;
        }
        walk(mv.x * WALK_SPEED * dt, mv.y * WALK_SPEED * 0.6 * dt, mv.z * WALK_SPEED * dt);
      }
      const turnKeys = (keys.has("ArrowLeft") ? 1 : 0) - (keys.has("ArrowRight") ? 1 : 0);
      if (turnKeys) pose.yaw += turnKeys * 1.6 * dt;
      // A key or the pad held down keeps the child walking, so the tour keeps hearing about it.
      if (mv.lengthSq() > 0 || turnKeys) steered();
      if (turnLeft !== 0) {
        const step = Math.sign(turnLeft) * Math.min(Math.abs(turnLeft), 2.4 * dt);
        pose.yaw += step;
        turnLeft -= step;
      }
      // A flick keeps spinning a little, then settles.
      if (pointers.size === 0 && (look.vx || look.vy)) {
        pose.yaw += look.vx * dt;
        pose.pitch = clampPitch(pose.pitch + look.vy * dt);
        const decay = Math.exp(-dt / 0.14);
        look.vx *= decay;
        look.vy *= decay;
        if (Math.abs(look.vx) + Math.abs(look.vy) < 0.002) look.vx = look.vy = 0;
        ghostDirty = true;
      }
      // Stay inside the world and above the ground.
      clampToWalk(pose.position);
      if (now - lastGround > 220) {
        lastGround = now;
        measureGround();
      }
      if (pose.position.y < groundY + MIN_HEIGHT) {
        pose.position.y += (groundY + MIN_HEIGHT - pose.position.y) * Math.min(1, dt * 10);
      }
    }
    applyPose();

    // Pieces pop in with a little bounce.
    for (const [g, start] of pops) {
      const t = Math.min(1, (now - start) / 420);
      const s = t < 1 ? 1 + 0.25 * Math.sin(t * Math.PI) * (1 - t) - 0.4 * (1 - t) * (1 - t) : 1;
      g.scale.setScalar(Math.max(0.05, s));
      if (t >= 1) pops.delete(g);
    }
    if (ring) (ring.material as THREE.MeshBasicMaterial).opacity = 0.65 + 0.3 * Math.sin(elapsed.t * 4);

    // With reduced motion the markers stop bobbing and the fireflies hold still.
    const drift = still.matches ? 0 : elapsed.t;

    // Story markers bob, and the one you're at rests.
    const s = hud.get();
    for (const [id, sprite] of markerSprites) {
      const m = momentOf(id);
      sprite.position.y = m.focus[1] + Math.sin(drift * 1.8 + m.focus[0]) * 0.08;
      sprite.material.opacity = s.moment === id ? 0.35 : s.visited.includes(id) ? 0.7 : 1;
      const d = camera.position.distanceTo(sprite.position);
      sprite.scale.setScalar(Math.max(0.5, Math.min(1.6, d * 0.09)));
    }

    if (flies.visible) {
      const pos = flyGeo.getAttribute("position") as THREE.BufferAttribute;
      for (let i = 0; i < FLIES; i++) {
        pos.setXYZ(
          i,
          flyBase[i * 3] + Math.sin(drift * 0.6 + i) * 0.5,
          flyBase[i * 3 + 1] + Math.sin(drift * 0.9 + i * 1.7) * 0.25,
          flyBase[i * 3 + 2] + Math.cos(drift * 0.5 + i * 0.7) * 0.5,
        );
      }
      pos.needsUpdate = true;
      (flies.material as THREE.PointsMaterial).opacity = 0.7 + 0.3 * Math.sin(drift * 3);
    }

    if (ghost) ghost.rotation.y = facingDeg(s.tool, s.rotation) * DEG;
    updateGhost(now);
    if (now - lastPublish > 160) {
      lastPublish = now;
      publishReadouts();
    }
    renderer.render(scene, camera);
  }

  /** How far the camera is from a moment's view: 0 is right there, 1 is about a meter or 30 degrees off. */
  function viewGap(m: (typeof MOMENTS)[number]): number {
    const d = pose.position.distanceTo(new THREE.Vector3(...m.camera.position));
    const dy = Math.abs(Math.atan2(Math.sin(pose.yaw - m.camera.yawDeg * DEG), Math.cos(pose.yaw - m.camera.yawDeg * DEG))) / DEG;
    const dp = Math.abs(pose.pitch / DEG - m.camera.pitchDeg);
    return Math.max(d / 1.1, dy / 30, dp / 30);
  }

  function publishReadouts() {
    const s = hud.get();
    const m2u = WORLD.metersPerUnit;
    const heightM = Math.round((pose.position.y - groundY) * m2u * 10) / 10;
    const headingDeg = Math.round((((-pose.yaw / DEG) % 360) + 360) % 360);
    let nearest: HudState["readouts"]["nearest"] = null;
    for (const m of MOMENTS) {
      const d = pose.position.distanceTo(new THREE.Vector3(...m.focus)) * m2u;
      if (!nearest || d < nearest.distanceM) nearest = { moment: m.id, distanceM: Math.round(d * 10) / 10 };
    }
    const r = s.readouts;
    if (r.heightM !== heightM || r.headingDeg !== headingDeg || r.nearest?.moment !== nearest?.moment || r.nearest?.distanceM !== nearest?.distanceM) {
      hud.set({ readouts: { heightM, headingDeg, nearest } });
    }
    // Standing at a moment's spot and looking its way counts as being there. The
    // current moment holds on until you look well away, so close views don't flicker,
    // but a spot that is clearly closer takes over: the spots sit close together.
    if (!flight) {
      const current = s.moment ? momentOf(s.moment) : null;
      const held = current ? viewGap(current) : Infinity;
      const best = MOMENTS.map((m) => ({ m, gap: viewGap(m) })).sort((a, b) => a.gap - b.gap)[0];
      if (best && best.gap < 1 && best.m.id !== current?.id && best.gap + 0.4 < held) return arrive(best.m.id);
      if (held < 1.6) return;
      if (best && best.gap < 1) arrive(best.m.id);
      else if (current) hud.set({ moment: null });
    }
  }

  // ---------- size ----------
  const resize = () => {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    ghostDirty = true;
  };
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  // ---------- talking to the HUD ----------
  let prev = hud.get();
  syncPieces(prev.pieces, false);
  syncGhost(prev);
  const unsubscribe = hud.subscribe(() => {
    const s = hud.get();
    if (s.pieces !== prev.pieces) syncPieces(s.pieces, true);
    if (s.selected !== prev.selected || s.pieces !== prev.pieces) syncSelection(s.selected);
    if (s.mode !== prev.mode || s.tool !== prev.tool || s.length !== prev.length || s.rotation !== prev.rotation || s.status !== prev.status) syncGhost(s);
    if (s.timeOfDay !== prev.timeOfDay) applyTime(s.timeOfDay);
    prev = s;
  });

  registerWorld({
    flyTo,
    setMove: (x, y, z) => {
      pad.set(x, y, z);
      if (x || y || z) {
        cancelFlight();
        steered();
      }
    },
    turn: (deg) => {
      cancelFlight();
      steered();
      // With reduced motion the view turns at once instead of easing round.
      if (still.matches) {
        pose.yaw += deg * DEG;
        ghostDirty = true;
      } else {
        turnLeft += deg * DEG;
      }
    },
    placeAtCenter: () => {
      hover = null;
      ghostDirty = true; // the ghost goes back to the reticle
      // place() casts the one ray itself, and says "Pick a spot on the ground." when it finds none.
      place(new THREE.Vector2(0, 0));
    },
    home: goHome,
    snapshot: (maxWidth = 960) => {
      // The postcard shows the world and the child's pieces, not the HUD's helpers.
      const hidden: THREE.Object3D[] = [];
      for (const o of [ghost, ring, markersGroup]) if (o?.visible) hidden.push(o);
      hidden.forEach((o) => (o.visible = false));
      renderer.render(scene, camera);
      const src = renderer.domElement;
      const scale = Math.min(1, maxWidth / src.width);
      const out = document.createElement("canvas");
      out.width = Math.round(src.width * scale);
      out.height = Math.round(src.height * scale);
      out.getContext("2d")?.drawImage(src, 0, 0, out.width, out.height);
      hidden.forEach((o) => (o.visible = true));
      try {
        return out.toDataURL("image/jpeg", 0.86);
      } catch {
        return null;
      }
    },
  });

  // For checks in a test browser: where things are, without reaching into React.
  const debug: Record<string, unknown> = {
    camera,
    pose,
    scene,
    get ground() {
      return groundY;
    },
    hitCenter: () => hitWorld(new THREE.Vector2(0, 0))?.point.toArray() ?? null,
    groundAt,
    hitAt: (x: number, y: number) => hitWorld(toNdc(x, y).clone())?.point.toArray() ?? null,
    setPose: (p: [number, number, number], yawDeg: number, pitchDeg: number) => {
      cancelFlight();
      pose.position.set(...p);
      pose.yaw = yawDeg * DEG;
      pose.pitch = pitchDeg * DEG;
      look.vx = look.vy = 0;
      ghostDirty = true;
    },
  };
  if (process.env.NODE_ENV !== "production") Object.assign(debug, { hud, actions, flyTo });
  (window as unknown as { __heirloom?: unknown }).__heirloom = debug;

  renderer.setAnimationLoop(frame);

  return () => {
    disposed = true;
    renderer.setAnimationLoop(null);
    registerWorld(null);
    unsubscribe();
    ro.disconnect();
    listening.abort();
    for (const g of meshes.values()) disposeObject(g);
    if (ghost) disposeObject(ghost);
    if (ring) disposeObject(ring);
    disposeSharedMaterials();
    markerSprites.forEach((s) => {
      s.material.map?.dispose();
      s.material.dispose();
    });
    flyGeo.dispose();
    flyDot.dispose();
    (flies.material as THREE.Material).dispose();
    proxy?.dispose();
    if (shown && shown !== proxy) shown.dispose();
    spark.dispose();
    renderer.dispose();
    // Hand the WebGL context back now; browsers only allow a few at once.
    renderer.forceContextLoss();
    canvas.remove();
    delete (window as unknown as { __heirloom?: unknown }).__heirloom;
  };
}

function buildByKey(key: string): BuildKind | null {
  const kinds: BuildKind[] = ["bridge", "garden", "house", "treehouse", "lantern", "bench", "boat", "tree"];
  return kinds.find((k) => buildOf(k).key === key) ?? null;
}

/** A round honey badge with the moment's number, drawn once into a texture. */
function markerTexture(n: number): THREE.CanvasTexture {
  const size = 128;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const glow = g.createRadialGradient(64, 64, 20, 64, 64, 64);
  glow.addColorStop(0, "rgba(255, 214, 130, 0.9)");
  glow.addColorStop(1, "rgba(255, 214, 130, 0)");
  g.fillStyle = glow;
  g.fillRect(0, 0, size, size);
  g.beginPath();
  g.arc(64, 64, 30, 0, Math.PI * 2);
  g.fillStyle = "#e3a83d";
  g.fill();
  g.lineWidth = 5;
  g.strokeStyle = "#fff8e6";
  g.stroke();
  g.fillStyle = "#2c3a32";
  g.font = "700 34px ui-rounded, system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(String(n), 64, 66);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** A soft round glow, so each firefly reads as a little light and not a square. */
function glowTexture(): THREE.CanvasTexture {
  const size = 32;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const glow = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  glow.addColorStop(0, "rgba(255, 255, 255, 1)");
  glow.addColorStop(0.35, "rgba(255, 255, 255, 0.6)");
  glow.addColorStop(1, "rgba(255, 255, 255, 0)");
  g.fillStyle = glow;
  g.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}
