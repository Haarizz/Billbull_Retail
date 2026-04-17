package com.billbull.backend.util;

import java.math.BigInteger;
import java.util.List;
import java.util.function.Function;
import java.util.regex.Pattern;

public final class DocumentOrderingUtil {

    private static final Pattern NON_DIGIT_PATTERN = Pattern.compile("\\D+");

    private DocumentOrderingUtil() {
    }

    public static <T> List<T> sortByDocumentDateAndNumberDesc(
            List<T> items,
            Function<T, ? extends Comparable<?>> dateExtractor,
            Function<T, String> documentNumberExtractor,
            Function<T, Long> idExtractor) {

        items.sort((left, right) -> {
            int comparison = compareComparableDesc(dateExtractor.apply(left), dateExtractor.apply(right));
            if (comparison != 0) {
                return comparison;
            }

            comparison = compareDocumentNumberDesc(
                    documentNumberExtractor.apply(left),
                    documentNumberExtractor.apply(right));
            if (comparison != 0) {
                return comparison;
            }

            return compareComparableDesc(idExtractor.apply(left), idExtractor.apply(right));
        });

        return items;
    }

    @SuppressWarnings({ "rawtypes", "unchecked" })
    private static int compareComparableDesc(Comparable left, Comparable right) {
        if (left == null && right == null) {
            return 0;
        }
        if (left == null) {
            return 1;
        }
        if (right == null) {
            return -1;
        }
        return right.compareTo(left);
    }

    private static int compareDocumentNumberDesc(String left, String right) {
        BigInteger leftSequence = extractDocumentSequence(left);
        BigInteger rightSequence = extractDocumentSequence(right);

        int comparison = compareComparableDesc(leftSequence, rightSequence);
        if (comparison != 0) {
            return comparison;
        }

        String normalizedLeft = normalizeDocument(left);
        String normalizedRight = normalizeDocument(right);
        return compareComparableDesc(normalizedLeft, normalizedRight);
    }

    private static BigInteger extractDocumentSequence(String documentNumber) {
        String normalized = normalizeDocument(documentNumber);
        if (normalized == null) {
            return null;
        }

        String digits = NON_DIGIT_PATTERN.matcher(normalized).replaceAll("");
        if (digits.isBlank()) {
            return null;
        }

        return new BigInteger(digits);
    }

    private static String normalizeDocument(String documentNumber) {
        if (documentNumber == null) {
            return null;
        }

        String normalized = documentNumber.trim().toUpperCase();
        return normalized.isBlank() ? null : normalized;
    }
}
