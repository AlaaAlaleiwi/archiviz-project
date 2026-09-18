package com.archiviz.backend.repository;

import com.archiviz.backend.entity.ProjectHistory;
import com.archiviz.backend.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface ProjectHistoryRepository extends JpaRepository<ProjectHistory, String> {
    List<ProjectHistory> findByUser(User user);
    Optional<ProjectHistory> findByIdAndUser(String id, User user);
    long countByUser(User user);
}
