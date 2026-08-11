package com.billbull.backend.pos.admin;

import com.billbull.backend.exception.PermissionDeniedException;
import com.billbull.backend.financials.audit.FinancialAuditService;
import com.billbull.backend.notification.NotificationEventPublisher;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class CorrectionRequestServiceTest {

    @Mock
    private CorrectionRequestRepository repo;

    @Mock
    private FinancialAuditService auditService;

    @Mock
    private NotificationEventPublisher notifPublisher;

    @Mock
    private CorrectionAuditEntryRepository correctionAuditEntryRepository;

    /** Real Business Day clock on a non-JVM-default zone — correction lifecycle stamps
     *  now come from it rather than LocalDateTime.now(). */
    @org.mockito.Spy
    private com.billbull.backend.pos.businessdate.BusinessDayClock clock =
            new com.billbull.backend.pos.businessdate.BusinessDayClock("Asia/Kolkata");

    @Mock
    private SecurityContext securityContext;

    @Mock
    private Authentication authentication;

    @InjectMocks
    private CorrectionRequestService service;

    private AutoCloseable mocks;

    @BeforeEach
    void setUp() {
        mocks = MockitoAnnotations.openMocks(this);
        SecurityContextHolder.setContext(securityContext);
        when(securityContext.getAuthentication()).thenReturn(authentication);
    }

    @AfterEach
    void tearDown() throws Exception {
        mocks.close();
        SecurityContextHolder.clearContext();
    }

    private void mockUser(String username) {
        when(authentication.getName()).thenReturn(username);
    }

    @Test
    void testApprove_MakerCannotApproveOwnRequest() {
        mockUser("makerUser");
        CorrectionRequest request = new CorrectionRequest();
        request.setStatus(CorrectionRequestStatus.PENDING_APPROVAL);
        request.setRequestedBy("makerUser");
        request.setRequestNumber("REQ-001");
        request.setTargetType(CorrectionTargetType.SALES_INVOICE);
        request.setTargetId(100L);

        when(repo.findById(1L)).thenReturn(Optional.of(request));

        PermissionDeniedException ex = assertThrows(PermissionDeniedException.class, () -> service.approve(1L, "Looks good"));
        assertEquals("You cannot approve or reject your own correction request.", ex.getMessage());
        assertEquals("PERMISSION_DENIED", ex.getCode());
    }

    @Test
    void testApprove_CheckerCanApprove() {
        mockUser("checkerUser");
        CorrectionRequest request = new CorrectionRequest();
        request.setStatus(CorrectionRequestStatus.PENDING_APPROVAL);
        request.setRequestedBy("makerUser");
        request.setRequestNumber("REQ-001");
        request.setTargetType(CorrectionTargetType.SALES_INVOICE);
        request.setTargetId(100L);

        when(repo.findById(1L)).thenReturn(Optional.of(request));
        when(repo.save(any(CorrectionRequest.class))).thenAnswer(invocation -> invocation.getArgument(0));

        CorrectionRequestResponse response = service.approve(1L, "Looks good");

        assertNotNull(response);
        assertEquals(CorrectionRequestStatus.APPROVED, response.getStatus());
        assertEquals("checkerUser", request.getApprovedBy());
        verify(correctionAuditEntryRepository).save(any(CorrectionAuditEntry.class));
    }

    @Test
    void testReject_MakerCannotRejectOwnRequest() {
        mockUser("makerUser");
        CorrectionRequest request = new CorrectionRequest();
        request.setStatus(CorrectionRequestStatus.PENDING_APPROVAL);
        request.setRequestedBy("makerUser");
        request.setRequestNumber("REQ-001");
        request.setTargetType(CorrectionTargetType.SALES_INVOICE);
        request.setTargetId(100L);

        when(repo.findById(1L)).thenReturn(Optional.of(request));

        PermissionDeniedException ex = assertThrows(PermissionDeniedException.class, () -> service.reject(1L, "Cancel this"));
        assertEquals("You cannot approve or reject your own correction request.", ex.getMessage());
    }

    @Test
    void testReject_CheckerCanReject() {
        mockUser("checkerUser");
        CorrectionRequest request = new CorrectionRequest();
        request.setStatus(CorrectionRequestStatus.PENDING_APPROVAL);
        request.setRequestedBy("makerUser");
        request.setRequestNumber("REQ-001");
        request.setTargetType(CorrectionTargetType.SALES_INVOICE);
        request.setTargetId(100L);

        when(repo.findById(1L)).thenReturn(Optional.of(request));
        when(repo.save(any(CorrectionRequest.class))).thenAnswer(invocation -> invocation.getArgument(0));

        CorrectionRequestResponse response = service.reject(1L, "Invalid amount");

        assertNotNull(response);
        assertEquals(CorrectionRequestStatus.REJECTED, response.getStatus());
        assertEquals("checkerUser", request.getRejectedBy());
    }
}
