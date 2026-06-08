// Customer Connect Service - BillBull Retail Edition
// Handles CRM, inquiries, campaigns, loyalty, feedback & customer experience

export interface CRMKPIData {
  totalInquiries: number;
  inquiryChange: number;
  followUpsDue: number;
  followUpsOverdue: number;
  followUpsCompletedToday: number;
  campaignConversionRate: number;
  activeCampaigns: number;
  experienceScore: number;
  npsScore: number;
}

export interface FunnelStep {
  step: string;
  count: number;
  percentage: number;
}

export interface MessageVolumePoint {
  label: string;
  whatsapp: number;
  sms: number;
  email: number;
  automations: number;
}

export interface CampaignSummary {
  id: string;
  name: string;
  status: "Active" | "Scheduled" | "Completed";
  reach: number;
  openRate: number;
  conversionRate: number;
}

export interface ExperienceMetrics {
  avgRating: number;
  totalReviews: number;
  nps: number;
  promoterPct: number;
  complaintReasons: Array<{ reason: string; count: number }>;
}

export interface AutomationWorkflow {
  id: string;
  name: string;
  trigger: string;
  status: "Active" | "Paused";
  lastRunLabel: string | null;
}

export interface LoyaltySummary {
  pointsIssued: number;
  pointsRedeemed: number;
  redemptionRate: number;
  activeMembersWithPoints: number;
  pointsExpiringSoon: number;
  membersWithExpiringPoints: number;
}

export interface SegmentSummary {
  name: string;
  customerCount: number;
  percentage: number;
}

export interface CustomerGroupSummary {
  id: string;
  name: string;
  description: string | null;
  customerCount: number;
  revenueShare: number;
}

export interface FeedbackSummary {
  surveysSent: number;
  surveysCompleted: number;
  avgScore: number;
  latestComments: Array<{
    id: string;
    comment: string;
    customerName: string;
    rating: number;
  }>;
}

export interface ActivityItem {
  id: string;
  type: "inquiry" | "followup" | "campaign" | "message" | "loyalty" | "feedback";
  title: string;
  description: string;
  timeLabel: string;
}

interface ServiceResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

class CustomerConnectService {
  // Branches
  async getBranches(): Promise<ServiceResponse<Array<{ id: string; name: string }>>> {
    try {
      await new Promise((resolve) => setTimeout(resolve, 300));
      const branches = [
        { id: "b1", name: "Downtown Store" },
        { id: "b2", name: "Mall Branch" },
        { id: "b3", name: "Airport Outlet" },
        { id: "b4", name: "Suburb Center" },
      ];
      return { success: true, data: branches };
    } catch (error) {
      return { success: false, error: "Failed to load branches" };
    }
  }

  // KPIs
  async getKpis(
    dateFilter: string,
    branchFilter: string,
    sourceFilter: string
  ): Promise<ServiceResponse<CRMKPIData>> {
    try {
      await new Promise((resolve) => setTimeout(resolve, 400));
      const kpis: CRMKPIData = {
        totalInquiries: Math.floor(Math.random() * 400) + 200,
        inquiryChange: (Math.random() - 0.3) * 30,
        followUpsDue: Math.floor(Math.random() * 80) + 40,
        followUpsOverdue: Math.floor(Math.random() * 15) + 5,
        followUpsCompletedToday: Math.floor(Math.random() * 30) + 10,
        campaignConversionRate: Math.random() * 15 + 8,
        activeCampaigns: Math.floor(Math.random() * 8) + 4,
        experienceScore: Math.random() * 1.2 + 3.8,
        npsScore: Math.floor(Math.random() * 30) + 50,
      };
      return { success: true, data: kpis };
    } catch (error) {
      return { success: false, error: "Failed to load KPIs" };
    }
  }

  // Funnel
  async getFunnel(
    dateFilter: string,
    branchFilter: string,
    sourceFilter: string
  ): Promise<ServiceResponse<FunnelStep[]>> {
    try {
      await new Promise((resolve) => setTimeout(resolve, 350));
      const funnel: FunnelStep[] = [
        { step: "Inquiries", count: 856, percentage: 100 },
        { step: "Follow-up Scheduled", count: 642, percentage: 75 },
        { step: "Engaged (Responded)", count: 478, percentage: 55.8 },
        { step: "Demo / Visit Completed", count: 289, percentage: 33.8 },
        { step: "Converted to Customer", count: 127, percentage: 14.8 },
      ];
      return { success: true, data: funnel };
    } catch (error) {
      return { success: false, error: "Failed to load funnel" };
    }
  }

  // Message Volume
  async getMessageVolume(
    dateFilter: string,
    branchFilter: string
  ): Promise<ServiceResponse<MessageVolumePoint[]>> {
    try {
      await new Promise((resolve) => setTimeout(resolve, 350));
      const labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
      const data: MessageVolumePoint[] = labels.map((label) => ({
        label,
        whatsapp: Math.floor(Math.random() * 120) + 80,
        sms: Math.floor(Math.random() * 60) + 30,
        email: Math.floor(Math.random() * 50) + 20,
        automations: Math.floor(Math.random() * 40) + 15,
      }));
      return { success: true, data };
    } catch (error) {
      return { success: false, error: "Failed to load message volume" };
    }
  }

  // Campaigns
  async getCampaigns(
    dateFilter: string,
    branchFilter: string
  ): Promise<ServiceResponse<CampaignSummary[]>> {
    try {
      await new Promise((resolve) => setTimeout(resolve, 400));
      const campaigns: CampaignSummary[] = [
        {
          id: "c1",
          name: "Summer Sale 2025 - 40% Off",
          status: "Active",
          reach: 12450,
          openRate: 68.2,
          conversionRate: 14.3,
        },
        {
          id: "c2",
          name: "New Arrivals WhatsApp Broadcast",
          status: "Active",
          reach: 8920,
          openRate: 82.5,
          conversionRate: 9.7,
        },
        {
          id: "c3",
          name: "Weekend Flash Sale SMS",
          status: "Completed",
          reach: 5630,
          openRate: 55.3,
          conversionRate: 18.2,
        },
        {
          id: "c4",
          name: "Holiday Gift Guide Email",
          status: "Scheduled",
          reach: 15300,
          openRate: 0,
          conversionRate: 0,
        },
        {
          id: "c5",
          name: "Loyalty Member Exclusive Offer",
          status: "Active",
          reach: 3450,
          openRate: 91.4,
          conversionRate: 22.8,
        },
        {
          id: "c6",
          name: "Re-engagement Campaign - Inactive Customers",
          status: "Active",
          reach: 7230,
          openRate: 42.1,
          conversionRate: 6.4,
        },
      ];
      return { success: true, data: campaigns };
    } catch (error) {
      return { success: false, error: "Failed to load campaigns" };
    }
  }

  // Experience
  async getExperienceMetrics(
    dateFilter: string,
    branchFilter: string
  ): Promise<ServiceResponse<ExperienceMetrics>> {
    try {
      await new Promise((resolve) => setTimeout(resolve, 380));
      const experience: ExperienceMetrics = {
        avgRating: Math.random() * 0.8 + 4.2,
        totalReviews: Math.floor(Math.random() * 500) + 300,
        nps: Math.floor(Math.random() * 30) + 50,
        promoterPct: Math.random() * 20 + 60,
        complaintReasons: [
          { reason: "Long wait time at checkout", count: 23 },
          { reason: "Product out of stock", count: 18 },
          { reason: "Incorrect pricing", count: 12 },
          { reason: "Staff unavailable", count: 9 },
        ],
      };
      return { success: true, data: experience };
    } catch (error) {
      return { success: false, error: "Failed to load experience metrics" };
    }
  }

  // Automations
  async getAutomations(): Promise<ServiceResponse<AutomationWorkflow[]>> {
    try {
      await new Promise((resolve) => setTimeout(resolve, 350));
      const automations: AutomationWorkflow[] = [
        {
          id: "a1",
          name: "Birthday Greetings & Discount",
          trigger: "Customer birthday",
          status: "Active",
          lastRunLabel: "2 hours ago",
        },
        {
          id: "a2",
          name: "Abandoned Cart Reminder",
          trigger: "Cart idle > 24h",
          status: "Active",
          lastRunLabel: "30 minutes ago",
        },
        {
          id: "a3",
          name: "Post-Purchase Thank You + Survey",
          trigger: "Order completed",
          status: "Active",
          lastRunLabel: "1 hour ago",
        },
        {
          id: "a4",
          name: "Loyalty Points Expiring Alert",
          trigger: "Points expire in 7 days",
          status: "Active",
          lastRunLabel: "Yesterday",
        },
        {
          id: "a5",
          name: "Welcome Series for New Customers",
          trigger: "First purchase",
          status: "Active",
          lastRunLabel: "3 hours ago",
        },
        {
          id: "a6",
          name: "Re-engagement for Inactive Users",
          trigger: "No purchase in 60 days",
          status: "Paused",
          lastRunLabel: null,
        },
      ];
      return { success: true, data: automations };
    } catch (error) {
      return { success: false, error: "Failed to load automations" };
    }
  }

  // Loyalty
  async getLoyaltySummary(
    dateFilter: string,
    branchFilter: string
  ): Promise<ServiceResponse<LoyaltySummary>> {
    try {
      await new Promise((resolve) => setTimeout(resolve, 370));
      const pointsIssued = Math.floor(Math.random() * 50000) + 80000;
      const pointsRedeemed = Math.floor(pointsIssued * (Math.random() * 0.3 + 0.4));
      const loyalty: LoyaltySummary = {
        pointsIssued,
        pointsRedeemed,
        redemptionRate: (pointsRedeemed / pointsIssued) * 100,
        activeMembersWithPoints: Math.floor(Math.random() * 1500) + 2000,
        pointsExpiringSoon: Math.floor(Math.random() * 8000) + 5000,
        membersWithExpiringPoints: Math.floor(Math.random() * 200) + 150,
      };
      return { success: true, data: loyalty };
    } catch (error) {
      return { success: false, error: "Failed to load loyalty summary" };
    }
  }

  // Segments
  async getSegments(
    dateFilter: string,
    branchFilter: string
  ): Promise<ServiceResponse<SegmentSummary[]>> {
    try {
      await new Promise((resolve) => setTimeout(resolve, 360));
      const segments: SegmentSummary[] = [
        { name: "High Value", customerCount: 1240, percentage: 18.5 },
        { name: "Regular Shoppers", customerCount: 2890, percentage: 43.2 },
        { name: "Occasional Buyers", customerCount: 1560, percentage: 23.3 },
        { name: "New Customers", customerCount: 680, percentage: 10.2 },
        { name: "At Risk (Churning)", customerCount: 320, percentage: 4.8 },
      ];
      return { success: true, data: segments };
    } catch (error) {
      return { success: false, error: "Failed to load segments" };
    }
  }

  // Groups
  async getGroups(
    dateFilter: string,
    branchFilter: string
  ): Promise<ServiceResponse<CustomerGroupSummary[]>> {
    try {
      await new Promise((resolve) => setTimeout(resolve, 340));
      const groups: CustomerGroupSummary[] = [
        {
          id: "g1",
          name: "VIP Members",
          description: "Premium tier with exclusive benefits",
          customerCount: 340,
          revenueShare: 38.2,
        },
        {
          id: "g2",
          name: "Corporate Accounts",
          description: "Business clients and bulk buyers",
          customerCount: 125,
          revenueShare: 28.6,
        },
        {
          id: "g3",
          name: "Wholesale Partners",
          description: "Registered wholesale distributors",
          customerCount: 87,
          revenueShare: 22.4,
        },
        {
          id: "g4",
          name: "Staff & Family",
          description: "Employee discount program",
          customerCount: 56,
          revenueShare: 3.2,
        },
        {
          id: "g5",
          name: "Student Discount Group",
          description: "Verified students with ID",
          customerCount: 412,
          revenueShare: 5.8,
        },
        {
          id: "g6",
          name: "Senior Citizens",
          description: "60+ age group special pricing",
          customerCount: 228,
          revenueShare: 1.8,
        },
      ];
      return { success: true, data: groups };
    } catch (error) {
      return { success: false, error: "Failed to load groups" };
    }
  }

  // Feedback
  async getFeedbackSummary(
    dateFilter: string,
    branchFilter: string
  ): Promise<ServiceResponse<FeedbackSummary>> {
    try {
      await new Promise((resolve) => setTimeout(resolve, 380));
      const feedback: FeedbackSummary = {
        surveysSent: Math.floor(Math.random() * 400) + 600,
        surveysCompleted: Math.floor(Math.random() * 200) + 350,
        avgScore: Math.random() * 0.8 + 4.1,
        latestComments: [
          {
            id: "fb1",
            comment: "Great service and product quality! Will definitely come back.",
            customerName: "Sarah Johnson",
            rating: 5,
          },
          {
            id: "fb2",
            comment: "Checkout process was a bit slow but staff was friendly.",
            customerName: "Michael Chen",
            rating: 4,
          },
          {
            id: "fb3",
            comment: "Love the new loyalty program. Rewards are amazing!",
            customerName: "Emma Williams",
            rating: 5,
          },
          {
            id: "fb4",
            comment: "Product I wanted was out of stock. Otherwise good experience.",
            customerName: "David Martinez",
            rating: 3,
          },
        ],
      };
      return { success: true, data: feedback };
    } catch (error) {
      return { success: false, error: "Failed to load feedback" };
    }
  }

  // Activity
  async getRecentActivity(): Promise<ServiceResponse<ActivityItem[]>> {
    try {
      await new Promise((resolve) => setTimeout(resolve, 320));
      const activity: ActivityItem[] = [
        {
          id: "act1",
          type: "inquiry",
          title: "New inquiry from website contact form",
          description: "Customer interested in bulk purchase for corporate event",
          timeLabel: "5 minutes ago",
        },
        {
          id: "act2",
          type: "campaign",
          title: "Summer Sale campaign reached 10K customers",
          description: "68% open rate, 14% conversion rate",
          timeLabel: "18 minutes ago",
        },
        {
          id: "act3",
          type: "followup",
          title: "Follow-up call completed with Sarah Johnson",
          description: "Scheduled product demo for next Monday",
          timeLabel: "42 minutes ago",
        },
        {
          id: "act4",
          type: "loyalty",
          title: "Loyalty points redeemed by VIP member",
          description: "5,000 points redeemed for AED 200 voucher",
          timeLabel: "1 hour ago",
        },
        {
          id: "act5",
          type: "message",
          title: "WhatsApp broadcast sent to 3,450 customers",
          description: "New arrivals announcement with product images",
          timeLabel: "2 hours ago",
        },
        {
          id: "act6",
          type: "feedback",
          title: "New 5-star review received",
          description: "Emma Williams praised customer service quality",
          timeLabel: "2 hours ago",
        },
        {
          id: "act7",
          type: "inquiry",
          title: "Walk-in inquiry converted to sale",
          description: "Customer purchased AED 1,250 worth of electronics",
          timeLabel: "3 hours ago",
        },
        {
          id: "act8",
          type: "campaign",
          title: "Email campaign scheduled for Friday",
          description: "Holiday gift guide targeting 15K subscribers",
          timeLabel: "4 hours ago",
        },
        {
          id: "act9",
          type: "followup",
          title: "Automated follow-up sent to abandoned cart users",
          description: "23 reminder messages sent via WhatsApp",
          timeLabel: "5 hours ago",
        },
        {
          id: "act10",
          type: "loyalty",
          title: "Birthday automation triggered for 12 customers",
          description: "Birthday greetings + 15% discount voucher sent",
          timeLabel: "6 hours ago",
        },
      ];
      return { success: true, data: activity };
    } catch (error) {
      return { success: false, error: "Failed to load activity" };
    }
  }
}

export const customerConnectService = new CustomerConnectService();
