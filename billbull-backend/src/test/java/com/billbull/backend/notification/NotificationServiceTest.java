package com.billbull.backend.notification;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class NotificationServiceTest {

    @Mock NotificationRepository repo;
    @Mock DisplayNameResolver names;

    NotificationService service;

    @BeforeEach
    void setUp() {
        service = new NotificationService(repo, names);
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken("alice", "n/a", List.of()));
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void createStoresDetailsAsJsonAndDropsBlankValues() {
        when(repo.save(any(Notification.class))).thenAnswer(inv -> inv.getArgument(0));

        Notification n = service.createForUser("bob", "Payment Received", "msg", "SUCCESS", "FINANCE", null,
                "/sales/payment", "PAY-1", "PAYMENT", null,
                NotificationEventPublisher.details("Amount", "AED 10.00", "Mode", "", "Customer", null));

        assertThat(n.getMetadata()).isEqualTo("{\"Amount\":\"AED 10.00\"}");
        assertThat(n.getPriority()).isEqualTo("MEDIUM");
        assertThat(NotificationResponse.parseDetails(n.getMetadata())).containsEntry("Amount", "AED 10.00");
    }

    @Test
    void createWithoutDetailsLeavesMetadataNull() {
        when(repo.save(any(Notification.class))).thenAnswer(inv -> inv.getArgument(0));
        Notification n = service.createForUser("bob", "t", "m", null, "SYSTEM", null, null, null, null, null);
        assertThat(n.getMetadata()).isNull();
        assertThat(n.getType()).isEqualTo("INFO");
    }

    @Test
    void fanOutSkipsUsersWhoStillHaveTheSameUnreadAlert() {
        when(repo.save(any(Notification.class))).thenAnswer(inv -> inv.getArgument(0));
        when(repo.existsUnreadDuplicate(eq("bob"), anyString(), anyString(), anyString(), any())).thenReturn(true);
        when(repo.existsUnreadDuplicate(eq("carol"), anyString(), anyString(), anyString(), any())).thenReturn(false);

        service.createForUsers(List.of("bob", "carol"), "Low Stock Alert", "m", "WARNING", "INVENTORY", "HIGH",
                "/inventory/products", "SKU-1", "PRODUCT", null, Map.of(), Duration.ofHours(12));

        ArgumentCaptor<Notification> saved = ArgumentCaptor.forClass(Notification.class);
        verify(repo, times(1)).save(saved.capture());
        assertThat(saved.getValue().getTargetUsername()).isEqualTo("carol");
    }

    @Test
    void fanOutWithoutDedupeNeverChecksForDuplicates() {
        when(repo.save(any(Notification.class))).thenAnswer(inv -> inv.getArgument(0));
        service.createForUsers(List.of("bob", "carol"), "t", "m", "INFO", "SALES", "MEDIUM",
                null, "INV-1", "INVOICE", null);
        verify(repo, never()).existsUnreadDuplicate(any(), any(), any(), any(), any());
        verify(repo, times(2)).save(any(Notification.class));
    }

    @Test
    void summaryAggregatesUnreadByCategoryAndUrgency() {
        List<Object[]> rows = new ArrayList<>();
        rows.add(new Object[]{"INVENTORY", "HIGH", false, 3L});
        rows.add(new Object[]{"INVENTORY", "MEDIUM", true, 5L});
        rows.add(new Object[]{"POS", "CRITICAL", false, 1L});
        rows.add(new Object[]{null, "LOW", false, 2L});
        when(repo.summarize("alice")).thenReturn(rows);
        when(repo.countSince(eq("alice"), any())).thenReturn(4L);

        Map<String, Object> s = service.getSummary();

        assertThat(s).containsEntry("total", 11L).containsEntry("unread", 6L)
                .containsEntry("urgentUnread", 4L).containsEntry("criticalUnread", 1L)
                .containsEntry("today", 4L);
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> cats = (List<Map<String, Object>>) s.get("categories");
        assertThat(cats).anySatisfy(c -> {
            assertThat(c).containsEntry("category", "INVENTORY").containsEntry("total", 8L).containsEntry("unread", 3L);
        });
        assertThat(cats).anySatisfy(c -> assertThat(c).containsEntry("category", "OTHER").containsEntry("unread", 2L));
    }

    @Test
    void bulkActionsAreScopedToTheCurrentUserAndCapped() {
        when(repo.markReadByIds(eq("alice"), any(), any())).thenReturn(2);
        assertThat(service.markManyAsRead(List.of(1L, 2L, 2L))).isEqualTo(2);
        verify(repo).markReadByIds(eq("alice"), eq(List.of(1L, 2L)), any());

        assertThat(service.dismissMany(List.of())).isZero();
        verify(repo, never()).dismissByIds(any(), any());

        List<Long> tooMany = new ArrayList<>();
        for (long i = 0; i < 501; i++) tooMany.add(i);
        assertThatThrownBy(() -> service.dismissMany(tooMany)).isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void markAllReadCanTargetOneCategory() {
        service.markAllAsRead("inventory");
        verify(repo).markCategoryRead(eq("alice"), eq("INVENTORY"), any());
        service.markAllAsRead(null);
        verify(repo).markAllRead(eq("alice"), any());
    }

    @Test
    void someoneElsesNotificationIs404() {
        when(repo.findByIdAndTargetUsernameAndIsActiveTrue(7L, "alice")).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.markAsRead(7L)).isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("404");
    }

    @Test
    void responseNamesTheActorButNotTheSystemAuditor() {
        Notification n = new Notification();
        n.setTitle("t");
        n.setCreatedBy("cashier1");
        n.setBranchId(2L);
        NotificationResponse r = NotificationResponse.from(n, Map.of("cashier1", "Cash One"), Map.of(2L, "Dubai Mall"));
        assertThat(r.getActorUsername()).isEqualTo("cashier1");
        assertThat(r.getActorName()).isEqualTo("Cash One");
        assertThat(r.getBranchName()).isEqualTo("Dubai Mall");

        n.setCreatedBy("SYSTEM");
        assertThat(NotificationResponse.from(n).getActorUsername()).isNull();
        assertThat(NotificationResponse.parseDetails("not json")).isEmpty();
    }
}
