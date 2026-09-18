package com.archiviz.backend;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

@SpringBootTest
@ActiveProfiles("dev")
@org.springframework.test.context.TestPropertySource(properties = {
    "jwt.secret=test-jwt-secret-that-is-at-least-256-bits-long",
    "app.admin.password="
})
class ArchivizBackendApplicationTests {

    @Test
    void contextLoads() {
    }
}
