export type ModuleId =
  | 'dashboard'
  | 'administration'
  | 'master-data'
  | 'finance-accounting'
  | 'procurement'
  | 'inventory'
  | 'sales-crm'
  | 'hrms-payroll'
  | 'imports-logistics'
  | 'reports'
  | 'system-settings';

export type ModuleCategory = 'Core' | 'Operations' | 'Management' | 'Configuration';

export type ModuleStatus = 'active' | 'scheduled';

export interface ModuleDefinition {
  id: ModuleId;
  name: string;
  shortName: string;
  iconName: string;
  status: ModuleStatus;
  phaseNumber: number;
  category: ModuleCategory;
  description: string;
  plannedCapabilities: string[];
  prerequisites: string;
}
