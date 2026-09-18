package com.archiviz.backend.controller;

import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;
import javax.sql.DataSource;
import java.lang.management.ManagementFactory;

@RestController
@RequestMapping("/api/health")
@RequiredArgsConstructor
public class HealthController {
    private final DataSource dataSource;

    @GetMapping
    public ResponseEntity<Map<String, Object>> health() {
        boolean databaseUp;
        try (var connection = dataSource.getConnection()) {
            databaseUp = connection.isValid(2);
        } catch (Exception exception) {
            databaseUp = false;
        }
        return ResponseEntity.ok(Map.of(
            "status", databaseUp ? "UP" : "DEGRADED",
            "database", databaseUp ? "UP" : "DOWN",
            "uptimeMs", ManagementFactory.getRuntimeMXBean().getUptime(),
            "memoryUsedBytes", Runtime.getRuntime().totalMemory() - Runtime.getRuntime().freeMemory(),
            "timestamp", System.currentTimeMillis()
        ));
    }
}
