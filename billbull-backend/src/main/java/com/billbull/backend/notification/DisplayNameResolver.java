package com.billbull.backend.notification;

import com.billbull.backend.settings.branch.Branch;
import com.billbull.backend.settings.branch.BranchRepository;
import com.billbull.backend.user.UserRepository;
import org.springframework.stereotype.Component;

import java.util.Collection;
import java.util.HashMap;
import java.util.Map;
import java.util.Objects;

/**
 * Batch label lookups for a page of notifications or activity rows: one query for the people,
 * one for the branches, no matter how many rows the page has.
 */
@Component
public class DisplayNameResolver {

    private final UserRepository userRepository;
    private final BranchRepository branchRepository;

    public DisplayNameResolver(UserRepository userRepository, BranchRepository branchRepository) {
        this.userRepository = userRepository;
        this.branchRepository = branchRepository;
    }

    /** username → full name (falls back to nothing; callers show the username then). */
    public Map<String, String> fullNames(Collection<String> usernames) {
        Map<String, String> out = new HashMap<>();
        var wanted = usernames.stream().filter(Objects::nonNull).distinct().toList();
        if (wanted.isEmpty()) return out;
        for (Object[] row : userRepository.findDisplayNamesByUsernameIn(wanted)) {
            String username = (String) row[0];
            String fullName = (String) row[1];
            if (username != null && fullName != null && !fullName.isBlank()) {
                out.put(username, fullName.trim());
            }
        }
        return out;
    }

    /** branch id → branch name. */
    public Map<Long, String> branchNames(Collection<Long> branchIds) {
        Map<Long, String> out = new HashMap<>();
        var wanted = branchIds.stream().filter(Objects::nonNull).distinct().toList();
        if (wanted.isEmpty()) return out;
        for (Branch b : branchRepository.findAllById(wanted)) {
            if (b.getName() != null) out.put(b.getId(), b.getName());
        }
        return out;
    }
}
