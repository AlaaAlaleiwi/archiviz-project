package com.archiviz.backend.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.Instant;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

@Component
public class AuthRateLimitFilter extends OncePerRequestFilter {
    private static final Set<String> LIMITED_PATHS = Set.of(
        "/api/auth/login", "/api/auth/register", "/api/auth/reset-password/request"
    );
    private final ConcurrentHashMap<String, Window> attempts = new ConcurrentHashMap<>();

    @Value("${auth.rate-limit.requests-per-minute:5}")
    private int requestsPerMinute;

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        if (!"POST".equals(request.getMethod()) || !LIMITED_PATHS.contains(request.getRequestURI())) {
            chain.doFilter(request, response);
            return;
        }
        long minute = Instant.now().getEpochSecond() / 60;
        String key = request.getRemoteAddr() + ':' + request.getRequestURI();
        Window window = attempts.compute(key, (ignored, current) -> current == null || current.minute != minute
            ? new Window(minute) : current);
        if (window.count.incrementAndGet() > requestsPerMinute) {
            response.setStatus(429);
            response.setContentType("application/json");
            response.getWriter().write("{\"status\":429,\"message\":\"Too many authentication attempts. Try again in a minute.\"}");
            return;
        }
        if (attempts.size() > 10_000) attempts.entrySet().removeIf(entry -> entry.getValue().minute < minute - 1);
        chain.doFilter(request, response);
    }

    private static final class Window {
        private final long minute;
        private final AtomicInteger count = new AtomicInteger();
        private Window(long minute) { this.minute = minute; }
    }
}
