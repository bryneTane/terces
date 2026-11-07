// WebGL2 basics: context, full-screen triangle, program cache, context loss handling.
// Effect canvases sit above the photo and are never read back into an export.
export const QUAD_VS = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

export interface GlHandle {
  gl: WebGL2RenderingContext;
  program(key: string, fs: string, vs?: string): WebGLProgram;
  drawQuad(program: WebGLProgram): void;
  resize(): boolean;
  lost(): boolean;
  dispose(): void;
}

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s);
    gl.deleteShader(s);
    throw new Error(`shader: ${log}`);
  }
  return s;
}

export function link(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const p = gl.createProgram()!;
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.bindAttribLocation(p, 0, 'a_pos');
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`link: ${gl.getProgramInfoLog(p)}`);
  return p;
}

/** Returns null when WebGL2 is unavailable; callers then render the static tier. */
export function createGl(canvas: HTMLCanvasElement, onRestore?: () => void): GlHandle | null {
  const gl = canvas.getContext('webgl2', {
    alpha: true,
    premultipliedAlpha: true,
    antialias: false,
    preserveDrawingBuffer: false,
  });
  if (!gl) return null;
  let programs = new Map<string, WebGLProgram>();
  let vao: WebGLVertexArrayObject | null = null;
  let isLost = false;

  const setup = () => {
    programs = new Map();
    vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  };
  const onLost = (e: Event) => {
    e.preventDefault();
    isLost = true;
  };
  const onRestored = () => {
    isLost = false;
    setup();
    onRestore?.();
  };
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);
  setup();

  return {
    gl,
    program(key, fs, vs = QUAD_VS) {
      let p = programs.get(key);
      if (!p) {
        p = link(gl, vs, fs);
        programs.set(key, p);
      }
      return p;
    },
    drawQuad(p) {
      if (isLost) return;
      gl.useProgram(p);
      gl.bindVertexArray(vao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    resize() {
      const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width === w && canvas.height === h) return false;
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
      return true;
    },
    lost: () => isLost,
    dispose() {
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      for (const p of programs.values()) gl.deleteProgram(p);
      programs.clear();
    },
  };
}
