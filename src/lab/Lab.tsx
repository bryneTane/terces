// Device lab page (internal, English only). Shows which metadata survives each picker source.
import exifr from 'exifr';
import { useState, type ChangeEvent } from 'react';
import { summarize, type LabGroup, type LabSummary } from './summarize.ts';

const ORDER: LabGroup[] = ['gps', 'date', 'device', 'identity', 'other'];

interface Report {
  source: string;
  file: { name: string; type: string; size: number };
  decoded: string;
  summary: LabSummary;
  json: string;
}

/** Reads a picked file the way the app does: exifr for metadata, upright decode for the size. */
export async function inspect(file: File, source: string): Promise<{ report: Report; error?: string }> {
  let parsed: Record<string, unknown> | undefined;
  let error: string | undefined;
  try {
    parsed = await exifr.parse(file, {
      tiff: true,
      exif: true,
      gps: true,
      xmp: true,
      iptc: true,
      icc: true,
      makerNote: false,
      userComment: true,
    });
  } catch (e) {
    error = `Metadata read failed: ${(e as Error).message}`;
  }
  let decoded: string;
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    decoded = `${bmp.width}x${bmp.height}`;
    bmp.close();
  } catch (e) {
    decoded = `decode failed: ${(e as Error).message}`;
  }
  const summary = summarize(parsed);
  const fileInfo = { name: file.name, type: file.type, size: file.size };
  const json = JSON.stringify(
    {
      source,
      userAgent: navigator.userAgent,
      file: fileInfo,
      decoded,
      hasGps: summary.hasGps,
      fieldCount: summary.fieldCount,
      groups: summary.groups,
    },
    null,
    2,
  );
  return { report: { source, file: fileInfo, decoded, summary, json }, error };
}

export function Lab() {
  const [status, setStatus] = useState('');
  const [report, setReport] = useState<Report | null>(null);
  const [showJson, setShowJson] = useState(false);

  const pick = (source: string) => async (ev: ChangeEvent<HTMLInputElement>) => {
    const input = ev.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    setStatus('Reading...');
    setReport(null);
    setShowJson(false);
    const { report: r, error } = await inspect(file, source);
    setReport(r);
    setStatus(error ?? `${r.summary.fieldCount} fields, GPS ${r.summary.hasGps ? 'PRESENT' : 'absent'}`);
  };

  const copy = async () => {
    if (!report) return;
    try {
      await navigator.clipboard.writeText(report.json);
      setStatus('Copied.');
    } catch {
      setStatus('Copy failed. Long-press the JSON below instead.');
      setShowJson(true);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 font-mono text-sm">
      <h1 className="text-lg text-accent">TERCES LAB: metadata survival</h1>
      <p className="text-muted">
        Pick the same photo from each source (Photos, Files, Camera). Nothing leaves this page.
      </p>
      <div className="flex flex-wrap gap-3">
        <label className="border border-line px-3 py-2">
          Library / Files{' '}
          <input
            id="pick"
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={pick('library/files')}
          />
        </label>
        <label className="border border-line px-3 py-2">
          Camera{' '}
          <input
            id="cam"
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={pick('camera')}
          />
        </label>
      </div>
      <div id="status" className="text-muted" aria-live="polite">
        {status}
      </div>
      <section id="out">
        {report && (
          <>
            <table className="w-full border-collapse">
              <tbody>
                <tr>
                  <td className="pr-3 text-muted">source</td>
                  <td>{report.source}</td>
                </tr>
                <tr>
                  <td className="pr-3 text-muted">file</td>
                  <td>
                    {report.file.name} | {report.file.type || '?'} | {report.file.size} B
                  </td>
                </tr>
                <tr>
                  <td className="pr-3 text-muted">decoded</td>
                  <td>{report.decoded}</td>
                </tr>
              </tbody>
            </table>
            {ORDER.map((g) => (
              <div key={g}>
                <h2 className="mt-4 text-accent uppercase">
                  {g} ({report.summary.groups[g].length})
                </h2>
                <table className="w-full border-collapse">
                  <tbody>
                    {report.summary.groups[g].map((f) => (
                      <tr key={f.key} className="border-t border-line">
                        <td className="pr-3 align-top text-muted">{f.key}</td>
                        <td className="break-all">{f.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
            <button type="button" onClick={copy} className="mt-4 border border-accent px-3 py-2 text-accent">
              Copy as JSON
            </button>
            {showJson && <pre className="mt-2 whitespace-pre-wrap">{report.json}</pre>}
          </>
        )}
      </section>
    </div>
  );
}
