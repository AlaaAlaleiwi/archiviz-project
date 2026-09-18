package com.archiviz.backend.dto;

public record AuthResponse(
    String accessToken,
    String refreshToken,
    UserInfo user
) {
    public record UserInfo(
        String id,
        String name,
        String email,
        String role,
        String createdAt
    ) {}
}
