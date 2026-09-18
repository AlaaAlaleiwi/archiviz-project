package com.archiviz.backend.service;

import com.archiviz.backend.entity.RefreshToken;
import com.archiviz.backend.repository.RefreshTokenRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

@Service
@RequiredArgsConstructor
public class RefreshTokenService {

    private final RefreshTokenRepository refreshTokenRepository;

    @Transactional
    public void revokeAllForUser(String email) {
        refreshTokenRepository.findByUserEmail(email).forEach(token -> {
            token.setRevokedAt(LocalDateTime.now());
            refreshTokenRepository.save(token);
        });
    }

    public boolean isTokenValid(String tokenHash) {
        return refreshTokenRepository.findByTokenHash(tokenHash)
            .map(token -> token.getRevokedAt() == null && token.getExpiresAt().isAfter(LocalDateTime.now()))
            .orElse(false);
    }

    public void deleteExpired() {
        List<RefreshToken> expired = refreshTokenRepository.findAll().stream()
            .filter(t -> t.getExpiresAt().isBefore(LocalDateTime.now()))
            .toList();
        refreshTokenRepository.deleteAll(expired);
    }
}
