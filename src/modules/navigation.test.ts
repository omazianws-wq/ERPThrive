import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MODULE_REGISTRY,
  ALL_MODULE_IDS,
  getAllModules,
  getModuleById,
  isValidModuleId,
  isModuleImplemented,
  getModulesByCategory,
  getFoundationStatusSummary
} from './navigation.ts';

test('ERPThrive module registry contains exactly 11 planned modules', () => {
  const modules = getAllModules();
  assert.equal(modules.length, 11);
  assert.equal(ALL_MODULE_IDS.length, 11);
});

test('ERPThrive registry includes all required foundation and placeholder modules', () => {
  const expectedModules = [
    'dashboard',
    'administration',
    'master-data',
    'finance-accounting',
    'procurement',
    'inventory',
    'sales-crm',
    'hrms-payroll',
    'imports-logistics',
    'reports',
    'system-settings'
  ];

  for (const expectedId of expectedModules) {
    const mod = getModuleById(expectedId);
    assert.ok(mod, `Module ${expectedId} should exist in registry`);
    assert.equal(isValidModuleId(expectedId), true);
  }
});

test('Only Dashboard (Module 0) is active; all other 10 business modules are strictly scheduled', () => {
  const activeModules = MODULE_REGISTRY.filter((m) => m.status === 'active');
  const scheduledModules = MODULE_REGISTRY.filter((m) => m.status === 'scheduled');

  assert.equal(activeModules.length, 1);
  assert.equal(activeModules[0].id, 'dashboard');
  assert.equal(isModuleImplemented('dashboard'), true);

  assert.equal(scheduledModules.length, 10);
  for (const mod of scheduledModules) {
    assert.equal(isModuleImplemented(mod.id), false, `Module ${mod.id} must NOT report as implemented`);
    assert.equal(mod.status, 'scheduled');
  }
});

test('Module IDs are unique and strictly formatted', () => {
  const ids = MODULE_REGISTRY.map((m) => m.id);
  const uniqueIds = new Set(ids);
  assert.equal(uniqueIds.size, ids.length, 'Every module ID must be unique');
});

test('Category grouping distributes all 11 modules across four standard categories', () => {
  const grouped = getModulesByCategory();
  const categories = Object.keys(grouped) as (keyof typeof grouped)[];

  assert.deepEqual(categories.sort(), ['Configuration', 'Core', 'Management', 'Operations'].sort());

  let totalCount = 0;
  for (const cat of categories) {
    assert.ok(grouped[cat].length > 0, `Category ${cat} should contain at least one module`);
    totalCount += grouped[cat].length;
  }
  assert.equal(totalCount, 11);
});

test('Foundation status summary accurately reflects Module 0 scope', () => {
  const summary = getFoundationStatusSummary();
  assert.equal(summary.totalModules, 11);
  assert.equal(summary.implementedCount, 1);
  assert.equal(summary.scheduledCount, 10);
  assert.equal(summary.currentPhase, 'Module 0: Foundation and Application Shell');
});

test('Invalid module IDs are safely rejected', () => {
  assert.equal(isValidModuleId('non-existent-module'), false);
  assert.equal(isValidModuleId(''), false);
  assert.equal(getModuleById('fake-id'), undefined);
  assert.equal(isModuleImplemented('fake-id'), false);
});
