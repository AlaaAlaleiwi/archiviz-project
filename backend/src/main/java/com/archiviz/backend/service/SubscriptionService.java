package com.archiviz.backend.service;

import com.archiviz.backend.dto.SubscriptionRequest;
import com.archiviz.backend.entity.Subscription;
import com.archiviz.backend.entity.User;
import com.archiviz.backend.repository.SubscriptionRepository;
import com.archiviz.backend.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class SubscriptionService {

    private final SubscriptionRepository subscriptionRepository;
    private final UserRepository userRepository;

    public Subscription getSubscription(String email) {
        User user = userRepository.findByEmail(email)
            .orElseThrow(() -> new RuntimeException("User not found"));
        return subscriptionRepository.findByUser(user)
            .orElseThrow(() -> new RuntimeException("No subscription found"));
    }

    @Transactional
    public Subscription selectPlan(String email, String plan) {
        User user = userRepository.findByEmail(email)
            .orElseThrow(() -> new RuntimeException("User not found"));
        Subscription sub = subscriptionRepository.findByUser(user)
            .orElseThrow(() -> new RuntimeException("No subscription found"));
        sub.setPlan(Subscription.Plan.valueOf(plan));
        sub.setStatus(Subscription.Status.ACTIVE);
        sub.setCancelAtPeriodEnd(false);
        sub.setCurrentPeriodEnd(LocalDateTime.now().plusMonths(1));
        sub.setUpdatedAt(LocalDateTime.now());
        return subscriptionRepository.save(sub);
    }

    public List<Map<String, Object>> listPlans() {
        return List.of(
            Map.of(
                "id", "free", "name", "FREE",
                "description", "Basic features with limited history",
                "price", "$0",
                "features", List.of("5 history entries", "Basic templates", "Community support")
            ),
            Map.of(
                "id", "pro", "name", "PRO",
                "description", "Unlimited history and priority generation",
                "price", "$12/mo",
                "features", List.of("Unlimited history", "Priority AI generation", "Advanced templates", "Email support")
            ),
            Map.of(
                "id", "team", "name", "TEAM",
                "description", "Shared projects and team collaboration",
                "price", "$29/mo",
                "features", List.of("Everything in Pro", "Shared projects", "Team templates", "Role-based access", "Priority support")
            )
        );
    }

    public void cancelSubscription(String email) {
        User user = userRepository.findByEmail(email)
            .orElseThrow(() -> new RuntimeException("User not found"));
        Subscription sub = subscriptionRepository.findByUser(user)
            .orElseThrow(() -> new RuntimeException("No subscription found"));
        sub.setCancelAtPeriodEnd(true);
        sub.setStatus(Subscription.Status.CANCELED);
        sub.setUpdatedAt(LocalDateTime.now());
        subscriptionRepository.save(sub);
    }

    public Subscription reactivateSubscription(String email) {
        User user = userRepository.findByEmail(email)
            .orElseThrow(() -> new RuntimeException("User not found"));
        Subscription sub = subscriptionRepository.findByUser(user)
            .orElseThrow(() -> new RuntimeException("No subscription found"));
        sub.setCancelAtPeriodEnd(false);
        sub.setStatus(Subscription.Status.ACTIVE);
        sub.setUpdatedAt(LocalDateTime.now());
        return subscriptionRepository.save(sub);
    }

    public Map<String, Object> validateFeature(String email, String feature) {
        Subscription sub = getSubscription(email);
        boolean allowed = switch (feature) {
            case "history" -> sub.getStatus() == Subscription.Status.ACTIVE;
            case "priority-generation" -> sub.getPlan() == Subscription.Plan.PRO || sub.getPlan() == Subscription.Plan.TEAM;
            case "team-projects" -> sub.getPlan() == Subscription.Plan.TEAM;
            default -> true;
        };
        return Map.of(
            "feature", feature,
            "allowed", allowed,
            "plan", sub.getPlan().name(),
            "status", sub.getStatus().name()
        );
    }
}
