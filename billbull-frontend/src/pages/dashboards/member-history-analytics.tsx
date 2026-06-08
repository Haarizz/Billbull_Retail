import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "../../components/ui/avatar";
import { Badge } from "../../components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { Progress } from "../../components/ui/progress";
import { Separator } from "../../components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Checkbox } from "../../components/ui/checkbox";
import { Label } from "../../components/ui/label";
import { toast } from "sonner";
import {
  ArrowLeft,
  Search,
  User,
  Phone,
  Mail,
  Calendar,
  Clock,
  DollarSign,
  CreditCard,
  Wallet,
  TrendingUp,
  Download,
  MessageSquare,
  Target,
  Receipt,
  RefreshCcw,
  Gift,
  Users,
  Activity,
  BarChart3,
  PieChart,
  CheckCircle,
  AlertCircle,
  Flame,
  Zap,
  Trophy,
  Star,
  Share2,
  ShoppingCart,
  MapPin,
  Percent,
  FileText,
  Plus,
  Dumbbell,
  Building,
  Send,
  Filter,
  ChevronRight,
  ExternalLink,
  X,
  UserX,
  Camera,
  Upload,
  Eye,
  Printer,
  Share,
  Snowflake,
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover";
import { Calendar as CalendarComponent } from "../../components/ui/calendar";
import { Switch } from "../../components/ui/switch";
import { format, addDays, differenceInDays } from "date-fns";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart as RePieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "../../components/ui/sheet";
import { Textarea } from "../../components/ui/textarea";

interface MemberHistoryAnalyticsProps {
  onNavigate?: (section: string) => void;
  memberId?: string;
}

// Sample member data
const memberData = {
  id: 'MBR-123456',
  name: 'Ahmed Al-Mansoori',
  email: 'ahmed.mansoori@email.com',
  phone: '+971 50 123 4567',
  joinDate: '10 Jan 2023',
  photo: '/avatars/member-1.jpg',
  status: 'active',
  currentPlan: 'Premium Annual',
  daysRemaining: 42,
  planDuration: '12 Months',
  totalTimeSpent: '182 hours',
  totalIncome: 5840,
  totalMemberships: 3,
  lastRenewal: '05 Aug 2025',
  source: 'Referral - Trainer Sara',
  address: 'Dubai Marina, Dubai, UAE',
  emergencyContact: '+971 50 987 6543',
  totalTransactions: 18,
  paymentBreakdown: {
    cash: 2100,
    card: 3200,
    wallet: 540,
  },
  outstandingDues: 200,
  attendance: {
    totalHours: 182,
    totalDays: 126,
    avgDuration: 1.4,
    purchasedHours: 480,
    utilizationRate: 38,
  },
  referrals: 3,
  ptSessions: 24,
  posSpend: 1240,
};

// Sample attendance data
const attendanceData = [
  { month: 'Jan', hours: 28 },
  { month: 'Feb', hours: 32 },
  { month: 'Mar', hours: 24 },
  { month: 'Apr', hours: 30 },
  { month: 'May', hours: 26 },
  { month: 'Jun', hours: 22 },
  { month: 'Jul', hours: 20 },
];

// Sample activity timeline
const activityTimeline = [
  { date: '22 Jun 2024', event: 'Referral', detail: 'Brought new member "John Doe"', type: 'referral' },
  { date: '10 Mar 2024', event: 'Payment', detail: 'AED 1,200 via Card', type: 'payment' },
  { date: '15 Jan 2024', event: 'POS Purchase', detail: 'Protein Shake â€“ AED 60', type: 'pos' },
  { date: '10 Jul 2023', event: 'Renewed', detail: 'Upgraded to Premium', type: 'membership' },
  { date: '10 Jan 2023', event: 'Joined', detail: '6-Month Basic Plan', type: 'membership' },
];

// Sample payment history
const paymentHistory = [
  { date: '15 Jul 2024', type: 'Due Collected', mode: 'Wallet', amount: 200, remarks: '-' },
  { date: '02 Apr 2024', type: 'POS Purchase', mode: 'Cash', amount: 60, remarks: 'Protein Shake' },
  { date: '10 Mar 2024', type: 'Membership Renewal', mode: 'Card', amount: 1200, remarks: 'Premium 6M' },
];

// Weekly heatmap data
const weeklyData = [
  { day: 'Mon', visits: 12 },
  { day: 'Tue', visits: 15 },
  { day: 'Wed', visits: 18 },
  { day: 'Thu', visits: 14 },
  { day: 'Fri', visits: 10 },
  { day: 'Sat', visits: 8 },
  { day: 'Sun', visits: 5 },
];

// Sample post-workout feedback data
const workoutFeedback = [
  {
    id: 'FB-001',
    date: '08 Oct 2025',
    workoutType: 'Personal Training',
    trainerName: 'Sara Johnson',
    overallSatisfaction: 5,
    workoutIntensity: 4,
    trainerRating: 5,
    equipmentQuality: 5,
    facilityRating: 5,
    recommendWorkout: 'yes',
    difficultyLevel: 'just-right',
    paceRating: 'just-right',
    bestAspects: ['instruction', 'energy', 'variety'],
    areasForImprovement: [],
    comments: 'Excellent session! Sara really knows how to motivate and push me to my limits.',
    suggestions: 'Would love more similar sessions in the evening slots.',
    energyAfterWorkout: 'high',
    likelyToReturn: 10,
    wouldRecommendTrainer: 'yes',
  },
  {
    id: 'FB-002',
    date: '05 Oct 2025',
    workoutType: 'Group Class',
    className: 'HIIT Blast',
    trainerName: 'Mike Anderson',
    overallSatisfaction: 4,
    workoutIntensity: 5,
    trainerRating: 4,
    equipmentQuality: 4,
    facilityRating: 4,
    recommendWorkout: 'yes',
    difficultyLevel: 'too-hard',
    paceRating: 'too-fast',
    bestAspects: ['music', 'challenge', 'energy'],
    areasForImprovement: ['temperature'],
    comments: 'Great workout but the room was quite hot. Could use better ventilation.',
    suggestions: 'Maybe add a beginner-friendly HIIT class option.',
    energyAfterWorkout: 'medium',
    likelyToReturn: 8,
    wouldRecommendTrainer: 'yes',
  },
  {
    id: 'FB-003',
    date: '01 Oct 2025',
    workoutType: 'Open Gym',
    overallSatisfaction: 5,
    workoutIntensity: 3,
    equipmentQuality: 5,
    facilityRating: 5,
    recommendWorkout: 'yes',
    difficultyLevel: 'just-right',
    bestAspects: ['equipment', 'variety'],
    areasForImprovement: [],
    comments: 'Love the new equipment! Everything is clean and well-maintained.',
    suggestions: '',
    energyAfterWorkout: 'high',
    likelyToReturn: 9,
  },
  {
    id: 'FB-004',
    date: '28 Sep 2025',
    workoutType: 'Group Class',
    className: 'Yoga Flow',
    trainerName: 'Emma Wilson',
    overallSatisfaction: 5,
    workoutIntensity: 2,
    trainerRating: 5,
    equipmentQuality: 5,
    facilityRating: 5,
    recommendWorkout: 'yes',
    difficultyLevel: 'just-right',
    paceRating: 'just-right',
    bestAspects: ['instruction', 'music', 'energy'],
    areasForImprovement: [],
    comments: 'Perfect for recovery day. Emma is an amazing instructor.',
    suggestions: 'Would love more yoga class times throughout the week.',
    energyAfterWorkout: 'medium',
    likelyToReturn: 10,
    wouldRecommendTrainer: 'yes',
  },
];

// Communication history data
const communicationHistory = [
  {
    id: 'MSG-001',
    date: '10 Oct 2025',
    time: '9:12 AM',
    channel: 'sms',
    type: 'transactional',
    subject: 'Welcome Message',
    content: 'Welcome to IronFit Gym! Your plan starts today.',
    status: 'delivered',
    sentBy: 'System',
    deliveryReport: 'SMS-ID-78945612',
  },
  {
    id: 'MSG-002',
    date: '08 Oct 2025',
    time: '6:30 PM',
    channel: 'whatsapp',
    type: 'campaign',
    subject: 'ðŸ”¥ New Boxing Classes â€“ Enroll Now!',
    content: 'Hey Ahmed! Exciting news - we just launched new Boxing classes. Limited spots available. Book now!',
    status: 'read',
    sentBy: 'Admin â€“ Sara',
    deliveryReport: 'WA-READ-10/08/2025-18:35',
  },
  {
    id: 'MSG-003',
    date: '05 Oct 2025',
    time: '8:00 AM',
    channel: 'email',
    type: 'transactional',
    subject: 'Renewal Reminder â€“ Your plan ends soon',
    content: 'Hi Ahmed, your Premium Annual plan expires on 20 Nov 2025. Renew now to continue enjoying our services.',
    status: 'delivered',
    sentBy: 'System',
    deliveryReport: 'SMTP-DELIVERED',
  },
  {
    id: 'MSG-004',
    date: '30 Sep 2025',
    time: '4:45 PM',
    channel: 'whatsapp',
    type: 'transactional',
    subject: 'Class Reminder â€“ Zumba starts at 6 PM',
    content: 'Reminder: Your Zumba class starts in 1 hour at 6:00 PM. See you there!',
    status: 'delivered',
    sentBy: 'Scheduler',
    deliveryReport: 'WA-DELIVERED-30/09/2025-16:45',
  },
  {
    id: 'MSG-005',
    date: '25 Sep 2025',
    time: '12:05 PM',
    channel: 'sms',
    type: 'campaign',
    subject: 'ðŸ’¥ Referral Offer',
    content: 'Bring a friend, get 1 week free! Share the love of fitness and earn rewards.',
    status: 'sent',
    sentBy: 'Marketing Bot',
    deliveryReport: 'SMS-ID-78945601',
  },
  {
    id: 'MSG-006',
    date: '20 Sep 2025',
    time: '9:00 AM',
    channel: 'email',
    type: 'transactional',
    subject: 'Payment Confirmation',
    content: 'Your payment of AED 1,200 has been received. Thank you!',
    status: 'delivered',
    sentBy: 'System',
    deliveryReport: 'SMTP-DELIVERED',
  },
  {
    id: 'MSG-007',
    date: '15 Sep 2025',
    time: '7:30 PM',
    channel: 'whatsapp',
    type: 'campaign',
    subject: 'ðŸŽ‰ Special Offer â€“ Personal Training',
    content: 'Get 20% OFF on Personal Training packages this week only!',
    status: 'read',
    sentBy: 'Admin â€“ Mike',
    deliveryReport: 'WA-READ-15/09/2025-19:45',
  },
  {
    id: 'MSG-008',
    date: '10 Sep 2025',
    time: '10:15 AM',
    channel: 'sms',
    type: 'transactional',
    subject: 'Due Payment Reminder',
    content: 'You have an outstanding balance of AED 200. Please pay by Sep 15.',
    status: 'delivered',
    sentBy: 'System',
    deliveryReport: 'SMS-ID-78945589',
  },
];

const COLORS = ['#0047AB', '#00c5cb', '#4CAF50', '#FFC107', '#F44336'];

export function MemberHistoryAnalytics({ onNavigate, memberId }: MemberHistoryAnalyticsProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMember] = useState(memberData);
  const [selectedMessage, setSelectedMessage] = useState<any>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [channelFilter, setChannelFilter] = useState('all');
  const [messageTypeFilter, setMessageTypeFilter] = useState('all');
  const [communicationSearch, setCommunicationSearch] = useState('');
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [isDeactivateModalOpen, setIsDeactivateModalOpen] = useState(false);
  const [isMailCorporateModalOpen, setIsMailCorporateModalOpen] = useState(false);
  const [isFreezeDialogOpen, setIsFreezeDialogOpen] = useState(false);
  const [transactionSearch, setTransactionSearch] = useState('');
  const [transactionDateFrom, setTransactionDateFrom] = useState('');
  const [transactionDateTo, setTransactionDateTo] = useState('');
  const [transactionTypeFilter, setTransactionTypeFilter] = useState('all');
  const [mailCorporateForm, setMailCorporateForm] = useState({
    dateFrom: '',
    dateTo: '',
    includeAll: true,
    includeMembershipOnly: false,
    attachPDFs: true,
  });
  const [transferForm, setTransferForm] = useState({
    photo: null as File | null,
    fullName: '',
    mobileNumber: '',
    email: '',
    gender: '',
    dateOfBirth: '',
    transferFee: 100,
    confirmTransfer: false,
  });
  const [deactivateForm, setDeactivateForm] = useState({
    effectiveDate: new Date().toISOString().split('T')[0],
    reason: '',
    refundAmount: 0,
    refundMode: 'cash',
    returnPlan: false,
    confirmDeactivation: false,
  });

  const paymentPieData = [
    { name: 'Card', value: memberData.paymentBreakdown.card },
    { name: 'Cash', value: memberData.paymentBreakdown.cash },
    { name: 'Wallet', value: memberData.paymentBreakdown.wallet },
  ];

  // Filter communication history
  const filteredCommunications = communicationHistory.filter(msg => {
    const matchesChannel = channelFilter === 'all' || msg.channel === channelFilter;
    const matchesType = messageTypeFilter === 'all' || msg.type === messageTypeFilter;
    const matchesSearch = msg.subject.toLowerCase().includes(communicationSearch.toLowerCase()) ||
                          msg.content.toLowerCase().includes(communicationSearch.toLowerCase());
    return matchesChannel && matchesType && matchesSearch;
  });

  // Communication stats
  const communicationStats = {
    total: communicationHistory.length,
    transactional: communicationHistory.filter(m => m.type === 'transactional').length,
    campaign: communicationHistory.filter(m => m.type === 'campaign').length,
    delivered: communicationHistory.filter(m => m.status === 'delivered' || m.status === 'read').length,
    failed: communicationHistory.filter(m => m.status === 'failed' || m.status === 'pending').length,
  };

  // Sample transactions data
  const transactionsData = [
    {
      id: 1,
      date: '10-Mar-2024',
      transactionType: 'Membership Renewal',
      invoiceNo: 'INV-2378',
      mode: 'Card',
      amount: 1200,
      remarks: 'Premium 6M',
    },
    {
      id: 2,
      date: '12-Mar-2024',
      transactionType: 'POS Purchase',
      invoiceNo: 'INV-2385',
      mode: 'Cash',
      amount: 60,
      remarks: 'Protein Shake',
    },
    {
      id: 3,
      date: '22-Mar-2024',
      transactionType: 'Add-on Purchase',
      invoiceNo: 'INV-2390',
      mode: 'Card',
      amount: 120,
      remarks: 'Yoga Add-on',
    },
    {
      id: 4,
      date: '05-Apr-2024',
      transactionType: 'Membership Renewal',
      invoiceNo: 'INV-2456',
      mode: 'Mixed',
      amount: 1800,
      remarks: 'Premium Annual',
    },
    {
      id: 5,
      date: '08-Apr-2024',
      transactionType: 'POS Purchase',
      invoiceNo: 'INV-2468',
      mode: 'Card',
      amount: 45,
      remarks: 'Energy Bar',
    },
    {
      id: 6,
      date: '15-Apr-2024',
      transactionType: 'Add-on Purchase',
      invoiceNo: 'INV-2501',
      mode: 'Cash',
      amount: 300,
      remarks: 'Personal Training 5 Sessions',
    },
    {
      id: 7,
      date: '20-Apr-2024',
      transactionType: 'POS Purchase',
      invoiceNo: 'INV-2523',
      mode: 'Card',
      amount: 85,
      remarks: 'Gym Merchandise',
    },
    {
      id: 8,
      date: '25-Apr-2024',
      transactionType: 'Dues Payment',
      invoiceNo: 'INV-2548',
      mode: 'Cash',
      amount: 200,
      remarks: 'Partial Payment',
    },
    {
      id: 9,
      date: '02-May-2024',
      transactionType: 'POS Purchase',
      invoiceNo: 'INV-2573',
      mode: 'Card',
      amount: 75,
      remarks: 'Supplement Pack',
    },
    {
      id: 10,
      date: '10-May-2024',
      transactionType: 'Upgrade',
      invoiceNo: 'INV-2612',
      mode: 'Card',
      amount: 400,
      remarks: 'Upgrade to Premium Plus',
    },
  ];

  // Channel breakdown for pie chart
  const channelBreakdown = [
    { name: 'SMS', value: communicationHistory.filter(m => m.channel === 'sms').length },
    { name: 'Email', value: communicationHistory.filter(m => m.channel === 'email').length },
    { name: 'WhatsApp', value: communicationHistory.filter(m => m.channel === 'whatsapp').length },
  ];

  // Message type breakdown for pie chart
  const messageTypeBreakdown = [
    { name: 'Transactional', value: communicationStats.transactional },
    { name: 'Campaign', value: communicationStats.campaign },
  ];

  // Get channel icon
  const getChannelIcon = (channel: string) => {
    switch (channel) {
      case 'sms':
        return <MessageSquare className="h-4 w-4 text-blue-600" />;
      case 'email':
        return <Mail className="h-4 w-4 text-purple-600" />;
      case 'whatsapp':
        return <MessageSquare className="h-4 w-4 text-green-600" />;
      default:
        return <Send className="h-4 w-4" />;
    }
  };

  // Get status badge
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'delivered':
        return <Badge className="bg-green-100 text-green-700">âœ“ Delivered</Badge>;
      case 'read':
        return <Badge className="bg-blue-100 text-blue-700">âœ“ Read</Badge>;
      case 'sent':
        return <Badge className="bg-yellow-100 text-yellow-700">â³ Sent</Badge>;
      case 'failed':
        return <Badge className="bg-red-100 text-red-700">âœ— Failed</Badge>;
      case 'pending':
        return <Badge className="bg-gray-100 text-gray-700">â³ Pending</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header with Search */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onNavigate?.('members')}
              className="text-gray-600 hover:text-primary"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Members
            </Button>
          </div>
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Export Analytics
          </Button>
        </div>

        {/* Search Bar */}
        <Card className="border-primary/10">
          <CardContent className="p-4">
            <div className="flex items-center space-x-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search member by name, mobile, or ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 border-primary/20"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Current Member Summary Bar */}
        {selectedMember && (
          <Card className="mt-4 border-primary/20 bg-gradient-light">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <Avatar className="h-16 w-16 border-2 border-primary">
                    <AvatarFallback className="bg-gradient-primary text-white">
                      {selectedMember.name.split(' ').map(n => n[0]).join('')}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="flex items-center space-x-3 mb-1">
                      <h3 className="font-semibold text-lg">{selectedMember.name}</h3>
                      <Badge className="bg-gradient-primary text-white">
                        {selectedMember.status === 'active' ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-600">Member ID: {selectedMember.id}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-8 text-sm">
                  <div>
                    <p className="text-gray-600">Current Plan</p>
                    <p className="font-semibold text-primary">{selectedMember.currentPlan}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Days Remaining</p>
                    <p className="font-semibold text-orange-600">{selectedMember.daysRemaining} days</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Joined</p>
                    <p className="font-semibold">{selectedMember.joinDate}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Membership & Add-On Overview Card */}
      <Card className="border-primary/20 mb-6">
        <CardHeader className="bg-gradient-light border-b border-primary/10">
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <CreditCard className="h-5 w-5 text-primary" />
              <span>Current Membership & Add-Ons</span>
            </div>
            <div className="flex items-center space-x-2">
              <Button
                size="sm"
                variant="outline"
                className="border-[#2B7A78] text-[#2B7A78] hover:bg-[#DFF5F4]"
                onClick={() => setIsFreezeDialogOpen(true)}
              >
                <Snowflake className="h-4 w-4 mr-2" />
                Freeze / Unfreeze
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-primary/20"
                onClick={() => setIsTransferModalOpen(true)}
              >
                <RefreshCcw className="h-4 w-4 mr-2" />
                Transfer
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-red-300 text-red-600 hover:bg-red-50"
                onClick={() => setIsDeactivateModalOpen(true)}
              >
                <UserX className="h-4 w-4 mr-2" />
                Deactivate
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div>
              <p className="text-sm text-gray-600 mb-1">Current Plan</p>
              <p className="font-semibold text-gray-900">{selectedMember.currentPlan}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600 mb-1">Start Date</p>
              <p className="font-semibold text-gray-900">05-Aug-2025</p>
            </div>
            <div>
              <p className="text-sm text-gray-600 mb-1">Expiry Date</p>
              <p className="font-semibold text-gray-900">04-Feb-2026 <span className="text-green-600 text-xs">(118 days left)</span></p>
            </div>
            <div>
              <p className="text-sm text-gray-600 mb-1">Add-Ons</p>
              <div className="flex flex-wrap gap-1">
                <Badge variant="outline" className="border-primary/30 text-xs">Sauna Access</Badge>
                <Badge variant="outline" className="border-primary/30 text-xs">Diet Consultation</Badge>
              </div>
            </div>
          </div>

          <Separator className="my-4" />

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div>
              <p className="text-sm text-gray-600 mb-1">Status</p>
              <Badge className="bg-green-100 text-green-700">ðŸŸ¢ Active</Badge>
            </div>
            <div>
              <p className="text-sm text-gray-600 mb-1">Payment Mode</p>
              <p className="font-semibold text-gray-900">Card</p>
            </div>
            <div>
              <p className="text-sm text-gray-600 mb-1">Total Paid</p>
              <p className="font-semibold text-gray-900">AED 1,800</p>
            </div>
            <div>
              <p className="text-sm text-gray-600 mb-1">Transferable</p>
              <Badge className="bg-blue-100 text-blue-700">âœ… Yes (as per policy)</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Layout: Left Sidebar + Right Content */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Sidebar - Member Overview Panel */}
        <div className="lg:col-span-4 space-y-4 lg:sticky lg:top-6 lg:self-start">
          {/* Member Info Card */}
          <Card className="border-primary/20">
            <CardHeader className="bg-gradient-light border-b border-primary/10">
              <CardTitle className="flex items-center space-x-2">
                <User className="h-5 w-5 text-primary" />
                <span>Member Information</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="flex flex-col items-center mb-4">
                <Avatar className="h-24 w-24 mb-3 border-4 border-primary/20">
                  <AvatarFallback className="bg-gradient-primary text-white text-2xl">
                    {selectedMember.name.split(' ').map(n => n[0]).join('')}
                  </AvatarFallback>
                </Avatar>
                <h3 className="font-semibold text-lg">{selectedMember.name}</h3>
                <p className="text-sm text-gray-600">{selectedMember.id}</p>
              </div>

              <Separator />

              <div className="space-y-3">
                <div className="flex items-center space-x-3 text-sm">
                  <Mail className="h-4 w-4 text-primary" />
                  <span className="text-gray-600">{selectedMember.email}</span>
                </div>
                <div className="flex items-center space-x-3 text-sm">
                  <Phone className="h-4 w-4 text-primary" />
                  <span className="text-gray-600">{selectedMember.phone}</span>
                </div>
                <div className="flex items-center space-x-3 text-sm">
                  <MapPin className="h-4 w-4 text-primary" />
                  <span className="text-gray-600">{selectedMember.address}</span>
                </div>
                <div className="flex items-center space-x-3 text-sm">
                  <Share2 className="h-4 w-4 text-primary" />
                  <span className="text-gray-600">{selectedMember.source}</span>
                </div>
                <div className="flex items-center space-x-3 text-sm">
                  <Calendar className="h-4 w-4 text-primary" />
                  <span className="text-gray-600">Joined: {selectedMember.joinDate}</span>
                </div>
                <div className="flex items-center space-x-3 text-sm">
                  <RefreshCcw className="h-4 w-4 text-primary" />
                  <span className="text-gray-600">Last Renewal: {selectedMember.lastRenewal}</span>
                </div>
              </div>

              <Separator />

              {/* Key Stats */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-blue-50 p-3 rounded-lg">
                  <p className="text-xs text-gray-600 mb-1">Total Time</p>
                  <p className="font-semibold text-primary">{selectedMember.totalTimeSpent}</p>
                </div>
                <div className="bg-green-50 p-3 rounded-lg">
                  <p className="text-xs text-gray-600 mb-1">Total Income</p>
                  <p className="font-semibold text-green-600">AED {selectedMember.totalIncome.toLocaleString()}</p>
                </div>
                <div className="bg-purple-50 p-3 rounded-lg">
                  <p className="text-xs text-gray-600 mb-1">Memberships</p>
                  <p className="font-semibold text-purple-600">{selectedMember.totalMemberships} plans</p>
                </div>
                <div className="bg-orange-50 p-3 rounded-lg">
                  <p className="text-xs text-gray-600 mb-1">Transactions</p>
                  <p className="font-semibold text-orange-600">{selectedMember.totalTransactions}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Payment Summary Card */}
          <Card className="border-primary/20">
            <CardHeader className="bg-gradient-light border-b border-primary/10">
              <CardTitle className="flex items-center space-x-2">
                <Wallet className="h-5 w-5 text-primary" />
                <span>Payment Summary</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Total Transactions</span>
                  <span className="font-semibold">{selectedMember.totalTransactions}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">By Cash</span>
                  <span className="font-semibold text-green-600">AED {selectedMember.paymentBreakdown.cash.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">By Card</span>
                  <span className="font-semibold text-blue-600">AED {selectedMember.paymentBreakdown.card.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">By Wallet/UPI</span>
                  <span className="font-semibold text-purple-600">AED {selectedMember.paymentBreakdown.wallet.toLocaleString()}</span>
                </div>
                <Separator />
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-gray-900">Outstanding Dues</span>
                  <span className="font-semibold text-red-600">AED {selectedMember.outstandingDues.toLocaleString()}</span>
                </div>
              </div>

              {/* Pie Chart */}
              <div className="mt-4">
                <ResponsiveContainer width="100%" height={150}>
                  <RePieChart>
                    <Pie
                      data={paymentPieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={60}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {paymentPieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </RePieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card className="border-primary/20">
            <CardHeader className="bg-gradient-light border-b border-primary/10">
              <CardTitle className="flex items-center space-x-2">
                <Zap className="h-5 w-5 text-primary" />
                <span>Quick Actions</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-2">
              <Button variant="outline" className="w-full justify-start border-primary/20">
                <Receipt className="h-4 w-4 mr-2" />
                View Receipts
              </Button>
              <Button variant="outline" className="w-full justify-start border-primary/20">
                <RefreshCcw className="h-4 w-4 mr-2" />
                Renew / Upgrade Plan
              </Button>
              <Button variant="outline" className="w-full justify-start border-primary/20">
                <ShoppingCart className="h-4 w-4 mr-2" />
                Purchase Add-On
              </Button>
              <Button variant="outline" className="w-full justify-start border-primary/20">
                <Target className="h-4 w-4 mr-2" />
                Set Target / Offer Discount
              </Button>
              <Button variant="outline" className="w-full justify-start border-primary/20">
                <MessageSquare className="h-4 w-4 mr-2" />
                Send Message
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Right Content - Detailed Analytics Tabs */}
        <div className="lg:col-span-8">
          <Card className="border-primary/20">
            <Tabs defaultValue="timeline" className="w-full">
              <CardHeader className="bg-gradient-light border-b border-primary/10">
                <TabsList className="w-full justify-start bg-transparent">
                  <TabsTrigger value="timeline" className="data-[state=active]:bg-gradient-primary data-[state=active]:text-white">
                    <Activity className="h-4 w-4 mr-2" />
                    Activity Timeline
                  </TabsTrigger>
                  <TabsTrigger value="financial" className="data-[state=active]:bg-gradient-primary data-[state=active]:text-white">
                    <DollarSign className="h-4 w-4 mr-2" />
                    Financial History
                  </TabsTrigger>
                  <TabsTrigger value="usage" className="data-[state=active]:bg-gradient-primary data-[state=active]:text-white">
                    <BarChart3 className="h-4 w-4 mr-2" />
                    Gym Usage
                  </TabsTrigger>
                  <TabsTrigger value="performance" className="data-[state=active]:bg-gradient-primary data-[state=active]:text-white">
                    <TrendingUp className="h-4 w-4 mr-2" />
                    Performance
                  </TabsTrigger>
                  <TabsTrigger value="promotions" className="data-[state=active]:bg-gradient-primary data-[state=active]:text-white">
                    <Gift className="h-4 w-4 mr-2" />
                    Promotions
                  </TabsTrigger>
                  <TabsTrigger value="feedback" className="data-[state=active]:bg-gradient-primary data-[state=active]:text-white">
                    <Star className="h-4 w-4 mr-2" />
                    Workout Feedback
                  </TabsTrigger>
                  <TabsTrigger value="communication" className="data-[state=active]:bg-gradient-primary data-[state=active]:text-white">
                    <Send className="h-4 w-4 mr-2" />
                    Communication History
                  </TabsTrigger>
                  <TabsTrigger value="transactions" className="data-[state=active]:bg-gradient-primary data-[state=active]:text-white">
                    <Receipt className="h-4 w-4 mr-2" />
                    Transactions
                  </TabsTrigger>
                  <TabsTrigger value="notes" className="data-[state=active]:bg-gradient-primary data-[state=active]:text-white">
                    <FileText className="h-4 w-4 mr-2" />
                    Notes
                  </TabsTrigger>
                </TabsList>
              </CardHeader>

              <CardContent className="p-6">
                {/* Tab 1: Activity Timeline */}
                <TabsContent value="timeline" className="space-y-4 mt-0">
                  <div className="space-y-6">
                    {activityTimeline.map((activity, index) => (
                      <div key={index} className="flex items-start space-x-4">
                        <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
                          activity.type === 'membership' ? 'bg-purple-100' :
                          activity.type === 'payment' ? 'bg-green-100' :
                          activity.type === 'pos' ? 'bg-blue-100' :
                          'bg-orange-100'
                        }`}>
                          {activity.type === 'membership' && <CreditCard className="h-5 w-5 text-purple-600" />}
                          {activity.type === 'payment' && <DollarSign className="h-5 w-5 text-green-600" />}
                          {activity.type === 'pos' && <ShoppingCart className="h-5 w-5 text-blue-600" />}
                          {activity.type === 'referral' && <Share2 className="h-5 w-5 text-orange-600" />}
                        </div>
                        <div className="flex-1 border-l-2 border-gray-200 pl-4 pb-6">
                          <div className="flex items-center justify-between mb-1">
                            <h4 className="font-semibold text-gray-900">{activity.event}</h4>
                            <span className="text-sm text-gray-500">{activity.date}</span>
                          </div>
                          <p className="text-sm text-gray-600">{activity.detail}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </TabsContent>

                {/* Tab 2: Financial & Payment History */}
                <TabsContent value="financial" className="space-y-6 mt-0">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-primary/10">
                          <th className="text-left p-3 text-sm font-semibold text-primary">Date</th>
                          <th className="text-left p-3 text-sm font-semibold text-primary">Type</th>
                          <th className="text-left p-3 text-sm font-semibold text-primary">Mode</th>
                          <th className="text-right p-3 text-sm font-semibold text-primary">Amount</th>
                          <th className="text-left p-3 text-sm font-semibold text-primary">Remarks</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paymentHistory.map((payment, index) => (
                          <tr key={index} className="border-b border-gray-100 hover:bg-gray-50">
                            <td className="p-3 text-sm">{payment.date}</td>
                            <td className="p-3 text-sm">{payment.type}</td>
                            <td className="p-3 text-sm">
                              <Badge variant="outline" className="border-primary/30">
                                {payment.mode}
                              </Badge>
                            </td>
                            <td className="p-3 text-sm text-right font-semibold text-green-600">
                              AED {payment.amount.toLocaleString()}
                            </td>
                            <td className="p-3 text-sm text-gray-600">{payment.remarks}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-gradient-light border-t-2 border-primary/20">
                          <td colSpan={3} className="p-3 text-sm font-semibold">Total Paid</td>
                          <td className="p-3 text-sm text-right font-semibold text-green-600">
                            AED {selectedMember.totalIncome.toLocaleString()}
                          </td>
                          <td></td>
                        </tr>
                        <tr className="bg-red-50">
                          <td colSpan={3} className="p-3 text-sm font-semibold">Outstanding</td>
                          <td className="p-3 text-sm text-right font-semibold text-red-600">
                            AED {selectedMember.outstandingDues.toLocaleString()}
                          </td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  {/* Income Over Time Chart */}
                  <div className="mt-6">
                    <h4 className="font-semibold mb-4">Income Over Time</h4>
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={attendanceData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="month" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="hours" fill="#0047AB" name="Monthly Revenue (AED)" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </TabsContent>

                {/* Tab 3: Gym Usage Analytics */}
                <TabsContent value="usage" className="space-y-6 mt-0">
                  {/* KPI Cards */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <Card className="border-primary/20 bg-blue-50">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs text-gray-600 mb-1">Total Hours</p>
                            <p className="text-2xl font-bold text-primary">{memberData.attendance.totalHours}</p>
                          </div>
                          <Clock className="h-8 w-8 text-primary/40" />
                        </div>
                      </CardContent>
                    </Card>
                    <Card className="border-primary/20 bg-green-50">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs text-gray-600 mb-1">Total Days</p>
                            <p className="text-2xl font-bold text-green-600">{memberData.attendance.totalDays}</p>
                          </div>
                          <Calendar className="h-8 w-8 text-green-600/40" />
                        </div>
                      </CardContent>
                    </Card>
                    <Card className="border-primary/20 bg-purple-50">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs text-gray-600 mb-1">Avg Duration</p>
                            <p className="text-2xl font-bold text-purple-600">{memberData.attendance.avgDuration}h</p>
                          </div>
                          <Activity className="h-8 w-8 text-purple-600/40" />
                        </div>
                      </CardContent>
                    </Card>
                    <Card className="border-primary/20 bg-orange-50">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs text-gray-600 mb-1">Utilization</p>
                            <p className="text-2xl font-bold text-orange-600">{memberData.attendance.utilizationRate}%</p>
                          </div>
                          <Percent className="h-8 w-8 text-orange-600/40" />
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Attendance Chart */}
                  <div>
                    <h4 className="font-semibold mb-4">Attendance Over Time</h4>
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={attendanceData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="month" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Line type="monotone" dataKey="hours" stroke="#0047AB" strokeWidth={2} name="Hours" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Weekly Heatmap */}
                  <div>
                    <h4 className="font-semibold mb-4">Most Active Days</h4>
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={weeklyData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="day" />
                        <YAxis />
                        <Tooltip />
                        <Bar dataKey="visits" fill="#00c5cb" name="Visits" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </TabsContent>

                {/* Tab 4: Performance & Engagement */}
                <TabsContent value="performance" className="space-y-6 mt-0">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card className="border-primary/20">
                      <CardContent className="p-6 text-center">
                        <Share2 className="h-12 w-12 mx-auto mb-3 text-orange-600" />
                        <p className="text-3xl font-bold text-orange-600 mb-1">{memberData.referrals}</p>
                        <p className="text-sm text-gray-600">Referrals Made</p>
                      </CardContent>
                    </Card>
                    <Card className="border-primary/20">
                      <CardContent className="p-6 text-center">
                        <Users className="h-12 w-12 mx-auto mb-3 text-purple-600" />
                        <p className="text-3xl font-bold text-purple-600 mb-1">{memberData.ptSessions}</p>
                        <p className="text-sm text-gray-600">PT Sessions</p>
                      </CardContent>
                    </Card>
                    <Card className="border-primary/20">
                      <CardContent className="p-6 text-center">
                        <ShoppingCart className="h-12 w-12 mx-auto mb-3 text-blue-600" />
                        <p className="text-3xl font-bold text-blue-600 mb-1">AED {memberData.posSpend}</p>
                        <p className="text-sm text-gray-600">POS Purchases</p>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Engagement Score */}
                  <Card className="border-primary/20 bg-gradient-light">
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="font-semibold">Overall Engagement Score</h4>
                        <Badge className="bg-gradient-primary text-white">
                          <Star className="h-3 w-3 mr-1" />
                          Excellent
                        </Badge>
                      </div>
                      <Progress value={85} className="h-3 mb-2" />
                      <p className="text-sm text-gray-600">85% - Highly engaged member</p>
                    </CardContent>
                  </Card>

                  {/* Consistency Metrics */}
                  <div className="grid grid-cols-2 gap-4">
                    <Card className="border-primary/20">
                      <CardContent className="p-4">
                        <div className="flex items-center space-x-3">
                          <Flame className="h-8 w-8 text-orange-600" />
                          <div>
                            <p className="text-sm text-gray-600">Current Streak</p>
                            <p className="text-xl font-bold">12 days</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                    <Card className="border-primary/20">
                      <CardContent className="p-4">
                        <div className="flex items-center space-x-3">
                          <Trophy className="h-8 w-8 text-yellow-600" />
                          <div>
                            <p className="text-sm text-gray-600">Best Streak</p>
                            <p className="text-xl font-bold">28 days</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>

                {/* Tab 5: Promotion & Discount Eligibility */}
                <TabsContent value="promotions" className="space-y-6 mt-0">
                  {/* AI Insight Card */}
                  <Card className="border-green-200 bg-green-50">
                    <CardContent className="p-6">
                      <div className="flex items-start space-x-4">
                        <div className="flex-shrink-0 w-12 h-12 bg-green-600 rounded-full flex items-center justify-center">
                          <Gift className="h-6 w-6 text-white" />
                        </div>
                        <div className="flex-1">
                          <h4 className="font-semibold text-green-900 mb-2">
                            ðŸŽ‰ This member is a strong candidate for a Loyalty Discount
                          </h4>
                          <ul className="space-y-2 text-sm text-green-800 mb-4">
                            <li className="flex items-center space-x-2">
                              <CheckCircle className="h-4 w-4" />
                              <span>3 renewals completed</span>
                            </li>
                            <li className="flex items-center space-x-2">
                              <CheckCircle className="h-4 w-4" />
                              <span>Consistent attendance (avg. 4x per week)</span>
                            </li>
                            <li className="flex items-center space-x-2">
                              <CheckCircle className="h-4 w-4" />
                              <span>Lifetime spend AED {selectedMember.totalIncome.toLocaleString()}</span>
                            </li>
                          </ul>
                          <Badge className="bg-green-600 text-white">
                            Eligible for: 10% Renewal Discount
                          </Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Promotion History */}
                  <Card className="border-primary/20">
                    <CardHeader>
                      <CardTitle className="text-lg">Promotion History</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div>
                            <p className="font-medium">Early Bird Discount</p>
                            <p className="text-sm text-gray-600">Applied on Jan 2024</p>
                          </div>
                          <Badge variant="outline" className="border-green-600 text-green-600">
                            15% OFF
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div>
                            <p className="font-medium">Referral Bonus</p>
                            <p className="text-sm text-gray-600">Applied on Jul 2023</p>
                          </div>
                          <Badge variant="outline" className="border-blue-600 text-blue-600">
                            AED 200 Credit
                          </Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Suggested Upsell */}
                  <Card className="border-purple-200 bg-purple-50">
                    <CardContent className="p-6">
                      <div className="flex items-center space-x-3 mb-3">
                        <TrendingUp className="h-6 w-6 text-purple-600" />
                        <h4 className="font-semibold text-purple-900">Suggested Upsell</h4>
                      </div>
                      <p className="text-sm text-purple-800 mb-4">
                        Based on their usage patterns, this member might benefit from upgrading to an Annual Pro Plan with PT sessions included.
                      </p>
                      <Button className="btn-primary">
                        <Target className="h-4 w-4 mr-2" />
                        Create Upsell Offer
                      </Button>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* Tab 6: Workout Feedback */}
                <TabsContent value="feedback" className="space-y-6 mt-0">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h4 className="font-semibold">Post-Workout Feedback</h4>
                      <p className="text-sm text-gray-600">Member satisfaction and workout reviews</p>
                    </div>
                    <Badge className="bg-gradient-primary text-white">
                      {workoutFeedback.length} Total Reviews
                    </Badge>
                  </div>

                  {/* Average Ratings Summary */}
                  <Card className="border-primary/20 bg-gradient-light">
                    <CardContent className="p-6">
                      <h4 className="font-semibold mb-4">Average Ratings</h4>
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                        <div className="text-center">
                          <div className="flex items-center justify-center mb-2">
                            <Star className="h-5 w-5 text-yellow-500 fill-yellow-500" />
                          </div>
                          <p className="text-2xl font-bold text-primary">
                            {(workoutFeedback.reduce((acc, f) => acc + f.overallSatisfaction, 0) / workoutFeedback.length).toFixed(1)}
                          </p>
                          <p className="text-xs text-gray-600">Overall</p>
                        </div>
                        <div className="text-center">
                          <div className="flex items-center justify-center mb-2">
                            <Activity className="h-5 w-5 text-orange-500" />
                          </div>
                          <p className="text-2xl font-bold text-orange-600">
                            {(workoutFeedback.reduce((acc, f) => acc + f.workoutIntensity, 0) / workoutFeedback.length).toFixed(1)}
                          </p>
                          <p className="text-xs text-gray-600">Intensity</p>
                        </div>
                        <div className="text-center">
                          <div className="flex items-center justify-center mb-2">
                            <Users className="h-5 w-5 text-purple-500" />
                          </div>
                          <p className="text-2xl font-bold text-purple-600">
                            {(workoutFeedback.filter(f => f.trainerRating).reduce((acc, f) => acc + (f.trainerRating || 0), 0) / workoutFeedback.filter(f => f.trainerRating).length).toFixed(1)}
                          </p>
                          <p className="text-xs text-gray-600">Trainer</p>
                        </div>
                        <div className="text-center">
                          <div className="flex items-center justify-center mb-2">
                            <Dumbbell className="h-5 w-5 text-blue-500" />
                          </div>
                          <p className="text-2xl font-bold text-blue-600">
                            {(workoutFeedback.reduce((acc, f) => acc + f.equipmentQuality, 0) / workoutFeedback.length).toFixed(1)}
                          </p>
                          <p className="text-xs text-gray-600">Equipment</p>
                        </div>
                        <div className="text-center">
                          <div className="flex items-center justify-center mb-2">
                            <Building className="h-5 w-5 text-green-500" />
                          </div>
                          <p className="text-2xl font-bold text-green-600">
                            {(workoutFeedback.reduce((acc, f) => acc + f.facilityRating, 0) / workoutFeedback.length).toFixed(1)}
                          </p>
                          <p className="text-xs text-gray-600">Facility</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Individual Feedback Cards */}
                  <div className="space-y-4">
                    {workoutFeedback.map((feedback) => (
                      <Card key={feedback.id} className="border-primary/20">
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center space-x-2 mb-1">
                                <Badge className="bg-gradient-primary text-white">
                                  {feedback.workoutType}
                                </Badge>
                                {feedback.className && (
                                  <Badge variant="outline" className="border-primary/30">
                                    {feedback.className}
                                  </Badge>
                                )}
                              </div>
                              <CardTitle className="text-base flex items-center space-x-2">
                                <span>{feedback.trainerName || 'Self-Guided'}</span>
                                {feedback.trainerRating && (
                                  <div className="flex items-center">
                                    {[...Array(5)].map((_, i) => (
                                      <Star
                                        key={i}
                                        className={`h-3 w-3 ${
                                          i < feedback.trainerRating!
                                            ? 'text-yellow-500 fill-yellow-500'
                                            : 'text-gray-300'
                                        }`}
                                      />
                                    ))}
                                  </div>
                                )}
                              </CardTitle>
                              <CardDescription>{feedback.date}</CardDescription>
                            </div>
                            <div className="flex items-center space-x-2">
                              <div className="flex items-center space-x-1">
                                {[...Array(5)].map((_, i) => (
                                  <Star
                                    key={i}
                                    className={`h-4 w-4 ${
                                      i < feedback.overallSatisfaction
                                        ? 'text-yellow-500 fill-yellow-500'
                                        : 'text-gray-300'
                                    }`}
                                  />
                                ))}
                              </div>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          {/* Ratings Grid */}
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3 bg-gray-50 rounded-lg">
                            <div>
                              <p className="text-xs text-gray-600 mb-1">Intensity</p>
                              <div className="flex items-center space-x-1">
                                <Activity className="h-3 w-3 text-orange-500" />
                                <span className="text-sm font-semibold">{feedback.workoutIntensity}/5</span>
                              </div>
                            </div>
                            <div>
                              <p className="text-xs text-gray-600 mb-1">Equipment</p>
                              <div className="flex items-center space-x-1">
                                <Dumbbell className="h-3 w-3 text-blue-500" />
                                <span className="text-sm font-semibold">{feedback.equipmentQuality}/5</span>
                              </div>
                            </div>
                            <div>
                              <p className="text-xs text-gray-600 mb-1">Facility</p>
                              <div className="flex items-center space-x-1">
                                <Building className="h-3 w-3 text-green-500" />
                                <span className="text-sm font-semibold">{feedback.facilityRating}/5</span>
                              </div>
                            </div>
                            <div>
                              <p className="text-xs text-gray-600 mb-1">Difficulty</p>
                              <Badge variant="outline" className="text-xs border-primary/30">
                                {feedback.difficultyLevel.replace('-', ' ')}
                              </Badge>
                            </div>
                          </div>

                          {/* Best Aspects */}
                          {feedback.bestAspects.length > 0 && (
                            <div>
                              <p className="text-sm font-medium text-gray-700 mb-2 flex items-center">
                                <CheckCircle className="h-4 w-4 text-green-600 mr-1" />
                                Best Aspects
                              </p>
                              <div className="flex flex-wrap gap-2">
                                {feedback.bestAspects.map((aspect, idx) => (
                                  <Badge key={idx} className="bg-green-100 text-green-700 border-green-200">
                                    {aspect}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Areas for Improvement */}
                          {feedback.areasForImprovement.length > 0 && (
                            <div>
                              <p className="text-sm font-medium text-gray-700 mb-2 flex items-center">
                                <AlertCircle className="h-4 w-4 text-orange-600 mr-1" />
                                Areas for Improvement
                              </p>
                              <div className="flex flex-wrap gap-2">
                                {feedback.areasForImprovement.map((area, idx) => (
                                  <Badge key={idx} className="bg-orange-100 text-orange-700 border-orange-200">
                                    {area}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Comments */}
                          {feedback.comments && (
                            <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
                              <p className="text-sm font-medium text-blue-900 mb-1 flex items-center">
                                <MessageSquare className="h-4 w-4 mr-1" />
                                Member Comments
                              </p>
                              <p className="text-sm text-blue-800">{feedback.comments}</p>
                            </div>
                          )}

                          {/* Suggestions */}
                          {feedback.suggestions && (
                            <div className="p-3 bg-purple-50 rounded-lg border border-purple-100">
                              <p className="text-sm font-medium text-purple-900 mb-1 flex items-center">
                                <Gift className="h-4 w-4 mr-1" />
                                Suggestions
                              </p>
                              <p className="text-sm text-purple-800">{feedback.suggestions}</p>
                            </div>
                          )}

                          {/* Additional Metrics */}
                          <div className="grid grid-cols-3 gap-3 pt-3 border-t border-gray-200">
                            <div className="text-center">
                              <p className="text-xs text-gray-600 mb-1">Energy After</p>
                              <Badge
                                className={
                                  feedback.energyAfterWorkout === 'high'
                                    ? 'bg-green-100 text-green-700'
                                    : feedback.energyAfterWorkout === 'medium'
                                    ? 'bg-yellow-100 text-yellow-700'
                                    : 'bg-red-100 text-red-700'
                                }
                              >
                                {feedback.energyAfterWorkout}
                              </Badge>
                            </div>
                            <div className="text-center">
                              <p className="text-xs text-gray-600 mb-1">Likely to Return</p>
                              <p className="text-sm font-semibold text-primary">{feedback.likelyToReturn}/10</p>
                            </div>
                            <div className="text-center">
                              <p className="text-xs text-gray-600 mb-1">Recommend</p>
                              <Badge
                                className={
                                  feedback.recommendWorkout === 'yes'
                                    ? 'bg-green-100 text-green-700'
                                    : feedback.recommendWorkout === 'maybe'
                                    ? 'bg-yellow-100 text-yellow-700'
                                    : 'bg-red-100 text-red-700'
                                }
                              >
                                {feedback.recommendWorkout}
                              </Badge>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </TabsContent>

                {/* Tab 7: Communication History */}
                <TabsContent value="communication" className="space-y-6 mt-0">
                  {/* Analytics Summary Cards */}
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    <Card className="border-primary/20">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs text-gray-600 mb-1">Total Messages</p>
                            <p className="text-2xl font-bold text-primary">{communicationStats.total}</p>
                          </div>
                          <Send className="h-8 w-8 text-primary/30" />
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="border-blue-200 bg-blue-50">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs text-blue-600 mb-1">Transactional</p>
                            <p className="text-2xl font-bold text-blue-700">{communicationStats.transactional}</p>
                          </div>
                          <CheckCircle className="h-8 w-8 text-blue-300" />
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="border-purple-200 bg-purple-50">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs text-purple-600 mb-1">Campaign</p>
                            <p className="text-2xl font-bold text-purple-700">{communicationStats.campaign}</p>
                          </div>
                          <Gift className="h-8 w-8 text-purple-300" />
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="border-green-200 bg-green-50">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs text-green-600 mb-1">Delivered</p>
                            <p className="text-2xl font-bold text-green-700">{communicationStats.delivered}</p>
                          </div>
                          <CheckCircle className="h-8 w-8 text-green-300" />
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="border-red-200 bg-red-50">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs text-red-600 mb-1">Failed/Pending</p>
                            <p className="text-2xl font-bold text-red-700">{communicationStats.failed}</p>
                          </div>
                          <AlertCircle className="h-8 w-8 text-red-300" />
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Charts Row */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Card className="border-primary/20">
                      <CardHeader>
                        <CardTitle className="text-base">Channel Distribution</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ResponsiveContainer width="100%" height={200}>
                          <RePieChart>
                            <Pie
                              data={channelBreakdown}
                              cx="50%"
                              cy="50%"
                              innerRadius={50}
                              outerRadius={80}
                              fill="#8884d8"
                              paddingAngle={5}
                              dataKey="value"
                              label
                            >
                              {channelBreakdown.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={['#0047AB', '#9333EA', '#10B981'][index]} />
                              ))}
                            </Pie>
                            <Tooltip />
                          </RePieChart>
                        </ResponsiveContainer>
                        <div className="flex justify-center gap-4 mt-4">
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 bg-[#0047AB] rounded"></div>
                            <span className="text-xs">SMS</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 bg-[#9333EA] rounded"></div>
                            <span className="text-xs">Email</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 bg-[#10B981] rounded"></div>
                            <span className="text-xs">WhatsApp</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="border-primary/20">
                      <CardHeader>
                        <CardTitle className="text-base">Message Type Breakdown</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ResponsiveContainer width="100%" height={200}>
                          <RePieChart>
                            <Pie
                              data={messageTypeBreakdown}
                              cx="50%"
                              cy="50%"
                              innerRadius={50}
                              outerRadius={80}
                              fill="#8884d8"
                              paddingAngle={5}
                              dataKey="value"
                              label
                            >
                              {messageTypeBreakdown.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={['#0047AB', '#00c5cb'][index]} />
                              ))}
                            </Pie>
                            <Tooltip />
                          </RePieChart>
                        </ResponsiveContainer>
                        <div className="flex justify-center gap-4 mt-4">
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 bg-[#0047AB] rounded"></div>
                            <span className="text-xs">Transactional</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 bg-[#00c5cb] rounded"></div>
                            <span className="text-xs">Campaign</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Filters Bar */}
                  <Card className="border-primary/20 bg-gradient-light">
                    <CardContent className="p-4">
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div>
                          <label className="text-sm font-medium text-gray-700 mb-2 block">Channel</label>
                          <Select value={channelFilter} onValueChange={setChannelFilter}>
                            <SelectTrigger className="bg-white">
                              <SelectValue placeholder="All Channels" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All Channels</SelectItem>
                              <SelectItem value="sms">SMS</SelectItem>
                              <SelectItem value="email">Email</SelectItem>
                              <SelectItem value="whatsapp">WhatsApp</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <label className="text-sm font-medium text-gray-700 mb-2 block">Message Type</label>
                          <Select value={messageTypeFilter} onValueChange={setMessageTypeFilter}>
                            <SelectTrigger className="bg-white">
                              <SelectValue placeholder="All Types" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All Types</SelectItem>
                              <SelectItem value="transactional">Transactional</SelectItem>
                              <SelectItem value="campaign">Campaign</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="md:col-span-2">
                          <label className="text-sm font-medium text-gray-700 mb-2 block">Search Messages</label>
                          <div className="relative">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <Input
                              placeholder="Search subject or content..."
                              value={communicationSearch}
                              onChange={(e) => setCommunicationSearch(e.target.value)}
                              className="pl-10 bg-white"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between mt-4 pt-4 border-t border-primary/10">
                        <p className="text-sm text-gray-600">
                          Showing <span className="font-semibold text-primary">{filteredCommunications.length}</span> of {communicationHistory.length} messages
                        </p>
                        <Button variant="outline" size="sm" className="border-primary/20">
                          <Download className="h-4 w-4 mr-2" />
                          Export CSV
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Message History Table */}
                  <Card className="border-primary/20">
                    <CardHeader>
                      <CardTitle>Message History</CardTitle>
                      <CardDescription>Complete communication log across all channels</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {filteredCommunications.map((msg) => (
                          <div
                            key={msg.id}
                            className="p-4 border border-gray-200 rounded-lg hover:border-primary/40 hover:bg-gradient-light cursor-pointer transition-all duration-200 group"
                            onClick={() => {
                              setSelectedMessage(msg);
                              setIsDrawerOpen(true);
                            }}
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex items-start space-x-3 flex-1">
                                <div className="mt-1">
                                  {getChannelIcon(msg.channel)}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center space-x-2 mb-1">
                                    <h4 className="font-semibold text-gray-900 truncate">{msg.subject}</h4>
                                    <Badge
                                      variant="outline"
                                      className={
                                        msg.type === 'transactional'
                                          ? 'border-blue-300 text-blue-700 text-xs'
                                          : 'border-purple-300 text-purple-700 text-xs'
                                      }
                                    >
                                      {msg.type}
                                    </Badge>
                                  </div>
                                  <p className="text-sm text-gray-600 truncate mb-2">{msg.content}</p>
                                  <div className="flex items-center space-x-4 text-xs text-gray-500">
                                    <span className="flex items-center">
                                      <Clock className="h-3 w-3 mr-1" />
                                      {msg.date} at {msg.time}
                                    </span>
                                    <span className="flex items-center">
                                      <User className="h-3 w-3 mr-1" />
                                      {msg.sentBy}
                                    </span>
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center space-x-2">
                                {getStatusBadge(msg.status)}
                                <ChevronRight className="h-5 w-5 text-gray-400 group-hover:text-primary transition-colors" />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      {filteredCommunications.length === 0 && (
                        <div className="text-center py-12">
                          <Send className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                          <p className="text-gray-600">No messages found matching your filters</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Smart Insights Panel */}
                  <Card className="border-primary/20 bg-gradient-light">
                    <CardHeader>
                      <CardTitle className="flex items-center space-x-2">
                        <Activity className="h-5 w-5 text-primary" />
                        <span>Communication Effectiveness Insights</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="p-4 bg-white rounded-lg border border-primary/10">
                          <h4 className="font-semibold text-gray-900 mb-2 flex items-center">
                            <TrendingUp className="h-4 w-4 text-green-600 mr-2" />
                            Highest Engagement
                          </h4>
                          <p className="text-sm text-gray-600">
                            <span className="font-semibold text-green-700">WhatsApp</span> - 92% read rate
                          </p>
                          <p className="text-xs text-gray-500 mt-1">Best channel for urgent communications</p>
                        </div>

                        <div className="p-4 bg-white rounded-lg border border-primary/10">
                          <h4 className="font-semibold text-gray-900 mb-2 flex items-center">
                            <AlertCircle className="h-4 w-4 text-orange-600 mr-2" />
                            Least Responsive
                          </h4>
                          <p className="text-sm text-gray-600">
                            <span className="font-semibold text-orange-700">Email</span> - 42% open rate
                          </p>
                          <p className="text-xs text-gray-500 mt-1">Consider SMS or WhatsApp for time-sensitive messages</p>
                        </div>

                        <div className="p-4 bg-white rounded-lg border border-primary/10">
                          <h4 className="font-semibold text-gray-900 mb-2 flex items-center">
                            <Trophy className="h-4 w-4 text-purple-600 mr-2" />
                            Most Engaged Campaign
                          </h4>
                          <p className="text-sm text-gray-600">
                            <span className="font-semibold text-purple-700">"Referral Bonus â€“ July"</span>
                          </p>
                          <p className="text-xs text-gray-500 mt-1">Generated 5 new member referrals</p>
                        </div>

                        <div className="p-4 bg-white rounded-lg border border-primary/10">
                          <h4 className="font-semibold text-gray-900 mb-2 flex items-center">
                            <Target className="h-4 w-4 text-blue-600 mr-2" />
                            Suggested Action
                          </h4>
                          <p className="text-sm text-gray-600">
                            Send <span className="font-semibold text-blue-700">Renewal Discount Reminder</span>
                          </p>
                          <Button size="sm" className="btn-primary mt-2">
                            <Send className="h-3 w-3 mr-1" />
                            Send Now
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* Tab 8: Transactions */}
                <TabsContent value="transactions" className="space-y-6 mt-0">
                  {/* Header with Description and Actions */}
                  <div className="flex items-start justify-between mb-6">
                    <div>
                      <h3 className="text-xl font-semibold text-gray-900 mb-2">Transactions</h3>
                      <p className="text-sm text-gray-600">
                        All recorded payments and financial activities of this member, including membership renewals, add-ons, and POS purchases.
                      </p>
                    </div>
                    <Button
                      className="btn-primary"
                      onClick={() => setIsMailCorporateModalOpen(true)}
                    >
                      <Mail className="h-4 w-4 mr-2" />
                      Mail to Corporate
                    </Button>
                  </div>

                  {/* Filters */}
                  <Card className="border-primary/20">
                    <CardContent className="p-4">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* Date Range Filter */}
                        <div>
                          <label className="text-sm font-medium text-gray-700 mb-2 block">
                            ðŸ“… From Date
                          </label>
                          <Input
                            type="date"
                            value={transactionDateFrom}
                            onChange={(e) => setTransactionDateFrom(e.target.value)}
                            className="w-full"
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium text-gray-700 mb-2 block">
                            ðŸ“… To Date
                          </label>
                          <Input
                            type="date"
                            value={transactionDateTo}
                            onChange={(e) => setTransactionDateTo(e.target.value)}
                            className="w-full"
                          />
                        </div>

                        {/* Transaction Type Filter */}
                        <div>
                          <label className="text-sm font-medium text-gray-700 mb-2 block">
                            ðŸ“‚ Transaction Type
                          </label>
                          <Select value={transactionTypeFilter} onValueChange={setTransactionTypeFilter}>
                            <SelectTrigger>
                              <SelectValue placeholder="All Transactions" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All Transactions</SelectItem>
                              <SelectItem value="membership">Membership Only</SelectItem>
                              <SelectItem value="pos">POS Only</SelectItem>
                              <SelectItem value="addon">Add-ons / Upgrades</SelectItem>
                              <SelectItem value="dues">Dues / Refunds</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {/* Search and Reset */}
                      <div className="flex items-center gap-3 mt-4">
                        <div className="relative flex-1">
                          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                          <Input
                            placeholder="Search by invoice number or keyword..."
                            value={transactionSearch}
                            onChange={(e) => setTransactionSearch(e.target.value)}
                            className="pl-10"
                          />
                        </div>
                        <Button
                          variant="outline"
                          onClick={() => {
                            setTransactionDateFrom('');
                            setTransactionDateTo('');
                            setTransactionTypeFilter('all');
                            setTransactionSearch('');
                          }}
                        >
                          <RefreshCcw className="h-4 w-4 mr-2" />
                          Reset Filters
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Transactions Table */}
                  <Card className="border-primary/20 shadow-md rounded-2xl overflow-hidden">
                    <CardHeader className="bg-gradient-primary text-white">
                      <CardTitle>Transaction History</CardTitle>
                      <CardDescription className="text-white/80">
                        Complete financial activity log
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader className="bg-gray-50 sticky top-0 z-10">
                            <TableRow>
                              <TableHead className="table-header">Date</TableHead>
                              <TableHead className="table-header">Transaction Type</TableHead>
                              <TableHead className="table-header">Reference / Invoice No.</TableHead>
                              <TableHead className="table-header">Mode</TableHead>
                              <TableHead className="table-header text-right">Amount (AED)</TableHead>
                              <TableHead className="table-header">Remarks</TableHead>
                              <TableHead className="table-header text-center">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {transactionsData.map((transaction, index) => (
                              <TableRow
                                key={transaction.id}
                                className={`${
                                  index % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                                } hover:bg-gradient-light transition-colors`}
                              >
                                <TableCell className="font-medium">{transaction.date}</TableCell>
                                <TableCell>
                                  <Badge
                                    className={
                                      transaction.transactionType.includes('Membership')
                                        ? 'bg-purple-100 text-purple-700'
                                        : transaction.transactionType.includes('POS')
                                        ? 'bg-blue-100 text-blue-700'
                                        : transaction.transactionType.includes('Add-on')
                                        ? 'bg-orange-100 text-orange-700'
                                        : transaction.transactionType.includes('Upgrade')
                                        ? 'bg-green-100 text-green-700'
                                        : 'bg-gray-100 text-gray-700'
                                    }
                                  >
                                    {transaction.transactionType}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline" className="border-primary/30 font-mono">
                                    {transaction.invoiceNo}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  <Badge
                                    className={
                                      transaction.mode === 'Card'
                                        ? 'bg-blue-100 text-blue-700'
                                        : transaction.mode === 'Cash'
                                        ? 'bg-green-100 text-green-700'
                                        : 'bg-orange-100 text-orange-700'
                                    }
                                  >
                                    {transaction.mode}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-right font-semibold text-green-600">
                                  {transaction.amount.toLocaleString()}
                                </TableCell>
                                <TableCell className="text-gray-600">{transaction.remarks}</TableCell>
                                <TableCell>
                                  <div className="flex items-center justify-center space-x-1">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-8 w-8 p-0 hover:bg-blue-50 group"
                                      onClick={() => toast.success('Opening receipt...')}
                                    >
                                      <Eye className="h-4 w-4 text-gray-600 group-hover:text-blue-600" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-8 w-8 p-0 hover:bg-green-50 group"
                                      onClick={() =>
                                        toast.success(`Downloading ${transaction.invoiceNo}...`)
                                      }
                                    >
                                      <Download className="h-4 w-4 text-gray-600 group-hover:text-green-600" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-8 w-8 p-0 hover:bg-purple-50 group"
                                      onClick={() => {
                                        window.print();
                                        toast.success('Opening print dialog...');
                                      }}
                                    >
                                      <Printer className="h-4 w-4 text-gray-600 group-hover:text-purple-600" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-8 w-8 p-0 hover:bg-orange-50 group"
                                      onClick={() => toast.success('Share options opened...')}
                                    >
                                      <Share className="h-4 w-4 text-gray-600 group-hover:text-orange-600" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>

                      {/* Summary Footer */}
                      <div className="border-t-2 border-primary/20 p-6 bg-gradient-light">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div>
                            <p className="text-sm text-gray-600 mb-1">Total Transactions</p>
                            <p className="text-2xl font-bold text-primary">{transactionsData.length}</p>
                          </div>
                          <div>
                            <p className="text-sm text-gray-600 mb-1">Total Amount</p>
                            <p className="text-2xl font-bold text-green-600">
                              AED {transactionsData.reduce((sum, t) => sum + t.amount, 0).toLocaleString()}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm text-gray-600 mb-1">Membership Transactions</p>
                            <p className="text-2xl font-bold text-purple-600">
                              AED{' '}
                              {transactionsData
                                .filter((t) => t.transactionType.includes('Membership'))
                                .reduce((sum, t) => sum + t.amount, 0)
                                .toLocaleString()}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm text-gray-600 mb-1">POS Purchases</p>
                            <p className="text-2xl font-bold text-blue-600">
                              AED{' '}
                              {transactionsData
                                .filter((t) => t.transactionType.includes('POS'))
                                .reduce((sum, t) => sum + t.amount, 0)
                                .toLocaleString()}
                            </p>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* Tab 9: Notes / Attachments */}
                <TabsContent value="notes" className="space-y-4 mt-0">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="font-semibold">Staff Notes</h4>
                    <Button size="sm" className="btn-primary">
                      <Plus className="h-4 w-4 mr-2" />
                      Add Note
                    </Button>
                  </div>

                  <div className="space-y-3">
                    <Card className="border-primary/20">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center space-x-2">
                            <Avatar className="h-8 w-8">
                              <AvatarFallback className="bg-gradient-primary text-white text-xs">
                                TS
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="text-sm font-medium">Trainer Sara</p>
                              <p className="text-xs text-gray-500">09 Oct 2025</p>
                            </div>
                          </div>
                        </div>
                        <p className="text-sm text-gray-700">
                          Interested in Boxing Add-on. Follow up next week.
                        </p>
                      </CardContent>
                    </Card>

                    <Card className="border-primary/20">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center space-x-2">
                            <Avatar className="h-8 w-8">
                              <AvatarFallback className="bg-gradient-primary text-white text-xs">
                                AD
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="text-sm font-medium">Admin</p>
                              <p className="text-xs text-gray-500">03 Oct 2025</p>
                            </div>
                          </div>
                        </div>
                        <p className="text-sm text-gray-700">
                          Requested early morning slot. Scheduled for 6 AM sessions.
                        </p>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>
              </CardContent>
            </Tabs>
          </Card>
        </div>
      </div>

      {/* Message Details Drawer */}
      <Sheet open={isDrawerOpen} onOpenChange={setIsDrawerOpen}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto" aria-describedby="message-details-description">
          {selectedMessage ? (
            <>
              <SheetHeader>
                <div className="flex items-center justify-between">
                  <SheetTitle className="flex items-center space-x-2">
                    {getChannelIcon(selectedMessage.channel)}
                    <span>Message Details</span>
                  </SheetTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsDrawerOpen(false)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <SheetDescription id="message-details-description">
                  Complete message information and delivery status
                </SheetDescription>
              </SheetHeader>

              <div className="mt-6 space-y-6">
                {/* Message Header */}
                <Card className="border-primary/20">
                  <CardContent className="p-4">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">Message ID</span>
                        <Badge variant="outline" className="font-mono">{selectedMessage.id}</Badge>
                      </div>
                      <Separator />
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">Channel</span>
                        <div className="flex items-center space-x-2">
                          {getChannelIcon(selectedMessage.channel)}
                          <span className="font-semibold capitalize">{selectedMessage.channel}</span>
                        </div>
                      </div>
                      <Separator />
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">Type</span>
                        <Badge
                          className={
                            selectedMessage.type === 'transactional'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-purple-100 text-purple-700'
                          }
                        >
                          {selectedMessage.type}
                        </Badge>
                      </div>
                      <Separator />
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">Status</span>
                        {getStatusBadge(selectedMessage.status)}
                      </div>
                      <Separator />
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">Date Sent</span>
                        <span className="font-semibold text-sm">{selectedMessage.date} at {selectedMessage.time}</span>
                      </div>
                      <Separator />
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">Sent By</span>
                        <Badge variant="outline">{selectedMessage.sentBy}</Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Message Content */}
                <Card className="border-primary/20">
                  <CardHeader>
                    <CardTitle className="text-base">Message Content</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-1 block">Subject</label>
                      <p className="text-sm font-semibold text-gray-900">{selectedMessage.subject}</p>
                    </div>
                    <Separator />
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-1 block">Full Message</label>
                      <p className="text-sm text-gray-700 leading-relaxed">{selectedMessage.content}</p>
                    </div>
                  </CardContent>
                </Card>

                {/* Delivery Report */}
                <Card className="border-primary/20 bg-gradient-light">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center">
                      <CheckCircle className="h-4 w-4 mr-2 text-primary" />
                      Delivery Report
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="p-3 bg-white rounded-lg border border-primary/10">
                      <p className="text-sm text-gray-600 mb-1">Report ID</p>
                      <p className="text-sm font-mono text-primary">{selectedMessage.deliveryReport}</p>
                    </div>
                  </CardContent>
                </Card>

                {/* Action Buttons */}
                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1 border-primary/20">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    View in Channel
                  </Button>
                  <Button className="flex-1 btn-primary">
                    <Send className="h-4 w-4 mr-2" />
                    Resend Message
                  </Button>
                </div>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      {/* Transfer Membership Modal */}
      <Dialog open={isTransferModalOpen} onOpenChange={setIsTransferModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2">
              <RefreshCcw className="h-5 w-5 text-primary" />
              <span>Transfer Membership</span>
            </DialogTitle>
            <DialogDescription>
              Transfer the remaining validity of this membership to a new member
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Photo Upload */}
            <div>
              <Label className="text-sm font-medium text-gray-700 mb-2 block">
                ðŸ“¸ New Member Photo *
              </Label>
              <div className="border-2 border-dashed border-primary/30 rounded-lg p-6 text-center hover:border-primary transition-colors">
                <div className="flex flex-col items-center space-y-2">
                  <Camera className="h-12 w-12 text-primary/50" />
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" type="button">
                      <Upload className="h-4 w-4 mr-2" />
                      Upload Photo
                    </Button>
                    <Button variant="outline" size="sm" type="button">
                      <Camera className="h-4 w-4 mr-2" />
                      Capture
                    </Button>
                  </div>
                  <p className="text-xs text-gray-500">PNG, JPG up to 5MB</p>
                </div>
              </div>
            </div>

            {/* Full Name */}
            <div>
              <Label htmlFor="fullName" className="text-sm font-medium text-gray-700 mb-2 block">
                ðŸ‘¤ Full Name *
              </Label>
              <Input
                id="fullName"
                placeholder="Enter full name"
                value={transferForm.fullName}
                onChange={(e) => setTransferForm({ ...transferForm, fullName: e.target.value })}
              />
            </div>

            {/* Mobile Number */}
            <div>
              <Label htmlFor="mobileNumber" className="text-sm font-medium text-gray-700 mb-2 block">
                ðŸ“ž Mobile Number *
              </Label>
              <Input
                id="mobileNumber"
                placeholder="+971 50 123 4567"
                value={transferForm.mobileNumber}
                onChange={(e) => setTransferForm({ ...transferForm, mobileNumber: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Email */}
              <div>
                <Label htmlFor="email" className="text-sm font-medium text-gray-700 mb-2 block">
                  âœ‰ï¸ Email (optional)
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="email@example.com"
                  value={transferForm.email}
                  onChange={(e) => setTransferForm({ ...transferForm, email: e.target.value })}
                />
              </div>

              {/* Gender */}
              <div>
                <Label htmlFor="gender" className="text-sm font-medium text-gray-700 mb-2 block">
                  ðŸ‹ï¸ Gender (optional)
                </Label>
                <Select value={transferForm.gender} onValueChange={(value) => setTransferForm({ ...transferForm, gender: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select gender" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Date of Birth */}
              <div>
                <Label htmlFor="dob" className="text-sm font-medium text-gray-700 mb-2 block">
                  ðŸ“… Date of Birth (optional)
                </Label>
                <Input
                  id="dob"
                  type="date"
                  value={transferForm.dateOfBirth}
                  onChange={(e) => setTransferForm({ ...transferForm, dateOfBirth: e.target.value })}
                />
              </div>

              {/* Transfer Fee */}
              <div>
                <Label htmlFor="transferFee" className="text-sm font-medium text-gray-700 mb-2 block">
                  ðŸ’° Transfer Fee (AED)
                </Label>
                <Input
                  id="transferFee"
                  type="number"
                  placeholder="100"
                  value={transferForm.transferFee}
                  onChange={(e) => setTransferForm({ ...transferForm, transferFee: Number(e.target.value) })}
                />
              </div>
            </div>

            {/* Remaining Days Info */}
            <Card className="border-primary/20 bg-gradient-light">
              <CardContent className="p-4">
                <p className="text-sm font-medium text-gray-700 mb-1">âš™ï¸ Remaining Plan Days</p>
                <p className="text-lg font-semibold text-primary">118 days will be transferred to the new member</p>
                <p className="text-xs text-gray-600 mt-1">From: Ahmed Al-Mansoori â†’ To: New Member</p>
              </CardContent>
            </Card>

            {/* Confirmation */}
            <div className="flex items-start space-x-3 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <Checkbox
                id="confirmTransfer"
                checked={transferForm.confirmTransfer}
                onCheckedChange={(checked) => setTransferForm({ ...transferForm, confirmTransfer: checked as boolean })}
              />
              <Label htmlFor="confirmTransfer" className="text-sm text-blue-900 cursor-pointer">
                âœ… I confirm to transfer membership to this person. The current member's plan will be deactivated and the new member will receive the remaining 118 days.
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsTransferModalOpen(false);
                setTransferForm({
                  photo: null,
                  fullName: '',
                  mobileNumber: '',
                  email: '',
                  gender: '',
                  dateOfBirth: '',
                  transferFee: 100,
                  confirmTransfer: false,
                });
              }}
            >
              Cancel
            </Button>
            <Button
              className="btn-primary"
              disabled={!transferForm.fullName || !transferForm.mobileNumber || !transferForm.confirmTransfer}
              onClick={() => {
                toast.success('Membership transferred successfully!', {
                  description: `Transferred to ${transferForm.fullName}. Transfer fee: AED ${transferForm.transferFee}`,
                });
                setIsTransferModalOpen(false);
                setTransferForm({
                  photo: null,
                  fullName: '',
                  mobileNumber: '',
                  email: '',
                  gender: '',
                  dateOfBirth: '',
                  transferFee: 100,
                  confirmTransfer: false,
                });
              }}
            >
              <RefreshCcw className="h-4 w-4 mr-2" />
              Transfer Membership
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mail to Corporate Modal */}
      <Dialog open={isMailCorporateModalOpen} onOpenChange={setIsMailCorporateModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2">
              <Mail className="h-5 w-5 text-primary" />
              <span>Send Transactions Summary to Corporate</span>
            </DialogTitle>
            <DialogDescription>
              Choose which transactions to include in the corporate email
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Date Range */}
            <Card className="border-primary/20 bg-gradient-light">
              <CardContent className="p-4 space-y-3">
                <h4 className="font-semibold text-gray-900">ðŸ“… Date Range</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="mailDateFrom" className="text-sm text-gray-700 mb-2 block">
                      From
                    </Label>
                    <Input
                      id="mailDateFrom"
                      type="date"
                      value={mailCorporateForm.dateFrom}
                      onChange={(e) =>
                        setMailCorporateForm({ ...mailCorporateForm, dateFrom: e.target.value })
                      }
                      className="bg-white"
                    />
                  </div>
                  <div>
                    <Label htmlFor="mailDateTo" className="text-sm text-gray-700 mb-2 block">
                      To
                    </Label>
                    <Input
                      id="mailDateTo"
                      type="date"
                      value={mailCorporateForm.dateTo}
                      onChange={(e) =>
                        setMailCorporateForm({ ...mailCorporateForm, dateTo: e.target.value })
                      }
                      className="bg-white"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Filter Options */}
            <Card className="border-primary/20">
              <CardContent className="p-4 space-y-3">
                <h4 className="font-semibold text-gray-900">ðŸ“‚ Include</h4>
                <div className="space-y-2">
                  <div className="flex items-center space-x-3">
                    <Checkbox
                      id="includeAll"
                      checked={mailCorporateForm.includeAll}
                      onCheckedChange={(checked) =>
                        setMailCorporateForm({
                          ...mailCorporateForm,
                          includeAll: checked as boolean,
                          includeMembershipOnly: false,
                        })
                      }
                    />
                    <Label htmlFor="includeAll" className="text-sm cursor-pointer">
                      â˜‘ï¸ All Transactions
                    </Label>
                  </div>
                  <div className="flex items-center space-x-3">
                    <Checkbox
                      id="includeMembership"
                      checked={mailCorporateForm.includeMembershipOnly}
                      onCheckedChange={(checked) =>
                        setMailCorporateForm({
                          ...mailCorporateForm,
                          includeMembershipOnly: checked as boolean,
                          includeAll: false,
                        })
                      }
                    />
                    <Label htmlFor="includeMembership" className="text-sm cursor-pointer">
                      ðŸŽ« Membership Transactions Only
                    </Label>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Attach PDFs Option */}
            <Card className="border-primary/20 bg-blue-50">
              <CardContent className="p-4">
                <div className="flex items-start space-x-3">
                  <Checkbox
                    id="attachPDFs"
                    checked={mailCorporateForm.attachPDFs}
                    onCheckedChange={(checked) =>
                      setMailCorporateForm({ ...mailCorporateForm, attachPDFs: checked as boolean })
                    }
                  />
                  <div>
                    <Label htmlFor="attachPDFs" className="text-sm font-semibold text-blue-900 cursor-pointer">
                      ðŸ“Ž Attach All PDFs Automatically
                    </Label>
                    <p className="text-xs text-blue-700 mt-1">
                      Automatically fetches and attaches all transaction receipts within the selected date range
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Summary Preview */}
            <Card className="border-primary/20">
              <CardContent className="p-4">
                <h4 className="font-semibold text-gray-900 mb-3">ðŸ“§ Email Preview</h4>
                <div className="p-3 bg-gray-50 rounded-lg border border-gray-200 space-y-2 text-sm">
                  <p>
                    <span className="font-medium">To:</span> corporate@gymbios.com
                  </p>
                  <p>
                    <span className="font-medium">Subject:</span> Transaction Summary for {selectedMember.name} (
                    {selectedMember.id})
                  </p>
                  <p>
                    <span className="font-medium">Attachments:</span>{' '}
                    {mailCorporateForm.attachPDFs ? `${transactionsData.length} PDFs` : 'None'}
                  </p>
                  <Separator className="my-2" />
                  <p className="text-gray-600 italic">
                    This email contains {mailCorporateForm.includeAll ? 'all' : 'membership-only'} transaction
                    records
                    {mailCorporateForm.dateFrom && mailCorporateForm.dateTo
                      ? ` from ${mailCorporateForm.dateFrom} to ${mailCorporateForm.dateTo}`
                      : ''}
                    .
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsMailCorporateModalOpen(false);
                setMailCorporateForm({
                  dateFrom: '',
                  dateTo: '',
                  includeAll: true,
                  includeMembershipOnly: false,
                  attachPDFs: true,
                });
              }}
            >
              Cancel
            </Button>
            <Button
              className="btn-primary"
              onClick={() => {
                toast.success('Email sent to corporate successfully!', {
                  description: `${transactionsData.length} transactions with ${
                    mailCorporateForm.attachPDFs ? 'PDF attachments' : 'no attachments'
                  }`,
                });
                setIsMailCorporateModalOpen(false);
                setMailCorporateForm({
                  dateFrom: '',
                  dateTo: '',
                  includeAll: true,
                  includeMembershipOnly: false,
                  attachPDFs: true,
                });
              }}
            >
              <Send className="h-4 w-4 mr-2" />
              Send Mail to Corporate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deactivate Membership Modal */}
      <Dialog open={isDeactivateModalOpen} onOpenChange={setIsDeactivateModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2 text-red-600">
              <UserX className="h-5 w-5" />
              <span>Deactivate Membership</span>
            </DialogTitle>
            <DialogDescription>
              Temporarily or permanently discontinue this member's active plan
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Effective Date */}
            <div>
              <Label htmlFor="effectiveDate" className="text-sm font-medium text-gray-700 mb-2 block">
                ðŸ—“ï¸ Effective Date
              </Label>
              <Input
                id="effectiveDate"
                type="date"
                value={deactivateForm.effectiveDate}
                onChange={(e) => setDeactivateForm({ ...deactivateForm, effectiveDate: e.target.value })}
              />
              <p className="text-xs text-gray-500 mt-1">Default: Today</p>
            </div>

            {/* Reason */}
            <div>
              <Label htmlFor="reason" className="text-sm font-medium text-gray-700 mb-2 block">
                ðŸ“ Reason for Deactivation (optional)
              </Label>
              <Textarea
                id="reason"
                placeholder="Enter reason for deactivation..."
                rows={3}
                value={deactivateForm.reason}
                onChange={(e) => setDeactivateForm({ ...deactivateForm, reason: e.target.value })}
              />
            </div>

            {/* Refund Section */}
            <Card className="border-orange-200 bg-orange-50">
              <CardContent className="p-4 space-y-3">
                <h4 className="font-semibold text-orange-900 flex items-center">
                  <DollarSign className="h-4 w-4 mr-2" />
                  Refund Details
                </h4>

                <div className="grid grid-cols-2 gap-4">
                  {/* Refund Amount */}
                  <div>
                    <Label htmlFor="refundAmount" className="text-sm font-medium text-orange-800 mb-2 block">
                      ðŸ’° Refund Amount (AED)
                    </Label>
                    <Input
                      id="refundAmount"
                      type="number"
                      placeholder="0"
                      value={deactivateForm.refundAmount}
                      onChange={(e) => setDeactivateForm({ ...deactivateForm, refundAmount: Number(e.target.value) })}
                      className="bg-white"
                    />
                  </div>

                  {/* Refund Mode */}
                  <div>
                    <Label htmlFor="refundMode" className="text-sm font-medium text-orange-800 mb-2 block">
                      ðŸ§¾ Refund Mode
                    </Label>
                    <Select value={deactivateForm.refundMode} onValueChange={(value) => setDeactivateForm({ ...deactivateForm, refundMode: value })}>
                      <SelectTrigger className="bg-white">
                        <SelectValue placeholder="Select mode" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">Cash</SelectItem>
                        <SelectItem value="card">Card</SelectItem>
                        <SelectItem value="wallet">Wallet</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Return Plan Checkbox */}
                <div className="flex items-start space-x-3">
                  <Checkbox
                    id="returnPlan"
                    checked={deactivateForm.returnPlan}
                    onCheckedChange={(checked) => setDeactivateForm({ ...deactivateForm, returnPlan: checked as boolean })}
                  />
                  <Label htmlFor="returnPlan" className="text-sm text-orange-900 cursor-pointer">
                    ðŸ“¦ Return purchased plan and process full/partial refund
                  </Label>
                </div>
              </CardContent>
            </Card>

            {/* Member Stats Summary */}
            <Card className="border-primary/20 bg-gradient-light">
              <CardContent className="p-4">
                <h4 className="font-semibold text-gray-900 mb-3">Current Membership Summary</h4>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-gray-600">Plan</p>
                    <p className="font-semibold">{selectedMember.currentPlan}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Days Remaining</p>
                    <p className="font-semibold text-orange-600">118 days</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Total Paid</p>
                    <p className="font-semibold text-green-600">AED 1,800</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Confirmation */}
            <div className="flex items-start space-x-3 p-4 bg-red-50 rounded-lg border border-red-200">
              <Checkbox
                id="confirmDeactivation"
                checked={deactivateForm.confirmDeactivation}
                onCheckedChange={(checked) => setDeactivateForm({ ...deactivateForm, confirmDeactivation: checked as boolean })}
              />
              <Label htmlFor="confirmDeactivation" className="text-sm text-red-900 cursor-pointer">
                âœ… Confirm deactivation of this member's plan. This action will mark the membership as inactive{deactivateForm.refundAmount > 0 ? ` and process a refund of AED ${deactivateForm.refundAmount}` : ''}.
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsDeactivateModalOpen(false);
                setDeactivateForm({
                  effectiveDate: new Date().toISOString().split('T')[0],
                  reason: '',
                  refundAmount: 0,
                  refundMode: 'cash',
                  returnPlan: false,
                  confirmDeactivation: false,
                });
              }}
            >
              Cancel
            </Button>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white"
              disabled={!deactivateForm.confirmDeactivation}
              onClick={() => {
                toast.success('Membership deactivated successfully!', {
                  description: deactivateForm.refundAmount > 0 
                    ? `Refund of AED ${deactivateForm.refundAmount} processed via ${deactivateForm.refundMode}`
                    : 'Member plan has been deactivated',
                });
                setIsDeactivateModalOpen(false);
                setDeactivateForm({
                  effectiveDate: new Date().toISOString().split('T')[0],
                  reason: '',
                  refundAmount: 0,
                  refundMode: 'cash',
                  returnPlan: false,
                  confirmDeactivation: false,
                });
              }}
            >
              <UserX className="h-4 w-4 mr-2" />
              Deactivate Membership
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Freeze / Unfreeze Membership Dialog */}
      <Dialog open={isFreezeDialogOpen} onOpenChange={setIsFreezeDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2 text-[#2B7A78]">
              <Snowflake className="h-5 w-5" />
              <span>Freeze / Unfreeze Membership</span>
            </DialogTitle>
            <DialogDescription>
              Temporarily pause this member's membership with plan-based limits
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Member Info Card */}
            <Card className="border-[#2B7A78]/20 bg-[#DFF5F4]/30">
              <CardContent className="p-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-gray-600">Member Name</p>
                    <p className="font-semibold">{selectedMember.name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600">Member ID</p>
                    <p className="font-semibold font-mono">{selectedMember.id}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600">Current Plan</p>
                    <p className="font-semibold text-[#2B7A78]">{selectedMember.currentPlan}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600">Status</p>
                    <Badge className="bg-green-100 text-green-700">
                      {selectedMember.status === 'active' ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Freeze Limits Info */}
            <Card className="border-[#2B7A78]/20">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Freeze Policy Limits</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-gray-600">Maximum Freeze Days</p>
                    <p className="font-bold text-[#2B7A78]">60 days</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600">Days Used</p>
                    <p className="font-bold text-orange-600">0 days</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600">Freeze Occurrences Allowed</p>
                    <p className="font-bold text-[#2B7A78]">2 times</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600">Freezes Used</p>
                    <p className="font-bold text-orange-600">0 times</p>
                  </div>
                </div>
                <div className="pt-2 border-t border-[#2B7A78]/20">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-600">Balance Days Remaining</p>
                    <p className="font-bold text-green-600">60 days</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Freeze Action */}
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Freeze Start Date *</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full justify-start text-left"
                      >
                        <Calendar className="mr-2 h-4 w-4" />
                        Select date
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarComponent
                        mode="single"
                        disabled={(date) => date < new Date()}
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-2">
                  <Label>Freeze End Date *</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full justify-start text-left"
                      >
                        <Calendar className="mr-2 h-4 w-4" />
                        Select date
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarComponent
                        mode="single"
                        disabled={(date) => date < new Date()}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              {/* Auto Unfreeze Toggle */}
              <div className="flex items-center justify-between p-4 border border-[#2B7A78]/20 rounded-lg bg-[#F9FAFB]">
                <div>
                  <Label className="text-sm font-medium">Auto Unfreeze on End Date</Label>
                  <p className="text-xs text-gray-600 mt-1">
                    Automatically reactivate membership when freeze period ends
                  </p>
                </div>
                <Switch defaultChecked={true} />
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <Label>Notes (Optional)</Label>
                <Textarea
                  placeholder="Add reason or notes for this freeze..."
                  rows={3}
                />
              </div>

              {/* Info Alert */}
              <Card className="border-blue-200 bg-blue-50">
                <CardContent className="p-3">
                  <div className="flex items-start space-x-2">
                    <AlertCircle className="h-4 w-4 text-blue-600 mt-0.5" />
                    <div className="text-xs text-blue-900">
                      <p className="font-medium mb-1">Freeze Policy Information</p>
                      <ul className="list-disc list-inside space-y-0.5 text-blue-800">
                        <li>This plan allows up to 60 days of freeze</li>
                        <li>No charges for freeze days within the limit</li>
                        <li>Additional days will be charged at AED 10/day</li>
                        <li>Member can freeze membership up to 2 times during the plan period</li>
                      </ul>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setIsFreezeDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              className="bg-[#E63946] hover:bg-[#d12935] text-white"
              onClick={() => {
                toast.success('Membership frozen successfully', {
                  description: 'Member will receive notification via Email, SMS & WhatsApp',
                });
                setIsFreezeDialogOpen(false);
              }}
            >
              <Snowflake className="h-4 w-4 mr-2" />
              Freeze Membership
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

