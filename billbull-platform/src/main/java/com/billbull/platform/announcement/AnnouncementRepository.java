package com.billbull.platform.announcement;

import java.util.Collection;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

public interface AnnouncementRepository extends JpaRepository<Announcement, Long> {

    List<Announcement> findByStatusNotOrderByCreatedAtDesc(String status);

    List<Announcement> findByStatusIn(Collection<String> statuses);
}
