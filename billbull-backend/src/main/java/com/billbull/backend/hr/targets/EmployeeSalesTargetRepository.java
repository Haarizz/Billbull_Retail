package com.billbull.backend.hr.targets;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

public interface EmployeeSalesTargetRepository extends JpaRepository<EmployeeSalesTarget, Long> {

    Optional<EmployeeSalesTarget> findByEmployeeIdAndTargetMonth(Long employeeId, LocalDate targetMonth);

    /** Every target for one month — one query behind the whole admin grid. */
    List<EmployeeSalesTarget> findByTargetMonth(LocalDate targetMonth);
}
