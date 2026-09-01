import type {MoveStep, TurnTransform} from "./cube-gl";

export type Vector3 = [number, number, number];
export type ProjectedPoint = {x: number; y: number; depth: number; inFront: boolean};
export type SurfaceAnchor = {point: Vector3; visible: boolean};

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
    visible: selected.facing > 0.08,
  };
};

export const cubieIsFrontFacing = (point: Vector3, modelView: ArrayLike<number>): boolean =>
  cubieSurfaceAnchor(point, modelView).visible;

export const turnArcPoints = (
  transform: TurnTransform,
  step: MoveStep,
  samples = 44,
): Vector3[] => {
  const axis = normalize(transform.axis);
  const reference: Vector3 = Math.abs(axis[1]) < 0.8 ? [0, 1, 0] : [1, 0, 0];
  const basisU = normalize(cross(axis, reference));
  const basisV = normalize(cross(axis, basisU));
  const faceTurn = step.move.TAG === "FaceTurn";
  const centre = faceTurn ? scale(axis, 1.62) : [0, 0, 0] as Vector3;
  const radius = faceTurn ? 1.12 : 1.72;
  const direction = Math.sign(transform.angle) || 1;
  const sweep = direction * Math.PI * 1.52;
  const start = -Math.PI * 0.72;
  return Array.from({length: Math.max(3, samples)}, (_, index) => {
    const progress = index / (Math.max(3, samples) - 1);
    const angle = start + sweep * progress;
    return add(centre, add(
      scale(basisU, Math.cos(angle) * radius),
      scale(basisV, Math.sin(angle) * radius),
    ));
  });
};

export const motionLabel = (notation: string, step: MoveStep): string => {
  const turns = ((step.turns % 4) + 4) % 4;
  const angle = turns === 2 ? "180°" : "90°";
  if (step.move.TAG !== "FaceTurn" || turns === 2) return `${notation} · ${angle}`;
  return `${notation} · ${angle} ${turns === 3 ? "CCW" : "CW"}`;
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
  const japanese = {...western, F: "blue", B: "green"};
  const colours = palette === "Japanese" ? japanese : western;
  return [...piece].map((face) => colours[face]).join("–");
};
