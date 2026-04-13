package com.billbull.backend.financials.generalledger.postingengine;

import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/financials/posting-rules")
@CrossOrigin(origins = "*")
@PreAuthorize("hasAnyRole('ADMIN','ACCOUNTANT')")
public class PostingRuleController {

    private final PostingRuleService postingRuleService;

    public PostingRuleController(PostingRuleService postingRuleService) {
        this.postingRuleService = postingRuleService;
    }

    @GetMapping
    public List<PostingRule> getAllPostingRules() {
        return postingRuleService.getAllPostingRules();
    }

    @GetMapping("/by-type/{type}")
    public List<PostingRule> getRulesByType(@PathVariable String type) {
        return postingRuleService.getRulesByTransactionType(type);
    }

    @PostMapping
    public PostingRule createPostingRule(@RequestBody PostingRule rule) {
        return postingRuleService.createPostingRule(rule);
    }

    @PutMapping("/{id}")
    public PostingRule updatePostingRule(@PathVariable Long id, @RequestBody PostingRule rule) {
        return postingRuleService.updatePostingRule(id, rule);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deletePostingRule(@PathVariable Long id) {
        postingRuleService.deletePostingRule(id);
        return ResponseEntity.noContent().build();
    }
}
