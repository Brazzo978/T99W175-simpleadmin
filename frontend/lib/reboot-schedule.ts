// =============================================================================
// Scheduled reboot — form model ↔ crontab line (cgi-bin/reboot_schedule)
// =============================================================================
// The CGI stores one crontab line ending in "reboot". Interval schedules are
// "0 */H * * *" (24 h is "0 0 * * *"); fixed ones are "M H dom * dow".
// "*/H" counts from midnight every day, so it is evenly spaced only when H
// divides 24: */5 fires at 20:00 and again four hours later at 00:00.
// =============================================================================

import { msg, type Msg } from "@/lib/i18n/message";

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

/** Translation key of a weekday (cron day of week): in a list, or inline
 *  in a sentence (lower case in Italian). */
export function weekdayKey(day: number, inline = false): string {
  const name = (WEEKDAYS[day] ?? WEEKDAYS[0]).toLowerCase();
  return `system-settings:reboot.${inline ? "weekdays_inline" : "weekdays"}.${name}`;
}

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

/** Why the form cannot be saved (a translatable message), or null. */
export function validateSchedule(form: RebootForm): Msg | null {
  if (form.mode === "interval") {
    return (INTERVAL_HOURS as readonly number[]).includes(form.intervalHours)
      ? null
      : msg("system-settings:reboot.validation.interval");
  }
  const [h, m] = form.time.split(":").map(Number);
  if (!(h >= 0 && h <= 23 && m >= 0 && m <= 59)) return msg("system-settings:reboot.validation.time");
  if (form.frequency === "monthly" && !(form.dayOfMonth >= 1 && form.dayOfMonth <= 31)) {
    return msg("system-settings:reboot.validation.day_of_month");
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

/** The schedule in words, as a translatable message. */
export function describeSchedule(form: RebootForm): Msg {
  const key = (name: string) => `system-settings:reboot.describe.${name}`;
  if (form.mode === "interval") {
    if (form.intervalHours === 24) return msg(key("midnight"));
    // A schedule saved by an older interface may not divide the day.
    return 24 % form.intervalHours === 0
      ? msg(key("every_hours"), { count: form.intervalHours })
      : msg(key("every_hours_uneven"), { count: form.intervalHours });
  }
  if (form.frequency === "weekly") {
    return msg(key("weekly"), { day: msg(weekdayKey(form.dayOfWeek, true)), time: form.time });
  }
  if (form.frequency === "monthly") {
    return msg(key("monthly"), { day: form.dayOfMonth, time: form.time });
  }
  return msg(key("daily"), { time: form.time });
}
