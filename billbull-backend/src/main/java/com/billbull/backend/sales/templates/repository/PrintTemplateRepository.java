package com.billbull.backend.sales.templates.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.billbull.backend.sales.templates.model.PrintTemplate;

@Repository
public interface PrintTemplateRepository extends JpaRepository<PrintTemplate, Long> {
    List<PrintTemplate> findByCategory(String category);
}
