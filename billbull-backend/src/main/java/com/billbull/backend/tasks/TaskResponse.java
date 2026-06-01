package com.billbull.backend.tasks;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.List;

public class TaskResponse {

    private Long id;
    private String title;
    private String description;
    private String priority;
    private String status;
    private LocalDate dueDate;
    private String assignedTo;
    private List<String> tags;
    private String category;
    private LocalDate completedDate;
    private String createdBy;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    public static TaskResponse from(Task t) {
        TaskResponse r = new TaskResponse();
        r.id            = t.getId();
        r.title         = t.getTitle();
        r.description   = t.getDescription();
        r.priority      = t.getPriority();
        r.status        = t.getStatus();
        r.dueDate       = t.getDueDate();
        r.assignedTo    = t.getAssignedTo();
        r.tags          = t.getTags() != null && !t.getTags().isBlank()
                            ? Arrays.stream(t.getTags().split(","))
                                    .map(String::trim)
                                    .filter(s -> !s.isBlank())
                                    .toList()
                            : List.of();
        r.category      = t.getCategory();
        r.completedDate = t.getCompletedDate();
        r.createdBy     = t.getCreatedBy();
        r.createdAt     = t.getCreatedAt();
        r.updatedAt     = t.getUpdatedAt();
        return r;
    }

    // ── Getters ───────────────────────────────────────────────────────────────

    public Long getId() { return id; }
    public String getTitle() { return title; }
    public String getDescription() { return description; }
    public String getPriority() { return priority; }
    public String getStatus() { return status; }
    public LocalDate getDueDate() { return dueDate; }
    public String getAssignedTo() { return assignedTo; }
    public List<String> getTags() { return tags; }
    public String getCategory() { return category; }
    public LocalDate getCompletedDate() { return completedDate; }
    public String getCreatedBy() { return createdBy; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
}
