import React, { useState, useEffect, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Skeleton } from "../../components/ui/skeleton";
import { cn } from "../../components/ui/utils";
import { toast } from "sonner";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  BarChart as ReBarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from "recharts";

import {
  Users,
  MessageCircle,
  Megaphone,
  SmilePlus,
  Target,
  RefreshCw,
  Download,
  Bell,
  ArrowRight,
  Activity as ActivityIcon,
  Mail,
  MessageSquare,
  Star,
} from "lucide-react";

import {
  customerConnectService,
  type CRMKPIData,
  type FunnelStep,
  type MessageVolumePoint,
  type CampaignSummary,
  type ExperienceMetrics,
  type AutomationWorkflow,
  type LoyaltySummary,
  type SegmentSummary,
  type CustomerGroupSummary,
  type FeedbackSummary,
  type ActivityItem,
} from "../../utils/supabase/customer-connect-service";

type DateFilter = "today" | "7d" | "30d" | "90d";
type BranchFilter = "all" | string;
type SourceFilter = "all" | "walkin" | "whatsapp" | "website" | "social" | "phone";

interface CustomerConnectDashboardProps {
  onNavigate?: (section: string, params?: Record<string, any>) => void;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="rounded-md border bg-white px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-semibold">{label}</p>
      {payload.map((entry: any, idx: number) => (
        <p key={idx} className="flex items-center justify-between gap-4" style={{ color: entry.color }}>
          <span>{entry.name}</span>
          <span>{typeof entry.value === "number" ? entry.value.toLocaleString() : entry.value}</span>
        </p>
      ))}
    </div>
  );
};

export function CustomerConnectDashboard({ onNavigate }: CustomerConnectDashboardProps) {
  const [dateFilter, setDateFilter] = useState<DateFilter>("7d");
  const [branchFilter, setBranchFilter] = useState<BranchFilter>("all");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [kpis, setKpis] = useState<CRMKPIData | null>(null);
  const [funnel, setFunnel] = useState<FunnelStep[]>([]);
  const [messageVolume, setMessageVolume] = useState<MessageVolumePoint[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [experience, setExperience] = useState<ExperienceMetrics | null>(null);
  const [automations, setAutomations] = useState<AutomationWorkflow[]>([]);
  const [loyalty, setLoyalty] = useState<LoyaltySummary | null>(null);
  const [segments, setSegments] = useState<SegmentSummary[]>([]);
  const [groups, setGroups] = useState<CustomerGroupSummary[]>([]);
  const [feedback, setFeedback] = useState<FeedbackSummary | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [
        branchRes,
        kpiRes,
        funnelRes,
        messageRes,
        campaignRes,
        experienceRes,
        automationRes,
        loyaltyRes,
        segmentRes,
        groupRes,
        feedbackRes,
        activityRes,
      ] = await Promise.all([
        customerConnectService.getBranches(),
        customerConnectService.getKpis(dateFilter, branchFilter, sourceFilter),
        customerConnectService.getFunnel(dateFilter, branchFilter, sourceFilter),
        customerConnectService.getMessageVolume(dateFilter, branchFilter),
        customerConnectService.getCampaigns(dateFilter, branchFilter),
        customerConnectService.getExperienceMetrics(dateFilter, branchFilter),
        customerConnectService.getAutomations(),
        customerConnectService.getLoyaltySummary(dateFilter, branchFilter),
        customerConnectService.getSegments(dateFilter, branchFilter),
        customerConnectService.getGroups(dateFilter, branchFilter),
        customerConnectService.getFeedbackSummary(dateFilter, branchFilter),
        customerConnectService.getRecentActivity(),
      ]);

      if (branchRes.success) setBranches(branchRes.data || []);
      if (kpiRes.success) setKpis(kpiRes.data || null);
      if (funnelRes.success) setFunnel(funnelRes.data || []);
      if (messageRes.success) setMessageVolume(messageRes.data || []);
      if (campaignRes.success) setCampaigns(campaignRes.data || []);
      if (experienceRes.success) setExperience(experienceRes.data || null);
      if (automationRes.success) setAutomations(automationRes.data || []);
      if (loyaltyRes.success) setLoyalty(loyaltyRes.data || null);
      if (segmentRes.success) setSegments(segmentRes.data || []);
      if (groupRes.success) setGroups(groupRes.data || []);
      if (feedbackRes.success) setFeedback(feedbackRes.data || null);
      if (activityRes.success) setActivity(activityRes.data || []);
    } catch (err) {
      console.error("Customer Connect load error", err);
      toast.error("Failed to load Customer Connect dashboard.");
    } finally {
      setIsLoading(false);
    }
  }, [dateFilter, branchFilter, sourceFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const refresh = async () => {
    setIsRefreshing(true);
    try {
      await loadData();
      toast.success("Customer Connect data refreshed.");
    } finally {
      setIsRefreshing(false);
    }
  };

  const formatPercent = (v?: number | null) =>
    v == null ? "0%" : `${v.toFixed(1)}%`;

  return (
    <div className="min-h-screen bg-[#F7F7FA] p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Users className="h-6 w-6 text-[#F5C742]" />
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
              Customer Connect
            </h1>
          </div>
          <p className="text-sm md:text-base text-muted-foreground">
            Retail CRM hub for inquiries, engagement, loyalty & customer experience.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 justify-end">
          {/* Branch */}
          <Select
            value={branchFilter}
            onValueChange={(val) => setBranchFilter(val as BranchFilter)}
          >
            <SelectTrigger className="w-[160px] bg-white border-slate-200">
              <SelectValue placeholder="Branch" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Branches</SelectItem>
              {branches.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Date */}
          <Select
            value={dateFilter}
            onValueChange={(val) => setDateFilter(val as DateFilter)}
          >
            <SelectTrigger className="w-[150px] bg-white border-slate-200">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="7d">Last 7 Days</SelectItem>
              <SelectItem value="30d">Last 30 Days</SelectItem>
              <SelectItem value="90d">Last 90 Days</SelectItem>
            </SelectContent>
          </Select>

          {/* Source */}
          <Select
            value={sourceFilter}
            onValueChange={(val) => setSourceFilter(val as SourceFilter)}
          >
            <SelectTrigger className="w-[170px] bg-white border-slate-200">
              <SelectValue placeholder="All Sources" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sources</SelectItem>
              <SelectItem value="walkin">Walk-in</SelectItem>
              <SelectItem value="whatsapp">WhatsApp</SelectItem>
              <SelectItem value="website">Website</SelectItem>
              <SelectItem value="phone">Phone</SelectItem>
              <SelectItem value="social">Social</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="sm"
            onClick={refresh}
            disabled={isRefreshing}
            className="border-slate-300"
          >
            <RefreshCw
              className={cn(
                "mr-2 h-4 w-4",
                isRefreshing && "animate-spin text-[#F5C742]"
              )}
            />
            {isRefreshing ? "Refreshing..." : "Refresh"}
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="border-slate-300"
            onClick={() => toast.info("Export coming soon")}
          >
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>

          <Button
            variant="outline"
            size="icon"
            className="border-slate-300"
          >
            <Bell className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {/* Inquiries */}
        <Card className="bg-white border-slate-200">
          <CardContent className="p-4">
            {isLoading || !kpis ? (
              <div className="space-y-3">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-7 w-20" />
                <Skeleton className="h-3 w-24" />
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-[11px] text-slate-500">
                    Total Inquiries
                  </p>
                  <p className="mt-1 text-2xl font-semibold">
                    {kpis.totalInquiries.toLocaleString()}
                  </p>
                  <div className="mt-1 flex items-center gap-2 text-[11px]">
                    <span
                      className={cn(
                        "font-medium",
                        kpis.inquiryChange >= 0
                          ? "text-emerald-600"
                          : "text-red-600"
                      )}
                    >
                      {kpis.inquiryChange >= 0 ? "+" : ""}
                      {formatPercent(kpis.inquiryChange)}
                    </span>
                    <span className="text-slate-500">vs previous period</span>
                  </div>
                </div>
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#FFF4BF]">
                  <MessageCircle className="h-5 w-5 text-[#8A6C00]" />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Follow-ups */}
        <Card className="bg-white border-slate-200">
          <CardContent className="p-4">
            {isLoading || !kpis ? (
              <div className="space-y-3">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-7 w-16" />
                <Skeleton className="h-3 w-28" />
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-[11px] text-slate-500">
                    Follow-ups Due Today
                  </p>
                  <p className="mt-1 text-2xl font-semibold">
                    {kpis.followUpsDue.toLocaleString()}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {kpis.followUpsOverdue} overdue &middot;{" "}
                    {kpis.followUpsCompletedToday} completed
                  </p>
                </div>
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-slate-100">
                  <Target className="h-5 w-5 text-slate-700" />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Campaign Conversion */}
        <Card className="bg-white border-slate-200">
          <CardContent className="p-4">
            {isLoading || !kpis ? (
              <div className="space-y-3">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-7 w-16" />
                <Skeleton className="h-3 w-24" />
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-[11px] text-slate-500">
                    Campaign Conversion
                  </p>
                  <p className="mt-1 text-2xl font-semibold">
                    {formatPercent(kpis.campaignConversionRate)}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {kpis.activeCampaigns} active campaigns
                  </p>
                </div>
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50">
                  <Megaphone className="h-5 w-5 text-emerald-600" />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Experience Score */}
        <Card className="bg-white border-slate-200">
          <CardContent className="p-4">
            {isLoading || !kpis ? (
              <div className="space-y-3">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-7 w-16" />
                <Skeleton className="h-3 w-28" />
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-[11px] text-slate-500">
                    Customer Experience Score
                  </p>
                  <div className="mt-1 flex items-baseline gap-1">
                    <p className="text-2xl font-semibold">
                      {kpis.experienceScore.toFixed(1)}
                    </p>
                    <span className="text-xs text-slate-500">/ 5.0</span>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">
                    NPS: {kpis.npsScore}
                  </p>
                </div>
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-sky-50">
                  <SmilePlus className="h-5 w-5 text-sky-600" />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Funnel + Messaging */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        {/* Conversion Funnel */}
        <Card className="bg-white border-slate-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">
              Inquiry â†’ Conversion Funnel
            </CardTitle>
            <CardDescription className="text-xs">
              Track how inquiries move through follow-ups, engagement and purchases.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[260px] w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <ReBarChart data={funnel} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis
                    type="category"
                    dataKey="step"
                    width={130}
                    tick={{ fontSize: 11 }}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar
                    dataKey="count"
                    name="Customers"
                    fill="#F5C742"
                    radius={[4, 4, 4, 4]}
                  />
                </ReBarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Messaging Volume */}
        <Card className="bg-white border-slate-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">
              Messaging & Engagement
            </CardTitle>
            <CardDescription className="text-xs">
              Volume of WhatsApp, SMS, email and automated messages.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[260px] w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={messageVolume}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Area
                    type="monotone"
                    dataKey="whatsapp"
                    name="WhatsApp"
                    stroke="#22c55e"
                    fill="#22c55e33"
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="sms"
                    name="SMS"
                    stroke="#6366f1"
                    fill="#6366f133"
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="email"
                    name="Email"
                    stroke="#0ea5e9"
                    fill="#0ea5e933"
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="automations"
                    name="Automations"
                    stroke="#F5C742"
                    fill="#F5C74233"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}

            {/* Quick actions */}
            <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
              <Button
                variant="outline"
                className="h-9 border-slate-200 justify-start"
                onClick={() => onNavigate?.("customer-messaging", { tab: "whatsapp" })}
              >
                <MessageSquare className="mr-2 h-4 w-4" />
                Send WhatsApp Broadcast
              </Button>
              <Button
                variant="outline"
                className="h-9 border-slate-200 justify-start"
                onClick={() => onNavigate?.("customer-promotions-campaigns")}
              >
                <Megaphone className="mr-2 h-4 w-4" />
                Create Promotion Campaign
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Campaigns + Experience + Automations */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        {/* Campaign overview */}
        <Card className="bg-white border-slate-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">
              Promotions & Campaigns
            </CardTitle>
            <CardDescription className="text-xs">
              Active campaigns, reach and conversion for each channel.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Skeleton className="h-3 w-36" />
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                ))}
              </div>
            ) : campaigns.length === 0 ? (
              <p className="text-xs text-center text-slate-500">
                No campaigns found for this period.
              </p>
            ) : (
              <div className="space-y-2 text-xs">
                {campaigns.slice(0, 6).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => onNavigate?.("customer-promotions-campaigns", { campaignId: c.id })}
                    className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 hover:bg-slate-50"
                  >
                    <div className="flex flex-col min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate font-medium text-slate-800">
                          {c.name}
                        </p>
                        <Badge
                          variant="outline"
                          className={cn(
                            "h-5 border-slate-200 text-[10px]",
                            c.status === "Active" && "border-emerald-200 text-emerald-700 bg-emerald-50",
                            c.status === "Scheduled" && "border-sky-200 text-sky-700 bg-sky-50",
                            c.status === "Completed" && "border-slate-200 text-slate-700 bg-slate-50"
                          )}
                        >
                          {c.status}
                        </Badge>
                      </div>
                      <div className="mt-0.5 flex items-center justify-between gap-2 text-[10px] text-slate-500">
                        <span>
                          Reach: {c.reach.toLocaleString()} &middot; Open rate:{" "}
                          {formatPercent(c.openRate)}
                        </span>
                        <span>
                          Conv:{" "}
                          <span className="font-medium text-emerald-600">
                            {formatPercent(c.conversionRate)}
                          </span>
                        </span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Experience & Automations */}
        <div className="space-y-4">
          {/* Experience */}
          <Card className="bg-white border-slate-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">
                Customer Experience Tracker
              </CardTitle>
              <CardDescription className="text-xs">
                NPS, rating sources and complaint drivers.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading || !experience ? (
                <Skeleton className="h-[160px] w-full" />
              ) : (
                <div className="grid grid-cols-2 gap-3 text-[11px]">
                  <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                    <p className="text-slate-500">Average Rating</p>
                    <div className="mt-1 flex items-center gap-1">
                      <span className="text-xl font-semibold">
                        {experience.avgRating.toFixed(1)}
                      </span>
                      <Star className="h-4 w-4 text-amber-400" />
                    </div>
                    <p className="mt-0.5 text-[10px] text-slate-500">
                      {experience.totalReviews.toLocaleString()} reviews
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                    <p className="text-slate-500">NPS Score</p>
                    <p className="mt-1 text-xl font-semibold">
                      {experience.nps}
                    </p>
                    <p className="mt-0.5 text-[10px] text-slate-500">
                      Promoters: {formatPercent(experience.promoterPct)}
                    </p>
                  </div>
                  <div className="col-span-2 mt-1">
                    <p className="text-[11px] font-medium text-slate-600 mb-1">
                      Top complaint reasons
                    </p>
                    <div className="space-y-1.5">
                      {experience.complaintReasons.map((r) => (
                        <div
                          key={r.reason}
                          className="flex items-center justify-between gap-2"
                        >
                          <span className="text-[11px] text-slate-600">
                            {r.reason}
                          </span>
                          <span className="text-[10px] text-slate-500">
                            {r.count} cases
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Automations */}
          <Card className="bg-white border-slate-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">
                Automations (CRM Workflows)
              </CardTitle>
              <CardDescription className="text-xs">
                Birthday, abandoned cart, post-purchase and more.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 4 }).map((_, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <Skeleton className="h-3 w-40" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                  ))}
                </div>
              ) : automations.length === 0 ? (
                <p className="text-xs text-center text-slate-500">
                  No automations configured yet.
                </p>
              ) : (
                <div className="space-y-1.5 text-[11px]">
                  {automations.slice(0, 5).map((a) => (
                    <div
                      key={a.id}
                      className="flex items-center justify-between gap-2 rounded-md bg-slate-50 px-2 py-1.5"
                    >
                      <div className="flex flex-col min-w-0">
                        <span className="truncate font-medium text-slate-800">
                          {a.name}
                        </span>
                        <span className="text-[10px] text-slate-500">
                          Trigger: {a.trigger}
                        </span>
                      </div>
                      <div className="flex flex-col items-end text-[10px] text-slate-500">
                        <span>
                          Last run:{" "}
                          {a.lastRunLabel || "Not executed"}
                        </span>
                        <span
                          className={cn(
                            "mt-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-medium",
                            a.status === "Active"
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-slate-100 text-slate-600"
                          )}
                        >
                          {a.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Loyalty + Segmentation + Groups + Feedback */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,2.2fr)_minmax(0,2fr)]">
        {/* Loyalty + Segmentation */}
        <Card className="bg-white border-slate-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">
              Loyalty & Segmentation Overview
            </CardTitle>
            <CardDescription className="text-xs">
              Loyalty points, reward utilization and segment distribution.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading || !loyalty ? (
              <Skeleton className="h-[80px] w-full" />
            ) : (
              <div className="grid grid-cols-3 gap-3 text-[11px]">
                <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                  <p className="text-slate-500">Total Points Issued</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {loyalty.pointsIssued.toLocaleString()}
                  </p>
                  <p className="mt-0.5 text-[10px] text-slate-500">
                    {loyalty.activeMembersWithPoints.toLocaleString()} members
                  </p>
                </div>
                <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                  <p className="text-slate-500">Points Redeemed</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {loyalty.pointsRedeemed.toLocaleString()}
                  </p>
                  <p className="mt-0.5 text-[10px] text-slate-500">
                    Redemption rate: {formatPercent(loyalty.redemptionRate)}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                  <p className="text-slate-500">Expiring Soon</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {loyalty.pointsExpiringSoon.toLocaleString()}
                  </p>
                  <p className="mt-0.5 text-[10px] text-red-600">
                    {loyalty.membersWithExpiringPoints} members
                  </p>
                </div>
              </div>
            )}

            {/* Segmentation Pie */}
            {isLoading ? (
              <Skeleton className="h-[190px] w-full" />
            ) : (
              <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1.8fr)] gap-3 items-center">
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie
                      data={segments}
                      dataKey="percentage"
                      nameKey="name"
                      innerRadius={45}
                      outerRadius={70}
                      paddingAngle={3}
                    >
                      {segments.map((s, idx) => {
                        const palette = [
                          "#F5C742",
                          "#22c55e",
                          "#0ea5e9",
                          "#6366f1",
                          "#f97316",
                          "#f97373",
                        ];
                        return (
                          <Cell
                            key={`cell-${idx}-${s.name}`}
                            fill={palette[idx % palette.length]}
                          />
                        );
                      })}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-1.5 text-[11px]">
                  {segments.slice(0, 6).map((s) => (
                    <div
                      key={s.name}
                      className="flex items-center justify-between gap-2"
                    >
                      <span className="text-slate-700">{s.name}</span>
                      <span className="text-slate-500">
                        {formatPercent(s.percentage)} &middot;{" "}
                        {s.customerCount.toLocaleString()} customers
                      </span>
                    </div>
                  ))}
                  {segments.length === 0 && (
                    <p className="text-xs text-slate-500">
                      No segmentation data available.
                    </p>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Groups + Feedback */}
        <div className="space-y-4">
          {/* Customer Groups */}
          <Card className="bg-white border-slate-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">
                Customer Groups
              </CardTitle>
              <CardDescription className="text-xs">
                Wholesale, VIP, corporate and custom groups.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 4 }).map((_, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <Skeleton className="h-3 w-36" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                  ))}
                </div>
              ) : groups.length === 0 ? (
                <p className="text-xs text-center text-slate-500">
                  No customer groups configured.
                </p>
              ) : (
                <div className="space-y-1.5 text-[11px]">
                  {groups.slice(0, 6).map((g) => (
                    <div
                      key={g.id}
                      className="flex items-center justify-between gap-2 rounded-md bg-slate-50 px-2 py-1.5"
                    >
                      <div className="flex flex-col min-w-0">
                        <span className="truncate font-medium text-slate-800">
                          {g.name}
                        </span>
                        <span className="text-[10px] text-slate-500">
                          {g.description || "â€”"}
                        </span>
                      </div>
                      <div className="flex flex-col items-end text-[10px] text-slate-500">
                        <span>
                          {g.customerCount.toLocaleString()} customers
                        </span>
                        <span>{formatPercent(g.revenueShare)} of revenue</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Feedback & Surveys */}
          <Card className="bg-white border-slate-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">
                Feedback & Surveys
              </CardTitle>
              <CardDescription className="text-xs">
                Survey responses and latest customer comments.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading || !feedback ? (
                <Skeleton className="h-[150px] w-full" />
              ) : (
                <div className="space-y-3 text-[11px]">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                      <p className="text-slate-500">Surveys Sent</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">
                        {feedback.surveysSent.toLocaleString()}
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                      <p className="text-slate-500">Completed</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">
                        {feedback.surveysCompleted.toLocaleString()}
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                      <p className="text-slate-500">Avg Score</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">
                        {feedback.avgScore.toFixed(1)} / 5
                      </p>
                    </div>
                  </div>

                  <div>
                    <p className="mb-1 text-[11px] font-medium text-slate-600">
                      Latest comments
                    </p>
                    <div className="space-y-1.5">
                      {feedback.latestComments.slice(0, 3).map((c) => (
                        <div
                          key={c.id}
                          className="rounded-md bg-slate-50 px-2 py-1.5"
                        >
                          <p className="text-[11px] text-slate-800 line-clamp-2">
                            "{c.comment}"
                          </p>
                          <p className="mt-0.5 text-[10px] text-slate-500">
                            {c.customerName} &middot; Rating {c.rating}/5
                          </p>
                        </div>
                      ))}
                      {feedback.latestComments.length === 0 && (
                        <p className="text-xs text-slate-500">
                          No feedback collected yet.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Activity Timeline */}
      <Card className="bg-white border-slate-200">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <ActivityIcon className="h-4 w-4 text-[#F5C742]" />
                CRM Activity Timeline
              </CardTitle>
              <CardDescription className="text-xs">
                Inquiries, follow-ups, campaigns, loyalty events and feedback.
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-8 border-slate-200 text-[11px]"
              onClick={() => onNavigate?.("customer-connect-activity-log")}
            >
              View full log
              <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, idx) => (
                <div key={idx} className="flex items-start gap-3">
                  <Skeleton className="h-6 w-6 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3 w-40" />
                    <Skeleton className="h-2 w-24" />
                  </div>
                </div>
              ))}
            </div>
          ) : activity.length === 0 ? (
            <p className="text-xs text-center text-slate-500">
              No recent CRM activity logged.
            </p>
          ) : (
            <div className="space-y-3">
              {activity.slice(0, 10).map((a, idx) => (
                <div key={a.id || idx} className="flex items-start gap-3 text-[11px]">
                  <div className="mt-1 flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                    {a.type === "inquiry" && <MessageCircle className="h-3.5 w-3.5" />}
                    {a.type === "followup" && <Target className="h-3.5 w-3.5" />}
                    {a.type === "campaign" && <Megaphone className="h-3.5 w-3.5" />}
                    {a.type === "message" && <Mail className="h-3.5 w-3.5" />}
                    {a.type === "loyalty" && <Star className="h-3.5 w-3.5" />}
                    {a.type === "feedback" && <SmilePlus className="h-3.5 w-3.5" />}
                    {!a.type && <Users className="h-3.5 w-3.5" />}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-slate-800">{a.title}</p>
                      <span className="whitespace-nowrap text-[10px] text-slate-500">
                        {a.timeLabel}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[10px] text-slate-500">
                      {a.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

