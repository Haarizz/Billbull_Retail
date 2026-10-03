package com.billbull.backend.inventory.category;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.billbull.backend.inventory.product.ProductRepository;

@ExtendWith(MockitoExtension.class)
class ProductCategoryServiceTest {

    @Mock private ProductCategoryRepository repository;
    @Mock private ProductRepository productRepo;

    @InjectMocks private ProductCategoryService service;

    @Test
    void getAllAttachesCaseInsensitiveProductCounts() {
        when(repository.findByIsActiveTrueOrderByNameAsc())
                .thenReturn(List.of(category(1L, "General", true), category(2L, "Premium", true)));
        when(productRepo.countActiveByCategory()).thenReturn(List.<Object[]>of(new Object[] { "general", 7L }));

        List<ProductCategoryResponse> result = service.getAll();

        assertEquals(7L, result.get(0).getCount());
        assertEquals(0L, result.get(1).getCount());
    }

    @Test
    void createTrimsAndCollapsesWhitespace() {
        when(repository.findFirstByNameIgnoreCase("Home Decor")).thenReturn(Optional.empty());
        when(repository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        ProductCategoryResponse res = service.create(request("  Home   Decor "));

        assertEquals("Home Decor", res.getName());
    }

    @Test
    void createRejectsActiveDuplicateIgnoringCase() {
        when(repository.findFirstByNameIgnoreCase("general")).thenReturn(Optional.of(category(1L, "General", true)));

        assertThrows(IllegalStateException.class, () -> service.create(request("general")));
        verify(repository, never()).save(any());
    }

    @Test
    void createRestoresSoftDeletedRow() {
        ProductCategory deleted = category(5L, "Seasonal", false);
        when(repository.findFirstByNameIgnoreCase("Seasonal")).thenReturn(Optional.of(deleted));
        when(repository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        ProductCategoryResponse res = service.create(request("Seasonal"));

        assertTrue(deleted.isActive());
        assertEquals(5L, res.getId());
    }

    @Test
    void registerIfMissingReturnsMasterSpelling() {
        when(repository.findFirstByNameIgnoreCase("general")).thenReturn(Optional.of(category(1L, "General", true)));

        assertEquals("General", service.registerIfMissing("general"));
        verify(repository, never()).save(any());
    }

    @Test
    void registerIfMissingAddsUnknownName() {
        when(repository.findFirstByNameIgnoreCase("Toys")).thenReturn(Optional.empty());

        assertEquals("Toys", service.registerIfMissing(" Toys "));
        verify(repository).save(any());
    }

    @Test
    void registerIfMissingLeavesBlankAlone() {
        assertEquals(null, service.registerIfMissing(null));
        assertEquals("  ", service.registerIfMissing("  "));
        verify(repository, never()).findFirstByNameIgnoreCase(anyString());
    }

    @Test
    void updateRenamesProductsCarryingOldName() {
        ProductCategory c = category(3L, "Clearance", true);
        when(repository.findById(3L)).thenReturn(Optional.of(c));
        when(repository.findFirstByNameIgnoreCaseAndIsActiveTrue("Sale")).thenReturn(Optional.empty());
        when(repository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        service.update(3L, request("Sale"));

        verify(productRepo).renameCategory("Clearance", "Sale");
    }

    @Test
    void deleteBlockedWhileProductsUseCategory() {
        ProductCategory c = category(1L, "General", true);
        when(repository.findById(1L)).thenReturn(Optional.of(c));
        when(productRepo.countActiveByCategory("General")).thenReturn(4L);

        assertThrows(IllegalStateException.class, () -> service.delete(1L));
        assertTrue(c.isActive());
    }

    @Test
    void deleteSoftDeletesUnusedCategory() {
        ProductCategory c = category(2L, "Premium", true);
        when(repository.findById(2L)).thenReturn(Optional.of(c));
        when(productRepo.countActiveByCategory("Premium")).thenReturn(0L);

        service.delete(2L);

        assertFalse(c.isActive());
    }

    // ── fixtures ──

    private static ProductCategory category(Long id, String name, boolean active) {
        ProductCategory c = new ProductCategory();
        c.setId(id);
        c.setName(name);
        c.setActive(active);
        return c;
    }

    private static ProductCategoryRequest request(String name) {
        ProductCategoryRequest r = new ProductCategoryRequest();
        r.setName(name);
        return r;
    }
}
