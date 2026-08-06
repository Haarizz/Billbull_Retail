package com.billbull.backend.pos.session;

import com.billbull.backend.pos.settings.PosSettings;
import com.billbull.backend.pos.settings.PosSettingsService;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class PosAuthorizationService {

    private final PosSettingsService posSettingsService;

    public PosAuthorizationService(PosSettingsService posSettingsService) {
        this.posSettingsService = posSettingsService;
    }

    /**
     * Authorizes the Business Day Close action for the given branch.
     * Reads POS Settings to determine if supervisor authorization is required.
     * Throws 403 Forbidden if authorization fails.
     */
    public void authorizeDayClose(Long branchId) {
        PosSettings settings = posSettingsService.getForBranch(branchId);
        
        if (Boolean.TRUE.equals(settings.getRequireSupervisorForDayClose())) {
            Authentication auth = SecurityContextHolder.getContext().getAuthentication();
            if (auth == null) {
                throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Authentication required.");
            }
            
            boolean isSupervisor = auth.getAuthorities().stream()
                    .map(GrantedAuthority::getAuthority)
                    .anyMatch(PosSettingsService.SUPERVISOR_ROLES::contains);
                    
            if (!isSupervisor) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Business Day Close requires supervisor authorization.");
            }
        }
    }
}
