import * as CubeGeometry from "../Render/CubeGeometry.res.mjs";
import {
  cubieFaceOutline,
  cubieSurfaceAnchor,
  pieceColourLabel,
  projectPoint,
  surfaceFacingScore,
  turnLayerArcPaths,
  turnSurfaceArrowPaths,
  turnRepeatIndicator,
  wholeCubeArcPoints,
  type ProjectedPoint,
} from "./motion-overlay";

export type CubeStyle = "Standard" | "Speed";
export type CubePalette = "Western" | "Japanese";
export type CubeState = { size: number; facelets: string[][] };
export const standardStickerFinish = {
  keyPeak: 0.34,
  keyFill: 0.12,
  fillPeak: 0.18,
  fillFill: 0.07,
  bounce: 0.07,
  rim: 0.14,
} as const;
export type CubieFocus = {
  piece: string;
  source: [number, number, number];
  target: [number, number, number];
  label?: string;
};
export type MilestoneFocus = { positions: Array<[number, number, number]>; label: string };

type GeometryMesh = {
  data: number[];
  vertexCount: number;
  stride: number;
};
type GeometryResult = { TAG: "Ok"; _0: GeometryMesh } | { TAG: "Error"; _0: string };
type Mat4 = Float32Array;
export type MoveStep = {
  move:
  | { TAG: "FaceTurn"; _0: "U" | "L" | "F" | "R" | "B" | "D"; _1: { from_: number; to_: number } }
  | { TAG: "SliceTurn"; _0: "M" | "E" | "S" }
  | { TAG: "Rotation"; _0: "X" | "Y" | "Z" };
  turns: number;
};
export type TurnTransform = {
  axis: [number, number, number];
  min: number;
  max: number;
  angle: number;
};
export type CameraTarget = { yaw: number; pitch: number };
export type TurnGuide = {
  step?: MoveStep;
  label?: string;
  tone?: "normal" | "recovery";
  past?: string[];
  upcoming?: string[];
};

const DEFAULT_YAW = -0.62;
const DEFAULT_PITCH = 0.48;
const DEFAULT_DISTANCE = 8.4;
const FLOATS_PER_VERTEX = 14;
const AUTO_ORBIT_RADIANS_PER_SECOND = 0.24;
const MAX_AUTO_ORBIT_FRAME_MS = 50;

export const autoOrbitYawDelta = (
  elapsedMs: number,
  radiansPerSecond = AUTO_ORBIT_RADIANS_PER_SECOND,
): number => Math.max(0, Math.min(MAX_AUTO_ORBIT_FRAME_MS, elapsedMs)) * radiansPerSecond * 0.001;

const vertexShaderSource = `
  attribute vec3 aPosition;
  attribute vec3 aNormal;
  attribute vec4 aColour;
  attribute vec3 aCubie;
  attribute float aSheen;
  uniform mat4 uModelView;
  uniform mat4 uProjection;
  uniform float uTurnActive;
  uniform vec3 uTurnAxis;
  uniform vec2 uTurnRange;
  uniform float uTurnAngle;
  uniform float uMilestoneCount;
  uniform vec3 uMilestoneCubies[20];
  uniform float uGuideActive;
  uniform vec3 uGuideAxis;
  uniform vec2 uGuideRange;
  varying vec3 vPosition;
  varying vec3 vNormal;
  varying vec4 vColour;
  varying float vSheen;
  varying float vMilestoneFocus;
  varying float vGuideLayer;

  vec3 rotateAround(vec3 value, vec3 axis, float angle) {
    float cosine = cos(angle);
    float sine = sin(angle);
    return value * cosine + cross(axis, value) * sine
      + axis * dot(axis, value) * (1.0 - cosine);
  }

  void main() {
    float layer = dot(aCubie, uTurnAxis);
    bool turning = uTurnActive > 0.5 && layer >= uTurnRange.x && layer <= uTurnRange.y;
    vec3 objectPosition = turning ? rotateAround(aPosition, uTurnAxis, uTurnAngle) : aPosition;
    vec3 objectNormal = turning ? rotateAround(aNormal, uTurnAxis, uTurnAngle) : aNormal;
    vec4 position = uModelView * vec4(objectPosition, 1.0);
    vPosition = position.xyz;
    vNormal = normalize(mat3(uModelView) * objectNormal);
    vColour = aColour;
    vSheen = aSheen;
    vMilestoneFocus = 0.0;
    for (int index = 0; index < 20; index++) {
      if (float(index) < uMilestoneCount) {
        vMilestoneFocus = max(
          vMilestoneFocus,
          1.0 - step(0.01, distance(aCubie, uMilestoneCubies[index]))
        );
      }
    }
    float guideCoordinate = dot(aCubie, uGuideAxis);
    vGuideLayer = uGuideActive
      * step(uGuideRange.x, guideCoordinate)
      * step(guideCoordinate, uGuideRange.y);
    gl_Position = uProjection * position;
  }
`;

const fragmentShaderSource = `
  precision highp float;
  varying vec3 vPosition;
  varying vec3 vNormal;
  varying vec4 vColour;
  varying float vSheen;
  varying float vMilestoneFocus;
  varying float vGuideLayer;
  uniform float uSpeedStyle;
  uniform float uFocusTime;
  uniform float uGuideActive;

  void main() {
    vec3 normal = normalize(vNormal);
    vec3 view = normalize(-vPosition);

    // Three-point product-studio lighting in camera view space. The key gives
    // the cube shape, the cooler fill protects dark-facing sticker colours,
    // and the rim separates the silhouette from the dark application canvas.
    vec3 keyDir = normalize(vec3(-0.46, 0.76, 0.64));
    vec3 fillDir = normalize(vec3(0.68, 0.36, 0.56));
    vec3 rimDir = normalize(vec3(-0.28, 0.58, -0.76));
    vec3 bounceDir = normalize(vec3(0.14, -0.32, 0.46));

    vec3 keyCol = vec3(1.0, 0.96, 0.90);
    vec3 fillCol = vec3(0.72, 0.84, 1.0);
    vec3 rimCol = vec3(0.60, 0.72, 1.0);
    vec3 bounceCol = vec3(0.42, 0.48, 0.60);

    float keyDiff = max(dot(normal, keyDir), 0.0);
    float fillDiff = max(dot(normal, fillDir), 0.0);
    float rimDiff = max(dot(normal, rimDir), 0.0);
    float bounceDiff = max(dot(normal, bounceDir), 0.0);

    // A cool, subdued hemisphere retains form without washing out colours.
    vec3 lowerAmbient = vec3(0.10, 0.12, 0.16);
    vec3 upperAmbient = vec3(0.20, 0.22, 0.28);
    vec3 ambient = mix(lowerAmbient, upperAmbient, normal.y * 0.5 + 0.5);

    vec3 diffuseLight = ambient
      + keyCol * (0.54 * keyDiff)
      + fillCol * (0.25 * fillDiff)
      + rimCol * (0.14 * rimDiff)
      + bounceCol * (0.06 * bounceDiff);

    vec3 halfKey = normalize(keyDir + view);
    vec3 halfFill = normalize(fillDir + view);
    vec3 halfRim = normalize(rimDir + view);

    float dotKey = max(dot(normal, halfKey), 0.0);
    float dotFill = max(dot(normal, halfFill), 0.0);
    float dotRim = max(dot(normal, halfRim), 0.0);

    // Surface classification: charcoal cube body vs sticker
    float charcoalBody = 1.0 - smoothstep(0.02, 0.12, distance(vColour.rgb, vec3(0.13, 0.14, 0.17)));
    float body = charcoalBody;
    float isStandardSticker = (1.0 - body) * (1.0 - uSpeedStyle);

    // Mid-gloss vinyl: a broad key softbox and smaller cool fill reflection.
    vec3 specKeySticker = keyCol * (${standardStickerFinish.keyPeak} * pow(dotKey, 68.0) + ${standardStickerFinish.keyFill} * pow(dotKey, 22.0));
    vec3 specFillSticker = fillCol * (${standardStickerFinish.fillPeak} * pow(dotFill, 42.0) + ${standardStickerFinish.fillFill} * pow(dotFill, 15.0));
    vec3 specBounceSticker = bounceCol * (${standardStickerFinish.bounce} * pow(dotRim, 28.0));
    // A soft dielectric edge rather than a mirror-like rim reflection.
    float vinylFresnel = pow(1.0 - max(dot(normal, view), 0.0), 2.5);
    vec3 specRimSticker = mix(rimCol, fillCol, 0.4) * (${standardStickerFinish.rim} * vinylFresnel);
    vec3 stickerSpecular = specKeySticker + specFillSticker + specBounceSticker + specRimSticker;
    // --- Matte Charcoal Body Plastic Specular ---
    vec3 bodySpecular = keyCol * (0.12 * pow(dotKey, 16.0)) + fillCol * (0.06 * pow(dotFill, 12.0));

    // --- Speed Cube (Stickerless Semi-Matte Plastic) Specular ---
    vec3 speedSpecular = keyCol * (0.20 * pow(dotKey, 28.0)) + fillCol * (0.11 * pow(dotFill, 20.0));

    // Blend specular based on surface type
    vec3 baseSpec = mix(speedSpecular, bodySpecular, body);
    vec3 specular = mix(baseSpec, stickerSpecular, isStandardSticker);

    // Speed cube rolled edge sheen
    vec3 rolledSheen = vColour.rgb * vSheen * (0.42 + 0.58 * rimDiff);

    // Combine diffuse and specular with soft highlight compression
    vec3 lit = vColour.rgb * diffuseLight + rolledSheen + specular;
    vec3 colour = lit / (vec3(1.0) + max(lit - vec3(1.0), vec3(0.0)) * 0.5);
    colour = clamp(colour, 0.0, 1.0);

    float selected = max(vMilestoneFocus, vGuideLayer);
    float luminance = dot(colour, vec3(0.299, 0.587, 0.114));
    vec3 muted = mix(colour, vec3(luminance), 0.18) * 0.86;
    float focusMode = uGuideActive;
    colour = mix(colour, muted, focusMode * (1.0 - selected));

    float glowFresnel = pow(1.0 - max(dot(normal, view), 0.0), 2.2);
    float pulse = 0.82 + 0.18 * sin(uFocusTime * 4.0);
    vec3 milestoneGlow = vec3(0.20, 1.0, 0.55) * (0.18 + 0.42 * glowFresnel) * pulse;
    colour = min(colour + milestoneGlow * vMilestoneFocus, vec3(1.0));
    gl_FragColor = vec4(colour, vColour.a);
  }
`;

export const vboCapacityFloats = (size: number): number => {
  const inner = Math.max(0, size - 2);
  const visibleCubies = size ** 3 - inner ** 3;
  const bodyVertices = visibleCubies * 132;
  const exposedFaces = 6 * size * size;
  const speedVertices = bodyVertices + exposedFaces * 336;
  return speedVertices * FLOATS_PER_VERTEX;
};

const normalizedTurns = (turns: number): number => {
  const normalized = ((turns % 4) + 4) % 4;
  return normalized === 3 ? -1 : normalized;
};

export const turnTransform = (size: number, step: MoveStep): TurnTransform | null => {
  const turns = normalizedTurns(step.turns);
  if (turns === 0) return null;
  const quarter = Math.PI / 2;
  const cell = 3 / size;
  const outer = 1.5 - cell / 2;
  const epsilon = cell * 0.1;
  if (step.move.TAG === "Rotation") {
    const axis: [number, number, number] =
      step.move._0 === "X" ? [1, 0, 0] : step.move._0 === "Y" ? [0, 1, 0] : [0, 0, 1];
    return { axis, min: -2, max: 2, angle: -turns * quarter };
  }
  if (step.move.TAG === "SliceTurn") {
    const axis: [number, number, number] =
      step.move._0 === "M" ? [1, 0, 0] : step.move._0 === "E" ? [0, 1, 0] : [0, 0, 1];
    const direction = step.move._0 === "S" ? -1 : 1;
    return { axis, min: -epsilon, max: epsilon, angle: direction * turns * quarter };
  }
  const vectors: Record<"U" | "L" | "F" | "R" | "B" | "D", [number, number, number]> = {
    U: [0, 1, 0],
    D: [0, -1, 0],
    F: [0, 0, 1],
    B: [0, 0, -1],
    R: [1, 0, 0],
    L: [-1, 0, 0],
  };
  const range = step.move._1;
  return {
    axis: vectors[step.move._0],
    min: outer - (range.to_ - 1) * cell - epsilon,
    max: outer - (range.from_ - 1) * cell + epsilon,
    angle: -turns * quarter,
  };
};

export const turnPreviewTransform = (
  turn: TurnTransform,
  degrees = 4,
): TurnTransform => ({
  ...turn,
  angle: Math.sign(turn.angle || 1) * Math.max(0, degrees) * Math.PI / 180,
});

export const transformTurnPoint = (
  point: [number, number, number],
  turn: TurnTransform | null,
): [number, number, number] => {
  if (!turn) return point;
  const layer = point[0] * turn.axis[0] + point[1] * turn.axis[1] + point[2] * turn.axis[2];
  if (layer < turn.min || layer > turn.max) return point;
  return rotateTurnPoint(point, turn);
};

const rotateTurnPoint = (
  point: [number, number, number],
  turn: TurnTransform,
): [number, number, number] => {
  const cosine = Math.cos(turn.angle);
  const sine = Math.sin(turn.angle);
  const dot = point[0] * turn.axis[0] + point[1] * turn.axis[1] + point[2] * turn.axis[2];
  const cross: [number, number, number] = [
    turn.axis[1] * point[2] - turn.axis[2] * point[1],
    turn.axis[2] * point[0] - turn.axis[0] * point[2],
    turn.axis[0] * point[1] - turn.axis[1] * point[0],
  ];
  return point.map((value, index) =>
    value * cosine
    + cross[index] * sine
    + turn.axis[index] * dot * (1 - cosine)
  ) as [number, number, number];
};

export const transformTurnPointForCubie = (
  point: [number, number, number],
  cubie: [number, number, number],
  turn: TurnTransform | null,
): [number, number, number] => {
  if (!turn) return point;
  const layer = cubie[0] * turn.axis[0] + cubie[1] * turn.axis[1] + cubie[2] * turn.axis[2];
  return layer < turn.min || layer > turn.max ? point : rotateTurnPoint(point, turn);
};

export const focusCameraTarget = (focus: CubieFocus): CameraTarget => {
  const visibility = (position: [number, number, number], direction: [number, number, number]) =>
    Math.max(...position.flatMap((coordinate, axis) =>
      Math.abs(coordinate) < 0.75 ? [] : [Math.sign(coordinate) * direction[axis]]
    ));
  const preferred: [number, number, number] = [0.48, 0.46, 0.66];
  const candidates: Array<{ yaw: number; pitch: number; direction: [number, number, number] }> = [];
  const pitches = [-0.72, -0.48, 0, 0.48, 0.72];
  for (let yawStep = 0; yawStep < 16; yawStep += 1) {
    const yaw = -Math.PI + yawStep * Math.PI / 8;
    for (const pitch of pitches) {
      const horizontal = Math.cos(pitch);
      candidates.push({
        yaw,
        pitch,
        direction: [-Math.sin(yaw) * horizontal, Math.sin(pitch), Math.cos(yaw) * horizontal],
      });
    }
  }
  return candidates.reduce((best, candidate) => {
    const source = Math.min(0.72, visibility(focus.source, candidate.direction));
    const target = Math.min(0.72, visibility(focus.target, candidate.direction));
    const preference = candidate.direction.reduce(
      (sum, coordinate, axis) => sum + coordinate * preferred[axis],
      0,
    );
    const score = Math.min(source, target) * 8 + (source + target) * 2 + preference * 0.22;
    return score > best.score ? { ...candidate, score } : best;
  }, { ...candidates[0], score: -Infinity });
};

export const clampedCanvasSize = (
  width: number,
  height: number,
  devicePixelRatio: number,
): [number, number] => {
  const dpr = Math.min(Math.max(devicePixelRatio, 1), 2);
  return [Math.max(1, Math.round(width * dpr)), Math.max(1, Math.round(height * dpr))];
};

/** Converts a synchronously captured PNG data URI without a second fetch task. */
export const pngBlobFromDataUrl = (dataUrl: string): Blob | null => {
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) return null;
  try {
    const binary = atob(match[1]);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new Blob([bytes], {type: "image/png"});
  } catch {
    return null;
  }
};

const identity = (): Mat4 =>
  new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

const multiply = (left: Mat4, right: Mat4): Mat4 => {
  const result = new Float32Array(16);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      let value = 0;
      for (let offset = 0; offset < 4; offset += 1) {
        value += left[offset * 4 + row] * right[column * 4 + offset];
      }
      result[column * 4 + row] = value;
    }
  }
  return result;
};

const rotationX = (angle: number): Mat4 => {
  const matrix = identity();
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  matrix[5] = cosine;
  matrix[6] = sine;
  matrix[9] = -sine;
  matrix[10] = cosine;
  return matrix;
};

const rotationY = (angle: number): Mat4 => {
  const matrix = identity();
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  matrix[0] = cosine;
  matrix[2] = -sine;
  matrix[8] = sine;
  matrix[10] = cosine;
  return matrix;
};

const translation = (z: number): Mat4 => {
  const matrix = identity();
  matrix[14] = z;
  return matrix;
};

const perspective = (aspect: number): Mat4 => {
  const near = 0.1;
  const far = 100;
  const scale = 1 / Math.tan((38 * Math.PI) / 360);
  const matrix = new Float32Array(16);
  matrix[0] = scale / Math.max(aspect, 0.01);
  matrix[5] = scale;
  matrix[10] = (far + near) / (near - far);
  matrix[11] = -1;
  matrix[14] = (2 * far * near) / (near - far);
  return matrix;
};

export const cameraMatrices = (
  aspect: number,
  yaw: number,
  pitch: number,
  distance: number,
  objectOrientation?: OrientationQuaternion,
): { modelView: Mat4; projection: Mat4 } => ({
  modelView: multiply(
    translation(-distance),
    multiply(
      multiply(rotationX(pitch), rotationY(yaw)),
      objectOrientation ? matrixFromQuaternion(objectOrientation) : identity(),
    ),
  ),
  projection: perspective(aspect),
});

/** Keeps the cube inside the frustum for narrow displays without changing wide-screen composition. */
export const safeCameraDistance = (distance: number, aspect: number): number => {
  const narrowViewportScale = 1.2 / Math.max(0.7, aspect);
  return distance * Math.max(1, narrowViewportScale);
};

export const cameraTween = (start: number, target: number, progress: number): number => {
  const wrapped = ((target - start + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  const bounded = Math.max(0, Math.min(1, progress));
  const eased = bounded * bounded * (3 - 2 * bounded);
  return start + wrapped * eased;
};

export type OrientationQuaternion = { x: number; y: number; z: number; w: number };
export type OrientationCoordinateFrame = "viewport" | "gocube-wire" | "gan-wire";

const normalizedQuaternion = (quaternion: OrientationQuaternion): OrientationQuaternion => {
  const length = Math.hypot(quaternion.x, quaternion.y, quaternion.z, quaternion.w) || 1;
  return {
    x: quaternion.x / length,
    y: quaternion.y / length,
    z: quaternion.z / length,
    w: quaternion.w / length,
  };
};

const inverseQuaternion = (quaternion: OrientationQuaternion): OrientationQuaternion => {
  const normalized = normalizedQuaternion(quaternion);
  return {x: -normalized.x, y: -normalized.y, z: -normalized.z, w: normalized.w};
};

/** Smallest SO(3) angle between two normalized orientation quaternions. */
export const orientationDistanceRadians = (
  left: OrientationQuaternion,
  right: OrientationQuaternion,
): number => {
  const a = normalizedQuaternion(left);
  const b = normalizedQuaternion(right);
  const dot = Math.abs(a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w);
  return 2 * Math.acos(Math.min(1, dot));
};

export const quaternionAxisAngle = (
  quaternion: OrientationQuaternion,
): {axis: [number, number, number]; radians: number} => {
  const normalized = normalizedQuaternion(quaternion);
  const sign = normalized.w < 0 ? -1 : 1;
  const w = normalized.w * sign;
  const sine = Math.hypot(normalized.x, normalized.y, normalized.z);
  if (sine < 1e-8) return {axis: [0, 0, 0], radians: 0};
  return {
    axis: [normalized.x * sign / sine, normalized.y * sign / sine, normalized.z * sign / sine],
    radians: 2 * Math.acos(Math.min(1, w)),
  };
};

/**
 * Produces the display-only adjustment that makes a raw IMU delta agree with
 * a settled cardinal cube pose. The raw sample remains untouched.
 */
export const orientationCorrectionForTarget = (
  base: OrientationQuaternion,
  current: OrientationQuaternion,
  target: OrientationQuaternion,
  coordinateFrame: OrientationCoordinateFrame = "viewport",
): OrientationQuaternion => {
  const raw = deviceOrientationDelta(base, current, coordinateFrame, "world");
  return normalizedQuaternion(
    multiplyQuaternions(normalizedQuaternion(target), inverseQuaternion(raw)),
  );
};

/** Eases the actual rendered pose toward a settled cardinal orientation. */
export const stabilizedOrientationCorrection = (
  previous: OrientationQuaternion | null,
  base: OrientationQuaternion,
  displayed: OrientationQuaternion,
  target: OrientationQuaternion,
  coordinateFrame: OrientationCoordinateFrame = "viewport",
  responsiveness = 0.18,
  maximumStepRadians = 2 * Math.PI / 180,
): OrientationQuaternion => {
  const current = previous ?? {x: 0, y: 0, z: 0, w: 1};
  const desired = orientationCorrectionForTarget(base, displayed, target, coordinateFrame);
  const distance = orientationDistanceRadians(current, desired);
  const amount = distance === 0 ? 0 : Math.min(responsiveness, maximumStepRadians / distance);
  return smoothTrackedOrientation(current, desired, 0, amount);
};

/** Locks sub-threshold IMU jitter and softens larger moves along the shortest quaternion path. */
export const smoothTrackedOrientation = (
  previous: OrientationQuaternion,
  sample: OrientationQuaternion,
  deadZoneRadians = 2 * Math.PI / 180,
  responsiveness = 0.32,
): OrientationQuaternion => {
  const from = normalizedQuaternion(previous);
  const rawTo = normalizedQuaternion(sample);
  const dot = from.x * rawTo.x + from.y * rawTo.y + from.z * rawTo.z + from.w * rawTo.w;
  const sign = dot < 0 ? -1 : 1;
  const aligned = {
    x: rawTo.x * sign,
    y: rawTo.y * sign,
    z: rawTo.z * sign,
    w: rawTo.w * sign,
  };
  const angularDistance = 2 * Math.acos(Math.min(1, Math.abs(dot)));
  if (angularDistance <= deadZoneRadians) return from;
  const amount = Math.max(0, Math.min(1, responsiveness));
  return normalizedQuaternion({
    x: from.x + (aligned.x - from.x) * amount,
    y: from.y + (aligned.y - from.y) * amount,
    z: from.z + (aligned.z - from.z) * amount,
    w: from.w + (aligned.w - from.w) * amount,
  });
};

export const multiplyQuaternions = (
  left: OrientationQuaternion,
  right: OrientationQuaternion,
): OrientationQuaternion => ({
  x: left.w * right.x + left.x * right.w + left.y * right.z - left.z * right.y,
  y: left.w * right.y - left.x * right.z + left.y * right.w + left.z * right.x,
  z: left.w * right.z + left.x * right.y - left.y * right.x + left.z * right.w,
  w: left.w * right.w - left.x * right.x - left.y * right.y - left.z * right.z,
});

export const relativeQuaternion = (
  base: OrientationQuaternion,
  current: OrientationQuaternion,
): OrientationQuaternion => {
  const from = normalizedQuaternion(base);
  const to = normalizedQuaternion(current);
  return normalizedQuaternion(multiplyQuaternions(to, {
    x: -from.x,
    y: -from.y,
    z: -from.z,
    w: from.w,
  }));
};

/**
 * Returns the orientation change in the cube/sensor's local frame.
 *
 * Unlike the world-space delta above, this remains stable when the user has
 * freely regripped the cube before performing the next coached rotation.
 */
export const relativeQuaternionLocal = (
  base: OrientationQuaternion,
  current: OrientationQuaternion,
): OrientationQuaternion => {
  const from = normalizedQuaternion(base);
  const to = normalizedQuaternion(current);
  return normalizedQuaternion(multiplyQuaternions({
    x: -from.x,
    y: -from.y,
    z: -from.z,
    w: from.w,
  }, to));
};

/**
 * Computes the relative orientation delta between baseline and current orientation in viewport frame.
 * Follows the 3-step pipeline documented and measured in bluez-gatt-recorder:
 * 1. World/local delta in raw SO(3)
 * 2. Invert rotation direction (for sensors rotating against hand)
 * 3. Change of basis to canonical viewport frame
 */
export const deviceOrientationDelta = (
  base: OrientationQuaternion,
  current: OrientationQuaternion,
  frame: OrientationCoordinateFrame = "viewport",
  deltaFrame: "world" | "local" = "world",
): OrientationQuaternion => {
  const rawDelta = deltaFrame === "world"
    ? relativeQuaternion(base, current)
    : relativeQuaternionLocal(base, current);
  if (frame === "gocube-wire") {
    // 1. Invert rotation direction
    const directed = { x: -rawDelta.x, y: -rawDelta.y, z: -rawDelta.z, w: rawDelta.w };
    // 2. Basis transformation: 180° around Y (Q_basis = { x: 0, y: 1, z: 0, w: 0 })
    const qBasis = { x: 0, y: 1, z: 0, w: 0 };
    return normalizedQuaternion(
      multiplyQuaternions(multiplyQuaternions(qBasis, directed), { x: 0, y: -1, z: 0, w: 0 }),
    );
  }
  if (frame === "gan-wire") {
    return normalizedQuaternion({
      x: rawDelta.x,
      y: rawDelta.z,
      z: -rawDelta.y,
      w: rawDelta.w,
    });
  }
  return rawDelta;
};

/**
 * Re-expresses a vendor-specific hardware sensor quaternion in canonical viewport axes.
 */
export const orientationInViewportFrame = (
  quaternion: OrientationQuaternion,
  frame: OrientationCoordinateFrame = "viewport",
): OrientationQuaternion => {
  return deviceOrientationDelta({ x: 0, y: 0, z: 0, w: 1 }, quaternion, frame);
};

export const matrixFromQuaternion = (quaternion: OrientationQuaternion): Mat4 => {
  const { x, y, z, w } = normalizedQuaternion(quaternion);
  const x2 = x + x;
  const y2 = y + y;
  const z2 = z + z;
  const matrix = identity();
  matrix[0] = 1 - y * y2 - z * z2;
  matrix[1] = x * y2 + w * z2;
  matrix[2] = x * z2 - w * y2;
  matrix[4] = x * y2 - w * z2;
  matrix[5] = 1 - x * x2 - z * z2;
  matrix[6] = y * z2 + w * x2;
  matrix[8] = x * z2 + w * y2;
  matrix[9] = y * z2 - w * x2;
  matrix[10] = 1 - x * x2 - y * y2;
  return matrix;
};

const compileShader = (gl: WebGLRenderingContext, type: number, source: string): WebGLShader => {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Unable to allocate a WebGL shader.");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) ?? "Unknown shader compilation error.";
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
};

const createProgram = (gl: WebGLRenderingContext): WebGLProgram => {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
  const program = gl.createProgram();
  if (!program) throw new Error("Unable to allocate a WebGL program.");
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) ?? "Unknown WebGL link error.";
    gl.deleteProgram(program);
    throw new Error(message);
  }
  return program;
};

export type CubeViewport = {
  setScene: (state: CubeState, palette: CubePalette, style: CubeStyle) => void;
  setState: (state: CubeState, palette: CubePalette) => void;
  setStyle: (style: CubeStyle) => void;
  animateTurn: (turn: TurnTransform, duration?: number) => Promise<void>;
  cancelTurn: () => void;
  setTurnPreview: (turn: TurnTransform | null, degrees?: number) => void;
  setFocus: (focus: CubieFocus | null) => void;
  setMilestone: (milestone: MilestoneFocus | null) => void;
  setTurnGuide: (guide: TurnGuide | null) => void;
  setMoveRibbon: (ribbon: TurnGuide | null) => void;
  smoothOrbitTo: (yaw: number, pitch: number, duration?: number) => Promise<void>;
  setDeviceOrientation: (
    orientation: OrientationQuaternion | null,
    frame?: OrientationCoordinateFrame,
  ) => void;
  recenterDeviceOrientation: (
    orientation: OrientationQuaternion,
    frame?: OrientationCoordinateFrame,
  ) => void;
  reconcileDeviceOrientation: (
    orientation: OrientationQuaternion,
    target: OrientationQuaternion,
    frame?: OrientationCoordinateFrame,
  ) => void;
  adoptDeviceOrientationTarget: (
    orientation: OrientationQuaternion,
    frame?: OrientationCoordinateFrame,
  ) => OrientationQuaternion | null;
  stabilizeDeviceOrientation: (
    measured: OrientationQuaternion,
    target: OrientationQuaternion,
    frame?: OrientationCoordinateFrame,
    maximumStepRadians?: number,
    responsiveness?: number,
  ) => {
    applied: boolean;
    targetErrorRadians: number | null;
    targetErrorAxis: [number, number, number] | null;
    correctionStepRadians: number;
  };
  setAutoOrbit: (enabled: boolean) => void;
  setDialogOpen: (open: boolean) => void;
  resetCamera: () => void;
  refresh: () => void;
  capturePng: () => Promise<Blob | null>;
  dispose: () => void;
};

export const createCubeViewport = (
  canvas: HTMLCanvasElement,
  overlayCanvas: HTMLCanvasElement,
  onError: (message: string) => void = () => undefined,
): CubeViewport | null => {
  const gl = canvas.getContext("webgl", {
    alpha: true,
    antialias: true,
    depth: true,
    powerPreference: "high-performance",
  });
  if (!gl) {
    canvas.dataset.webgl = "unsupported";
    onError("WebGL is unavailable in this browser.");
    return null;
  }

  let program: WebGLProgram;
  try {
    program = createProgram(gl);
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : "Unable to initialize WebGL.";
    canvas.dataset.webgl = "error";
    onError(message);
    return null;
  }

  const buffer = gl.createBuffer();
  if (!buffer) {
    gl.deleteProgram(program);
    onError("Unable to allocate the cube vertex buffer.");
    return null;
  }

  const position = gl.getAttribLocation(program, "aPosition");
  const normal = gl.getAttribLocation(program, "aNormal");
  const colour = gl.getAttribLocation(program, "aColour");
  const cubie = gl.getAttribLocation(program, "aCubie");
  const sheen = gl.getAttribLocation(program, "aSheen");
  const modelView = gl.getUniformLocation(program, "uModelView");
  const projection = gl.getUniformLocation(program, "uProjection");
  const speedStyle = gl.getUniformLocation(program, "uSpeedStyle");
  const turnActive = gl.getUniformLocation(program, "uTurnActive");
  const turnAxis = gl.getUniformLocation(program, "uTurnAxis");
  const turnRange = gl.getUniformLocation(program, "uTurnRange");
  const turnAngle = gl.getUniformLocation(program, "uTurnAngle");
  const focusTime = gl.getUniformLocation(program, "uFocusTime");
  const milestoneCount = gl.getUniformLocation(program, "uMilestoneCount");
  const milestoneCubies = gl.getUniformLocation(program, "uMilestoneCubies[0]");
  const guideActive = gl.getUniformLocation(program, "uGuideActive");
  const guideAxis = gl.getUniformLocation(program, "uGuideAxis");
  const guideRange = gl.getUniformLocation(program, "uGuideRange");

  let state: CubeState | null = null;
  let palette: CubePalette = "Western";
  let style: CubeStyle = "Standard";
  let vertexCount = 0;
  let allocatedFloats = 0;
  let yaw = DEFAULT_YAW;
  let pitch = DEFAULT_PITCH;
  let distance = DEFAULT_DISTANCE;
  let frame: number | null = null;
  let visible = true;
  // A modal <dialog> covering the canvas leaves it geometrically intersecting
  // the viewport — IntersectionObserver has no concept of top-layer
  // occlusion — so auto-orbit and any focus/turnGuide/milestone highlight
  // kept rendering and compositing every frame behind it otherwise.
  let dialogOpen = false;
  let dragging = false;
  let previousX = 0;
  let previousY = 0;
  let disposed = false;
  let activeTurn: TurnTransform | null = null;
  let focus: CubieFocus | null = null;
  let milestone: MilestoneFocus | null = null;
  let turnGuide: TurnGuide | null = null;
  let moveRibbon: TurnGuide | null = null;
  let turnFrame: number | null = null;
  let turnGeneration = 0;
  let autoOrbit = false;
  let autoOrbitFrame: number | null = null;
  let autoOrbitPreviousTime: number | null = null;
  let cameraFrame: number | null = null;
  let cameraGeneration = 0;
  let deviceOrientationBase: OrientationQuaternion | null = null;
  let deviceOrientation: OrientationQuaternion | null = null;
  let deviceOrientationCorrection: OrientationQuaternion | null = null;
  let deviceOrientationFrame: OrientationCoordinateFrame = "viewport";
  canvas.dataset.autoOrbitState = "off";
  const overlay = overlayCanvas.getContext("2d");

  const traceProjected = (
    context: CanvasRenderingContext2D,
    points: ProjectedPoint[],
  ) => {
    const first = points[0];
    if (!first) return;
    context.beginPath();
    context.moveTo(first.x, first.y);
    points.slice(1).forEach((point) => context.lineTo(point.x, point.y));
  };

  const drawArrowhead = (
    context: CanvasRenderingContext2D,
    from: ProjectedPoint,
    to: ProjectedPoint,
    size: number,
    colour: string,
  ) => {
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    context.save();
    context.translate(to.x, to.y);
    context.rotate(angle);
    context.beginPath();
    context.moveTo(0, 0);
    context.lineTo(-size, size * 0.58);
    context.lineTo(-size, -size * 0.58);
    context.closePath();
    context.fillStyle = colour;
    context.shadowColor = colour;
    context.shadowBlur = size * 0.8;
    context.fill();
    context.restore();
  };

  const drawChevron = (
    context: CanvasRenderingContext2D,
    from: ProjectedPoint,
    to: ProjectedPoint,
    size: number,
    colour: string,
  ) => {
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    context.save();
    context.translate(to.x, to.y);
    context.rotate(angle);
    context.beginPath();
    // Aerodynamic solid barbed arrowhead matching the whole-cube arrow style
    context.moveTo(0, 0);
    context.lineTo(-size * 0.95, -size * 0.55);
    context.lineTo(-size * 0.60, 0);
    context.lineTo(-size * 0.95, size * 0.55);
    context.closePath();
    context.fillStyle = colour;
    context.shadowColor = colour;
    context.shadowBlur = size * 0.8;
    context.fill();
    context.strokeStyle = "rgba(8, 15, 30, 0.85)";
    context.lineWidth = Math.max(1, size * 0.12);
    context.lineJoin = "round";
    context.stroke();
    context.restore();
  };

  const drawBadge = (
    context: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    dpr: number,
    muted = false,
    tone: "normal" | "recovery" = "normal",
  ) => {
    context.save();
    context.font = `600 ${12 * dpr}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    const paddingX = 8 * dpr;
    const height = 25 * dpr;
    const width = context.measureText(text).width + paddingX * 2;
    const left = Math.max(6 * dpr, Math.min(overlayCanvas.width - width - 6 * dpr, x - width / 2));
    const top = Math.max(6 * dpr, Math.min(overlayCanvas.height - height - 6 * dpr, y - height / 2));
    context.fillStyle = muted ? "rgba(15, 23, 42, 0.82)" : "rgba(8, 15, 30, 0.9)";
    context.strokeStyle = muted
      ? "rgba(148, 163, 184, 0.58)"
      : tone === "recovery"
        ? "rgba(251, 191, 36, 0.9)"
        : "rgba(103, 232, 249, 0.78)";
    context.lineWidth = dpr;
    context.beginPath();
    context.roundRect(left, top, width, height, 6 * dpr);
    context.fill();
    context.stroke();
    context.fillStyle = muted
      ? "rgba(203, 213, 225, 0.85)"
      : tone === "recovery" ? "#fef3c7" : "#cffafe";
    context.textBaseline = "middle";
    context.fillText(text, left + paddingX, top + height / 2);
    context.restore();
  };

  const drawRepeatIndicator = (
    context: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    dpr: number,
    tone: "normal" | "recovery" = "normal",
  ) => {
    context.save();
    context.font = `800 ${17 * dpr}px ui-sans-serif, system-ui, sans-serif`;
    const paddingX = 8 * dpr;
    const height = 30 * dpr;
    const width = Math.max(height, context.measureText(text).width + paddingX * 2);
    const left = Math.max(6 * dpr, Math.min(overlayCanvas.width - width - 6 * dpr, x - width / 2));
    const top = Math.max(6 * dpr, Math.min(overlayCanvas.height - height - 6 * dpr, y - height / 2));
    const colour = tone === "recovery" ? "#fbbf24" : "#38bdf8";
    context.fillStyle = colour;
    context.strokeStyle = "rgba(8, 15, 30, 0.94)";
    context.lineWidth = 1.8 * dpr;
    context.shadowColor = tone === "recovery" ? "rgba(245, 158, 11, 0.7)" : "rgba(34, 211, 238, 0.7)";
    context.shadowBlur = 10 * dpr;
    context.beginPath();
    context.roundRect(left, top, width, height, 10 * dpr);
    context.fill();
    context.stroke();
    context.shadowBlur = 0;
    context.fillStyle = "#07111f";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(text, left + width / 2, top + height / 2);
    context.restore();
  };

  const drawMoveSequenceRibbon = (
    context: CanvasRenderingContext2D,
    guide: TurnGuide,
    width: number,
    dpr: number,
  ) => {
    const step = guide.step;
    const isRotation = step?.move.TAG === "Rotation";
    const tone = guide.tone ?? "normal";
    const isRecovery = tone === "recovery";
    const turns = step ? ((step.turns % 4) + 4) % 4 : 0;
    const isHalfTurn = turns === 2;
    const currentLabel = guide.label || (step && isRotation
      ? (isHalfTurn ? `${step.move._0.toLowerCase()}2` : `${step.move._0.toLowerCase()}${turns === 3 ? "'" : ""}`)
      : "");
    if (!currentLabel && (!guide.upcoming || guide.upcoming.length === 0)) return;

    const upcoming = guide.upcoming ?? [];
    const past = guide.past ?? [];

    const colour = isRecovery ? "#fde68a" : "#38bdf8";
    const textColour = isRecovery ? "#fef3c7" : "#f0f9ff";
    const accentColour = isRecovery ? "#f59e0b" : "#22d3ee";
    const glowColour = isRecovery ? "rgba(245, 158, 11, 0.75)" : "rgba(34, 211, 238, 0.75)";

    const ribbonHeight = 44 * dpr;
    const centerY = ribbonHeight / 2;

    context.save();

    // 100% width endless ribbon backdrop (no outer card frame)
    context.fillStyle = "rgba(8, 15, 30, 0.70)";
    context.fillRect(0, 0, width, ribbonHeight);
    context.strokeStyle = "rgba(51, 65, 85, 0.35)";
    context.lineWidth = 1 * dpr;
    context.beginPath();
    context.moveTo(0, ribbonHeight);
    context.lineTo(width, ribbonHeight);
    context.stroke();

    // Calculate Active Move Capsule
    context.font = `800 ${18 * dpr}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    const currentTextWidth = context.measureText(currentLabel).width;
    const activePillPadX = 14 * dpr;
    const activePillWidth = currentTextWidth + activePillPadX * 2;
    const pillHeight = 32 * dpr;

    const centerX = width / 2;
    const activeLeft = centerX - activePillWidth / 2;
    const activeTop = centerY - pillHeight / 2;

    // Draw active highlighted pill
    context.fillStyle = isRecovery ? "rgba(245, 158, 11, 0.22)" : "rgba(34, 211, 238, 0.20)";
    context.strokeStyle = accentColour;
    context.lineWidth = 2.0 * dpr;
    context.shadowColor = glowColour;
    context.shadowBlur = 10 * dpr;
    context.beginPath();
    context.roundRect(activeLeft, activeTop, activePillWidth, pillHeight, 8 * dpr);
    context.fill();
    context.stroke();
    context.shadowBlur = 0;

    // Draw active token text centered in capsule
    context.fillStyle = textColour;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(currentLabel, centerX, centerY);

    // Draw upcoming moves to the right (endless ribbon flow filling full width)
    context.font = `700 ${14 * dpr}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    let currX = activeLeft + activePillWidth + 8 * dpr;
    for (const token of upcoming) {
      if (currX >= width) break;
      const textW = context.measureText(token).width;
      const itemW = textW + 14 * dpr;

      const itemTop = centerY - 14 * dpr;
      context.fillStyle = "rgba(30, 41, 59, 0.55)";
      context.strokeStyle = "rgba(71, 85, 105, 0.4)";
      context.lineWidth = 1 * dpr;
      context.beginPath();
      context.roundRect(currX, itemTop, itemW, 28 * dpr, 6 * dpr);
      context.fill();
      context.stroke();

      context.fillStyle = "rgba(226, 232, 240, 0.88)";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(token, currX + itemW / 2, centerY);

      currX += itemW + 6 * dpr;
    }

    // Draw past moves to the left (faded endless ribbon flow filling full width)
    let leftX = activeLeft - 8 * dpr;
    for (let i = past.length - 1; i >= 0; i--) {
      if (leftX <= 0) break;
      const token = past[i]!;
      const textW = context.measureText(token).width;
      const itemW = textW + 14 * dpr;
      const itemLeft = leftX - itemW;

      const itemTop = centerY - 14 * dpr;
      context.fillStyle = "rgba(30, 41, 59, 0.35)";
      context.beginPath();
      context.roundRect(itemLeft, itemTop, itemW, 28 * dpr, 6 * dpr);
      context.fill();

      context.fillStyle = "rgba(148, 163, 184, 0.60)";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(token, itemLeft + itemW / 2, centerY);

      leftX = itemLeft - 6 * dpr;
    }

    // Left and Right smooth edge fades
    const fadeWidth = 32 * dpr;
    const leftGrad = context.createLinearGradient(0, 0, fadeWidth, 0);
    leftGrad.addColorStop(0, "rgba(8, 15, 30, 0.95)");
    leftGrad.addColorStop(1, "rgba(8, 15, 30, 0)");
    context.fillStyle = leftGrad;
    context.fillRect(0, 0, fadeWidth, ribbonHeight);

    const rightGrad = context.createLinearGradient(width - fadeWidth, 0, width, 0);
    rightGrad.addColorStop(0, "rgba(8, 15, 30, 0)");
    rightGrad.addColorStop(1, "rgba(8, 15, 30, 0.95)");
    context.fillStyle = rightGrad;
    context.fillRect(width - fadeWidth, 0, fadeWidth, ribbonHeight);

    context.restore();
  };

  const drawTaperedArrow = (
    context: CanvasRenderingContext2D,
    projectedPoints: ProjectedPoint[],
    dpr: number,
    colour: string,
    glowColour: string,
    scale = 1.0,
  ) => {
    const n = projectedPoints.length;
    if (n < 4) return;

    const startW = 1.8 * dpr * scale;
    const endW = 10 * dpr * scale;
    const lefts: Array<{ x: number; y: number }> = [];
    const rights: Array<{ x: number; y: number }> = [];

    const shaftCount = Math.max(3, Math.floor(n * 0.82));

    for (let i = 0; i < shaftCount; i++) {
      const prev = projectedPoints[Math.max(0, i - 1)];
      const next = projectedPoints[Math.min(shaftCount - 1, i + 1)];
      const dx = next.x - prev.x;
      const dy = next.y - prev.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      const t = i / (shaftCount - 1);
      const w = startW + (endW - startW) * Math.pow(t, 1.4);
      lefts.push({ x: projectedPoints[i].x + nx * (w / 2), y: projectedPoints[i].y + ny * (w / 2) });
      rights.push({ x: projectedPoints[i].x - nx * (w / 2), y: projectedPoints[i].y - ny * (w / 2) });
    }

    const lastShaft = projectedPoints[shaftCount - 1];
    const tip = projectedPoints[n - 1];
    const headDx = tip.x - lastShaft.x;
    const headDy = tip.y - lastShaft.y;
    const headLen = Math.hypot(headDx, headDy) || 1;
    const headDirX = headDx / headLen;
    const headDirY = headDy / headLen;
    const headNormX = -headDirY;
    const headNormY = headDirX;

    const headBaseW = 24 * dpr * scale;
    const tipExtension = 6 * dpr * scale;
    const tipPoint = {
      x: tip.x + headDirX * tipExtension,
      y: tip.y + headDirY * tipExtension,
    };
    const headLeft = {
      x: lastShaft.x + headNormX * (headBaseW / 2),
      y: lastShaft.y + headNormY * (headBaseW / 2),
    };
    const headRight = {
      x: lastShaft.x - headNormX * (headBaseW / 2),
      y: lastShaft.y - headNormY * (headBaseW / 2),
    };

    context.save();
    context.fillStyle = colour;
    context.strokeStyle = "rgba(8, 15, 30, 0.92)";
    context.lineWidth = 1.4 * dpr;
    context.lineJoin = "round";
    context.lineCap = "round";
    context.shadowColor = glowColour;
    context.shadowBlur = 12 * dpr;

    // Draw solid sweeping tapered arrow
    context.beginPath();
    context.moveTo(lefts[0].x, lefts[0].y);
    for (let i = 1; i < lefts.length; i++) {
      context.lineTo(lefts[i].x, lefts[i].y);
    }
    // Bold triangular arrowhead with clean barbs
    context.lineTo(headLeft.x, headLeft.y);
    context.lineTo(tipPoint.x, tipPoint.y);
    context.lineTo(headRight.x, headRight.y);
    context.lineTo(rights[rights.length - 1].x, rights[rights.length - 1].y);
    for (let i = rights.length - 2; i >= 0; i--) {
      context.lineTo(rights[i].x, rights[i].y);
    }
    context.closePath();
    context.fill();
    context.stroke();

    context.restore();
  };

  const drawMotionOverlay = (
    matrices: { modelView: Mat4; projection: Mat4 },
    width: number,
    height: number,
  ) => {
    if (!overlay) return;
    if (overlayCanvas.width !== width || overlayCanvas.height !== height) {
      overlayCanvas.width = width;
      overlayCanvas.height = height;
    }
    overlay.clearRect(0, 0, width, height);
    if (!focus && !turnGuide && !milestone) {
      delete overlayCanvas.dataset.motionVisible;
      return;
    }
    overlayCanvas.dataset.motionVisible = "true";
    const bounds = canvas.getBoundingClientRect();
    const dpr = width / Math.max(1, bounds.width);
    const now = performance.now();

    if (milestone) {
      drawBadge(overlay, milestone.label, width / 2, 34 * dpr, dpr);
    }

    if (focus) {
      const sourceAnchor = cubieSurfaceAnchor(focus.source, matrices.modelView, state?.size ?? 3);
      const targetAnchor = cubieSurfaceAnchor(focus.target, matrices.modelView, state?.size ?? 3);
      const source = projectPoint(
        transformTurnPointForCubie(sourceAnchor.point, focus.source, activeTurn),
        matrices.modelView,
        matrices.projection,
        width,
        height,
      );
      const target = projectPoint(
        transformTurnPointForCubie(targetAnchor.point, focus.target, activeTurn),
        matrices.modelView,
        matrices.projection,
        width,
        height,
      );
      const sourceVisible = source.inFront && sourceAnchor.visible;
      const targetVisible = target.inFront && targetAnchor.visible;
      if (sourceVisible && targetVisible) {
        overlay.save();
        overlay.strokeStyle = "#67e8f9";
        overlay.fillStyle = "#67e8f9";
        overlay.lineWidth = 2.4 * dpr;
        overlay.lineCap = "round";
        overlay.lineJoin = "round";
        overlay.shadowColor = "rgba(34, 211, 238, 0.9)";
        overlay.shadowBlur = 9 * dpr;
        overlay.setLineDash([8 * dpr, 7 * dpr]);
        overlay.lineDashOffset = -(now * 0.025 * dpr);
        const sameSlot = Math.hypot(target.x - source.x, target.y - source.y) < 8 * dpr;
        let arrowFrom: ProjectedPoint;
        let arrowTo: ProjectedPoint;
        let labelX: number;
        let labelY: number;
        if (sameSlot) {
          const radius = 34 * dpr;
          overlay.beginPath();
          overlay.arc(source.x, source.y, radius, Math.PI * 0.35, Math.PI * 2.08);
          overlay.stroke();
          arrowFrom = { x: source.x + radius * 0.92, y: source.y - radius * 0.38, depth: 0, inFront: true };
          arrowTo = { x: source.x + radius, y: source.y + radius * 0.1, depth: 0, inFront: true };
          labelX = source.x;
          labelY = source.y - radius - 18 * dpr;
        } else {
          const dx = target.x - source.x;
          const dy = target.y - source.y;
          const length = Math.max(1, Math.hypot(dx, dy));
          const lift = Math.min(80 * dpr, Math.max(34 * dpr, length * 0.32));
          const control = {
            x: (source.x + target.x) / 2 - (dy / length) * lift,
            y: (source.y + target.y) / 2 + (dx / length) * lift - 18 * dpr,
          };
          overlay.beginPath();
          overlay.moveTo(source.x, source.y);
          overlay.quadraticCurveTo(control.x, control.y, target.x, target.y);
          overlay.stroke();
          arrowFrom = { x: control.x, y: control.y, depth: 0, inFront: true };
          arrowTo = target;
          labelX = control.x;
          labelY = control.y - 18 * dpr;
        }
        overlay.setLineDash([8 * dpr, 6 * dpr]);
        overlay.lineDashOffset = -(now * 0.03 * dpr);
        overlay.strokeStyle = "#38bdf8";
        overlay.lineWidth = 3.2 * dpr;
        overlay.shadowColor = "rgba(56, 189, 248, 0.6)";
        overlay.shadowBlur = 8 * dpr;
        overlay.stroke();
        overlay.setLineDash([]);

        // Bold IKEA-style triangular arrowhead
        drawArrowhead(overlay, arrowFrom, arrowTo, 14 * dpr, "#38bdf8");

        // Origin anchor: solid luminous circle with dark border
        overlay.beginPath();
        overlay.arc(source.x, source.y, 7 * dpr, 0, Math.PI * 2);
        overlay.fillStyle = "#38bdf8";
        overlay.fill();
        overlay.strokeStyle = "rgba(3, 8, 18, 0.9)";
        overlay.lineWidth = 1.5 * dpr;
        overlay.stroke();

        // Destination landing pad: concentric target ring showing slot
        overlay.beginPath();
        overlay.arc(target.x, target.y, 11 * dpr, 0, Math.PI * 2);
        overlay.strokeStyle = "#fb923c";
        overlay.lineWidth = 2.5 * dpr;
        overlay.stroke();
        overlay.beginPath();
        overlay.arc(target.x, target.y, 4 * dpr, 0, Math.PI * 2);
        overlay.fillStyle = "#fb923c";
        overlay.fill();
        overlay.restore();
        const drawOutline = (position: [number, number, number], colour: string) => {
          const outline = cubieFaceOutline(position, matrices.modelView, state?.size ?? 3)
            .map((point) => transformTurnPointForCubie(point, position, activeTurn))
            .map((point) => projectPoint(point, matrices.modelView, matrices.projection, width, height));
          if (outline.some((point) => !point.inFront)) return;
          overlay.save();
          overlay.strokeStyle = colour;
          overlay.lineWidth = 2.4 * dpr;
          overlay.lineJoin = "round";
          overlay.shadowColor = colour;
          overlay.shadowBlur = 8 * dpr;
          traceProjected(overlay, [...outline, outline[0]]);
          overlay.stroke();
          overlay.restore();
        };
        if (sameSlot) drawOutline(focus.source, "#86efac");
        else {
          drawOutline(focus.source, "#67e8f9");
          drawOutline(focus.target, "#fb923c");
        }
        const kind = focus.piece.length === 2 ? "edge" : "corner";
        const action = sameSlot ? "Orient" : "Move";
        drawBadge(
          overlay,
          focus.label ?? `${action} ${pieceColourLabel(focus.piece, palette)} ${kind}`,
          labelX,
          labelY,
          dpr,
        );
      } else {
        const visibleAnchor = sourceVisible ? source : targetVisible ? target : null;
        drawBadge(
          overlay,
          focus.label ?? `Rotating to show ${pieceColourLabel(focus.piece, palette)} ${focus.piece.length === 2 ? "edge" : "corner"}`,
          visibleAnchor?.x ?? width / 2,
          (visibleAnchor?.y ?? 48 * dpr) - 34 * dpr,
          dpr,
          true,
        );
      }
    }

    if (turnGuide?.step) {
      const transform = turnTransform(state?.size ?? 3, turnGuide.step);
      if (transform) {
        const recovery = turnGuide.tone === "recovery";
        const isRotation = turnGuide.step.move.TAG === "Rotation";

        if (isRotation) {
          // Whole-cube rotation: Render sweeping front-facing tapered curved arrow
          const arcPoints = wholeCubeArcPoints(transform, matrices.modelView, 2.25, 36);
          const projectedArc = arcPoints
            .map((pt) => projectPoint(pt, matrices.modelView, matrices.projection, width, height))
            .filter(({ inFront }) => inFront);

          if (projectedArc.length >= 4) {
            const colour = recovery ? "#fde68a" : "#38bdf8";
            const glowColour = recovery ? "rgba(245, 158, 11, 0.85)" : "rgba(34, 211, 238, 0.85)";
            drawTaperedArrow(overlay, projectedArc, dpr, colour, glowColour, 1.15);
            if (((turnGuide.step.turns % 4) + 4) % 4 === 2) {
              const midpoint = projectedArc[Math.floor(projectedArc.length / 2)]!;
              drawRepeatIndicator(overlay, "2×", midpoint.x, midpoint.y, dpr, recovery ? "recovery" : "normal");
            }
          }
        } else {
          const surfacePaths = turnSurfaceArrowPaths(transform, turnGuide.step, state?.size ?? 3);
          const visibleFacesWithScore = surfacePaths
            .map((item) => {
              const facing = surfaceFacingScore(
                item.normal,
                item.points[Math.floor(item.points.length / 2)],
                matrices.modelView,
              );
              return { ...item, facing };
            })
            .filter(({ facing }) => facing > 0.15)
            .sort((a, b) => b.facing - a.facing);

          if (visibleFacesWithScore.length > 0) {
            // Pick the single best front-facing orientation (highest facing score)
            const bestNormal = visibleFacesWithScore[0]!.normal;
            const bestFaces = visibleFacesWithScore.filter(
              (face) =>
                face.normal[0] === bestNormal[0] &&
                face.normal[1] === bestNormal[1] &&
                face.normal[2] === bestNormal[2],
            );

            bestFaces.forEach(({ points }) => {
              // Do NOT rotate with the moving cube row — keep stationary in space
              const projected = points
                .map((point) => projectPoint(point, matrices.modelView, matrices.projection, width, height))
                .filter(({ inFront }) => inFront);
              if (projected.length < 4) return;

              const arrowColour = recovery ? "#fde68a" : "#38bdf8";
              const glow = recovery ? "rgba(245, 158, 11, 0.85)" : "rgba(34, 211, 238, 0.85)";
              drawTaperedArrow(overlay, projected, dpr, arrowColour, glow, 0.95);
            });
            if (((turnGuide.step.turns % 4) + 4) % 4 === 2) {
              const points = bestFaces[0]!.points
                .map((point) => projectPoint(point, matrices.modelView, matrices.projection, width, height))
                .filter(({inFront}) => inFront);
              if (points.length >= 3) {
                const middle = Math.floor(points.length / 2);
                const anchor = points[middle]!;
                const before = points[Math.max(0, middle - 1)]!;
                const after = points[Math.min(points.length - 1, middle + 1)]!;
                const dx = after.x - before.x;
                const dy = after.y - before.y;
                const length = Math.max(1, Math.hypot(dx, dy));
                const offset = 15 * dpr;
                drawRepeatIndicator(
                  overlay,
                  "2×",
                  anchor.x - (dy / length) * offset,
                  anchor.y + (dx / length) * offset,
                  dpr,
                  recovery ? "recovery" : "normal",
                );
              }
            }
          }
        }
      }
    }

    // Always render 100% width endless Move Ribbon if active guide or timeline ribbon is available
    const ribbon = turnGuide ?? moveRibbon;
    if (ribbon) {
      drawMoveSequenceRibbon(
        overlay,
        ribbon,
        width,
        dpr,
      );
    }
  };

  const render = () => {
    frame = null;
    if (disposed || !visible || vertexCount === 0) return;
    const bounds = canvas.getBoundingClientRect();
    const [width, height] = clampedCanvasSize(bounds.width, bounds.height, window.devicePixelRatio);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    gl.viewport(0, 0, width, height);
    gl.clearColor(0.035, 0.047, 0.075, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.cullFace(gl.BACK);
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    const byteStride = FLOATS_PER_VERTEX * Float32Array.BYTES_PER_ELEMENT;
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 3, gl.FLOAT, false, byteStride, 0);
    gl.enableVertexAttribArray(normal);
    gl.vertexAttribPointer(normal, 3, gl.FLOAT, false, byteStride, 3 * 4);
    gl.enableVertexAttribArray(colour);
    gl.vertexAttribPointer(colour, 4, gl.FLOAT, false, byteStride, 6 * 4);
    gl.enableVertexAttribArray(cubie);
    gl.vertexAttribPointer(cubie, 3, gl.FLOAT, false, byteStride, 10 * 4);
    gl.enableVertexAttribArray(sheen);
    gl.vertexAttribPointer(sheen, 1, gl.FLOAT, false, byteStride, 13 * 4);
    const rawOrientation = deviceOrientationBase && deviceOrientation
      ? deviceOrientationDelta(deviceOrientationBase, deviceOrientation, deviceOrientationFrame, "world")
      : undefined;
    const relativeOrientation = rawOrientation && deviceOrientationCorrection
      ? multiplyQuaternions(deviceOrientationCorrection, rawOrientation)
      : rawOrientation;
    const aspect = width / height;
    const matrices = cameraMatrices(
      aspect,
      yaw,
      pitch,
      safeCameraDistance(distance, aspect),
      relativeOrientation,
    );
    gl.uniformMatrix4fv(modelView, false, matrices.modelView);
    gl.uniformMatrix4fv(projection, false, matrices.projection);
    gl.uniform1f(speedStyle, style === "Speed" ? 1 : 0);
    gl.uniform1f(turnActive, activeTurn ? 1 : 0);
    gl.uniform3fv(turnAxis, activeTurn?.axis ?? [1, 0, 0]);
    gl.uniform2f(turnRange, activeTurn?.min ?? 0, activeTurn?.max ?? 0);
    gl.uniform1f(turnAngle, activeTurn?.angle ?? 0);
    gl.uniform1f(focusTime, performance.now() * 0.001);
    const milestoneValues = new Float32Array(60);
    milestone?.positions.slice(0, 20).forEach((position, index) => {
      milestoneValues.set(position, index * 3);
    });
    gl.uniform1f(milestoneCount, Math.min(20, milestone?.positions.length ?? 0));
    gl.uniform3fv(milestoneCubies, milestoneValues);
    const guideTransform = turnGuide ? turnTransform(state?.size ?? 3, turnGuide.step) : null;
    gl.uniform1f(guideActive, guideTransform ? 1 : 0);
    gl.uniform3fv(guideAxis, guideTransform?.axis ?? [1, 0, 0]);
    gl.uniform2f(guideRange, guideTransform?.min ?? 0, guideTransform?.max ?? 0);
    gl.drawArrays(gl.TRIANGLES, 0, vertexCount);
    drawMotionOverlay(matrices, width, height);
    canvas.dataset.webgl = "ready";
    canvas.dataset.cameraYaw = yaw.toFixed(6);
    canvas.dataset.cameraPitch = pitch.toFixed(6);
    if (focus || turnGuide || milestone) requestRender();
  };

  const requestRender = () => {
    if (disposed || !visible || dialogOpen || frame !== null) return;
    frame = window.requestAnimationFrame(render);
  };

  const canAutoOrbit = () =>
    autoOrbit && !deviceOrientation && visible && !dialogOpen && !document.hidden && !disposed;

  const stopAutoOrbitFrame = () => {
    if (autoOrbitFrame !== null) window.cancelAnimationFrame(autoOrbitFrame);
    autoOrbitFrame = null;
    autoOrbitPreviousTime = null;
  };

  const stepAutoOrbit = (now: number) => {
    autoOrbitFrame = null;
    if (!canAutoOrbit()) {
      autoOrbitPreviousTime = null;
      return;
    }
    if (autoOrbitPreviousTime !== null && !dragging) {
      yaw += autoOrbitYawDelta(now - autoOrbitPreviousTime);
      requestRender();
    }
    autoOrbitPreviousTime = now;
    autoOrbitFrame = window.requestAnimationFrame(stepAutoOrbit);
  };

  const startAutoOrbitFrame = () => {
    if (!canAutoOrbit() || autoOrbitFrame !== null) return;
    autoOrbitPreviousTime = null;
    autoOrbitFrame = window.requestAnimationFrame(stepAutoOrbit);
  };

  const upload = () => {
    if (!state) return;
    const generated = CubeGeometry.generate(state, style, palette) as GeometryResult;
    if (generated.TAG === "Error") {
      onError(generated._0);
      return;
    }
    const mesh = generated._0;
    const values = new Float32Array(mesh.data);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    if (values.length > allocatedFloats) {
      gl.bufferData(
        gl.ARRAY_BUFFER,
        Math.max(vboCapacityFloats(state.size), values.length) * Float32Array.BYTES_PER_ELEMENT,
        gl.DYNAMIC_DRAW,
      );
      allocatedFloats = Math.max(vboCapacityFloats(state.size), values.length);
    }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, values);
    vertexCount = mesh.vertexCount;
    requestRender();
  };

  let velocityYaw = 0;
  let velocityPitch = 0;
  let lastMoveTime = 0;
  let inertiaFrame: number | null = null;

  const stopInertia = () => {
    if (inertiaFrame !== null) {
      window.cancelAnimationFrame(inertiaFrame);
      inertiaFrame = null;
    }
  };

  const stepInertia = () => {
    inertiaFrame = null;
    if (disposed || dragging) return;
    yaw += velocityYaw;
    pitch = Math.max(-1.35, Math.min(1.35, pitch + velocityPitch));
    velocityYaw *= 0.92;
    velocityPitch *= 0.92;
    requestRender();
    if (Math.abs(velocityYaw) > 0.0001 || Math.abs(velocityPitch) > 0.0001) {
      inertiaFrame = window.requestAnimationFrame(stepInertia);
    } else {
      velocityYaw = 0;
      velocityPitch = 0;
    }
  };

  const pointerDown = (event: PointerEvent) => {
    stopInertia();
    dragging = true;
    previousX = event.clientX;
    previousY = event.clientY;
    lastMoveTime = performance.now();
    velocityYaw = 0;
    velocityPitch = 0;
    canvas.setPointerCapture(event.pointerId);
  };
  const pointerMove = (event: PointerEvent) => {
    if (!dragging) return;
    const now = performance.now();
    const dt = Math.max(1, now - lastMoveTime);
    lastMoveTime = now;
    const dx = (event.clientX - previousX) * 0.009;
    const dy = (event.clientY - previousY) * 0.009;
    yaw += dx;
    pitch = Math.max(-1.35, Math.min(1.35, pitch + dy));
    previousX = event.clientX;
    previousY = event.clientY;
    const weight = Math.min(1, dt / 25);
    const targetVx = (dx / dt) * 16.67;
    const targetVy = (dy / dt) * 16.67;
    velocityYaw = velocityYaw * (1 - weight) + targetVx * weight;
    velocityPitch = velocityPitch * (1 - weight) + targetVy * weight;
    requestRender();
  };
  const pointerUp = (event: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    const elapsed = performance.now() - lastMoveTime;
    if (elapsed > 90) {
      velocityYaw = 0;
      velocityPitch = 0;
    } else if (Math.abs(velocityYaw) > 0.0002 || Math.abs(velocityPitch) > 0.0002) {
      stopInertia();
      inertiaFrame = window.requestAnimationFrame(stepInertia);
    }
  };
  const wheel = (event: WheelEvent) => {
    event.preventDefault();
    distance = Math.max(5.6, Math.min(11, distance + event.deltaY * 0.006));
    requestRender();
  };
  const contextLost = (event: Event) => {
    event.preventDefault();
    canvas.dataset.webgl = "lost";
    onError("The WebGL context was lost. Reload the page to restore the preview.");
  };
  const documentVisibilityChanged = () => {
    if (document.hidden) stopAutoOrbitFrame();
    else {
      requestRender();
      startAutoOrbitFrame();
    }
  };

  const cancelTurn = () => {
    turnGeneration += 1;
    if (turnFrame !== null) window.cancelAnimationFrame(turnFrame);
    turnFrame = null;
    activeTurn = null;
    delete canvas.dataset.animating;
    delete canvas.dataset.turnPreviewDegrees;
    requestRender();
  };

  const cancelCamera = () => {
    cameraGeneration += 1;
    if (cameraFrame !== null) window.cancelAnimationFrame(cameraFrame);
    cameraFrame = null;
  };

  const smoothOrbitTo = (targetYaw: number, targetPitch: number, duration = 450): Promise<void> => {
    cancelCamera();
    stopInertia();
    stopAutoOrbitFrame();
    const generation = cameraGeneration;
    const started = performance.now();
    const startYaw = yaw;
    const startPitch = pitch;
    return new Promise((resolve) => {
      const tick = (now: number) => {
        if (disposed || generation !== cameraGeneration) {
          resolve();
          return;
        }
        const progress = Math.min(1, (now - started) / Math.max(1, duration));
        yaw = cameraTween(startYaw, targetYaw, progress);
        const eased = progress * progress * (3 - 2 * progress);
        pitch = startPitch + (targetPitch - startPitch) * eased;
        requestRender();
        if (progress < 1) {
          cameraFrame = window.requestAnimationFrame(tick);
        } else {
          cameraFrame = null;
          startAutoOrbitFrame();
          resolve();
        }
      };
      cameraFrame = window.requestAnimationFrame(tick);
    });
  };

  const animateTurn = (turn: TurnTransform, duration = 180): Promise<void> => {
    cancelTurn();
    const generation = turnGeneration;
    const started = performance.now();
    const safeDuration = Math.max(1, duration);
    canvas.dataset.animating = "true";
    return new Promise((resolve) => {
      const tick = (now: number) => {
        if (disposed || generation !== turnGeneration) {
          resolve();
          return;
        }
        const progress = Math.min(1, (now - started) / safeDuration);
        const eased = 1 - (1 - progress) ** 3;
        activeTurn = { ...turn, angle: turn.angle * eased };
        requestRender();
        if (progress < 1) {
          turnFrame = window.requestAnimationFrame(tick);
        } else {
          turnFrame = null;
          activeTurn = null;
          delete canvas.dataset.animating;
          requestRender();
          resolve();
        }
      };
      turnFrame = window.requestAnimationFrame(tick);
    });
  };

  canvas.addEventListener("pointerdown", pointerDown);
  canvas.addEventListener("pointermove", pointerMove);
  canvas.addEventListener("pointerup", pointerUp);
  canvas.addEventListener("pointercancel", pointerUp);
  canvas.addEventListener("wheel", wheel, { passive: false });
  canvas.addEventListener("webglcontextlost", contextLost);
  document.addEventListener("visibilitychange", documentVisibilityChanged);
  const resizeObserver = new ResizeObserver(requestRender);
  resizeObserver.observe(canvas);
  const intersectionObserver = new IntersectionObserver(
    ([entry]) => {
      visible = entry?.isIntersecting ?? true;
      if (visible) {
        requestRender();
        startAutoOrbitFrame();
      } else stopAutoOrbitFrame();
    },
    { threshold: 0.01 },
  );
  intersectionObserver.observe(canvas);

  return {
    setScene(nextState, nextPalette, nextStyle) {
      cancelTurn();
      state = nextState;
      palette = nextPalette;
      style = nextStyle;
      upload();
    },
    setState(nextState, nextPalette) {
      cancelTurn();
      state = nextState;
      palette = nextPalette;
      upload();
    },
    setStyle(nextStyle) {
      if (style === nextStyle) return;
      style = nextStyle;
      upload();
    },
    animateTurn,
    cancelTurn,
    setTurnPreview(turn, degrees = 4) {
      cancelTurn();
      if (turn) {
        activeTurn = turnPreviewTransform(turn, degrees);
        canvas.dataset.turnPreviewDegrees = String(degrees);
      }
      requestRender();
    },
    setFocus(nextFocus) {
      focus = nextFocus;
      if (nextFocus) {
        overlayCanvas.dataset.motionVisible = "true";
        canvas.dataset.focusHighlight = "edges";
        canvas.dataset.focusPiece = nextFocus.piece;
        canvas.dataset.focusSource = nextFocus.source.join(",");
        canvas.dataset.focusTarget = nextFocus.target.join(",");
        if (nextFocus.label) canvas.dataset.focusLabel = nextFocus.label;
        else delete canvas.dataset.focusLabel;
      } else {
        if (!turnGuide && !milestone) delete overlayCanvas.dataset.motionVisible;
        delete canvas.dataset.focusHighlight;
        delete canvas.dataset.focusPiece;
        delete canvas.dataset.focusSource;
        delete canvas.dataset.focusTarget;
        delete canvas.dataset.focusLabel;
      }
      requestRender();
    },
    setMilestone(nextMilestone) {
      milestone = nextMilestone;
      if (nextMilestone) {
        overlayCanvas.dataset.motionVisible = "true";
        overlayCanvas.dataset.milestone = nextMilestone.label;
      } else {
        if (!focus && !turnGuide) delete overlayCanvas.dataset.motionVisible;
        delete overlayCanvas.dataset.milestone;
      }
      requestRender();
    },
    setTurnGuide(nextGuide) {
      turnGuide = nextGuide;
      if (nextGuide) {
        overlayCanvas.dataset.motionVisible = "true";
        overlayCanvas.dataset.turnGuide = nextGuide.label;
        overlayCanvas.dataset.turnGuideTone = nextGuide.tone ?? "normal";
        const repeat = nextGuide.step ? turnRepeatIndicator(nextGuide.step) : undefined;
        if (repeat) overlayCanvas.dataset.turnRepeat = repeat;
        else delete overlayCanvas.dataset.turnRepeat;
      } else {
        if (!focus && !milestone) delete overlayCanvas.dataset.motionVisible;
        delete overlayCanvas.dataset.turnGuide;
        delete overlayCanvas.dataset.turnGuideTone;
        delete overlayCanvas.dataset.turnRepeat;
      }
      requestRender();
    },
    setMoveRibbon(nextRibbon) {
      moveRibbon = nextRibbon;
      requestRender();
    },
    smoothOrbitTo,
    setDeviceOrientation(orientation, coordinateFrame = "viewport") {
      if (!orientation) {
        deviceOrientationBase = null;
        deviceOrientation = null;
        deviceOrientationCorrection = null;
        deviceOrientationFrame = "viewport";
        delete canvas.dataset.deviceOrientation;
        requestRender();
        return;
      }
      const normalized = normalizedQuaternion(orientation);
      if (deviceOrientationFrame !== coordinateFrame) {
        deviceOrientationBase = null;
        deviceOrientation = null;
        deviceOrientationCorrection = null;
      }
      deviceOrientationFrame = coordinateFrame;
      if (!deviceOrientationBase) deviceOrientationBase = normalized;
      deviceOrientation = deviceOrientation
        ? smoothTrackedOrientation(deviceOrientation, normalized)
        : normalized;
      cancelCamera();
      stopInertia();
      stopAutoOrbitFrame();
      canvas.dataset.deviceOrientation = "tracking";
      requestRender();
    },
    recenterDeviceOrientation(orientation, coordinateFrame = "viewport") {
      const normalized = normalizedQuaternion(orientation);
      deviceOrientationBase = normalized;
      deviceOrientation = normalized;
      deviceOrientationFrame = coordinateFrame;
      deviceOrientationCorrection = null;
      canvas.dataset.deviceOrientation = "tracking";
      requestRender();
    },
    reconcileDeviceOrientation(orientation, target, coordinateFrame = "viewport") {
      const normalized = normalizedQuaternion(orientation);
      if (deviceOrientationFrame !== coordinateFrame || !deviceOrientationBase) {
        deviceOrientationBase = normalized;
        deviceOrientationFrame = coordinateFrame;
      }
      deviceOrientation = normalized;
      deviceOrientationCorrection = orientationCorrectionForTarget(
        deviceOrientationBase,
        normalized,
        target,
        coordinateFrame,
      );
      canvas.dataset.deviceOrientation = "tracking";
      requestRender();
    },
    adoptDeviceOrientationTarget(orientation, coordinateFrame = "viewport") {
      const normalized = normalizedQuaternion(orientation);
      if (deviceOrientationFrame !== coordinateFrame || !deviceOrientationBase) {
        deviceOrientationBase = normalized;
        deviceOrientationFrame = coordinateFrame;
      }
      deviceOrientation = normalized;
      canvas.dataset.deviceOrientation = "tracking";
      requestRender();
      const raw = deviceOrientationDelta(deviceOrientationBase, normalized, coordinateFrame, "world");
      return multiplyQuaternions(deviceOrientationCorrection ?? {x: 0, y: 0, z: 0, w: 1}, raw);
    },
    stabilizeDeviceOrientation(
      measured,
      target,
      coordinateFrame = "viewport",
      maximumStepRadians = 2 * Math.PI / 180,
      responsiveness = 0.18,
    ) {
      if (deviceOrientationFrame !== coordinateFrame || !deviceOrientationBase || !deviceOrientation) {
        return {applied: false, targetErrorRadians: null, targetErrorAxis: null, correctionStepRadians: 0};
      }
      const raw = deviceOrientationDelta(deviceOrientationBase, measured, coordinateFrame, "world");
      const priorCorrection = deviceOrientationCorrection ?? {x: 0, y: 0, z: 0, w: 1};
      const rendered = multiplyQuaternions(priorCorrection, raw);
      const targetErrorRadians = orientationDistanceRadians(rendered, target);
      const targetErrorAxis = quaternionAxisAngle(multiplyQuaternions(target, inverseQuaternion(rendered))).axis;
      const nextCorrection = stabilizedOrientationCorrection(
        priorCorrection,
        deviceOrientationBase,
        measured,
        target,
        coordinateFrame,
        responsiveness,
        maximumStepRadians,
      );
      deviceOrientationCorrection = nextCorrection;
      requestRender();
      return {
        applied: true,
        targetErrorRadians,
        targetErrorAxis,
        correctionStepRadians: orientationDistanceRadians(priorCorrection, nextCorrection),
      };
    },
    setAutoOrbit(enabled) {
      if (deviceOrientation && enabled) enabled = false;
      if (autoOrbit === enabled) return;
      autoOrbit = enabled;
      canvas.dataset.autoOrbitState = enabled ? "on" : "off";
      if (enabled) {
        stopInertia();
        velocityYaw = 0;
        velocityPitch = 0;
        startAutoOrbitFrame();
      } else stopAutoOrbitFrame();
      requestRender();
    },
    setDialogOpen(open) {
      if (dialogOpen === open) return;
      dialogOpen = open;
      if (open) {
        stopAutoOrbitFrame();
      } else {
        requestRender();
        startAutoOrbitFrame();
      }
    },
    resetCamera() {
      deviceOrientationBase = null;
      deviceOrientation = null;
      deviceOrientationCorrection = null;
      deviceOrientationFrame = "viewport";
      delete canvas.dataset.deviceOrientation;
      cancelCamera();
      stopInertia();
      velocityYaw = 0;
      velocityPitch = 0;
      yaw = DEFAULT_YAW;
      pitch = DEFAULT_PITCH;
      distance = DEFAULT_DISTANCE;
      requestRender();
    },
    refresh: requestRender,
    async capturePng(): Promise<Blob | null> {
      if (disposed || !visible || vertexCount === 0) return null;
      // WebGL permits source access in the same JavaScript execution period as
      // its draw. Keep this synchronous; preserveDrawingBuffer remains false.
      render();
      return pngBlobFromDataUrl(canvas.toDataURL("image/png"));
    },
    dispose() {
      disposed = true;
      cancelCamera();
      stopInertia();
      stopAutoOrbitFrame();
      cancelTurn();
      if (frame !== null) window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      overlay?.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
      canvas.removeEventListener("pointerdown", pointerDown);
      canvas.removeEventListener("pointermove", pointerMove);
      canvas.removeEventListener("pointerup", pointerUp);
      canvas.removeEventListener("pointercancel", pointerUp);
      canvas.removeEventListener("wheel", wheel);
      canvas.removeEventListener("webglcontextlost", contextLost);
      document.removeEventListener("visibilitychange", documentVisibilityChanged);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
    },
  };
};
