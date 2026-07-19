package com.billbull.backend.financials.generalledger.postingengine;

import com.billbull.backend.security.ModulePermissionService;
import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
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
@PreAuthorize("isAuthenticated()")
public class PostingRuleController {

    private static final String MODULE = "finance.config";

    private final PostingRuleService postingRuleService;
    private final ModulePermissionService modulePermissionService;

    public PostingRuleController(PostingRuleService postingRuleService, ModulePermissionService modulePermissionService) {
        this.postingRuleService = postingRuleService;
        this.modulePermissionService = modulePermissionService;
    }

    @GetMapping
    public List<PostingRule> getAllPostingRules() {
        modulePermissionService.requireCanView(MODULE);
        return postingRuleService.getAllPostingRules();
    }

    @GetMapping("/by-type/{type}")
    public List<PostingRule> getRulesByType(@PathVariable String type) {
        modulePermissionService.requireCanView(MODULE);
        return postingRuleService.getRulesByTransactionType(type);
    }

    @PostMapping
    public PostingRule createPostingRule(@RequestBody PostingRule rule) {
        modulePermissionService.requireCanCreate(MODULE);
        return postingRuleService.createPostingRule(rule);
    }

    @PutMapping("/{id}")
    public PostingRule updatePostingRule(@PathVariable Long id, @RequestBody PostingRule rule) {
        modulePermissionService.requireCanEdit(MODULE);
        return postingRuleService.updatePostingRule(id, rule);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deletePostingRule(@PathVariable Long id) {
        modulePermissionService.requireCanEdit(MODULE);
        postingRuleService.deletePostingRule(id);
        return ResponseEntity.noContent().build();
    }
}
