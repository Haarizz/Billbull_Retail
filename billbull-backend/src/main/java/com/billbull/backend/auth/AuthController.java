package com.billbull.backend.auth;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import com.billbull.backend.config.JwtUtil;
import com.billbull.backend.ratelimit.AuthBruteForceLimiter;
import com.billbull.backend.ratelimit.ClientIpResolver;
import com.billbull.backend.ratelimit.RateLimitExceededException;
import com.billbull.backend.ratelimit.RateLimitProperties;
import com.billbull.backend.security.LoginRateLimiter;
import com.billbull.backend.user.User;
import com.billbull.backend.user.UserRepository;
import org.springframework.transaction.annotation.Transactional;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtUtil jwtUtil;
    private final LoginRateLimiter loginRateLimiter;
    private final AuthBruteForceLimiter bruteForceLimiter;
    private final ClientIpResolver clientIpResolver;
    private final RateLimitProperties rateLimitProperties;

    public AuthController(
            UserRepository userRepository,
            PasswordEncoder passwordEncoder,
            JwtUtil jwtUtil,
            LoginRateLimiter loginRateLimiter,
            AuthBruteForceLimiter bruteForceLimiter,
            ClientIpResolver clientIpResolver,
            RateLimitProperties rateLimitProperties) {

        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtUtil = jwtUtil;
        this.loginRateLimiter = loginRateLimiter;
        this.bruteForceLimiter = bruteForceLimiter;
        this.clientIpResolver = clientIpResolver;
        this.rateLimitProperties = rateLimitProperties;
    }

    @Transactional
    @PostMapping("/login")
    public LoginResponse login(@RequestBody LoginRequest request, HttpServletRequest httpRequest) {

        String clientIp = clientIpResolver.resolve(httpRequest);
        String submittedUsername = request.getUsername();
        boolean rateLimitOn = rateLimitProperties.isEnabled();

        // Layer 2 (username+IP) when the feature is enabled; legacy per-IP limiter otherwise so that
        // ratelimit.enabled=false is byte-identical to pre-feature behaviour.
        if (rateLimitOn) {
            AuthBruteForceLimiter.Decision decision = bruteForceLimiter.check(clientIp, submittedUsername);
            if (!decision.allowed()) {
                throw tooManyLoginAttempts(decision.retryAfterSeconds());
            }
        } else if (!loginRateLimiter.isAllowed(clientIp)) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                "Too many login attempts. Please wait 5 minutes before trying again.");
        }

        // Accept username OR email in the "username" field — backward compatible
        User user = userRepository
                .findByUsernameAndIsActiveTrue(submittedUsername)
                .or(() -> userRepository.findByEmailAndIsActiveTrue(submittedUsername))
                .orElseThrow(() -> {
                    if (rateLimitOn) {
                        bruteForceLimiter.recordFailure(clientIp, submittedUsername);
                    }
                    return new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid username or password");
                });

        if (!passwordEncoder.matches(request.getPassword(), user.getPassword())) {
            if (rateLimitOn) {
                bruteForceLimiter.recordFailure(clientIp, submittedUsername);
            }
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid username or password");
        }

        if (rateLimitOn) {
            bruteForceLimiter.recordSuccess(clientIp, submittedUsername);
        } else {
            loginRateLimiter.recordSuccess(clientIp);
        }
        String token = jwtUtil.generateToken(user);

        // Primary role is the canonical role for sidebar fallback and login redirect.
        // If no primary role is set, pick the first role from the set as default.
        String primaryRole = user.getPrimaryRole() != null
                ? user.getPrimaryRole().getName()
                : user.getRoles().stream()
                        .map(com.billbull.backend.role.Role::getName)
                        .findFirst()
                        .orElse("USER");

        System.out.println("Login - User: " + user.getUsername() + " Primary: " + primaryRole);

        return new LoginResponse(
                token,
                user.getUsername(),
                user.getResolvedDisplayName(),
                primaryRole,  // `role` field now always equals primaryRole
                primaryRole,
                user.getBranch() != null ? user.getBranch().getId() : null,
                user.getBranch() != null ? user.getBranch().getName() : null,
                user.getBranch() != null ? user.getBranch().getCode() : null,
                user.getBranch() != null && user.getBranch().getDefaultWarehouse() != null
                        ? user.getBranch().getDefaultWarehouse().getId()
                        : null,
                user.getBranch() != null && user.getBranch().getDefaultWarehouse() != null
                        ? user.getBranch().getDefaultWarehouse().getName()
                        : null);
    }

    @Transactional(readOnly = true)
    @GetMapping("/profile")
    public UserProfileDto getProfile(org.springframework.security.core.Authentication authentication) {
        String username = authentication.getName();
        User user = userRepository.findByUsernameAndIsActiveTrue(username)
                .orElseThrow(() -> new RuntimeException("User not found"));
        return new UserProfileDto(user);
    }

    @Transactional
    @org.springframework.web.bind.annotation.PutMapping(value = "/profile", consumes = org.springframework.http.MediaType.MULTIPART_FORM_DATA_VALUE)
    public UserProfileDto updateProfile(
            org.springframework.security.core.Authentication authentication,
            @org.springframework.web.bind.annotation.RequestParam(required = false) String fullName,
            @org.springframework.web.bind.annotation.RequestParam(required = false) String email,
            @org.springframework.web.bind.annotation.RequestParam(required = false) String phone,
            @org.springframework.web.bind.annotation.RequestParam(required = false) String address,
            @org.springframework.web.bind.annotation.RequestParam(required = false) org.springframework.web.multipart.MultipartFile avatar)
            throws java.io.IOException {
        String username = authentication.getName();
        User user = userRepository.findByUsernameAndIsActiveTrue(username)
                .orElseThrow(() -> new RuntimeException("User not found"));

        if (fullName != null && !fullName.isEmpty())
            user.setFullName(fullName);
        if (email != null && !email.isEmpty())
            user.setEmail(email);
        if (phone != null && !phone.isEmpty())
            user.setPhone(phone);
        if (address != null && !address.isEmpty())
            user.setAddress(address);

        if (avatar != null && !avatar.isEmpty()) {
            String avatarUrl = com.billbull.backend.util.FileUploadUtil.saveFile(avatar);
            user.setAvatarUrl(avatarUrl);
        }

        userRepository.save(user);
        return new UserProfileDto(user);
    }

    @PostMapping("/change-password")
    public void changePassword(
            org.springframework.security.core.Authentication authentication,
            @RequestBody ChangePasswordRequest request) {
        String username = authentication.getName();
        User user = userRepository.findByUsernameAndIsActiveTrue(username)
                .orElseThrow(() -> new RuntimeException("User not found"));

        if (!passwordEncoder.matches(request.getCurrentPassword(), user.getPassword())) {
            throw new RuntimeException("Invalid current password");
        }

        user.setPassword(passwordEncoder.encode(request.getNewPassword()));
        userRepository.save(user);
    }

    /**
     * Uniform 429 for auth brute-force lockout. Uses a coded {@link RateLimitExceededException} so
     * {@link com.billbull.backend.exception.GlobalExceptionHandler} attaches {@code Retry-After}.
     * Message stays generic (no username enumeration).
     */
    private RateLimitExceededException tooManyLoginAttempts(long retryAfterSeconds) {
        return new RateLimitExceededException(
                "auth-login",
                retryAfterSeconds,
                "Too many login attempts. Please wait before trying again.");
    }
}
