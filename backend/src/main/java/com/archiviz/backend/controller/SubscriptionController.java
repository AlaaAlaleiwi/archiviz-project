package com.archiviz.backend.controller;

import com.archiviz.backend.dto.SubscriptionRequest;
import com.archiviz.backend.entity.Subscription;
import com.archiviz.backend.service.SubscriptionService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/subscription")
@RequiredArgsConstructor
public class SubscriptionController {

    private final SubscriptionService subscriptionService;

    @GetMapping
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Subscription> getSubscription(
            @AuthenticationPrincipal UserDetails userDetails) {
        return ResponseEntity.ok(subscriptionService.getSubscription(userDetails.getUsername()));
    }

    @PostMapping
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Subscription> selectPlan(
            @AuthenticationPrincipal UserDetails userDetails,
            @RequestBody SubscriptionRequest request) {
        return ResponseEntity.ok(subscriptionService.selectPlan(userDetails.getUsername(), request.plan()));
    }

    @GetMapping("/plans")
    @PreAuthorize("permitAll")
    public ResponseEntity<List<Map<String, Object>>> listPlans() {
        return ResponseEntity.ok(subscriptionService.listPlans());
    }

    @DeleteMapping
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Void> cancelSubscription(
            @AuthenticationPrincipal UserDetails userDetails) {
        subscriptionService.cancelSubscription(userDetails.getUsername());
        return ResponseEntity.ok().build();
    }

    @PostMapping("/reactivate")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Subscription> reactivateSubscription(
            @AuthenticationPrincipal UserDetails userDetails) {
        return ResponseEntity.ok(subscriptionService.reactivateSubscription(userDetails.getUsername()));
    }

    @GetMapping("/validate")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Map<String, Object>> validateFeature(
            @AuthenticationPrincipal UserDetails userDetails,
            @RequestParam String feature) {
        return ResponseEntity.ok(subscriptionService.validateFeature(userDetails.getUsername(), feature));
    }
}
