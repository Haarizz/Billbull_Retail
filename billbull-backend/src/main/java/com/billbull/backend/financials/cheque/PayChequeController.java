package com.billbull.backend.financials.cheque;

import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.billbull.backend.financials.cheque.PayChequeDtos.ChequeBookRequest;
import com.billbull.backend.financials.cheque.PayChequeDtos.ChequeBookView;
import com.billbull.backend.financials.cheque.PayChequeDtos.ChequeRequest;
import com.billbull.backend.financials.cheque.PayChequeDtos.ChequeView;
import com.billbull.backend.financials.cheque.PayChequeDtos.PendingSource;
import com.billbull.backend.financials.cheque.PayChequeDtos.TransitionRequest;
import com.billbull.backend.security.ModulePermissionService;

/**
 * Financials → Pay Cheques.
 *
 * <p>Permissions reuse the voucher module rather than adding a new one: view/create for drafts,
 * <b>approve</b> for the approval step (the privileged sign-off), edit for print / issue / paid /
 * cancel and cheque-book setup. Reconciling a cheque is a bank-reconciliation act, so it is gated
 * on {@code finance.reconcile}.
 */
@RestController
@RequestMapping("/api/pay-cheques")
@PreAuthorize("isAuthenticated()")
public class PayChequeController {

    private static final String MODULE = "finance.voucher";
    private static final String RECONCILE_MODULE = "finance.reconcile";

    private final PayChequeService service;
    private final ModulePermissionService permissions;

    public PayChequeController(PayChequeService service, ModulePermissionService permissions) {
        this.service = service;
        this.permissions = permissions;
    }

    // ── Cheque books (bank accounts) ─────────────────────────────────────────

    @GetMapping("/books")
    public List<ChequeBookView> listBooks() {
        permissions.requireCanView(MODULE);
        return service.listBooks();
    }

    @PostMapping("/books")
    public ChequeBookView createBook(@RequestBody ChequeBookRequest req) {
        permissions.requireCanEdit(MODULE);
        return service.saveBook(null, req);
    }

    @PutMapping("/books/{id}")
    public ChequeBookView updateBook(@PathVariable Long id, @RequestBody ChequeBookRequest req) {
        permissions.requireCanEdit(MODULE);
        return service.saveBook(id, req);
    }

    @DeleteMapping("/books/{id}")
    public ResponseEntity<Void> deleteBook(@PathVariable Long id) {
        permissions.requireCanEdit(MODULE);
        service.deleteBook(id);
        return ResponseEntity.noContent().build();
    }

    // ── Cheque due ───────────────────────────────────────────────────────────

    /** Payments booked as cheque and not yet on a live cheque. {@code type} = VENDOR (default) or EXPENSE. */
    @GetMapping("/pending")
    public List<PendingSource> pending(@RequestParam(defaultValue = "VENDOR") PayChequeType type) {
        permissions.requireCanView(MODULE);
        return service.listPending(type);
    }

    // ── Cheques ──────────────────────────────────────────────────────────────

    @GetMapping
    public List<ChequeView> list() {
        permissions.requireCanView(MODULE);
        return service.listCheques();
    }

    @GetMapping("/{id}")
    public ChequeView get(@PathVariable Long id) {
        permissions.requireCanView(MODULE);
        return service.getCheque(id);
    }

    @PostMapping
    public ChequeView create(@RequestBody ChequeRequest req) {
        permissions.requireCanCreate(MODULE);
        return service.create(req);
    }

    @PutMapping("/{id}")
    public ChequeView update(@PathVariable Long id, @RequestBody ChequeRequest req) {
        permissions.requireCanEdit(MODULE);
        return service.update(id, req);
    }

    @PostMapping("/{id}/approve")
    public ChequeView approve(@PathVariable Long id, @RequestBody(required = false) TransitionRequest req) {
        permissions.requireCanApprove(MODULE);
        return service.approve(id, req);
    }

    @PostMapping("/{id}/print")
    public ChequeView print(@PathVariable Long id, @RequestBody(required = false) TransitionRequest req) {
        permissions.requireCanEdit(MODULE);
        return service.recordPrint(id, req);
    }

    @PostMapping("/{id}/issue")
    public ChequeView issue(@PathVariable Long id, @RequestBody(required = false) TransitionRequest req) {
        permissions.requireCanEdit(MODULE);
        return service.issue(id, req);
    }

    @PostMapping("/{id}/paid")
    public ChequeView markPaid(@PathVariable Long id, @RequestBody(required = false) TransitionRequest req) {
        permissions.requireCanEdit(MODULE);
        return service.markPaid(id, req);
    }

    @PostMapping("/{id}/reconcile")
    public ChequeView reconcile(@PathVariable Long id, @RequestBody(required = false) TransitionRequest req) {
        permissions.requireCanEdit(RECONCILE_MODULE);
        return service.reconcile(id, req);
    }

    @PostMapping("/{id}/cancel")
    public ChequeView cancel(@PathVariable Long id, @RequestBody(required = false) TransitionRequest req) {
        permissions.requireCanEdit(MODULE);
        return service.cancel(id, req);
    }
}
