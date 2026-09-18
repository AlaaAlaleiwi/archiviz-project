package com.archiviz.backend;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("dev")
@TestPropertySource(properties = {
    "jwt.secret=test-jwt-secret-that-is-at-least-256-bits-long",
    "app.admin.password="
})
class AdminControllerTest {
    @Autowired private MockMvc mockMvc;

    @Test
    @WithMockUser(roles = "ADMIN")
    void adminCanReadStats() throws Exception {
        mockMvc.perform(get("/api/admin/stats")).andExpect(status().isOk());
    }

    @Test
    @WithMockUser(roles = "USER")
    void regularUserCannotReadStats() throws Exception {
        mockMvc.perform(get("/api/admin/stats")).andExpect(status().isForbidden());
    }
}
