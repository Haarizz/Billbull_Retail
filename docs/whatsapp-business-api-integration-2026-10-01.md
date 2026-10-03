# WhatsApp Business API: sending quotation, sales order and invoice PDFs

**Status:** the code is built in BillBull and switched off by default. It goes live once a client's Meta credentials are entered in **Settings → WhatsApp Settings**.
**Date:** 2026-10-01

---

## 1. What it does

The green **WhatsApp** button is on these screens:

| Screen | Where |
|---|---|
| **Quotations** | Each row's action buttons; the WhatsApp button at the top of an open quotation |
| **Sales Orders** | Each row's action buttons and its ⋮ menu; the WhatsApp button at the top of an open order |
| **Sales Invoice** | Each row's action buttons; the WhatsApp icon in the invoice preview |

On every screen it works in one of two ways.

| WhatsApp Settings | What happens |
|---|---|
| **Enabled, with a template set for that document** | A **Send on WhatsApp** window opens. The user checks the customer's number and clicks **Send with PDF**. BillBull creates the same PDF as *Download PDF* and sends it to the customer from the company's verified WhatsApp Business number, as a real attachment. Delivery status (Sent → Delivered → Read, or Failed) is recorded and shown under "Previous sends". |
| **Disabled or not set up** (the default) | BillBull downloads the PDF and opens the customer's chat in WhatsApp with a message already typed. The user drags the PDF into the chat. A plain chat link can carry text only, not files, so this is the best it can do. |

Each document type is switched on separately. If only the quotation template is approved, quotations go through the API and orders and invoices keep using the manual flow until their templates are entered.

An open quotation or sales order must be saved before it can be sent. An invoice that hasn't been saved yet uses the manual flow.

Phone numbers are put into international format automatically. For example, `050 123 4567` becomes `+971 50 123 4567`, using each client's **Default Country Code**. Numbers written with `+` or `00`, or longer than 10 digits, are left as they are.

---

## 2. Business setup (PM or client, done once per client company)

> Each BillBull client has its own database, so each client connects **its own** WhatsApp Business number and Meta account.

### Step 1: Meta Business account and verification
1. Go to **business.facebook.com** and create (or use) the client's Business portfolio.
2. **Settings → Business info → Start verification.** Upload the trade licence, and make sure the legal name, address and website match it exactly.
   *Verification can take from a few days to a couple of weeks. Start it first. Testing (Step 4) can go ahead while it is pending.*

### Step 2: Create the Meta app
1. Go to **developers.facebook.com → My Apps → Create App**, choose type **Business**, and link it to the client's Business portfolio.
2. **Add product → WhatsApp → Set up.** This creates a **WhatsApp Business Account (WABA)** and a free **test number**.

### Step 3: Add the real sender number
1. **WhatsApp → API Setup → Add phone number.**
2. Rules for the number:
   - It must **not** be in use on the WhatsApp or WhatsApp Business phone app. Delete that account first, or use a new number.
   - It must be able to receive an SMS or voice call for the verification code.
3. Set the **display name** shown to customers (e.g. *Hilite Building Materials*). Meta reviews it, and it must match the business name.
4. Set a **two-step verification PIN** for the number and keep it somewhere safe.

### Step 4: Create the message templates (each needs Meta approval)
Go to **WhatsApp Manager → Message templates → Create template** and create one template per document. All three use these settings:

| Field | Value |
|---|---|
| Category | **Utility** |
| Language | English (`en`). If the client wants Arabic, create a second set in `ar` |
| Header | **Document** (upload any sample PDF for review) |
| Footer (optional) | Company name |
| Buttons | None |

| Template name | Body text | Sample values for `{{1}}` · `{{2}}` · `{{3}}` · `{{4}}` |
|---|---|---|
| `quotation_document` | `Dear {{1}}, please find attached quotation {{2}} for {{3}}, valid until {{4}}. For any questions, simply reply to this message.` | `Test Customer` · `QTN-2026-0016` · `AED 2,800.00` · `08 Oct 2026` |
| `sales_order_document` | `Dear {{1}}, thank you for your order. Please find attached sales order {{2}} for {{3}}, expected delivery {{4}}. For any questions, simply reply to this message.` | `Test Customer` · `SO-2026-0007` · `AED 3,150.00` · `15 Oct 2026` |
| `sales_invoice_document` | `Dear {{1}}, please find attached invoice {{2}} for {{3}}, due on {{4}}. For any questions, simply reply to this message.` | `Test Customer` · `INV-2026-0042` · `AED 1,050.00` · `31 Oct 2026` |

What BillBull puts in each variable:

| Variable | Quotation | Sales order | Sales invoice |
|---|---|---|---|
| `{{1}}` | Customer name | Customer name | Customer name |
| `{{2}}` | Quotation number | Sales order number | Invoice number |
| `{{3}}` | Total with currency | Order total with currency | Invoice total with currency |
| `{{4}}` | Valid-until date | Expected delivery date, or "to be confirmed" | Due date, or the invoice date if no due date is set |

> ⚠️ **Each template must have exactly these four variables, in this order.** You can change the wording around them, but adding, removing or reordering variables needs a code change: `QuotationController.quotationTemplateParams`, `SalesOrderController.orderTemplateParams` or `SalesInvoiceController.invoiceTemplateParams`.
> Keep the text purely transactional. If it contains offers or promotional wording, Meta may move it to the more expensive **Marketing** category.
> You can use different template names. Just enter them in WhatsApp Settings.

Approval usually takes from a few minutes to 24 hours.

### Step 5: Create a permanent access token
The token shown on the API Setup page **expires after 24 hours**. Do not use it in production.
1. **business.facebook.com → Settings → Users → System users → Add.** Name it `billbull-api`, with role **Admin**.
2. **Assign assets:** give it the Meta app (full control) and the WhatsApp account (full control).
3. **Generate token:** choose the app, set expiry to **Never**, and tick the permissions **`whatsapp_business_messaging`** and **`whatsapp_business_management`**.
4. Copy the token immediately, because it is shown only once.

### Step 6: Billing
In **WhatsApp Manager → Payment settings**, add a payment method. Meta charges for each delivered template message. The rate depends on the customer's country and the template category, and Utility is one of the cheaper ones. Check Meta's current rate card for the client's main customer countries before agreeing pricing with the client.

### Step 7: Customer consent
Meta's policy requires customers to have agreed to receive WhatsApp messages from the business, for example a consent line on the quotation request or the customer form. If customers block or report the number, its **quality rating** drops and Meta can limit how many messages it may send.

---

## 3. What to send to the developer (checklist)

Please fill in this list for each client and share it securely (not over plain email or chat):

| # | Item | Where to find it |
|---|---|---|
| 1 | **Phone Number ID** | developers.facebook.com → App → WhatsApp → API Setup (a long number, **not** the phone number) |
| 2 | **WhatsApp Business Account ID** | Same page |
| 3 | **Permanent access token** | Step 5 |
| 4 | **App Secret** | App → App settings → Basic → App secret (Show) |
| 5 | **Approved template names and language** | Step 4: the quotation, sales order and invoice template names, and the language, e.g. `en` |
| 6 | **Default country code** | e.g. `971` for UAE |
| 7 | **Public HTTPS address of that client's BillBull** | e.g. `https://hilite.billbull.app`, needed for the delivery webhook |

---

## 4. Configure BillBull (admin, about 10 minutes)

1. Sign in as Admin and open **Settings → WhatsApp Settings**.
2. Fill in **Phone Number ID**, **WhatsApp Business Account ID**, **Permanent Access Token** and **App Secret**. Leave **Graph API Version** at `v21.0` unless the developer says otherwise.
3. Under **Message Templates**, fill in the **Quotation**, **Sales Order** and **Sales Invoice** template names. Leave a name blank if that template isn't approved yet; that document then keeps the manual flow. Then set **Language Code** (`en`) and **Default Country Code** (`971`).
4. Under **Delivery Webhook**, click **Generate** next to *Verify Token* and copy the **Callback URL** shown.
5. Turn on **Enable WhatsApp Business API** and click **Save Settings**.
6. Click **Test Connection**. It should show **Connected**, plus the verified name and number. No message is sent.

Secrets are stored encrypted. After saving, the screen only shows "Saved — type to replace".

### Connect the delivery webhook (for Sent / Delivered / Read)
1. Go to **developers.facebook.com → App → WhatsApp → Configuration → Webhook → Edit**.
2. **Callback URL:** paste the URL from BillBull, e.g. `https://hilite.billbull.app/api/whatsapp/webhook`.
   **Verify token:** paste the token from BillBull. Click **Verify and save**. Meta calls BillBull, and it must succeed.
3. Under **Webhook fields**, **Subscribe** to `messages`.
4. Make sure the app is **Live**: App dashboard → *App mode: Live* (this needs a privacy-policy URL).

> The callback URL must be **public HTTPS** with a valid certificate; `localhost` will not work. Each client deployment has its own URL. If one Meta app is ever shared by several clients, Meta can route each WhatsApp account to a different URL. The developer should look at Meta's per-WABA callback override when that becomes relevant.

---

## 5. Test before go-live

1. **With the free test number** (before verification is finished): in **API Setup → To**, add up to 5 recipient numbers and verify each one with its code. Only those numbers can receive messages from the test number. Configure BillBull with the **test number's Phone Number ID**, then send a quotation to one of them.
2. Check that:
   - [ ] On Quotations, Sales Orders and Sales Invoice, the WhatsApp button opens **Send on WhatsApp** (not the chat-link fallback).
   - [ ] Each message arrives with the **document's PDF attached**, and the PDF matches *Download PDF* / *Print*.
   - [ ] Reopening the window shows the send under **Previous sends**, moving through SENT → DELIVERED → READ (needs the webhook).
   - [ ] Sending to a wrong or unregistered number shows a clear error, and the attempt is logged as FAILED.
   - [ ] Clearing one template name (e.g. Sales Invoice) puts only that document back on the download-and-open-chat flow.
   - [ ] Turning WhatsApp off in Settings brings the download-and-open-chat fallback back everywhere.
3. **Go live:** replace the Phone Number ID with the real number's ID and send one real quotation to an internal phone.

---

## 6. Troubleshooting (errors shown in the send window)

| Message / code | Meaning | Fix |
|---|---|---|
| `WhatsApp is disabled…` / `not fully configured…` | Settings are off or incomplete | Fill in Settings → WhatsApp Settings and enable it |
| `190` | Access token expired or invalid | Create a permanent System User token (Step 5) |
| `131030` | Recipient isn't in the test number's allowed list | Add the number under API Setup → To, or switch to the real number |
| `132001` | Template name or language not found | Name and language must match the approved template exactly |
| `132000` | Wrong number of template variables | The template must have exactly 4 body variables, `{{1}}`–`{{4}}` |
| `No WhatsApp template is set for …` | That document's template name is blank | Enter it under WhatsApp Settings → Message Templates |
| `131026` | Message undeliverable | Customer isn't on WhatsApp, has an old app, or blocked the business |
| `131056` | Too many messages to the same number too quickly | Wait and retry |
| `131053` | PDF upload failed | Retry; check that the PDF opens with *Download PDF* |
| `368` / `131031` | Account restricted or locked by Meta | Check WhatsApp Manager → Account quality |
| "No default print template is set…" | No default print template for that document | Set one in Sales → Print & Email Templates |
| Webhook "Verify and save" fails | Wrong token, or URL not reachable | Re-copy both from BillBull; check the HTTPS URL opens from outside the network |
| Status stuck at ACCEPTED | Webhook not connected | Complete "Connect the delivery webhook" above |

---

## 7. Technical reference (developers)

### Deployment
- **Migration `V110__whatsapp_integration.sql`** creates `whatsapp_config` (one template column per document) and `whatsapp_message_logs`. Flyway runs it on boot; it is additive and safe to run more than once.
- Secrets use `EncryptedStringConverter`. **`EMAIL_ENC_KEY` must be set** on every client deployment (it is already required for SMTP). Changing that key later means re-entering the WhatsApp secrets.
- Outbound HTTPS to `graph.facebook.com` must be allowed from the server.
- No new Maven or npm dependencies (uses the JDK `HttpClient`).

### Flow
```
Quotation / Sales Order / Sales Invoice
   └─► POST /api/sales/{quotations|sales-orders|invoices}/{id}/send-whatsapp { toPhone, html }
                       ▼
               DocumentWhatsAppSender  (WhatsAppDocumentType picks the template)
                       │  1. config + template check, PhoneNumberNormalizer
                       │     HtmlPdfService.render(html)     (same PDF as Download PDF)
                       │  2. POST graph.facebook.com/{ver}/{phone-number-id}/media      → media id
                       │  3. POST graph.facebook.com/{ver}/{phone-number-id}/messages   → wamid
                       │     (template; header = document{id, filename}; body = 4 params)
                       ▼
               whatsapp_message_logs (ACCEPTED | FAILED + Meta error)

Meta ──► POST /api/whatsapp/webhook  (X-Hub-Signature-256 HMAC with App Secret)
             statuses[] → log.status moves forward only: ACCEPTED → SENT → DELIVERED → READ (FAILED is final)
```

### Endpoints
| Method | Path | Access |
|---|---|---|
| GET / PUT | `/api/settings/whatsapp-config` | `userManagement` view / edit (secrets always masked) |
| POST | `/api/settings/whatsapp-config/test` | `userManagement` edit |
| GET | `/api/whatsapp/status` | any signed-in user (`enabled`, `configured`, `defaultCountryCode`, `templates` per document) |
| GET | `/api/whatsapp/messages?documentType=QUOTATION\|SALES_ORDER\|SALES_INVOICE&documentId=` | view on that document's module |
| POST | `/api/sales/quotations/{id}/send-whatsapp` | `sales.quotation` view (same as send-email) |
| POST | `/api/sales/sales-orders/{id}/send-whatsapp` | `sales.order` view (`toPhone` required; the order stores no phone) |
| POST | `/api/sales/invoices/{id}/send-whatsapp` | `sales.invoice` view |
| GET / POST | `/api/whatsapp/webhook` | **public**, protected by the verify token (GET) and HMAC signature (POST; rejected when no App Secret is set) |

### Files
- Backend `settings/whatsapp/`: `WhatsAppDocumentType`, `WhatsAppTemplateParams`, `WhatsAppConfig`, `WhatsAppConfigService`, `WhatsAppConfigController`, `WhatsAppCloudApiClient`, `DocumentWhatsAppSender`, `WhatsAppMessageLog`, `WhatsAppMessageStatus`, `WhatsAppWebhookService`, `WhatsAppController`, `PhoneNumberNormalizer`, `WhatsAppApiException`
- Backend changes: `send-whatsapp` endpoints and template-parameter builders in `QuotationController`, `SalesOrderController` and `SalesInvoiceController`; `SecurityConfig` (webhook allowed without sign-in)
- Frontend: `api/whatsappApi.js`, `components/whatsapp/useWhatsAppDocumentSend.jsx` (shared send window and fallback), `pages/Settings/WhatsAppSettings.jsx` (route `/settings/whatsapp`, sidebar under Settings), and the WhatsApp buttons in `pages/Sales/Quotations.jsx`, `SalesOrders.jsx` and `SalesInvoice.jsx`
- Tests: `PhoneNumberNormalizerTest`, `DocumentWhatsAppSenderTest`, `WhatsAppConfigServiceTest`, `WhatsAppWebhookServiceTest`, `WhatsAppCloudApiClientTest`, `QuotationWhatsAppParamsTest`, `SalesOrderWhatsAppParamsTest`, `SalesInvoiceWhatsAppParamsTest`; frontend `components/whatsapp/whatsapp.test.js`

### Adding another document (proforma, delivery note, statement)
1. Get a template approved for it (Document header plus its own variables).
2. Add a constant to `WhatsAppDocumentType` (its RBAC module, label and template getter), and a `…TemplateName` field to `WhatsAppConfig` with a new Flyway migration.
3. Add a `send-whatsapp` endpoint on that document's controller that calls `DocumentWhatsAppSender.send(...)` with its parameters.
4. Frontend: add its path to `SEND_PATHS` in `api/whatsappApi.js`, its wording to `buildWhatsAppMessage`, a field to `TEMPLATE_FIELDS` in WhatsApp Settings, and call `openWhatsApp({...})` from the page.

### Not built yet
- Receiving customer replies (inbound messages) in BillBull. Replies arrive in the WhatsApp Business inbox or app.
- Embedded Signup ("Connect WhatsApp" button) for self-service onboarding of many clients. This needs Meta Tech Provider status.
- A per-customer consent flag that blocks sending.
