package com.archiviz.backend.dto;

import java.util.List;

public record HistoryExportResponse(List<HistorySnapshotResponse> entries) {}
