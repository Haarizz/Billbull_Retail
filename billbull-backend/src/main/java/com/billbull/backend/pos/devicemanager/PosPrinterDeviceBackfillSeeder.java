package com.billbull.backend.pos.devicemanager;

import com.billbull.backend.pos.device.PosDevice;
import com.billbull.backend.pos.device.PosDeviceStatus;
import com.billbull.backend.pos.device.PosDeviceType;
import com.billbull.backend.pos.printer.PosPrinter;
import com.billbull.backend.pos.printer.PosPrinterRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Legacy backfill for printers that predate the Device Manager (Phase A, migration V22) and
 * therefore have {@code device_id IS NULL} — i.e. rows that existed before this code shipped
 * and have not since been touched through {@code PosPrinterService.update()}, which would have
 * synced them already.
 *
 * <p><b>Why a startup seeder instead of enabling Flyway:</b> this repo runs with
 * {@code spring.flyway.enabled=false} everywhere today (see
 * docs/pos-device-phase-a-review-2026-06-30.md §3); CLAUDE.md documents the established
 * convention for this exact situation — "data migrations are done in seeders ... which run at
 * startup" (mirroring {@code config.SystemAccountSeeder}, {@code security.RBACInitializer}, and
 * {@code inventory.stocktake.StockTakeBatchMasterBackfillSeeder}, the closest existing precedent
 * for an idempotent legacy-data backfill of exactly this shape). Enabling Flyway solely to run
 * one migration's DML would diverge from that established pattern and from the explicit
 * instruction not to flip it on for this. A startup seeder also self-heals on every restart with
 * no operator action required, which a one-off maintenance endpoint would not.
 *
 * <p><b>Idempotency:</b> the seeder only ever selects printers where {@code device_id IS NULL}.
 * Once a row is linked, it will never be selected again on a subsequent run, so re-running this
 * (including on every application restart) is always safe. Each printer is processed
 * independently so one failure does not block the rest, and re-running after a partial failure
 * only retries the rows that are still unlinked.
 *
 * <p><b>Does not modify printer behavior:</b> only {@link PosPrinter#setDeviceId(Long)} is
 * changed on each row — no connection type, status, template, or other field that drives actual
 * printing is touched, and this bypasses {@code PosPrinterService} entirely (so none of its
 * validation/default-printer-uniqueness rules run against historical data).
 */
@Component
public class PosPrinterDeviceBackfillSeeder {

    private static final Logger log = LoggerFactory.getLogger(PosPrinterDeviceBackfillSeeder.class);

    private final PosPrinterRepository printerRepo;
    private final DeviceManager deviceManager;

    public PosPrinterDeviceBackfillSeeder(PosPrinterRepository printerRepo, DeviceManager deviceManager) {
        this.printerRepo = printerRepo;
        this.deviceManager = deviceManager;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void backfill() {
        List<PosPrinter> orphaned = printerRepo.findByDeviceIdIsNull();
        if (orphaned.isEmpty()) {
            log.info("[PosPrinterDeviceBackfill] No legacy printers pending a Device Manager parent record.");
            return;
        }

        int linked = 0;
        int skipped = 0;
        int failed = 0;

        for (PosPrinter printer : orphaned) {
            try {
                if (printer.getDeviceCode() == null || printer.getDeviceCode().isBlank()) {
                    skipped++;
                    log.warn("[PosPrinterDeviceBackfill] Skipped printer id={} — missing device_code.", printer.getId());
                    continue;
                }

                PosDevice device = deviceManager.syncDeviceRecord(
                        PosDeviceType.PRINTER,
                        printer.getDeviceCode(),
                        printer.getDeviceName(),
                        printer.getBranchId(),
                        printer.getBranchName(),
                        printer.getTerminalId(),
                        printer.getCounterName(),
                        PosDeviceStatus.valueOf(printer.getStatus().name()));

                printer.setDeviceId(device.getId());
                printerRepo.save(printer);
                linked++;
                log.info("[PosPrinterDeviceBackfill] Linked printer id={} deviceCode={} -> device id={}.",
                        printer.getId(), printer.getDeviceCode(), device.getId());
            } catch (Exception e) {
                failed++;
                log.error("[PosPrinterDeviceBackfill] Failed to backfill printer id={} deviceCode={}: {}",
                        printer.getId(), printer.getDeviceCode(), e.getMessage(), e);
            }
        }

        log.info("[PosPrinterDeviceBackfill] Completed: processed={}, linked={}, skipped={}, failed={}.",
                orphaned.size(), linked, skipped, failed);
    }
}
