import api from "./axiosConfig";

// Announcements BillBull sends from admin.billbull.app: the ones the signed-in user hasn't
// dismissed yet, and dismissing one (it then never pops up again for that user, on any device).
export const getPendingAnnouncements = () =>
  api.get("/api/platform-access/announcements/pending").then((r) => r.data);

export const markAnnouncementSeen = (id) =>
  api.post(`/api/platform-access/announcements/${id}/seen`).then((r) => r.data);
