package com.billbull.backend.sales.customerledger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.ByteArrayOutputStream;
import java.util.List;
import java.util.Optional;

import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockMultipartFile;

@ExtendWith(MockitoExtension.class)
class CustomerImportServiceTest {

    @Mock
    private CustomerRepository repository;

    @Test
    void importsAcFormatPhoneOnlyAndNameOnlyRows() throws Exception {
        when(repository.findByCode(anyString())).thenReturn(Optional.empty());
        CustomerImportService service = new CustomerImportService(repository);

        MockMultipartFile file = new MockMultipartFile(
                "file",
                "customers.xlsx",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                acWorkbookBytes());

        String result = service.importCustomers(file);

        ArgumentCaptor<Customer> customerCaptor = ArgumentCaptor.forClass(Customer.class);
        verify(repository, times(2)).save(customerCaptor.capture());
        List<Customer> saved = customerCaptor.getAllValues();

        assertEquals("501922332", saved.get(0).getName());
        assertEquals("501922332", saved.get(0).getPhone());
        assertEquals("501922332", saved.get(0).getMobile());

        assertEquals("WASIM", saved.get(1).getName());
        assertNull(saved.get(1).getPhone());
        assertNull(saved.get(1).getMobile());

        assertTrue(result.contains("Created: 2"));
        assertTrue(result.contains("Skipped: 1"));
    }

    private byte[] acWorkbookBytes() throws Exception {
        try (XSSFWorkbook workbook = new XSSFWorkbook();
             ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            Sheet sheet = workbook.createSheet("Customers");
            Row header = sheet.createRow(0);
            String[] headers = {
                    "ACID", "ACCODE", "ACACNAME", "ACSHID", "ACNAME",
                    "ACADR1", "ACADR2", "ACPHONE", "ACEMAIL", "ACTRN"
            };
            for (int i = 0; i < headers.length; i++) {
                header.createCell(i).setCellValue(headers[i]);
            }

            Row phoneOnly = sheet.createRow(1);
            phoneOnly.createCell(0).setCellValue("1");
            phoneOnly.createCell(1).setCellValue("1");
            phoneOnly.createCell(7).setCellValue("501922332");

            Row nameOnly = sheet.createRow(2);
            nameOnly.createCell(0).setCellValue("2");
            nameOnly.createCell(1).setCellValue("2");
            nameOnly.createCell(4).setCellValue("WASIM");

            Row emptyCustomer = sheet.createRow(3);
            emptyCustomer.createCell(0).setCellValue("3");
            emptyCustomer.createCell(1).setCellValue("3");

            workbook.write(output);
            return output.toByteArray();
        }
    }
}
