package com.archiviz.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record PasswordResetConfirm(
    @NotBlank String token,
    @NotBlank @Size(min = 6) String newPassword
) {}
