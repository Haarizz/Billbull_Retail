package com.billbull.backend.presence;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.jdbc.core.JdbcTemplate;

import com.billbull.backend.presence.UserPresenceService.App;
import com.billbull.backend.presence.UserPresenceService.Touch;

@ExtendWith(MockitoExtension.class)
class UserPresenceServiceTest {

    private static final String CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0 Safari/537.36";
    private static final String ELECTRON = "Mozilla/5.0 (Windows NT 10.0) BillBullPOS/1.0 Chrome/128.0 Electron/32.1.0 Safari/537.36";

    @Mock
    JdbcTemplate jdbc;

    @Test
    void classifiesTheAppFromHeaderAndUserAgent() {
        assertThat(UserPresenceService.classify("retail", CHROME)).isEqualTo(App.RETAIL);
        assertThat(UserPresenceService.classify("pos", CHROME)).isEqualTo(App.POS);
        assertThat(UserPresenceService.classify("pos", ELECTRON)).isEqualTo(App.POS_DESKTOP);
        assertThat(UserPresenceService.classify(null, ELECTRON)).isEqualTo(App.POS_DESKTOP);
        assertThat(UserPresenceService.classify(null, CHROME)).isEqualTo(App.OTHER);
        assertThat(UserPresenceService.classify("something-else", null)).isEqualTo(App.OTHER);
    }

    @Test
    void deviceKeyFollowsTheBrowserIdAndFallsBackToUserAgentAndIp() {
        Touch a = touch(1L, "abcd1234-ef", CHROME, "10.0.0.1");
        Touch sameDeviceNewIp = touch(1L, "abcd1234-ef", CHROME, "10.0.0.2");
        Touch otherUser = touch(2L, "abcd1234-ef", CHROME, "10.0.0.1");
        assertThat(UserPresenceService.deviceKey(a)).hasSize(40).isEqualTo(UserPresenceService.deviceKey(sameDeviceNewIp));
        assertThat(UserPresenceService.deviceKey(a)).isNotEqualTo(UserPresenceService.deviceKey(otherUser));

        // A malformed id is ignored, so the key comes from user agent + IP.
        Touch bad = touch(1L, "x y", CHROME, "10.0.0.1");
        Touch none = touch(1L, null, CHROME, "10.0.0.1");
        assertThat(UserPresenceService.deviceKey(bad)).isEqualTo(UserPresenceService.deviceKey(none));
        assertThat(UserPresenceService.deviceKey(none)).isNotEqualTo(UserPresenceService.deviceKey(touch(1L, null, CHROME, "10.0.0.9")));
    }

    @Test
    void writesAtMostOncePerMinutePerDevice() {
        UserPresenceService service = new UserPresenceService(jdbc);
        service.touch(touch(1L, "device-0001", CHROME, "10.0.0.1"));
        service.touch(touch(1L, "device-0001", CHROME, "10.0.0.1"));
        service.touch(touch(1L, "device-0002", CHROME, "10.0.0.1"));
        verify(jdbc, times(2)).update(anyString(), any(Object[].class));
    }

    @Test
    void aDatabaseErrorNeverEscapesAndBacksOff() {
        when(jdbc.update(anyString(), any(Object[].class))).thenThrow(new DataAccessResourceFailureException("no table"));
        UserPresenceService service = new UserPresenceService(jdbc);
        service.touch(touch(1L, "device-0001", CHROME, "10.0.0.1"));
        service.touch(touch(2L, "device-0002", CHROME, "10.0.0.1"));
        verify(jdbc, times(1)).update(anyString(), any(Object[].class));
    }

    private static Touch touch(Long userId, String deviceId, String ua, String ip) {
        return new Touch(userId, "user" + userId, List.of("ADMIN"), 1L, "retail", deviceId, ua, ip, null);
    }
}
