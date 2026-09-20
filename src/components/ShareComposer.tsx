import React, { useEffect, useMemo, useState } from 'react';
import { Check, Copy, Link2, Plus, Search, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { useVault } from '../contexts/VaultContext';
import { DEFAULT_TERMS, ttlOptions } from '../lib/policy';
import { copyText } from '../lib/download';
import { emailDomain, formatDateTime, initials, isValidEmail } from '../lib/format';
import { cn } from '../lib/cn';
import { Chip, Mono } from './Chips';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle } from
'./ui/Dialog';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Label } from './ui/Label';
import { Textarea } from './ui/Textarea';
import { Switch } from './ui/CSwitch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/Select';
import type { Asset, GrantMode, Person, PersonRole } from '../types';

interface Props {
  asset: Asset;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ROLES: {value: PersonRole;label: string;}[] = [
{ value: 'postgrad', label: 'Postgraduate' },
{ value: 'assistant', label: 'Research assistant' },
{ value: 'collaborator', label: 'Academic collaborator' },
{ value: 'external', label: 'External / industry' },
{ value: 'pi', label: 'Principal investigator' }];


export function ShareComposer({ asset, open, onOpenChange }: Props) {
  const { people, meta, issueGrant, addPerson } = useVault();
  const [query, setQuery] = useState('');
  const [recipientId, setRecipientId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ name: '', email: '', affiliation: '', role: 'collaborator' as PersonRole });

  const [mode, setMode] = useState<GrantMode>('protected');
  const [annotate, setAnnotate] = useState(false);
  const [allowExport, setAllowExport] = useState(false);
  const [ttlHours, setTtlHours] = useState<number | null>(meta?.defaultGrantTtlHours ?? 168);
  const [limitOpens, setLimitOpens] = useState(false);
  const [maxOpens, setMaxOpens] = useState('5');
  const [bindDevice, setBindDevice] = useState(false);
  const [requireTerms, setRequireTerms] = useState(false);
  const [terms, setTerms] = useState(DEFAULT_TERMS);

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<{link: string;expiresAt: number | null;recipient: string;} | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setRecipientId(null);
    setCreating(false);
    setDraft({ name: '', email: '', affiliation: '', role: 'collaborator' });
    setMode('protected');
    setAnnotate(false);
    setAllowExport(false);
    setTtlHours(meta?.defaultGrantTtlHours ?? 168);
    setLimitOpens(false);
    setMaxOpens('5');
    setBindDevice(false);
    setRequireTerms(false);
    setTerms(DEFAULT_TERMS);
    setError(null);
    setIssued(null);
    setCopied(false);
    setPending(false);
  }, [open, meta]);

  useEffect(() => {
    if (mode === 'released') {
      setAllowExport(true);
      setRequireTerms(true);
    }
  }, [mode]);

  const candidates = useMemo(() => {
    const term = query.trim().toLowerCase();
    return people.
    filter((p) => p.id !== meta?.ownerPersonId && p.status !== 'offboarded').
    filter((p) => !term || p.name.toLowerCase().includes(term) || p.email.includes(term)).
    slice(0, 8);
  }, [people, query, meta]);

  const recipient = people.find((p) => p.id === recipientId) ?? null;
  const outside = recipient && meta?.orgDomain ? emailDomain(recipient.email) !== meta.orgDomain : false;

  const createRecipient = async () => {
    if (!draft.name.trim()) return setError('Give the collaborator a name.');
    if (!isValidEmail(draft.email)) return setError('That email address does not look valid.');
    setPending(true);
    setError(null);
    try {
      const person: Person = await addPerson({
        name: draft.name,
        email: draft.email,
        affiliation: draft.affiliation,
        role: draft.role,
        departureAt: null
      });
      setRecipientId(person.id);
      setCreating(false);
      toast.success(`${person.name} added to the collaborator list.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  };

  const submit = async () => {
    if (!recipient) return setError('Choose who this link is for. Links are always per person.');
    setPending(true);
    setError(null);
    try {
      const result = await issueGrant({
        asset,
        recipient,
        mode,
        permissions: { view: true, annotate, export: allowExport },
        ttlHours,
        maxOpens: limitOpens ? Number(maxOpens) : null,
        requireTerms,
        terms,
        bindDevice,
        label: asset.name
      });
      setIssued({
        link: result.link,
        expiresAt: result.grant.expiresAt,
        recipient: recipient.name
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  };

  const copy = async () => {
    if (!issued) return;
    const ok = await copyText(issued.link);
    setCopied(ok);
    toast[ok ? 'success' : 'error'](
      ok ? 'Link copied. It is shown once, so paste it somewhere safe now.' : 'Could not reach the clipboard. Select the link and copy it manually.'
    );
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="squircle-element max-h-[92vh] gap-0 overflow-hidden border-border/60 bg-background/95 p-0 shadow-2xl backdrop-blur-xl sm:max-w-2xl">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle className="text-[16px] font-semibold tracking-tight">
            {issued ? 'Link issued' : 'Share this item'}
          </DialogTitle>
          <DialogDescription className="mt-1 font-mono text-[11px] truncate text-muted-foreground/60">{asset.name}</DialogDescription>
        </DialogHeader>

        {issued ?
        <div className="space-y-4 overflow-y-auto px-6 py-6">
            <div className="rounded-lg border border-ok/35 bg-ok/8 px-4 py-3">
              <p className="text-[13px] font-medium text-ok">
                One link, for {issued.recipient} only.
              </p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-foreground/80">
                The token is generated on this device and never stored. Canopy keeps only its hash,
                so this is the one and only time you will see it. If it is lost, revoke and reissue.
              </p>
            </div>
            <div className="flex items-stretch gap-2">
              <code className="min-w-0 flex-1 overflow-x-auto rounded-md border border-border bg-muted px-3 py-2.5 font-mono text-[11.5px] leading-relaxed">
                {issued.link}
              </code>
              <Button onClick={() => void copy()} className="shrink-0 gap-2">
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
            <ul className="space-y-1.5 text-[12.5px] text-muted-foreground">
              <li>
                Expires:{' '}
                <span className="text-foreground">
                  {issued.expiresAt ? formatDateTime(issued.expiresAt) : 'Never. Close it manually when done.'}
                </span>
              </li>
              <li>Safe to paste into a group chat: the link only opens for the person it names.</li>
              <li>Every opening, refusal and capture attempt lands in your ledger.</li>
            </ul>
            <DialogFooter className="px-0">
              <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-[12.5px]">
                Done
              </Button>
            </DialogFooter>
          </div> :

        <>
            <div className="max-h-[62vh] space-y-6 overflow-y-auto px-6 py-6">
              {/* -------------------------------------------------- recipient */}
              <section className="space-y-4">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Who is this for?</Label>
                {recipient ?
              <div className="flex items-center gap-4 rounded-[0.75rem] border border-border/60 bg-muted/30 px-4 py-3 shadow-sm transition-elegant">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/12 font-mono text-[11px] font-semibold text-primary">
                      {initials(recipient.name)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium">{recipient.name}</p>
                      <p className="truncate font-mono text-[11px] text-muted-foreground">{recipient.email}</p>
                    </div>
                    {outside && <Chip tone="warn">Outside {meta?.orgDomain}</Chip>}
                    <Button variant="ghost" size="xs" onClick={() => setRecipientId(null)}>
                      Change
                    </Button>
                  </div> :
              creating ?
              <div className="space-y-3 rounded-[0.75rem] border border-border/60 bg-background/50 p-4 shadow-sm">
                    <div className="space-y-3">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Input
                      placeholder="Full name"
                      value={draft.name}
                      onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                      aria-label="Collaborator name" />
                    
                        <Input
                      placeholder="email@institution"
                      value={draft.email}
                      onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                      aria-label="Collaborator email" />
                      </div>
                    
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Input
                      placeholder="Department or institution"
                      value={draft.affiliation}
                      onChange={(e) => setDraft({ ...draft, affiliation: e.target.value })}
                      aria-label="Affiliation" />
                    
                        <Select value={draft.role} onValueChange={(v) => setDraft({ ...draft, role: v as PersonRole })}>
                          <SelectTrigger aria-label="Role">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ROLES.map((r) =>
                        <SelectItem key={r.value} value={r.value}>
                                {r.label}
                              </SelectItem>
                        )}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => void createRecipient()} disabled={pending}>
                        Add collaborator
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setCreating(false)}>
                        Cancel
                      </Button>
                    </div>
                  </div> :

              <div className="space-y-2">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                      <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search collaborators"
                    className="pl-8"
                    aria-label="Search collaborators" />
                  
                    </div>
                    <ul className="max-h-44 space-y-1 overflow-y-auto pr-1">
                      {candidates.map((person) =>
                  <li key={person.id}>
                          <button
                      type="button"
                      onClick={() => setRecipientId(person.id)}
                      className="flex w-full items-center gap-3 rounded-[0.6rem] px-3 py-2.5 text-left transition-elegant hover:bg-accent/40 active-scale">
                      
                            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted font-mono text-[10.5px] font-semibold">
                              {initials(person.name)}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[13px]">{person.name}</span>
                              <span className="block truncate font-mono text-[10.5px] text-muted-foreground">
                                {person.email}
                              </span>
                            </span>
                            {person.status === 'departing' && <Chip tone="warn">Leaving</Chip>}
                          </button>
                        </li>
                  )}
                      {!candidates.length &&
                  <li className="px-2.5 py-3 text-[12.5px] text-muted-foreground">
                          Nobody matches "{query}".
                        </li>
                  }
                    </ul>
                    <Button variant="outline" size="sm" className="gap-2" onClick={() => setCreating(true)}>
                      <Plus className="h-3.5 w-3.5" /> New collaborator
                    </Button>
                  </div>
              }
              </section>

              {/* ------------------------------------------------------- mode */}
              <section className="space-y-4 pt-2">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">How much are you giving away?</Label>
                <div className="grid gap-3 sm:grid-cols-2">
                  {(
                [
                {
                  value: 'protected' as GrantMode,
                  title: 'Keep it inside Canopy',
                  body: 'Readable only in the protected viewer, watermarked with their name. Nothing lands in their file system.'
                },
                {
                  value: 'released' as GrantMode,
                  title: 'Let them take a copy',
                  body: 'A real copy leaves, under terms they must accept first. Use this when the work genuinely has to travel.'
                }] as
                const).
                map((option) =>
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setMode(option.value)}
                  aria-pressed={mode === option.value}
                  className={cn(
                    'rounded-[0.75rem] border px-4 py-3.5 text-left transition-elegant active-scale hover:shadow-sm',
                    mode === option.value ?
                    'border-primary bg-primary/10 shadow-[inset_0_0_0_1px_var(--primary)]' :
                    'border-border/40 bg-muted/10 hover:border-border/60 hover:bg-muted/30'
                  )}>
                  
                      <span className="block text-[12.5px] font-semibold">{option.title}</span>
                      <span className="mt-1.5 block text-[11px] leading-relaxed text-muted-foreground/80">
                        {option.body}
                      </span>
                    </button>
                )}
                </div>
                {mode === 'released' &&
              <p className="flex items-start gap-2.5 rounded-lg border border-warn/20 bg-warn/5 px-4 py-3 text-[11.5px] leading-relaxed text-warn/90">
                    <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      Once a copy is out, Canopy can no longer stop it being opened elsewhere. What you keep is
                      the accepted terms, the watermark and the ledger entry.
                    </span>
                  </p>
              }
              </section>

              {/* ------------------------------------------------ constraints */}
              <section className="space-y-6 pt-2">
                <div className="space-y-3">
                  <Label htmlFor="ttl" className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Access closes after</Label>
                  <Select
                  value={String(ttlHours)}
                  onValueChange={(v) => setTtlHours(v === 'null' ? null : Number(v))}>
                  
                    <SelectTrigger id="ttl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ttlOptions().map((option) =>
                    <SelectItem key={option.label} value={String(option.hours)}>
                          {option.label}
                        </SelectItem>
                    )}
                    </SelectContent>
                  </Select>
                  {ttlHours === null &&
                <p className="text-[11.5px] text-warn">
                      Links without an end date are the main reason old access never gets removed.
                    </p>
                }
                </div>
                <div className="space-y-3">
                  <Label htmlFor="opens" className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Opening limit</Label>
                  <div className="flex items-center gap-3">
                    <Switch id="opens" checked={limitOpens} onCheckedChange={setLimitOpens} />
                    <Input
                    value={maxOpens}
                    onChange={(e) => setMaxOpens(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    disabled={!limitOpens}
                    className="w-24"
                    inputMode="numeric"
                    aria-label="Maximum openings" />
                  
                    <span className="text-[12px] text-muted-foreground">openings</span>
                  </div>
                </div>
              </section>

              <section className="space-y-4 rounded-[0.75rem] border border-border/40 bg-muted/10 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <Label htmlFor="annotate" className="text-[12px] font-medium text-foreground/80">Allow comments</Label>
                    <p className="mt-0.5 text-[11px] text-muted-foreground/60">
                      Their notes stay in the vault, attached to the item.
                    </p>
                  </div>
                  <Switch id="annotate" checked={annotate} onCheckedChange={setAnnotate} />
                </div>
                <div className="flex items-start justify-between gap-4 border-t border-border/40 pt-4">
                  <div>
                    <Label htmlFor="export" className="text-[12px] font-medium text-foreground/80">Allow a copy to be taken</Label>
                    <p className="mt-0.5 text-[11px] text-muted-foreground/60">
                      {mode === 'protected' ?
                    'Produces a sealed .canopy container that still needs this link to open.' :
                    'Produces a plain, watermarked copy.'}
                    </p>
                  </div>
                  <Switch
                  id="export"
                  checked={allowExport}
                  disabled={mode === 'released'}
                  onCheckedChange={setAllowExport} />
                
                </div>
                <div className="flex items-start justify-between gap-4 border-t border-border/40 pt-4">
                  <div>
                    <Label htmlFor="bind" className="text-[12px] font-medium text-foreground/80">Lock to the first device that opens it</Label>
                    <p className="mt-0.5 text-[11px] text-muted-foreground/60">
                      Stops a forwarded link working elsewhere. Annoying if they switch phones, as they will
                      need a fresh link.
                    </p>
                  </div>
                  <Switch id="bind" checked={bindDevice} onCheckedChange={setBindDevice} />
                </div>
                <div className="flex items-start justify-between gap-4 border-t border-border/40 pt-4">
                  <div>
                    <Label htmlFor="terms-on" className="text-[12px] font-medium text-foreground/80">Require accepted terms</Label>
                    <p className="mt-0.5 text-[11px] text-muted-foreground/60">
                      Recorded permanently with a hash of the exact wording they agreed to.
                    </p>
                  </div>
                  <Switch
                  id="terms-on"
                  checked={requireTerms}
                  disabled={mode === 'released'}
                  onCheckedChange={setRequireTerms} />
                
                </div>
                {requireTerms &&
              <Textarea
                value={terms}
                onChange={(e) => setTerms(e.target.value)}
                rows={7}
                className="font-mono text-[11.5px] leading-relaxed"
                aria-label="Sharing terms" />

              }
              </section>

              {error &&
            <p role="alert" className="text-[13px] text-destructive">
                  {error}
                </p>
            }
            </div>

            <DialogFooter className="border-t border-border/40 px-6 py-4">
              <span className="mr-auto hidden items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40 sm:flex">
                <Link2 className="h-3.5 w-3.5" />
                <span>one token · per person · revocable</span>
              </span>
              <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending} className="text-[12.5px] text-muted-foreground hover:text-foreground">
                Cancel
              </Button>
              <Button onClick={() => void submit()} disabled={pending || !recipient} className="text-[12.5px]">
                {pending ? 'Issuing…' : 'Issue link'}
              </Button>
            </DialogFooter>
          </>
        }
      </DialogContent>
    </Dialog>);

}