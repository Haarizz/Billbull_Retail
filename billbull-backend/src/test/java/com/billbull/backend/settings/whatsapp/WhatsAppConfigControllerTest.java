package com.billbull.backend.settings.whatsapp;

import com.billbull.backend.exception.GlobalExceptionHandler;
import com.billbull.backend.security.ModulePermissionService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.Optional;

import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.startsWith;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * T-P0-4: the Meta ID check holds for a client that skips the settings page, and answers with the
 * application's standard 400 body.
 */
class WhatsAppConfigControllerTest {

    private final WhatsAppConfigRepository repo = mock(WhatsAppConfigRepository.class);
    private final ModulePermissionService permissions = mock(ModulePermissionService.class);
    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        WhatsAppConfigController controller = new WhatsAppConfigController(
                new WhatsAppConfigService(repo), mock(WhatsAppCloudApiClient.class), permissions);
        mvc = MockMvcBuilders.standaloneSetup(controller)
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();
        when(repo.findById(1L)).thenReturn(Optional.empty());
    }

    @Test
    void aDirectPutWithAUsernameAsTheWabaIdGets400AndNothingIsSaved() throws Exception {
        mvc.perform(put("/api/settings/whatsapp-config").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"phoneNumberId\":\"106540352242922\",\"businessAccountId\":\"admin\","
                                + "\"accessToken\":\"t\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message", startsWith("WhatsApp Business Account ID must contain digits only")))
                .andExpect(content().string(not(containsString("admin"))));

        verify(repo, never()).save(any());
    }

    @Test
    void aDirectPutWithNumericIdsIsSavedAndReturnsMaskedSecrets() throws Exception {
        when(repo.save(any())).thenAnswer(inv -> inv.getArgument(0));

        mvc.perform(put("/api/settings/whatsapp-config").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"phoneNumberId\":\" 106540352242922\",\"businessAccountId\":\"102290129340398\","
                                + "\"accessToken\":\"new-token-value\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.phoneNumberId").value("106540352242922"))
                .andExpect(jsonPath("$.accessToken").value(WhatsAppConfigService.MASK))
                .andExpect(content().string(not(containsString("new-token-value"))));
    }

    @Test
    void saveStillRequiresUserManagementEdit() throws Exception {
        doThrow(new AccessDeniedException("denied")).when(permissions).requireCanEdit("userManagement");

        mvc.perform(put("/api/settings/whatsapp-config").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"phoneNumberId\":\"106540352242922\"}"))
                .andExpect(status().isForbidden());

        verify(repo, never()).save(any());
    }
}
