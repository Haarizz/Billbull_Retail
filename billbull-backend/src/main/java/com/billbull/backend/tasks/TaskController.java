package com.billbull.backend.tasks;

import com.billbull.backend.security.ModulePermissionService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/tasks")
public class TaskController {

    private static final String MODULE = "userManagement";

    private final TaskService service;
    private final ModulePermissionService modulePermissionService;

    public TaskController(TaskService service, ModulePermissionService modulePermissionService) {
        this.service = service;
        this.modulePermissionService = modulePermissionService;
    }

    @GetMapping
    @PreAuthorize("isAuthenticated()")
    public List<TaskResponse> getMyTasks() {
        modulePermissionService.requireCanView(MODULE);
        return service.getMyTasks();
    }

    @PostMapping
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<TaskResponse> create(@Valid @RequestBody TaskRequest req) {
        modulePermissionService.requireCanCreate(MODULE);
        return ResponseEntity.ok(service.create(req));
    }

    @PutMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<TaskResponse> update(@PathVariable Long id,
                                               @Valid @RequestBody TaskRequest req) {
        modulePermissionService.requireCanEdit(MODULE);
        return ResponseEntity.ok(service.update(id, req));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        modulePermissionService.requireCanEdit(MODULE);
        service.delete(id);
        return ResponseEntity.noContent().build();
    }
}
