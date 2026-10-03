package com.billbull.backend.sales.returns;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import com.billbull.backend.inventory.serial.SerialMaster;
import com.billbull.backend.inventory.serial.SerialMasterRepository;
import com.billbull.backend.inventory.serial.SerialStatus;
import com.billbull.backend.sales.invoice.SalesInvoice;
import com.billbull.backend.sales.invoice.SalesInvoiceItem;
import com.billbull.backend.sales.invoice.SalesInvoiceRepository;

/**
 * §20B — a returned serial must land in the state its actual condition warrants, and it must be
 * the serial the customer actually brought back.
 *
 * <p>Two defects, both in {@code applySerialReturns}. Condition was ignored entirely, so a
 * physically broken unit and a resaleable one both became RETURNED and the serial register could
 * not tell a good return from a write-off. And the serial was matched by item code with
 * {@code put}, last line winning, so on an invoice carrying the same product twice — each unit
 * with its own serial — the last line's serial was flipped for every return line of that
 * product: a unit the customer still has marked returned, and the returned one left SOLD.
 *
 * <p>Neither RETURNED nor DEFECTIVE is resaleable today ({@code DeliveryNoteService} picks only
 * AVAILABLE or RESERVED), so the condition fix changes no stock outcome right now. It makes the
 * distinction durable: a later change that lets RETURNED units be sold again cannot quietly
 * release a damaged unit along with them.
 */
@ExtendWith(MockitoExtension.class)
class SalesReturnSerialConditionTest {

    private static final String INVOICE = "INV-2026-04812";

    @Mock private SalesInvoiceRepository salesInvoiceRepository;
    @Mock private SerialMasterRepository serialMasterRepository;

    @InjectMocks private SalesReturnService service;

    @BeforeEach
    void setUp() {
        ReflectionTestUtils.setField(service, "salesInvoiceRepository", salesInvoiceRepository);
        ReflectionTestUtils.setField(service, "serialMasterRepository", serialMasterRepository);
    }

    // ---------------------------------------------------------------------------
    // Condition drives the serial state
    // ---------------------------------------------------------------------------

    @Test
    void aGoodReturnMarksTheSerialReturned() {
        stubInvoice(soldLine(1L, "ITEM-A", "SN-0001"));
        SerialMaster serial = stubSerial("SN-0001");

        applySerials(returnWith(line(1L, "ITEM-A", SalesReturnCondition.GOOD)));

        assertEquals(SerialStatus.RETURNED, serial.getStatus());
        verify(serialMasterRepository).save(serial);
    }

    @Test
    void everyScrapConditionMarksTheSerialDefectiveRatherThanReturned() {
        for (SalesReturnCondition condition : List.of(SalesReturnCondition.DAMAGED,
                SalesReturnCondition.OPENED, SalesReturnCondition.DEFECTIVE,
                SalesReturnCondition.EXPIRED)) {
            stubInvoice(soldLine(1L, "ITEM-A", "SN-0001"));
            SerialMaster serial = stubSerial("SN-0001");

            applySerials(returnWith(line(1L, "ITEM-A", condition)));

            assertEquals(SerialStatus.DEFECTIVE, serial.getStatus(),
                    condition + " must not leave the unit indistinguishable from a good return");
        }
    }

    @Test
    void anUnrecordedConditionIsTreatedAsScrapNotAsGood() {
        // Same direction SalesReturnCondition.fromLegacyItemStatus already fails in: never
        // silently promote a unit whose condition nobody recorded.
        stubInvoice(soldLine(1L, "ITEM-A", "SN-0001"));
        SerialMaster serial = stubSerial("SN-0001");

        SalesReturnItem unrecorded = line(1L, "ITEM-A", null);
        unrecorded.setItemStatus(null);
        applySerials(returnWith(unrecorded));

        assertEquals(SerialStatus.DEFECTIVE, serial.getStatus());
    }

    @Test
    void aSerialThatWasNeverSoldIsLeftAlone() {
        stubInvoice(soldLine(1L, "ITEM-A", "SN-0001"));
        SerialMaster available = stubSerial("SN-0001");
        available.setStatus(SerialStatus.AVAILABLE);

        applySerials(returnWith(line(1L, "ITEM-A", SalesReturnCondition.GOOD)));

        assertEquals(SerialStatus.AVAILABLE, available.getStatus());
        verify(serialMasterRepository, never()).save(available);
    }

    // ---------------------------------------------------------------------------
    // The right serial, on an invoice with the product twice
    // ---------------------------------------------------------------------------

    @Test
    void eachReturnLineFlipsItsOwnLinesSerial() {
        stubInvoice(soldLine(1L, "ITEM-A", "SN-0001"), soldLine(2L, "ITEM-A", "SN-0002"));
        SerialMaster first = stubSerial("SN-0001");
        SerialMaster second = stubSerial("SN-0002");

        // Only the second unit comes back, and it comes back broken.
        applySerials(returnWith(line(2L, "ITEM-A", SalesReturnCondition.DAMAGED)));

        assertEquals(SerialStatus.DEFECTIVE, second.getStatus());
        // Before the fix the map kept the last line's serial for the item code and this would
        // have been flipped instead — or as well.
        assertEquals(SerialStatus.SOLD, first.getStatus(),
                "The unit the customer still has must stay SOLD.");
    }

    @Test
    void twoReturnLinesOfOneProductConsumeTwoDistinctSerials() {
        stubInvoice(soldLine(1L, "ITEM-A", "SN-0001"), soldLine(2L, "ITEM-A", "SN-0002"));
        SerialMaster first = stubSerial("SN-0001");
        SerialMaster second = stubSerial("SN-0002");

        applySerials(returnWith(
                line(1L, "ITEM-A", SalesReturnCondition.GOOD),
                line(2L, "ITEM-A", SalesReturnCondition.DAMAGED)));

        assertEquals(SerialStatus.RETURNED, first.getStatus());
        assertEquals(SerialStatus.DEFECTIVE, second.getStatus());
    }

    @Test
    void legacyReturnLinesWithNoInvoiceLineIdConsumeOneSerialEach() {
        // Rows written before invoice_item_id existed. Each return line takes the next unclaimed
        // serial rather than every line reusing the same one.
        stubInvoice(soldLine(1L, "ITEM-A", "SN-0001"), soldLine(2L, "ITEM-A", "SN-0002"));
        SerialMaster first = stubSerial("SN-0001");
        SerialMaster second = stubSerial("SN-0002");

        applySerials(returnWith(
                line(null, "ITEM-A", SalesReturnCondition.GOOD),
                line(null, "ITEM-A", SalesReturnCondition.GOOD)));

        assertEquals(SerialStatus.RETURNED, first.getStatus());
        assertEquals(SerialStatus.RETURNED, second.getStatus());
    }

    @Test
    void aNonSerialisedLineTouchesNoSerialAtAll() {
        stubInvoice(soldLine(1L, "ITEM-A", null));

        applySerials(returnWith(line(1L, "ITEM-A", SalesReturnCondition.GOOD)));

        verify(serialMasterRepository, never()).findBySerialNumberForUpdate(
                org.mockito.ArgumentMatchers.anyString());
    }

    @Test
    void anUnlinkedReturnTouchesNoSerialAtAll() {
        SalesReturn ret = returnWith(line(1L, "ITEM-A", SalesReturnCondition.GOOD));
        ret.setLinkedInvoice(null);

        applySerials(ret);

        verify(salesInvoiceRepository, never()).findByInvoiceNumber(
                org.mockito.ArgumentMatchers.anyString());
    }

    // ---------------------------------------------------------------------------
    // Fixtures
    // ---------------------------------------------------------------------------

    private void applySerials(SalesReturn ret) {
        ReflectionTestUtils.invokeMethod(service, "applySerialReturns", ret);
    }

    private void stubInvoice(SalesInvoiceItem... items) {
        SalesInvoice invoice = new SalesInvoice();
        invoice.setInvoiceNumber(INVOICE);
        invoice.setItems(new ArrayList<>(List.of(items)));
        lenient().when(salesInvoiceRepository.findByInvoiceNumber(INVOICE))
                .thenReturn(Optional.of(invoice));
    }

    private SerialMaster stubSerial(String serialNumber) {
        SerialMaster serial = new SerialMaster();
        serial.setSerialNumber(serialNumber);
        serial.setStatus(SerialStatus.SOLD);
        lenient().when(serialMasterRepository.findBySerialNumberForUpdate(serialNumber))
                .thenReturn(Optional.of(serial));
        return serial;
    }

    private static SalesInvoiceItem soldLine(Long id, String code, String serialNumber) {
        SalesInvoiceItem item = new SalesInvoiceItem();
        ReflectionTestUtils.setField(item, "id", id);
        item.setItemCode(code);
        item.setQuantity(1);
        item.setSerialNumber(serialNumber);
        return item;
    }

    private static SalesReturnItem line(Long invoiceItemId, String code, SalesReturnCondition condition) {
        SalesReturnItem item = new SalesReturnItem();
        item.setInvoiceItemId(invoiceItemId);
        item.setItemCode(code);
        item.setReturnQty(1);
        if (condition != null) {
            item.setCondition(condition);
            item.setItemStatus(condition.toLegacyItemStatus());
        }
        return item;
    }

    private static SalesReturn returnWith(SalesReturnItem... items) {
        SalesReturn r = new SalesReturn();
        r.setReturnNumber("SR-2026-0041");
        r.setLinkedInvoice(INVOICE);
        r.setItems(new ArrayList<>(List.of(items)));
        return r;
    }
}
