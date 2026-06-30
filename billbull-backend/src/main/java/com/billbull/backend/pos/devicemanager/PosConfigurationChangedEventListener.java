package com.billbull.backend.pos.devicemanager;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * Deliberate stub subscriber for {@link PosConfigurationChangedEvent} — proves the publish/
 * subscribe wiring works end-to-end without building the real integrations (Local Device Agent
 * push, Dashboard live refresh, audit trail, notifications) this phase doesn't need yet. Replace
 * or add sibling listeners as each of those integrations is actually built; this class's only
 * job is to exist as the documented extension point, not to be the final implementation of any
 * of them.
 */
@Component
public class PosConfigurationChangedEventListener {

    private static final Logger log = LoggerFactory.getLogger(PosConfigurationChangedEventListener.class);

    @EventListener
    public void onConfigurationChanged(PosConfigurationChangedEvent event) {
        log.info("[PosConfigurationChanged] terminal={} branchId={} hardwareProfileId={} version={} reason={}",
                event.getTerminalId(), event.getBranchId(), event.getHardwareProfileId(),
                event.getProfileVersion(), event.getReason());
    }
}
