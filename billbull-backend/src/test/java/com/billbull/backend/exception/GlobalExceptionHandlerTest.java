package com.billbull.backend.exception;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.orm.ObjectOptimisticLockingFailureException;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

class GlobalExceptionHandlerTest {

    private final GlobalExceptionHandler handler = new GlobalExceptionHandler();

    @Test
    void handleOptimisticLocking_ShouldReturn409Conflict() {
        // Given
        ObjectOptimisticLockingFailureException ex = new ObjectOptimisticLockingFailureException("Entity", 1);
        
        // When
        ResponseEntity<Map<String, Object>> response = handler.handleOptimisticLocking(ex);
        
        // Then
        assertEquals(HttpStatus.CONFLICT, response.getStatusCode());
        assertNotNull(response.getBody());
        assertEquals("OPTIMISTIC_LOCK_FAILED", response.getBody().get("code"));
        assertEquals("This request was modified by another user. Please refresh the page.", response.getBody().get("message"));
    }
}
