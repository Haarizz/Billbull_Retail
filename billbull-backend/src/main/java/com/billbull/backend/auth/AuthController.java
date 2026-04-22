package com.billbull.backend.auth;

import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.billbull.backend.config.JwtUtil;
import com.billbull.backend.user.User;
import com.billbull.backend.user.UserRepository;
import org.springframework.transaction.annotation.Transactional;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtUtil jwtUtil;

    public AuthController(
            UserRepository userRepository,
            PasswordEncoder passwordEncoder,
            JwtUtil jwtUtil) {

        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtUtil = jwtUtil;
    }

    @Transactional
    @PostMapping("/login")
    public LoginResponse login(@RequestBody LoginRequest request) {

        // Accept username OR email in the "username" field — backward compatible
        User user = userRepository
                .findByUsernameAndIsActiveTrue(request.getUsername())
                .or(() -> userRepository.findByEmailAndIsActiveTrue(request.getUsername()))
                .orElseThrow(() -> new RuntimeException("Invalid username or password"));

        if (!passwordEncoder.matches(request.getPassword(), user.getPassword())) {
            throw new RuntimeException("Invalid username or password");
        }

        String token = jwtUtil.generateToken(user);

        String mainRole = user.getRoles().stream()
                .map(com.billbull.backend.role.Role::getName)
                .findFirst()
                .orElse("USER");

        System.out.println("Login - User: " + user.getUsername() + " Role: " + mainRole);

        return new LoginResponse(
                token,
                user.getUsername(),
                mainRole,
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
}
