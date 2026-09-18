package com.archiviz.backend.dto;

import java.time.Instant;

public record HistoryEntryDto(
    String id,
    String projectName,
    Instant createdAt,
    long sizeBytes
) {}
