import type {MoveStep, TurnTransform} from "./cube-gl";

export type Vector3 = [number, number, number];
export type ProjectedPoint = {x: number; y: number; depth: number; inFront: boolean};
export type SurfaceAnchor = {point: Vector3; normal: Vector3; visible: boolean};
export type TurnSurfaceArrowPath = {normal: Vector3; points: Vector3[]};
const FACE_SURFACE = 1.70;

const dot = (left: Vector3, right: Vector3): number =>
  left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
const scale = (vector: Vector3, amount: number): Vector3 =>
  [vector[0] * amount, vector[1] * amount, vector[2] * amount];
const add = (left: Vector3, right: Vector3): Vector3 =>
  [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
const cross = (left: Vector3, right: Vector3): Vector3 => [
  left[1] * right[2] - left[2] * right[1],
  left[2] * right[0] - left[0] * right[2],
  left[0] * right[1] - left[1] * right[0],
];
const normalize = (vector: Vector3): Vector3 => {
  const length = Math.hypot(...vector);
  return length === 0 ? [0, 0, 0] : scale(vector, 1 / length);
};

const transformPoint = (matrix: ArrayLike<number>, point: Vector3, w: number): [number, number, number, number] => [
  matrix[0] * point[0] + matrix[4] * point[1] + matrix[8] * point[2] + matrix[12] * w,
  matrix[1] * point[0] + matrix[5] * point[1] + matrix[9] * point[2] + matrix[13] * w,
  matrix[2] * point[0] + matrix[6] * point[1] + matrix[10] * point[2] + matrix[14] * w,
  matrix[3] * point[0] + matrix[7] * point[1] + matrix[11] * point[2] + matrix[15] * w,
];

export const projectPoint = (
  point: Vector3,
  modelView: ArrayLike<number>,
  projection: ArrayLike<number>,
  width: number,
  height: number,
): ProjectedPoint => {
  const camera = transformPoint(modelView, point, 1);
  const clip = transformPoint(projection, [camera[0], camera[1], camera[2]], camera[3]);
  const inverseW = clip[3] === 0 ? 0 : 1 / clip[3];
  const ndcX = clip[0] * inverseW;
  const ndcY = clip[1] * inverseW;
  return {
    x: (ndcX * 0.5 + 0.5) * width,
    y: (0.5 - ndcY * 0.5) * height,
    depth: clip[2] * inverseW,
    inFront: clip[3] > 0 && Math.abs(ndcX) <= 1.15 && Math.abs(ndcY) <= 1.15,
  };
};

export const cubieSurfaceAnchor = (
  point: Vector3,
  modelView: ArrayLike<number>,
  size = 3,
): SurfaceAnchor => {
  const camera = transformPoint(modelView, point, 1);
  const view = normalize([-camera[0], -camera[1], -camera[2]]);
  const normals: Array<{normal: Vector3; facing: number}> = [];
  point.forEach((value, axis) => {
    if (Math.abs(value) < 0.75) return;
    const normal: Vector3 = [0, 0, 0];
    normal[axis] = Math.sign(value);
    const transformed = transformPoint(modelView, normal, 0);
    const cameraNormal = normalize([transformed[0], transformed[1], transformed[2]]);
    normals.push({normal, facing: dot(cameraNormal, view)});
  });
  normals.sort((left, right) => right.facing - left.facing);
  const selected = normals[0] ?? {normal: [0, 0, 1] as Vector3, facing: -1};
  return {
    point: add(point, scale(selected.normal, 1.5 / size + 0.035)),
    normal: selected.normal,
    visible: selected.facing > 0.08,
  };
};

export const cubieFaceOutline = (
  point: Vector3,
  modelView: ArrayLike<number>,
  size = 3,
): Vector3[] => {
  const anchor = cubieSurfaceAnchor(point, modelView, size);
  const tangent: Vector3 = Math.abs(anchor.normal[1]) > 0.8 ? [1, 0, 0] : [0, 1, 0];
  const bitangent = normalize(cross(anchor.normal, tangent));
  const half = 1.25 / size;
  return [
    add(anchor.point, add(scale(tangent, -half), scale(bitangent, -half))),
    add(anchor.point, add(scale(tangent, half), scale(bitangent, -half))),
    add(anchor.point, add(scale(tangent, half), scale(bitangent, half))),
    add(anchor.point, add(scale(tangent, -half), scale(bitangent, half))),
  ];
};

export const cubieIsFrontFacing = (point: Vector3, modelView: ArrayLike<number>): boolean =>
  cubieSurfaceAnchor(point, modelView).visible;

export const surfaceFacingScore = (
  normal: Vector3,
  point: Vector3,
  modelView: ArrayLike<number>,
): number => {
  const camera = transformPoint(modelView, point, 1);
  const view = normalize([-camera[0], -camera[1], -camera[2]]);
  const transformed = transformPoint(modelView, normal, 0);
  return dot(normalize([transformed[0], transformed[1], transformed[2]]), view);
};

const roundedSquare = (theta: number, half = 1.58, cornerR = 0.18): [number, number] => {
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const k = half - cornerR;
  const cx = Math.max(-k, Math.min(k, (half * cos) / (Math.abs(cos) + 0.0001)));
  const cy = Math.max(-k, Math.min(k, (half * sin) / (Math.abs(sin) + 0.0001)));
  return [cx + cornerR * cos, cy + cornerR * sin];
};

export const turnLayerArcPaths = (
  transform: TurnTransform,
  step: MoveStep,
  modelView: ArrayLike<number>,
  size = 3,
  samples = 72,
): Vector3[][] => {
  const axis = normalize(transform.axis);
  const cell = 3 / Math.max(2, size);
  const outer = 1.5 - cell / 2;
  const layerCentres = step.move.TAG === "FaceTurn"
    ? Array.from({length: size}, (_, index) => outer - index * cell)
      .filter((coordinate) => coordinate >= transform.min && coordinate <= transform.max)
    : [0];
  const dir = Math.sign(transform.angle || 1);

  const u: Vector3 = Math.abs(axis[1]) > 0.8 ? [1, 0, 0] : [0, 1, 0];
  const v = normalize(cross(axis, u));
  const uOrth = normalize(cross(v, axis));

  return layerCentres.map((layerCoord) => {
    const points: Array<{angle: number; pt: Vector3; visible: boolean}> = [];
    for (let i = 0; i < samples; i++) {
      const angle = (i / samples) * Math.PI * 2;
      const [x, y] = roundedSquare(angle, 1.58, 0.18);
      const pt: Vector3 = add(scale(axis, layerCoord), add(scale(uOrth, x), scale(v, y)));
      const normal: Vector3 = add(scale(uOrth, Math.cos(angle)), scale(v, Math.sin(angle)));
      const score = surfaceFacingScore(normal, pt, modelView);
      points.push({angle, pt, visible: score > 0.08});
    }

    let bestRun: Array<{angle: number; pt: Vector3; visible: boolean}> = [];
    let currentRun: Array<{angle: number; pt: Vector3; visible: boolean}> = [];
    for (let stepIdx = 0; stepIdx < samples * 2; stepIdx++) {
      const idx = stepIdx % samples;
      if (points[idx]!.visible) {
        currentRun.push(points[idx]!);
      } else {
        if (currentRun.length > bestRun.length) bestRun = currentRun;
        currentRun = [];
      }
    }
    if (currentRun.length > bestRun.length) bestRun = currentRun;

    if (bestRun.length < 5) return [];

    const ordered = dir < 0 ? [...bestRun].reverse() : bestRun;
    return ordered.map((item) => item.pt);
  }).filter((arc) => arc.length >= 4);
};

export const turnSurfaceArrowPaths = (
  transform: TurnTransform,
  step: MoveStep,
  size = 3,
  samples = 18,
): TurnSurfaceArrowPath[] => {
  const axis = normalize(transform.axis);
  const cell = 3 / Math.max(2, size);
  const outer = 1.5 - cell / 2;
  const layerCentres = step.move.TAG === "FaceTurn"
    ? Array.from({length: size}, (_, index) => outer - index * cell)
      .filter((coordinate) => coordinate >= transform.min && coordinate <= transform.max)
    : [0];
  const normals: Vector3[] = [
    [1, 0, 0], [-1, 0, 0],
    [0, 1, 0], [0, -1, 0],
    [0, 0, 1], [0, 0, -1],
  ];
  const adjacent = normals.filter((normal) => Math.abs(dot(axis, normal)) < 0.1);
  const count = Math.max(3, samples);
  return adjacent.flatMap((normal) => {
    const motion = scale(normalize(cross(axis, normal)), Math.sign(transform.angle || 1));
    return layerCentres.map((layer) => {
      const centre = add(scale(axis, layer), scale(normal, FACE_SURFACE));
      const points = Array.from({length: count}, (_, index) => {
        const progress = index / (count - 1);
        return add(centre, scale(motion, (progress - 0.5) * 2.18));
      });
      return {normal, points};
    });
  });
};

export const wholeCubeArcPoints = (
  transform: TurnTransform,
  modelView: ArrayLike<number>,
  radius = 2.22,
  count = 36,
): Vector3[] => {
  const axis = normalize(transform.axis);
  const u: Vector3 = Math.abs(axis[1]) > 0.8 ? [1, 0, 0] : [0, 1, 0];
  const v = normalize(cross(axis, u));
  const uOrth = normalize(cross(v, axis));

  // Find angle in rotation plane closest to the camera (front-most point)
  const A = modelView[2] * uOrth[0] + modelView[6] * uOrth[1] + modelView[10] * uOrth[2];
  const B = modelView[2] * v[0] + modelView[6] * v[1] + modelView[10] * v[2];
  const thetaFront = Math.atan2(B, A);

  const dir = Math.sign(transform.angle || 1);
  // Span an elegant sweeping arc (~100 degrees) across the front view
  const arcSpan = 1.75;
  const startAngle = thetaFront - arcSpan * 0.60 * dir;
  const endAngle = thetaFront + arcSpan * 0.40 * dir;

  return Array.from({length: count + 1}, (_, index) => {
    const progress = index / count;
    const angle = startAngle + progress * (endAngle - startAngle);
    return add(
      scale(uOrth, radius * Math.cos(angle)),
      scale(v, radius * Math.sin(angle)),
    );
  });
};

export const turnRepeatIndicator = (step: MoveStep): string | null => {
  const turns = ((step.turns % 4) + 4) % 4;
  if (turns === 0) return null;
  if (step.move.TAG === "Rotation") {
    const axis = step.move._0.toLowerCase();
    if (turns === 2) return `${axis}2`;
    return turns === 3 ? `${axis}'` : axis;
  }
  return turns === 2 ? "2×" : null;
};

export const pieceColourLabel = (piece: string, palette: "Western" | "Japanese"): string => {
  const western: Record<string, string> = {
    U: "white",
    L: "orange",
    F: "green",
    R: "red",
    B: "blue",
    D: "yellow",
  };
  const japanese = {...western, D: "blue", B: "yellow"};
  const colours = palette === "Japanese" ? japanese : western;
  return [...piece].map((face) => colours[face]).join("–");
};
