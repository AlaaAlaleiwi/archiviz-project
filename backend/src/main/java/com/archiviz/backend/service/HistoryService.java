package com.archiviz.backend.service;

import com.archiviz.backend.dto.HistoryEntryDto;
import com.archiviz.backend.dto.HistorySaveRequest;
import com.archiviz.backend.dto.HistorySnapshotResponse;
import com.archiviz.backend.dto.HistoryExportResponse;
import com.archiviz.backend.entity.ProjectHistory;
import com.archiviz.backend.entity.User;
import com.archiviz.backend.repository.ProjectHistoryRepository;
import com.archiviz.backend.repository.UserRepository;
import com.archiviz.backend.repository.SubscriptionRepository;
import com.archiviz.backend.entity.Subscription;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.stream.Collectors;
import java.nio.charset.StandardCharsets;

@Service
@RequiredArgsConstructor
public class HistoryService {

    private final ProjectHistoryRepository historyRepository;
    private final UserRepository userRepository;
    private final SubscriptionRepository subscriptionRepository;

    @Transactional
    public HistoryEntryDto saveHistory(String email, String projectName, String snapshot) {
        User user = userRepository.findByEmail(email)
            .orElseThrow(() -> new RuntimeException("User not found"));
        if (snapshot == null || snapshot.isBlank()) throw new IllegalArgumentException("Project snapshot is required.");
        Subscription subscription = subscriptionRepository.findByUser(user)
            .orElseThrow(() -> new RuntimeException("No subscription found"));
        if (subscription.getPlan() == Subscription.Plan.FREE && historyRepository.countByUser(user) >= 5) {
            throw new IllegalArgumentException("The FREE plan allows up to 5 history entries.");
        }
        byte[] bytes = snapshot.getBytes(StandardCharsets.UTF_8);
        ProjectHistory entry = ProjectHistory.builder()
            .user(user)
            .projectName(projectName != null ? projectName : "Untitled")
            .snapshot(snapshot)
            .sizeBytes(bytes.length)
            .createdAt(LocalDateTime.now())
            .build();
        ProjectHistory saved = historyRepository.save(entry);
        return new HistoryEntryDto(saved.getId(), saved.getProjectName(), saved.getCreatedAt().toInstant(ZoneOffset.UTC), saved.getSizeBytes());
    }

    public List<HistoryEntryDto> listHistory(String email) {
        User user = userRepository.findByEmail(email)
            .orElseThrow(() -> new RuntimeException("User not found"));
        return historyRepository.findByUser(user).stream()
            .map(h -> new HistoryEntryDto(h.getId(), h.getProjectName(), h.getCreatedAt().toInstant(ZoneOffset.UTC), h.getSizeBytes()))
            .collect(Collectors.toList());
    }

    public HistorySnapshotResponse getHistory(String email, String id) {
        User user = userRepository.findByEmail(email)
            .orElseThrow(() -> new RuntimeException("User not found"));
        ProjectHistory entry = historyRepository.findByIdAndUser(id, user)
            .orElseThrow(() -> new RuntimeException("History entry not found"));
        return new HistorySnapshotResponse(
            entry.getId(), entry.getProjectName(), entry.getSnapshot(), entry.getSizeBytes(), entry.getCreatedAt()
        );
    }

    @Transactional
    public void deleteHistory(String email, String id) {
        User user = userRepository.findByEmail(email)
            .orElseThrow(() -> new RuntimeException("User not found"));
        ProjectHistory entry = historyRepository.findByIdAndUser(id, user)
            .orElseThrow(() -> new RuntimeException("History entry not found"));
        historyRepository.delete(entry);
    }

    public HistoryExportResponse exportHistory(String email) {
        User user = userRepository.findByEmail(email)
            .orElseThrow(() -> new RuntimeException("User not found"));
        List<HistorySnapshotResponse> entries = historyRepository.findByUser(user).stream()
            .map(h -> new HistorySnapshotResponse(h.getId(), h.getProjectName(), h.getSnapshot(), h.getSizeBytes(), h.getCreatedAt()))
            .collect(Collectors.toList());
        return new HistoryExportResponse(entries);
    }
}
