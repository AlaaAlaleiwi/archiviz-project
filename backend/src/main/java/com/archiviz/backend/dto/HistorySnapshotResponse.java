package com.archiviz.backend.dto;

import java.time.LocalDateTime;

public record HistorySnapshotResponse(
    String id,
    String projectName,
    String snapshot,
    long sizeBytes,
    LocalDateTime createdAt
) {}
