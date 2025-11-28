import { config } from "../../config";
import { log } from "./logger";

interface VpnApiResponse {
  ip: string;
  security: {
    vpn: boolean;
    proxy: boolean;
    tor: boolean;
    relay: boolean;
  };
  location: {
    city: string;
    region: string;
    country: string;
    continent: string;
    region_code: string;
    country_code: string;
    continent_code: string;
    latitude: string;
    longitude: string;
    time_zone: string;
    locale_code: string;
    metro_code: string;
    is_in_european_union: boolean;
  };
  network: {
    network: string;
    autonomous_system_number: string;
    autonomous_system_organization: string;
  };
}

export async function checkVpn(ip: string): Promise<{ isVpn: boolean; isp: string; country: string; countryCode: string }> {
  const defaultResult = { isVpn: false, isp: "unknown", country: "unknown", countryCode: "" };

  try {
    const res = await fetch(`https://vpnapi.io/api/${ip}?key=${config.vpnapi.apiKey}`);

    if (res.status === 429) {
      log.warn("VPNAPI rate limit exceeded");
      return defaultResult;
    }

    if (!res.ok) {
      log.warn(`VPNAPI error: ${res.status}`);
      return defaultResult;
    }

    const data = await res.json();

    if (!data || typeof data !== "object") {
      log.warn("VPNAPI returned invalid response");
      return defaultResult;
    }

    if (data.error) {
      log.warn(`VPNAPI error: ${data.message || data.error}`);
      return defaultResult;
    }

    if (!data.security || !data.location || !data.network) {
      log.warn("VPNAPI response missing required fields");
      return defaultResult;
    }

    const isVpn = Boolean(data.security.vpn || data.security.proxy || data.security.tor || data.security.relay);

    if (isVpn) {
      const type = data.security.vpn ? "VPN" : data.security.proxy ? "Proxy" : data.security.tor ? "Tor" : "Relay";
      log.vpn(ip, `${type} - ${data.network.autonomous_system_organization || "unknown"}`);
    }

    return {
      isVpn,
      isp: data.network.autonomous_system_organization || "unknown",
      country: data.location.country || "unknown",
      countryCode: data.location.country_code || "",
    };
  } catch (err) {
    log.warn(`VPNAPI request failed: ${err instanceof Error ? err.message : "unknown"}`);
    return defaultResult;
  }
}
