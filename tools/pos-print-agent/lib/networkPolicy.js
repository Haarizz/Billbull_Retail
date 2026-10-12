"use strict";

// Where the agent may open a raw printer socket — the same rule as the
// backend's PrinterNetworkPolicy. Without it, /print/escpos with a NETWORK_IP
// target writes caller-chosen bytes to any host:port the till can reach (a
// router admin port, a database, another PC's SMB).
//
// Allowed by default: private LAN addresses (10/8, 172.16/12, 192.168/16,
// carrier-grade NAT 100.64/10, IPv6 fc00::/7) on the raw printing ports
// 9100-9109. The host name is resolved once and the socket is opened to that
// resolved address, so DNS cannot change the answer between check and connect.

const dns = require("node:dns").promises;
const net = require("node:net");

class NetworkPolicyError extends Error {
  constructor(message) {
    super(message);
    this.code = "AGENT_PRINTER_ADDRESS_REFUSED";
  }
}

const parsePorts = (spec) => String(spec ?? "").split(",").map((p) => p.trim()).filter(Boolean).map((p) => {
  const [lo, hi = lo] = p.split("-", 2).map((x) => Number(x.trim()));
  if (!Number.isInteger(lo) || !Number.isInteger(hi) || lo < 1 || hi > 65535 || lo > hi) {
    throw new Error(`Invalid network.allowedPorts entry: ${p}`);
  }
  return [lo, hi];
});

const PRIVATE = new net.BlockList();
PRIVATE.addSubnet("10.0.0.0", 8, "ipv4");
PRIVATE.addSubnet("172.16.0.0", 12, "ipv4");
PRIVATE.addSubnet("192.168.0.0", 16, "ipv4");
PRIVATE.addSubnet("100.64.0.0", 10, "ipv4");
PRIVATE.addSubnet("fc00::", 7, "ipv6");

const LOOPBACK = new net.BlockList();
LOOPBACK.addSubnet("127.0.0.0", 8, "ipv4");
LOOPBACK.addAddress("::1", "ipv6");

// Never: "this network", link-local (169.254/16 holds cloud metadata),
// multicast, broadcast, the unspecified address.
const NEVER = new net.BlockList();
NEVER.addSubnet("0.0.0.0", 8, "ipv4");
NEVER.addSubnet("169.254.0.0", 16, "ipv4");
NEVER.addSubnet("224.0.0.0", 4, "ipv4");
NEVER.addAddress("255.255.255.255", "ipv4");
NEVER.addAddress("::", "ipv6");
NEVER.addSubnet("fe80::", 10, "ipv6");
NEVER.addSubnet("ff00::", 8, "ipv6");

const unmapV4 = (address) => {
  const m = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  return m ? m[1] : address;
};

const createNetworkPolicy = ({ allowedPorts = "9100-9109", allowLoopback = false, allowPublic = false } = {}) => {
  const ports = parsePorts(allowedPorts);

  const isAllowedAddress = (raw) => {
    const address = unmapV4(raw);
    const family = net.isIP(address) === 6 ? "ipv6" : "ipv4";
    if (LOOPBACK.check(address, family)) return allowLoopback;
    if (NEVER.check(address, family)) return false;
    if (PRIVATE.check(address, family)) return true;
    return allowPublic;
  };

  /** Resolves host and returns the address to connect to, or throws NetworkPolicyError. */
  const resolveAllowed = async (host, port) => {
    const name = String(host ?? "").trim();
    const portNumber = Number(port);
    if (!name || !Number.isInteger(portNumber)) {
      throw new NetworkPolicyError("Network printers require an IP address and port.");
    }
    if (!ports.some(([lo, hi]) => portNumber >= lo && portNumber <= hi)) {
      throw new NetworkPolicyError(`Port ${portNumber} is not a permitted printer port. Network printers use the raw printing port, normally 9100.`);
    }
    let address;
    try {
      ({ address } = await dns.lookup(name, { verbatim: true }));
    } catch {
      throw new NetworkPolicyError(`Printer address ${name} could not be resolved.`);
    }
    if (!isAllowedAddress(address)) {
      throw new NetworkPolicyError(`Printer address ${name} (${address}) is not a private LAN address. The print agent only connects to printers on the local network.`);
    }
    return address;
  };

  return { resolveAllowed, isAllowedAddress };
};

module.exports = { createNetworkPolicy, NetworkPolicyError };
