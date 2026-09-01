import * as CubeGeometry from "../Render/CubeGeometry.res.mjs";
import {
  cubieSurfaceAnchor,
  motionLabel,
  pieceColourLabel,
  projectPoint,
  turnArcPoints,
  type ProjectedPoint,
} from "./motion-overlay";

export type CubeStyle = "Standard" | "Speed";
export type CubePalette = "Western" | "Japanese";
export type CubeState = {size: number; facelets: string[][]};
export type CubieFocus = {
  piece: string;
  source: [number, number, number];
  target: [number, number, number];
  label?: string;
};
export type MilestoneFocus = {positions: Array<[number, number, number]>; label: string};

type GeometryMesh = {data: number[]; vertexCount: number; stride: number};
type GeometryResult = {TAG: "Ok"; _0: GeometryMesh} | {TAG: "Error"; _0: string};
type Mat4 = Float32Array;
export type MoveStep = {
  move:
    | {TAG: "FaceTurn"; _0: "U" | "L" | "F" | "R" | "B" | "D"; _1: {from_: number; to_: number}}
    | {TAG: "SliceTurn"; _0: "M" | "E" | "S"}
    | {TAG: "Rotation"; _0: "X" | "Y" | "Z"};
  turns: number;
};
export type TurnTransform = {
  axis: [number, number, number];
  min: number;
  max: number;
  angle: number;
};
export type CameraTarget = {yaw: number; pitch: number};
type TurnGuide = {step: MoveStep; label: string};

const DEFAULT_YAW = -0.62;
const DEFAULT_PITCH = 0.48;
const DEFAULT_DISTANCE = 7.2;
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
  uniform float uFocusActive;
  uniform vec3 uFocusSource;
  uniform vec3 uFocusTarget;
  uniform float uMilestoneCount;
  uniform vec3 uMilestoneCubies[20];
  uniform float uGuideActive;
  uniform vec3 uGuideAxis;
  uniform vec2 uGuideRange;
  varying vec3 vPosition;
  varying vec3 vNormal;
  varying vec4 vColour;
  varying float vSheen;
  varying float vSourceFocus;
  varying float vTargetFocus;
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
    vSourceFocus = uFocusActive * (1.0 - step(0.01, distance(aCubie, uFocusSource)));
    vTargetFocus = uFocusActive * (1.0 - step(0.01, distance(aCubie, uFocusTarget)));
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
  varying float vSourceFocus;
  varying float vTargetFocus;
  varying float vMilestoneFocus;
  varying float vGuideLayer;
  uniform float uSpeedStyle;
  uniform float uFocusActive;
  uniform float uFocusTime;
  uniform float uGuideActive;

  void main() {
    vec3 normal = normalize(vNormal);
    vec3 key = normalize(vec3(0.42, 0.68, 0.92));
    vec3 fill = normalize(vec3(-0.74, -0.24, 0.56));
    vec3 rim = normalize(vec3(-0.35, 0.70, -0.62));
    vec3 view = normalize(-vPosition);
    float keyDiffuse = max(dot(normal, key), 0.0);
    float fillDiffuse = max(dot(normal, fill), 0.0);
    float rimDiffuse = max(dot(normal, rim), 0.0);
    float light = 0.27 + 0.62 * keyDiffuse + 0.20 * fillDiffuse + 0.12 * rimDiffuse;
    float body = 1.0 - smoothstep(0.02, 0.12, distance(vColour.rgb, vec3(0.13, 0.14, 0.17)));
    float shine = mix(28.0, 24.0, body);
    float strength = mix(0.18 + 0.05 * uSpeedStyle, 0.30, body);
    vec3 halfway = normalize(key + view);
    float specular = strength * pow(max(dot(normal, halfway), 0.0), shine);
    vec3 rolledSheen = vColour.rgb * vSheen * (0.45 + 0.55 * rimDiffuse);
    vec3 colour = min(vColour.rgb * light + rolledSheen + vec3(specular), vec3(1.0));
    float selected = max(max(max(vSourceFocus, vTargetFocus), vMilestoneFocus), vGuideLayer);
    float luminance = dot(colour, vec3(0.299, 0.587, 0.114));
    vec3 muted = mix(colour, vec3(luminance), 0.18) * 0.86;
    float focusMode = max(uFocusActive, uGuideActive);
    colour = mix(colour, muted, focusMode * (1.0 - selected));

    float fresnel = pow(1.0 - max(dot(normal, view), 0.0), 2.2);
    float pulse = 0.82 + 0.18 * sin(uFocusTime * 4.0);
    float focusEdge = smoothstep(0.08, 0.55, fresnel);
    vec3 sourceEdge = vec3(0.18, 0.92, 1.0) * focusEdge * pulse;
    vec3 targetEdge = vec3(1.0, 0.55, 0.18) * focusEdge;
    colour = min(
      colour + sourceEdge * vSourceFocus + targetEdge * vTargetFocus,
      vec3(1.0)
    );
    float sameSlot = vSourceFocus * vTargetFocus;
    colour = min(colour + vec3(0.40, 1.0, 0.58) * focusEdge * sameSlot, vec3(1.0));
    vec3 milestoneGlow = vec3(0.20, 1.0, 0.55) * (0.18 + 0.42 * fresnel) * pulse;
    colour = min(colour + milestoneGlow * vMilestoneFocus, vec3(1.0));
    gl_FragColor = vec4(colour, vColour.a);
  }
`;

export const vboCapacityFloats = (size: number): number => {
  const inner = Math.max(0, size - 2);
  const visibleCubies = size ** 3 - inner ** 3;
  const bodyVertices = visibleCubies * 132;
  const exposedFaceVertices = 6 * size * size * 336;
  return (bodyVertices + exposedFaceVertices) * FLOATS_PER_VERTEX;
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
    return {axis, min: -2, max: 2, angle: -turns * quarter};
  }
  if (step.move.TAG === "SliceTurn") {
    const axis: [number, number, number] =
      step.move._0 === "M" ? [1, 0, 0] : step.move._0 === "E" ? [0, 1, 0] : [0, 0, 1];
    const direction = step.move._0 === "S" ? -1 : 1;
    return {axis, min: -epsilon, max: epsilon, angle: direction * turns * quarter};
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

export const turnPreviewCamera = (
  turn: TurnTransform,
  focus?: CubieFocus | null,
): CameraTarget => {
  const axis = turn.axis;
  const view: [number, number, number] = [axis[0], axis[1], axis[2]];
  if (Math.abs(axis[1]) > 0.8) {
    view[0] += 0.58;
    view[2] += 0.58;
  } else {
    view[1] += 0.46;
    if (Math.abs(axis[0]) > 0.8) view[2] += 0.52;
    else view[0] += 0.52;
  }
  if (focus) {
    for (const position of [focus.source, focus.target]) {
      view[0] += Math.sign(position[0]) * 0.12;
      view[1] += Math.sign(position[1]) * 0.12;
      view[2] += Math.sign(position[2]) * 0.12;
    }
  }
  const length = Math.max(0.001, Math.hypot(...view));
  const direction = view.map((value) => value / length) as [number, number, number];
  return {
    yaw: Math.atan2(-direction[0], direction[2]),
    pitch: Math.asin(Math.max(-1, Math.min(1, direction[1]))),
  };
};

export const clampedCanvasSize = (
  width: number,
  height: number,
  devicePixelRatio: number,
): [number, number] => {
  const dpr = Math.min(Math.max(devicePixelRatio, 1), 2);
  return [Math.max(1, Math.round(width * dpr)), Math.max(1, Math.round(height * dpr))];
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
): {modelView: Mat4; projection: Mat4} => ({
  modelView: multiply(translation(-distance), multiply(rotationX(pitch), rotationY(yaw))),
  projection: perspective(aspect),
});

export const cameraTween = (start: number, target: number, progress: number): number => {
  const wrapped = ((target - start + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  const bounded = Math.max(0, Math.min(1, progress));
  const eased = bounded * bounded * (3 - 2 * bounded);
  return start + wrapped * eased;
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
  smoothOrbitTo: (yaw: number, pitch: number, duration?: number) => Promise<void>;
  setAutoOrbit: (enabled: boolean) => void;
  resetCamera: () => void;
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
  const focusActive = gl.getUniformLocation(program, "uFocusActive");
  const focusSource = gl.getUniformLocation(program, "uFocusSource");
  const focusTarget = gl.getUniformLocation(program, "uFocusTarget");
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
  let allocatedSize = 0;
  let yaw = DEFAULT_YAW;
  let pitch = DEFAULT_PITCH;
  let distance = DEFAULT_DISTANCE;
  let frame: number | null = null;
  let visible = true;
  let dragging = false;
  let previousX = 0;
  let previousY = 0;
  let disposed = false;
  let activeTurn: TurnTransform | null = null;
  let focus: CubieFocus | null = null;
  let milestone: MilestoneFocus | null = null;
  let turnGuide: TurnGuide | null = null;
  let turnFrame: number | null = null;
  let turnGeneration = 0;
  let autoOrbit = false;
  let autoOrbitFrame: number | null = null;
  let autoOrbitPreviousTime: number | null = null;
  let cameraFrame: number | null = null;
  let cameraGeneration = 0;
  let previewCamera: CameraTarget | null = null;
  let previewActive = false;
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

  const drawBadge = (
    context: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    dpr: number,
    muted = false,
  ) => {
    context.save();
    context.font = `600 ${12 * dpr}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    const paddingX = 8 * dpr;
    const height = 25 * dpr;
    const width = context.measureText(text).width + paddingX * 2;
    const left = Math.max(6 * dpr, Math.min(overlayCanvas.width - width - 6 * dpr, x - width / 2));
    const top = Math.max(6 * dpr, Math.min(overlayCanvas.height - height - 6 * dpr, y - height / 2));
    context.fillStyle = muted ? "rgba(15, 23, 42, 0.82)" : "rgba(8, 15, 30, 0.9)";
    context.strokeStyle = muted ? "rgba(148, 163, 184, 0.58)" : "rgba(103, 232, 249, 0.78)";
    context.lineWidth = dpr;
    context.beginPath();
    context.roundRect(left, top, width, height, 6 * dpr);
    context.fill();
    context.stroke();
    context.fillStyle = muted ? "rgba(203, 213, 225, 0.85)" : "#cffafe";
    context.textBaseline = "middle";
    context.fillText(text, left + paddingX, top + height / 2);
    context.restore();
  };

  const drawMotionOverlay = (
    matrices: {modelView: Mat4; projection: Mat4},
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
      const source = projectPoint(sourceAnchor.point, matrices.modelView, matrices.projection, width, height);
      const target = projectPoint(targetAnchor.point, matrices.modelView, matrices.projection, width, height);
      const targetVisible = target.inFront && targetAnchor.visible;
      const alpha = targetVisible ? 1 : 0.45;
      overlay.save();
      overlay.globalAlpha = alpha;
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
        arrowFrom = {x: source.x + radius * 0.92, y: source.y - radius * 0.38, depth: 0, inFront: true};
        arrowTo = {x: source.x + radius, y: source.y + radius * 0.1, depth: 0, inFront: true};
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
        arrowFrom = {x: control.x, y: control.y, depth: 0, inFront: true};
        arrowTo = target;
        labelX = control.x;
        labelY = control.y - 18 * dpr;
      }
      overlay.setLineDash([]);
      drawArrowhead(overlay, arrowFrom, arrowTo, 11 * dpr, "#fb923c");
      overlay.beginPath();
      overlay.arc(source.x, source.y, 6 * dpr, 0, Math.PI * 2);
      overlay.fillStyle = "#67e8f9";
      overlay.fill();
      overlay.beginPath();
      overlay.arc(target.x, target.y, 9 * dpr, 0, Math.PI * 2);
      overlay.strokeStyle = "#fb923c";
      overlay.lineWidth = 2 * dpr;
      overlay.stroke();
      overlay.restore();
      const kind = focus.piece.length === 2 ? "edge" : "corner";
      const action = sameSlot ? "Orient" : "Move";
      drawBadge(
        overlay,
        focus.label ?? `${action} ${pieceColourLabel(focus.piece, palette)} ${kind}${targetVisible ? "" : " · orbit to view back"}`,
        labelX,
        labelY,
        dpr,
        !targetVisible,
      );
    }

    if (turnGuide) {
      const transform = turnTransform(state?.size ?? 3, turnGuide.step);
      if (transform) {
        const points = turnArcPoints(transform, turnGuide.step)
          .map((point) => projectPoint(point, matrices.modelView, matrices.projection, width, height))
          .filter(({inFront}) => inFront);
        if (points.length > 2) {
          overlay.save();
          overlay.strokeStyle = "#a5b4fc";
          overlay.lineWidth = 3 * dpr;
          overlay.lineCap = "round";
          overlay.shadowColor = "rgba(129, 140, 248, 0.95)";
          overlay.shadowBlur = 10 * dpr;
          traceProjected(overlay, points);
          overlay.stroke();
          drawArrowhead(overlay, points.at(-2)!, points.at(-1)!, 10 * dpr, "#c4b5fd");
          overlay.restore();
          const anchor = points[Math.floor(points.length * 0.55)];
          drawBadge(
            overlay,
            motionLabel(turnGuide.label, turnGuide.step),
            anchor.x,
            anchor.y - 18 * dpr,
            dpr,
          );
        }
      }
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
    const matrices = cameraMatrices(width / height, yaw, pitch, distance);
    gl.uniformMatrix4fv(modelView, false, matrices.modelView);
    gl.uniformMatrix4fv(projection, false, matrices.projection);
    gl.uniform1f(speedStyle, style === "Speed" ? 1 : 0);
    gl.uniform1f(turnActive, activeTurn ? 1 : 0);
    gl.uniform3fv(turnAxis, activeTurn?.axis ?? [1, 0, 0]);
    gl.uniform2f(turnRange, activeTurn?.min ?? 0, activeTurn?.max ?? 0);
    gl.uniform1f(turnAngle, activeTurn?.angle ?? 0);
    gl.uniform1f(focusActive, focus ? 1 : 0);
    gl.uniform3fv(focusSource, focus?.source ?? [0, 0, 0]);
    gl.uniform3fv(focusTarget, focus?.target ?? [0, 0, 0]);
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
    if (disposed || !visible || frame !== null) return;
    frame = window.requestAnimationFrame(render);
  };

  const canAutoOrbit = () =>
    autoOrbit && !previewActive && visible && !document.hidden && !disposed;

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
    if (allocatedSize !== state.size) {
      gl.bufferData(
        gl.ARRAY_BUFFER,
        vboCapacityFloats(state.size) * Float32Array.BYTES_PER_ELEMENT,
        gl.DYNAMIC_DRAW,
      );
      allocatedSize = state.size;
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
    distance = Math.max(4.8, Math.min(9, distance + event.deltaY * 0.006));
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
    cancelCamera();
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
        activeTurn = {...turn, angle: turn.angle * eased};
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
  canvas.addEventListener("wheel", wheel, {passive: false});
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
    {threshold: 0.01},
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
        if (!previewCamera) previewCamera = {yaw, pitch};
        canvas.dataset.previewCameraYaw = previewCamera.yaw.toFixed(6);
        canvas.dataset.previewCameraPitch = previewCamera.pitch.toFixed(6);
        previewActive = true;
        activeTurn = turnPreviewTransform(turn, degrees);
        canvas.dataset.turnPreviewDegrees = String(degrees);
        const camera = turnPreviewCamera(turn, focus);
        void smoothOrbitTo(camera.yaw, camera.pitch, 180);
      } else {
        previewActive = false;
        const camera = previewCamera;
        if (camera) {
          void smoothOrbitTo(camera.yaw, camera.pitch, 180).then(() => {
            if (!previewActive) {
              previewCamera = null;
              delete canvas.dataset.previewCameraYaw;
              delete canvas.dataset.previewCameraPitch;
            }
          });
        } else {
          delete canvas.dataset.previewCameraYaw;
          delete canvas.dataset.previewCameraPitch;
        }
      }
      requestRender();
    },
    setFocus(nextFocus) {
      focus = nextFocus;
      if (nextFocus) {
        canvas.dataset.focusHighlight = "edges";
        canvas.dataset.focusPiece = nextFocus.piece;
        canvas.dataset.focusSource = nextFocus.source.join(",");
        canvas.dataset.focusTarget = nextFocus.target.join(",");
      } else {
        delete canvas.dataset.focusHighlight;
        delete canvas.dataset.focusPiece;
        delete canvas.dataset.focusSource;
        delete canvas.dataset.focusTarget;
      }
      requestRender();
    },
    setMilestone(nextMilestone) {
      milestone = nextMilestone;
      if (nextMilestone) overlayCanvas.dataset.milestone = nextMilestone.label;
      else delete overlayCanvas.dataset.milestone;
      requestRender();
    },
    setTurnGuide(nextGuide) {
      turnGuide = nextGuide;
      if (nextGuide) {
        overlayCanvas.dataset.turnGuide = nextGuide.label;
      } else {
        delete overlayCanvas.dataset.turnGuide;
      }
      requestRender();
    },
    smoothOrbitTo,
    setAutoOrbit(enabled) {
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
    resetCamera() {
      cancelCamera();
      stopInertia();
      velocityYaw = 0;
      velocityPitch = 0;
      yaw = DEFAULT_YAW;
      pitch = DEFAULT_PITCH;
      distance = DEFAULT_DISTANCE;
      requestRender();
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
