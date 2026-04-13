package com.billbull.backend.customer.messaging;

import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;

@Service
public class MessagingService {
    @Autowired
    private MessageTemplateRepository templateRepository;

    @Autowired
    private MessageLogRepository logRepository;

    public List<MessageTemplate> getAllTemplates() {
        return templateRepository.findAll();
    }

    public MessageTemplate createTemplate(MessageTemplate template) {
        return templateRepository.save(template);
    }

    public MessageTemplate incrementTemplateUsage(Long id) {
        return templateRepository.findById(id).map(t -> {
            t.setUses(t.getUses() + 1);
            return templateRepository.save(t);
        }).orElse(null);
    }

    public MessageTemplate updateTemplate(Long id, MessageTemplate updated) {
        return templateRepository.findById(id).map(t -> {
            t.setTitle(updated.getTitle());
            t.setBody(updated.getBody());
            t.setTags(updated.getTags());
            return templateRepository.save(t);
        }).orElse(null);
    }

    public void deleteTemplate(Long id) {
        templateRepository.deleteById(id);
    }

    public List<MessageLog> getMessageLogs() {
        // Return latest logs first
        return logRepository.findAll(Sort.by(Sort.Direction.DESC, "sentAt"));
    }

    public MessageLog logMessage(MessageLog log) {
        return logRepository.save(log);
    }
}
