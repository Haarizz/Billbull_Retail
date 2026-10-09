-- Database effects of two POS sales, side by side. Every row should appear once per invoice with
-- identical values apart from the invoice number.
-- Usage: psql -d <disposable db> -v a=<invoice A> -v b=<invoice B> -f db-effects.sql
\pset footer off

\echo == invoice headers
select invoice_number, status, payment_mode, sub_total, tax_total, invoice_total, amount_paid, bill_discount_amount,
       tax_inclusive, vat_mode, branch_id, pos_session_id, pos_terminal_id, delivery_status
from sales_invoices where invoice_number in (:'a', :'b') order by invoice_number;

\echo == invoice lines
select si.invoice_number, count(*) lines, sum(i.quantity) qty,
       string_agg(i.item_code || ':' || i.quantity || '@' || i.price || ' tax=' || i.tax_amount || ' net=' || i.net_amount
                  || ' rev=' || coalesce(i.recognized_revenue, 0) || ' cogs=' || coalesce(i.recognized_cogs, 0), ', ' order by i.item_code) detail
from sales_invoice_items i join sales_invoices si on si.id = i.sales_invoice_id
where si.invoice_number in (:'a', :'b') group by 1 order by 1;

\echo == stock movements posted with each sale (delivery note written by checkout)
select si.invoice_number, sm.source_type,
       string_agg(sm.product_id || ':' || sm.quantity || '@wh' || sm.warehouse_id, ',' order by sm.product_id) moves
from sales_invoices si
join stock_movements sm on sm.created_at between si.created_at - interval '5 seconds' and si.created_at + interval '30 seconds'
where si.invoice_number in (:'a', :'b') group by 1, 2 order by 1, 2;

\echo == GL: sales-invoice journal (reference FS-<invoice>) and the receipt voucher posted right after it
with sales as (select invoice_number inv, created_at from sales_invoices where invoice_number in (:'a', :'b')),
je as (
  select s.inv, j.id, split_part(j.entry_number, '-', 1) kind from sales s join journal_entries j on j.reference = 'FS-' || s.inv
  union all
  select s.inv, j.id, 'RV' from sales s
  join lateral (select id from journal_entries j where j.entry_number like 'RV-%'
                and j.created_at between s.created_at and s.created_at + interval '20 seconds' order by j.id limit 1) j on true)
select inv, string_agg(kind || ':' || jl.account_code || ' dr' || jl.debit || ' cr' || jl.credit, ', '
                       order by kind, jl.account_code, jl.debit) lines
from je join journal_lines jl on jl.journal_entry_id = je.id group by inv order by inv;

\echo == print jobs created around each sale
select si.invoice_number, count(pj.*) jobs
from sales_invoices si
left join pos_print_jobs pj on pj.created_at between si.created_at - interval '5 seconds' and si.created_at + interval '60 seconds'
where si.invoice_number in (:'a', :'b') group by 1 order by 1;
