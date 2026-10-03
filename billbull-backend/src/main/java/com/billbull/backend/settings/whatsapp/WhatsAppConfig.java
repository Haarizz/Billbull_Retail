package com.billbull.backend.settings.whatsapp;

import com.billbull.backend.common.crypto.EncryptedStringConverter;

import jakarta.persistence.*;

/**
 * Tenant-wide WhatsApp Business (Meta Cloud API) settings — one row (id = 1) per tenant DB, the
 * same singleton shape as {@code EmailConfig}. Every tenant has its own database, so each client
 * company connects its own WhatsApp Business Account and sender number here.
 *
 * The three secrets are encrypted at rest with {@link EncryptedStringConverter} (they must be
 * reversible: the token is replayed to Meta, the app secret verifies webhook signatures). The API
 * layer masks them in responses; see {@link WhatsAppConfigService#MASK}.
 */
@Entity
@Table(name = "whatsapp_config")
public class WhatsAppConfig {

    @Id
    private Long id = 1L;

    @Column(name = "enabled")
    private Boolean enabled = false;

    /** Graph API version segment, e.g. "v21.0". Kept configurable so a Meta deprecation is a settings change, not a release. */
    @Column(name = "graph_api_version", length = 20)
    private String graphApiVersion = "v21.0";

    /** "Phone number ID" from Meta → WhatsApp → API Setup (NOT the phone number itself). */
    @Column(name = "phone_number_id", length = 64)
    private String phoneNumberId;

    /** WhatsApp Business Account ID (WABA). Informational / used by the connection test. */
    @Column(name = "business_account_id", length = 64)
    private String businessAccountId;

    /** Permanent System User access token with whatsapp_business_messaging + whatsapp_business_management. */
    @Column(name = "access_token", length = 2048)
    @Convert(converter = EncryptedStringConverter.class)
    private String accessToken;

    /** Meta App Secret — verifies the X-Hub-Signature-256 header on incoming webhooks. */
    @Column(name = "app_secret", length = 512)
    @Convert(converter = EncryptedStringConverter.class)
    private String appSecret;

    /** Any string we choose; Meta echoes it on the webhook verification handshake. */
    @Column(name = "webhook_verify_token", length = 512)
    @Convert(converter = EncryptedStringConverter.class)
    private String webhookVerifyToken;

    /** Country calling code (digits only) prepended to local numbers, e.g. "971" for UAE. */
    @Column(name = "default_country_code", length = 5)
    private String defaultCountryCode = "971";

    /**
     * Meta-approved template names, one per document (see {@link WhatsAppDocumentType}). A blank
     * name means "not set up" — that document falls back to the manual wa.me flow.
     */
    @Column(name = "quotation_template_name", length = 512)
    private String quotationTemplateName = "quotation_document";

    /** Template for sales orders (DOCUMENT header + 4 body variables). */
    @Column(name = "sales_order_template_name", length = 512)
    private String salesOrderTemplateName = "sales_order_document";

    /** Template for sales invoices (DOCUMENT header + 4 body variables). */
    @Column(name = "sales_invoice_template_name", length = 512)
    private String salesInvoiceTemplateName = "sales_invoice_document";

    /** Template language code exactly as approved in Meta, e.g. "en", "en_US", "ar". */
    @Column(name = "template_language", length = 15)
    private String templateLanguage = "en";

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Boolean getEnabled() { return enabled; }
    public void setEnabled(Boolean enabled) { this.enabled = enabled; }

    public String getGraphApiVersion() { return graphApiVersion; }
    public void setGraphApiVersion(String graphApiVersion) { this.graphApiVersion = graphApiVersion; }

    public String getPhoneNumberId() { return phoneNumberId; }
    public void setPhoneNumberId(String phoneNumberId) { this.phoneNumberId = phoneNumberId; }

    public String getBusinessAccountId() { return businessAccountId; }
    public void setBusinessAccountId(String businessAccountId) { this.businessAccountId = businessAccountId; }

    public String getAccessToken() { return accessToken; }
    public void setAccessToken(String accessToken) { this.accessToken = accessToken; }

    public String getAppSecret() { return appSecret; }
    public void setAppSecret(String appSecret) { this.appSecret = appSecret; }

    public String getWebhookVerifyToken() { return webhookVerifyToken; }
    public void setWebhookVerifyToken(String webhookVerifyToken) { this.webhookVerifyToken = webhookVerifyToken; }

    public String getDefaultCountryCode() { return defaultCountryCode; }
    public void setDefaultCountryCode(String defaultCountryCode) { this.defaultCountryCode = defaultCountryCode; }

    public String getQuotationTemplateName() { return quotationTemplateName; }
    public void setQuotationTemplateName(String quotationTemplateName) { this.quotationTemplateName = quotationTemplateName; }

    public String getSalesOrderTemplateName() { return salesOrderTemplateName; }
    public void setSalesOrderTemplateName(String salesOrderTemplateName) { this.salesOrderTemplateName = salesOrderTemplateName; }

    public String getSalesInvoiceTemplateName() { return salesInvoiceTemplateName; }
    public void setSalesInvoiceTemplateName(String salesInvoiceTemplateName) { this.salesInvoiceTemplateName = salesInvoiceTemplateName; }

    public String getTemplateLanguage() { return templateLanguage; }
    public void setTemplateLanguage(String templateLanguage) { this.templateLanguage = templateLanguage; }
}
