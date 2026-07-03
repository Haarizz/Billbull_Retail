package com.billbull.backend.pos.printer;

import com.billbull.backend.pos.device.PosDevice;
import com.billbull.backend.pos.device.PosDeviceStatus;
import com.billbull.backend.pos.device.PosDeviceType;
import com.billbull.backend.pos.devicemanager.DeviceManager;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;

@Service
public class PosPrinterService {

    private final PosPrinterRepository repo;
    private final DeviceManager deviceManager;

    public PosPrinterService(PosPrinterRepository repo, DeviceManager deviceManager) {
        this.repo = repo;
        this.deviceManager = deviceManager;
    }

    public List<PosPrinter> list(Long branchId, String terminalId, PosPrinterType deviceType) {
        if (branchId == null) {
            return List.of();
        }
        return repo.findByBranchIdAndIsActiveTrueOrderByDeviceTypeAscDeviceNameAsc(branchId).stream()
                .filter(printer -> terminalId == null || terminalId.isBlank() || terminalId.equalsIgnoreCase(blankToNull(printer.getTerminalId())))
                .filter(printer -> deviceType == null || printer.getDeviceType() == deviceType)
                .sorted(Comparator.comparing(PosPrinter::getDeviceType).thenComparing(PosPrinter::getDeviceName, String.CASE_INSENSITIVE_ORDER))
                .toList();
    }

    public PosPrinter get(Long id) {
        return repo.findByIdAndIsActiveTrue(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Printer not found: " + id));
    }

    public PosPrinter create(UpsertRequest req) {
        validateRequest(req, null);
        PosPrinter printer = new PosPrinter();
        apply(printer, req);
        printer.setRuntimeStatus(PosPrinterRuntimeStatus.UNKNOWN);
        PosDevice device = syncDeviceRecord(printer);
        printer.setDeviceId(device.getId());
        return repo.save(printer);
    }

    public PosPrinter update(Long id, UpsertRequest req) {
        PosPrinter printer = get(id);
        validateRequest(req, id);
        apply(printer, req);
        PosDevice device = syncDeviceRecord(printer);
        printer.setDeviceId(device.getId());
        return repo.save(printer);
    }

    /** Keeps the printer's shared Device Manager parent row (pos_devices) in sync. */
    private PosDevice syncDeviceRecord(PosPrinter printer) {
        return deviceManager.syncDeviceRecord(PosDeviceType.PRINTER, printer.getDeviceCode(), printer.getDeviceName(),
                printer.getBranchId(), printer.getBranchName(), printer.getTerminalId(), printer.getCounterName(),
                PosDeviceStatus.valueOf(printer.getStatus().name()));
    }

    public PosPrinter updateRuntime(Long id, RuntimeRequest req) {
        PosPrinter printer = get(id);
        printer.setRuntimeStatus(req.runtimeStatus() == null ? PosPrinterRuntimeStatus.UNKNOWN : req.runtimeStatus());
        printer.setLastTestResult(trimToNull(req.lastTestResult()));
        printer.setLastTestedAt(LocalDateTime.now());
        if (printer.getRuntimeStatus() == PosPrinterRuntimeStatus.ONLINE) {
            printer.setLastSeenAt(LocalDateTime.now());
        }
        return repo.save(printer);
    }

    public PosPrinter decommission(Long id) {
        PosPrinter printer = get(id);
        printer.setStatus(PosPrinterStatus.DECOMMISSIONED);
        printer.setDefaultPrinter(false);
        printer.setActive(false);
        syncDeviceRecord(printer);
        return repo.save(printer);
    }

    /**
     * Relays a raw ESC/POS byte stream straight to a Network/IP printer's socket —
     * no local workstation agent involved. This is what lets any device on the
     * network (phone, tablet, another PC) print to a LAN thermal printer through
     * nothing but the backend API, unlike USB/Windows-queue printers which can only
     * ever be reached by the specific machine they're physically plugged into.
     * Only ever dials the IP/port already stored on this printer's own row (set by
     * an authenticated admin via the printer config screen) — never a
     * client-supplied address — so this can't be used as an arbitrary network probe.
     */
    public void printEscPos(Long id, String dataBase64) {
        PosPrinter printer = get(id);
        if (printer.getConnectionType() != PosPrinterConnectionType.NETWORK_IP) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Server-relayed printing is only available for Network/IP printers.");
        }
        if (isBlank(printer.getIpAddress()) || printer.getPortNumber() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Printer is missing an IP address or port.");
        }
        if (isBlank(dataBase64)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "dataBase64 is required.");
        }
        byte[] payload;
        try {
            payload = Base64.getDecoder().decode(dataBase64);
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "dataBase64 is not valid base64.");
        }
        try (Socket socket = new Socket()) {
            socket.connect(new InetSocketAddress(printer.getIpAddress(), printer.getPortNumber()), 5000);
            socket.getOutputStream().write(payload);
            socket.getOutputStream().flush();
            // Give the printer controller a moment to actually consume the bytes —
            // in particular the trailing cut command — before the socket tears down;
            // closing immediately after write() can truncate the tail on slower
            // controllers (mirrors the same grace period in the local Node agent).
            Thread.sleep(150);
        } catch (IOException e) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                    "Unable to reach printer at " + printer.getIpAddress() + ":" + printer.getPortNumber() + " — " + e.getMessage());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    private void apply(PosPrinter printer, UpsertRequest req) {
        printer.setDeviceCode(req.deviceCode().trim());
        printer.setDeviceType(req.deviceType());
        printer.setDeviceName(req.deviceName().trim());
        printer.setModelName(trimToNull(req.modelName()));
        printer.setBranchId(req.branchId());
        printer.setBranchName(trimToNull(req.branchName()));
        printer.setTerminalId(blankToNull(req.terminalId()));
        printer.setTerminalName(trimToNull(req.terminalName()));
        printer.setCounterName(trimToNull(req.counterName()));
        printer.setConnectionType(req.connectionType());
        printer.setSystemPrinterName(trimToNull(req.systemPrinterName()));
        printer.setDeviceIdentifier(trimToNull(req.deviceIdentifier()));
        printer.setIpAddress(trimToNull(req.ipAddress()));
        printer.setPortNumber(req.portNumber());
        printer.setPaperSize(trimToNull(req.paperSize()));
        printer.setPrintTemplate(trimToNull(req.printTemplate()));
        printer.setDefaultPrinter(Boolean.TRUE.equals(req.defaultPrinter()));
        printer.setStatus(req.status() == null ? PosPrinterStatus.ACTIVE : req.status());
        printer.setNotes(trimToNull(req.notes()));
    }

    private void validateRequest(UpsertRequest req, Long existingId) {
        if (req == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Printer payload is required.");
        }
        if (isBlank(req.deviceCode())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Device code is required.");
        }
        if (isBlank(req.deviceName())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Device name is required.");
        }
        if (req.branchId() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Branch is required.");
        }
        if (req.deviceType() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Device type is required.");
        }
        if (req.connectionType() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Connection type is required.");
        }
        String normalizedCode = req.deviceCode().trim();
        if ((existingId == null && repo.existsByDeviceCode(normalizedCode))
                || (existingId != null && repo.existsByDeviceCodeAndIdNot(normalizedCode, existingId))) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Device code already exists: " + normalizedCode);
        }

        if (req.connectionType() == PosPrinterConnectionType.NETWORK_IP) {
            if (isBlank(req.ipAddress()) || req.portNumber() == null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Network printers require IP address and port.");
            }
        }

        if (requiresSystemPrinterName(req.connectionType()) && isBlank(req.systemPrinterName())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "System printer name is required for the selected connection type.");
        }

        if (Boolean.TRUE.equals(req.defaultPrinter()) && requiresUniqueDefault(req.deviceType())) {
            List<PosPrinter> branchPrinters = repo.findByBranchIdAndIsActiveTrueOrderByDeviceTypeAscDeviceNameAsc(req.branchId());
            for (PosPrinter existing : branchPrinters) {
                if (existingId != null && Objects.equals(existing.getId(), existingId)) {
                    continue;
                }
                if (!existing.isDefaultPrinter() || existing.getStatus() == PosPrinterStatus.DECOMMISSIONED) {
                    continue;
                }
                if (existing.getDeviceType() != req.deviceType()) {
                    continue;
                }
                if (sameDefaultScope(existing.getTerminalId(), req.terminalId())) {
                    String scope = isBlank(req.terminalId()) ? "branch" : "terminal";
                    throw new ResponseStatusException(HttpStatus.CONFLICT,
                            "A default " + labelFor(req.deviceType()) + " is already configured for this " + scope + ".");
                }
            }
        }
    }

    private boolean sameDefaultScope(String existingTerminalId, String requestedTerminalId) {
        String left = blankToNull(existingTerminalId);
        String right = blankToNull(requestedTerminalId);
        return Objects.equals(left, right);
    }

    private boolean requiresUniqueDefault(PosPrinterType type) {
        return type == PosPrinterType.RECEIPT_PRINTER || type == PosPrinterType.LABEL_PRINTER;
    }

    private boolean requiresSystemPrinterName(PosPrinterConnectionType type) {
        return type == PosPrinterConnectionType.USB
                || type == PosPrinterConnectionType.BLUETOOTH
                || type == PosPrinterConnectionType.WINDOWS_QUEUE
                || type == PosPrinterConnectionType.ZEBRA_BROWSER_PRINT;
    }

    private String labelFor(PosPrinterType type) {
        return switch (type) {
            case RECEIPT_PRINTER -> "receipt printer";
            case KITCHEN_PRINTER -> "kitchen printer";
            case LABEL_PRINTER -> "label printer";
        };
    }

    private String trimToNull(String value) {
        return isBlank(value) ? null : value.trim();
    }

    private String blankToNull(String value) {
        return isBlank(value) ? null : value.trim();
    }

    private boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }

    public record UpsertRequest(
            String deviceCode,
            PosPrinterType deviceType,
            String deviceName,
            String modelName,
            Long branchId,
            String branchName,
            String terminalId,
            String terminalName,
            String counterName,
            PosPrinterConnectionType connectionType,
            String systemPrinterName,
            String deviceIdentifier,
            String ipAddress,
            Integer portNumber,
            String paperSize,
            String printTemplate,
            Boolean defaultPrinter,
            PosPrinterStatus status,
            String notes
    ) {}

    public record RuntimeRequest(
            PosPrinterRuntimeStatus runtimeStatus,
            String lastTestResult
    ) {}
}
