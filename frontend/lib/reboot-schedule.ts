// =============================================================================
// Scheduled reboot — form model ↔ crontab line (cgi-bin/reboot_schedule)
// =============================================================================
// The CGI stores one crontab line ending in "reboot". Interval schedules are
// "0 */H * * *" (24 h is "0 0 * * *"); fixed ones are "M H dom * dow".
// "*/H" counts from midnight every day, so it is evenly spaced only when H
// divides 24: */5 fires at 20:00 and again four hours later at 00:00.
// =============================================================================

export type RebootFrequency = "daily" | "weekly" | "monthly";

export interface RebootForm {
  mode: "interval" | "schedule";
  intervalHours: number;
  frequency: RebootFrequency;
  /** cron day of week, 0 = Sunday */
  dayOfWeek: number;
  dayOfMonth: number;
  /** "HH:MM" */
  time: string;
}

export const DEFAULT_REBOOT_FORM: RebootForm = {
  mode: "interval",
  intervalHours: 24,
  frequency: "daily",
  dayOfWeek: 3,
  dayOfMonth: 1,
  time: "00:00",
};

/** Intervals that divide the day evenly. */
export const INTERVAL_HOURS = [1, 2, 3, 4, 6, 8, 12, 24] as const;

export const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export function parseSchedule(line: string): RebootForm | null {
  const parts = line.trim().split(/\s+/);
  if (parts.length < 6) return null;
  const [minute, hour, dom, , dow] = parts;
  if (minute === "0" && dom === "*" && dow === "*") {
    if (hour === "0") return { ...DEFAULT_REBOOT_FORM, mode: "interval", intervalHours: 24 };
    if (hour.startsWith("*/")) {
      const every = Number.parseInt(hour.slice(2), 10);
      if (Number.isInteger(every)) return { ...DEFAULT_REBOOT_FORM, mode: "interval", intervalHours: every };
    }
  }
  const time = `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
  const form: RebootForm = { ...DEFAULT_REBOOT_FORM, mode: "schedule", time };
  if (dom === "*" && dow !== "*") {
    form.frequency = "weekly";
    form.dayOfWeek = Number.parseInt(dow, 10) || 0;
  } else if (dom !== "*" && dow === "*") {
    form.frequency = "monthly";
    form.dayOfMonth = Number.parseInt(dom, 10) || 1;
  }
  return form;
}

export function validateSchedule(form: RebootForm): string | null {
  if (form.mode === "interval") {
    return (INTERVAL_HOURS as readonly number[]).includes(form.intervalHours)
      ? null
      : "Choose an interval that divides the day: 1, 2, 3, 4, 6, 8, 12 or 24 hours.";
  }
  const [h, m] = form.time.split(":").map(Number);
  if (!(h >= 0 && h <= 23 && m >= 0 && m <= 59)) return "Choose a valid time.";
  if (form.frequency === "monthly" && !(form.dayOfMonth >= 1 && form.dayOfMonth <= 31)) {
    return "The day of the month must be 1 to 31.";
  }
  return null;
}

export function buildSchedule(form: RebootForm): string {
  if (form.mode === "interval") {
    return form.intervalHours === 24 ? "0 0 * * * reboot" : `0 */${form.intervalHours} * * * reboot`;
  }
  const [hour, minute] = form.time.split(":").map(Number);
  const dom = form.frequency === "monthly" ? String(form.dayOfMonth) : "*";
  const dow = form.frequency === "weekly" ? String(form.dayOfWeek) : "*";
  return `${minute} ${hour} ${dom} * ${dow} reboot`;
}

export function describeSchedule(form: RebootForm): string {
  if (form.mode === "interval") {
    if (form.intervalHours === 24) return "Every day at midnight";
    // A schedule saved by an older interface may not divide the day.
    return 24 % form.intervalHours === 0
      ? `Every ${form.intervalHours} hours from midnight`
      : `Every ${form.intervalHours} hours from midnight, then again at midnight`;
  }
  if (form.frequency === "weekly") return `Every ${WEEKDAYS[form.dayOfWeek]} at ${form.time}`;
  if (form.frequency === "monthly") return `Day ${form.dayOfMonth} of every month at ${form.time}`;
  return `Every day at ${form.time}`;
}
