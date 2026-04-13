package com.billbull.backend;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;

public class DbDiag {
    public static void main(String[] args) throws Exception {
        String url = "jdbc:postgresql://localhost:5432/CloneBillbull";
        String user = "postgres";
        String pass = "admin";

        try (Connection conn = DriverManager.getConnection(url, user, pass)) {
            System.out.println("--- USERS ---");
            try (Statement stmt = conn.createStatement()) {
                ResultSet rs = stmt.executeQuery("SELECT id, username FROM users");
                while (rs.next()) {
                    System.out.println(rs.getLong("id") + ": " + rs.getString("username"));
                }
            }
            System.out.println("--- ROLES ---");
            try (Statement stmt = conn.createStatement()) {
                ResultSet rs = stmt.executeQuery("SELECT id, name FROM roles");
                while (rs.next()) {
                    System.out.println(rs.getLong("id") + ": " + rs.getString("name"));
                }
            }
            System.out.println("--- USER ROLES ---");
            try (Statement stmt = conn.createStatement()) {
                ResultSet rs = stmt.executeQuery("SELECT user_id, role_id FROM user_roles");
                while (rs.next()) {
                    System.out.println("User " + rs.getLong("user_id") + " -> Role " + rs.getLong("role_id"));
                }
            }
        }
    }
}
