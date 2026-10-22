package com.billbull.backend.settings.email;

import com.billbull.backend.exception.GlobalExceptionHandler;
import com.billbull.backend.security.ModulePermissionService;
import jakarta.mail.AuthenticationFailedException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mail.MailAuthenticationException;
import org.springframework.mail.MailSendException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.Optional;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * E3/E4: what the settings page receives. Every error is {@code {"message": "..."}} with one
 * sentence, so the page can show it as text; no raw exception text or password.
 */
class EmailConfigControllerTest {

    private static final String STORED = "stored-app-password-1234";

    private final EmailConfigRepository repo = mock(EmailConfigRepository.class);
    private final ModulePermissionService permissions = mock(ModulePermissionService.class);
    private final EmailConfigService service = spy(new EmailConfigService(repo));
    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.standaloneSetup(new EmailConfigController(service, permissions))
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();
        EmailConfig c = new EmailConfig();
        c.setId(1L);
        c.setSmtpHost("smtp.gmail.com");
        c.setSmtpPort(587);
        c.setUsername("accounts@example.com");
        c.setPassword(STORED);
        c.setEnabled(true);
        when(repo.findById(1L)).thenReturn(Optional.of(c));
        when(repo.save(any())).thenAnswer(inv -> inv.getArgument(0));
    }

    @Test
    void getReturnsPasswordSetAndNoPassword() throws Exception {
        mvc.perform(get("/api/settings/email-config"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.passwordSet").value(true))
                .andExpect(jsonPath("$.smtpSecurity").value("STARTTLS"))
                .andExpect(jsonPath("$.password").doesNotExist())
                .andExpect(content().string(not(containsString(STORED))));
    }

    @Test
    void anInvalidSaveIs400WithAReadableMessage() throws Exception {
        mvc.perform(put("/api/settings/email-config").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"smtpHost\":\"smtp.gmail.com\",\"smtpPort\":465,\"smtpSecurity\":\"STARTTLS\","
                                + "\"username\":\"accounts@example.com\",\"enabled\":true}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(containsString("Port 465 uses SSL")));
        verify(repo, never()).save(any());
    }

    @Test
    void aSaveWithoutAPasswordKeepsItAndAnswersWithoutIt() throws Exception {
        mvc.perform(put("/api/settings/email-config").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"smtpHost\":\"smtp.gmail.com\",\"smtpPort\":587,\"smtpSecurity\":\"STARTTLS\","
                                + "\"username\":\"accounts@example.com\",\"fromName\":\"Acme\",\"enabled\":true}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.passwordSet").value(true))
                .andExpect(content().string(not(containsString(STORED))));
        verify(repo).save(argThat(c -> STORED.equals(c.getPassword())));
    }

    @Test
    void saveStillRequiresUserManagementEdit() throws Exception {
        doThrow(new AccessDeniedException("denied")).when(permissions).requireCanEdit("userManagement");
        mvc.perform(put("/api/settings/email-config").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/settings/email-config/test").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"toEmail\":\"me@example.com\"}"))
                .andExpect(status().isForbidden());
        verify(repo, never()).save(any());
    }

    @Test
    void aRejectedLoginOnTestIs502WithAnActionableSentence() throws Exception {
        doThrow(new MailAuthenticationException(new AuthenticationFailedException("535 5.7.8 Username and Password not accepted")))
                .when(service).sendTestEmail("me@example.com");

        mvc.perform(post("/api/settings/email-config/test").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"toEmail\":\"me@example.com\"}"))
                .andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.message").value(containsString("app password")))
                .andExpect(content().string(not(containsString("535"))))
                .andExpect(content().string(not(containsString(STORED))));
    }

    @Test
    void aTlsFailureOnTestNamesTheServerNotTheStackTrace() throws Exception {
        doThrow(new MailSendException("Mail server connection failed",
                new jakarta.mail.MessagingException("Could not convert socket to TLS",
                        new javax.net.ssl.SSLHandshakeException("PKIX path building failed"))))
                .when(service).sendTestEmail("me@example.com");

        mvc.perform(post("/api/settings/email-config/test").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"toEmail\":\"me@example.com\"}"))
                .andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.message").value(containsString("secure connection to smtp.gmail.com:587")))
                .andExpect(content().string(not(containsString("PKIX"))));
    }

    @Test
    void disabledEmailOnTestIs400WithWhereToFixIt() throws Exception {
        EmailConfig off = new EmailConfig();
        off.setSmtpHost("smtp.gmail.com");
        off.setEnabled(false);
        when(repo.findById(1L)).thenReturn(Optional.of(off));

        mvc.perform(post("/api/settings/email-config/test").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"toEmail\":\"me@example.com\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(containsString("Email is disabled")));
    }

    @Test
    void aMissingOrInvalidTestRecipientIs400() throws Exception {
        mvc.perform(post("/api/settings/email-config/test").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").exists());
        mvc.perform(post("/api/settings/email-config/test").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"toEmail\":\"a@b.com, c@d.com\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(containsString("single email address")));
        verify(service, never()).sendTestEmail(any());
    }
}
