package com.billbull.backend.customer.inquiries;

public class ActivityLogEntry {
    private String type;
    private String text;
    private String user;
    private String time;

    // Constructors
    public ActivityLogEntry() {}
    
    public ActivityLogEntry(String type, String text, String user, String time) {
        this.type = type;
        this.text = text;
        this.user = user;
        this.time = time;
    }

    // Getters and Setters
    public String getType() { return type; }
    public void setType(String type) { this.type = type; }

    public String getText() { return text; }
    public void setText(String text) { this.text = text; }

    public String getUser() { return user; }
    public void setUser(String user) { this.user = user; }

    public String getTime() { return time; }
    public void setTime(String time) { this.time = time; }
}
