// IPv4 and MAC helpers for the network forms.

const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;

export function isValidIp(value: string): boolean {
  return IPV4.test(value.trim());
}

export function isValidMac(value: string): boolean {
  return /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(value.trim().toUpperCase());
}

export function ipToNumber(ip: string): number {
  const octets = ip.split(".").map((p) => Number.parseInt(p, 10));
  if (octets.length !== 4 || octets.some(Number.isNaN)) return 0;
  return ((octets[0] << 24) >>> 0) + (octets[1] << 16) + (octets[2] << 8) + octets[3];
}

export function sameSubnet(a: string, b: string, mask: string): boolean {
  const m = ipToNumber(mask);
  return ((ipToNumber(a) & m) >>> 0) === ((ipToNumber(b) & m) >>> 0);
}

/** LAN masks the QCMAP configuration accepts. */
export const LAN_MASKS = [
  "255.255.255.0",
  "255.255.255.128",
  "255.255.255.192",
  "255.255.255.224",
  "255.255.255.240",
  "255.255.255.248",
  "255.255.255.252",
] as const;

export function maskPrefix(mask: string): number {
  return ipToNumber(mask)
    .toString(2)
    .split("")
    .filter((b) => b === "1").length;
}

/** A DHCP range in the usable part of the subnet of `ip`/`mask`. */
export function suggestDhcpRange(ip: string, mask: string): { start: string; end: string } | null {
  if (!isValidIp(ip) || !(LAN_MASKS as readonly string[]).includes(mask)) return null;
  const ipOct = ip.split(".").map(Number);
  const maskOct = mask.split(".").map(Number);
  const net = ipOct.map((o, i) => o & maskOct[i]);
  const broadcast = net.map((o, i) => o | (255 - maskOct[i]));
  const hosts = broadcast[3] - net[3] - 1;
  const prefix = `${net[0]}.${net[1]}.${net[2]}`;
  const start = net[3] + Math.min(10, Math.floor(hosts / 4));
  const end = Math.min(net[3] + Math.min(60, Math.floor(hosts / 2)), broadcast[3] - 1);
  return { start: `${prefix}.${start}`, end: `${prefix}.${end}` };
}
