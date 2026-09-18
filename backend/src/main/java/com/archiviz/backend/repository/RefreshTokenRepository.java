package com.archiviz.backend.repository;

import com.archiviz.backend.entity.RefreshToken;
import com.archiviz.backend.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface RefreshTokenRepository extends JpaRepository<RefreshToken, String> {
    Optional<RefreshToken> findByTokenHash(String tokenHash);
    List<RefreshToken> findByUser(User user);
    List<RefreshToken> findByUserEmail(String email);
}
