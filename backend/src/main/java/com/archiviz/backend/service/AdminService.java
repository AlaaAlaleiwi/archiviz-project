package com.archiviz.backend.service;

import com.archiviz.backend.entity.Subscription;
import com.archiviz.backend.entity.User;
import com.archiviz.backend.repository.SubscriptionRepository;
import com.archiviz.backend.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import java.util.concurrent.ConcurrentHashMap;

@Service
@RequiredArgsConstructor
public class AdminService {

    private final UserRepository userRepository;
    private final SubscriptionRepository subscriptionRepository;
    private final Map<String, Object> runtimeConfig = new ConcurrentHashMap<>();

    public List<Map<String, Object>> listUsers(int page, int size) {
        return userRepository.findAll().stream()
            .skip((long) page * size)
            .limit(size)
            .map(this::userSummary)
            .collect(Collectors.toList());
    }

    public Map<String, Object> getUserDetails(String id) {
        User user = userRepository.findById(id)
            .orElseThrow(() -> new RuntimeException("User not found"));
        Subscription sub = subscriptionRepository.findByUser(user).orElse(null);
        Map<String, Object> details = userSummary(user);
        if (sub != null) {
            Map<String, Object> subscription = new LinkedHashMap<>();
            subscription.put("id", sub.getId());
            subscription.put("plan", sub.getPlan().name());
            subscription.put("status", sub.getStatus().name());
            subscription.put("currentPeriodEnd", sub.getCurrentPeriodEnd() != null ? sub.getCurrentPeriodEnd().toString() : null);
            subscription.put("cancelAtPeriodEnd", sub.isCancelAtPeriodEnd());
            details.put("subscription", subscription);
        }
        return details;
    }

    public void deleteUser(String id) {
        userRepository.findById(id)
            .orElseThrow(() -> new RuntimeException("User not found"));
        userRepository.deleteById(id);
    }

    public List<Map<String, Object>> listSubscriptions(int page, int size) {
        return subscriptionRepository.findAll().stream()
            .skip((long) page * size)
            .limit(size)
            .map(s -> {
                Map<String, Object> result = new LinkedHashMap<>();
                result.put("id", s.getId());
                result.put("userEmail", s.getUser().getEmail());
                result.put("plan", s.getPlan().name());
                result.put("status", s.getStatus().name());
                result.put("currentPeriodEnd", s.getCurrentPeriodEnd() != null ? s.getCurrentPeriodEnd().toString() : null);
                result.put("cancelAtPeriodEnd", s.isCancelAtPeriodEnd());
                result.put("createdAt", s.getCreatedAt().toString());
                return result;
            })
            .collect(Collectors.toList());
    }

    public void cancelSubscription(String id) {
        Subscription subscription = subscriptionRepository.findById(id)
            .orElseThrow(() -> new IllegalArgumentException("Subscription not found"));
        subscription.setCancelAtPeriodEnd(true);
        subscription.setStatus(Subscription.Status.CANCELED);
        subscriptionRepository.save(subscription);
    }

    public Map<String, Object> getStats() {
        long userCount = userRepository.count();
        long activeSubs = subscriptionRepository.findAll().stream()
            .filter(s -> s.getStatus() == Subscription.Status.ACTIVE).count();
        return Map.of(
            "userCount", userCount,
            "activeSubscriptions", activeSubs,
            "revenueProjection", activeSubs * 12
        );
    }

    public Map<String, Object> getConfig() {
        if (!runtimeConfig.isEmpty()) return new LinkedHashMap<>(runtimeConfig);
        Map<String, Object> config = new HashMap<>();
        config.put("rateLimitRequestsPerMinute", 5);
        config.put("maxHistoryEntriesFree", 5);
        config.put("tokenAccessExpirationMs", 900000);
        config.put("tokenRefreshExpirationMs", 604800000);
        Map<String, Object> flags = new HashMap<>();
        flags.put("enableSubscription", true);
        flags.put("enablePasswordReset", true);
        flags.put("enableAdminPanel", true);
        config.put("featureFlags", flags);
        return config;
    }

    public void updateConfig(Map<String, Object> config) {
        if (config == null || config.isEmpty()) {
            throw new IllegalArgumentException("Configuration must not be empty.");
        }
        runtimeConfig.clear();
        runtimeConfig.putAll(config);
    }

    private Map<String, Object> userSummary(User user) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("id", user.getId());
        result.put("email", user.getEmail());
        result.put("name", user.getName());
        result.put("role", user.getRole().name());
        result.put("createdAt", user.getCreatedAt().toString());
        subscriptionRepository.findByUser(user).ifPresent(subscription -> result.put("subscription", Map.of(
            "plan", subscription.getPlan().name(),
            "status", subscription.getStatus().name()
        )));
        return result;
    }
}
