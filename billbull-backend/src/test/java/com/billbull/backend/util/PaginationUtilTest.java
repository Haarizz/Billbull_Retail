package com.billbull.backend.util;

import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThat;

class PaginationUtilTest {

    @Test
    void hydrateRunsOnlyOnTheVisiblePage() {
        List<Row> source = rows(75);
        List<Row> hydrated = new ArrayList<>();

        PageResponse<Row> page = PaginationUtil.paginate(source, 1, 30, "", "", visible -> {
            hydrated.addAll(visible);
            return visible;
        });

        assertThat(hydrated).extracting(r -> r.number).containsExactlyElementsOf(
                IntStream.range(30, 60).mapToObj(i -> "INV-" + i).toList());
        assertThat(page.getTotalElements()).isEqualTo(75);
        assertThat(page.getTotalPages()).isEqualTo(3);
        assertThat(page.getPage()).isEqualTo(1);
    }

    @Test
    void searchAndStatusFilterBeforeHydrateAndHydratedRowsAreReturned() {
        List<Row> source = rows(10);
        source.get(3).status = "PAID";
        source.get(7).status = "PAID";

        PageResponse<Row> page = PaginationUtil.paginate(source, 0, 30, "inv-7", "paid",
                visible -> visible.stream().map(r -> new Row(r.number + "-full", r.status)).toList());

        assertThat(page.getTotalElements()).isEqualTo(1);
        assertThat(page.getContent()).extracting(r -> r.number).containsExactly("INV-7-full");
    }

    @Test
    void emptyPageStillHydratesNothingAndKeepsTotals() {
        PageResponse<Row> page = PaginationUtil.paginate(rows(5), 3, 30, "", "", visible -> {
            assertThat(visible).isEmpty();
            return visible;
        });

        assertThat(page.getContent()).isEmpty();
        assertThat(page.getTotalElements()).isEqualTo(5);
    }

    private static List<Row> rows(int count) {
        List<Row> rows = new ArrayList<>();
        for (int i = 0; i < count; i++) rows.add(new Row("INV-" + i, "UNPAID"));
        return rows;
    }

    static class Row {
        String number;
        String status;

        Row(String number, String status) {
            this.number = number;
            this.status = status;
        }
    }
}
