package com.archiviz.backend.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class JwtConfig {
    @Value("${jwt.secret}")
    private String secret;

    @Value("${jwt.access-token.expiration-ms:900000}")
    private long accessTokenExpirationMs;

    @Value("${jwt.refresh-token.expiration-ms:604800000}")
    private long refreshTokenExpirationMs;

    public String getSecret() { return secret; }
    public long getAccessTokenExpirationMs() { return accessTokenExpirationMs; }
    public long getRefreshTokenExpirationMs() { return refreshTokenExpirationMs; }
}
