package com.archiviz.backend.config;

import com.archiviz.backend.entity.Subscription;
import com.archiviz.backend.entity.User;
import com.archiviz.backend.repository.SubscriptionRepository;
import com.archiviz.backend.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

@Component
@RequiredArgsConstructor
public class AdminBootstrap implements ApplicationRunner {
    private final UserRepository userRepository;
    private final SubscriptionRepository subscriptionRepository;
    private final PasswordEncoder passwordEncoder;

    @Value("${app.admin.email:}") private String adminEmail;
    @Value("${app.admin.password:}") private String adminPassword;
    @Value("${app.admin.name:Archiviz Admin}") private String adminName;

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        if (adminEmail.isBlank() || adminPassword.isBlank()) return;
        User admin = userRepository.findByEmail(adminEmail.toLowerCase()).orElseGet(() -> userRepository.save(User.builder()
            .email(adminEmail.toLowerCase())
            .name(adminName)
            .passwordHash(passwordEncoder.encode(adminPassword))
            .role(User.Role.ADMIN)
            .build()));
        if (admin.getRole() != User.Role.ADMIN) {
            admin.setRole(User.Role.ADMIN);
            userRepository.save(admin);
        }
        if (subscriptionRepository.findByUser(admin).isEmpty()) {
            subscriptionRepository.save(Subscription.builder()
                .user(admin).plan(Subscription.Plan.TEAM).status(Subscription.Status.ACTIVE)
                .currentPeriodEnd(LocalDateTime.now().plusYears(10)).cancelAtPeriodEnd(false).build());
        }
    }
}
