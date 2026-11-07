// Draws the scan layer. Receives only box geometry and timing: never the photo.
import { ICE, rgb } from '../styles/palette.ts';
import { createGl, link, type GlHandle } from './gl.ts';
import type { Tier } from './quality.ts';
import type { Reticle } from './reticles.ts';
import { BEAM_FS, RETICLE_FS, RETICLE_VS } from './shaders/scan.ts';

const TIER_INDEX: Record<Tier, number> = { high: 0, medium: 1, low: 2, static: 2 };
const MAX_RETICLES = 128;

export class ScanRenderer {
  private h: GlHandle;
  private beam: WebGLProgram;
  private ret: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private inst: WebGLBuffer;
  private data = new Float32Array(MAX_RETICLES * 7);

  static create(canvas: HTMLCanvasElement): ScanRenderer | null {
    try {
      const h = createGl(canvas);
      return h ? new ScanRenderer(h) : null;
    } catch {
      return null;
    }
  }

  private constructor(h: GlHandle) {
    this.h = h;
    const gl = h.gl;
    this.beam = h.program('scan-beam', BEAM_FS);
    this.ret = link(gl, RETICLE_VS, RETICLE_FS);
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.inst = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.inst);
    gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 28, 0);
    gl.vertexAttribDivisor(1, 1);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 28, 16);
    gl.vertexAttribDivisor(2, 1);
    gl.bindVertexArray(null);
  }

  draw(now: number, beam: number, reticles: Reticle[], imgW: number, imgH: number, tier: Tier) {
    const { gl } = this.h;
    if (this.h.lost()) return;
    this.h.resize();
    const w = gl.drawingBufferWidth;
    const hgt = gl.drawingBufferHeight;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(this.beam);
    gl.uniform2f(gl.getUniformLocation(this.beam, 'u_res'), w, hgt);
    gl.uniform1f(gl.getUniformLocation(this.beam, 'u_time'), now / 1000);
    gl.uniform1f(gl.getUniformLocation(this.beam, 'u_beam'), beam);
    gl.uniform1i(gl.getUniformLocation(this.beam, 'u_tier'), TIER_INDEX[tier]);
    gl.uniform3f(gl.getUniformLocation(this.beam, 'u_accent'), ...rgb(ICE.accent));
    gl.uniform3f(gl.getUniformLocation(this.beam, 'u_alert'), ...rgb(ICE.alert));
    this.h.drawQuad(this.beam);

    const n = Math.min(MAX_RETICLES, reticles.length);
    if (!n || !imgW || !imgH) return;
    for (let i = 0; i < n; i++) {
      const r = reticles[i]!;
      this.data.set(
        [
          r.rect.x / imgW,
          r.rect.y / imgH,
          r.rect.w / imgW,
          r.rect.h / imgH,
          r.scale,
          r.alpha,
          r.alert ? 1 : 0,
        ],
        i * 7,
      );
    }
    gl.useProgram(this.ret);
    gl.uniform2f(gl.getUniformLocation(this.ret, 'u_res'), w, hgt);
    gl.uniform3f(gl.getUniformLocation(this.ret, 'u_accent'), ...rgb(ICE.accent));
    gl.uniform3f(gl.getUniformLocation(this.ret, 'u_alert'), ...rgb(ICE.alert));
    gl.uniform1f(gl.getUniformLocation(this.ret, 'u_px'), Math.max(1.5, w / 400));
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.inst);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.data.subarray(0, n * 7));
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);
    gl.bindVertexArray(null);
  }

  dispose() {
    this.h.gl.deleteProgram(this.ret);
    this.h.dispose();
  }
}
