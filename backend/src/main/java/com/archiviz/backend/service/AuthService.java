package com.archiviz.backend.service;

import com.archiviz.backend.dto.*;
import com.archiviz.backend.entity.RefreshToken;
import com.archiviz.backend.entity.Subscription;
import com.archiviz.backend.entity.User;
import com.archiviz.backend.exception.AuthException;
import com.archiviz.backend.repository.RefreshTokenRepository;
import com.archiviz.backend.repository.SubscriptionRepository;
import com.archiviz.backend.repository.UserRepository;
import com.archiviz.backend.config.JwtTokenProvider;
import com.archiviz.backend.config.JwtConfig;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Base64;

@Service
@RequiredArgsConstructor
public class AuthService implements UserDetailsService {

    private final UserRepository userRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final SubscriptionRepository subscriptionRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenProvider jwtTokenProvider;
    private final JwtConfig jwtConfig;
    private final PasswordResetService passwordResetService;

    @Value("${auth.rate-limit.requests-per-minute:5}")
    private int requestsPerMinute;

    @Transactional
    public AuthResponse register(AuthRequest request) {
        if (userRepository.findByEmail(request.email().toLowerCase()).isPresent()) {
            throw new AuthException("An account with this email already exists.");
        }
        if (request.password().length() < 6) {
            throw new AuthException("Password must be at least 6 characters.");
        }

        User user = User.builder()
            .email(request.email().toLowerCase())
            .name(request.name() != null ? request.name().trim() : request.email().split("@")[0])
            .passwordHash(passwordEncoder.encode(request.password()))
            .role(User.Role.USER)
            .build();

        User saved = userRepository.save(user);

        Subscription sub = Subscription.builder()
            .user(saved)
            .plan(Subscription.Plan.FREE)
            .status(Subscription.Status.ACTIVE)
            .currentPeriodEnd(LocalDateTime.now().plusMonths(1))
            .cancelAtPeriodEnd(false)
            .build();
        subscriptionRepository.save(sub);

        String accessToken = jwtTokenProvider.generateAccessToken(saved.getEmail());
        String refreshToken = jwtTokenProvider.generateRefreshToken(saved.getEmail());
        saveRefreshToken(saved, refreshToken);

        return buildAuthResponse(saved, accessToken, refreshToken);
    }

    public AuthResponse authenticate(AuthRequest request) {
        User user = userRepository.findByEmail(request.email().toLowerCase())
            .orElseThrow(() -> new AuthException("Invalid email or password."));
        if (!passwordEncoder.matches(request.password(), user.getPasswordHash())) {
            throw new AuthException("Invalid email or password.");
        }

        String accessToken = jwtTokenProvider.generateAccessToken(user.getEmail());
        String refreshToken = jwtTokenProvider.generateRefreshToken(user.getEmail());
        saveRefreshToken(user, refreshToken);

        return buildAuthResponse(user, accessToken, refreshToken);
    }

    @Transactional
    public AuthResponse refreshToken(String refreshTokenValue) {
        RefreshToken token = refreshTokenRepository.findByTokenHash(hashToken(refreshTokenValue))
            .orElseThrow(() -> new AuthException("Invalid refresh token."));

        if (token.getRevokedAt() != null || token.getExpiresAt().isBefore(LocalDateTime.now())) {
            refreshTokenRepository.findByUser(token.getUser()).forEach(userToken -> {
                userToken.setRevokedAt(LocalDateTime.now());
                refreshTokenRepository.save(userToken);
            });
            throw new AuthException("Refresh token expired or revoked.");
        }

        User user = token.getUser();
        String newAccessToken = jwtTokenProvider.generateAccessToken(user.getEmail());
        String newRefreshToken = jwtTokenProvider.generateRefreshToken(user.getEmail());

        token.setRevokedAt(LocalDateTime.now());
        RefreshToken replacement = saveRefreshToken(user, newRefreshToken);
        token.setReplacedByTokenId(replacement.getId());
        refreshTokenRepository.save(token);

        return buildAuthResponse(user, newAccessToken, newRefreshToken);
    }

    @Transactional
    public void logout(String refreshTokenValue) {
        RefreshToken token = refreshTokenRepository.findByTokenHash(hashToken(refreshTokenValue))
            .orElseThrow(() -> new AuthException("Invalid refresh token."));
        token.setRevokedAt(LocalDateTime.now());
        refreshTokenRepository.save(token);
    }

    @Transactional
    public void logoutAll() {
        String email = org.springframework.security.core.context.SecurityContextHolder
            .getContext().getAuthentication().getName();
        refreshTokenRepository.findByUserEmail(email).forEach(token -> {
            token.setRevokedAt(LocalDateTime.now());
            refreshTokenRepository.save(token);
        });
    }

    public void requestPasswordReset(String email) {
        userRepository.findByEmail(email.toLowerCase()).ifPresent(passwordResetService::sendResetToken);
    }

    @Transactional
    public void confirmPasswordReset(String token, String newPassword) {
        if (newPassword == null || newPassword.length() < 6) {
            throw new AuthException("Password must be at least 6 characters.");
        }
        passwordResetService.processResetToken(token, newPassword, passwordEncoder);
    }

    public AuthResponse.UserInfo getCurrentUser() {
        String email = org.springframework.security.core.context.SecurityContextHolder
            .getContext().getAuthentication().getName();
        User user = userRepository.findByEmail(email)
            .orElseThrow(() -> new UsernameNotFoundException("User not found"));
        return toUserInfo(user);
    }

    public Subscription getCurrentSubscription() {
        String email = org.springframework.security.core.context.SecurityContextHolder
            .getContext().getAuthentication().getName();
        User user = userRepository.findByEmail(email)
            .orElseThrow(() -> new UsernameNotFoundException("User not found"));
        return subscriptionRepository.findByUser(user)
            .orElseThrow(() -> new AuthException("No subscription found."));
    }

    public Subscription selectPlan(String plan) {
        String email = org.springframework.security.core.context.SecurityContextHolder
            .getContext().getAuthentication().getName();
        User user = userRepository.findByEmail(email)
            .orElseThrow(() -> new UsernameNotFoundException("User not found"));
        Subscription sub = subscriptionRepository.findByUser(user)
            .orElseThrow(() -> new AuthException("No subscription found."));
        sub.setPlan(Subscription.Plan.valueOf(plan));
        sub.setStatus(Subscription.Status.ACTIVE);
        sub.setCancelAtPeriodEnd(false);
        sub.setUpdatedAt(LocalDateTime.now());
        subscriptionRepository.save(sub);
        return sub;
    }

    public void cancelSubscription() {
        String email = org.springframework.security.core.context.SecurityContextHolder
            .getContext().getAuthentication().getName();
        User user = userRepository.findByEmail(email)
            .orElseThrow(() -> new UsernameNotFoundException("User not found"));
        Subscription sub = subscriptionRepository.findByUser(user)
            .orElseThrow(() -> new AuthException("No subscription found."));
        sub.setCancelAtPeriodEnd(true);
        sub.setStatus(Subscription.Status.CANCELED);
        sub.setUpdatedAt(LocalDateTime.now());
        subscriptionRepository.save(sub);
    }

    public Subscription reactivateSubscription() {
        String email = org.springframework.security.core.context.SecurityContextHolder
            .getContext().getAuthentication().getName();
        User user = userRepository.findByEmail(email)
            .orElseThrow(() -> new UsernameNotFoundException("User not found"));
        Subscription sub = subscriptionRepository.findByUser(user)
            .orElseThrow(() -> new AuthException("No subscription found."));
        sub.setCancelAtPeriodEnd(false);
        sub.setStatus(Subscription.Status.ACTIVE);
        sub.setUpdatedAt(LocalDateTime.now());
        subscriptionRepository.save(sub);
        return sub;
    }

    @Transactional
    public void deleteAccount() {
        String email = org.springframework.security.core.context.SecurityContextHolder
            .getContext().getAuthentication().getName();
        User user = userRepository.findByEmail(email)
            .orElseThrow(() -> new UsernameNotFoundException("User not found"));
        refreshTokenRepository.findByUser(user).forEach(t -> {
            t.setRevokedAt(LocalDateTime.now());
            refreshTokenRepository.save(t);
        });
        userRepository.delete(user);
    }

    private RefreshToken saveRefreshToken(User user, String token) {
        RefreshToken refreshToken = RefreshToken.builder()
            .user(user)
            .tokenHash(hashToken(token))
            .expiresAt(LocalDateTime.now().plusDays(7))
            .build();
        return refreshTokenRepository.save(refreshToken);
    }

    private String hashToken(String token) {
        java.security.MessageDigest md;
        try {
            md = java.security.MessageDigest.getInstance("SHA-256");
            byte[] hash = md.digest(token.getBytes());
            return Base64.getEncoder().encodeToString(hash);
        } catch (Exception e) {
            throw new AuthException("Token hashing failed.");
        }
    }

    private AuthResponse buildAuthResponse(User user, String accessToken, String refreshToken) {
        return new AuthResponse(
            accessToken,
            refreshToken,
            new AuthResponse.UserInfo(
                user.getId(),
                user.getName(),
                user.getEmail(),
                user.getRole().name(),
                user.getCreatedAt().toString()
            )
        );
    }

    private AuthResponse.UserInfo toUserInfo(User user) {
        return new AuthResponse.UserInfo(
            user.getId(),
            user.getName(),
            user.getEmail(),
            user.getRole().name(),
            user.getCreatedAt().toString()
        );
    }

    @Override
    public UserDetails loadUserByUsername(String email) throws UsernameNotFoundException {
        return userRepository.findByEmail(email)
            .map(u -> org.springframework.security.core.userdetails.User
                .withUsername(u.getEmail())
                .password(u.getPasswordHash())
                .roles(u.getRole().name())
                .build())
            .orElseThrow(() -> new UsernameNotFoundException("User not found: " + email));
    }
}
