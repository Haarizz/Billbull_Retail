package com.billbull.backend.sales.delivery;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.atLeast;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.lang.reflect.Constructor;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import com.billbull.backend.financials.generalledger.postingengine.PostingEngineService;
import com.billbull.backend.inventory.product.PackingConversions;
import com.billbull.backend.inventory.product.Product;
import com.billbull.backend.inventory.product.ProductPacking;
import com.billbull.backend.inventory.product.ProductPackingRepository;
import com.billbull.backend.inventory.units.Unit;
import com.billbull.backend.inventory.warehouse.Warehouse;
import com.billbull.backend.purchase.stockmovement.StockMovementService;
import com.billbull.backend.sales.invoice.DeliveryStatus;
import com.billbull.backend.sales.invoice.SalesInvoice;
import com.billbull.backend.sales.invoice.SalesInvoiceItem;
import com.billbull.backend.sales.settings.SalesSettings;
import com.billbull.backend.sales.settings.SalesSettingsService;

/**
 * Revenue / COGS recognition, inventory consumption and invoice-line cost when a delivery note
 * is delivered, cancelled or linked — driven through the PUBLIC {@link DeliveryNoteService}
 * entry points ({@code markDelivered}, {@code cancel}, {@code linkDeliveryNotesToInvoice}) with
 * mocked repositories and the real recognition code.
 *
 * <p>Quantity and cost conventions under test: stock, consumption rows and COGS are in BASE units
 * (paid + free); invoice-line {@code cost} is per BASE unit; revenue follows paid base units.
 *
 * <p>What this does not prove: persistence (JPA flushing, the real repositories) and the GL
 * posting engine itself, which is mocked here — its inputs are asserted instead.
 */
class DeliveryNoteRecognitionTest {

    private static final long PRODUCT_ID = 77L;
    private static final String CODE = "A";
    private static final String INVOICE_NO = "INV-500";

    private final Map<Class<?>, Object> mocks = new HashMap<>();
    private DeliveryNoteService service;
    private DeliveryNoteRepository repo;
    private StockMovementService stock;
    private PostingEngineService posting;
    private DeliveryNoteBatchConsumptionRepository consumptions;
    private ProductPackingRepository packings;
    private final List<DeliveryNote> postedForInvoice = new ArrayList<>();

    @BeforeEach
    void setUp() throws Exception {
        Constructor<?> ctor = DeliveryNoteService.class.getConstructors()[0];
        Object[] args = new Object[ctor.getParameterCount()];
        Class<?>[] types = ctor.getParameterTypes();
        for (int i = 0; i < types.length; i++) {
            Object m = mock(types[i]);
            mocks.put(types[i], m);
            args[i] = m;
        }
        service = (DeliveryNoteService) ctor.newInstance(args);
        repo = (DeliveryNoteRepository) mocks.get(DeliveryNoteRepository.class);
        stock = (StockMovementService) mocks.get(StockMovementService.class);
        posting = (PostingEngineService) mocks.get(PostingEngineService.class);
        consumptions = (DeliveryNoteBatchConsumptionRepository) mocks.get(DeliveryNoteBatchConsumptionRepository.class);
        packings = (ProductPackingRepository) mocks.get(ProductPackingRepository.class);

        when(((SalesSettingsService) mocks.get(SalesSettingsService.class)).getSettings()).thenReturn(new SalesSettings());
        // Stock deduction runs (non-batch, stock check off), so the issued quantity is observable.
        when(((com.billbull.backend.sales.stockstrategy.StockDeductionStrategyService)
                mocks.get(com.billbull.backend.sales.stockstrategy.StockDeductionStrategyService.class))
                .canDeliveryNoteDeductStock()).thenReturn(true);
        when(repo.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(repo.findByLinkedInvoiceNumber(INVOICE_NO)).thenAnswer(inv -> new ArrayList<>(postedForInvoice));
        when(packings.findByProductId(anyLong())).thenReturn(List.of());
        wac("40");
    }

    // ── fixtures ────────────────────────────────────────────────────────────

    private void wac(String cost) {
        when(stock.getCostForOutbound(anyLong(), anyLong(), any())).thenReturn(new BigDecimal(cost));
    }

    private void boxOf12() {
        ProductPacking box = new ProductPacking();
        Unit unit = mock(Unit.class);
        when(unit.getName()).thenReturn("BOX");
        box.setUnit(unit);
        box.setConversion(new BigDecimal("12"));
        when(packings.findByProductId(anyLong())).thenReturn(List.of(box));
    }

    private static Product product() {
        Product p = new Product();
        p.setId(PRODUCT_ID);
        p.setCode(CODE);
        return p;
    }

    private static SalesInvoiceItem line(long id, int qty, int foc, String net, String unit) {
        SalesInvoiceItem l = new SalesInvoiceItem();
        l.setId(id);
        l.setItemCode(CODE);
        l.setQuantity(qty);
        l.setFoc(foc);
        l.setNetAmount(new BigDecimal(net));
        l.setUnit(unit);
        return l;
    }

    private static SalesInvoice invoice(SalesInvoiceItem... lines) {
        SalesInvoice inv = new SalesInvoice();
        inv.setId(500L);
        inv.setInvoiceNumber(INVOICE_NO);
        inv.setItems(new ArrayList<>(Arrays.asList(lines)));
        inv.setDeliveryStatus(DeliveryStatus.PENDING);
        return inv;
    }

    private static DeliveryNoteItem dnLine(long id, Long sourceLineId, int qty, int foc, String unit) {
        DeliveryNoteItem d = new DeliveryNoteItem();
        d.setId(id);
        d.setProduct(product());
        d.setItemCode(CODE);
        d.setCurrentQty(qty);
        d.setFoc(foc);
        d.setUnit(unit);
        d.setSourceLineId(sourceLineId);
        return d;
    }

    /** A DISPATCHED DN linked to {@code inv}; {@code ownDn} = generated from this invoice. */
    private DeliveryNote dispatched(long id, SalesInvoice inv, boolean ownDn, DeliveryNoteItem... items) {
        DeliveryNote dn = new DeliveryNote();
        dn.setId(id);
        dn.setDnNumber("DN-" + id);
        dn.setStatus(DeliveryNoteStatus.DISPATCHED);
        dn.setLinkedSalesInvoice(inv);
        dn.setSourceDocumentType(ownDn ? "SALES_INVOICE" : "SALES_ORDER");
        dn.setSourceDocumentId(ownDn ? inv.getId() : 9L);
        Warehouse wh = new Warehouse();
        wh.setId(1L);
        dn.setWarehouse(wh);
        for (DeliveryNoteItem it : items) {
            it.setDeliveryNote(dn);
            dn.getItems().add(it);
        }
        when(repo.findById(id)).thenReturn(Optional.of(dn));
        return dn;
    }

    /** Delivers the DN and records it as posted history for the next delivery. */
    private Journal deliver(DeliveryNote dn) {
        service.markDelivered(dn.getId(), "tester");
        postedForInvoice.add(dn);
        return journalOf(dn);
    }

    record Journal(BigDecimal revenue, BigDecimal cogs) {}

    private Journal journalOf(DeliveryNote dn) {
        ArgumentCaptor<BigDecimal> rev = ArgumentCaptor.forClass(BigDecimal.class);
        ArgumentCaptor<BigDecimal> cogs = ArgumentCaptor.forClass(BigDecimal.class);
        verify(posting, atLeast(0)).createJournalFromDeliveryNoteDelivered(
                eq("DN-" + dn.getDnNumber()), any(), anyString(), rev.capture(), cogs.capture(), any());
        if (rev.getAllValues().isEmpty()) return new Journal(BigDecimal.ZERO, BigDecimal.ZERO);
        return new Journal(rev.getValue(), cogs.getValue());
    }

    private List<DeliveryNoteBatchConsumption> consumptionRows() {
        ArgumentCaptor<DeliveryNoteBatchConsumption> c = ArgumentCaptor.forClass(DeliveryNoteBatchConsumption.class);
        verify(consumptions, atLeast(0)).save(c.capture());
        return c.getAllValues();
    }

    private List<Integer> stockIssued() {
        ArgumentCaptor<Integer> qty = ArgumentCaptor.forClass(Integer.class);
        verify(stock, atLeast(0)).postOutboundStock(any(), any(), any(), any(), any(), any(), any(),
                any(), any(), qty.capture(), any(), anyBoolean());
        return qty.getAllValues();
    }

    private static void money(String expected, BigDecimal actual, String what) {
        assertEquals(0, new BigDecimal(expected).compareTo(actual), what + ": expected " + expected + " but was " + actual);
    }

    private static BigDecimal sum(List<BigDecimal> values) {
        return values.stream().reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    // ── 1. same code, different prices ──────────────────────────────────────

    @Test
    void twoSerialUnitsOfOneProductAtDifferentPricesAreRecognisedOnTheirOwnLines() {
        SalesInvoiceItem first = line(1, 1, 0, "100", "PCS");
        SalesInvoiceItem second = line(2, 1, 0, "120", "PCS");
        SalesInvoice inv = invoice(first, second);
        // Delivered in reverse order: the line identity, not the position, decides.
        DeliveryNote dn = dispatched(900, inv, true, dnLine(11, 2L, 1, 0, "PCS"), dnLine(12, 1L, 1, 0, "PCS"));

        Journal j = deliver(dn);

        money("220", j.revenue(), "revenue journal");          // was 100.00: line 2 never recognised
        money("80", j.cogs(), "COGS journal");
        money("100", first.getRecognizedRevenue(), "line 1 revenue");
        money("120", second.getRecognizedRevenue(), "line 2 revenue");
        money("40", first.getRecognizedCogs(), "line 1 COGS");
        money("40", second.getRecognizedCogs(), "line 2 COGS");    // was 0
        money("40", first.getCost(), "line 1 cost");
        money("40", second.getCost(), "line 2 cost");
        assertEquals(DeliveryStatus.DELIVERED, inv.getDeliveryStatus());
    }

    // ── 2. same code, quantities 1 and 3, both orders ───────────────────────

    @Test
    void repeatedLinesWithQuantitiesOneThenThreeAreEachFullyRecognised() {
        SalesInvoiceItem one = line(1, 1, 0, "100", "PCS");
        SalesInvoiceItem three = line(2, 3, 0, "300", "PCS");
        SalesInvoice inv = invoice(one, three);
        Journal j = deliver(dispatched(900, inv, true, dnLine(11, 1L, 1, 0, "PCS"), dnLine(12, 2L, 3, 0, "PCS")));

        money("400", j.revenue(), "revenue journal");          // was 100.00
        money("160", j.cogs(), "COGS journal");
        money("100", one.getRecognizedRevenue(), "qty-1 line");
        money("300", three.getRecognizedRevenue(), "qty-3 line");
        money("40", one.getRecognizedCogs(), "qty-1 COGS");
        money("120", three.getRecognizedCogs(), "qty-3 COGS");
        assertEquals(DeliveryStatus.DELIVERED, inv.getDeliveryStatus());
    }

    @Test
    void repeatedLinesWithQuantitiesThreeThenOneAreEachFullyRecognised() {
        SalesInvoiceItem three = line(1, 3, 0, "300", "PCS");
        SalesInvoiceItem one = line(2, 1, 0, "100", "PCS");
        SalesInvoice inv = invoice(three, one);
        Journal j = deliver(dispatched(900, inv, true, dnLine(11, 1L, 3, 0, "PCS"), dnLine(12, 2L, 1, 0, "PCS")));

        money("400", j.revenue(), "revenue journal");          // was 300.00
        money("300", three.getRecognizedRevenue(), "qty-3 line");
        money("100", one.getRecognizedRevenue(), "qty-1 line");
        money("120", three.getRecognizedCogs(), "qty-3 COGS");
        money("40", one.getRecognizedCogs(), "qty-1 COGS");
    }

    // ── 3 + 10. box and pieces; every figure agrees ─────────────────────────

    @Test
    void aBoxAndLoosePiecesOfOneProductReconcileAcrossLinesConsumptionJournalAndReportCost() {
        boxOf12();
        wac("10");
        SalesInvoiceItem box = line(1, 1, 0, "120", "BOX");
        SalesInvoiceItem pieces = line(2, 2, 0, "20", "PCS");
        SalesInvoice inv = invoice(box, pieces);
        DeliveryNote dn = dispatched(900, inv, true, dnLine(11, 1L, 1, 0, "BOX"), dnLine(12, 2L, 2, 0, "PCS"));

        Journal j = deliver(dn);

        money("140", j.revenue(), "revenue journal");          // was 120
        money("140", j.cogs(), "COGS journal");
        money("120", box.getRecognizedRevenue(), "box revenue");
        money("20", pieces.getRecognizedRevenue(), "pieces revenue");
        money("120", box.getRecognizedCogs(), "box COGS (12 base units)");
        money("20", pieces.getRecognizedCogs(), "pieces COGS");
        // cost is per BASE unit on both lines
        money("10", box.getCost(), "box line cost per base unit");
        money("10", pieces.getCost(), "pieces line cost per base unit");

        // Stock issue, consumption rows and the journal all count the same 14 base units.
        assertEquals(List.of(12, 2), stockIssued());
        List<DeliveryNoteBatchConsumption> rows = consumptionRows();
        assertEquals(List.of(12, 2), rows.stream().map(DeliveryNoteBatchConsumption::getQuantity).toList());
        money("140", sum(rows.stream().map(DeliveryNoteBatchConsumption::getTotalCost).toList()), "consumption total"); // was 30

        // Margin-report cost: cost (per base unit) × base quantity, with the reports' converter.
        PackingConversions conv = PackingConversions.of(List.<Object[]>of(new Object[] { CODE, "BOX", new BigDecimal("12") }));
        BigDecimal reportCost = box.getCost().multiply(BigDecimal.valueOf(conv.baseQty(CODE, "BOX", 1)))
                .add(pieces.getCost().multiply(BigDecimal.valueOf(conv.baseQty(CODE, "PCS", 2))));
        money("140", reportCost, "report cost");
        money(j.cogs().toPlainString(), box.getRecognizedCogs().add(pieces.getRecognizedCogs()), "Σ line COGS = journal");
    }

    // ── 4 + 5. partial box deliveries ───────────────────────────────────────

    @Test
    void oneOfTwoBoxesRecognisesHalfAndLeavesTheInvoiceOpen() {
        boxOf12();
        wac("10");
        SalesInvoiceItem boxes = line(1, 2, 0, "240", "BOX");
        SalesInvoice inv = invoice(boxes);

        Journal j = deliver(dispatched(900, inv, true, dnLine(11, 1L, 1, 0, "BOX")));

        money("120", j.revenue(), "revenue journal");          // was 240
        money("120", j.cogs(), "COGS journal");
        money("120", boxes.getRecognizedRevenue(), "line revenue");
        money("120", boxes.getRecognizedCogs(), "line COGS");
        assertEquals(DeliveryStatus.PENDING, inv.getDeliveryStatus()); // was DELIVERED
        assertEquals(List.of(12), stockIssued());
    }

    @Test
    void severalPartialDeliveriesCompleteTheInvoiceExactlyOnce() {
        boxOf12();
        wac("10");
        SalesInvoiceItem boxes = line(1, 3, 0, "300", "BOX");
        SalesInvoice inv = invoice(boxes);

        Journal first = deliver(dispatched(901, inv, false, dnLine(11, null, 1, 0, "BOX")));
        assertEquals(DeliveryStatus.PENDING, inv.getDeliveryStatus());
        wac("12"); // stock re-costed between deliveries: each delivery is costed at its own WAC
        Journal second = deliver(dispatched(902, inv, false, dnLine(12, null, 1, 0, "BOX")));
        assertEquals(DeliveryStatus.PENDING, inv.getDeliveryStatus());
        Journal third = deliver(dispatched(903, inv, false, dnLine(13, null, 1, 0, "BOX")));

        money("100", first.revenue(), "delivery 1 revenue");
        money("100", second.revenue(), "delivery 2 revenue");
        money("100", third.revenue(), "delivery 3 revenue");
        money("300", boxes.getRecognizedRevenue(), "line revenue");
        money("120", first.cogs(), "delivery 1 COGS");
        money("144", second.cogs(), "delivery 2 COGS");
        money("144", third.cogs(), "delivery 3 COGS");
        money("408", boxes.getRecognizedCogs(), "line COGS");
        money("10", boxes.getCost(), "line cost keeps its first delivery's WAC");
        assertEquals(DeliveryStatus.DELIVERED, inv.getDeliveryStatus());
    }

    // ── 6. FOC ──────────────────────────────────────────────────────────────

    @Test
    void freeUnitsAreIssuedConsumedAndCostedButEarnNoRevenue() {
        SalesInvoiceItem l = line(1, 1, 1, "100", "PCS");
        SalesInvoice inv = invoice(l);

        Journal j = deliver(dispatched(900, inv, true, dnLine(11, 1L, 1, 1, "PCS")));

        money("100", j.revenue(), "revenue journal");
        money("80", j.cogs(), "COGS journal (paid + free)");
        money("80", l.getRecognizedCogs(), "line COGS");
        assertEquals(List.of(2), stockIssued());
        List<DeliveryNoteBatchConsumption> rows = consumptionRows();
        assertEquals(1, rows.size());
        assertEquals(2, rows.get(0).getQuantity());                       // was 1
        money("80", rows.get(0).getTotalCost(), "consumption total");     // was 40
        assertEquals(DeliveryStatus.DELIVERED, inv.getDeliveryStatus());
    }

    @Test
    void outstandingFreeUnitsKeepTheInvoiceOpenUntilTheyAreDelivered() {
        SalesInvoiceItem l = line(1, 1, 1, "100", "PCS");
        SalesInvoice inv = invoice(l);

        Journal paidOnly = deliver(dispatched(901, inv, false, dnLine(11, null, 1, 0, "PCS")));
        money("100", paidOnly.revenue(), "all paid units delivered → all revenue");
        assertEquals(DeliveryStatus.PENDING, inv.getDeliveryStatus());

        Journal freeOnly = deliver(dispatched(902, inv, false, dnLine(12, null, 0, 1, "PCS")));
        money("0", freeOnly.revenue(), "free units earn nothing");
        money("40", freeOnly.cogs(), "but cost what they cost");
        money("80", l.getRecognizedCogs(), "line COGS");
        assertEquals(DeliveryStatus.DELIVERED, inv.getDeliveryStatus());
    }

    // ── 7. exact source-line matching ───────────────────────────────────────

    @Test
    void aVoidedLineWithTheSameCodeNeverAbsorbsTheLiveLinesDelivery() {
        SalesInvoiceItem voided = line(1, 1, 0, "0", "PCS");
        voided.setVoided(true);
        SalesInvoiceItem live = line(2, 1, 0, "150", "PCS");
        SalesInvoice inv = invoice(voided, live);

        Journal j = deliver(dispatched(900, inv, true, dnLine(11, 2L, 1, 0, "PCS")));

        money("150", j.revenue(), "revenue journal");          // first-match picked the voided line
        money("150", live.getRecognizedRevenue(), "live line");
        money("0", voided.getRecognizedRevenue(), "voided line");
        money("40", live.getCost(), "live line cost");
    }

    // ── 8. repeated lines across separate DNs (no line identity) ─────────────

    @Test
    void separateDeliveriesOfARepeatedProductFillTheLinesInTurn() {
        SalesInvoiceItem first = line(1, 1, 0, "100", "PCS");
        SalesInvoiceItem second = line(2, 1, 0, "120", "PCS");
        SalesInvoice inv = invoice(first, second);

        Journal d1 = deliver(dispatched(901, inv, false, dnLine(11, null, 1, 0, "PCS")));
        Journal d2 = deliver(dispatched(902, inv, false, dnLine(12, null, 1, 0, "PCS")));

        money("100", d1.revenue(), "delivery 1");
        money("120", d2.revenue(), "delivery 2");               // was 0
        money("40", second.getRecognizedCogs(), "line 2 COGS");
        money("40", second.getCost(), "line 2 cost");          // P0-1 fallback left it null
        assertEquals(DeliveryStatus.DELIVERED, inv.getDeliveryStatus());
    }

    // ── 9. cancellation ─────────────────────────────────────────────────────

    @Test
    void cancellingAPartialBoxDeliveryTakesBackExactlyWhatItRecognised() {
        boxOf12();
        wac("10");
        SalesInvoiceItem boxes = line(1, 2, 0, "240", "BOX");
        SalesInvoice inv = invoice(boxes);
        DeliveryNote dn = dispatched(900, inv, true, dnLine(11, 1L, 1, 0, "BOX"));
        deliver(dn);
        postedForInvoice.remove(dn); // a cancelled DN is not posted history

        service.cancel(900L);

        verify(posting).reverseJournalFromDeliveryNoteCancellation(eq("DN-900"), any(),
                eq(new BigDecimal("120.00")), eq(new BigDecimal("120")));
        money("0", boxes.getRecognizedRevenue(), "line revenue after cancel");
        money("0", boxes.getRecognizedCogs(), "line COGS after cancel");
        assertEquals(DeliveryStatus.PENDING, inv.getDeliveryStatus());
    }

    @Test
    void cancellingTheSecondDeliveryOfARepeatedProductOnlyTouchesTheLineItFilled() {
        SalesInvoiceItem first = line(1, 1, 0, "100", "PCS");
        SalesInvoiceItem second = line(2, 1, 0, "120", "PCS");
        SalesInvoice inv = invoice(first, second);
        deliver(dispatched(901, inv, false, dnLine(11, null, 1, 0, "PCS")));
        DeliveryNote d2 = dispatched(902, inv, false, dnLine(12, null, 1, 0, "PCS"));
        deliver(d2);
        postedForInvoice.remove(d2);

        service.cancel(902L);

        money("100", first.getRecognizedRevenue(), "line 1 untouched");
        money("40", first.getRecognizedCogs(), "line 1 COGS untouched");
        money("0", second.getRecognizedRevenue(), "line 2 reversed");    // first-match reversed line 1
        money("0", second.getRecognizedCogs(), "line 2 COGS reversed");
    }

    // ── retries and the Before-Sale path ────────────────────────────────────

    @Test
    void anAlreadyPostedDeliveryIsNeverRecognisedOrConsumedTwice() {
        SalesInvoiceItem l = line(1, 1, 0, "100", "PCS");
        SalesInvoice inv = invoice(l);
        DeliveryNote dn = dispatched(900, inv, true, dnLine(11, 1L, 1, 0, "PCS"));
        dn.setFinancialPosted(true);

        service.markDelivered(900L, "retry");

        verify(posting, never()).createJournalFromDeliveryNoteDelivered(anyString(), any(), anyString(), any(), any(), any());
        verify(consumptions, never()).save(any());
        money("0", l.getRecognizedRevenue(), "no second recognition");
    }

    @Test
    void aBeforeSaleDeliveryIsConsumedAtTheCostItIsFinallyBookedAt() {
        // Delivered with no invoice yet: placeholder cost, nothing booked, nothing consumed.
        DeliveryNote dn = dispatched(900, invoice(), false, dnLine(11, null, 2, 0, "PCS"));
        dn.setLinkedSalesInvoice(null);
        dn.getItems().get(0).setCost(new BigDecimal("55")); // master-cost placeholder from DN creation
        service.markDelivered(900L, "driver");
        verify(consumptions, never()).save(any());

        // The invoice is raised later and links it: recognised at WAC, consumed at WAC.
        SalesInvoiceItem l = line(1, 2, 0, "200", "PCS");
        SalesInvoice inv = invoice(l);
        when(repo.findByDnNumberIn(List.of("DN-900"))).thenReturn(List.of(dn));
        service.linkDeliveryNotesToInvoice(List.of("DN-900"), inv);

        money("200", l.getRecognizedRevenue(), "line revenue");
        money("80", l.getRecognizedCogs(), "line COGS at WAC");
        List<DeliveryNoteBatchConsumption> rows = consumptionRows();
        assertEquals(1, rows.size());
        assertEquals(2, rows.get(0).getQuantity());
        money("80", rows.get(0).getTotalCost(), "consumption at the booked WAC, not the placeholder");
    }

    // ── 11. ordinary single-line invoices keep their behaviour ──────────────

    @Test
    void anOrdinarySingleLineInvoiceIsRecognisedExactlyAsBefore() {
        SalesInvoiceItem l = line(1, 3, 0, "300", "PCS");
        SalesInvoice inv = invoice(l);

        Journal j = deliver(dispatched(900, inv, true, dnLine(11, 1L, 3, 0, "PCS")));

        money("300", j.revenue(), "revenue journal");
        money("120", j.cogs(), "COGS journal");
        money("300", l.getRecognizedRevenue(), "line revenue");
        money("120", l.getRecognizedCogs(), "line COGS");
        money("40", l.getCost(), "line cost");
        assertEquals(DeliveryStatus.DELIVERED, inv.getDeliveryStatus());
        assertEquals(List.of(3), stockIssued());
    }

    @Test
    void anOrdinarySingleLinePartialDeliveryIsProportionalAsBefore() {
        SalesInvoiceItem l = line(1, 2, 0, "200", "PCS");
        SalesInvoice inv = invoice(l);

        Journal j = deliver(dispatched(900, inv, false, dnLine(11, null, 1, 0, "PCS")));

        money("100", j.revenue(), "revenue journal");
        money("40", j.cogs(), "COGS journal");
        assertEquals(DeliveryStatus.PENDING, inv.getDeliveryStatus());
        assertNotEquals(null, l.getCost());
    }

    @Test
    void anExistingLineCostIsNeverOverwritten() {
        SalesInvoiceItem l = line(1, 1, 0, "100", "PCS");
        l.setCost(new BigDecimal("33"));
        SalesInvoice inv = invoice(l);

        deliver(dispatched(900, inv, true, dnLine(11, 1L, 1, 0, "PCS")));

        money("33", l.getCost(), "existing cost kept");
        assertTrue(l.getRecognizedCogs().compareTo(new BigDecimal("40")) == 0);
    }
}
