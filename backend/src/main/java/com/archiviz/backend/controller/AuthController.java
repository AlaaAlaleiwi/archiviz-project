package com.archiviz.backend.controller;

import com.archiviz.backend.dto.AuthResponse;
import com.archiviz.backend.dto.AuthRequest;
import com.archiviz.backend.dto.RefreshRequest;
import com.archiviz.backend.dto.PasswordResetConfirm;
import com.archiviz.backend.dto.PasswordResetRequest;
import com.archiviz.backend.dto.SubscriptionRequest;
import com.archiviz.backend.config.CookieTokenExtractor;
import com.archiviz.backend.entity.Subscription;
import com.archiviz.backend.entity.User;
import com.archiviz.backend.repository.SubscriptionRepository;
import com.archiviz.backend.repository.UserRepository;
import com.archiviz.backend.service.AuthService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;
    private final SubscriptionRepository subscriptionRepository;
    private final UserRepository userRepository;
    private final CookieTokenExtractor cookieTokenExtractor;

    @Value("${auth.refresh-cookie.secure:false}")
    private boolean secureRefreshCookie;

    @PostMapping("/register")
    public ResponseEntity<AuthResponse> register(@RequestBody AuthRequest request, HttpServletResponse response) {
        AuthResponse authResponse = authService.register(request);
        addRefreshCookie(response, authResponse.refreshToken());
        return ResponseEntity.status(201).body(authResponse);
    }

    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(@RequestBody AuthRequest request, HttpServletResponse response) {
        AuthResponse authResponse = authService.authenticate(request);
        addRefreshCookie(response, authResponse.refreshToken());
        return ResponseEntity.ok(authResponse);
    }

    @PostMapping("/refresh")
    public ResponseEntity<AuthResponse> refresh(
            @RequestBody(required = false) RefreshRequest request,
            HttpServletRequest servletRequest,
            HttpServletResponse response) {
        String refreshToken = resolveRefreshToken(request, servletRequest);
        AuthResponse authResponse = authService.refreshToken(refreshToken);
        addRefreshCookie(response, authResponse.refreshToken());
        return ResponseEntity.ok(authResponse);
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(
            @RequestBody(required = false) RefreshRequest request,
            HttpServletRequest servletRequest,
            HttpServletResponse response) {
        authService.logout(resolveRefreshToken(request, servletRequest));
        clearRefreshCookie(response);
        return ResponseEntity.ok().build();
    }

    @PostMapping("/logout-all")
    public ResponseEntity<Void> logoutAll() {
        authService.logoutAll();
        return ResponseEntity.ok().build();
    }

    @PostMapping("/reset-password/request")
    public ResponseEntity<Void> resetPasswordRequest(@RequestBody PasswordResetRequest request) {
        authService.requestPasswordReset(request.email());
        return ResponseEntity.ok().build();
    }

    @PostMapping("/reset-password/confirm")
    public ResponseEntity<Void> resetPasswordConfirm(@RequestBody PasswordResetConfirm request) {
        authService.confirmPasswordReset(request.token(), request.newPassword());
        return ResponseEntity.ok().build();
    }

    @GetMapping("/me")
    public ResponseEntity<AuthResponse.UserInfo> getCurrentUser() {
        return ResponseEntity.ok(authService.getCurrentUser());
    }

    @GetMapping("/subscription")
    public ResponseEntity<Subscription> getSubscription() {
        return ResponseEntity.ok(authService.getCurrentSubscription());
    }

    @PostMapping("/subscription")
    public ResponseEntity<Subscription> selectPlan(@RequestBody SubscriptionRequest request) {
        return ResponseEntity.ok(authService.selectPlan(request.plan()));
    }

    @DeleteMapping("/subscription")
    public ResponseEntity<Void> cancelSubscription() {
        authService.cancelSubscription();
        return ResponseEntity.ok().build();
    }

    @PostMapping("/subscription/reactivate")
    public ResponseEntity<Subscription> reactivateSubscription() {
        return ResponseEntity.ok(authService.reactivateSubscription());
    }

    private void addRefreshCookie(HttpServletResponse response, String token) {
        ResponseCookie cookie = ResponseCookie.from("refresh_token", token)
            .httpOnly(true)
            .secure(secureRefreshCookie)
            .sameSite("Strict")
            .path("/api/auth")
            .maxAge(604800)
            .build();
        response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
    }

    private void clearRefreshCookie(HttpServletResponse response) {
        ResponseCookie cookie = ResponseCookie.from("refresh_token", "")
            .httpOnly(true)
            .secure(secureRefreshCookie)
            .sameSite("Strict")
            .path("/api/auth")
            .maxAge(0)
            .build();
        response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
    }

    private String resolveRefreshToken(RefreshRequest request, HttpServletRequest servletRequest) {
        String cookieToken = cookieTokenExtractor.extractRefreshToken(servletRequest);
        if (cookieToken != null && !cookieToken.isBlank()) return cookieToken;
        if (request != null && request.refreshToken() != null && !request.refreshToken().isBlank()) return request.refreshToken();
        throw new com.archiviz.backend.exception.AuthException("Refresh token is required.");
    }
}
