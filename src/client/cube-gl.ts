import * as CubeGeometry from "../Render/CubeGeometry.res.mjs";

export type CubeStyle = "Standard" | "Speed";
export type CubePalette = "Western" | "Japanese";
export type CubeState = {size: number; facelets: string[][]};

type GeometryMesh = {data: number[]; vertexCount: number; stride: number};
type GeometryResult = {TAG: "Ok"; _0: GeometryMesh} | {TAG: "Error"; _0: string};
type Mat4 = Float32Array;

const DEFAULT_YAW = -0.62;
const DEFAULT_PITCH = 0.48;
const DEFAULT_DISTANCE = 7.2;
const FLOATS_PER_VERTEX = 10;

const vertexShaderSource = `
  attribute vec3 aPosition;
  attribute vec3 aNormal;
  attribute vec4 aColour;
  uniform mat4 uModelView;
  uniform mat4 uProjection;
  varying vec3 vPosition;
  varying vec3 vNormal;
  varying vec4 vColour;

  void main() {
    vec4 position = uModelView * vec4(aPosition, 1.0);
    vPosition = position.xyz;
    vNormal = normalize(mat3(uModelView) * aNormal);
    vColour = aColour;
    gl_Position = uProjection * position;
  }
`;

const fragmentShaderSource = `
  precision highp float;
  varying vec3 vPosition;
  varying vec3 vNormal;
  varying vec4 vColour;
  uniform float uSpeedStyle;

  void main() {
    vec3 normal = normalize(vNormal);
    vec3 key = normalize(vec3(0.35, 0.60, 1.0));
    vec3 fill = normalize(vec3(-0.60, -0.30, 0.50));
    vec3 view = normalize(-vPosition);
    float keyDiffuse = max(dot(normal, key), 0.0);
    float fillDiffuse = max(dot(normal, fill), 0.0);
    float light = 0.30 + 0.70 * keyDiffuse + 0.22 * fillDiffuse;
    float body = 1.0 - smoothstep(0.02, 0.12, distance(vColour.rgb, vec3(0.13, 0.14, 0.17)));
    float shine = mix(18.0 + 10.0 * uSpeedStyle, 24.0, body);
    float strength = mix(0.26 + 0.12 * uSpeedStyle, 0.35, body);
    vec3 halfway = normalize(key + view);
    float specular = strength * pow(max(dot(normal, halfway), 0.0), shine);
    vec3 colour = min(vColour.rgb * light + vec3(specular), vec3(1.0));
    gl_FragColor = vec4(colour, vColour.a);
  }
`;

export const vboCapacityFloats = (size: number): number => {
  const inner = Math.max(0, size - 2);
  const visibleCubies = size ** 3 - inner ** 3;
  return visibleCubies * 324 * FLOATS_PER_VERTEX;
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
  resetCamera: () => void;
  dispose: () => void;
};

export const createCubeViewport = (
  canvas: HTMLCanvasElement,
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
  const modelView = gl.getUniformLocation(program, "uModelView");
  const projection = gl.getUniformLocation(program, "uProjection");
  const speedStyle = gl.getUniformLocation(program, "uSpeedStyle");

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
    const matrices = cameraMatrices(width / height, yaw, pitch, distance);
    gl.uniformMatrix4fv(modelView, false, matrices.modelView);
    gl.uniformMatrix4fv(projection, false, matrices.projection);
    gl.uniform1f(speedStyle, style === "Speed" ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, vertexCount);
    canvas.dataset.webgl = "ready";
  };

  const requestRender = () => {
    if (disposed || !visible || frame !== null) return;
    frame = window.requestAnimationFrame(render);
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

  const pointerDown = (event: PointerEvent) => {
    dragging = true;
    previousX = event.clientX;
    previousY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
  };
  const pointerMove = (event: PointerEvent) => {
    if (!dragging) return;
    yaw += (event.clientX - previousX) * 0.009;
    pitch = Math.max(-1.35, Math.min(1.35, pitch + (event.clientY - previousY) * 0.009));
    previousX = event.clientX;
    previousY = event.clientY;
    requestRender();
  };
  const pointerUp = (event: PointerEvent) => {
    dragging = false;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
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

  canvas.addEventListener("pointerdown", pointerDown);
  canvas.addEventListener("pointermove", pointerMove);
  canvas.addEventListener("pointerup", pointerUp);
  canvas.addEventListener("pointercancel", pointerUp);
  canvas.addEventListener("wheel", wheel, {passive: false});
  canvas.addEventListener("webglcontextlost", contextLost);
  const resizeObserver = new ResizeObserver(requestRender);
  resizeObserver.observe(canvas);
  const intersectionObserver = new IntersectionObserver(
    ([entry]) => {
      visible = entry?.isIntersecting ?? true;
      if (visible) requestRender();
    },
    {threshold: 0.01},
  );
  intersectionObserver.observe(canvas);

  return {
    setScene(nextState, nextPalette, nextStyle) {
      state = nextState;
      palette = nextPalette;
      style = nextStyle;
      upload();
    },
    setState(nextState, nextPalette) {
      state = nextState;
      palette = nextPalette;
      upload();
    },
    setStyle(nextStyle) {
      if (style === nextStyle) return;
      style = nextStyle;
      upload();
    },
    resetCamera() {
      yaw = DEFAULT_YAW;
      pitch = DEFAULT_PITCH;
      distance = DEFAULT_DISTANCE;
      requestRender();
    },
    dispose() {
      disposed = true;
      if (frame !== null) window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      canvas.removeEventListener("pointerdown", pointerDown);
      canvas.removeEventListener("pointermove", pointerMove);
      canvas.removeEventListener("pointerup", pointerUp);
      canvas.removeEventListener("pointercancel", pointerUp);
      canvas.removeEventListener("wheel", wheel);
      canvas.removeEventListener("webglcontextlost", contextLost);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
    },
  };
};
