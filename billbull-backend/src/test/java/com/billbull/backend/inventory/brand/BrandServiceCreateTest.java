package com.billbull.backend.inventory.brand;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import com.billbull.backend.inventory.product.ProductRepository;
import com.billbull.backend.inventory.scope.InventoryBranchScopeResolver;
import com.billbull.backend.inventory.scope.MasterDataBranchService;

/**
 * Creating a brand whose name was previously used by a soft-deleted brand: the deleted row still
 * holds the DB unique index, so the service must revive it rather than insert a duplicate.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class BrandServiceCreateTest {

    @Mock private BrandRepository repository;
    @Mock private BrandLogoStorageService logoStorage;
    @Mock private ProductRepository productRepo;
    @Mock private InventoryBranchScopeResolver scopeResolver;
    @Mock private MasterDataBranchService masterBranch;

    @InjectMocks private BrandService service;

    @Test
    void createRevivesSoftDeletedBrandWithSameName() {
        Brand deleted = brand(7L, "Nestle", "NES");
        deleted.setActive(false);
        stubNoActiveDuplicates();
        when(repository.findByActiveFalseAndNameIgnoreCase("Nestle")).thenReturn(List.of(deleted));
        when(repository.findByActiveFalseAndCodeIgnoreCase("NES")).thenReturn(List.of(deleted));
        when(repository.save(any(Brand.class))).thenAnswer(inv -> inv.getArgument(0));

        service.create(request("Nestle", "NES"), null);

        ArgumentCaptor<Brand> saved = ArgumentCaptor.forClass(Brand.class);
        verify(repository).save(saved.capture());
        assertEquals(7L, saved.getValue().getId(), "the deleted row is reused, not duplicated");
        assertTrue(saved.getValue().isActive());
    }

    @Test
    void createRejectsNameAlreadyHeldByAnActiveBrand() {
        when(repository.existsByCodeAndActiveTrue("NES")).thenReturn(false);
        when(repository.existsByNameAndActiveTrue("Nestle")).thenReturn(true);

        RuntimeException ex = assertThrows(RuntimeException.class,
                () -> service.create(request("Nestle", "NES"), null));

        assertEquals("Brand name already exists", ex.getMessage());
        verify(repository, never()).save(any(Brand.class));
    }

    @Test
    void createReportsAConflictWhenNameAndCodeBelongToDifferentDeletedBrands() {
        Brand deletedName = brand(7L, "Nestle", "NES");
        deletedName.setActive(false);
        Brand deletedCode = brand(9L, "Nescafe", "NES2");
        deletedCode.setActive(false);
        stubNoActiveDuplicates();
        when(repository.findByActiveFalseAndNameIgnoreCase("Nestle")).thenReturn(List.of(deletedName));
        when(repository.findByActiveFalseAndCodeIgnoreCase("NES2")).thenReturn(List.of(deletedCode));

        IllegalStateException ex = assertThrows(IllegalStateException.class,
                () -> service.create(request("Nestle", "NES2"), null));

        assertTrue(ex.getMessage().contains("NES2"), ex.getMessage());
        verify(repository, never()).save(any(Brand.class));
    }

    @Test
    void createInsertsANewBrandWhenNothingHoldsTheName() {
        stubNoActiveDuplicates();
        when(repository.findByActiveFalseAndNameIgnoreCase(anyString())).thenReturn(List.of());
        when(repository.findByActiveFalseAndCodeIgnoreCase(anyString())).thenReturn(List.of());
        when(repository.save(any(Brand.class))).thenAnswer(inv -> inv.getArgument(0));

        service.create(request("Lipton", "LIP"), null);

        ArgumentCaptor<Brand> saved = ArgumentCaptor.forClass(Brand.class);
        verify(repository).save(saved.capture());
        assertEquals(null, saved.getValue().getId(), "a brand nobody holds is a fresh insert");
        assertEquals("Lipton", saved.getValue().getName());
    }

    // ---- fixtures ----

    private void stubNoActiveDuplicates() {
        when(repository.existsByCodeAndActiveTrue(anyString())).thenReturn(false);
        when(repository.existsByNameAndActiveTrue(anyString())).thenReturn(false);
    }

    private BrandRequest request(String name, String code) {
        BrandRequest req = new BrandRequest();
        req.name = name;
        req.code = code;
        req.active = true;
        return req;
    }

    private Brand brand(Long id, String name, String code) {
        Brand brand = new Brand();
        brand.setId(id);
        brand.setName(name);
        brand.setCode(code);
        return brand;
    }
}
