package com.billbull.backend.util;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;

class DocumentOrderingUtilTest {

    @Test
    void sortsByDocumentNumberThenDateDescending() {
        List<TestDocument> documents = new ArrayList<>(List.of(
                new TestDocument(1L, "QTN-0007", LocalDate.of(2026, 4, 15)),
                new TestDocument(2L, "QTN-0009", LocalDate.of(2026, 4, 14)),
                new TestDocument(3L, "QTN-0008", LocalDate.of(2026, 4, 17)),
                new TestDocument(4L, "QTN-0010", LocalDate.of(2026, 4, 16))));

        DocumentOrderingUtil.sortByDocumentNumberAndDateDesc(
                documents,
                TestDocument::date,
                TestDocument::number,
                TestDocument::id);

        assertEquals(List.of(4L, 2L, 3L, 1L), documents.stream().map(TestDocument::id).toList());
    }

    @Test
    void sortsPlainSerialNumbersDescending() {
        List<TestDocument> documents = new ArrayList<>(List.of(
                new TestDocument(1L, "1", LocalDate.of(2026, 4, 15)),
                new TestDocument(2L, "2", LocalDate.of(2026, 4, 16)),
                new TestDocument(3L, "3", LocalDate.of(2026, 4, 17)),
                new TestDocument(4L, "4", LocalDate.of(2026, 4, 14)),
                new TestDocument(10L, "10", LocalDate.of(2026, 4, 13))));

        DocumentOrderingUtil.sortByDocumentNumberAndDateDesc(
                documents,
                TestDocument::date,
                TestDocument::number,
                TestDocument::id);

        assertEquals(List.of(10L, 4L, 3L, 2L, 1L), documents.stream().map(TestDocument::id).toList());
    }

    private record TestDocument(Long id, String number, LocalDate date) {
    }
}
