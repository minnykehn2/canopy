import React from 'react';
import { Check, X } from 'lucide-react';

const ENFORCED = [
'Files are encrypted locally before saving to storage.',
'Revoking a link destroys the encryption key, making the file unreadable.',
'Links are unique to one person. Sharing a link makes that person responsible for any access.',
'Limits and expiry are strictly checked before access is granted.',
'The viewer blocks screenshots, printing, and unauthorized copying where possible.',
'All access, sharing, and capture attempts are permanently recorded in the audit log.',
'Storage tampering is detected automatically.',
'Removing a person immediately revokes all their active links.'];

const NOT_ENFORCED = [
'Physical cameras pointing at the screen cannot be blocked.',
'OS-level screen recording or virtual machines may bypass protections.',
'Once a file is downloaded or exported, it cannot be recalled.',
'If someone stays completely offline, they may bypass revocation until they reconnect.',
'Compromised or malware-infected devices cannot guarantee security.',
'Clearing browser data will reset your device identity.'];


export function HonestyPanel() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-xl border border-ok/30 bg-ok/6 p-4">
        <h3 className="text-[14px] font-semibold text-ok">What Canopy actually enforces</h3>
        <ul className="mt-3 space-y-2.5">
          {ENFORCED.map((item) =>
          <li key={item} className="flex gap-2.5 text-[12.5px] leading-relaxed">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ok" aria-hidden />
              <span>{item}</span>
            </li>
          )}
        </ul>
      </section>
      <section className="rounded-xl border border-destructive/30 bg-destructive/6 p-4">
        <h3 className="text-[14px] font-semibold text-destructive">What it cannot, and will not claim to</h3>
        <ul className="mt-3 space-y-2.5">
          {NOT_ENFORCED.map((item) =>
          <li key={item} className="flex gap-2.5 text-[12.5px] leading-relaxed">
              <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden />
              <span>{item}</span>
            </li>
          )}
        </ul>
      </section>
    </div>);

}