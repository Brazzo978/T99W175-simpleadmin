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

export function numberToIp(n: number): string {
  return [24, 16, 8, 0].map((shift) => (n >>> shift) & 255).join(".");
}

/** Network and broadcast address of `ip`/`mask`, as numbers. */
export function subnetBounds(ip: string, mask: string): { network: number; broadcast: number } {
  const m = ipToNumber(mask);
  const network = (ipToNumber(ip) & m) >>> 0;
  return { network, broadcast: (network | (~m >>> 0)) >>> 0 };
}

/** Why a DHCP range cannot be used on this LAN, or null when it can. */
export function dhcpRangeProblem(ip: string, mask: string, start: string, end: string): string | null {
  if (!isValidIp(start) || !isValidIp(end)) return "Enter a valid DHCP range.";
  if (!sameSubnet(ip, start, mask) || !sameSubnet(ip, end, mask)) {
    return "The DHCP range must be in the LAN subnet.";
  }
  const s = ipToNumber(start);
  const e = ipToNumber(end);
  if (s > e) return "The DHCP range start must be lower than its end.";
  const { network, broadcast } = subnetBounds(ip, mask);
  if (s === network || e === broadcast) {
    return "The DHCP range cannot include the network or broadcast address.";
  }
  const own = ipToNumber(ip);
  if (own >= s && own <= e) return "The DHCP range cannot include the modem address.";
  return null;
}

/**
 * A DHCP range of usable hosts in the subnet of `ip`/`mask`, after the first
 * few addresses and leaving the modem address out; null when none fits.
 */
export function suggestDhcpRange(ip: string, mask: string): { start: string; end: string } | null {
  if (!isValidIp(ip) || !(LAN_MASKS as readonly string[]).includes(mask)) return null;
  const { network, broadcast } = subnetBounds(ip, mask);
  const hosts = broadcast - network - 1;
  let start = network + 1 + Math.min(9, Math.floor(hosts / 4));
  let end = Math.min(network + Math.min(60, Math.floor(hosts / 2) + 1), broadcast - 1);
  const own = ipToNumber(ip);
  if (own >= start && own <= end) {
    // Take the larger side of the range around the modem.
    if (end - own >= own - start) start = own + 1;
    else end = own - 1;
  }
  if (start > end) return null;
  return { start: numberToIp(start), end: numberToIp(end) };
}
