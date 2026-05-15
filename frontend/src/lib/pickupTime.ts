// Time formats used across notifications, order rows, and the buy/edit modals:
//   "10 AM"          — hour-only with period (slot from/to in App.tsx)
//   "3:00 PM"        — confirmed_time on an OrderData
//   "10 AM – 12 PM"  — slot.time window (en-dash or hyphen)
// And the notification message format for address_released:
//   "<base text>||<pickup time display>||<target ISO timestamp>"

export const ADDRESS_RELEASED_DELIM = "||";

// Parses "10 AM" / "10AM" / "3 PM" etc. into a 24h hour. Returns null if the
// input doesn't match, so callers can decide their own fallback.
export function parseHourPeriod(s: string): number | null {
  const match = s.trim().match(/^(\d{1,2})\s*(AM|PM)$/i);
  if (!match) return null;
  let h = parseInt(match[1], 10);
  const period = match[2].toUpperCase();
  if (period === "PM" && h !== 12) h += 12;
  if (period === "AM" && h === 12) h = 0;
  return h;
}

// Parses "3:00 PM" / "11:30 AM" into {hour, minute} (24h). Returns null on
// non-match. Used to convert OrderData.confirmed_time into a clock target.
export function parseClockPeriod(s: string): { hour: number; minute: number } | null {
  const match = s.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return null;
  let h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const ampm = match[3].toUpperCase();
  if (ampm === "PM" && h !== 12) h += 12;
  if (ampm === "AM" && h === 12) h = 0;
  return { hour: h, minute: m };
}

// Parses the end hour from a slot.time like "10 AM – 12 PM" or "10 AM - 12 PM".
// Returns null if no closing hour can be parsed.
export function parseSlotEndHour(slotTime: string): number | null {
  const dashMatch = slotTime.match(/[–-]\s*(\d{1,2})\s*(AM|PM)/i);
  if (!dashMatch) return null;
  let h = parseInt(dashMatch[1], 10);
  const ampm = dashMatch[2].toUpperCase();
  if (ampm === "PM" && h !== 12) h += 12;
  if (ampm === "AM" && h === 12) h = 0;
  return h;
}

// Builds a target Date by combining "YYYY-MM-DD" and an hour/minute.
export function buildSlotTarget(date: string, hour: number, minute = 0): Date {
  const target = new Date(date + "T00:00:00");
  target.setHours(hour, minute, 0, 0);
  return target;
}

export type AddressReleasedParts = {
  baseText: string;
  pickupTimeDisplay: string;
  targetIso: string;
};

// Parses the "||"-delimited message body of an address_released notification.
// Returns null if the message doesn't contain the delimiter.
export function parseAddressReleasedMessage(message: string): AddressReleasedParts | null {
  if (!message.includes(ADDRESS_RELEASED_DELIM)) return null;
  const parts = message.split(ADDRESS_RELEASED_DELIM);
  return {
    baseText: parts[0] ?? "",
    pickupTimeDisplay: parts[1] ?? "",
    targetIso: parts[2] ?? "",
  };
}

// Milliseconds in one hour — the pin window used to surface an
// address_released notification at the top of the list.
export const PIN_WINDOW_MS = 60 * 60 * 1000;

export type CountdownLabel = { days: number; hours: number; minutes: number; label: string };

// Breaks a positive millisecond duration into days/hours/minutes plus a
// short human label ("2d 3h 4m", "3h 4m", or "4m").
export function formatCountdown(diffMs: number): CountdownLabel {
  const days = Math.floor(diffMs / 86400000);
  const hours = Math.floor((diffMs % 86400000) / 3600000);
  const minutes = Math.floor((diffMs % 3600000) / 60000);
  const label =
    days > 0 ? `${days}d ${hours}h ${minutes}m` :
    hours > 0 ? `${hours}h ${minutes}m` :
    `${minutes}m`;
  return { days, hours, minutes, label };
}
