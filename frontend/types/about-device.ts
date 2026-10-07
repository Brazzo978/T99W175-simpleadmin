// =============================================================================
// About Device — Type Definitions
// =============================================================================
// Response shape for GET /cgi-bin/quecmanager/device/about.sh
// =============================================================================

export interface AboutDeviceResponse {
  success: boolean;
  device: {
    model: string;
    manufacturer: string;
    firmware: string;
    build_date: string;
    imei: string;
  };
  "3gpp_release": {
    lte: string;
    nr5g: string;
  };
  network: {
    device_ip: string;
    lan_gateway: string;
    wan_ipv4: string;
    wan_ipv6: string;
    public_ipv4: string;
    public_ipv6: string;
  };
  system: {
    hostname: string;
    kernel_version: string;
    openwrt_version: string;
  };
  error?: string;
}

export interface AboutDeviceData {
  device: AboutDeviceResponse["device"];
  threeGppRelease: AboutDeviceResponse["3gpp_release"];
  network: AboutDeviceResponse["network"];
  system: AboutDeviceResponse["system"];
}
