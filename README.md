# ERPThrive — Enterprise Resource Planning

**ERPThrive** is an original, modular enterprise resource planning platform engineered for high structural reliability, strict separation of concerns, and sequential module advancement.

> **Project Governance Note**: This project is completely independent of any other ERP suite. It does not copy, reuse, or incorporate external proprietary assets, schemas, or credentials.

---

## Current Status: Module 1 — Administration & Identity Foundation

In accordance with the **Strict Single-Module Governance Protocol**, development advances one module at a time:
- **Module 0 (Approved)**: Application shell, responsive layout engine, accessibility tree, command jumper, and navigational router.
- **Module 1 (Active & Operational)**: Organization legal entity, multi-tenant company settings, branch facilities, least-privilege RBAC permission matrix, user memberships, append-only audit trail, and versioned PostgreSQL/Supabase schema migration with Row Level Security (RLS).
- **Modules 2 through 10 (Scheduled)**: Business modules (Master Data, Finance, Procurement, etc.) remain strictly unimplemented placeholders until formal review and authorization.
- **Zero Fabricated Data**: No fake revenue figures, synthetic transactions, simulated customer accounts, or mock employee profiles are rendered anywhere in the application.

---

## Module Delivery Roadmap

| Phase | Module Name | Status | Category | Scope Summary |
| :---: | :--- | :---: | :---: | :--- |
| **0** | **Dashboard** | **Active Shell** | Core | Foundation workspace overview, navigation hub, shell state. |
| **1** | **Administration** | **Active & Verified** | Management | Multi-company hierarchy, branch network, RBAC matrix, audit log, RLS schema. |
| **2** | Master Data | *Scheduled* | Core | Unified chart of accounts, customers, vendors, item catalog, tax. |
| **3** | Finance & Accounting | *Scheduled* | Management | General ledger, journal vouchers, AP/AR, bank reconciliation. |
| **4** | Procurement | *Scheduled* | Operations | Purchase requisitions, RFQs, purchase orders, 3-way matching. |
| **5** | Inventory | *Scheduled* | Operations | Multi-warehouse stock, FIFO valuation, bin tracking, cycle counts. |
| **6** | Sales & CRM | *Scheduled* | Operations | Lead pipeline, quotations, sales orders, dispatch, and invoices. |
| **7** | HRMS & Payroll | *Scheduled* | Management | Employee records, attendance, leaves, salary structures, payroll. |
| **8** | Imports & Logistics | *Scheduled* | Operations | Bills of lading, customs tariffs, landed cost, shipping tracking. |
| **9** | Reports | *Scheduled* | Management | Financial statements, inventory aging, spend analysis, report builder. |
| **10** | System Settings | *Scheduled* | Configuration | Fiscal years, numbering sequences, localization, API webhooks. |

---

## Technical Stack

- **Framework**: React 19 (Functional components, custom hooks, modular architecture)
- **Language**: TypeScript 5.8+ (Strict type enforcement, zero `any` shortcuts)
- **Styling**: Tailwind CSS v4 (`@tailwindcss/vite` integration, zero-pill discipline, tabular numerals)
- **Icons**: Lucide React (`lucide-react`)
- **Build Tool**: Vite 6+
- **Test Runner**: Node.js 22 built-in test runner (`tsx --test` / `node:test` + `node:assert/strict`)

---

## Getting Started & Available Scripts

### 1. Development Server
Launches the local Vite development server on port 3000:
```bash
npm run dev
```

### 2. Type-Checking & Linting
Runs the TypeScript compiler with `--noEmit` to verify type safety across all components and modules:
```bash
npm run lint
```

### 3. Automated Unit Testing
Executes pure logic tests using the native Node.js test runner:
```bash
npm test
```

### 4. Production Build
Generates optimized static assets in `/dist`:
```bash
npm run build
```

---

## Project Structure

```
├── .env.example                  # Environment variable reference (no secrets)
├── index.html                    # Application HTML entry point & font preconnect
├── metadata.json                 # AI Studio applet configuration and capabilities
├── package.json                  # Dependencies and execution scripts
├── tsconfig.json                 # Strict TypeScript configuration
├── vite.config.ts                # Vite plugin configuration
├── README.md                     # Setup, architecture, and project documentation
└── src/
    ├── main.tsx                  # React DOM root hydration
    ├── App.tsx                   # Top-level shell controller and URL hash synchronization
    ├── index.css                 # Base Tailwind imports and typography configuration
    ├── modules/
    │   ├── types.ts              # Module definitions, categories, and status unions
    │   ├── navigation.ts         # Navigation registry, category grouping, and status queries
    │   └── navigation.test.ts    # Unit tests for registry integrity and pure helpers
    └── components/
        ├── brand/
        │   └── Logo.tsx          # Original ERPThrive geometric hexagonal crest and wordmark
        ├── common/
        │   └── IconHelper.tsx    # Dynamic Lucide icon mapping utility
        ├── layout/
        │   ├── Header.tsx        # Top navigation bar (breadcrumbs, search trigger, roadmap)
        │   └── Sidebar.tsx       # Collapsible desktop sidebar and mobile navigation drawer
        ├── views/
        │   ├── DashboardView.tsx # Foundation dashboard view with neutral informational cards
        │   └── ModulePlaceholderView.tsx # Safe placeholder page for scheduled modules
        └── dialogs/
            ├── ModuleSearchModal.tsx # Command palette (⌘K / Ctrl+K) for quick navigation
            └── RoadmapModal.tsx  # Interactive 11-phase development roadmap modal
```

---

## Security and Compliance Guarantees

- **No Secrets or Hardcoded Keys**: API tokens and private credentials are never committed.
- **No Database Bindings**: No database connections, tables, or seed files are created in Module 0.
- **No Mock Authentication**: The app shell does not create fake authentication or mock user roles.
- **Deterministic Pure Logic**: All navigation and status evaluations are pure, decoupled, and unit-tested.
