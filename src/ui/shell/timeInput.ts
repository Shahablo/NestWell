/**
 * Conversion between <input type="datetime-local"> values (naive "YYYY-MM-DDTHH:mm") and
 * UTC ISO instants, interpreted in the practice timezone (NFR-11).
 */
import { fromMs, toMs } from '../../domain/clock';
import type { ISO } from '../../domain/types';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** ISO instant → naive local string in the given timezone, e.g. "2026-04-20T11:00". */
export function isoToLocalInput(iso: ISO, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(new Date(toMs(iso)));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  const hour = get('hour') === '24' ? '00' : get('hour');
  return `${get('year')}-${get('month')}-${get('day')}T${hour}:${get('minute')}`;
}

function naiveToUtcMs(value: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!m) return Number.NaN;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
}

/** Naive local string in the given timezone → ISO instant. Returns null when unparsable. */
export function localInputToIso(value: string, timeZone: string): ISO | null {
  let guess = naiveToUtcMs(value);
  if (Number.isNaN(guess)) return null;
  // Two fixed-point iterations handle the zone offset, including around DST changes.
  for (let i = 0; i < 2; i++) {
    const back = naiveToUtcMs(isoToLocalInput(fromMs(guess), timeZone));
    guess += naiveToUtcMs(value) - back;
  }
  return fromMs(guess);
}

/** Today's date in the zone as "YYYY-MM-DD" — handy for date-only inputs. */
export function isoToLocalDate(iso: ISO, timeZone: string): string {
  return isoToLocalInput(iso, timeZone).slice(0, 10);
}

export { pad };
