package com.billbull.backend.inventory.warehouse;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface WarehouseRepository extends JpaRepository<Warehouse, Long> {
	Optional<Warehouse> findByName(String name);

	List<Warehouse> findByBranch_Id(Long branchId);

	List<Warehouse> findByBranchIsNull();

	/**
	 * Branch id of a warehouse, or null when the warehouse has no branch (global) or does not
	 * exist. Projection-only (no entity/association load) — used by StockMovementService's
	 * write-path branch stamping (Branch-Level Inventory Phase 2). Returns null safely for a
	 * missing warehouse so stamping never throws on an orphan warehouse_id.
	 */
	@Query("SELECT w.branch.id FROM Warehouse w WHERE w.id = :warehouseId")
	Long findBranchIdByWarehouseId(@Param("warehouseId") Long warehouseId);

	/**
	 * Branch-Level Inventory Phase 5 — warehouses in the given branches PLUS global
	 * (branch-less, {@code branch_id IS NULL}) warehouses, which are visible to every branch.
	 * Used by the branch-user list path only when {@code inventory.branch-scope.enabled} is on
	 * (via InventoryBranchScopeResolver). The existing {@link #findByBranch_Id(Long)} remains the
	 * toggle-off path (byte-identical to today, which excludes global warehouses). {@code branchIds}
	 * is never empty (ListScope -1 sentinel), so the IN clause is always valid.
	 */
	@Query("SELECT w FROM Warehouse w WHERE w.branch.id IN :branchIds OR w.branch IS NULL")
	List<Warehouse> findByBranchIdInOrGlobal(@Param("branchIds") java.util.Collection<Long> branchIds);
}
