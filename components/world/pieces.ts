import * as THREE from "three";
import { buildOf, type BuildKind } from "./config";

/**
 * The things a child can build, as small hand-made 3D models. Each one is a Group
 * whose origin sits on the ground at its center, facing +x, sized in meters.
 * They are built from boxes, cylinders and cones on purpose: toy-like, warm, and
 * light enough to place dozens on an iPad.
 */

const C = {
  wood: 0x8a5a3b,
  woodLight: 0xb07a52,
  woodDark: 0x5e3c26,
  honey: 0xe3a83d,
  geranium: 0xc8574a,
  river: 0x5f8296,
  leaf: 0x6f8e5f,
  leafLight: 0x8fae74,
  cream: 0xf6e2b5,
  stone: 0xb9b2a3,
  pine: 0x2c3a32,
};

const materials = new Map<string, THREE.MeshStandardMaterial>();

function mat(color: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
  const key = `${color}:${JSON.stringify(extra)}`;
  let m = materials.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, flatShading: true, ...extra });
    materials.set(key, m);
  }
  return m;
}

function box(w: number, h: number, d: number, color: number, x = 0, y = 0, z = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  mesh.position.set(x, y, z);
  return mesh;
}

function cyl(rTop: number, rBottom: number, h: number, color: number, x = 0, y = 0, z = 0, segments = 8): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, segments), mat(color));
  mesh.position.set(x, y, z);
  return mesh;
}

function ball(r: number, color: number, x = 0, y = 0, z = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), mat(color));
  mesh.position.set(x, y, z);
  return mesh;
}

/** A gently arched footbridge. `planks` is the length the child chose, in boards they can count. */
function bridge(planks: number): THREE.Group {
  const g = new THREE.Group();
  const unit = buildOf("bridge").stretch!.unitM;
  const length = planks * unit;
  const rise = Math.min(0.6, length * 0.12);
  const archY = (x: number) => 0.25 + rise * Math.cos((x / length) * Math.PI);
  for (let i = 0; i < planks; i++) {
    const x = -length / 2 + unit * (i + 0.5);
    const plank = box(unit * 0.86, 0.06, 1.3, i % 2 ? C.woodLight : C.wood, x, archY(x), 0);
    plank.rotation.z = -Math.sin((x / length) * Math.PI) * rise * (Math.PI / length);
    plank.userData.plank = i + 1; // so the HUD can count them
    g.add(plank);
  }
  // Posts and rails on both sides, following the arch.
  const posts = Math.max(2, Math.round(planks / 3) + 1);
  for (const side of [-0.62, 0.62]) {
    const railPoints: THREE.Vector3[] = [];
    for (let i = 0; i < posts; i++) {
      const x = -length / 2 + (length * i) / (posts - 1);
      const y = archY(x);
      g.add(box(0.08, 0.7, 0.08, C.woodDark, x, y + 0.35, side));
      railPoints.push(new THREE.Vector3(x, y + 0.68, side));
    }
    const curve = new THREE.CatmullRomCurve3(railPoints);
    const rail = new THREE.Mesh(new THREE.TubeGeometry(curve, planks * 2, 0.035, 5), mat(C.woodDark));
    g.add(rail);
  }
  // Feet where the bridge meets the banks.
  for (const x of [-length / 2, length / 2]) g.add(box(0.5, 0.3, 1.5, C.stone, x, 0.12, 0));
  return g;
}

function garden(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(2.4, 0.16, 1.6, C.woodDark, 0, 0.08, 0)); // the bed
  g.add(box(2.2, 0.06, 1.4, 0x6b5a3e, 0, 0.17, 0)); // soil
  for (let i = 0; i < 12; i++) {
    const x = -0.9 + (i % 4) * 0.6;
    const z = -0.45 + Math.floor(i / 4) * 0.45;
    const h = 0.28 + ((i * 37) % 10) / 50;
    g.add(cyl(0.015, 0.02, h, C.leaf, x, 0.2 + h / 2, z, 5));
    g.add(ball(0.09, i % 5 === 0 ? C.geranium : C.honey, x, 0.24 + h, z));
    g.add(ball(0.035, C.cream, x, 0.3 + h, z));
  }
  return g;
}

function house(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(2.6, 0.2, 2.4, C.stone, 0, 0.1, 0));
  g.add(box(2.4, 1.7, 2.2, C.woodLight, 0, 1.05, 0));
  // Roof: two slabs meeting at the ridge.
  for (const s of [-1, 1]) {
    const slab = box(2.8, 0.1, 1.5, C.woodDark, 0, 2.25, s * 0.55);
    slab.rotation.x = s * 0.62;
    g.add(slab);
  }
  // Gable ends.
  const gable = new THREE.Shape([new THREE.Vector2(-1.1, 0), new THREE.Vector2(1.1, 0), new THREE.Vector2(0, 0.75)]);
  for (const x of [-1.2, 1.2]) {
    const m = new THREE.Mesh(new THREE.ShapeGeometry(gable), mat(C.woodLight, { side: THREE.DoubleSide }));
    m.rotation.y = Math.PI / 2;
    m.position.set(x, 1.9, 0);
    g.add(m);
  }
  g.add(box(0.5, 0.95, 0.06, C.woodDark, 0, 0.67, 1.12)); // door
  for (const x of [-0.75, 0.75]) {
    g.add(box(0.46, 0.4, 0.05, C.cream, x, 1.25, 1.12)); // window
    g.add(box(0.56, 0.12, 0.18, C.woodDark, x, 0.99, 1.17)); // flower box
    for (const dx of [-0.17, 0, 0.17]) g.add(ball(0.07, C.geranium, x + dx, 1.1, 1.2));
  }
  g.add(box(0.3, 0.7, 0.3, C.stone, 0.7, 2.5, -0.4)); // chimney
  return g;
}

function tree(scale = 1): THREE.Group {
  const g = new THREE.Group();
  g.add(cyl(0.14 * scale, 0.2 * scale, 1.6 * scale, C.woodDark, 0, 0.8 * scale, 0, 7));
  g.add(ball(1.0 * scale, C.leaf, 0, 2.3 * scale, 0));
  g.add(ball(0.7 * scale, C.leafLight, 0.55 * scale, 2.0 * scale, 0.3 * scale));
  g.add(ball(0.65 * scale, C.leaf, -0.5 * scale, 2.1 * scale, -0.35 * scale));
  return g;
}

function treehouse(): THREE.Group {
  const g = tree(1.35);
  const deck = box(2.0, 0.12, 2.0, C.wood, 0, 2.2, 0);
  g.add(deck);
  const hut = box(1.3, 0.95, 1.2, C.woodLight, 0, 2.75, 0);
  g.add(hut);
  for (const s of [-1, 1]) {
    const slab = box(1.6, 0.08, 0.85, C.geranium, 0, 3.42, s * 0.33);
    slab.rotation.x = s * 0.7;
    g.add(slab);
  }
  g.add(box(0.36, 0.3, 0.05, C.cream, 0, 2.85, 0.61));
  // A ladder down to the ground, rungs to count.
  for (const x of [0.75, 1.05]) g.add(box(0.06, 2.2, 0.06, C.woodDark, x, 1.1, 0.95));
  for (let i = 0; i < 7; i++) g.add(box(0.36, 0.05, 0.05, C.wood, 0.9, 0.25 + i * 0.3, 0.95));
  return g;
}

function lantern(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(0.3, 0.1, 0.3, C.stone, 0, 0.05, 0));
  g.add(cyl(0.04, 0.05, 1.5, C.woodDark, 0, 0.8, 0, 6));
  const glow = new THREE.Mesh(
    new THREE.BoxGeometry(0.24, 0.3, 0.24),
    new THREE.MeshStandardMaterial({ color: C.honey, emissive: C.honey, emissiveIntensity: 0.6, roughness: 0.4 }),
  );
  glow.position.set(0, 1.62, 0);
  glow.userData.glow = true; // brighter at night
  g.add(glow);
  g.add(box(0.32, 0.06, 0.32, C.woodDark, 0, 1.8, 0));
  return g;
}

function bench(): THREE.Group {
  const g = new THREE.Group();
  for (const z of [-0.12, 0.12]) g.add(box(1.5, 0.06, 0.2, C.woodLight, 0, 0.46, z));
  g.add(box(1.5, 0.22, 0.05, C.woodLight, 0, 0.75, -0.26));
  for (const x of [-0.62, 0.62]) {
    g.add(box(0.07, 0.46, 0.5, C.woodDark, x, 0.23, 0));
    g.add(box(0.07, 0.4, 0.07, C.woodDark, x, 0.65, -0.26));
  }
  return g;
}

function boat(): THREE.Group {
  const g = new THREE.Group();
  // Half a cylinder, lying along x with the open side up, squashed into a shallow hull.
  const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 3, 10, 1, true, 0, Math.PI), mat(C.wood, { side: THREE.DoubleSide }));
  hull.rotation.z = -Math.PI / 2;
  hull.scale.x = 0.6;
  hull.position.y = 0.4;
  g.add(hull);
  g.add(box(0.12, 0.06, 1.0, C.woodLight, -0.6, 0.38, 0));
  g.add(box(0.12, 0.06, 1.0, C.woodLight, 0.5, 0.38, 0));
  const oar = box(2.2, 0.04, 0.08, C.woodDark, 0, 0.5, 0.2);
  oar.rotation.y = 0.5;
  g.add(oar);
  return g;
}

export function makePiece(kind: BuildKind, length = 1): THREE.Group {
  let g: THREE.Group;
  switch (kind) {
    case "bridge":
      g = bridge(length);
      break;
    case "garden":
      g = garden();
      break;
    case "house":
      g = house();
      break;
    case "treehouse":
      g = treehouse();
      break;
    case "lantern":
      g = lantern();
      break;
    case "bench":
      g = bench();
      break;
    case "boat":
      g = boat();
      break;
    case "tree":
      g = tree();
      break;
  }
  g.userData.kind = kind;
  return g;
}

/** A see-through copy for showing where the piece would go, with a ring on the ground. */
export function makeGhost(kind: BuildKind, length = 1): THREE.Group {
  const g = makePiece(kind, length);
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      const m = (o.material as THREE.MeshStandardMaterial).clone();
      m.transparent = true;
      m.opacity = 0.6;
      m.depthWrite = false;
      o.material = m;
    }
  });
  const box3 = new THREE.Box3().setFromObject(g);
  const radius = Math.max(box3.max.x - box3.min.x, box3.max.z - box3.min.z) / 2 + 0.25;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(radius - 0.08, radius, 48),
    new THREE.MeshBasicMaterial({ color: C.honey, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  ring.userData.ring = true;
  g.add(ring);
  return g;
}

/** Show whether the ghost can be placed: warm when yes, red when there is no ground. */
export function tintGhost(g: THREE.Object3D, valid: boolean): void {
  g.traverse((o) => {
    if (o instanceof THREE.Mesh && o.userData.ring) (o.material as THREE.MeshBasicMaterial).color.setHex(valid ? C.honey : C.geranium);
  });
}

/** A soft ring under a piece the child has tapped. */
export function makeSelectionRing(target: THREE.Object3D): THREE.Mesh {
  const box3 = new THREE.Box3().setFromObject(target);
  const size = box3.getSize(new THREE.Vector3());
  const radius = Math.max(size.x, size.z) / 2 + 0.3;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(radius - 0.1, radius, 48),
    new THREE.MeshBasicMaterial({ color: C.honey, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  return ring;
}

export function disposeObject(o: THREE.Object3D): void {
  o.traverse((c) => {
    if (c instanceof THREE.Mesh) {
      c.geometry.dispose();
      const m = c.material as THREE.Material;
      // Shared materials live in the cache; only clones (ghosts, rings) are owned here.
      if (![...materials.values()].includes(m as THREE.MeshStandardMaterial)) m.dispose();
    }
  });
}

/**
 * Let go of the shared materials when the world closes. Each one remembers the renderer
 * that drew it, so keeping them would keep the old renderer and its WebGL context alive.
 * The next world makes fresh ones.
 */
export function disposeSharedMaterials(): void {
  materials.forEach((m) => m.dispose());
  materials.clear();
}
