package com.billbull.backend.tasks;

import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;

@Service
@Transactional
public class TaskService {

    private final TaskRepository repo;

    public TaskService(TaskRepository repo) {
        this.repo = repo;
    }

    private String currentUser() {
        return SecurityContextHolder.getContext().getAuthentication().getName();
    }

    public List<TaskResponse> getMyTasks() {
        return repo.findByCreatedByAndIsActiveTrueOrderByCreatedAtDesc(currentUser())
                   .stream()
                   .map(TaskResponse::from)
                   .toList();
    }

    public TaskResponse create(TaskRequest req) {
        Task task = new Task();
        applyRequest(task, req);
        return TaskResponse.from(repo.save(task));
    }

    public TaskResponse update(Long id, TaskRequest req) {
        Task task = repo.findByIdAndCreatedByAndIsActiveTrue(id, currentUser())
                .orElseThrow(() -> new RuntimeException("Task not found"));
        applyRequest(task, req);
        return TaskResponse.from(repo.save(task));
    }

    public void delete(Long id) {
        Task task = repo.findByIdAndCreatedByAndIsActiveTrue(id, currentUser())
                .orElseThrow(() -> new RuntimeException("Task not found"));
        task.setActive(false);
        repo.save(task);
    }

    private void applyRequest(Task task, TaskRequest req) {
        task.setTitle(req.getTitle());
        task.setDescription(req.getDescription());
        task.setPriority(req.getPriority() != null ? req.getPriority().toUpperCase() : "MEDIUM");
        task.setStatus(req.getStatus() != null ? req.getStatus().toUpperCase().replace(" ", "_") : "TODO");
        task.setDueDate(req.getDueDate());
        task.setAssignedTo(req.getAssignedTo());
        task.setTags(req.getTags());
        task.setCategory(req.getCategory());

        if ("COMPLETED".equals(task.getStatus())) {
            task.setCompletedDate(req.getCompletedDate() != null ? req.getCompletedDate() : LocalDate.now());
        } else {
            task.setCompletedDate(null);
        }
    }
}
