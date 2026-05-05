import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    User, Mail, Phone, MapPin, Building, Shield,
    Bell, Settings, LogOut, Camera, Edit2,
    TrendingUp, Award, Clock, Target, Lock,
    CheckCircle, UserCircle, BarChart2, List, CreditCard, Save, X, Maximize2,
    Construction
} from 'lucide-react';
import { getUserProfile, updateUserProfile, changePassword, logout } from '../api/auth';
import { getImageUrl } from '../utils/urlUtils';
import toast from 'react-hot-toast';

const MyProfile = () => {
    const [activeTab, setActiveTab] = useState('Personal');
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    // Edit Mode States
    const [isEditing, setIsEditing] = useState(false);
    const [editForm, setEditForm] = useState({});
    const [previewImage, setPreviewImage] = useState(null);
    const fileInputRef = useRef(null);

    // Password Change State
    const [passForm, setPassForm] = useState({ current: '', new: '', confirm: '' });

    // Photo Viewer State
    const [showPhoto, setShowPhoto] = useState(false);

    useEffect(() => {
        const loadData = async () => {
            try {
                const data = await getUserProfile();
                setProfile(data);
                setEditForm(data); // Init form
            } catch (error) {
                console.error("Failed to fetch profile", error);
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, []);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setEditForm(prev => ({ ...prev, [name]: value }));
    };

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setEditForm(prev => ({ ...prev, file: file }));
            setPreviewImage(URL.createObjectURL(file));
        }
    };

    const handleSave = async () => {
        setLoading(true);
        try {
            const formData = new FormData();
            formData.append('fullName', editForm.fullName || '');
            formData.append('email', editForm.email || '');
            formData.append('phone', editForm.phone || '');
            formData.append('address', editForm.address || '');
            if (editForm.file) {
                formData.append('avatar', editForm.file);
            }

            const updated = await updateUserProfile(formData);
            setProfile(updated);
            setIsEditing(false);
            setPreviewImage(null);
            toast.success("Profile updated successfully!");
        } catch (error) {
            console.error("Failed to update profile", error);
            toast.error("Failed to update profile. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    const handleCancel = () => {
        setIsEditing(false);
        setEditForm(profile);
        setPreviewImage(null);
    };

    const handlePassChange = (e) => {
        const { name, value } = e.target;
        setPassForm(prev => ({ ...prev, [name]: value }));
    };

    const handlePasswordSubmit = async () => {
        if (!passForm.current || !passForm.new || !passForm.confirm) {
            toast.error("Please fill in all password fields.");
            return;
        }
        if (passForm.new !== passForm.confirm) {
            toast.error("New passwords do not match.");
            return;
        }

        setLoading(true);
        try {
            await changePassword({
                currentPassword: passForm.current,
                newPassword: passForm.new
            });
            toast.success("Password changed successfully!");
            setPassForm({ current: '', new: '', confirm: '' });
        } catch (error) {
            console.error("Failed to change password", error);
            toast.error("Failed to change password. Please check your current password.");
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const TABS = [
        { id: 'Personal', icon: <UserCircle className="h-4 w-4" /> },
        { id: 'Performance', icon: <BarChart2 className="h-4 w-4" /> },
        { id: 'Targets', icon: <Target className="h-4 w-4" /> },
        { id: 'Transactions', icon: <CreditCard className="h-4 w-4" /> },
        { id: 'Settings', icon: <Settings className="h-4 w-4" /> }
    ];

    if (loading && !profile) {
        return (
            <div className="min-h-screen bg-[#F7F7FA] p-4 flex items-center justify-center text-slate-500 text-sm">
                Loading Profile...
            </div>
        );
    }

    // Use preview or current or default
    const currentAvatar = previewImage
        || (profile?.avatarUrl ? getImageUrl(profile.avatarUrl) : null)
        || "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?ixlib=rb-4.0.3&auto=format&fit=facearea&facepad=2&w=300&h=300&q=80";

    const displayUser = {
        name: profile?.fullName || profile?.username || "User",
        role: profile?.jobTitle || profile?.role || "Staff Member",
        dept: profile?.department || "General",
        id: profile?.employeeId || "EMP---",
        email: profile?.email || "No Email",
        phone: profile?.phone || "No Phone",
        address: profile?.address || "No Address",
        joinDate: profile?.joinDate
            ? new Date(profile.joinDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
            : "N/A"
    };

    return (
        <div className="min-h-screen bg-[#F7F7FA] p-4 lg:p-6 font-sans text-slate-900">
            {/* Header - Compact */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-5">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 tracking-tight">My Profile</h1>
                    <p className="text-xs text-slate-500 mt-0.5">Manage your personal information, targets, performance, and account settings</p>
                </div>
                <div className="flex items-center gap-2">
                    <button className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors shadow-sm">
                        <Bell className="h-3.5 w-3.5" /> Notifications
                    </button>

                    <button
                        onClick={handleLogout}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 hover:bg-red-50 hover:text-red-600 hover:border-red-100 transition-colors shadow-sm"
                    >
                        <LogOut className="h-3.5 w-3.5" /> Sign Out
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">

                {/* LEFT COLUMN - Profile Summary */}
                <div className="xl:col-span-4 space-y-5">

                    {/* Profile Card - Compact */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 text-center relative overflow-hidden">
                        <div className="relative inline-block mb-3 group">
                            <div
                                onClick={() => setShowPhoto(true)}
                                className="h-20 w-20 rounded-full p-1 border-2 border-slate-100 bg-white mx-auto shadow-sm cursor-pointer hover:border-[#F5C742] transition-colors relative"
                            >
                                <img src={currentAvatar} alt="Profile" className="h-full w-full rounded-full object-cover" />
                                <div className="absolute inset-0 rounded-full bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                                    <Maximize2 className="h-4 w-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                                </div>
                            </div>

                            {isEditing && (
                                <>
                                    <input
                                        type="file"
                                        ref={fileInputRef}
                                        onChange={handleFileChange}
                                        className="hidden"
                                        accept="image/*"
                                    />
                                    <button
                                        onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                                        className="absolute bottom-0 right-0 p-1.5 bg-[#F5C742] text-slate-900 rounded-full hover:bg-[#dfb53d] transition-colors border-[2px] border-white shadow-sm cursor-pointer z-10"
                                    >
                                        <Camera className="h-3 w-3" />
                                    </button>
                                </>
                            )}
                        </div>

                        <h2 className="text-xl font-bold text-slate-900 mb-0.5">{displayUser.name}</h2>
                        <div className="inline-block bg-[#F5C742]/10 text-[#B4860B] px-2.5 py-0.5 rounded-full text-[10px] font-bold mb-2 border border-[#F5C742]/20">
                            {displayUser.role}
                        </div>
                        <p className="text-slate-500 text-xs mb-4">{displayUser.dept}</p>

                        <div className="inline-flex items-center px-3 py-1 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold border border-slate-200 mb-5 uppercase tracking-wide">
                            Premium Staff
                        </div>

                        <div className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-4">
                            <div className="text-center">
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">Employee ID</p>
                                <p className="text-xs font-bold text-slate-900">{displayUser.id}</p>
                            </div>
                            <div className="text-center border-l border-slate-100">
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">Join Date</p>
                                <p className="text-xs font-bold text-slate-900">{displayUser.joinDate}</p>
                            </div>
                        </div>
                    </div>

                    {/* Achievements - COMING SOON */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 relative overflow-hidden">
                        <h3 className="flex items-center gap-2 font-bold text-slate-900 mb-4 text-sm opacity-50">
                            <Award className="h-4 w-4 text-amber-500" /> Recent Achievements
                        </h3>

                        {/* Blur / Coming Soon Overlay */}
                        <div className="absolute inset-0 bg-white/60 backdrop-blur-[2px] z-10 flex flex-col items-center justify-center">
                            <div className="px-4 py-2 bg-[#F5C742] text-slate-900 rounded-full text-xs font-bold flex items-center gap-2 shadow-lg">
                                <Clock className="h-3.5 w-3.5" /> Coming Soon
                            </div>
                        </div>

                        <div className="space-y-3 opacity-30 select-none pointer-events-none filter blur-[1px]">
                            <div className="flex items-start gap-3 p-3 bg-emerald-50/50 rounded-lg border border-emerald-100/50">
                                <div className="p-1.5 bg-emerald-100 text-emerald-700 rounded-full flex-shrink-0"><Award className="h-4 w-4" /></div>
                                <div><h4 className="text-xs font-bold text-slate-900">Top Performer</h4><p className="text-[10px] text-slate-500 mt-0.5">Achieved 95%+ performance score</p></div>
                            </div>
                            <div className="flex items-start gap-3 p-3 bg-slate-50/50 rounded-lg border border-slate-100/50">
                                <div className="p-1.5 bg-slate-200 text-slate-600 rounded-full flex-shrink-0"><CheckCircle className="h-4 w-4" /></div>
                                <div><h4 className="text-xs font-bold text-slate-900">Perfect Attendance</h4><p className="text-[10px] text-slate-500 mt-0.5">100% attendance for quarter</p></div>
                            </div>
                            <button className="w-full py-2.5 text-xs font-bold text-slate-600 border border-slate-200 rounded-lg mt-2">View All Achievements</button>
                        </div>
                    </div>
                </div>

                {/* RIGHT COLUMN */}
                <div className="xl:col-span-8 space-y-5">
                    {/* Tabs */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-1.5 flex overflow-x-auto gap-1.5">
                        {TABS.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex items-center justify-center gap-1.5 flex-1 min-w-[100px] py-2.5 text-xs font-bold rounded-lg transition-all
                                    ${activeTab === tab.id ? 'bg-white shadow text-slate-900 ring-1 ring-black/5' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}
                                `}
                            >
                                {tab.icon} {tab.id}
                            </button>
                        ))}
                    </div>

                    {/* Tab Content */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 md:p-8 min-h-[450px]">

                        {activeTab === 'Personal' ? (
                            <>
                                <div className="flex items-center justify-between mb-6">
                                    <h3 className="text-lg font-bold text-slate-900 text-[#0F172A]/90">Personal Information</h3>

                                    {!isEditing ? (
                                        <button
                                            onClick={() => setIsEditing(true)}
                                            className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-50 transition-colors shadow-sm"
                                        >
                                            <Edit2 className="h-3.5 w-3.5" /> Edit
                                        </button>
                                    ) : (
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={handleCancel}
                                                className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-50 transition-colors"
                                            >
                                                <X className="h-3.5 w-3.5" /> Cancel
                                            </button>
                                            <button
                                                onClick={handleSave}
                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#F5C742] text-slate-900 text-xs font-bold rounded-lg hover:bg-[#dfb53d] transition-colors shadow-sm"
                                            >
                                                <Save className="h-3.5 w-3.5" /> Save
                                            </button>
                                        </div>
                                    )}
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-6 mb-8">
                                    {/* Full Name */}
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide ml-1">Full Name</label>
                                        {isEditing ? (
                                            <input
                                                type="text"
                                                name="fullName"
                                                value={editForm.fullName || ''}
                                                onChange={handleInputChange}
                                                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-semibold text-sm focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 outline-none"
                                            />
                                        ) : (
                                            <div className="p-2.5 bg-slate-50/50 border border-slate-200 rounded-lg text-slate-900 font-semibold text-sm">
                                                {displayUser.name}
                                            </div>
                                        )}
                                    </div>

                                    {/* Email */}
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide ml-1">Email Address</label>
                                        {isEditing ? (
                                            <input
                                                type="email"
                                                name="email"
                                                value={editForm.email || ''}
                                                onChange={handleInputChange}
                                                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-semibold text-sm focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 outline-none"
                                            />
                                        ) : (
                                            <div className="p-2.5 bg-slate-50/50 border border-slate-200 rounded-lg text-slate-900 font-semibold text-sm flex items-center gap-2">
                                                <Mail className="h-3.5 w-3.5 text-emerald-500" /> {displayUser.email}
                                            </div>
                                        )}
                                    </div>

                                    {/* Phone */}
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide ml-1">Phone Number</label>
                                        {isEditing ? (
                                            <input
                                                type="tel"
                                                name="phone"
                                                value={editForm.phone || ''}
                                                onChange={handleInputChange}
                                                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-semibold text-sm focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 outline-none"
                                            />
                                        ) : (
                                            <div className="p-2.5 bg-slate-50/50 border border-slate-200 rounded-lg text-slate-900 font-semibold text-sm flex items-center gap-2">
                                                <Phone className="h-3.5 w-3.5 text-emerald-500" /> {displayUser.phone}
                                            </div>
                                        )}
                                    </div>

                                    {/* Address */}
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide ml-1">Address</label>
                                        {isEditing ? (
                                            <input
                                                type="text"
                                                name="address"
                                                value={editForm.address || ''}
                                                onChange={handleInputChange}
                                                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-semibold text-sm focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 outline-none"
                                            />
                                        ) : (
                                            <div className="p-2.5 bg-slate-50/50 border border-slate-200 rounded-lg text-slate-900 font-semibold text-sm flex items-center gap-2">
                                                <MapPin className="h-3.5 w-3.5 text-emerald-500" /> {displayUser.address}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="h-px bg-slate-100 mb-8 w-full"></div>

                                {/* Password Change */}
                                <div className="mb-6">
                                    <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                                        <Lock className="h-4 w-4 text-slate-400" /> Change Password
                                    </h3>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-6">
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide ml-1">Current Password</label>
                                        <input
                                            type="password"
                                            name="current"
                                            value={passForm.current}
                                            onChange={handlePassChange}
                                            placeholder="Current password"
                                            className="w-full p-2.5 bg-white border border-slate-200 rounded-lg text-slate-900 text-sm focus:ring-2 focus:ring-[#F5C742] outline-none transition-all placeholder:text-slate-300"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide ml-1">New Password</label>
                                        <input
                                            type="password"
                                            name="new"
                                            value={passForm.new}
                                            onChange={handlePassChange}
                                            placeholder="New password"
                                            className="w-full p-2.5 bg-white border border-slate-200 rounded-lg text-slate-900 text-sm focus:ring-2 focus:ring-[#F5C742] outline-none transition-all placeholder:text-slate-300"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide ml-1">Confirm Password</label>
                                        <div className="relative">
                                            <input
                                                type="password"
                                                name="confirm"
                                                value={passForm.confirm}
                                                onChange={handlePassChange}
                                                placeholder="Confirm new password"
                                                className="w-full p-2.5 bg-white border border-slate-200 rounded-lg text-slate-900 text-sm focus:ring-2 focus:ring-[#F5C742] outline-none transition-all placeholder:text-slate-300"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-8">
                                    <button
                                        onClick={handlePasswordSubmit}
                                        className="px-6 py-2.5 bg-[#F5C742] text-slate-900 font-bold text-xs rounded-lg flex items-center gap-2 hover:bg-[#dfb53d] transition-colors shadow-sm cursor-pointer"
                                    >
                                        <Lock className="h-3.5 w-3.5" /> Change Password
                                    </button>
                                </div>
                            </>
                        ) : (
                            <div className="flex flex-col items-center justify-center py-20 text-center">
                                <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                                    <Construction className="h-8 w-8 text-slate-400" />
                                </div>
                                <h3 className="text-lg font-bold text-slate-900 mb-1">{activeTab}</h3>
                                <div className="px-4 py-1.5 bg-[#F5C742] text-slate-900 rounded-full text-xs font-bold shadow-sm inline-flex items-center gap-2 mt-2">
                                    Coming Soon
                                </div>
                                <p className="text-slate-500 text-xs max-w-xs mx-auto mt-4 leading-relaxed">
                                    We are working hard to bring you this feature. Stay tuned for updates!
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Photo Viewer Modal */}
            {showPhoto && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
                    onClick={() => setShowPhoto(false)}
                >
                    <div className="relative max-w-4xl max-h-[90vh] w-full flex items-center justify-center">
                        <img
                            src={currentAvatar}
                            alt="Profile Full View"
                            className="max-w-full max-h-[90vh] rounded-lg shadow-2xl border-4 border-white object-contain"
                            onClick={(e) => e.stopPropagation()} // Prevent close on image click
                        />
                        <button
                            onClick={() => setShowPhoto(false)}
                            className="absolute top-4 right-4 p-2 bg-white rounded-full text-slate-900 hover:bg-slate-100 transition-colors shadow-lg cursor-pointer"
                        >
                            <X className="h-6 w-6" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MyProfile;
