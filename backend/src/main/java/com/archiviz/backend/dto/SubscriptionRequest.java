package com.archiviz.backend.dto;

import jakarta.validation.constraints.NotBlank;

public record SubscriptionRequest(
    @NotBlank String plan
) {}
