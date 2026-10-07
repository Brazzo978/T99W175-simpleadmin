// =============================================================================
// modem-subsys.ts — Type definitions for the Modem Subsystem CGI endpoint
// =============================================================================
// Mirrors the JSON produced by modem-subsys.sh. Nullability matches the CGI:
// state_raw is null when the sysfs file is absent or empty;
// crash_count / last_crash_at are null when the sysfs file is unreadable.
// cpu/memory/storage are null when their respective sources are fully unreadable.
// =============================================================================

export type ModemSubsysState = "online" | "offline" | "crashed" | "unknown";

export interface ModemSubsysData {
  /** Lowercased modem firmware state derived from sysfs subsys0/state */
  state: ModemSubsysState;
  /** Raw sysfs value preserved for diagnostic display; null when file is absent */
  state_raw: string | null;
  /** Crash counter from sysfs subsys0/crash_count; null when file is unreadable */
  crash_count: number | null;
  /** True when ramdump_modem/ contains at least one non-empty regular file */
  coredump_present: boolean;
  /** Unix epoch (seconds) of the most recent crash log entry; null when log is empty */
  last_crash_at: number | null;
  /** Number of entries in the persistent crash log (not the sysfs crash_count) */
  total_logged_crashes: number;
  /** Device uptime from /proc/uptime in seconds */
  uptime_seconds: number;
  /** CPU load and frequency; null when both /proc/loadavg and cpufreq are unreadable */
  cpu: {
    /** 1-minute load average from /proc/loadavg */
    load_1m: number | null;
    /** 5-minute load average from /proc/loadavg */
    load_5m: number | null;
    /** 15-minute load average from /proc/loadavg */
    load_15m: number | null;
    /** Number of logical CPU cores */
    core_count: number | null;
    /** Instantaneous CPU utilization percent (0-100) computed from /proc/stat delta; null on first poll or when sample window is unavailable */
    usage_pct: number | null;
    /** Current CPU frequency in kHz from scaling_cur_freq */
    freq_khz: number | null;
    /** Maximum CPU frequency in kHz from scaling_max_freq */
    max_freq_khz: number | null;
  } | null;
  /** Memory usage parsed from /proc/meminfo; null when file is unreadable */
  memory: {
    total_kb: number;
    available_kb: number;
    used_kb: number;
  } | null;
  /** /usrdata partition usage from df -P; null when mount is absent or df fails */
  storage: {
    mount: string;
    total_kb: number;
    used_kb: number;
    available_kb: number;
  } | null;
}

/** A single entry in /etc/qmanager/modem_crashes.json */
export interface ModemCrashLogEntry {
  /** Unix epoch (seconds) when the crash increment was detected */
  ts: number;
  /** crash_count value before the increment */
  previous_count: number;
  /** crash_count value after the increment */
  new_count: number;
  /** Modem subsystem state at detection time */
  modem_state_at_event: ModemSubsysState;
  /** Device uptime in seconds at detection time */
  uptime_at_event_seconds: number;
}
