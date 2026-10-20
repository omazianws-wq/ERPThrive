import { ModuleDefinition, ModuleId, ModuleCategory } from './types.ts';

/**
 * ERPThrive Official Module Registry.
 *
 * In accordance with the Module 0 Foundation specification:
 * - Dashboard is active as the foundation shell.
 * - All other 10 business and configuration modules are marked as scheduled.
 * - Under no circumstance are unimplemented modules marked as active or given synthetic data.
 */
export const MODULE_REGISTRY: readonly ModuleDefinition[] = [
  {
    id: 'dashboard',
    name: 'Dashboard',
    shortName: 'Dash',
    iconName: 'LayoutDashboard',
    status: 'active',
    phaseNumber: 0,
    category: 'Core',
    description: 'Foundation workspace view and enterprise shell operational overview.',
    plannedCapabilities: [
      'Application shell & responsive workspace',
      'Unified module status & navigation hub',
      'System foundation readiness checks',
      'Roadmap phase tracking'
    ],
    prerequisites: 'Module 0 Foundation (Implemented)'
  },
  {
    id: 'administration',
    name: 'Administration',
    shortName: 'Admin',
    iconName: 'ShieldCheck',
    status: 'scheduled',
    phaseNumber: 1,
    category: 'Management',
    description: 'Enterprise organization hierarchy, tenant configuration, and security management.',
    plannedCapabilities: [
      'Multi-entity company & branch hierarchy',
      'Role-based access control (RBAC) & granular permissions',
      'Audit logging and security trails',
      'Delegation and session policies'
    ],
    prerequisites: 'Module 0 Foundation'
  },
  {
    id: 'master-data',
    name: 'Master Data',
    shortName: 'Master',
    iconName: 'Database',
    status: 'scheduled',
    phaseNumber: 2,
    category: 'Core',
    description: 'Centralized master registers for enterprise entities, items, and classifications.',
    plannedCapabilities: [
      'Unified chart of accounts master registry',
      'Customer and supplier unified entity records',
      'Item catalog, unit of measures (UOM), and taxonomy',
      'Currency, exchange rates, and tax jurisdictions'
    ],
    prerequisites: 'Module 1 Administration'
  },
  {
    id: 'finance-accounting',
    name: 'Finance & Accounting',
    shortName: 'Finance',
    iconName: 'Landmark',
    status: 'scheduled',
    phaseNumber: 3,
    category: 'Management',
    description: 'General ledger, accounts receivable, accounts payable, and financial closing.',
    plannedCapabilities: [
      'Double-entry general ledger and automated journal entries',
      'Accounts payable (AP) with voucher processing',
      'Accounts receivable (AR) and receipt allocation',
      'Bank reconciliation and cash flow management'
    ],
    prerequisites: 'Module 2 Master Data'
  },
  {
    id: 'procurement',
    name: 'Procurement',
    shortName: 'Procure',
    iconName: 'ShoppingCart',
    status: 'scheduled',
    phaseNumber: 4,
    category: 'Operations',
    description: 'Sourcing, purchase requisitions, supplier orders, and 3-way matching.',
    plannedCapabilities: [
      'Purchase requisitions and multi-level approvals',
      'Vendor request for quotation (RFQ) and comparative analysis',
      'Purchase order (PO) generation and lifecycle tracking',
      'Goods receipt notes (GRN) and 3-way invoice reconciliation'
    ],
    prerequisites: 'Module 3 Finance & Accounting'
  },
  {
    id: 'inventory',
    name: 'Inventory',
    shortName: 'Stock',
    iconName: 'Boxes',
    status: 'scheduled',
    phaseNumber: 5,
    category: 'Operations',
    description: 'Multi-warehouse stock control, valuation, transfers, and inventory audits.',
    plannedCapabilities: [
      'Multi-warehouse and location/bin management',
      'Real-time stock valuation (FIFO / Weighted Average)',
      'Inter-warehouse stock transfers and transit tracking',
      'Cycle counts, adjustments, and batch/serial tracking'
    ],
    prerequisites: 'Module 4 Procurement'
  },
  {
    id: 'sales-crm',
    name: 'Sales & CRM',
    shortName: 'Sales',
    iconName: 'TrendingUp',
    status: 'scheduled',
    phaseNumber: 6,
    category: 'Operations',
    description: 'Customer relationship tracking, quotations, sales orders, and fulfillment.',
    plannedCapabilities: [
      'Lead and customer opportunity pipeline',
      'Formal price quotations and discount approvals',
      'Sales order booking, credit checks, and reservations',
      'Delivery orders, dispatch notes, and sales invoicing'
    ],
    prerequisites: 'Module 5 Inventory'
  },
  {
    id: 'hrms-payroll',
    name: 'HRMS & Payroll',
    shortName: 'HRMS',
    iconName: 'Users',
    status: 'scheduled',
    phaseNumber: 7,
    category: 'Management',
    description: 'Workforce records, attendance tracking, leave management, and payroll processing.',
    plannedCapabilities: [
      'Comprehensive employee profiles and departmental records',
      'Leave application and approval workflows',
      'Attendance records and shift scheduling',
      'Salary structures, statutory deductions, and payroll runs'
    ],
    prerequisites: 'Module 3 Finance & Accounting'
  },
  {
    id: 'imports-logistics',
    name: 'Imports & Logistics',
    shortName: 'Logistics',
    iconName: 'Truck',
    status: 'scheduled',
    phaseNumber: 8,
    category: 'Operations',
    description: 'International freight, customs clearance, landed cost allocation, and fleet tracking.',
    plannedCapabilities: [
      'Bill of Lading and shipping documentation tracking',
      'Customs tariff, duties, and port clearance records',
      'Landed cost capitalization and voucher apportionment',
      'Carrier tracking, freight insurance, and delivery routing'
    ],
    prerequisites: 'Module 4 Procurement & Module 5 Inventory'
  },
  {
    id: 'reports',
    name: 'Reports',
    shortName: 'Reports',
    iconName: 'FileSpreadsheet',
    status: 'scheduled',
    phaseNumber: 9,
    category: 'Management',
    description: 'Executive analytics, regulatory filings, trial balance, and audit reports.',
    plannedCapabilities: [
      'Balance sheet, P&L, and statement of cash flows',
      'Inventory aging and movement analytics',
      'Procurement spend analysis and supplier performance',
      'Configurable enterprise report builder and exports'
    ],
    prerequisites: 'Core & Operations Modules'
  },
  {
    id: 'system-settings',
    name: 'System Settings',
    shortName: 'Settings',
    iconName: 'Sliders',
    status: 'scheduled',
    phaseNumber: 10,
    category: 'Configuration',
    description: 'Global system parameters, localization, numbering series, and integrations.',
    plannedCapabilities: [
      'Fiscal year calendar and posting period controls',
      'Document numbering sequences and prefixes',
      'Email templates, system alerts, and notification rules',
      'API webhooks, data export policies, and maintenance mode'
    ],
    prerequisites: 'Module 0 Foundation'
  }
];

export const ALL_MODULE_IDS: readonly ModuleId[] = MODULE_REGISTRY.map((m) => m.id);

export function getAllModules(): readonly ModuleDefinition[] {
  return MODULE_REGISTRY;
}

export function getModuleById(id: string): ModuleDefinition | undefined {
  return MODULE_REGISTRY.find((m) => m.id === id);
}

export function isValidModuleId(id: string): id is ModuleId {
  return ALL_MODULE_IDS.includes(id as ModuleId);
}

export function isModuleImplemented(id: string): boolean {
  return id === 'dashboard';
}

export function getModulesByCategory(): Record<ModuleCategory, ModuleDefinition[]> {
  const categories: ModuleCategory[] = ['Core', 'Operations', 'Management', 'Configuration'];
  const grouped: Record<ModuleCategory, ModuleDefinition[]> = {
    Core: [],
    Operations: [],
    Management: [],
    Configuration: []
  };

  for (const module of MODULE_REGISTRY) {
    grouped[module.category].push(module);
  }

  return grouped;
}

export function getFoundationStatusSummary() {
  const totalModules = MODULE_REGISTRY.length;
  const implementedCount = MODULE_REGISTRY.filter((m) => m.status === 'active').length;
  const scheduledCount = MODULE_REGISTRY.filter((m) => m.status === 'scheduled').length;

  return {
    totalModules,
    implementedCount,
    scheduledCount,
    currentPhase: 'Module 0: Foundation and Application Shell',
    foundationStatus: 'Active & Verified',
    nextPhase: 'Module 1: Administration (Awaiting approval)'
  };
}
