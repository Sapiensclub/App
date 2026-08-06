import * as SMS from 'expo-sms';
import { Platform, Share } from 'react-native';

import type { TrustedContact } from '@/lib/sos/sos';

// The SOS alert delivery seam (PRD 10.9, Layer 1).
//
// P1 delivery is DEVICE-NATIVE: we open the phone's own SMS composer (or the
// share sheet) pre-filled with the alert + a location link, and the user taps
// send. This is real and needs no SMS vendor or DLT registration. A future
// server-sent alerter (automatic SMS) can implement the same `alertContacts`
// contract without touching the screen.

export type AlertOutcome = 'sent' | 'cancelled' | 'shared' | 'unknown' | 'failed';

/** A maps link to the SOS location, or a plain note if we have no fix. */
export function locationLink(coords: { lat: number; lng: number } | null): string {
  if (!coords) return 'location unavailable';
  return `https://maps.google.com/?q=${coords.lat},${coords.lng}`;
}

/** The message trusted contacts receive. Plain text so any SMS app accepts it. */
export function buildAlertMessage(
  name: string | null,
  coords: { lat: number; lng: number } | null,
): string {
  const who = name?.trim() || 'A Sapiens member';
  return `SOS from ${who} via Sapiens. I may need help. My location: ${locationLink(coords)}`;
}

/**
 * Open the phone's SMS composer to the trusted contacts, pre-filled with the
 * alert. Falls back to the OS share sheet where SMS isn't available (e.g. web).
 */
export async function alertContacts(
  contacts: TrustedContact[],
  message: string,
): Promise<AlertOutcome> {
  const phones = contacts.map((c) => c.phone).filter(Boolean);

  try {
    const smsOk = phones.length > 0 && (await SMS.isAvailableAsync());
    if (smsOk) {
      const { result } = await SMS.sendSMSAsync(phones, message);
      // iOS often reports 'unknown' even when sent — treat non-cancel as sent.
      if (result === 'cancelled') return 'cancelled';
      return result === 'sent' ? 'sent' : 'unknown';
    }
  } catch {
    // fall through to share
  }

  try {
    await Share.share(
      Platform.OS === 'ios' ? { message } : { message, title: 'Sapiens SOS' },
    );
    return 'shared';
  } catch {
    return 'failed';
  }
}
