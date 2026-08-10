package com.billbull.backend.pos.auth;

import com.billbull.backend.user.User;
import com.billbull.backend.user.UserRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.util.Optional;

@Service
public class PosCredentialVerificationService {
    
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    public PosCredentialVerificationService(UserRepository userRepository, PasswordEncoder passwordEncoder) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
    }

    public CredentialVerificationResult verifyCredentials(String emailOrUsername, String password) {
        if (emailOrUsername == null || emailOrUsername.isBlank() || password == null || password.isBlank()) {
            return CredentialVerificationResult.invalid("Email/username and password are required.");
        }

        Optional<User> userOpt = userRepository.findByEmailAndIsActiveTrue(emailOrUsername);
        if (userOpt.isEmpty()) {
            userOpt = userRepository.findByUsernameAndIsActiveTrue(emailOrUsername);
        }

        if (userOpt.isEmpty()) {
            return CredentialVerificationResult.invalid("Account not found or inactive.");
        }

        User user = userOpt.get();

        if (!passwordEncoder.matches(password, user.getPassword())) {
            return CredentialVerificationResult.invalid("Incorrect password.");
        }

        return CredentialVerificationResult.valid(user);
    }
}
