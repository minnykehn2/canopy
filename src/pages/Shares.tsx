import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Ban, CalendarClock, Inbox, Send } from 'lucide-react';
import { toast } from 'sonner';
import { useVault } from '../contexts/VaultContext';
import { PageHeader, StatStrip } from '../components/AppShell';
import { Chip, GrantStatusChip, Mono } from '../components/Chips';
import { EmptyState } from '../components/EmptyState';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Button } from '../components/ui/Button';
import { Checkbox } from '../components/ui/Checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/Select';
import { effectiveStatus } from '../lib/policy';
import { formatDateTime, formatDuration, relativeTime } from '../lib/format';
import type { GrantStatus } from '../types';

export function Shares() {
  const { grants, people, assets, revoke, revokeBatch, extend } = useVault();
  const [filter, setFilter] = useState<'live' | 'closed' | 'all'>('live');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [revokeTarget, setRevokeTarget] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);

  const rows = useMemo(
    () =>
    grants.
    map((grant) => ({
      grant,
      status: effectiveStatus(grant).status,
      person: people.find((p) => p.id === grant.recipientId),
      asset: assets.find((a) => a.id === grant.assetId)
    })).
    filter(({ status }) =>
    filter === 'all' ? true : filter === 'live' ? status === 'active' : status !== 'active'
    ),
    [grants, people, assets, filter]
  );

  const requests = grants.filter((g) => g.extensionRequest && g.status !== 'revoked');
  const live = grants.filter((g) => effectiveStatus(g).status === 'active');
  const external = live.filter((g) => {
    const person = people.find((p) => p.id === g.recipientId);
    return person && !person.internal;
  });

  const toggle = (id: string) =>
  setSelected((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);else
    next.add(id);
    return next;
  });

  const selectableIds = rows.filter((r) => r.status === 'active').map((r) => r.grant.id);
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));

  return (
    <div>
      <PageHeader
        title="Shared access"
        subtitle="Every link ever issued, who holds it, and what it still permits. Closing one never affects the others."
        actions={
        selected.size > 0 ?
        <Button variant="destructive" className="gap-2" onClick={() => setBulkOpen(true)}>
              <Ban className="h-4 w-4" /> Revoke {selected.size} selected
            </Button> :
        undefined
        } />
      

      <StatStrip
        items={[
        { label: 'Live links', value: String(live.length) },
        { label: 'Outside the institution', value: String(external.length), tone: external.length ? 'warn' : undefined },
        { label: 'Closed or revoked', value: String(grants.length - live.length) },
        { label: 'Extension requests', value: String(requests.length), tone: requests.length ? 'warn' : undefined }]
        } />
      

      {requests.length > 0 &&
      <section className="border-b border-border bg-info/6 px-4 py-4 sm:px-6">
          <h2 className="flex items-center gap-2 text-[13px] font-semibold text-info">
            <Inbox className="h-4 w-4" /> Waiting on you
          </h2>
          <ul className="mt-3 space-y-2">
            {requests.map((grant) => {
            const person = people.find((p) => p.id === grant.recipientId);
            const asset = assets.find((a) => a.id === grant.assetId);
            return (
              <li
                key={grant.id}
                className="flex flex-col gap-2 rounded-lg border border-info/30 bg-card px-3.5 py-3 sm:flex-row sm:items-center">
                
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px]">
                      <span className="font-medium">{person?.name ?? 'Someone'}</span> wants more time with{' '}
                      <span className="font-medium">{asset?.name ?? 'an item'}</span>
                    </p>
                    {grant.extensionRequest?.note &&
                  <p className="mt-0.5 text-[12px] italic text-muted-foreground">
                        “{grant.extensionRequest.note}”
                      </p>
                  }
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                    size="sm"
                    onClick={() =>
                    void extend(grant.id, 168).
                    then(() => toast.success('Reopened for 7 days.')).
                    catch((e) => toast.error((e as Error).message))
                    }>
                    
                      Give 7 days
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setRevokeTarget(grant.id)}>
                      Decline & close
                    </Button>
                  </div>
                </li>);

          })}
          </ul>
        </section>
      }

      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 sm:px-6">
        {selectableIds.length > 0 &&
        <label className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
            <Checkbox
            checked={allSelected}
            onCheckedChange={(checked) =>
            setSelected(checked ? new Set(selectableIds) : new Set())
            }
            aria-label="Select all live links" />
          
            Select all live
          </label>
        }
        <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
          <SelectTrigger className="ml-auto w-auto min-w-[9rem]" aria-label="Filter links">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="live">Live only</SelectItem>
            <SelectItem value="closed">Closed & revoked</SelectItem>
            <SelectItem value="all">Everything</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {rows.length ?
      <ul className="divide-y divide-border">
          {rows.map(({ grant, status, person, asset }) => {
          const { expiresInMs, opensLeft } = effectiveStatus(grant);
          return (
            <li key={grant.id} className="flex gap-3 px-4 py-3.5 sm:px-6">
                {status === 'active' ?
              <Checkbox
                className="mt-1"
                checked={selected.has(grant.id)}
                onCheckedChange={() => toggle(grant.id)}
                aria-label={`Select link for ${person?.name ?? 'recipient'}`} /> :


              <span className="w-4" />
              }
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <GrantStatusChip value={status as GrantStatus} />
                    <span className="text-[13.5px] font-medium">{person?.name ?? 'Unknown recipient'}</span>
                    {person && !person.internal && <Chip tone="warn">External</Chip>}
                    {grant.mode === 'released' && <Chip tone="warn">Copy released</Chip>}
                    {grant.permissions.export && grant.mode === 'protected' &&
                  <Chip tone="muted">Sealed copy allowed</Chip>
                  }
                  </div>
                  <p className="mt-1 truncate text-[12.5px] text-muted-foreground">
                    {asset ?
                  <Link to={`/item/${asset.id}`} className="hover:text-foreground hover:underline">
                        {asset.name}
                      </Link> :

                  'Item withdrawn'
                  }
                    {' · '}
                    {person?.email}
                  </p>
                  <p className="num mt-1 text-[11.5px] text-muted-foreground">
                    {grant.opens} opening{grant.opens === 1 ? '' : 's'}
                    {opensLeft !== null && ` · ${opensLeft} left`}
                    {' · '}
                    {status === 'active' ?
                  grant.expiresAt ?
                  `closes in ${formatDuration(expiresInMs ?? 0)}` :
                  'no end date' :
                  status === 'revoked' ?
                  `revoked ${relativeTime(grant.revokedAt ?? grant.createdAt)}` :
                  `ended ${grant.expiresAt ? formatDateTime(grant.expiresAt) : ''}`}
                  </p>
                  {grant.revokedReason &&
                <p className="mt-1 text-[11.5px] text-destructive">{grant.revokedReason}</p>
                }
                  <Mono className="mt-1 block truncate text-[10px] text-muted-foreground/70">{grant.id}</Mono>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-center">
                  {status !== 'revoked' &&
                <>
                      <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={() =>
                    void extend(grant.id, 168).
                    then(() => toast.success('Reopened for 7 days.')).
                    catch((e) => toast.error((e as Error).message))
                    }>
                    
                        <CalendarClock className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">+7d</span>
                      </Button>
                      <Button
                    size="sm"
                    variant="ghost"
                    className="gap-1.5 text-destructive"
                    onClick={() => setRevokeTarget(grant.id)}>
                    
                        <Ban className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Revoke</span>
                      </Button>
                    </>
                }
                </div>
              </li>);

        })}
        </ul> :

      <div className="p-4 sm:p-6">
          <EmptyState
          icon={<Send className="h-7 w-7" />}
          title={filter === 'live' ? 'No live access right now' : 'Nothing here'}
          body={
          filter === 'live' ?
          'Nobody outside this device can open anything. Share an item from the library when you need to.' :
          'No closed or revoked links yet.'
          } />
        
        </div>
      }

      <ConfirmDialog
        open={Boolean(revokeTarget)}
        onOpenChange={(open) => !open && setRevokeTarget(null)}
        title="Revoke this access"
        description="The key wrapped for this link is destroyed. It stops working everywhere, immediately, and cannot be restored."
        confirmLabel="Revoke"
        destructive
        requireReason
        reasonLabel="Reason (recorded permanently)"
        onConfirm={async (reason) => {
          if (!revokeTarget) return;
          await revoke(revokeTarget, reason);
          setRevokeTarget(null);
          toast.success('Access revoked.');
        }} />
      

      <ConfirmDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        title={`Revoke ${selected.size} link(s)`}
        description="Each wrapped key is destroyed individually. Recipients will see a clear refusal, not a broken page."
        confirmLabel="Revoke all selected"
        destructive
        requireReason
        reasonLabel="Reason (applied to all)"
        onConfirm={async (reason) => {
          const count = await revokeBatch([...selected], reason);
          setSelected(new Set());
          toast.success(`${count} link(s) revoked.`);
        }} />
      
    </div>);

}