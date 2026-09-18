package com.archiviz.backend.repository;

import com.archiviz.backend.entity.Subscription;
import com.archiviz.backend.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface SubscriptionRepository extends JpaRepository<Subscription, String> {
    Optional<Subscription> findByUser(User user);
}
