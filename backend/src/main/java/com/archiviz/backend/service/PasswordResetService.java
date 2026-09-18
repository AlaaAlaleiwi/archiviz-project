package com.archiviz.backend.service;

import com.archiviz.backend.entity.PasswordResetToken;
import com.archiviz.backend.entity.User;
import com.archiviz.backend.repository.RefreshTokenRepository;
import com.archiviz.backend.repository.PasswordResetTokenRepository;
import com.archiviz.backend.repository.UserRepository;
import jakarta.mail.MessagingException;
import jakarta.mail.Session;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeMessage;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.Base64;
import java.util.Properties;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class PasswordResetService {

    private final UserRepository userRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final PasswordResetTokenRepository passwordResetTokenRepository;

    @Value("${mail.smtp.host:}")
    private String smtpHost;

    @Value("${mail.smtp.port:587}")
    private int smtpPort;

    @Value("${mail.smtp.user:}")
    private String smtpUser;

    @Value("${mail.smtp.password:}")
    private String smtpPassword;

    @Value("${app.url:http://localhost:5173}")
    private String appUrl;

    @Value("${spring.profiles.active:dev}")
    private String activeProfile;

    public void sendResetToken(User user) {
        String token = UUID.randomUUID().toString();
        String tokenHash = hashToken(token);

        passwordResetTokenRepository.findByUser(user).forEach(passwordResetTokenRepository::delete);
        PasswordResetToken resetToken = PasswordResetToken.builder()
            .user(user).tokenHash(tokenHash).expiresAt(LocalDateTime.now().plusHours(1)).build();
        passwordResetTokenRepository.save(resetToken);

        if ("dev".equals(activeProfile) || smtpHost.isEmpty()) {
            System.out.println("[PASSWORD RESET] Token for " + user.getEmail() + ": " + token);
        } else {
            sendEmail(user.getEmail(), token);
        }
    }

    public void processResetToken(String token, String newPassword,
                                   org.springframework.security.crypto.password.PasswordEncoder encoder) {
        String tokenHash = hashToken(token);
        PasswordResetToken resetToken = passwordResetTokenRepository.findByTokenHash(tokenHash)
            .orElseThrow(() -> new RuntimeException("Invalid or expired reset token."));

        if (resetToken.getUsedAt() != null || resetToken.getExpiresAt().isBefore(LocalDateTime.now())) {
            throw new RuntimeException("Reset token has expired.");
        }

        User user = resetToken.getUser();
        user.setPasswordHash(encoder.encode(newPassword));
        userRepository.save(user);

        // Revoke all refresh tokens for this user (security: password reset invalidates sessions)
        refreshTokenRepository.findByUser(user).forEach(t -> {
            t.setRevokedAt(LocalDateTime.now());
            refreshTokenRepository.save(t);
        });

        resetToken.setUsedAt(LocalDateTime.now());
        passwordResetTokenRepository.save(resetToken);
    }

    private void sendEmail(String toEmail, String token) {
        try {
            Properties props = new Properties();
            props.put("mail.smtp.host", smtpHost);
            props.put("mail.smtp.port", String.valueOf(smtpPort));
            props.put("mail.smtp.auth", "true");
            props.put("mail.smtp.starttls.enable", "true");

            Session session = Session.getInstance(props, new jakarta.mail.Authenticator() {
                protected jakarta.mail.PasswordAuthentication getPasswordAuthentication() {
                    return new jakarta.mail.PasswordAuthentication(smtpUser, smtpPassword);
                }
            });

            MimeMessage message = new MimeMessage(session);
            message.setFrom(new InternetAddress(smtpUser));
            message.addRecipient(jakarta.mail.Message.RecipientType.TO, new InternetAddress(toEmail));
            message.setSubject("Password Reset - Archiviz");
            message.setText("Click here to reset your password: " + appUrl + "/reset?token=" + token);

            jakarta.mail.Transport.send(message);
        } catch (MessagingException e) {
            System.err.println("Failed to send reset email: " + e.getMessage());
            System.out.println("[PASSWORD RESET] Token for " + toEmail + ": " + token);
        }
    }

    private String hashToken(String token) {
        try {
            java.security.MessageDigest md = java.security.MessageDigest.getInstance("SHA-256");
            byte[] hash = md.digest(token.getBytes());
            return Base64.getEncoder().encodeToString(hash);
        } catch (Exception e) {
            throw new RuntimeException("Token hashing failed.");
        }
    }
}
