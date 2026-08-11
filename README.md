# PropSense AI

**PropSense AI** is an AI-powered property maintenance management platform that connects property owners, tenants, and technicians in one system. It combines property management, maintenance workflows, AI-powered issue analysis, expense tracking, notifications, and analytics.

## 🚀 Key Features

* 🔐 **Authentication & Authorization** — Secure login with role-based access for Admins, Owners, Tenants, and Technicians.
* 🏢 **Property Management** — Owners can manage multiple properties and their units.
* 👥 **Tenant & Lease Management** — Manage tenants, leases, occupancy, and property relationships.
* 🔧 **Maintenance Management** — Create, assign, track, and close maintenance requests.
* 🤖 **AI Maintenance Analysis** — Analyze maintenance descriptions and images using Gemini to identify issues, recommend priorities, suggest actions, and detect recurring problems.
* 👨‍🔧 **Technician Management** — Assign technicians, track workloads, and manage maintenance jobs.
* 💰 **Expense Management** — Track labor, materials, parts, services, and receipts with owner approval.
* 📷 **Image Storage** — Store maintenance images and receipts using Supabase Storage.
* 🔔 **Notifications** — Notify users about assignments, status changes, expenses, and other important events.
* 📋 **Activity History** — Maintain an audit trail of important system actions.
* 📊 **Dashboard & Analytics** — Monitor properties, maintenance activity, technician workload, costs, trends, and AI insights.

## 🔄 Main User Flow

### Tenant

```text
Login
  ↓
View Property / Lease
  ↓
Create Maintenance Request
  ↓
Upload Images
  ↓
Receive AI Analysis
  ↓
Track Request Status
  ↓
Receive Completion Notification
```

### Property Owner

```text
Login
  ↓
Dashboard
  ↓
Manage Properties & Units
  ↓
Manage Tenants & Leases
  ↓
Review Maintenance Request
  ↓
Review AI Analysis
  ↓
Assign Technician
  ↓
Review Expenses
  ↓
Approve / Reject Expenses
  ↓
Close Maintenance Request
```

### Technician

```text
Login
  ↓
View Assigned Requests
  ↓
Review Issue & AI Analysis
  ↓
Start Work
  ↓
Upload Completion Images
  ↓
Add Completion Notes
  ↓
Add Maintenance Expenses
  ↓
Complete Request
```

### AI Flow

```text
Maintenance Request
        ↓
Description + Image
        ↓
Gemini AI Analysis
        ↓
Category + Priority + Severity
        ↓
Possible Cause
        ↓
Recommended Action
        ↓
Recurring / Duplicate Issue Detection
        ↓
Human Review & Decision
```

### Complete Maintenance Lifecycle

```text
Tenant Reports Issue
        ↓
Maintenance Request Created
        ↓
AI Analysis
        ↓
Owner Reviews
        ↓
Technician Assigned
        ↓
Technician Starts Work
        ↓
Repair Completed
        ↓
Expenses Submitted
        ↓
Owner Approves Expenses
        ↓
Request Completed
        ↓
Request Closed
        ↓
Tenant Notified
```

## 🛠️ Technology

**Frontend:** React / Vite
**Backend:** NestJS / Node.js
**Database:** PostgreSQL / Prisma
**AI:** Google Gemini API
**Storage:** Supabase Storage

