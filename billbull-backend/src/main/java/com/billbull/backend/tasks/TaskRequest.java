package com.billbull.backend.tasks;

import jakarta.validation.constraints.NotBlank;
import java.time.LocalDate;

public class TaskRequest {

    @NotBlank
    private String title;

    private String description;
    private String priority = "MEDIUM";
    private String status   = "TODO";
    private LocalDate dueDate;
    private String assignedTo;
    private String tags;
    private String category;
    private LocalDate completedDate;

    // ── Getters & Setters ─────────────────────────────────────────────────────

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public String getPriority() { return priority; }
    public void setPriority(String priority) { this.priority = priority; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public LocalDate getDueDate() { return dueDate; }
    public void setDueDate(LocalDate dueDate) { this.dueDate = dueDate; }

    public String getAssignedTo() { return assignedTo; }
    public void setAssignedTo(String assignedTo) { this.assignedTo = assignedTo; }

    public String getTags() { return tags; }
    public void setTags(String tags) { this.tags = tags; }

    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }

    public LocalDate getCompletedDate() { return completedDate; }
    public void setCompletedDate(LocalDate completedDate) { this.completedDate = completedDate; }
}
