package com.billbull.backend.pos.auth;

import com.billbull.backend.common.ownership.OwnershipContextHolder;
import com.billbull.backend.exception.GlobalExceptionHandler;
import com.billbull.backend.pos.cashdrawer.PosDrawerKickAuthorizer;
import com.billbull.backend.pos.counter.PosCounter;
import com.billbull.backend.pos.counter.PosCounterController;
import com.billbull.backend.pos.counter.PosCounterService;
import com.billbull.backend.pos.device.PosDevice;
import com.billbull.backend.pos.device.PosDeviceController;
import com.billbull.backend.pos.device.PosDeviceRepository;
import com.billbull.backend.pos.devicemanager.DashboardRefreshSignal;
import com.billbull.backend.pos.devicemanager.DeviceDashboardService;
import com.billbull.backend.pos.devicemanager.DeviceManager;
import com.billbull.backend.pos.devicemanager.DeviceManagerController;
import com.billbull.backend.pos.devicemanager.DiscoveryService;
import com.billbull.backend.pos.devicemanager.HardwareProfileAssignmentEngine;
import com.billbull.backend.pos.devicemanager.HardwareProfileController;
import com.billbull.backend.pos.devicemanager.HardwareProfileService;
import com.billbull.backend.pos.devicemanager.HealthService;
import com.billbull.backend.pos.devicemanager.PosHardwareProfile;
import com.billbull.backend.pos.printer.PosPrinter;
import com.billbull.backend.pos.printer.PosPrinterConnectionType;
import com.billbull.backend.pos.printer.PosPrinterController;
import com.billbull.backend.pos.printer.PosPrinterRepository;
import com.billbull.backend.pos.printer.PosPrinterService;
import com.billbull.backend.pos.printer.PosPrinterType;
import com.billbull.backend.pos.printer.PrinterNetworkPolicy;
import com.billbull.backend.pos.printjob.PosPrintJob;
import com.billbull.backend.pos.printjob.PosPrintJobController;
import com.billbull.backend.pos.printjob.PosPrintJobService;
import com.billbull.backend.pos.printjob.PrintJobType;
import com.billbull.backend.pos.scanner.PosScanner;
import com.billbull.backend.pos.scanner.PosScannerController;
import com.billbull.backend.pos.scanner.PosScannerService;
import com.billbull.backend.pos.session.PosSession;
import com.billbull.backend.pos.session.PosSessionOwnershipService;
import com.billbull.backend.pos.session.PosSessionRepository;
import com.billbull.backend.pos.session.PosSessionStatus;
import com.billbull.backend.pos.terminal.PosTerminal;
import com.billbull.backend.pos.terminal.PosTerminalRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.function.Executable;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.server.ResponseStatusException;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.TimeUnit;

import static com.billbull.backend.pos.auth.PosAuthFixture.OTHER;
import static com.billbull.backend.pos.auth.PosAuthFixture.OWN;
import static com.billbull.backend.pos.auth.PosAuthFixture.assertForbidden;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Authorization on the hardware endpoints: counters, scanners, hardware profiles, the device
 * registry and dashboard, print jobs, server-relayed printing and the cash drawer pulse.
 *
 * <p>Permissions and branch scope run through the real services ({@link PosAuthFixture}).
 * Printing goes through the real {@link PosPrinterService} to a real local socket, so the tests
 * observe what a printer would receive: the bytes of an allowed print, and nothing at all for a
 * refused one.
 */
class PosHardwareControlAuthorizationTest {

    private static final long USER_ID = 42L;

    private final PosAuthFixture auth = new PosAuthFixture();

    private final PosCounterService counterService = mock(PosCounterService.class);
    private final PosScannerService scannerService = mock(PosScannerService.class);
    private final HardwareProfileService profileService = mock(HardwareProfileService.class);
    private final HardwareProfileAssignmentEngine assignmentEngine = mock(HardwareProfileAssignmentEngine.class);
    private final PosDeviceRepository deviceRepository = mock(PosDeviceRepository.class);
    private final PosTerminalRepository terminalRepository = mock(PosTerminalRepository.class);
    private final DeviceManager deviceManager = mock(DeviceManager.class);
    private final HealthService healthService = mock(HealthService.class);
    private final DiscoveryService discoveryService = mock(DiscoveryService.class);
    private final DeviceDashboardService dashboardService = mock(DeviceDashboardService.class);
    private final PosPrintJobService printJobService = mock(PosPrintJobService.class);
    private final PosPrinterRepository printerRepository = mock(PosPrinterRepository.class);
    private final PosSessionRepository sessionRepository = mock(PosSessionRepository.class);

    private PrinterSink sink;
    private PosPrinterService printerService;

    @BeforeEach
    void setUp() throws IOException {
        when(counterService.getById(10L)).thenReturn(counter(OWN));
        when(counterService.getById(20L)).thenReturn(counter(OTHER));
        when(scannerService.get(10L)).thenReturn(scanner(OWN));
        when(scannerService.get(20L)).thenReturn(scanner(OTHER));
        when(profileService.get(10L)).thenReturn(profile(OWN));
        when(profileService.get(20L)).thenReturn(profile(OTHER));
        when(profileService.get(30L)).thenReturn(profile(null));
        when(deviceRepository.findById(10L)).thenReturn(Optional.of(device(10L, OWN)));
        when(deviceRepository.findById(20L)).thenReturn(Optional.of(device(20L, OTHER)));
        when(terminalRepository.findByTerminalId("T-OWN")).thenReturn(Optional.of(terminal("T-OWN", OWN)));
        when(terminalRepository.findByTerminalId("T-OTHER")).thenReturn(Optional.of(terminal("T-OTHER", OTHER)));
        when(printJobService.get(10L)).thenReturn(job(10L, OWN, "user"));
        when(printJobService.get(11L)).thenReturn(job(11L, OWN, "someone-else"));
        when(printJobService.get(20L)).thenReturn(job(20L, OTHER, "user"));

        // A network printer per branch, both pointing at a local socket that records what it receives.
        sink = new PrinterSink();
        when(printerRepository.findByIdAndIsActiveTrue(10L)).thenReturn(Optional.of(networkPrinter(OWN, sink.port())));
        when(printerRepository.findByIdAndIsActiveTrue(20L)).thenReturn(Optional.of(networkPrinter(OTHER, sink.port())));
        PrinterNetworkPolicy loopbackForTest = new PrinterNetworkPolicy("9100-9109," + sink.port(), true, false);
        PosDrawerKickAuthorizer kickAuthorizer = new PosDrawerKickAuthorizer(
                auth.permissions, auth.branchAccess, sessionRepository, new PosSessionOwnershipService());
        printerService = new PosPrinterService(printerRepository, mock(DeviceManager.class), loopbackForTest, kickAuthorizer);
        OwnershipContextHolder.set(new OwnershipContextHolder.OwnershipContext(USER_ID, true));
    }

    @AfterEach
    void tearDown() throws IOException {
        auth.clear();
        OwnershipContextHolder.clear();
        sink.close();
    }

    // ── Counters ──────────────────────────────────────────────────────────────────────────

    @Test
    void tillCashierReadsCountersButCannotConfigureThem() {
        auth.signIn("TILL_CASHIER", OWN);

        assertDoesNotThrow(() -> counters().listActive(OWN));
        assertDoesNotThrow(() -> counters().getById(10L));
        for (Executable write : List.<Executable>of(
                () -> counters().create(Map.of("counterName", "C9")),
                () -> counters().update(10L, Map.of("counterName", "Renamed")),
                () -> counters().setStatus(10L, Map.of("status", "INACTIVE")),
                () -> counters().delete(10L))) {
            assertThrows(AccessDeniedException.class, write);
        }
        verify(counterService, never()).create(any(), any(), any(), any(), any(), any(), any(), any());
        verify(counterService, never()).update(anyLong(), any(), any(), any(), any(), any());
        verify(counterService, never()).setStatus(anyLong(), any());
        verify(counterService, never()).delete(anyLong());
    }

    @Test
    void countersOfAnotherBranchCannotBeReadOrChanged() {
        auth.signIn("BRANCH_ADMIN", OWN);

        assertForbidden(() -> counters().list(OTHER));
        assertForbidden(() -> counters().getById(20L));
        assertForbidden(() -> counters().update(20L, Map.of("counterName", "x")));
        assertForbidden(() -> counters().delete(20L));
        verify(counterService, never()).update(anyLong(), any(), any(), any(), any(), any());
        verify(counterService, never()).delete(anyLong());

        assertDoesNotThrow(() -> counters().update(10L, Map.of("counterName", "Renamed")));
        assertDoesNotThrow(() -> counters().delete(10L));
    }

    @Test
    void userWithNoTillOrCounterAccessCannotReadCounters() {
        auth.signIn("HR", OWN);
        assertThrows(AccessDeniedException.class, () -> counters().listActive(OWN));
        assertThrows(AccessDeniedException.class, () -> counters().getById(10L));
        verify(counterService, never()).listActiveForBranch(any());
    }

    // ── Scanners ──────────────────────────────────────────────────────────────────────────

    @Test
    void scannerConfigurationNeedsScannerAdministrationInTheBranch() {
        auth.signIn("TILL_CASHIER", OWN);
        assertDoesNotThrow(() -> scanners().list(OWN));
        assertThrows(AccessDeniedException.class, () -> scanners().create(scannerRequest(OWN)));
        assertThrows(AccessDeniedException.class, () -> scanners().decommission(10L));

        auth.signIn("BRANCH_ADMIN", OWN);
        assertForbidden(() -> scanners().get(20L));
        assertForbidden(() -> scanners().create(scannerRequest(OTHER)));
        assertForbidden(() -> scanners().update(20L, scannerRequest(OWN)));
        // Moving one of its own scanners into another branch is refused too.
        assertForbidden(() -> scanners().update(10L, scannerRequest(OTHER)));
        verify(scannerService, never()).create(any());
        verify(scannerService, never()).update(anyLong(), any());
        verify(scannerService, never()).decommission(anyLong());

        assertDoesNotThrow(() -> scanners().create(scannerRequest(OWN)));
        verify(scannerService).create(any());
    }

    // ── Hardware profiles ─────────────────────────────────────────────────────────────────

    @Test
    void hardwareProfilesAreAdministrationLimitedToTheCallersBranches() {
        auth.signIn("TILL_CASHIER", OWN);
        assertThrows(AccessDeniedException.class, () -> profiles().list(OWN));
        assertThrows(AccessDeniedException.class, () -> profiles().assignToTerminal(10L, "T-OWN"));

        auth.signIn("BRANCH_ADMIN", OWN);
        assertForbidden(() -> profiles().get(20L));
        assertForbidden(() -> profiles().update(20L, new HardwareProfileService.CreateRequest("P", OWN, null)));
        assertForbidden(() -> profiles().assignRole(10L, new HardwareProfileService.AssignRoleRequest("RECEIPT", 20L)));
        assertForbidden(() -> profiles().assignToTerminal(10L, "T-OTHER"));
        // A global template (no branch) is readable but only an all-branch administrator changes it.
        assertDoesNotThrow(() -> profiles().get(30L));
        assertForbidden(() -> profiles().create(new HardwareProfileService.CreateRequest("Global", null, null)));
        assertForbidden(() -> profiles().decommission(30L));

        verify(profileService, never()).create(any());
        verify(profileService, never()).update(anyLong(), any());
        verify(profileService, never()).assignDeviceToRole(anyLong(), any());
        verify(profileService, never()).decommission(anyLong());
        verifyNoInteractions(assignmentEngine);

        assertDoesNotThrow(() -> profiles().assignRole(10L, new HardwareProfileService.AssignRoleRequest("RECEIPT", 10L)));
        assertDoesNotThrow(() -> profiles().assignToTerminal(10L, "T-OWN"));

        auth.signInAsAdministrator();
        assertDoesNotThrow(() -> profiles().create(new HardwareProfileService.CreateRequest("Global", null, null)));
    }

    // ── Device registry and dashboard ─────────────────────────────────────────────────────

    @Test
    void deviceRegistryWritesUseDevicePermissionsAndBranchScope() {
        auth.signIn("TILL_CASHIER", OWN);
        assertThrows(AccessDeniedException.class, () -> devices().register(registerRequest(OWN)));
        assertThrows(AccessDeniedException.class, () -> devices().list(null, null));
        assertDoesNotThrow(() -> devices().heartbeat(10L));
        assertForbidden(() -> devices().heartbeat(20L));

        auth.signIn("BRANCH_ADMIN", OWN);
        assertForbidden(() -> devices().register(registerRequest(OTHER)));
        assertForbidden(() -> devices().update(20L, registerRequest(OWN)));
        assertForbidden(() -> devices().update(10L, registerRequest(OTHER)));
        assertForbidden(() -> devices().updateStatus(20L, Map.of("status", "INACTIVE")));
        assertForbidden(() -> devices().delete(20L));
        verify(deviceRepository, times(1)).save(any()); // only the till heartbeat above

        when(deviceRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        assertDoesNotThrow(() -> devices().register(registerRequest(OWN)));
        verify(deviceRepository, times(2)).save(any());
    }

    @Test
    void deviceListWithoutABranchShowsOnlyReachableBranches() {
        when(deviceRepository.findAll()).thenReturn(List.of(device(10L, OWN), device(20L, OTHER)));

        auth.signIn("BRANCH_ADMIN", OWN);
        assertEquals(List.of(10L), devices().list(null, null).stream().map(PosDevice::getId).toList());

        auth.signInAsAdministrator();
        assertEquals(2, devices().list(null, null).size());
    }

    @Test
    void deviceDashboardHealthAndDiscoveryNeedDeviceAdministration() {
        auth.signIn("TILL_CASHIER", OWN);
        assertThrows(AccessDeniedException.class, () -> deviceManagerApi().overview(OWN));
        assertThrows(AccessDeniedException.class, () -> deviceManagerApi().reportHealth(10L, health()));
        assertThrows(AccessDeniedException.class, () -> deviceManagerApi().reportDiscoveredDevice("agent",
                new DiscoveryService.CandidateRequest(null, "USB\\VID_04B8", null)));

        auth.signIn("BRANCH_ADMIN", OWN);
        assertForbidden(() -> deviceManagerApi().overview(OTHER));
        assertForbidden(() -> deviceManagerApi().events(20L));
        assertForbidden(() -> deviceManagerApi().reportHealth(20L, health()));
        verifyNoInteractions(healthService, discoveryService, dashboardService);

        assertDoesNotThrow(() -> deviceManagerApi().reportHealth(10L, health()));
        verify(healthService).recordSnapshot(eq(10L), any());
    }

    // ── Print jobs ────────────────────────────────────────────────────────────────────────

    @Test
    void printJobsStayInsideTheCallersBranches() {
        auth.signIn("SALES", OWN);

        assertForbidden(() -> printJobs().create(jobRequest(20L)));
        assertForbidden(() -> printJobs().get(20L));
        assertForbidden(() -> printJobs().dispatch(20L));
        assertForbidden(() -> printJobs().result(20L, new PosPrintJobService.ResultRequest(true, null)));
        verify(printJobService, never()).enqueue(any());
        verify(printJobService, never()).dispatch(anyLong());
        verify(printJobService, never()).reportResult(anyLong(), any());

        // Recording its own print keeps working: this is the receipt-print bookkeeping.
        assertDoesNotThrow(() -> printJobs().create(jobRequest(10L)));
        assertDoesNotThrow(() -> printJobs().dispatch(10L));
        assertDoesNotThrow(() -> printJobs().result(10L, new PosPrintJobService.ResultRequest(true, null)));
    }

    @Test
    void anotherUsersPrintJobCannotBeClaimedOrReportedWithoutPrinterAdministration() {
        auth.signIn("SALES", OWN);
        assertThrows(AccessDeniedException.class, () -> printJobs().dispatch(11L));
        assertThrows(AccessDeniedException.class,
                () -> printJobs().result(11L, new PosPrintJobService.ResultRequest(false, "jam")));
        assertThrows(AccessDeniedException.class, () -> printJobs().retry(10L));
        verify(printJobService, never()).dispatch(anyLong());
        verify(printJobService, never()).reportResult(anyLong(), any());
        verify(printJobService, never()).retry(anyLong());

        auth.signIn("BRANCH_ADMIN", OWN);
        assertDoesNotThrow(() -> printJobs().dispatch(11L));
        assertDoesNotThrow(() -> printJobs().retry(10L));
    }

    @Test
    void theQueueListingIsPrinterAdministrationAndFilteredByBranch() {
        when(printJobService.listQueued(isNull(), isNull()))
                .thenReturn(List.of(job(10L, OWN, "user"), job(20L, OTHER, "user")));

        auth.signIn("TILL_CASHIER", OWN);
        assertThrows(AccessDeniedException.class, () -> printJobs().listQueued(null, null, "QUEUED"));

        auth.signIn("BRANCH_ADMIN", OWN);
        assertForbidden(() -> printJobs().listQueued(OTHER, null, "QUEUED"));
        assertEquals(List.of(10L), printJobs().listQueued(null, null, "QUEUED").stream().map(PosPrintJob::getId).toList());
    }

    // ── Server-relayed printing and the cash drawer ───────────────────────────────────────

    @Test
    void ordinaryPrintsStillReachThePrinterForAnyUserOfTheBranch() throws Exception {
        // A Retail invoice clerk: no till, no POS administration.
        auth.signIn("INVOICE_CLERK", OWN);
        byte[] receipt = receiptWithLogoAndQr();

        printerService.printEscPos(10L, Base64.getEncoder().encodeToString(receipt));

        assertArrayEquals(receipt, sink.awaitOne());
    }

    @Test
    void aCraftedDrawerPulseFromARetailUserIsRefusedAndNothingIsSent() throws Exception {
        auth.signIn("INVOICE_CLERK", OWN);

        assertThrows(AccessDeniedException.class, () -> printerService.printEscPos(10L, b64(escPosKick())));
        assertThrows(AccessDeniedException.class, () -> printerService.printEscPos(10L, b64(realtimeKick())));

        sink.assertNothingReceived();
    }

    @Test
    void aTillUserWithNoOpenShiftCannotOpenTheDrawer() throws Exception {
        auth.signIn("TILL_CASHIER", OWN);
        when(sessionRepository.findByOwnerUserIdAndBranchIdAndStatus(USER_ID, OWN, PosSessionStatus.OPEN))
                .thenReturn(List.of());

        assertForbidden(() -> printerService.printEscPos(10L, b64(escPosKick())));
        sink.assertNothingReceived();
    }

    @Test
    void aCashierOnShiftOpensTheDrawerOnTheirOwnBranchPrinterOnly() throws Exception {
        auth.signIn("TILL_CASHIER", OWN);
        when(sessionRepository.findByOwnerUserIdAndBranchIdAndStatus(USER_ID, OWN, PosSessionStatus.OPEN))
                .thenReturn(List.of(new PosSession()));

        byte[] kick = escPosKick();
        printerService.printEscPos(10L, b64(kick));
        assertArrayEquals(kick, sink.awaitOne());

        // The other branch's printer is refused before its socket is opened.
        assertForbidden(() -> printerController().printEscPos(20L, new PosPrinterController.PrintEscPosRequest(b64(kick))));
        sink.assertNothingReceived();
    }

    @Test
    void aDirectApiCallWithADrawerPulseGetsHttp403() throws Exception {
        MockMvc mvc = MockMvcBuilders.standaloneSetup(printerController())
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();
        auth.signIn("SALES", OWN); // till access, but no open session

        mvc.perform(post("/api/pos/printers/10/print/escpos").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"dataBase64\":\"" + b64(escPosKick()) + "\"}"))
                .andExpect(status().isForbidden());
        sink.assertNothingReceived();

        mvc.perform(post("/api/pos/printers/10/print/escpos").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"dataBase64\":\"" + b64(receiptWithLogoAndQr()) + "\"}"))
                .andExpect(status().isOk());
        assertNotNull(sink.awaitOne());
    }

    // ── Command policy on the server-relayed path ─────────────────────────────────────────

    @Test
    void prohibitedEscPosCommandsAreRefusedBeforeTheSocketOpensEvenForACashierOnShift() throws Exception {
        auth.signIn("TILL_CASHIER", OWN);
        when(sessionRepository.findByOwnerUserIdAndBranchIdAndStatus(USER_ID, OWN, PosSessionStatus.OPEN))
                .thenReturn(List.of(new PosSession()));
        byte[] receipt = receiptWithLogoAndQr();
        byte[][] refused = {
                {0x1B, 0x42, 3, 2},                               // buzzer
                {0x10, 0x14, 2, 1, 8},                            // power off
                {0x1D, 0x28, 0x45, 3, 0, 1, 73, 78},              // user setup (NV)
                {0x1D, 0x28, 0x4C, 6, 0, 48, 67, 48, 32, 32, 1},  // NV graphics define
                {0x1D, 0x3A},                                     // unknown
                {0x1B},                                           // truncated
        };
        for (byte[] tail : refused) {
            // A drawer pulse in front does not buy the rest a pass.
            byte[] job = concat(receipt, escPosKick(), tail);
            com.billbull.backend.pos.printer.PrintCommandRejectedException e = assertThrows(
                    com.billbull.backend.pos.printer.PrintCommandRejectedException.class,
                    () -> printerService.printEscPos(10L, b64(job)));
            assertTrue(e.getMessage().endsWith("Nothing was sent to the printer."), e.getMessage());
        }
        sink.assertNothingReceived();
    }

    @Test
    void aRefusedJobIsAStructured422AndWritesNothing() throws Exception {
        MockMvc mvc = MockMvcBuilders.standaloneSetup(printerController())
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();
        auth.signIn("INVOICE_CLERK", OWN);

        mvc.perform(post("/api/pos/printers/10/print/escpos").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"dataBase64\":\"" + b64(concat(receiptWithLogoAndQr(), new byte[]{0x10, 0x14, 2, 1, 8})) + "\"}"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("PRINT_COMMAND_REJECTED"))
                .andExpect(jsonPath("$.protocol").value("ESCPOS"))
                .andExpect(jsonPath("$.category").value("POWER"))
                .andExpect(jsonPath("$.command").value("DLE DC4 2"))
                .andExpect(jsonPath("$.offset").isNumber());
        sink.assertNothingReceived();
    }

    @Test
    void aLabelPrinterTakesBillBullLabelsOnlyChosenByItsTypeNotTheRequest() throws Exception {
        PosPrinter label = networkPrinter(OWN, sink.port());
        label.setDeviceType(PosPrinterType.LABEL_PRINTER);
        when(printerRepository.findByIdAndIsActiveTrue(30L)).thenReturn(Optional.of(label));
        auth.signIn("INVOICE_CLERK", OWN);
        byte[] zpl = ("^XA\n^CI28\n^PW400\n^LL200\n^FO16,16^FB368,1,0,C,0^A0N,22,22^FH^FDACME_5E^FS\n"
                + "^BY2,2,50\n^FO40,86^BCN,50,Y,N,N^FH^FDBB-1^FS\n^XZ").getBytes(java.nio.charset.StandardCharsets.UTF_8);

        printerService.printRaw(30L, b64(zpl), "ZPL");
        assertArrayEquals(zpl, sink.awaitOne());
        printerService.printEscPos(30L, b64(zpl)); // an older client that sends no format
        assertArrayEquals(zpl, sink.awaitOne());

        Class<com.billbull.backend.pos.printer.PrintCommandRejectedException> rejected =
                com.billbull.backend.pos.printer.PrintCommandRejectedException.class;
        assertThrows(rejected, () -> printerService.printRaw(30L, b64(concat(zpl, "~JR".getBytes())), "ZPL"));
        assertThrows(rejected, () -> printerService.printRaw(30L, b64(new String(zpl).replace("^XZ", "^JUF^XZ").getBytes()), "ZPL"));
        assertThrows(rejected, () -> printerService.printRaw(30L, b64(new String(zpl).replace("^XZ", "^NS,10.0.0.9^XZ").getBytes()), null));
        // Claiming the label is ESC/POS does not switch the policy, nor does sending a receipt.
        assertThrows(rejected, () -> printerService.printRaw(30L, b64("^XA^JUF^XZ".getBytes()), "ESCPOS"));
        assertThrows(rejected, () -> printerService.printRaw(30L, b64(receiptWithLogoAndQr()), null));
        // ...and a label job cannot be pushed through a receipt printer.
        assertThrows(rejected, () -> printerService.printRaw(10L, b64(zpl), "ZPL"));
        assertThrows(ResponseStatusException.class, () -> printerService.printRaw(10L, b64(receiptWithLogoAndQr()), "PDF"));
        sink.assertNothingReceived();
    }

    @Test
    void zplHiddenInAReceiptRasterCannotReachALabelPrinter() throws Exception {
        PosPrinter label = networkPrinter(OWN, sink.port());
        label.setDeviceType(PosPrinterType.LABEL_PRINTER);
        when(printerRepository.findByIdAndIsActiveTrue(30L)).thenReturn(Optional.of(label));
        auth.signIn("INVOICE_CLERK", OWN);
        // A logo whose raster spells a factory-reset label: image data to a receipt printer, a
        // label to a Zebra. The label printer's own type picks the ZPL policy, which refuses it.
        byte[] hostile = "^XA^JUF^XZ~JR^XA^IDE:*.*^XZ".getBytes(java.nio.charset.StandardCharsets.US_ASCII);
        byte[] raster = new byte[44 * 2];
        System.arraycopy(hostile, 0, raster, 0, hostile.length);
        byte[] job = concat(new byte[]{0x1B, 0x40, 0x1D, 0x76, 0x30, 0, 44, 0, 2, 0}, raster, "\n".getBytes());

        Class<com.billbull.backend.pos.printer.PrintCommandRejectedException> rejected =
                com.billbull.backend.pos.printer.PrintCommandRejectedException.class;
        com.billbull.backend.pos.printer.PrintCommandRejectedException mismatch =
                assertThrows(rejected, () -> printerService.printRaw(30L, b64(job), "ESCPOS"));
        assertTrue(mismatch.getMessage().contains("label printer (ZPL)"), mismatch.getMessage());
        assertThrows(rejected, () -> printerService.printRaw(30L, b64(job), null));
        sink.assertNothingReceived();

        // On a receipt printer the same bytes are a logo.
        printerService.printEscPos(10L, b64(job));
        assertArrayEquals(job, sink.awaitOne());
    }

    @Test
    void receiptTextWithCaretsAndTildesPrintsOnAReceiptPrinter() throws Exception {
        auth.signIn("INVOICE_CLERK", OWN);
        byte[] job = concat(receiptWithLogoAndQr(),
                "Gift Box~Deluxe     1 x 45.00\nTea ~JR blend ^XA edition\nx^2 ~ approx 50%~60%\n"
                        .getBytes(java.nio.charset.StandardCharsets.US_ASCII),
                new byte[]{0x1D, 0x56, 66, 0});

        printerService.printRaw(10L, b64(job), "ESCPOS");
        assertArrayEquals(job, sink.awaitOne());
        printerService.printEscPos(10L, b64(job));
        assertArrayEquals(job, sink.awaitOne());
    }

    @Test
    void theServerOnlyDialsPrivateLanPrintersOnPrinterPorts() {
        PrinterNetworkPolicy policy = PrinterNetworkPolicy.defaults();

        assertDoesNotThrow(() -> policy.validateConfigured("192.168.1.50", 9100));
        assertDoesNotThrow(() -> policy.validateConfigured("10.20.0.7", 9101));
        assertDoesNotThrow(() -> policy.validateConfigured("172.16.4.2", 9100));
        assertDoesNotThrow(() -> policy.validateConfigured("100.64.3.9", 9100)); // VPN overlay
        assertDoesNotThrow(() -> policy.validateConfigured("fd00::25", 9100));

        for (Object[] refused : new Object[][]{
                {"127.0.0.1", 9100}, {"localhost", 9100}, {"::1", 9100},  // the server itself
                {"169.254.169.254", 9100}, {"169.254.169.254", 80},        // cloud metadata
                {"8.8.8.8", 9100},                                         // public internet
                {"192.168.1.50", 5432}, {"10.0.0.5", 6379}, {"10.0.0.5", 22}, // LAN services
                {"0.0.0.0", 9100}, {"224.0.0.1", 9100}}) {
            ResponseStatusException e = assertThrows(ResponseStatusException.class,
                    () -> policy.validateConfigured((String) refused[0], (Integer) refused[1]),
                    refused[0] + ":" + refused[1]);
            assertEquals(HttpStatus.BAD_REQUEST, e.getStatusCode());
        }
    }

    @Test
    void aPrinterCannotBeSavedOrUsedWithANonPrinterAddress() throws Exception {
        PosPrinterService strict = new PosPrinterService(printerRepository, mock(DeviceManager.class),
                PrinterNetworkPolicy.defaults(), mock(PosDrawerKickAuthorizer.class));

        assertTrue(assertThrows(ResponseStatusException.class,
                () -> strict.create(networkPrinterRequest("169.254.169.254", 9100))).getReason().contains("not a private LAN"));
        assertTrue(assertThrows(ResponseStatusException.class,
                () -> strict.create(networkPrinterRequest("10.0.0.5", 5432))).getReason().contains("not a permitted printer port"));
        verify(printerRepository, never()).save(any());

        // A row stored before this check (here: loopback) is refused at print time, nothing sent.
        auth.signIn("BRANCH_ADMIN", OWN);
        assertThrows(ResponseStatusException.class, () -> strict.printEscPos(10L, b64(receiptWithLogoAndQr())));
        sink.assertNothingReceived();
    }

    // ── Helpers ───────────────────────────────────────────────────────────────────────────

    private PosCounterController counters() {
        return new PosCounterController(counterService, auth.branchAccess, auth.permissions);
    }

    private PosScannerController scanners() {
        return new PosScannerController(scannerService, auth.permissions, auth.branchAccess);
    }

    private HardwareProfileController profiles() {
        return new HardwareProfileController(profileService, assignmentEngine, auth.permissions, auth.branchAccess,
                deviceRepository, terminalRepository);
    }

    private PosDeviceController devices() {
        return new PosDeviceController(deviceRepository, auth.permissions, auth.branchAccess);
    }

    private DeviceManagerController deviceManagerApi() {
        return new DeviceManagerController(deviceManager, healthService, discoveryService, dashboardService,
                mock(DashboardRefreshSignal.class), auth.permissions, auth.branchAccess, deviceRepository);
    }

    private PosPrintJobController printJobs() {
        return new PosPrintJobController(printJobService, printerService, auth.permissions, auth.branchAccess);
    }

    private PosPrinterController printerController() {
        return new PosPrinterController(printerService, auth.permissions, auth.branchAccess);
    }

    private static String b64(byte[] data) {
        return Base64.getEncoder().encodeToString(data);
    }

    private static byte[] concat(byte[]... parts) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        for (byte[] p : parts) out.writeBytes(p);
        return out.toByteArray();
    }

    /** ESC @, text, a raster logo and a QR code whose data both contain ESC p, then a cut. */
    static byte[] receiptWithLogoAndQr() {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        out.writeBytes(new byte[]{0x1B, 0x40});
        out.writeBytes("TOTAL AED 10.00\n".getBytes());
        // GS v 0 m xL xH yL yH: 2 bytes wide, 2 rows = 4 data bytes, which spell ESC p 0 25.
        out.writeBytes(new byte[]{0x1D, 0x76, 0x30, 0x00, 0x02, 0x00, 0x02, 0x00, 0x1B, 0x70, 0x00, 0x19});
        // GS ( k pL pH: 5 bytes of QR data that contain ESC p.
        out.writeBytes(new byte[]{0x1D, 0x28, 0x6B, 0x05, 0x00, 0x31, 0x50, 0x30, 0x1B, 0x70});
        out.writeBytes(new byte[]{0x1D, 0x56, 66, 0x00});
        return out.toByteArray();
    }

    /** ESC p 0 25 250: pulse drawer pin 2. */
    static byte[] escPosKick() {
        return new byte[]{0x1B, 0x40, 'x', 0x1B, 0x70, 0x00, 0x19, (byte) 0xFA};
    }

    /** DLE DC4 1 0 1: the real-time pulse. */
    static byte[] realtimeKick() {
        return new byte[]{0x10, 0x14, 0x01, 0x00, 0x01};
    }

    private static PosCounter counter(long branch) {
        PosCounter c = new PosCounter();
        c.setBranchId(branch);
        return c;
    }

    private static PosScanner scanner(long branch) {
        PosScanner s = new PosScanner();
        s.setBranchId(branch);
        return s;
    }

    private static PosHardwareProfile profile(Long branch) {
        PosHardwareProfile p = new PosHardwareProfile();
        p.setBranchId(branch);
        return p;
    }

    private static PosDevice device(long id, long branch) {
        PosDevice d = new PosDevice();
        d.setId(id);
        d.setBranchId(branch);
        return d;
    }

    private static PosTerminal terminal(String terminalId, long branch) {
        PosTerminal t = new PosTerminal();
        t.setTerminalId(terminalId);
        t.setBranchId(branch);
        return t;
    }

    private static PosPrintJob job(long id, long branch, String requestedBy) {
        PosPrintJob j = new PosPrintJob();
        j.setId(id);
        j.setBranchId(branch);
        j.setRequestedBy(requestedBy);
        return j;
    }

    private static PosPrinter networkPrinter(long branch, int port) {
        PosPrinter p = new PosPrinter();
        p.setBranchId(branch);
        p.setConnectionType(PosPrinterConnectionType.NETWORK_IP);
        p.setIpAddress("127.0.0.1");
        p.setPortNumber(port);
        return p;
    }

    private static PosScannerService.UpsertRequest scannerRequest(long branch) {
        return new PosScannerService.UpsertRequest("SCN-1", "Scanner", branch, null, null, null, null, null, null);
    }

    private static PosDeviceController.RegisterRequest registerRequest(long branch) {
        return new PosDeviceController.RegisterRequest("DEV-1", "Device", branch, null, null, null);
    }

    private static HealthService.SnapshotRequest health() {
        return new HealthService.SnapshotRequest(null, "OK", null, null, null, false, 0);
    }

    private static PosPrintJobService.CreateRequest jobRequest(long printerId) {
        return new PosPrintJobService.CreateRequest(printerId, PrintJobType.RECEIPT, null, null, null,
                "receipt text", null, null);
    }

    private static PosPrinterService.UpsertRequest networkPrinterRequest(String ip, int port) {
        return new PosPrinterService.UpsertRequest("PRN-9", com.billbull.backend.pos.printer.PosPrinterType.RECEIPT_PRINTER,
                "Printer", null, OWN, null, null, null, null, PosPrinterConnectionType.NETWORK_IP, null, null,
                ip, port, null, null, null, null, null);
    }

    /** A local stand-in for a network printer: records every connection's bytes. */
    static final class PrinterSink implements AutoCloseable {
        private final ServerSocket server = new ServerSocket(0, 10, InetAddress.getLoopbackAddress());
        private final List<byte[]> received = new CopyOnWriteArrayList<>();
        private final Thread acceptor;

        PrinterSink() throws IOException {
            acceptor = new Thread(() -> {
                while (!server.isClosed()) {
                    try (Socket client = server.accept(); InputStream in = client.getInputStream()) {
                        received.add(in.readAllBytes());
                    } catch (IOException closed) {
                        return;
                    }
                }
            }, "printer-sink");
            acceptor.setDaemon(true);
            acceptor.start();
        }

        int port() {
            return server.getLocalPort();
        }

        byte[] awaitOne() throws InterruptedException {
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
            while (received.isEmpty() && System.nanoTime() < deadline) {
                Thread.sleep(10);
            }
            assertEquals(1, received.size(), "the printer should have received exactly one job");
            return received.remove(0);
        }

        void assertNothingReceived() throws InterruptedException {
            Thread.sleep(300);
            assertTrue(received.isEmpty(), "the printer must not receive anything");
        }

        @Override
        public void close() throws IOException {
            server.close();
        }
    }
}
