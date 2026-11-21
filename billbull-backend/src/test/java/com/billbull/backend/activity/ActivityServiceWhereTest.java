package com.billbull.backend.activity;

import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Visibility is enforced in the WHERE clause; these pin who can see what. */
class ActivityServiceWhereTest {

    private static ActivityService.ActivityFilter filter(String username, String module, Long branchId) {
        return new ActivityService.ActivityFilter(username, module, null, null, null, branchId, null);
    }

    @Test
    void selfScopeIsPinnedToTheViewerAndIgnoresAUsernameFilter() {
        var viewer = new ActivityService.Viewer("cashier1", ActivityService.Scope.SELF, Set.of(1L), 1L);
        var w = ActivityService.buildWhere(viewer, filter("admin", null, null), null);

        assertThat(w.sql.toString()).contains("a.username = :");
        assertThat(w.params).containsValue("cashier1");
        assertThat(w.params).doesNotContainValue("admin");
    }

    @Test
    void branchScopeSeesItsBranchesOrItsOwnRows() {
        var viewer = new ActivityService.Viewer("ba", ActivityService.Scope.BRANCH, Set.of(2L, 3L), null);
        var w = ActivityService.buildWhere(viewer, null, null);

        assertThat(w.sql.toString()).contains("(a.branch_id IN (");
        assertThat(w.params).containsValue(Set.of(2L, 3L)).containsValue("ba");
    }

    @Test
    void branchScopeCannotAskForAnotherBranch() {
        var viewer = new ActivityService.Viewer("ba", ActivityService.Scope.BRANCH, Set.of(2L), null);
        assertThatThrownBy(() -> ActivityService.buildWhere(viewer, filter(null, null, 9L), null))
                .isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void adminWithAnActiveBranchIsNarrowedToItPlusBranchlessRows() {
        var viewer = new ActivityService.Viewer("admin", ActivityService.Scope.ALL, Set.of(), 4L);
        var w = ActivityService.buildWhere(viewer, null, null);
        assertThat(w.sql.toString()).contains("a.branch_id IS NULL");
        assertThat(w.params).containsValue(4L);

        var all = ActivityService.buildWhere(
                new ActivityService.Viewer("admin", ActivityService.Scope.ALL, Set.of(), null), null, null);
        assertThat(all.sql.toString()).doesNotContain("branch_id");
    }

    @Test
    void noiseIsAlwaysExcludedAndModuleFilterUsesSegmentPrefixes() {
        var viewer = new ActivityService.Viewer("admin", ActivityService.Scope.ALL, Set.of(), null);
        var w = ActivityService.buildWhere(viewer, filter(null, "purchase", null), null);

        assertThat(w.params).containsValue("%/heartbeat").containsValue("%/touch-activity");
        assertThat(w.params).containsValue("/api/purchase/%").containsValue("/api/lpos");
        assertThat(w.params).doesNotContainValue("/api/purchase%");
    }

    @Test
    void datesAreInclusiveDays() {
        var viewer = new ActivityService.Viewer("admin", ActivityService.Scope.ALL, Set.of(), null);
        var f = new ActivityService.ActivityFilter(null, null, "FAILED",
                LocalDate.of(2026, 11, 1), LocalDate.of(2026, 11, 3), null, null);
        var w = ActivityService.buildWhere(viewer, f, null);

        assertThat(w.params).containsValue(LocalDate.of(2026, 11, 1).atStartOfDay())
                .containsValue(LocalDate.of(2026, 11, 4).atStartOfDay());
        assertThat(w.sql.toString()).contains("COALESCE(a.http_status, 200) >= 400");
    }
}
