package com.billbull.backend.inventory.product;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;

public class DBChecker {
    public static void main(String[] args) {
        String url = "jdbc:postgresql://localhost:5868/NESTLLC";
        String user = "postgres";
        String password = "admin";

        try (Connection conn = DriverManager.getConnection(url, user, password);
             Statement stmt = conn.createStatement()) {

            System.out.println("--- DB Statistics ---");
            
            ResultSet rsProducts = stmt.executeQuery("SELECT COUNT(*) FROM products");
            if (rsProducts.next()) System.out.println("Total Products: " + rsProducts.getInt(1));

            ResultSet rsActiveProducts = stmt.executeQuery("SELECT COUNT(*) FROM products WHERE is_active = true");
            if (rsActiveProducts.next()) System.out.println("Active Products: " + rsActiveProducts.getInt(1));

            ResultSet rsBrands = stmt.executeQuery("SELECT COUNT(*) FROM brands");
            if (rsBrands.next()) System.out.println("Total Brands: " + rsBrands.getInt(1));

            ResultSet rsProductBrands = stmt.executeQuery("SELECT b.name, COUNT(p.id) FROM brands b LEFT JOIN products p ON b.id = p.brand_id GROUP BY b.name");
            System.out.println("\n--- Products per Brand ---");
            while (rsProductBrands.next()) {
                System.out.println(rsProductBrands.getString(1) + ": " + rsProductBrands.getInt(2));
            }

            ResultSet rsNullDepts = stmt.executeQuery("SELECT COUNT(*) FROM products WHERE department_id IS NULL");
            if (rsNullDepts.next()) System.out.println("\nProducts with NULL Department: " + rsNullDepts.getInt(1));

        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}
