package com.billbull.backend.sales.common;

import java.math.BigDecimal;
import java.math.BigInteger;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;

/**
 * Single source of truth for the document-level Footer Discount on every sales document
 * (Quotation, Sales Order, Proforma, Sales Invoice). Pure arithmetic, no Spring.
 *
 * <p>Mirrored line-for-line by {@code src/utils/footerDiscountAllocator.js}; both sides are
 * pinned to the shared fixtures in {@code src/test/resources/footer-discount-fixtures.json}
 * (backend) and the copy the frontend tests load, so the browser preview and the saved
 * document can never disagree.
 *
 * <h3>Model</h3>
 * <pre>
 * gross        = round2(qty × price)
 * focDeduction = round2(price × focQtyInSellingUnit)
 * preDiscount  = max(0, gross − focDeduction)
 * itemDiscount = min(preDiscount, round2(preDiscount × disc% / 100))
 * base         = preDiscount − itemDiscount        (VAT-inclusive under INCLUSIVE, ex-VAT under EXCLUSIVE)
 *
 * F            = AMOUNT : min(round2(value), Σ eligible base)
 *                PERCENT: round2(Σ eligible base × min(pct,100) / 100)
 * share_i      = largest-remainder apportionment of F over eligible base_i, in whole cents
 *
 * EXCLUSIVE: taxable = base − share ; vat = round2(taxable × r/100) ; total = taxable + vat
 * INCLUSIVE: total = base − share ; taxable = round2(total × 100/(100+r)) ; vat = total − taxable
 * </pre>
 * Under INCLUSIVE a fixed footer amount is therefore the customer-facing amount ("AED 100 off
 * what you pay"), consistent with how item discounts already apply to the entered price.
 *
 * <h3>Rounding</h3>
 * Each exact share {@code F × base_i / Σbase} is floored to the cent; the leftover cents
 * (always fewer than the number of eligible lines) go one each to the lines with the largest
 * discarded fraction, ties broken by larger base, then by lower line index. The result is
 * deterministic and {@code Σ share_i == F} exactly.
 *
 * <h3>Header identity</h3>
 * {@code subTotal = Σ(taxable + share)} (equals Σ base under EXCLUSIVE), so the existing
 * {@code total = subTotal − F + Σvat} header formula and the GL's
 * {@code revenue = subTotal − billDiscountAmount} both resolve to Σ line values exactly.
 */
public final class FooterDiscountAllocator {

    private static final BigDecimal HUNDRED = BigDecimal.valueOf(100);

    private FooterDiscountAllocator() {
    }

    public enum DiscountType {
        PERCENT, AMOUNT;

        /** "amount" (any case) is AMOUNT; anything else, including null, is the legacy PERCENT. */
        public static DiscountType from(String raw) {
            return raw != null && raw.trim().equalsIgnoreCase("amount") ? AMOUNT : PERCENT;
        }

        /**
         * Resolves a stored/sent header. An explicit type wins; with no type, a money amount
         * and no percentage means an older client that only sent the amount.
         */
        public static DiscountType resolve(String raw, BigDecimal percent, BigDecimal amount) {
            if (raw != null && !raw.isBlank()) {
                return from(raw);
            }
            boolean hasPercent = percent != null && percent.signum() > 0;
            boolean hasAmount = amount != null && amount.signum() > 0;
            return !hasPercent && hasAmount ? AMOUNT : PERCENT;
        }

        public String wireValue() {
            return this == AMOUNT ? "amount" : "percent";
        }
    }

    /** A line's money before any footer discount. */
    public record LineBase(BigDecimal grossAmount, BigDecimal focDeduction,
            BigDecimal itemDiscount, BigDecimal base) {
    }

    /**
     * @param base       value after FOC and item discount, before footer (VAT-inclusive under INCLUSIVE)
     * @param taxPercent VAT rate 0-100
     * @param eligible   false for voided lines — they keep their own figures but take no share
     *                   and are excluded from document totals
     */
    public record LineInput(BigDecimal base, BigDecimal taxPercent, boolean eligible) {
    }

    public record LineResult(BigDecimal base, BigDecimal footerShare, BigDecimal taxableAmount,
            BigDecimal taxAmount, BigDecimal lineTotal, boolean eligible) {
    }

    public record Result(BigDecimal footerAmount, List<LineResult> lines, BigDecimal baseTotal,
            BigDecimal taxableTotal, BigDecimal taxTotal, BigDecimal lineTotal) {

        /** Header sub-total under the existing BillBull convention: Σ(taxable + share). */
        public BigDecimal subTotal() {
            return taxableTotal.add(footerAmount);
        }
    }

    /** What a service knows about one of its entity lines, in the allocator's terms. */
    public record LineSpec(BigDecimal qty, BigDecimal price, BigDecimal focQtyInSellingUnit,
            BigDecimal discountPercent, BigDecimal taxPercent, boolean eligible) {
    }

    /** Writes one allocated line (with its pre-footer breakdown) back onto an entity line. */
    @FunctionalInterface
    public interface LineWriter<T> {
        void write(T item, LineBase base, LineResult result);
    }

    /**
     * Allocates the footer discount over a document's entity lines and writes every line's
     * authoritative money back through {@code writer}. Each sales service supplies only the
     * mapping, so the arithmetic lives here once.
     */
    public static <T> Result allocateLines(List<T> items, java.util.function.Function<T, LineSpec> spec,
            DiscountType type, BigDecimal value, VatMode vatMode, LineWriter<T> writer) {
        List<T> safe = items == null ? List.of() : items;
        List<LineBase> bases = new ArrayList<>(safe.size());
        List<LineInput> inputs = new ArrayList<>(safe.size());
        for (T item : safe) {
            LineSpec s = spec.apply(item);
            LineBase b = lineBase(s.qty(), s.price(), s.focQtyInSellingUnit(), s.discountPercent());
            bases.add(b);
            inputs.add(new LineInput(b.base(), s.taxPercent(), s.eligible()));
        }
        Result result = allocate(inputs, type, value, vatMode);
        for (int i = 0; i < safe.size(); i++) {
            writer.write(safe.get(i), bases.get(i), result.lines().get(i));
        }
        return result;
    }

    /**
     * The value the user asked for: the percentage for PERCENT; for AMOUNT the typed fixed
     * amount when the client sent one, otherwise the stored/sent money amount (older clients).
     */
    public static BigDecimal requestedValue(DiscountType type, BigDecimal percent, BigDecimal fixed,
            BigDecimal amount) {
        if (type == DiscountType.AMOUNT) {
            return fixed != null && fixed.signum() > 0 ? fixed : nz(amount);
        }
        return nz(percent);
    }

    /**
     * FOC quantity converted into the selling unit — mirrors the editor's getFocDeduction:
     * {@code foc × conversion(focUnit) / conversion(sellingUnit)}, each conversion defaulting
     * to 1 when unknown; a blank FOC unit means the selling unit.
     */
    public static BigDecimal focInSellingUnit(BigDecimal foc, String sellingUnit, String focUnit,
            java.util.function.Function<String, BigDecimal> conversionOf) {
        BigDecimal f = nz(foc);
        if (f.signum() <= 0 || focUnit == null || focUnit.isBlank()
                || (sellingUnit != null && focUnit.trim().equalsIgnoreCase(sellingUnit.trim()))) {
            return f.max(BigDecimal.ZERO);
        }
        BigDecimal focConversion = positiveOrOne(conversionOf.apply(focUnit));
        BigDecimal sellingConversion = positiveOrOne(sellingUnit == null ? null : conversionOf.apply(sellingUnit));
        return f.multiply(focConversion).divide(sellingConversion, 6, RoundingMode.HALF_UP);
    }

    private static BigDecimal positiveOrOne(BigDecimal v) {
        return v != null && v.signum() > 0 ? v : BigDecimal.ONE;
    }

    public static LineBase lineBase(BigDecimal qty, BigDecimal price, BigDecimal focQtyInSellingUnit,
            BigDecimal discountPercent) {
        BigDecimal p = nz(price);
        BigDecimal gross = money(nz(qty).multiply(p));
        BigDecimal focDeduction = money(p.multiply(nz(focQtyInSellingUnit)).max(BigDecimal.ZERO));
        BigDecimal preDiscount = gross.subtract(focDeduction).max(BigDecimal.ZERO);
        BigDecimal pct = clampPercent(discountPercent);
        BigDecimal itemDiscount = money(preDiscount.multiply(pct).divide(HUNDRED)).min(preDiscount);
        return new LineBase(gross, focDeduction, itemDiscount, preDiscount.subtract(itemDiscount));
    }

    public static Result allocate(List<LineInput> lines, DiscountType type, BigDecimal value, VatMode vatMode) {
        boolean inclusive = vatMode == VatMode.INCLUSIVE;
        int n = lines == null ? 0 : lines.size();

        BigDecimal[] bases = new BigDecimal[n];
        BigDecimal eligibleBase = BigDecimal.ZERO;
        for (int i = 0; i < n; i++) {
            LineInput in = lines.get(i);
            bases[i] = money(nz(in.base())).max(BigDecimal.ZERO);
            if (in.eligible()) {
                eligibleBase = eligibleBase.add(bases[i]);
            }
        }

        BigDecimal footer = footerAmount(type, value, eligibleBase);
        long[] shareCents = apportion(lines, bases, footer, eligibleBase);

        List<LineResult> out = new ArrayList<>(n);
        BigDecimal taxableTotal = BigDecimal.ZERO;
        BigDecimal taxTotal = BigDecimal.ZERO;
        BigDecimal grandTotal = BigDecimal.ZERO;
        for (int i = 0; i < n; i++) {
            LineInput in = lines.get(i);
            BigDecimal share = BigDecimal.valueOf(shareCents[i], 2);
            BigDecimal remaining = bases[i].subtract(share);
            BigDecimal rate = nz(in.taxPercent()).max(BigDecimal.ZERO);
            BigDecimal taxable;
            BigDecimal tax;
            BigDecimal total;
            if (inclusive) {
                total = remaining;
                taxable = remaining.multiply(HUNDRED).divide(HUNDRED.add(rate), 2, RoundingMode.HALF_UP);
                tax = total.subtract(taxable);
            } else {
                taxable = remaining;
                tax = money(taxable.multiply(rate).divide(HUNDRED));
                total = taxable.add(tax);
            }
            out.add(new LineResult(bases[i], share, taxable, tax, total, in.eligible()));
            if (in.eligible()) {
                taxableTotal = taxableTotal.add(taxable);
                taxTotal = taxTotal.add(tax);
                grandTotal = grandTotal.add(total);
            }
        }
        return new Result(footer, Collections.unmodifiableList(out), eligibleBase,
                taxableTotal, taxTotal, grandTotal);
    }

    static BigDecimal footerAmount(DiscountType type, BigDecimal value, BigDecimal eligibleBase) {
        BigDecimal v = nz(value);
        if (v.signum() <= 0 || eligibleBase.signum() <= 0) {
            return BigDecimal.ZERO.setScale(2);
        }
        if (type == DiscountType.AMOUNT) {
            return money(v).min(eligibleBase);
        }
        return money(eligibleBase.multiply(clampPercent(v)).divide(HUNDRED)).min(eligibleBase);
    }

    /** Largest-remainder apportionment of {@code footer} (cents) over eligible bases. */
    private static long[] apportion(List<LineInput> lines, BigDecimal[] bases, BigDecimal footer,
            BigDecimal eligibleBase) {
        int n = bases.length;
        long[] cents = new long[n];
        if (footer.signum() <= 0 || eligibleBase.signum() <= 0) {
            return cents;
        }
        BigInteger footerC = toCents(footer);
        BigInteger totalC = toCents(eligibleBase);
        BigInteger[] remainders = new BigInteger[n];
        List<Integer> candidates = new ArrayList<>();
        BigInteger allocated = BigInteger.ZERO;
        for (int i = 0; i < n; i++) {
            if (!lines.get(i).eligible()) {
                continue;
            }
            BigInteger[] qr = footerC.multiply(toCents(bases[i])).divideAndRemainder(totalC);
            cents[i] = qr[0].longValueExact();
            remainders[i] = qr[1];
            allocated = allocated.add(qr[0]);
            candidates.add(i);
        }
        long leftover = footerC.subtract(allocated).longValueExact();
        candidates.sort(Comparator.<Integer, BigInteger>comparing(i -> remainders[i]).reversed()
                .thenComparing(Comparator.<Integer, BigDecimal>comparing(i -> bases[i]).reversed())
                .thenComparing(Comparator.naturalOrder()));
        for (int k = 0; k < leftover && k < candidates.size(); k++) {
            cents[candidates.get(k)] += 1;
        }
        return cents;
    }

    private static BigInteger toCents(BigDecimal v) {
        return v.setScale(2, RoundingMode.HALF_UP).unscaledValue();
    }

    private static BigDecimal clampPercent(BigDecimal pct) {
        return nz(pct).max(BigDecimal.ZERO).min(HUNDRED);
    }

    public static BigDecimal money(BigDecimal v) {
        return nz(v).setScale(2, RoundingMode.HALF_UP);
    }

    private static BigDecimal nz(BigDecimal v) {
        return v != null ? v : BigDecimal.ZERO;
    }
}
