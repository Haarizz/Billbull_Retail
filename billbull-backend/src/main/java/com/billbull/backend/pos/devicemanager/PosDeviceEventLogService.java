package com.billbull.backend.pos.devicemanager;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class PosDeviceEventLogService {

    private final PosDeviceEventLogRepository repo;

    public PosDeviceEventLogService(PosDeviceEventLogRepository repo) {
        this.repo = repo;
    }

    public PosDeviceEventLog record(Long deviceId, PosDeviceEventType eventType, PosDeviceEventResult result,
                                     String operation, String errorMessage, Long branchId, String terminalId) {
        PosDeviceEventLog event = new PosDeviceEventLog();
        event.setDeviceId(deviceId);
        event.setEventType(eventType);
        event.setResult(result);
        event.setOperation(operation);
        event.setErrorMessage(errorMessage);
        event.setBranchId(branchId);
        event.setTerminalId(terminalId);
        event.setActorUser(currentUser());
        return repo.save(event);
    }

    public List<PosDeviceEventLog> tailFor(Long deviceId) {
        return repo.findTop50ByDeviceIdOrderByCreatedAtDesc(deviceId);
    }

    private String currentUser() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        return auth != null ? auth.getName() : "system";
    }
}
