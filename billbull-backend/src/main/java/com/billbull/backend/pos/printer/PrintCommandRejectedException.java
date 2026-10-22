package com.billbull.backend.pos.printer;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * A raw print job refused by its printer's command policy before any connection was opened.
 * Rendered by {@code GlobalExceptionHandler} as 422 {@code PRINT_COMMAND_REJECTED} with the
 * protocol, category, command and byte offset — enough for support, nothing about the server.
 */
public class PrintCommandRejectedException extends RuntimeException {

    private final PrinterCommandProtocol protocol;
    private final String category;
    private final String command;
    private final int offset;

    PrintCommandRejectedException(PrinterCommandProtocol protocol, PrintCommandVerdict verdict) {
        super(message(protocol, verdict.command(), verdict.category(), verdict.offset()));
        this.protocol = protocol;
        this.category = verdict.category();
        this.command = verdict.command();
        this.offset = verdict.offset();
    }

    PrintCommandRejectedException(PrinterCommandProtocol protocol, String category, String message) {
        super(message);
        this.protocol = protocol;
        this.category = category;
        this.command = null;
        this.offset = -1;
    }

    public Map<String, Object> details() {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("protocol", protocol.name());
        body.put("category", category);
        if (command != null) body.put("command", command);
        if (offset >= 0) body.put("offset", offset);
        return body;
    }

    private static String message(PrinterCommandProtocol protocol, String command, String category, int offset) {
        String what = switch (category) {
            case "DRAWER" -> "drives a cash drawer in a way BillBull does not use";
            case "BUZZER" -> "sounds the printer buzzer";
            case "POWER" -> protocol == PrinterCommandProtocol.ZPL ? "restarts the printer" : "powers the printer off";
            case "NV_WRITE" -> "rewrites the printer's permanent memory";
            case "HARDWARE_CONFIG", "CONFIG_WRITE" -> "changes the printer's settings";
            case "HARDWARE_CONTROL", "DEVICE_CONTROL" -> "controls the printer directly";
            case "DEVICE_QUERY" -> "asks the printer for its configuration";
            case "NETWORK" -> "changes the printer's network settings";
            case "STORAGE" -> "writes or deletes files in the printer's memory";
            case "RFID" -> "drives the RFID encoder";
            case "OUTSIDE_FORMAT" -> "sits outside a ^XA … ^XZ label";
            case "CONTROL_CHARACTER" -> "contains a control character";
            case "INCOMPLETE" -> "ends part-way through a command";
            case "MALFORMED" -> "is not well formed";
            default -> "is not a command BillBull sends";
        };
        String kind = protocol == PrinterCommandProtocol.ZPL ? "Label job" : "Print job";
        return kind + " refused: " + command + " at byte " + offset + " " + what + ". Nothing was sent to the printer.";
    }
}
