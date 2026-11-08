// Weight-only 8-bit storage for ONNX models, used by `pnpm models:fetch` for the text readers.
// Every large Conv/MatMul weight held in a Constant node becomes an int8 Constant, a Cast back
// to float and a Mul by one scale per output channel. Only the stored weights are rounded: ONNX
// Runtime folds Cast and Mul into a float weight when it loads the model, so inference runs in
// full precision. This keeps the original opset (Cast and Mul exist since opset 6/7) and makes
// a reader about 3.6 times smaller with the same accuracy on the eval set.

/** One protobuf field, kept raw so a message can be written back unchanged. */
interface Field {
  no: number;
  wire: number;
  /** varint and fixed values as bigint, length-delimited values as bytes. */
  v: bigint | Uint8Array;
}

function readVarint(b: Uint8Array, pos: number): [bigint, number] {
  let r = 0n;
  let shift = 0n;
  for (;;) {
    const byte = b[pos++]!;
    r |= BigInt(byte & 0x7f) << shift;
    if (byte < 0x80) return [r, pos];
    shift += 7n;
  }
}

function writeVarint(out: number[], v: bigint) {
  let x = BigInt.asUintN(64, v);
  while (x >= 0x80n) {
    out.push(Number(x & 0x7fn) | 0x80);
    x >>= 7n;
  }
  out.push(Number(x));
}

export function decode(b: Uint8Array): Field[] {
  const fields: Field[] = [];
  let pos = 0;
  while (pos < b.length) {
    const [key, p] = readVarint(b, pos);
    pos = p;
    const no = Number(key >> 3n);
    const wire = Number(key & 7n);
    if (wire === 0) {
      const [v, q] = readVarint(b, pos);
      fields.push({ no, wire, v });
      pos = q;
    } else if (wire === 2) {
      const [len, q] = readVarint(b, pos);
      const end = q + Number(len);
      fields.push({ no, wire, v: b.subarray(q, end) });
      pos = end;
    } else if (wire === 5 || wire === 1) {
      const n = wire === 5 ? 4 : 8;
      let v = 0n;
      for (let i = n - 1; i >= 0; i--) v = (v << 8n) | BigInt(b[pos + i]!);
      fields.push({ no, wire, v });
      pos += n;
    } else throw new Error(`unsupported protobuf wire type ${wire}`);
  }
  return fields;
}

export function encode(fields: Field[]): Uint8Array {
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (const f of fields) {
    const head: number[] = [];
    writeVarint(head, BigInt((f.no << 3) | f.wire));
    if (f.wire === 2) writeVarint(head, BigInt((f.v as Uint8Array).length));
    else if (f.wire === 0) writeVarint(head, f.v as bigint);
    else {
      const n = f.wire === 5 ? 4 : 8;
      let v = f.v as bigint;
      for (let i = 0; i < n; i++) {
        head.push(Number(v & 0xffn));
        v >>= 8n;
      }
    }
    const h = Uint8Array.from(head);
    chunks.push(h);
    size += h.length;
    if (f.wire === 2) {
      chunks.push(f.v as Uint8Array);
      size += (f.v as Uint8Array).length;
    }
  }
  const out = new Uint8Array(size);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

const text = (b: Uint8Array) => new TextDecoder().decode(b);
const bytes = (s: string) => new TextEncoder().encode(s);
const str = (no: number, s: string): Field => ({ no, wire: 2, v: bytes(s) });
const int = (no: number, v: number): Field => ({ no, wire: 0, v: BigInt(v) });
const msg = (no: number, fields: Field[]): Field => ({ no, wire: 2, v: encode(fields) });

// ONNX field numbers (onnx.proto).
const MODEL_GRAPH = 7;
const GRAPH_NODE = 1;
const NODE = { input: 1, output: 2, name: 3, op: 4, attr: 5 };
const ATTR = { name: 1, i: 3, t: 5, type: 20 };
const ATTR_INT = 2;
const ATTR_TENSOR = 4;
const TENSOR = { dims: 1, type: 2, floats: 4, name: 8, raw: 9 };
const FLOAT = 1;
const INT8 = 3;

interface Node {
  fields: Field[];
  op: string;
  inputs: string[];
  outputs: string[];
}

function parseNode(b: Uint8Array): Node {
  const fields = decode(b);
  const strs = (no: number) => fields.filter((f) => f.no === no).map((f) => text(f.v as Uint8Array));
  return { fields, op: strs(NODE.op)[0] ?? '', inputs: strs(NODE.input), outputs: strs(NODE.output) };
}

function readDims(fields: Field[]): number[] {
  const dims: number[] = [];
  for (const f of fields.filter((x) => x.no === TENSOR.dims)) {
    if (f.wire === 0) dims.push(Number(f.v));
    else {
      const b = f.v as Uint8Array;
      for (let p = 0; p < b.length;) {
        const [v, q] = readVarint(b, p);
        dims.push(Number(v));
        p = q;
      }
    }
  }
  return dims;
}

/** Float values of a Constant node's tensor, or null when it is not a float tensor. */
function constantFloats(node: Node): { dims: number[]; data: Float32Array } | null {
  const attr = node.fields.find((f) => f.no === NODE.attr);
  if (!attr) return null;
  const t = decode(attr.v as Uint8Array).find((f) => f.no === ATTR.t);
  if (!t) return null;
  const tf = decode(t.v as Uint8Array);
  if (Number(tf.find((f) => f.no === TENSOR.type)?.v ?? 0) !== FLOAT) return null;
  const dims = readDims(tf);
  const raw = tf.find((f) => f.no === TENSOR.raw)?.v as Uint8Array | undefined;
  const packed = tf.find((f) => f.no === TENSOR.floats)?.v;
  const src = raw ?? (packed instanceof Uint8Array ? packed : null);
  if (!src) return null;
  const data = new Float32Array(src.length / 4);
  new Uint8Array(data.buffer).set(src);
  return { dims, data };
}

function tensor(name: string, dims: number[], type: number, raw: Uint8Array): Field[] {
  return [
    ...dims.map((d) => int(TENSOR.dims, d)),
    int(TENSOR.type, type),
    str(TENSOR.name, name),
    { no: TENSOR.raw, wire: 2, v: raw },
  ];
}

function node(op: string, inputs: string[], outputs: string[], attrs: Field[][] = []): Field {
  return msg(GRAPH_NODE, [
    ...inputs.map((i) => str(NODE.input, i)),
    ...outputs.map((o) => str(NODE.output, o)),
    str(NODE.name, `${outputs[0]}_${op.toLowerCase()}`),
    str(NODE.op, op),
    ...attrs.map((a) => msg(NODE.attr, a)),
  ]);
}

const constant = (name: string, dims: number[], type: number, raw: Uint8Array) =>
  node(
    'Constant',
    [],
    [name],
    [[str(ATTR.name, 'value'), msg(ATTR.t, tensor(name, dims, type, raw)), int(ATTR.type, ATTR_TENSOR)]],
  );

/** Weights smaller than this stay in float: they are a rounding error of the file size. */
const MIN_WEIGHTS = 4096;

/**
 * Per output channel int8 version of `w`. Conv weights are [out, in, kh, kw] (channel axis 0),
 * MatMul weights are [in, out] (channel axis 1). Returns the int8 values and the scale shape.
 */
export function quantize(w: Float32Array, dims: number[], axis: 0 | 1) {
  const channels = dims[axis]!;
  const scale = new Float32Array(channels);
  const inner = axis === 0 ? w.length / channels : 1;
  const stride = axis === 0 ? 1 : channels;
  const channelOf = (i: number) => (axis === 0 ? Math.floor(i / inner) : i % stride);
  for (let i = 0; i < w.length; i++) {
    const c = channelOf(i);
    scale[c] = Math.max(scale[c]!, Math.abs(w[i]!));
  }
  for (let c = 0; c < channels; c++) scale[c] = Math.max(scale[c]!, 1e-12) / 127;
  const q = new Int8Array(w.length);
  for (let i = 0; i < w.length; i++)
    q[i] = Math.max(-127, Math.min(127, Math.round(w[i]! / scale[channelOf(i)]!)));
  const scaleDims = dims.map((d, i) => (i === axis ? d : 1));
  return { q, scale, scaleDims };
}

/** Rewrites a model so its large Conv/MatMul weights are stored in 8 bits. */
export function int8Weights(model: Uint8Array): { bytes: Uint8Array; weights: number } {
  const top = decode(model);
  const gi = top.findIndex((f) => f.no === MODEL_GRAPH);
  if (gi < 0) throw new Error('no graph in model');
  const graph = decode(top[gi]!.v as Uint8Array);
  const nodes = graph.filter((f) => f.no === GRAPH_NODE).map((f) => parseNode(f.v as Uint8Array));
  const uses = new Map<string, { op: string; slot: number }[]>();
  for (const n of nodes)
    n.inputs.forEach((name, slot) => uses.set(name, [...(uses.get(name) ?? []), { op: n.op, slot }]));

  let weights = 0;
  const out: Field[] = [];
  let ni = 0;
  for (const f of graph) {
    if (f.no !== GRAPH_NODE) {
      out.push(f);
      continue;
    }
    const n = nodes[ni++]!;
    const name = n.outputs[0] ?? '';
    const u = uses.get(name) ?? [];
    const weight =
      n.op === 'Constant' &&
      u.length > 0 &&
      u.every((x) => x.slot === 1 && (x.op === 'Conv' || x.op === 'MatMul'));
    const values = weight ? constantFloats(n) : null;
    if (!values || values.data.length < MIN_WEIGHTS) {
      out.push(f);
      continue;
    }
    const axis = u[0]!.op === 'Conv' ? 0 : 1;
    const { q, scale, scaleDims } = quantize(values.data, values.dims, axis);
    out.push(
      constant(`${name}_q`, values.dims, INT8, new Uint8Array(q.buffer)),
      node(
        'Cast',
        [`${name}_q`],
        [`${name}_qf`],
        [[str(ATTR.name, 'to'), int(ATTR.i, FLOAT), int(ATTR.type, ATTR_INT)]],
      ),
      constant(`${name}_s`, scaleDims, FLOAT, new Uint8Array(scale.buffer)),
      node('Mul', [`${name}_qf`, `${name}_s`], [name]),
    );
    weights++;
  }
  top[gi] = { no: MODEL_GRAPH, wire: 2, v: encode(out) };
  return { bytes: encode(top), weights };
}

/**
 * The `PostProcess.character_dict` list of a PaddleOCR inference.yml. Entries are plain or
 * single-quoted YAML scalars, one per line (`  - x`, `  - '''`).
 */
export function paddleDict(yml: string): string[] {
  const lines = yml.split('\n');
  const start = lines.findIndex((l) => /^\s*character_dict:\s*$/.test(l));
  if (start < 0) throw new Error('no character_dict in inference.yml');
  const dict: string[] = [];
  for (const line of lines.slice(start + 1)) {
    const m = /^\s*- (.*)$/.exec(line);
    if (!m) break;
    const v = m[1]!;
    if (v.startsWith("'")) dict.push(v.slice(1, -1).replace(/''/g, "'"));
    else if (v.startsWith('"')) dict.push(JSON.parse(v) as string);
    else dict.push(v);
  }
  return dict;
}
