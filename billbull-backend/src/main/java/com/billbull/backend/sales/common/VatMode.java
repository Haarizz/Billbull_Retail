package com.billbull.backend.sales.common;

/**
 * Whether prices entered on a sales document line are treated as VAT-exclusive
 * or VAT-inclusive when computing taxable amount, tax, and line total.
 *
 * EXCLUSIVE (default): price excludes tax. Tax is added on top.
 * INCLUSIVE: price already includes tax. Tax is extracted out of the line.
 *
 * Used by Quotation, Sales Order, and Sales Invoice entities. The mode is
 * captured per-document so a single tenant can issue both kinds.
 */
public enum VatMode {
    EXCLUSIVE,
    INCLUSIVE
}
