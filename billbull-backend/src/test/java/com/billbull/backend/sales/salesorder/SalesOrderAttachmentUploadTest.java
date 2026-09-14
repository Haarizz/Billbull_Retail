package com.billbull.backend.sales.salesorder;

import com.billbull.backend.security.AuditLogService;
import com.billbull.backend.security.ModulePermissionService;
import com.billbull.backend.settings.email.DocumentEmailSender;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

/**
 * The attachment upload used to call MultipartFile.transferTo() with a RELATIVE
 * path, which Tomcat resolves against the servlet temp dir instead of the working
 * directory -- so the write landed outside the directory that had just been
 * created and threw. The frontend uploads the attachment right after saving the
 * order, so that IOException surfaced to the user as "confirming the Sales Order
 * failed", and the order only saved once the attachment was removed.
 */
@ExtendWith(MockitoExtension.class)
class SalesOrderAttachmentUploadTest {

    @Mock private SalesOrderService service;
    @Mock private SalesOrderAttachmentRepository attachmentRepo;
    @Mock private AuditLogService auditLogService;
    @Mock private DocumentEmailSender emailSender;
    @Mock private ModulePermissionService modulePermissionService;

    private SalesOrderController controller(Path uploadRoot) {
        return new SalesOrderController(service, attachmentRepo, auditLogService,
                emailSender, modulePermissionService, uploadRoot.toString());
    }

    @Test
    void uploadWritesTheFileAndPersistsTheAttachment(@org.junit.jupiter.api.io.TempDir Path tmp)
            throws IOException {

        SalesOrder order = new SalesOrder();
        order.setId(7L);
        when(service.getById(7L)).thenReturn(order);
        when(attachmentRepo.save(any(SalesOrderAttachment.class)))
                .thenAnswer(inv -> {
                    SalesOrderAttachment a = inv.getArgument(0);
                    a.setId(11L);
                    return a;
                });

        MockMultipartFile file = new MockMultipartFile(
                "file", "purchase-order.pdf", "application/pdf", "hello".getBytes());

        ResponseEntity<?> response = controller(tmp).upload(7L, file);

        assertEquals(200, response.getStatusCode().value());
        @SuppressWarnings("unchecked")
        Map<String, Object> body = (Map<String, Object>) response.getBody();
        assertNotNull(body);
        assertEquals("purchase-order.pdf", body.get("fileName"));

        Path dir = tmp.resolve("sales-orders").resolve("7");
        try (var files = Files.list(dir)) {
            Path written = files.findFirst().orElseThrow();
            assertTrue(written.getFileName().toString().endsWith("_purchase-order.pdf"));
            assertEquals("hello", Files.readString(written));
        }
    }

    @Test
    void uploadStripsDirectoryComponentsFromTheClientFileName(
            @org.junit.jupiter.api.io.TempDir Path tmp) throws IOException {

        SalesOrder order = new SalesOrder();
        order.setId(3L);
        when(service.getById(3L)).thenReturn(order);
        when(attachmentRepo.save(any(SalesOrderAttachment.class))).thenAnswer(inv -> {
            SalesOrderAttachment a = inv.getArgument(0);
            a.setId(12L);
            return a;
        });

        // A traversal attempt must never escape the per-order folder.
        MockMultipartFile file = new MockMultipartFile(
                "file", "../../evil.sh", "text/plain", "x".getBytes());

        ResponseEntity<?> response = controller(tmp).upload(3L, file);

        assertEquals(200, response.getStatusCode().value());
        Path dir = tmp.resolve("sales-orders").resolve("3");
        try (var files = Files.list(dir)) {
            assertTrue(files.findFirst().orElseThrow()
                    .getFileName().toString().endsWith("_evil.sh"));
        }
        assertFalse(Files.exists(tmp.resolve("evil.sh")));
    }

    @Test
    void emptyUploadIsRejectedWithoutTouchingTheOrder(@org.junit.jupiter.api.io.TempDir Path tmp) {
        MockMultipartFile empty = new MockMultipartFile("file", "empty.pdf", "application/pdf", new byte[0]);

        ResponseEntity<?> response = controller(tmp).upload(9L, empty);

        assertEquals(400, response.getStatusCode().value());
    }
}
