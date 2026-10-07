// types/system-health-check.ts
// Shared types for the System Health Check feature.

export type TestStatus = "pending" | "running" | "pass" | "fail" | "warn" | "skip";

export type JobStatus = "running" | "complete" | "complete_no_bundle" | "error";

export type TestCategory =
  | "binaries"
  | "permissions"
  | "at_transport"
  | "sms"
  | "sudoers"
  | "services"
  | "network"
  | "configuration";

export interface HealthCheckTest {
  id: string;
  category: TestCategory;
  label: string;
  status: TestStatus;
  duration_ms: number;
  detail: string;
}

export interface HealthCheckSummary {
  pass: number;
  fail: number;
  warn: number;
  skip: number;
  total: number;
}

export interface HealthCheckJob {
  job_id: string;
  status: JobStatus;
  started_at: number;
  finished_at: number | null;
  pid: number;
  summary: HealthCheckSummary;
  tests: HealthCheckTest[];
  tarball_path: string | null;
  tarball_size: number | null;
  error: string | null;
}

export interface RunResponse {
  success: boolean;
  job_id?: string;
  started_at?: number;
  error?: string;
  detail?: string;
}

export interface TestOutputResponse {
  success: boolean;
  test_id?: string;
  output?: string;
  truncated?: boolean;
  error?: string;
}

export const CATEGORY_LABELS: Record<TestCategory, string> = {
  binaries: "Binaries & Versions",
  permissions: "Filesystem & Permissions",
  at_transport: "AT Transport",
  sms: "SMS Subsystem",
  sudoers: "Sudoers",
  services: "Systemd Services",
  network: "Network",
  configuration: "Configuration",
};

export const CATEGORY_DESCRIPTIONS: Record<TestCategory, string> = {
  binaries: "Required binaries and version checks",
  permissions: "Filesystem ownership, modes, and group membership",
  at_transport: "qcmd / atcli_smd11 round-trip checks against the modem",
  sms: "sms_tool readiness and SIM presence",
  sudoers: "www-data sudoers helper visibility",
  services: "Systemd unit presence, enablement, and active state",
  network: "DNS, IPv4, modem data path, lighttpd, firewall",
  configuration: "QManager config files and poller cache freshness",
};
