package com.billbull.backend.financials.generalledger;

import com.billbull.backend.financials.chartofaccounts.CostCenter;
import com.billbull.backend.settings.branch.Branch;
import com.billbull.backend.settings.branch.BranchRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.result.MockMvcResultHandlers.print;

@SpringBootTest
@AutoConfigureMockMvc
public class CostCenterBranchTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private BranchRepository branchRepository;

    @Test
    @WithMockUser(username = "admin", roles = {"ADMIN"})
    public void testCreateCostCenterWithBranch() throws Exception {
        Branch b = new Branch();
        b.setName("Test Branch");
        b.setCode("TB-01");
        branchRepository.save(b);

        CostCenter cc = new CostCenter();
        cc.setName("Branch CC");
        cc.setManager("Manager");
        cc.setBranch("Test Branch");
        cc.setBudget(BigDecimal.ZERO);
        cc.setStatus("active");
        cc.setCode("");

        mockMvc.perform(post("/api/ledger/cost-centers")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(cc)))
                .andDo(print())
                .andExpect(status().isOk());
    }
}
