package com.billbull.backend.purchase.vendor;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Pageable;
import org.springframework.security.access.AccessDeniedException;

import com.billbull.backend.security.AuditLogService;
import com.billbull.backend.security.ModulePermissionService;
import com.billbull.backend.util.SearchLimit;

/**
 * Vendor typeahead search — the service's query/limit contract and the
 * controller's authorization gate.
 *
 * <p>The SQL matching itself (case-insensitivity, which columns are matched)
 * lives in the {@code @Query} on {@link VendorRepository} and is asserted there
 * by inspecting the JPQL, since these are Mockito unit tests with no database.
 */
@ExtendWith(MockitoExtension.class)
class VendorSearchTest {

    @Mock private VendorRepository repo;
    @Mock private com.billbull.backend.purchase.lpo.LpoRepository lpoRepo;
    @Mock private com.billbull.backend.purchase.invoice.PurchaseInvoiceRepository invRepo;
    @Mock private com.billbull.backend.purchase.payment.PaymentVoucherRepository payRepo;
    @Mock private com.billbull.backend.settings.branch.BranchRepository branchRepo;
    @Mock private com.billbull.backend.settings.branch.BranchAccessService branchAccessService;

    @Mock private VendorImportService importService;
    @Mock private AuditLogService auditLogService;
    @Mock private ModulePermissionService modulePermissionService;

    private VendorService service() {
        stubAllBranchScope();
        return new VendorService(repo, lpoRepo, invRepo, payRepo, branchRepo, branchAccessService);
    }

    /**
     * The all-branches scope, which is what an ADMIN/SUPER_ADMIN token produces. These
     * tests are about the search contract rather than branch scoping — that has its own
     * test — so they run as a user who can reach everything.
     */
    private void stubAllBranchScope() {
        lenient().when(branchAccessService.currentSearchScope())
                .thenReturn(new com.billbull.backend.settings.branch.BranchAccessService.ListScope(
                        true, java.util.Set.of(-1L)));
    }

    private VendorController controller(VendorService service) {
        return new VendorController(service, importService, auditLogService, modulePermissionService);
    }

    // ── Service ──────────────────────────────────────────────────────────────

    @Test
    void searchReturnsMatchingVendors() {
        VendorSearchResponse row = new VendorSearchResponse(
                1L, "VEN-0021", "TechSupply FZCO", "sales@techsupply.ae",
                "+971 4 234 5678", "+971 50 111 2222", "Active", "Dubai");
        when(repo.searchVendors(eq("tech"), anyBoolean(), anyCollection(), any(Pageable.class))).thenReturn(List.of(row));

        List<VendorSearchResponse> result = service().search("tech", 5);

        assertThat(result).hasSize(1);
        assertThat(result.get(0).getCode()).isEqualTo("VEN-0021");
        assertThat(result.get(0).getName()).isEqualTo("TechSupply FZCO");
        assertThat(result.get(0).getBranch()).isEqualTo("Dubai");
    }

    @ParameterizedTest
    @ValueSource(strings = { "", "   ", "\t" })
    void blankQueryReturnsEmptyWithoutTouchingTheDatabase(String query) {
        assertThat(service().search(query, 5)).isEmpty();
        verifyNoInteractions(repo);
    }

    @Test
    void nullQueryReturnsEmptyWithoutTouchingTheDatabase() {
        assertThat(service().search(null, 5)).isEmpty();
        verifyNoInteractions(repo);
    }

    @Test
    void queryIsTrimmedBeforeItReachesTheDatabase() {
        when(repo.searchVendors(eq("acme"), anyBoolean(), anyCollection(), any(Pageable.class))).thenReturn(List.of());

        service().search("  acme  ", 5);

        verify(repo).searchVendors(eq("acme"), anyBoolean(), anyCollection(), any(Pageable.class));
    }

    @Test
    void sizeIsCappedServerSide() {
        when(repo.searchVendors(any(), anyBoolean(), anyCollection(), any(Pageable.class))).thenReturn(List.of());
        ArgumentCaptor<Pageable> pageable = ArgumentCaptor.forClass(Pageable.class);

        service().search("acme", 10_000);

        verify(repo).searchVendors(any(), anyBoolean(), anyCollection(), pageable.capture());
        assertThat(pageable.getValue().getPageSize()).isEqualTo(SearchLimit.MAX_SIZE);
        assertThat(pageable.getValue().getPageNumber()).isZero();
    }

    @Test
    void nonPositiveSizeFallsBackToTheDefault() {
        when(repo.searchVendors(any(), anyBoolean(), anyCollection(), any(Pageable.class))).thenReturn(List.of());
        ArgumentCaptor<Pageable> pageable = ArgumentCaptor.forClass(Pageable.class);

        service().search("acme", 0);

        verify(repo).searchVendors(any(), anyBoolean(), anyCollection(), pageable.capture());
        assertThat(pageable.getValue().getPageSize()).isEqualTo(SearchLimit.DEFAULT_SIZE);
    }

    // ── Controller authorization ─────────────────────────────────────────────

    @Test
    void controllerRequiresTheVendorModuleViewPermission() {
        VendorService service = service();
        doThrow(new AccessDeniedException("denied"))
                .when(modulePermissionService).requireCanView("purchases.vendor");

        assertThatThrownBy(() -> controller(service).search("acme", 5, false))
                .isInstanceOf(AccessDeniedException.class);

        verify(repo, never()).searchVendors(any(), anyBoolean(), anyCollection(), any());
    }

    // ── Empty-query preview ────────────────────────────────────────────

    @Test
    void previewIsBoundedInTheDatabase() {
        when(repo.previewVendors(anyBoolean(), anyCollection(), any(Pageable.class))).thenReturn(List.of());
        ArgumentCaptor<Pageable> pageable = ArgumentCaptor.forClass(Pageable.class);

        service().preview(2);

        verify(repo).previewVendors(anyBoolean(), anyCollection(), pageable.capture());
        assertThat(pageable.getValue().getPageSize()).isEqualTo(2);
        assertThat(pageable.getValue().getPageNumber()).isZero();
    }

    @Test
    void previewSizeIsCappedServerSide() {
        when(repo.previewVendors(anyBoolean(), anyCollection(), any(Pageable.class))).thenReturn(List.of());
        ArgumentCaptor<Pageable> pageable = ArgumentCaptor.forClass(Pageable.class);

        service().preview(10_000);

        verify(repo).previewVendors(anyBoolean(), anyCollection(), pageable.capture());
        assertThat(pageable.getValue().getPageSize()).isEqualTo(SearchLimit.MAX_SIZE);
    }

    @Test
    void previewIsBranchScopedLikeTheSearch() {
        when(branchAccessService.currentSearchScope())
                .thenReturn(new com.billbull.backend.settings.branch.BranchAccessService.ListScope(
                        false, java.util.Set.of(3L, 8L)));
        when(repo.previewVendors(anyBoolean(), anyCollection(), any(Pageable.class))).thenReturn(List.of());

        new VendorService(repo, lpoRepo, invRepo, payRepo, branchRepo, branchAccessService).preview(2);

        verify(repo).previewVendors(eq(false), eq(java.util.Set.of(3L, 8L)), any(Pageable.class));
    }

    @Test
    void previewPutsMostPurchasedVendorsFirstThenRecentLposThenNameOrder() {
        VendorSearchResponse purchased = vendorRow(9L, "ABDULLA ALI");
        VendorSearchResponse ordered = vendorRow(46L, "AL NADOUD");
        VendorSearchResponse alphabetical = vendorRow(1L, "123456");
        when(invRepo.findMostPurchasedVendorIds(any(java.time.LocalDate.class), any(Pageable.class)))
                .thenReturn(List.of(9L));
        // 9 also has LPOs; it must not be listed twice or lose its invoice rank.
        when(lpoRepo.findMostActiveVendorIds(any(java.time.LocalDateTime.class), any(Pageable.class)))
                .thenReturn(List.of(46L, 9L));
        when(repo.findByIdsInScope(anyCollection(), anyBoolean(), anyCollection()))
                .thenReturn(List.of(ordered, purchased));
        when(repo.previewVendors(anyBoolean(), anyCollection(), any(Pageable.class)))
                .thenReturn(List.of(alphabetical, purchased));

        List<VendorSearchResponse> rows = service().preview(3);

        assertThat(rows).extracting(VendorSearchResponse::getId).containsExactly(9L, 46L, 1L);
    }

    private static VendorSearchResponse vendorRow(Long id, String name) {
        return new VendorSearchResponse(id, "V-" + id, name, null, null, null, "Active", null);
    }

    @Test
    void blankQueryStillReturnsNothingUnlessThePreviewIsAskedForExplicitly() {
        VendorService service = service();

        assertThat(controller(service).search("", 2, false)).isEmpty();

        verify(repo, never()).previewVendors(anyBoolean(), anyCollection(), any());
        verify(repo, never()).searchVendors(any(), anyBoolean(), anyCollection(), any());
    }

    @Test
    void controllerPreviewRequiresTheSameModulePermissionAsTheSearch() {
        VendorService service = service();
        doThrow(new AccessDeniedException("denied"))
                .when(modulePermissionService).requireCanView("purchases.vendor");

        assertThatThrownBy(() -> controller(service).search("", 2, true))
                .isInstanceOf(AccessDeniedException.class);

        verify(repo, never()).previewVendors(anyBoolean(), anyCollection(), any());
    }

    @Test
    void aTermAlwaysSearchesEvenWhenThePreviewFlagIsSet() {
        when(repo.searchVendors(eq("acme"), anyBoolean(), anyCollection(), any(Pageable.class))).thenReturn(List.of());

        controller(service()).search("acme", 2, true);

        verify(repo).searchVendors(eq("acme"), anyBoolean(), anyCollection(), any(Pageable.class));
        verify(repo, never()).previewVendors(anyBoolean(), anyCollection(), any());
    }

    @Test
    void controllerDelegatesToTheServiceOncePermitted() {
        when(repo.searchVendors(eq("acme"), anyBoolean(), anyCollection(), any(Pageable.class))).thenReturn(List.of());

        controller(service()).search("acme", 5, false);

        verify(modulePermissionService).requireCanView("purchases.vendor");
        verify(repo).searchVendors(eq("acme"), anyBoolean(), anyCollection(), any(Pageable.class));
    }
}
