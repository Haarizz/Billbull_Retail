package com.billbull.backend.sales.delivery;

import com.billbull.backend.inventory.product.Product;

import jakarta.persistence.*;

@Entity
@Table(name = "delivery_note_items")
public class DeliveryNoteItem {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	private String itemCode;
	private String barcode;
	private String description;
	private String unit;

	private Integer orderedQty;
	private Integer prevDeliveredQty;
	private Integer currentQty;
	private Integer boxes;
	private Integer foc;
	private String focUnit;
	@Column(length = 500)
	private String remarks;
	private String image;
	private Long binId;
	private Long salesOrderItemId;
	private Long sourceLineId;

	private Double price;
	private Double disc;
	private Double tax;
	private Double cost;

	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "product_id", nullable = false)
	private Product product;

	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "delivery_note_id")
	private DeliveryNote deliveryNote;

	public Long getId() {
		return id;
	}

	public String getItemCode() {
		return itemCode;
	}

	public String getBarcode() {
		return barcode;
	}

	public String getDescription() {
		return description;
	}

	public String getUnit() {
		return unit;
	}

	public Integer getOrderedQty() {
		return orderedQty;
	}

	public Integer getPrevDeliveredQty() {
		return prevDeliveredQty;
	}

	public Integer getCurrentQty() {
		return currentQty;
	}

	public Integer getBoxes() {
		return boxes;
	}

	public DeliveryNote getDeliveryNote() {
		return deliveryNote;
	}

	public void setId(Long id) {
		this.id = id;
	}

	public void setItemCode(String itemCode) {
		this.itemCode = itemCode;
	}

	public void setBarcode(String barcode) {
		this.barcode = barcode;
	}

	public void setDescription(String description) {
		this.description = description;
	}

	public void setUnit(String unit) {
		this.unit = unit;
	}

	public void setOrderedQty(Integer orderedQty) {
		this.orderedQty = orderedQty;
	}

	public void setPrevDeliveredQty(Integer prevDeliveredQty) {
		this.prevDeliveredQty = prevDeliveredQty;
	}

	public void setCurrentQty(Integer currentQty) {
		this.currentQty = currentQty;
	}

	public void setBoxes(Integer boxes) {
		this.boxes = boxes;
	}

	public void setDeliveryNote(DeliveryNote deliveryNote) {
		this.deliveryNote = deliveryNote;
	}

	public Product getProduct() {
		return product;
	}

	public void setProduct(Product product) {
		this.product = product;
	}

	public Integer getFoc() {
		return foc;
	}

	public void setFoc(Integer foc) {
		this.foc = foc;
	}

	public String getFocUnit() {
		return focUnit;
	}

	public void setFocUnit(String focUnit) {
		this.focUnit = focUnit;
	}

	public String getRemarks() {
		return remarks;
	}

	public void setRemarks(String remarks) {
		this.remarks = remarks;
	}

	public String getImage() {
		return image;
	}

	public void setImage(String image) {
		this.image = image;
	}

	public Long getBinId() {
		return binId;
	}

	public void setBinId(Long binId) {
		this.binId = binId;
	}

	public Long getSalesOrderItemId() {
		return salesOrderItemId;
	}

	public void setSalesOrderItemId(Long salesOrderItemId) {
		this.salesOrderItemId = salesOrderItemId;
	}

	public Long getSourceLineId() {
		return sourceLineId;
	}

	public void setSourceLineId(Long sourceLineId) {
		this.sourceLineId = sourceLineId;
	}

	public Double getPrice() {
		return price;
	}

	public void setPrice(Double price) {
		this.price = price;
	}

	public Double getDisc() {
		return disc;
	}

	public void setDisc(Double disc) {
		this.disc = disc;
	}

	public Double getTax() {
		return tax;
	}

	public void setTax(Double tax) {
		this.tax = tax;
	}

	public Double getCost() {
		return cost;
	}

	public void setCost(Double cost) {
		this.cost = cost;
	}
}
