package com.archiviz.backend.dto;

import java.time.LocalDateTime;

public record HistorySaveRequest(String projectName, String snapshot) {}
