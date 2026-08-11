const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export type UserRole = 'OWNER' | 'TENANT' | 'TECHNICIAN' | 'ADMIN';

export type AuthUser = {
  id: string;
  email: string;
  role: UserRole;
};

export type LoginResponse = {
  accessToken: string;
  user: AuthUser;
};

async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string | null,
): Promise<T> {
  const headers = new Headers(options.headers);
  const isForm = typeof FormData !== 'undefined' && options.body instanceof FormData;
  if (!isForm && !headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = (await res.json()) as { message?: string | string[] };
      if (Array.isArray(data.message)) message = data.message.join(', ');
      else if (data.message) message = data.message;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

function jsonBody(data: unknown) {
  return JSON.stringify(data);
}

export const api = {
  // Auth
  login(email: string, password: string) {
    return request<LoginResponse>('/auth/login', {
      method: 'POST',
      body: jsonBody({ email, password }),
    });
  },
  register(payload: {
    email: string;
    password: string;
    role: 'OWNER' | 'TENANT' | 'TECHNICIAN';
    firstName: string;
    lastName: string;
    phone?: string;
  }) {
    return request<LoginResponse>('/auth/register', {
      method: 'POST',
      body: jsonBody(payload),
    });
  },
  me(token: string) {
    return request<AuthUser>('/auth/me', {}, token);
  },

  // Dashboard
  overview(token: string) {
    return request<any>('/dashboard/overview', {}, token);
  },
  dashboardExpenses(token: string) {
    return request<any>('/dashboard/expenses', {}, token);
  },
  dashboardMaintenance(token: string, trend = 'month') {
    return request<any>(`/dashboard/maintenance?trend=${trend}`, {}, token);
  },

  // Properties / units
  listProperties(token: string) {
    return request<any[]>('/properties', {}, token);
  },
  getProperty(token: string, id: string) {
    return request<any>(`/properties/${id}`, {}, token);
  },
  createProperty(token: string, body: Record<string, unknown>) {
    return request<any>('/properties', { method: 'POST', body: jsonBody(body) }, token);
  },
  updateProperty(token: string, id: string, body: Record<string, unknown>) {
    return request<any>(`/properties/${id}`, { method: 'PATCH', body: jsonBody(body) }, token);
  },
  deactivateProperty(token: string, id: string) {
    return request<any>(`/properties/${id}`, { method: 'DELETE' }, token);
  },
  listUnits(token: string, propertyId: string) {
    return request<any[]>(`/properties/${propertyId}/units`, {}, token);
  },
  createUnit(token: string, propertyId: string, body: Record<string, unknown>) {
    return request<any>(
      `/properties/${propertyId}/units`,
      { method: 'POST', body: jsonBody(body) },
      token,
    );
  },
  updateUnit(
    token: string,
    propertyId: string,
    unitId: string,
    body: Record<string, unknown>,
  ) {
    return request<any>(
      `/properties/${propertyId}/units/${unitId}`,
      { method: 'PATCH', body: jsonBody(body) },
      token,
    );
  },
  deactivateUnit(token: string, propertyId: string, unitId: string) {
    return request<any>(
      `/properties/${propertyId}/units/${unitId}`,
      { method: 'DELETE' },
      token,
    );
  },

  // Tenants / leases
  listTenants(token: string) {
    return request<any[]>('/tenants', {}, token);
  },
  getTenant(token: string, id: string) {
    return request<any>(`/tenants/${id}`, {}, token);
  },
  lookupTenantByEmail(token: string, email: string) {
    return request<any>(
      `/tenants/lookup?email=${encodeURIComponent(email)}`,
      {},
      token,
    );
  },
  tenantResidence(token: string, id: string) {
    return request<any>(`/tenants/${id}/current-residence`, {}, token);
  },
  createLease(token: string, body: Record<string, unknown>) {
    return request<any>('/leases', { method: 'POST', body: jsonBody(body) }, token);
  },
  currentLeaseForUnit(token: string, unitId: string) {
    return request<any>(`/leases/unit/${unitId}/current`, {}, token);
  },
  terminateLease(token: string, id: string, endDate?: string) {
    return request<any>(
      `/leases/${id}/terminate`,
      { method: 'POST', body: jsonBody(endDate ? { endDate } : {}) },
      token,
    );
  },

  // Maintenance
  createMaintenance(token: string, body: Record<string, unknown>) {
    return request<any>(
      '/maintenance-requests',
      { method: 'POST', body: jsonBody(body) },
      token,
    );
  },
  myMaintenance(token: string) {
    return request<any[]>('/maintenance-requests/mine', {}, token);
  },
  ownerMaintenance(token: string) {
    return request<any[]>('/maintenance-requests/owner', {}, token);
  },
  getMaintenance(token: string, id: string) {
    return request<any>(`/maintenance-requests/${id}`, {}, token);
  },
  updateMaintenanceOwner(token: string, id: string, body: Record<string, unknown>) {
    return request<any>(
      `/maintenance-requests/${id}/owner`,
      { method: 'PATCH', body: jsonBody(body) },
      token,
    );
  },
  updateMaintenanceTenant(token: string, id: string, body: Record<string, unknown>) {
    return request<any>(
      `/maintenance-requests/${id}/tenant`,
      { method: 'PATCH', body: jsonBody(body) },
      token,
    );
  },
  cancelMaintenance(token: string, id: string) {
    return request<any>(`/maintenance-requests/${id}/cancel`, { method: 'POST' }, token);
  },
  listAttachments(token: string, id: string) {
    return request<any[]>(`/maintenance-requests/${id}/attachments`, {}, token);
  },
  uploadAttachment(token: string, id: string, file: File) {
    const form = new FormData();
    form.append('file', file);
    return request<any>(
      `/maintenance-requests/${id}/attachments`,
      { method: 'POST', body: form },
      token,
    );
  },
  getAttachmentUrl(token: string, requestId: string, attachmentId: string) {
    return request<{ url: string }>(
      `/maintenance-requests/${requestId}/attachments/${attachmentId}`,
      {},
      token,
    );
  },
  deleteAttachment(token: string, requestId: string, attachmentId: string) {
    return request<any>(
      `/maintenance-requests/${requestId}/attachments/${attachmentId}`,
      { method: 'DELETE' },
      token,
    );
  },

  // Assignments / technicians
  listTechnicians(token: string) {
    return request<any[]>('/technicians', {}, token);
  },
  technicianMe(token: string) {
    return request<any>('/technicians/me', {}, token);
  },
  updateTechnicianAvailability(
    token: string,
    id: string,
    availability: string,
  ) {
    return request<any>(
      `/technicians/${id}/availability`,
      { method: 'PATCH', body: jsonBody({ availability }) },
      token,
    );
  },
  setTechnicianActive(token: string, id: string, isActive: boolean) {
    return request<any>(
      `/technicians/${id}/active`,
      { method: 'PATCH', body: jsonBody({ isActive }) },
      token,
    );
  },
  assignTechnician(token: string, requestId: string, technicianId: string) {
    return request<any>(
      `/maintenance-requests/${requestId}/assignments`,
      { method: 'POST', body: jsonBody({ technicianId }) },
      token,
    );
  },
  reassignTechnician(token: string, requestId: string, technicianId: string) {
    return request<any>(
      `/maintenance-requests/${requestId}/assignments/reassign`,
      { method: 'POST', body: jsonBody({ technicianId }) },
      token,
    );
  },
  assignmentHistory(token: string, requestId: string) {
    return request<any[]>(`/maintenance-requests/${requestId}/assignments`, {}, token);
  },
  closeRequest(token: string, requestId: string) {
    return request<any>(
      `/maintenance-requests/${requestId}/close`,
      { method: 'POST' },
      token,
    );
  },
  myAssignments(token: string) {
    return request<any[]>('/assignments/mine', {}, token);
  },
  getAssignment(token: string, id: string) {
    return request<any>(`/assignments/${id}`, {}, token);
  },
  startAssignment(token: string, id: string) {
    return request<any>(`/assignments/${id}/start`, { method: 'POST' }, token);
  },
  completeAssignment(token: string, id: string, body: Record<string, unknown>) {
    return request<any>(
      `/assignments/${id}/complete`,
      { method: 'POST', body: jsonBody(body) },
      token,
    );
  },
  uploadCompletionImage(token: string, id: string, file: File, kind?: string) {
    const form = new FormData();
    form.append('file', file);
    if (kind) form.append('kind', kind);
    return request<any>(
      `/assignments/${id}/attachments`,
      { method: 'POST', body: form },
      token,
    );
  },

  // Expenses
  createExpense(token: string, requestId: string, body: Record<string, unknown>) {
    return request<any>(
      `/maintenance-requests/${requestId}/expenses`,
      { method: 'POST', body: jsonBody(body) },
      token,
    );
  },
  listRequestExpenses(token: string, requestId: string) {
    return request<any[]>(`/maintenance-requests/${requestId}/expenses`, {}, token);
  },
  expenseTotals(token: string, requestId: string) {
    return request<any>(`/maintenance-requests/${requestId}/expense-totals`, {}, token);
  },
  listOwnerExpenses(token: string, status?: string) {
    const q = status ? `?status=${status}` : '';
    return request<any[]>(`/expenses${q}`, {}, token);
  },
  approveExpense(token: string, id: string, reviewNote?: string) {
    return request<any>(
      `/expenses/${id}/approve`,
      { method: 'POST', body: jsonBody({ reviewNote }) },
      token,
    );
  },
  rejectExpense(token: string, id: string, reviewNote?: string) {
    return request<any>(
      `/expenses/${id}/reject`,
      { method: 'POST', body: jsonBody({ reviewNote }) },
      token,
    );
  },
  uploadExpenseReceipt(token: string, id: string, file: File) {
    const form = new FormData();
    form.append('file', file);
    return request<any>(`/expenses/${id}/receipt`, { method: 'POST', body: form }, token);
  },
  getExpenseReceipt(token: string, id: string) {
    return request<{ url: string }>(`/expenses/${id}/receipt`, {}, token);
  },
  createExpenseAdjustment(
    token: string,
    id: string,
    body: Record<string, unknown>,
  ) {
    return request<any>(
      `/expenses/${id}/adjustments`,
      { method: 'POST', body: jsonBody(body) },
      token,
    );
  },

  // AI
  analyzeText(token: string, id: string) {
    return request<any>(`/ai/maintenance-requests/${id}/analyze`, { method: 'POST' }, token);
  },
  analyzeCombined(token: string, id: string, attachmentId: string) {
    return request<any>(
      `/ai/maintenance-requests/${id}/attachments/${attachmentId}/analyze-combined`,
      { method: 'POST' },
      token,
    );
  },
  listAnalyses(token: string, id: string) {
    return request<any[]>(`/ai/maintenance-requests/${id}/analyses`, {}, token);
  },
  submitAiFeedback(token: string, analysisId: string, body: Record<string, unknown>) {
    return request<any>(
      `/ai/analyses/${analysisId}/feedback`,
      { method: 'POST', body: jsonBody(body) },
      token,
    );
  },
  aiInsights(token: string) {
    return request<any>('/ai/insights', {}, token);
  },
  aiPerformance(token: string) {
    return request<any>('/ai/performance', {}, token);
  },

  // Notifications / activity
  notifications(token: string, unreadOnly = false) {
    const q = unreadOnly ? '?unreadOnly=true' : '';
    return request<any[]>(`/notifications${q}`, {}, token);
  },
  unreadCount(token: string) {
    return request<{ count: number }>('/notifications/unread-count', {}, token);
  },
  markNotificationRead(token: string, id: string) {
    return request<any>(`/notifications/${id}/read`, { method: 'PATCH' }, token);
  },
  markAllNotificationsRead(token: string) {
    return request<any>('/notifications/read-all', { method: 'PATCH' }, token);
  },
  activityMine(token: string) {
    return request<any[]>('/activity/mine', {}, token);
  },
  maintenanceTimeline(token: string, id: string) {
    return request<any[]>(`/activity/timeline/MaintenanceRequest/${id}`, {}, token);
  },
};
