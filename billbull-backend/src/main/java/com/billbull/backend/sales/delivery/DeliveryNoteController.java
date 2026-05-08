package com.billbull.backend.sales.delivery;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import com.billbull.backend.inventory.batch.BatchSelectionRequest;

import java.util.List;

@RestController
@RequestMapping("/api/delivery-notes")
@PreAuthorize("hasAnyRole('ADMIN','SALES')")
public class DeliveryNoteController {

    private final DeliveryNoteService service;

    public DeliveryNoteController(DeliveryNoteService service) {
        this.service = service;
    }

    @GetMapping
    public List<DeliveryNoteResponse> list() {
        return service.list();
    }

    @GetMapping("/uninvoiced/{customerCode}")
    public List<DeliveryNoteResponse> getUninvoiced(@PathVariable String customerCode) {
        return service.getUninvoicedForCustomer(customerCode);
    }

    @GetMapping("/{id}")
    public DeliveryNoteResponse get(@PathVariable Long id) {
        return service.get(id);
    }

    @PostMapping
    public DeliveryNoteResponse create(@RequestBody DeliveryNoteRequest req) {
        return service.create(req);
    }

    @PutMapping("/{id}")
    public DeliveryNoteResponse update(
            @PathVariable Long id,
            @RequestBody DeliveryNoteRequest req) {
        return service.update(id, req);
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public void delete(@PathVariable Long id) {
        service.delete(id);
    }

    @PostMapping("/{id}/dispatch")
    @PreAuthorize("hasAnyRole('ADMIN','SALES','INVENTORY_MANAGER')")
    public DeliveryNoteResponse dispatch(@PathVariable Long id) {
        return service.markDispatched(id);
    }

    @PostMapping("/{id}/deliver")
    @PreAuthorize("hasAnyRole('ADMIN','SALES','INVENTORY_MANAGER')")
    public DeliveryNoteResponse deliver(
            @PathVariable Long id,
            @RequestParam(required = false) String receivedBy) {
        return service.markDelivered(id, receivedBy);
    }

    @PostMapping("/{id}/advance-status")
    @PreAuthorize("hasAnyRole('ADMIN','SALES','INVENTORY_MANAGER')")
    public DeliveryNoteResponse advanceStatus(
            @PathVariable Long id,
            @RequestParam(required = false) String receivedBy) {
        return service.advanceStatus(id, receivedBy);
    }

    @PostMapping("/{id}/cancel")
    @PreAuthorize("hasAnyRole('ADMIN','SALES','INVENTORY_MANAGER')")
    public DeliveryNoteResponse cancel(@PathVariable Long id) {
        return service.cancel(id);
    }

    @PostMapping("/{dnId}/items/{itemId}/batch-selection")
    @PreAuthorize("hasAnyRole('ADMIN','SALES','INVENTORY_MANAGER')")
    public DeliveryNoteResponse saveBatchSelection(
            @PathVariable Long dnId,
            @PathVariable Long itemId,
            @RequestBody BatchSelectionRequest request) {
        return service.saveBatchSelection(dnId, itemId, request);
    }

    @DeleteMapping("/{dnId}/items/{itemId}/batch-selection")
    @PreAuthorize("hasAnyRole('ADMIN','SALES','INVENTORY_MANAGER')")
    public DeliveryNoteResponse deleteBatchSelection(
            @PathVariable Long dnId,
            @PathVariable Long itemId) {
        return service.deleteBatchSelection(dnId, itemId);
    }
}
