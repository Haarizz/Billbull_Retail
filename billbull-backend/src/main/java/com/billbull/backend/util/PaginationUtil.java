package com.billbull.backend.util;

import java.lang.reflect.Field;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

public final class PaginationUtil {
    public static final int MAX_PAGE_SIZE = 30;

    private PaginationUtil() {}

    public static <T> PageResponse<T> paginate(List<T> source, int page, int size, String search, String status) {
        int normalizedPage = Math.max(page, 0);
        int normalizedSize = Math.max(1, Math.min(size, MAX_PAGE_SIZE));
        List<T> filtered = filter(source == null ? List.of() : source, search, status);
        int total = filtered.size();
        int from = Math.min(normalizedPage * normalizedSize, total);
        int to = Math.min(from + normalizedSize, total);
        int totalPages = total == 0 ? 0 : (int) Math.ceil((double) total / normalizedSize);
        return new PageResponse<>(filtered.subList(from, to), normalizedPage, normalizedSize, total, totalPages);
    }

    private static <T> List<T> filter(List<T> source, String search, String status) {
        String normalizedSearch = normalize(search);
        String normalizedStatus = normalize(status);
        if (normalizedSearch.isBlank() && normalizedStatus.isBlank()) return source;

        List<T> result = new ArrayList<>();
        for (T item : source) {
            if (!normalizedStatus.isBlank() && !matchesStatus(item, normalizedStatus)) continue;
            if (!normalizedSearch.isBlank() && !matchesSearch(item, normalizedSearch)) continue;
            result.add(item);
        }
        return result;
    }

    private static String normalize(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    }

    private static boolean matchesStatus(Object item, String status) {
        Object value = readField(item, "status");
        if (value == null) return false;
        String actual = normalize(String.valueOf(value)).replace("_", " ");
        String expected = status.replace("_", " ");
        return actual.equals(expected);
    }

    private static boolean matchesSearch(Object item, String search) {
        if (item == null) return false;
        for (Field field : item.getClass().getDeclaredFields()) {
            if (!String.class.equals(field.getType())) continue;
            try {
                field.setAccessible(true);
                Object value = field.get(item);
                if (value != null && normalize(String.valueOf(value)).contains(search)) {
                    return true;
                }
            } catch (IllegalAccessException ignored) {
            }
        }
        return false;
    }

    private static Object readField(Object item, String name) {
        if (item == null) return null;
        Class<?> type = item.getClass();
        while (type != null) {
            try {
                Field field = type.getDeclaredField(name);
                field.setAccessible(true);
                return field.get(item);
            } catch (NoSuchFieldException e) {
                type = type.getSuperclass();
            } catch (IllegalAccessException e) {
                return null;
            }
        }
        return null;
    }
}
