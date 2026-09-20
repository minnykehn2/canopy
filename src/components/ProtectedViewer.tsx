import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, EyeOff, FileWarning, ShieldAlert } from 'lucide-react';
import { useCaptureGuard } from '../hooks/useCaptureGuard';
import { watermarkLines } from '../lib/watermark';
import type { WatermarkIdentity } from '../lib/watermark';
import { Chip } from './Chips';
import { Loading } from './EmptyState';
import { cn } from '../lib/cn';
import { formatBytes } from '../lib/format';
import type { Asset } from '../types';

const TEXT_LIMIT = 240_000;

function Watermark({ identity }: {identity: WatermarkIdentity;}) {
  const lines = watermarkLines(identity);
  const tiles = Array.from({ length: 36 });
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-20 overflow-hidden opacity-[0.16] mix-blend-difference">
      
      <div className="absolute left-1/2 top-1/2 flex w-[200%] -translate-x-1/2 -translate-y-1/2 -rotate-[26deg] flex-wrap gap-x-14 gap-y-12">
        {tiles.map((_, i) =>
        <span key={i} className="whitespace-nowrap font-mono text-[10.5px] leading-tight text-foreground">
            {lines.join(' · ')}
          </span>
        )}
      </div>
    </div>);

}

function CsvTable({ text }: {text: string;}) {
  const rows = useMemo(() => {
    const lines = text.split(/\r?\n/).filter(Boolean).slice(0, 400);
    return lines.map((line) => line.split(','));
  }, [text]);
  const [head, ...body] = rows;
  if (!head) return <p className="p-6 text-sm text-muted-foreground">This dataset is empty.</p>;
  return (
    <div className="overflow-auto">
      <table className="w-full border-collapse text-[12px]">
        <thead className="sticky top-0 bg-muted">
          <tr>
            {head.map((cell, i) =>
            <th key={i} className="whitespace-nowrap border-b border-border px-3 py-2 text-left font-semibold">
                {cell}
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {body.map((row, r) =>
          <tr key={r} className="odd:bg-muted/40">
              {row.map((cell, c) =>
            <td key={c} className="num whitespace-nowrap border-b border-border/60 px-3 py-1.5">
                  {cell}
                </td>
            )}
            </tr>
          )}
        </tbody>
      </table>
      {text.split(/\r?\n/).length > 400 &&
      <p className="border-t border-border px-3 py-2 text-[11.5px] text-muted-foreground">
          Showing the first 400 rows. The full dataset stays sealed in the vault.
        </p>
      }
    </div>);

}

export interface ProtectedViewerProps {
  asset: Asset;
  url: string | null;
  blob: Blob | null;
  integrityOk: boolean;
  loading: boolean;
  error: string | null;
  identity: WatermarkIdentity;
  allowCopy: boolean;
  onCapture: (kind: string) => void;
  footer?: React.ReactNode;
}

/**
 * The only surface on which sealed material is ever rendered. Content is
 * decrypted into an in-memory blob URL, never written to disk by the app, and
 * blanked whenever the window loses focus.
 */
export function ProtectedViewer({
  asset,
  url,
  blob,
  integrityOk,
  loading,
  error,
  identity,
  allowCopy,
  onCapture,
  footer
}: ProtectedViewerProps) {
  const { obscured, attempts } = useCaptureGuard({
    enabled: Boolean(url) && !loading,
    allowCopy,
    onAttempt: (kind) => onCapture(kind)
  });
  const [text, setText] = useState<string | null>(null);
  const [textTruncated, setTextTruncated] = useState(false);

  const textual =
  /^(text\/|application\/(json|xml|csv|x-ndjson))/.test(asset.mime) ||
  /\.(txt|md|csv|json|tsv|log)$/i.test(asset.name);

  useEffect(() => {
    let alive = true;
    if (!blob || !textual) {
      setText(null);
      return;
    }
    void blob.text().then((value) => {
      if (!alive) return;
      setTextTruncated(value.length > TEXT_LIMIT);
      setText(value.slice(0, TEXT_LIMIT));
    });
    return () => {
      alive = false;
    };
  }, [blob, textual]);

  const isCsv = /\.(csv|tsv)$/i.test(asset.name) || asset.mime === 'text/csv';
  const isPdf = asset.mime === 'application/pdf' || /\.pdf$/i.test(asset.name);
  const isImage = asset.mime.startsWith('image/');

  return (
    <section
      data-protected="true"
      className="capture-guard relative isolate overflow-hidden rounded-xl border border-border bg-card"
      aria-label={`Protected viewer: ${asset.name}`}>
      
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/50 px-3.5 py-2.5">
        <Chip tone="seal">Protected viewer</Chip>
        <span className="num text-[11.5px] text-muted-foreground">
          {formatBytes(asset.size)} · sha256:{asset.root.slice(0, 12)}
        </span>
        {!integrityOk && !loading &&
        <Chip tone="danger">
            <ShieldAlert className="h-3 w-3" /> Integrity failed
          </Chip>
        }
        {attempts > 0 &&
        <Chip tone="warn">
            <AlertTriangle className="h-3 w-3" /> {attempts} capture attempt(s) logged
          </Chip>
        }
      </div>

      <div className="relative min-h-[320px]">
        {loading &&
        <div className="px-4">
            <Loading label="Decrypting and verifying chunks" />
          </div>
        }

        {!loading && error &&
        <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <FileWarning className="h-7 w-7 text-destructive" aria-hidden />
            <p className="text-sm font-semibold text-destructive">{error}</p>
          </div>
        }

        {!loading && !error && !integrityOk &&
        <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <ShieldAlert className="h-7 w-7 text-destructive" aria-hidden />
            <p className="max-w-md text-sm leading-relaxed">
              The stored ciphertext no longer matches its recorded digest, so Canopy will not show
              this item. Refusing is the correct behaviour. A silently repaired file is worse than
              no file. This has been written to the ledger.
            </p>
          </div>
        }

        {!loading && !error && integrityOk && url &&
        <div className={cn('relative', obscured && 'guard-obscured')}>
            <Watermark identity={identity} />
            {isImage &&
          <div className="flex max-h-[68vh] items-center justify-center overflow-auto bg-muted/60 p-4">
                <img
              src={url}
              alt={asset.name}
              draggable={false}
              className="max-h-[60vh] w-auto select-none rounded" />
            
              </div>
          }
            {isPdf &&
          <object data={url} type="application/pdf" className="h-[68vh] w-full" aria-label={asset.name}>
                <p className="p-6 text-sm text-muted-foreground">
                  This device has no inline PDF renderer. The document stays sealed rather than being
                  handed to an external application.
                </p>
              </object>
          }
            {!isImage && !isPdf && textual && isCsv && text !== null &&
          <div className="max-h-[68vh] overflow-auto">
                <CsvTable text={text} />
              </div>
          }
            {!isImage && !isPdf && textual && !isCsv && text !== null &&
          <pre className="max-h-[68vh] overflow-auto whitespace-pre-wrap break-words px-5 py-4 font-mono text-[12.5px] leading-relaxed">
                {text}
                {textTruncated &&
            <span className="mt-4 block text-muted-foreground">
                    … truncated for display. The complete file remains sealed and intact.
                  </span>
            }
              </pre>
          }
            {!isImage && !isPdf && !textual &&
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
                <EyeOff className="h-7 w-7 text-muted-foreground" aria-hidden />
                <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
                  Canopy has no safe in-app renderer for <span className="font-mono">{asset.mime || 'this format'}</span>.
                  Rather than hand it to an outside application, it stays sealed. Ask the owner for a
                  release grant if you genuinely need a copy.
                </p>
              </div>
          }

            {obscured &&
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-2 bg-background/70 text-center backdrop-blur-sm">
                <EyeOff className="h-6 w-6 text-muted-foreground" aria-hidden />
                <p className="text-sm font-medium">Hidden while this window is not in focus</p>
                <p className="max-w-xs text-[12px] text-muted-foreground">
                  Click back into the window to continue reading.
                </p>
              </div>
          }
          </div>
        }
      </div>

      {footer && <div className="border-t border-border px-3.5 py-3">{footer}</div>}
    </section>);

}