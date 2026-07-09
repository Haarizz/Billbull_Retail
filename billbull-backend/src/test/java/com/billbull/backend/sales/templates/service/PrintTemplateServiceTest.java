package com.billbull.backend.sales.templates.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.billbull.backend.sales.templates.model.PrintTemplate;
import com.billbull.backend.sales.templates.repository.PrintTemplateRepository;

@ExtendWith(MockitoExtension.class)
class PrintTemplateServiceTest {

    @Mock
    private PrintTemplateRepository printTemplateRepository;

    private PrintTemplateService service;

    @BeforeEach
    void setUp() {
        service = new PrintTemplateService(printTemplateRepository);
    }

    @Test
    void creatingBranchDefaultDoesNotUnsetAnotherBranchsDefault() {
        PrintTemplate branchATemplate = template(1L, "Sales Invoice", 100L, true);
        when(printTemplateRepository.findByCategoryAndBranchId("Sales Invoice", 200L)).thenReturn(List.of());
        when(printTemplateRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        PrintTemplate newDefault = template(null, "Sales Invoice", 200L, true);
        service.createTemplate(newDefault);

        // Branch A's default row is scoped to branchId=100, never queried/touched for branch 200's save.
        verify(printTemplateRepository, never()).findByCategoryAndBranchId("Sales Invoice", 100L);
        assertTrue(branchATemplate.isDefault());
    }

    @Test
    void creatingGlobalDefaultUnsetsOtherGlobalDefaultsOnly() {
        PrintTemplate existingGlobalDefault = template(5L, "Sales Invoice", null, true);
        when(printTemplateRepository.findByCategoryAndBranchIdIsNull("Sales Invoice"))
                .thenReturn(List.of(existingGlobalDefault));
        when(printTemplateRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        PrintTemplate newGlobalDefault = template(null, "Sales Invoice", null, true);
        service.createTemplate(newGlobalDefault);

        assertFalse(existingGlobalDefault.isDefault());
        verify(printTemplateRepository, never()).findByCategoryAndBranchId(any(), any());
    }

    @Test
    void resolveTemplatePrefersBranchSpecificOverGlobal() {
        PrintTemplate branchDefault = template(1L, "Sales Invoice", 100L, true);
        when(printTemplateRepository.findByCategoryAndBranchId("Sales Invoice", 100L))
                .thenReturn(List.of(branchDefault));

        PrintTemplate resolved = service.resolveTemplate("Sales Invoice", 100L, () -> {
            throw new AssertionError("system default should not be used when a branch default exists");
        });

        assertSame(branchDefault, resolved);
        verify(printTemplateRepository, never()).findByCategoryAndBranchIdIsNull(any());
    }

    @Test
    void resolveTemplateFallsBackToGlobalWhenNoBranchSpecificRowExists() {
        when(printTemplateRepository.findByCategoryAndBranchId("Sales Invoice", 100L)).thenReturn(List.of());
        PrintTemplate globalDefault = template(9L, "Sales Invoice", null, true);
        when(printTemplateRepository.findByCategoryAndBranchIdIsNull("Sales Invoice"))
                .thenReturn(List.of(globalDefault));

        PrintTemplate resolved = service.resolveTemplate("Sales Invoice", 100L, () -> {
            throw new AssertionError("system default should not be used when a global default exists");
        });

        assertSame(globalDefault, resolved);
    }

    @Test
    void resolveTemplateFallsBackToSystemDefaultWhenNothingResolved() {
        when(printTemplateRepository.findByCategoryAndBranchId("Sales Invoice", 100L)).thenReturn(List.of());
        when(printTemplateRepository.findByCategoryAndBranchIdIsNull("Sales Invoice")).thenReturn(List.of());
        PrintTemplate systemDefault = template(null, "Sales Invoice", null, true);

        PrintTemplate resolved = service.resolveTemplate("Sales Invoice", 100L, () -> systemDefault);

        assertSame(systemDefault, resolved);
    }

    @Test
    void resolveTemplateWithNullBranchIdSkipsStraightToGlobal() {
        PrintTemplate globalDefault = template(9L, "Sales Invoice", null, true);
        when(printTemplateRepository.findByCategoryAndBranchIdIsNull("Sales Invoice"))
                .thenReturn(List.of(globalDefault));

        PrintTemplate resolved = service.resolveTemplate("Sales Invoice", null, () -> {
            throw new AssertionError("should not reach system default");
        });

        assertSame(globalDefault, resolved);
        verify(printTemplateRepository, never()).findByCategoryAndBranchId(any(), any());
    }

    private PrintTemplate template(Long id, String category, Long branchId, boolean isDefault) {
        PrintTemplate t = new PrintTemplate();
        t.setId(id);
        t.setCategory(category);
        t.setBranchId(branchId);
        t.setDefault(isDefault);
        return t;
    }
}
