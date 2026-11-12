package com.billbull.backend.pos.pinlogin;

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Till PIN sign-in. Lives under /api/auth (permitAll) because the person isn't signed in yet;
 * every call must carry the till's device token instead. POST bodies keep the token and PIN out
 * of URLs and access logs.
 */
@RestController
@RequestMapping("/api/auth/pos/pin")
public class PosPinAuthController {

    private final PosPinLoginService service;

    public PosPinAuthController(PosPinLoginService service) {
        this.service = service;
    }

    /** Staff who can sign in on this till, for the name picker. 401 when the till isn't enabled. */
    @PostMapping("/staff")
    public PosPinLoginService.TillStaff staff(@RequestBody DeviceRequest request) {
        return service.staffFor(request.deviceToken(), request.terminalId());
    }

    @PostMapping("/login")
    public PinLoginResponse login(@RequestBody PinLoginRequest request) {
        PosPinLoginService.PinLoginResult result =
                service.login(request.deviceToken(), request.employeeId(), request.pin());
        return new PinLoginResponse(result.login(), result.tillBranchId());
    }

    /** terminalId is optional: the till's registered terminal, used only when enrolment didn't record one. */
    public record DeviceRequest(String deviceToken, String terminalId) {
    }

    public record PinLoginRequest(String deviceToken, Long employeeId, String pin) {
    }

    /** The usual sign-in body plus the branch the till runs on. */
    public static class PinLoginResponse extends com.billbull.backend.auth.LoginResponse {
        private final Long tillBranchId;

        PinLoginResponse(com.billbull.backend.auth.LoginResponse base, Long tillBranchId) {
            super(base.getToken(), base.getUsername(), base.getFullName(), base.getRole(), base.getPrimaryRole(),
                    base.getBranchId(), base.getBranchName(), base.getBranchCode(),
                    base.getDefaultWarehouseId(), base.getDefaultWarehouseName());
            this.tillBranchId = tillBranchId;
        }

        public Long getTillBranchId() {
            return tillBranchId;
        }
    }
}
