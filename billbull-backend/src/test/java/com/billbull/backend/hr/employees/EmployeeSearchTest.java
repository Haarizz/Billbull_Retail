package com.billbull.backend.hr.employees;

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

import java.lang.reflect.Field;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Pageable;
import org.springframework.security.access.AccessDeniedException;

import com.billbull.backend.security.AdminSafeguardService;
import com.billbull.backend.security.AuditLogService;
import com.billbull.backend.security.ModulePermissionService;
import com.billbull.backend.settings.branch.BranchRepository;
import com.billbull.backend.user.UserRepository;
import com.billbull.backend.user.UserService;
import com.billbull.backend.util.SearchLimit;
import com.fasterxml.jackson.databind.ObjectMapper;

/** Employee typeahead search — projection contract, limits and authorization. */
@ExtendWith(MockitoExtension.class)
class EmployeeSearchTest {

    @Mock private EmployeeRepository repository;
    @Mock private UserRepository userRepository;
    @Mock private AdminSafeguardService adminSafeguardService;
    @Mock private UserService userService;
    @Mock private BranchRepository branchRepository;
    @Mock private com.billbull.backend.settings.branch.BranchAccessService branchAccessService;

    @InjectMocks
    private EmployeeServiceImpl service;

    @Mock private AuditLogService auditLogService;
    @Mock private ModulePermissionService modulePermissionService;
    @Mock private SalespersonService salespersonService;
    @Mock private com.billbull.backend.hr.targets.EmployeeSalesTargetService targetService;

    private EmployeeController controller() {
        return new EmployeeController(service, new ObjectMapper(), auditLogService,
                userRepository, modulePermissionService, salespersonService, targetService);
    }

    /**
     * The all-branches scope an ADMIN/SUPER_ADMIN token produces. These tests are about
     * the projection and limit contract, not branch scoping — that has its own test.
     */
    @org.junit.jupiter.api.BeforeEach
    void stubAllBranchScope() {
        lenient().when(branchAccessService.currentSearchScope())
                .thenReturn(new com.billbull.backend.settings.branch.BranchAccessService.ListScope(
                        true, java.util.Set.of(-1L)));
    }

    private static EmployeeSearchResponse row() {
        return new EmployeeSearchResponse(1L, "EMP-0234", "Ahmed", null, "Al Mansoori",
                "Senior Sales Executive", "Sales", "Dubai", "Active");
    }

    // ── Service ──────────────────────────────────────────────────────────────

    @Test
    void searchReturnsMatchingEmployees() {
        when(repository.searchEmployees(eq("ahmed"), anyBoolean(), anyCollection(), any(Pageable.class))).thenReturn(List.of(row()));

        List<EmployeeSearchResponse> result = service.search("ahmed", 5);

        assertThat(result).hasSize(1);
        assertThat(result.get(0).getEmployeeCode()).isEqualTo("EMP-0234");
        assertThat(result.get(0).getName()).isEqualTo("Ahmed Al Mansoori");
        assertThat(result.get(0).getRole()).isEqualTo("Senior Sales Executive");
        assertThat(result.get(0).getDepartment()).isEqualTo("Sales");
        assertThat(result.get(0).getStatus()).isEqualTo("Active");
    }

    @Test
    void searchMatchesByEmployeeCode() {
        when(repository.searchEmployees(eq("EMP-0234"), anyBoolean(), anyCollection(), any(Pageable.class))).thenReturn(List.of(row()));

        assertThat(service.search("EMP-0234", 5))
                .extracting(EmployeeSearchResponse::getName)
                .containsExactly("Ahmed Al Mansoori");
    }

    @ParameterizedTest
    @ValueSource(strings = { "", "  " })
    void blankQueryReturnsEmptyWithoutTouchingTheDatabase(String query) {
        assertThat(service.search(query, 5)).isEmpty();
        verifyNoInteractions(repository);
    }

    @Test
    void nullQueryReturnsEmptyWithoutTouchingTheDatabase() {
        assertThat(service.search(null, 5)).isEmpty();
        verifyNoInteractions(repository);
    }

    @Test
    void queryIsTrimmedBeforeItReachesTheDatabase() {
        when(repository.searchEmployees(eq("ravi"), anyBoolean(), anyCollection(), any(Pageable.class))).thenReturn(List.of());

        service.search(" ravi ", 5);

        verify(repository).searchEmployees(eq("ravi"), anyBoolean(), anyCollection(), any(Pageable.class));
    }

    @Test
    void sizeIsCappedServerSide() {
        when(repository.searchEmployees(any(), anyBoolean(), anyCollection(), any(Pageable.class))).thenReturn(List.of());
        ArgumentCaptor<Pageable> pageable = ArgumentCaptor.forClass(Pageable.class);

        service.search("ravi", 5_000);

        verify(repository).searchEmployees(any(), anyBoolean(), anyCollection(), pageable.capture());
        assertThat(pageable.getValue().getPageSize()).isEqualTo(SearchLimit.MAX_SIZE);
    }

    @Test
    void nonPositiveSizeFallsBackToTheDefault() {
        when(repository.searchEmployees(any(), anyBoolean(), anyCollection(), any(Pageable.class))).thenReturn(List.of());
        ArgumentCaptor<Pageable> pageable = ArgumentCaptor.forClass(Pageable.class);

        service.search("ravi", 0);

        verify(repository).searchEmployees(any(), anyBoolean(), anyCollection(), pageable.capture());
        assertThat(pageable.getValue().getPageSize()).isEqualTo(SearchLimit.DEFAULT_SIZE);
    }

    // ── Projection safety ────────────────────────────────────────────────────

    @Test
    void middleNameIsFoldedIntoTheDisplayNameWithoutDoubleSpacing() {
        EmployeeSearchResponse withMiddle =
                new EmployeeSearchResponse(2L, "EMP-1", "Sarah", "Jane", "Williams", null, null, null, "Active");
        EmployeeSearchResponse blankMiddle =
                new EmployeeSearchResponse(3L, "EMP-2", "Ravi", "  ", "Kumar", null, null, null, "Active");

        assertThat(withMiddle.getName()).isEqualTo("Sarah Jane Williams");
        assertThat(blankMiddle.getName()).isEqualTo("Ravi Kumar");
    }

    /**
     * A search result is a pointer to a record, not the record. This guards the
     * projection against someone later widening it into a full employee payload.
     */
    @Test
    void searchResponseExposesNoSensitiveEmployeeData() {
        List<String> forbidden = List.of(
                "salary", "basicsalary", "salarytype", "payroll", "allowance", "deduction",
                "passport", "visa", "emirates", "attendance", "leave", "dateofbirth",
                "phone", "email", "address", "pospin", "bank", "iban");

        List<String> fields = Arrays.stream(EmployeeSearchResponse.class.getDeclaredFields())
                .map(Field::getName)
                .map(name -> name.toLowerCase(Locale.ROOT))
                .toList();

        assertThat(fields).isNotEmpty();
        for (String field : fields) {
            assertThat(forbidden)
                    .as("EmployeeSearchResponse must not expose '%s'", field)
                    .noneMatch(field::contains);
        }
    }

    // ── Empty-query preview ───────────────────────────────────────

    @Test
    void previewIsBoundedInTheDatabase() {
        when(repository.previewEmployees(anyBoolean(), anyCollection(), any(Pageable.class))).thenReturn(List.of());
        ArgumentCaptor<Pageable> pageable = ArgumentCaptor.forClass(Pageable.class);

        service.preview(2);

        verify(repository).previewEmployees(anyBoolean(), anyCollection(), pageable.capture());
        assertThat(pageable.getValue().getPageSize()).isEqualTo(2);
        assertThat(pageable.getValue().getPageNumber()).isZero();
    }

    @Test
    void previewSizeIsCappedServerSide() {
        when(repository.previewEmployees(anyBoolean(), anyCollection(), any(Pageable.class))).thenReturn(List.of());
        ArgumentCaptor<Pageable> pageable = ArgumentCaptor.forClass(Pageable.class);

        service.preview(10_000);

        verify(repository).previewEmployees(anyBoolean(), anyCollection(), pageable.capture());
        assertThat(pageable.getValue().getPageSize()).isEqualTo(SearchLimit.MAX_SIZE);
    }

    @Test
    void previewCarriesTheSameIdentityOnlyProjectionAsTheSearch() {
        when(repository.previewEmployees(anyBoolean(), anyCollection(), any(Pageable.class)))
                .thenReturn(List.of(row()));

        List<EmployeeSearchResponse> result = service.preview(2);

        // EmployeeSearchResponse is the whole contract: no salary, payroll, attendance,
        // leave or document field exists on it to leak.
        assertThat(result).hasSize(1);
        assertThat(result.get(0).getEmployeeCode()).isEqualTo("EMP-0234");
        assertThat(java.util.Arrays.stream(EmployeeSearchResponse.class.getDeclaredFields())
                .map(Field::getName)
                .map(n -> n.toLowerCase(Locale.ROOT)))
                .noneMatch(n -> n.contains("salary") || n.contains("payroll") || n.contains("bank"));
    }

    @Test
    void previewIsBranchScopedLikeTheSearch() {
        when(branchAccessService.currentSearchScope())
                .thenReturn(new com.billbull.backend.settings.branch.BranchAccessService.ListScope(
                        false, java.util.Set.of(3L, 8L)));
        when(repository.previewEmployees(anyBoolean(), anyCollection(), any(Pageable.class))).thenReturn(List.of());

        service.preview(2);

        verify(repository).previewEmployees(eq(false), eq(java.util.Set.of(3L, 8L)), any(Pageable.class));
    }

    @Test
    void blankQueryStillReturnsNothingUnlessThePreviewIsAskedForExplicitly() {
        assertThat(controller().search("", 2, false)).isEmpty();

        verify(repository, never()).previewEmployees(anyBoolean(), anyCollection(), any());
        verify(repository, never()).searchEmployees(any(), anyBoolean(), anyCollection(), any());
    }

    @Test
    void controllerPreviewRequiresTheSameModulePermissionAsTheSearch() {
        doThrow(new AccessDeniedException("denied"))
                .when(modulePermissionService).requireCanView("hr.employee");

        assertThatThrownBy(() -> controller().search("", 2, true))
                .isInstanceOf(AccessDeniedException.class);

        verify(repository, never()).previewEmployees(anyBoolean(), anyCollection(), any());
    }

    @Test
    void aTermAlwaysSearchesEvenWhenThePreviewFlagIsSet() {
        when(repository.searchEmployees(eq("ahmed"), anyBoolean(), anyCollection(), any(Pageable.class)))
                .thenReturn(List.of(row()));

        controller().search("ahmed", 2, true);

        verify(repository).searchEmployees(eq("ahmed"), anyBoolean(), anyCollection(), any(Pageable.class));
        verify(repository, never()).previewEmployees(anyBoolean(), anyCollection(), any());
    }

    // ── Controller authorization ─────────────────────────────────────────────

    @Test
    void controllerRequiresTheHrEmployeeViewPermission() {
        doThrow(new AccessDeniedException("denied"))
                .when(modulePermissionService).requireCanView("hr.employee");

        assertThatThrownBy(() -> controller().search("ahmed", 5, false))
                .isInstanceOf(AccessDeniedException.class);

        verify(repository, never()).searchEmployees(any(), anyBoolean(), anyCollection(), any());
    }

    @Test
    void controllerDelegatesToTheServiceOncePermitted() {
        when(repository.searchEmployees(eq("ahmed"), anyBoolean(), anyCollection(), any(Pageable.class))).thenReturn(List.of(row()));

        assertThat(controller().search("ahmed", 5, false)).hasSize(1);

        verify(modulePermissionService).requireCanView("hr.employee");
        verify(repository).searchEmployees(eq("ahmed"), anyBoolean(), anyCollection(), any(Pageable.class));
    }
}
