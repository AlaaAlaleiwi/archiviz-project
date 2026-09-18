package com.archiviz.backend.config;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;

@Service
public class JwtTokenProvider {

    private final SecretKey secretKey;
    private final long accessTokenExpirationMs;
    private final long refreshTokenExpirationMs;

    public JwtTokenProvider(JwtConfig config) {
        this.secretKey = Keys.hmacShaKeyFor(config.getSecret().getBytes(StandardCharsets.UTF_8));
        this.accessTokenExpirationMs = config.getAccessTokenExpirationMs();
        this.refreshTokenExpirationMs = config.getRefreshTokenExpirationMs();
    }

    public String generateAccessToken(String username) {
        Date now = new Date();
        Date expiry = new Date(now.getTime() + accessTokenExpirationMs);
        return Jwts.builder()
            .subject(username)
            .claim("token_type", "access")
            .issuedAt(now)
            .expiration(expiry)
            .signWith(secretKey)
            .compact();
    }

    public String generateRefreshToken(String username) {
        Date now = new Date();
        Date expiry = new Date(now.getTime() + refreshTokenExpirationMs);
        return Jwts.builder()
            .subject(username)
            .claim("token_type", "refresh")
            .issuedAt(now)
            .expiration(expiry)
            .signWith(secretKey)
            .compact();
    }

    public boolean validateToken(String token) {
        try {
            Claims claims = Jwts.parser().verifyWith(secretKey).build().parseSignedClaims(token).getPayload();
            return "access".equals(claims.get("token_type", String.class));
        } catch (Exception e) {
            return false;
        }
    }

    public String getUsername(String token) {
        Claims claims = Jwts.parser().verifyWith(secretKey).build().parseSignedClaims(token).getPayload();
        return claims.getSubject();
    }
}
