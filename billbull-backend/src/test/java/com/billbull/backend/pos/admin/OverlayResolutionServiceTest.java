package com.billbull.backend.pos.admin;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

class OverlayResolutionServiceTest {

    @Mock
    private CorrectionOverlayRepository overlayRepository;

    @Mock
    private ObjectMapper objectMapper;

    @InjectMocks
    private OverlayResolutionService service;

    static class TestDto {
        Long id;
        String name;

        public TestDto(Long id, String name) {
            this.id = id;
            this.name = name;
        }

        public Long getId() {
            return id;
        }
    }

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
    }

    @Test
    void testResolveOverlays_EmptyCollection() {
        List<TestDto> result = service.resolveOverlays(CorrectionTargetType.RECEIPT_VOUCHER, Collections.emptyList(), TestDto::getId);
        assertTrue(result.isEmpty());
    }

    @Test
    void testResolveOverlays_NoOverlays() {
        TestDto dto1 = new TestDto(1L, "Original 1");
        TestDto dto2 = new TestDto(2L, "Original 2");

        when(overlayRepository.findAppliedForTargetsOrderByVersionDesc(eq(CorrectionTargetType.RECEIPT_VOUCHER), any()))
                .thenReturn(Collections.emptyList());

        List<TestDto> result = service.resolveOverlays(CorrectionTargetType.RECEIPT_VOUCHER, Arrays.asList(dto1, dto2), TestDto::getId);
        assertEquals(2, result.size());
        assertEquals("Original 1", result.get(0).name);
        assertEquals("Original 2", result.get(1).name);
    }

    @Test
    void testResolveOverlays_OneOverlay() throws Exception {
        TestDto dto1 = new TestDto(1L, "Original 1");
        TestDto dto2 = new TestDto(2L, "Original 2");

        CorrectionOverlay overlay = new CorrectionOverlay();
        overlay.setTargetId(1L);
        overlay.setCorrectedSnapshotJson("{\"name\":\"Corrected 1\"}");

        when(overlayRepository.findAppliedForTargetsOrderByVersionDesc(eq(CorrectionTargetType.RECEIPT_VOUCHER), any()))
                .thenReturn(Collections.singletonList(overlay));

        TestDto correctedDto1 = new TestDto(1L, "Corrected 1");
        
        com.fasterxml.jackson.databind.ObjectReader reader = org.mockito.Mockito.mock(com.fasterxml.jackson.databind.ObjectReader.class);
        when(objectMapper.readerForUpdating(dto1)).thenReturn(reader);
        when(reader.readValue("{\"name\":\"Corrected 1\"}")).thenReturn(correctedDto1);

        List<TestDto> result = service.resolveOverlays(CorrectionTargetType.RECEIPT_VOUCHER, Arrays.asList(dto1, dto2), TestDto::getId);
        assertEquals(2, result.size());
        assertEquals("Corrected 1", result.get(0).name);
        assertEquals("Original 2", result.get(1).name);
    }

    @Test
    void testResolveOverlays_MultipleOverlays() throws Exception {
        TestDto dto1 = new TestDto(1L, "Original 1");
        TestDto dto2 = new TestDto(2L, "Original 2");

        CorrectionOverlay overlay1 = new CorrectionOverlay();
        overlay1.setTargetId(1L);
        overlay1.setVersion(1);
        overlay1.setCorrectedSnapshotJson("{\"name\":\"Corrected 1\"}");

        CorrectionOverlay overlay2 = new CorrectionOverlay();
        overlay2.setTargetId(2L);
        overlay2.setVersion(1);
        overlay2.setCorrectedSnapshotJson("{\"name\":\"Corrected 2\"}");

        when(overlayRepository.findAppliedForTargetsOrderByVersionDesc(eq(CorrectionTargetType.RECEIPT_VOUCHER), any()))
                .thenReturn(Arrays.asList(overlay1, overlay2));

        TestDto correctedDto1 = new TestDto(1L, "Corrected 1");
        TestDto correctedDto2 = new TestDto(2L, "Corrected 2");
        
        com.fasterxml.jackson.databind.ObjectReader reader1 = org.mockito.Mockito.mock(com.fasterxml.jackson.databind.ObjectReader.class);
        when(objectMapper.readerForUpdating(dto1)).thenReturn(reader1);
        when(reader1.readValue("{\"name\":\"Corrected 1\"}")).thenReturn(correctedDto1);

        com.fasterxml.jackson.databind.ObjectReader reader2 = org.mockito.Mockito.mock(com.fasterxml.jackson.databind.ObjectReader.class);
        when(objectMapper.readerForUpdating(dto2)).thenReturn(reader2);
        when(reader2.readValue("{\"name\":\"Corrected 2\"}")).thenReturn(correctedDto2);

        List<TestDto> result = service.resolveOverlays(CorrectionTargetType.RECEIPT_VOUCHER, Arrays.asList(dto1, dto2), TestDto::getId);
        assertEquals(2, result.size());
        assertEquals("Corrected 1", result.get(0).name);
        assertEquals("Corrected 2", result.get(1).name);
    }

    @Test
    void testResolveOverlays_DuplicateIds() throws Exception {
        TestDto dto1a = new TestDto(1L, "Original 1a");
        TestDto dto1b = new TestDto(1L, "Original 1b");

        CorrectionOverlay overlay1 = new CorrectionOverlay();
        overlay1.setTargetId(1L);
        overlay1.setVersion(2);
        overlay1.setCorrectedSnapshotJson("{\"name\":\"Corrected 1\"}");

        when(overlayRepository.findAppliedForTargetsOrderByVersionDesc(eq(CorrectionTargetType.RECEIPT_VOUCHER), any()))
                .thenReturn(Collections.singletonList(overlay1));

        TestDto correctedDto1a = new TestDto(1L, "Corrected 1");
        TestDto correctedDto1b = new TestDto(1L, "Corrected 1");

        com.fasterxml.jackson.databind.ObjectReader reader1a = org.mockito.Mockito.mock(com.fasterxml.jackson.databind.ObjectReader.class);
        when(objectMapper.readerForUpdating(dto1a)).thenReturn(reader1a);
        when(reader1a.readValue("{\"name\":\"Corrected 1\"}")).thenReturn(correctedDto1a);

        com.fasterxml.jackson.databind.ObjectReader reader1b = org.mockito.Mockito.mock(com.fasterxml.jackson.databind.ObjectReader.class);
        when(objectMapper.readerForUpdating(dto1b)).thenReturn(reader1b);
        when(reader1b.readValue("{\"name\":\"Corrected 1\"}")).thenReturn(correctedDto1b);

        List<TestDto> result = service.resolveOverlays(CorrectionTargetType.RECEIPT_VOUCHER, Arrays.asList(dto1a, dto1b), TestDto::getId);
        assertEquals(2, result.size());
        assertEquals("Corrected 1", result.get(0).name);
        assertEquals("Corrected 1", result.get(1).name);
    }
}