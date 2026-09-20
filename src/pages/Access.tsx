import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Ban,
  Clock,
  Download,
  FileLock2,
  Loader2,
  MailQuestion,
  ShieldCheck } from
'lucide-react';
import { toast } from 'sonner';
import { useVault } from '../contexts/VaultContext';
import { ProtectedViewer } from '../components/ProtectedViewer';
import { CanopyMark, Wordmark } from '../components/Brand';
import { Chip, Mono } from '../components/Chips';
import { ErrorNotice, Loading } from '../components/EmptyState';
import { Button } from '../components/ui/Button';
import { Textarea } from '../components/ui/Textarea';
import { Checkbox } from '../components/ui/Checkbox';
import {
  acceptTerms,
  declineTerms,
  exportReleasedCopy,
  exportSealedContainer,
  inspectToken,
  openWithToken,
  requestExtension } from
'../lib/grants';
import { readAsset } from '../lib/vault';
import { saveBlob } from '../lib/download';
import { effectiveStatus } from '../lib/policy';
import { formatBytes, formatDateTime, formatDuration } from '../lib/format';
import type { AccessDecision, Asset, Grant } from '../types';
import type { Actor } from '../lib/vault';

type Stage = 'checking' | 'terms' | 'reading' | 'open' | 'denied';

const DENY_COPY: Record<AccessDecision['reason'], {title: string;hint: string;}> = {
  ok: { title: '', hint: '' },
  not_found: {
    title: 'This link does not match anything here',
    hint: 'It may have been mistyped, or the item was withdrawn from the vault entirely.'
  },
  revoked: {
    title: 'Access was withdrawn',
    hint: 'The key for this link was destroyed, so it cannot be reopened. Ask the owner for a fresh link.'
  },
  expired: {
    title: 'The access window has closed',
    hint: 'Do not worry, the owner can easily restore your access at any time.'
  },
  exhausted: {
    title: 'You have used all the permitted openings',
    hint: 'Ask the owner to raise the limit if you still need it.'
  },
  device_bound: {
    title: 'This link belongs to another device',
    hint: 'It was locked to the first device that opened it. A new link is needed for this one.'
  },
  terms_required: { title: 'Terms must be accepted first', hint: '' },
  key_missing: {
    title: 'No key could be produced',
    hint: 'The link may have been altered in transit. Ask for it to be sent again.'
  },
  integrity: {
    title: 'The stored material failed its integrity check',
    hint: 'Canopy refuses to show a file it cannot verify.'
  }
};

export function Access() {
  const { token = '' } = useParams<{token: string;}>();
  const { people, meta, device, recordCapture, refresh, assets } = useVault();

  const [stage, setStage] = useState<Stage>('checking');
  const [grant, setGrant] = useState<Grant | null>(null);
  const [asset, setAsset] = useState<Asset | null>(null);
  const [decision, setDecision] = useState<AccessDecision | null>(null);
  const [content, setContent] = useState<{url: string;blob: Blob;integrityOk: boolean;} | null>(null);
  const [contentKey, setContentKey] = useState<CryptoKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [note, setNote] = useState('');
  const [requesting, setRequesting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const opened = useRef(false);
  const urlRef = useRef<string | null>(null);

  const recipient = useMemo(
    () => people.find((p) => p.id === grant?.recipientId) ?? null,
    [people, grant]
  );

  const actor = useMemo<Actor | null>(() => {
    if (!device) return null;
    return {
      actorId: grant?.recipientId ?? 'unknown',
      actorLabel: recipient?.name ?? 'Link holder',
      deviceId: device.id,
      deviceLabel: device.label
    };
  }, [device, grant, recipient]);

  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    []
  );

  const attemptOpen = async () => {
    if (!actor) return;
    setStage('reading');
    try {
      const result = await openWithToken(token, actor);
      setDecision(result.decision);
      if (result.grant) setGrant(result.grant);
      if (result.asset) setAsset(result.asset);
      if (!result.decision.ok || !result.asset || !result.contentKey) {
        setStage('denied');
        await refresh();
        return;
      }
      setContentKey(result.contentKey);
      const read = await readAsset(result.asset, result.contentKey);
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      const url = URL.createObjectURL(read.blob);
      urlRef.current = url;
      setContent({ url, blob: read.blob, integrityOk: read.integrityOk });
      setStage('open');
      await refresh();
    } catch (err) {
      setError((err as Error).message);
      setStage('denied');
    }
  };

  useEffect(() => {
    if (opened.current || !device) return;
    opened.current = true;
    void (async () => {
      const found = await inspectToken(token);
      if (!found.grant || !found.asset) {
        setDecision({ ok: false, reason: 'not_found', message: DENY_COPY.not_found.title });
        setStage('denied');
        return;
      }
      setGrant(found.grant);
      setAsset(found.asset);
      if (found.grant.requireTerms && found.grant.acceptedAt === null) {
        setStage('terms');
        return;
      }
      await attemptOpen();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, device]);

  const doExport = async () => {
    if (!asset || !grant || !meta || !recipient || !actor) return;
    setExporting(true);
    try {
      if (grant.mode === 'released') {
        if (!content?.blob) throw new Error('Nothing decrypted to release.');
        const result = await exportReleasedCopy(asset, content.blob, grant, meta, recipient, actor);
        saveBlob(result.blob, result.fileName);
        toast.success(
          result.watermarked ?
          'Released copy saved, watermarked with your name and the terms hash.' :
          'File saved. The system has securely logged this action in the audit trail.'
        );
      } else {
        const result = await exportSealedContainer(asset, grant, meta, recipient, actor);
        saveBlob(result.blob, result.fileName);
        toast.success('Sealed container saved. It is ciphertext and still needs this link to open.');
      }
      await refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setExporting(false);
    }
  };

  const askForMore = async () => {
    if (!grant || !actor) return;
    setRequesting(true);
    try {
      await requestExtension(grant.id, note, actor);
      toast.success('The owner has been asked. You will get a fresh window if they agree.');
      setNote('');
      await refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setRequesting(false);
    }
  };

  const status = grant ? effectiveStatus(grant) : null;

  return (
    <div className="min-h-full bg-background">
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-background/92 px-4 py-3 backdrop-blur sm:px-6">
        <Wordmark compact />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold">{asset?.name ?? 'Shared material'}</p>
          <p className="truncate text-[11.5px] text-muted-foreground">
            {meta?.labName ? `Shared by ${meta.labName}` : 'Canopy protected link'}
          </p>
        </div>
        <Link
          to="/"
          className="inline-flex shrink-0 items-center gap-1.5 text-[12.5px] text-muted-foreground hover:text-foreground">
          
          <ArrowLeft className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Your vault</span>
        </Link>
      </header>

      <main className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
        {stage === 'checking' && <Loading label="Checking this link" />}

        {stage === 'terms' && grant && asset &&
        <section className="rounded-xl border border-border bg-card">
            <div className="flex items-start gap-3 border-b border-border px-5 py-4">
              <FileLock2 className="mt-0.5 h-5 w-5 text-primary" aria-hidden />
              <div>
                <h1 className="text-[17px] font-semibold">Before you open this</h1>
                <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                  {recipient?.name ?? 'You'}, please review the access terms for{' '}
                  <span className="font-medium text-foreground">{asset.name}</span>. Accepting is
                  recorded permanently, with a hash of this exact wording.
                </p>
              </div>
            </div>
            <pre className="max-h-80 overflow-y-auto whitespace-pre-wrap px-5 py-4 font-mono text-[12px] leading-relaxed">
              {grant.terms}
            </pre>
            <div className="space-y-3 border-t border-border px-5 py-4">
              <Mono className="block text-muted-foreground">terms sha256:{grant.termsHash?.slice(0, 32)}</Mono>
              <label className="flex cursor-pointer items-start gap-2.5 text-[13px]">
                <Checkbox
                checked={accepted}
                onCheckedChange={(v) => setAccepted(Boolean(v))}
                className="mt-0.5" />
              
                I have read these terms and accept them.
              </label>
              <div className="flex flex-wrap gap-2">
                <Button
                disabled={!accepted}
                onClick={() =>
                void acceptTerms(token, actor!).
                then(async () => {
                  await refresh();
                  await attemptOpen();
                }).
                catch((e) => toast.error((e as Error).message))
                }>
                
                  Accept and open
                </Button>
                <Button
                variant="ghost"
                onClick={() =>
                void declineTerms(token, actor!).then(() => {
                  setDecision({
                    ok: false,
                    reason: 'terms_required',
                    message: 'You declined the terms, so the material stays closed.'
                  });
                  setStage('denied');
                  void refresh();
                })
                }>
                
                  Decline
                </Button>
              </div>
            </div>
          </section>
        }

        {stage === 'reading' && <Loading label="Deriving the key and verifying chunks" />}

        {stage === 'denied' &&
        <div className="space-y-4">
            <ErrorNotice
            title={
            error ?
            'Something went wrong opening this' :
            DENY_COPY[decision?.reason ?? 'not_found'].title
            }
            body={error ?? decision?.message ?? DENY_COPY[decision?.reason ?? 'not_found'].hint} />
          
            {decision && DENY_COPY[decision.reason].hint && !error &&
          <p className="text-[13px] leading-relaxed text-muted-foreground">
                {DENY_COPY[decision.reason].hint}
              </p>
          }
            {grant && ['expired', 'exhausted'].includes(decision?.reason ?? '') &&
          <section className="rounded-xl border border-border bg-card p-4">
                <h2 className="flex items-center gap-2 text-[14px] font-semibold">
                  <MailQuestion className="h-4 w-4" /> Ask for it to be reopened
                </h2>
                <p className="mt-1 text-[12.5px] text-muted-foreground">
                  This lands in the owner&apos;s queue. No email, no chasing.
                </p>
                <Textarea
              className="mt-3"
              rows={3}
              value={note}
              placeholder="Still working on the methods section, I need a couple more days."
              onChange={(e) => setNote(e.target.value)} />
            
                <Button
              className="mt-3 gap-2"
              size="sm"
              disabled={requesting || Boolean(grant.extensionRequest)}
              onClick={() => void askForMore()}>
              
                  <Clock className="h-3.5 w-3.5" />
                  {grant.extensionRequest ? 'Already asked' : requesting ? 'Sending…' : 'Request more time'}
                </Button>
              </section>
          }
            <p className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
              <CanopyMark className="h-4 w-4" />
              This refusal was written to the owner&apos;s audit ledger, with the time and this device.
            </p>
          </div>
        }

        {stage === 'open' && asset && grant &&
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Chip tone="ok">
                <ShieldCheck className="h-3 w-3" /> Access permitted
              </Chip>
              <Chip tone="muted">For {recipient?.name ?? 'you'} only</Chip>
              {status?.expiresInMs !== null && status?.expiresInMs !== undefined &&
            <Chip tone={status.expiresInMs < 3_600_000 ? 'warn' : 'muted'}>
                  Closes in {formatDuration(status.expiresInMs)}
                </Chip>
            }
              {status?.opensLeft !== null && status?.opensLeft !== undefined &&
            <Chip tone="muted">{status.opensLeft} opening(s) left</Chip>
            }
              {grant.mode === 'released' && <Chip tone="warn">Copy release permitted</Chip>}
            </div>

            <ProtectedViewer
            asset={asset}
            url={content?.url ?? null}
            blob={content?.blob ?? null}
            integrityOk={content?.integrityOk ?? false}
            loading={false}
            error={null}
            allowCopy={grant.permissions.annotate}
            identity={{
              recipientLabel: recipient?.name ?? 'Link holder',
              grantId: grant.id,
              seed: grant.watermarkSeed,
              openedAt: Date.now()
            }}
            onCapture={(kind) => void recordCapture(kind, asset.id, grant.id)}
            footer={
            <div className="flex flex-wrap items-center gap-3">
                  <p className="flex-1 text-[11.5px] leading-relaxed text-muted-foreground">
                    Your name is woven across this view. Canopy blanks it when the window loses focus and
                    logs all download attempts. However, please remember that no system can prevent someone from taking a photo of their screen.
                  </p>
                  {grant.permissions.export &&
              <Button size="sm" variant="outline" className="gap-2" disabled={exporting} onClick={() => void doExport()}>
                      {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                      {grant.mode === 'released' ? 'Save a copy' : 'Save sealed copy'}
                    </Button>
              }
                </div>
            } />
          

            <dl className="grid gap-3 rounded-xl border border-border bg-card p-4 text-[12.5px] sm:grid-cols-3">
              <div>
                <dt className="text-muted-foreground">Size</dt>
                <dd className="num mt-0.5 font-medium">{formatBytes(asset.size)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Access closes</dt>
                <dd className="num mt-0.5 font-medium">
                  {grant.expiresAt ? formatDateTime(grant.expiresAt) : 'No end date'}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Content digest</dt>
                <dd className="mt-0.5">
                  <Mono>sha256:{asset.root.slice(0, 20)}</Mono>
                </dd>
              </div>
            </dl>

            <p className="flex items-start gap-2 text-[11.5px] leading-relaxed text-muted-foreground">
              <Ban className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              If the owner revokes this link, the key wrapped for it is destroyed and this page will
              block access next time. Any files you already saved will remain on your device.
              why release is a deliberate choice, not a default.
            </p>
          </div>
        }
      </main>
    </div>);

}
