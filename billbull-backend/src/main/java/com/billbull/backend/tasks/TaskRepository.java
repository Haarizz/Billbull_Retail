package com.billbull.backend.tasks;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface TaskRepository extends JpaRepository<Task, Long> {

    List<Task> findByCreatedByAndIsActiveTrueOrderByCreatedAtDesc(String createdBy);

    Optional<Task> findByIdAndCreatedByAndIsActiveTrue(Long id, String createdBy);
}
