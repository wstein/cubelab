import {describe, expect, test} from "vitest";

import * as CubeGeometry from "../../src/Render/CubeGeometry.res.mjs";
import * as StateTypes from "../../src/State/StateTypes.res.mjs";
import {
  autoOrbitYawDelta,
  cameraTween,
  cameraMatrices,
  clampedCanvasSize,
  turnTransform,
  turnPreviewTransform,
  transformTurnPointForCubie,
  transformTurnPoint,
  focusCameraTarget,
  matrixFromQuaternion,
  multiplyQuaternions,
  orientationInViewportFrame,
  orientationCorrectionForTarget,
  orientationDistanceRadians,
  pngBlobFromDataUrl,
  relativeQuaternion,
  safeCameraDistance,
  stabilizedOrientationCorrection,
  smoothTrackedOrientation,
  standardStickerFinish,
  vboCapacityFloats,
} from "../../src/client/cube-gl";
import {cubieIsFrontFacing} from "../../src/client/motion-overlay";

describe("cube viewport math", () => {
  test("derives a display correction without changing the raw IMU pose", () => {
    const base = {x: 0, y: 0, z: 0, w: 1};
    const raw = {x: Math.sin(47 * Math.PI / 180), y: 0, z: 0, w: Math.cos(47 * Math.PI / 180)};
    const target = {x: Math.SQRT1_2, y: 0, z: 0, w: Math.SQRT1_2};
    const correction = orientationCorrectionForTarget(base, raw, target);
    const corrected = multiplyQuaternions(correction, raw);
    expect(corrected.x).toBeCloseTo(target.x);
    expect(corrected.y).toBeCloseTo(target.y);
    expect(corrected.z).toBeCloseTo(target.z);
    expect(corrected.w).toBeCloseTo(target.w);
  });

  test("moves the rendered pose toward its settled cardinal target without overshooting", () => {
    const base = {x: 0, y: 0, z: 0, w: 1};
    const displayed = {x: Math.sin(85 * Math.PI / 360), y: 0, z: 0, w: Math.cos(85 * Math.PI / 360)};
    const target = {x: Math.SQRT1_2, y: 0, z: 0, w: Math.SQRT1_2};
    const correction = stabilizedOrientationCorrection(null, base, displayed, target);
    const corrected = multiplyQuaternions(correction, displayed);
    expect(corrected.x).toBeGreaterThan(displayed.x);
    expect(corrected.x).toBeLessThan(target.x);
  });

  test("treats a cardinal regrip as too far away for face-turn stabilization", () => {
    const identity = {x: 0, y: 0, z: 0, w: 1};
    const x = {x: Math.SQRT1_2, y: 0, z: 0, w: Math.SQRT1_2};
    expect(orientationDistanceRadians(identity, x)).toBeCloseTo(Math.PI / 2);
    expect(orientationDistanceRadians(identity, x)).toBeGreaterThan(10 * Math.PI / 180);
  });

  test("keeps Standard stickers at a restrained mid-gloss finish", () => {
    expect(standardStickerFinish.keyPeak).toBeLessThan(0.5);
    expect(standardStickerFinish.fillPeak).toBeLessThan(0.25);
    expect(standardStickerFinish.rim).toBeLessThan(0.25);
  });

  test("converts a synchronously captured PNG data URI without a network fetch", async () => {
    const blob = pngBlobFromDataUrl("data:image/png;base64,AAE=");
    expect(blob?.type).toBe("image/png");
    expect(new Uint8Array(await blob!.arrayBuffer())).toEqual(new Uint8Array([0, 1]));
    expect(pngBlobFromDataUrl("data:text/plain;base64,AAE=")).toBeNull();
  });

  test("advances auto orbit at a stable speed and clamps resumed frames", () => {
    expect(autoOrbitYawDelta(0)).toBe(0);
    expect(autoOrbitYawDelta(25)).toBeCloseTo(0.006);
    expect(autoOrbitYawDelta(1_000)).toBeCloseTo(0.012);
    expect(autoOrbitYawDelta(-10)).toBe(0);
  });

  test("preallocates enough VBO space as cube sizes increase", () => {
    const capacities = [2, 3, 4, 5].map(vboCapacityFloats);
    expect(capacities.every((value) => value > 0)).toBe(true);
    expect(capacities).toEqual([...capacities].sort((a, b) => a - b));
    expect(capacities.every((value) => value % 14 === 0)).toBe(true);
    for (const size of [2, 3, 4, 5]) {
      for (const style of ["Standard", "Speed"]) {
        const generated = CubeGeometry.generate(StateTypes.solved(size)._0, style, "Western");
        expect(generated.TAG).toBe("Ok");
        if (generated.TAG === "Ok") {
          expect(generated._0.data.length).toBeLessThanOrEqual(vboCapacityFloats(size));
        }
      }
    }
  });

  test("maps logical face, slice, range, and rotation moves to shader transforms", () => {
    const right = turnTransform(3, {
      move: {TAG: "FaceTurn", _0: "R", _1: {from_: 1, to_: 1}},
      turns: 1,
    });
    expect(right?.axis).toEqual([1, 0, 0]);
    expect(right?.min).toBeCloseTo(0.9);
    expect(right?.max).toBeCloseTo(1.1);
    expect(right?.angle).toBeCloseTo(-Math.PI / 2);

    const range = turnTransform(5, {
      move: {TAG: "FaceTurn", _0: "R", _1: {from_: 2, to_: 3}},
      turns: 2,
    });
    expect(range?.min).toBeCloseTo(-0.06);
    expect(range?.max).toBeCloseTo(0.66);
    expect(range?.angle).toBeCloseTo(-Math.PI);

    expect(turnTransform(3, {move: {TAG: "SliceTurn", _0: "M"}, turns: 1})).toMatchObject({
      axis: [1, 0, 0],
      angle: Math.PI / 2,
    });
    expect(turnTransform(3, {move: {TAG: "Rotation", _0: "Y"}, turns: -1})).toEqual({
      axis: [0, 1, 0],
      min: -2,
      max: 2,
      angle: Math.PI / 2,
    });
  });

  test("previews every move direction with a fixed four-degree layer displacement", () => {
    const clockwise = turnPreviewTransform({axis: [1, 0, 0], min: 0.9, max: 1.1, angle: -Math.PI});
    const counterclockwise = turnPreviewTransform({
      axis: [1, 0, 0],
      min: 0.9,
      max: 1.1,
      angle: Math.PI / 2,
    });
    expect(clockwise.angle).toBeCloseTo(-4 * Math.PI / 180);
    expect(counterclockwise.angle).toBeCloseTo(4 * Math.PI / 180);
    const transformed = transformTurnPoint([1, 1, 0], {
      axis: [0, 0, 1],
      min: -0.1,
      max: 0.1,
      angle: Math.PI / 2,
    });
    expect(transformed[0]).toBeCloseTo(-1);
    expect(transformed[1]).toBeCloseTo(1);
    expect(transformed[2]).toBeCloseTo(0);
  });

  test("moves projected sticker frames with their owning cubie", () => {
    const turn = turnPreviewTransform(turnTransform(3, {
      move: {TAG: "FaceTurn", _0: "R", _1: {from_: 1, to_: 1}},
      turns: 1,
    })!);
    const cubie: [number, number, number] = [1, 1, 0];
    const outsideLayerSurface: [number, number, number] = [1.535, 1.4, 0.4];
    expect(transformTurnPointForCubie(outsideLayerSurface, cubie, turn)).not.toEqual(outsideLayerSurface);
  });

  test("reframes sequence purpose around its source and target cubies", () => {
    const camera = focusCameraTarget({
      piece: "UFR",
      source: [1, 1, 1],
      target: [1, -1, 1],
    });
    expect([camera.yaw, camera.pitch].every(Number.isFinite)).toBe(true);
    const cameraView = cameraMatrices(1, camera.yaw, camera.pitch, 7.2);
    expect(cubieIsFrontFacing([1, 1, 1], cameraView.modelView)).toBe(true);
    expect(cubieIsFrontFacing([1, -1, 1], cameraView.modelView)).toBe(true);

    const opposedFocus = {
      piece: "UF",
      source: [0, 1, 1] as [number, number, number],
      target: [1, 0, -1] as [number, number, number],
    };
    const opposedCamera = focusCameraTarget(opposedFocus);
    const matrices = cameraMatrices(1, opposedCamera.yaw, opposedCamera.pitch, 7.2);
    expect(cubieIsFrontFacing(opposedFocus.source, matrices.modelView)).toBe(true);
    expect(cubieIsFrontFacing(opposedFocus.target, matrices.modelView)).toBe(true);
  });

  test("clamps device pixel ratio without producing zero-sized canvases", () => {
    expect(clampedCanvasSize(0, 0, 3)).toEqual([1, 1]);
    expect(clampedCanvasSize(320, 240, 1)).toEqual([320, 240]);
    expect(clampedCanvasSize(320, 240, 3)).toEqual([640, 480]);
  });

  test("camera matrices remain finite for supported viewport shapes", () => {
    for (const aspect of [0.5, 1, 4 / 3, 2]) {
      const matrices = cameraMatrices(aspect, -0.62, -0.48, 6.4);
      expect(matrices.modelView).toHaveLength(16);
      expect(matrices.projection).toHaveLength(16);
      expect([...matrices.modelView, ...matrices.projection].every(Number.isFinite)).toBe(true);
    }
  });

  test("backs the camera away only for narrow viewports", () => {
    expect(safeCameraDistance(8.4, 16 / 9)).toBe(8.4);
    expect(safeCameraDistance(8.4, 1)).toBeCloseTo(10.08);
    expect(safeCameraDistance(8.4, 0.5)).toBeCloseTo(14.4);
  });

  test("camera tween follows the shortest wrapped route with smooth endpoints", () => {
    expect(cameraTween(0, 1, 0)).toBe(0);
    expect(cameraTween(0, 1, 1)).toBeCloseTo(1);
    expect(cameraTween(Math.PI - 0.1, -Math.PI + 0.1, 0.5)).toBeCloseTo(Math.PI);
  });

  test("keeps smart-cube orientation as a normalized three-axis rotation matrix", () => {
    expect([...matrixFromQuaternion({x: 0, y: 0, z: 0, w: 1})]).toEqual([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ]);
    const half = Math.sqrt(0.5);
    const roll = matrixFromQuaternion({x: 0, y: 0, z: half * 3, w: half * 3});
    expect(roll[0]).toBeCloseTo(0);
    expect(roll[1]).toBeCloseTo(1);
    expect(roll[4]).toBeCloseTo(-1);
    expect(roll[5]).toBeCloseTo(0);
    expect([...roll].every(Number.isFinite)).toBe(true);
  });

  test("locks GoCube jitter and softens deliberate live orientation movement", () => {
    const identity = {x: 0, y: 0, z: 0, w: 1};
    const tiny = Math.PI / 360;
    expect(smoothTrackedOrientation(identity, {
      x: 0,
      y: Math.sin(tiny / 2),
      z: 0,
      w: Math.cos(tiny / 2),
    })).toEqual(identity);

    const half = Math.sqrt(0.5);
    const softened = smoothTrackedOrientation(identity, {x: 0, y: half, z: 0, w: half});
    expect(softened.y).toBeGreaterThan(0);
    expect(softened.y).toBeLessThan(half);
    expect(Math.hypot(softened.x, softened.y, softened.z, softened.w)).toBeCloseTo(1);
  });

  test("maps GoCube sensor axes to canonical viewport axes", () => {
    const half = Math.sqrt(0.5);
    const aroundSensorX = orientationInViewportFrame(
      {x: half, y: 0, z: 0, w: half},
      "gocube-wire",
    );
    const aroundSensorY = orientationInViewportFrame(
      {x: 0, y: -half, z: 0, w: half},
      "gocube-wire",
    );
    const aroundSensorZ = orientationInViewportFrame(
      {x: 0, y: 0, z: half, w: half},
      "gocube-wire",
    );
    expect(aroundSensorX.x).toBeCloseTo(half);
    expect(aroundSensorX.y).toBeCloseTo(0);
    expect(aroundSensorX.z).toBeCloseTo(0);

    expect(aroundSensorY.x).toBeCloseTo(0);
    expect(aroundSensorY.y).toBeCloseTo(half);
    expect(aroundSensorY.z).toBeCloseTo(0);

    expect(aroundSensorZ.x).toBeCloseTo(0);
    expect(aroundSensorZ.y).toBeCloseTo(0);
    expect(aroundSensorZ.z).toBeCloseTo(half);
  });

  test("maps GAN wire sensor axes (X: Red, Y: Blue, Z: White) to canonical viewport axes", () => {
    const half = Math.sqrt(0.5);
    const aroundGanX = orientationInViewportFrame({x: half, y: 0, z: 0, w: half}, "gan-wire");
    const aroundGanY = orientationInViewportFrame({x: 0, y: half, z: 0, w: half}, "gan-wire");
    const aroundGanZ = orientationInViewportFrame({x: 0, y: 0, z: half, w: half}, "gan-wire");

    // GAN +X (Red) -> Viewport +X
    expect(aroundGanX.x).toBeCloseTo(half);
    expect(aroundGanX.y).toBeCloseTo(0);
    expect(aroundGanX.z).toBeCloseTo(0);

    // GAN +Y (Blue) -> Viewport -Z
    expect(aroundGanY.x).toBeCloseTo(0);
    expect(aroundGanY.y).toBeCloseTo(0);
    expect(aroundGanY.z).toBeCloseTo(-half);

    // GAN +Z (White) -> Viewport +Y
    expect(aroundGanZ.x).toBeCloseTo(0);
    expect(aroundGanZ.y).toBeCloseTo(half);
    expect(aroundGanZ.z).toBeCloseTo(0);
  });

  test("calibrates the first hardware quaternion without discarding later roll", () => {
    const half = Math.sqrt(0.5);
    const base = {x: 0, y: half, z: 0, w: half};
    const identityRelative = relativeQuaternion(base, base);
    expect(identityRelative.x).toBeCloseTo(0);
    expect(identityRelative.y).toBeCloseTo(0);
    expect(identityRelative.z).toBeCloseTo(0);
    expect(identityRelative.w).toBeCloseTo(1);

    const relativeRoll = relativeQuaternion(base, {x: -0.5, y: 0.5, z: 0.5, w: 0.5});
    const matrix = matrixFromQuaternion(relativeRoll);
    expect([...matrix].every(Number.isFinite)).toBe(true);
    expect(Math.abs(matrix[1]) + Math.abs(matrix[4])).toBeGreaterThan(1.5);
  });

  test("uses GoCube's measured world-frame delta convention", () => {
    const base = {x: 0.2, y: -0.3, z: 0.1, w: 0.9};
    const current = {x: -0.1, y: 0.4, z: 0.3, w: 0.8};
    const inverseBase = {x: -base.x, y: -base.y, z: -base.z, w: base.w};
    const worldDelta = relativeQuaternion(base, current);
    const expectedWorld = relativeQuaternion(
      {x: 0, y: 0, z: 0, w: 1},
      multiplyQuaternions(current, inverseBase),
    );
    const localDelta = relativeQuaternion(
      {x: 0, y: 0, z: 0, w: 1},
      multiplyQuaternions(inverseBase, current),
    );
    expect(worldDelta.x).toBeCloseTo(expectedWorld.x);
    expect(worldDelta.y).toBeCloseTo(expectedWorld.y);
    expect(worldDelta.z).toBeCloseTo(expectedWorld.z);
    expect(worldDelta.w).toBeCloseTo(expectedWorld.w);
    expect(Math.abs(worldDelta.x - localDelta.x)
      + Math.abs(worldDelta.y - localDelta.y)
      + Math.abs(worldDelta.z - localDelta.z)).toBeGreaterThan(0.05);
  });

  test("applies physical object orientation before the tilted camera view", () => {
    const half = Math.sqrt(0.5);
    const modelView = cameraMatrices(
      1,
      Math.PI / 2,
      0,
      0,
      {x: 0, y: 0, z: half, w: half},
    ).modelView;
    const transformDirection = (matrix: Float32Array, direction: [number, number, number]) => [
      matrix[0] * direction[0] + matrix[4] * direction[1] + matrix[8] * direction[2],
      matrix[1] * direction[0] + matrix[5] * direction[1] + matrix[9] * direction[2],
      matrix[2] * direction[0] + matrix[6] * direction[1] + matrix[10] * direction[2],
    ];
    const transformed = transformDirection(modelView, [1, 0, 0]);
    expect(transformed[0]).toBeCloseTo(0);
    expect(transformed[1]).toBeCloseTo(1);
    expect(transformed[2]).toBeCloseTo(0);
  });
});
