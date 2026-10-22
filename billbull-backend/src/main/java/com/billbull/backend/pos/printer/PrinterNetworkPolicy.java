package com.billbull.backend.pos.printer;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import java.net.Inet4Address;
import java.net.Inet6Address;
import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.ArrayList;
import java.util.List;

/**
 * Where the server may open a raw printer socket ({@link PosPrinterService#printEscPos}).
 *
 * <p>That relay writes caller-supplied bytes to the printer's stored IP and port, so without a
 * limit a printer row is a way to make the server write arbitrary bytes to any host it can
 * reach: its own database, a cache, a cloud metadata service. Allowed by default:
 * private LAN addresses (10/8, 172.16/12, 192.168/16, carrier-grade NAT 100.64/10 as used by
 * VPN overlays, IPv6 unique-local fc00::/7) on the raw printing ports 9100-9109. Loopback,
 * link-local (169.254/16 includes cloud metadata), wildcard, multicast and public addresses are
 * refused.
 *
 * <p>Checked when a printer is saved and again on every print, against the address the host
 * name resolves to at that moment; the socket is then opened to that same resolved address, so
 * a DNS answer cannot change between check and connect.
 *
 * <ul>
 *   <li>{@code pos.printer.network.allowed-ports}: comma-separated ports or ranges, default {@code 9100-9109}</li>
 *   <li>{@code pos.printer.network.allow-loopback}: default {@code false}; for a printer emulator in development</li>
 *   <li>{@code pos.printer.network.allow-public}: default {@code false}</li>
 * </ul>
 */
@Component
public class PrinterNetworkPolicy {

    private final List<int[]> allowedPorts;
    private final boolean allowLoopback;
    private final boolean allowPublic;

    public PrinterNetworkPolicy(
            @Value("${pos.printer.network.allowed-ports:9100-9109}") String allowedPorts,
            @Value("${pos.printer.network.allow-loopback:false}") boolean allowLoopback,
            @Value("${pos.printer.network.allow-public:false}") boolean allowPublic) {
        this.allowedPorts = parsePorts(allowedPorts);
        this.allowLoopback = allowLoopback;
        this.allowPublic = allowPublic;
    }

    /** Policy with the production defaults. */
    public static PrinterNetworkPolicy defaults() {
        return new PrinterNetworkPolicy("9100-9109", false, false);
    }

    /** 400 when a printer may not be configured with this address and port. */
    public void validateConfigured(String host, Integer port) {
        resolveAllowed(host, port);
    }

    /** The address to connect to, resolved once and checked; 400 when it is not allowed. */
    public InetAddress resolveAllowed(String host, Integer port) {
        if (host == null || host.isBlank() || port == null) {
            throw refuse("Network printers require IP address and port.");
        }
        if (allowedPorts.stream().noneMatch(r -> port >= r[0] && port <= r[1])) {
            throw refuse("Port " + port + " is not a permitted printer port. Network printers use the raw "
                    + "printing port, normally 9100 (setting pos.printer.network.allowed-ports).");
        }
        InetAddress address;
        try {
            address = InetAddress.getByName(host.trim());
        } catch (UnknownHostException e) {
            throw refuse("Printer address " + host.trim() + " could not be resolved.");
        }
        if (!isAllowed(address)) {
            throw refuse("Printer address " + host.trim() + " (" + address.getHostAddress() + ") is not a "
                    + "private LAN address. The server only connects to printers on the local network.");
        }
        return address;
    }

    private boolean isAllowed(InetAddress a) {
        if (a.isLoopbackAddress()) return allowLoopback;
        if (a.isAnyLocalAddress() || a.isLinkLocalAddress() || a.isMulticastAddress()) return false;
        if (a instanceof Inet4Address) {
            byte[] b = a.getAddress();
            int b0 = b[0] & 0xff, b1 = b[1] & 0xff;
            if (b0 == 255 && b1 == 255) return false; // broadcast
            if (b0 == 0) return false;               // "this network"
            if (a.isSiteLocalAddress()) return true;  // 10/8, 172.16/12, 192.168/16
            if (b0 == 100 && b1 >= 64 && b1 <= 127) return true; // 100.64/10
            return allowPublic;
        }
        if (a instanceof Inet6Address) {
            int first = a.getAddress()[0] & 0xff;
            if ((first & 0xfe) == 0xfc) return true; // fc00::/7
            if (a.isSiteLocalAddress()) return false; // deprecated fec0::/10
            return allowPublic;
        }
        return false;
    }

    private static ResponseStatusException refuse(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }

    private static List<int[]> parsePorts(String spec) {
        List<int[]> ranges = new ArrayList<>();
        for (String part : (spec == null ? "" : spec).split(",")) {
            String p = part.trim();
            if (p.isEmpty()) continue;
            String[] ends = p.split("-", 2);
            int lo = Integer.parseInt(ends[0].trim());
            int hi = ends.length > 1 ? Integer.parseInt(ends[1].trim()) : lo;
            if (lo < 1 || hi > 65535 || lo > hi) {
                throw new IllegalArgumentException("Invalid pos.printer.network.allowed-ports entry: " + p);
            }
            ranges.add(new int[]{lo, hi});
        }
        return ranges;
    }
}
