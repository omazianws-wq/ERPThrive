import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateEmail,
  validateFullName,
  validatePassword,
  validatePasswordConfirmation,
  formatAuthErrorMessage,
  getAuthRedirectUrl,
  parseAuthCallbackFromUrl
} from './authService.ts';

test('Email validation accepts valid emails and rejects invalid formats', () => {
  assert.equal(validateEmail('admin@erpthrive.com'), null);
  assert.equal(validateEmail('user.name+tag@sub.domain.org'), null);

  assert.match(validateEmail('')!, /required|cannot be empty/i);
  assert.match(validateEmail('not-an-email')!, /valid work email/i);
  assert.match(validateEmail('@missinguser.com')!, /valid work email/i);
  assert.match(validateEmail('user@')!, /valid work email/i);
});

test('Full name validation requires non-empty name of appropriate length', () => {
  assert.equal(validateFullName('Alexander Hamilton'), null);
  assert.equal(validateFullName('Jo Li'), null);

  assert.match(validateFullName('')!, /required/i);
  assert.match(validateFullName('A')!, /at least 2 characters/i);
  assert.match(validateFullName('   ')!, /at least 2 characters/i);
  assert.match(validateFullName('a'.repeat(105))!, /cannot exceed 100/i);
});

test('Password validation enforces length and complexity', () => {
  assert.equal(validatePassword('SecurePass123'), null);
  assert.equal(validatePassword('admin_2026_ERP'), null);

  assert.match(validatePassword('short1')!, /at least 8 characters/i);
  assert.match(validatePassword('alllettersonly')!, /letter and one number/i);
  assert.match(validatePassword('1234567890')!, /letter and one number/i);
  assert.match(validatePassword('')!, /required/i);
});

test('Password confirmation matches password exactly', () => {
  assert.equal(validatePasswordConfirmation('Secret123', 'Secret123'), null);
  assert.match(validatePasswordConfirmation('Secret123', 'Different123')!, /do not match/i);
  assert.match(validatePasswordConfirmation('Secret123', '')!, /confirm your password/i);
});

test('Auth error formatting maps technical Supabase errors to clear messages', () => {
  assert.match(formatAuthErrorMessage({ message: 'Invalid login credentials' }), /invalid email or password/i);
  assert.match(formatAuthErrorMessage({ message: 'Email not confirmed' }), /email address has not been confirmed/i);
  assert.match(formatAuthErrorMessage({ message: 'User already registered' }), /account with this email address already exists/i);
  assert.match(formatAuthErrorMessage({ message: 'Failed to fetch' }), /unable to reach/i);
  assert.match(formatAuthErrorMessage('Custom enterprise error message'), /custom enterprise error/i);
});

test('getAuthRedirectUrl constructs clean URLs without hash fragments', () => {
  const result = getAuthRedirectUrl('https://my-preview-app.scf.usercontent.goog');
  assert.equal(result, 'https://my-preview-app.scf.usercontent.goog/');
  assert.ok(!result.includes('#'), 'Redirect URL must not include hash fragments');
});

test('parseAuthCallbackFromUrl parses signup confirmation success', () => {
  const hash = '#access_token=mock-jwt-token&expires_in=3600&refresh_token=mock-refresh&token_type=bearer&type=signup';
  const notice = parseAuthCallbackFromUrl(hash, '');
  assert.ok(notice);
  assert.equal(notice.type, 'success');
  assert.equal(notice.sourceType, 'signup');
  assert.match(notice.message, /verified/i);
});

test('parseAuthCallbackFromUrl parses password recovery callback', () => {
  const hash = '#access_token=mock-jwt-token&type=recovery';
  const notice = parseAuthCallbackFromUrl(hash, '');
  assert.ok(notice);
  assert.equal(notice.type, 'info');
  assert.equal(notice.sourceType, 'recovery');
  assert.match(notice.message, /password reset token/i);
});

test('parseAuthCallbackFromUrl parses expired or invalid link errors from hash or search params', () => {
  // Hash error format
  const hashError = '#error=unauthorized_client&error_code=401&error_description=Email+link+is+invalid+or+has+expired';
  const notice1 = parseAuthCallbackFromUrl(hashError, '');
  assert.ok(notice1);
  assert.equal(notice1.type, 'error');
  assert.match(notice1.message, /invalid or has expired/i);

  // Search error format
  const searchError = '?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired';
  const notice2 = parseAuthCallbackFromUrl('', searchError);
  assert.ok(notice2);
  assert.equal(notice2.type, 'error');
  assert.match(notice2.message, /invalid or has expired/i);
});

test('parseAuthCallbackFromUrl returns null when no auth parameters are present', () => {
  assert.equal(parseAuthCallbackFromUrl('', ''), null);
  assert.equal(parseAuthCallbackFromUrl('#dashboard', ''), null);
  assert.equal(parseAuthCallbackFromUrl('#login', '?tab=overview'), null);
});
