package com.archiviz.backend.controller;

import com.archiviz.backend.dto.HistoryEntryDto;
import com.archiviz.backend.dto.HistoryExportResponse;
import com.archiviz.backend.dto.HistorySaveRequest;
import com.archiviz.backend.dto.HistorySnapshotResponse;
import com.archiviz.backend.service.HistoryService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/history")
@RequiredArgsConstructor
public class HistoryController {

    private final HistoryService historyService;

    @PostMapping
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<HistoryEntryDto> saveHistory(
            @AuthenticationPrincipal UserDetails userDetails,
            @RequestBody HistorySaveRequest request) {
        return ResponseEntity.status(201).body(historyService.saveHistory(userDetails.getUsername(), request.projectName(), request.snapshot()));
    }

    @GetMapping
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<List<HistoryEntryDto>> listHistory(
            @AuthenticationPrincipal UserDetails userDetails) {
        return ResponseEntity.ok(historyService.listHistory(userDetails.getUsername()));
    }

    @GetMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<HistorySnapshotResponse> getHistory(
            @AuthenticationPrincipal UserDetails userDetails,
            @PathVariable String id) {
        return ResponseEntity.ok(historyService.getHistory(userDetails.getUsername(), id));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Void> deleteHistory(
            @AuthenticationPrincipal UserDetails userDetails,
            @PathVariable String id) {
        historyService.deleteHistory(userDetails.getUsername(), id);
        return ResponseEntity.ok().build();
    }

    @GetMapping("/export")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<HistoryExportResponse> exportHistory(
            @AuthenticationPrincipal UserDetails userDetails) {
        return ResponseEntity.ok(historyService.exportHistory(userDetails.getUsername()));
    }
}
