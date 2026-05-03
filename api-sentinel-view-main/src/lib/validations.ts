/**
 * Form validation utilities for AppSentinel
 */

// Email validation regex (RFC 5322 compliant)
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

// IPv4 validation regex
const IPV4_REGEX = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

// IPv6 validation regex (simplified)
const IPV6_REGEX = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:)?((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;

// URL validation regex
const URL_REGEX = /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/;

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate email address
 */
export function validateEmail(email: string): ValidationResult {
  if (!email || email.trim().length === 0) {
    return { valid: false, error: 'Email is required' };
  }
  if (!EMAIL_REGEX.test(email)) {
    return { valid: false, error: 'Please enter a valid email address' };
  }
  return { valid: true };
}

/**
 * Validate password (minimum 8 characters, at least one uppercase, one lowercase, one number)
 */
export function validatePassword(password: string): ValidationResult {
  if (!password || password.length === 0) {
    return { valid: false, error: 'Password is required' };
  }
  if (password.length < 8) {
    return { valid: false, error: 'Password must be at least 8 characters' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one uppercase letter' };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one lowercase letter' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one number' };
  }
  return { valid: true };
}

/**
 * Validate IP address (IPv4 or IPv6)
 */
export function validateIP(ip: string): ValidationResult {
  if (!ip || ip.trim().length === 0) {
    return { valid: false, error: 'IP address is required' };
  }
  if (IPV4_REGEX.test(ip)) {
    return { valid: true, error: undefined };
  }
  if (IPV6_REGEX.test(ip)) {
    return { valid: true, error: undefined };
  }
  return { valid: false, error: 'Please enter a valid IPv4 or IPv6 address' };
}

/**
 * Validate numeric value with optional min/max
 */
export function validateNumeric(
  value: number | string,
  options?: { min?: number; max?: number; required?: boolean; name?: string }
): ValidationResult {
  const { min, max, required = false, name = 'Value' } = options || {};
  const numValue = typeof value === 'string' ? parseFloat(value) : value;

  if (required && (value === null || value === undefined || value === '')) {
    return { valid: false, error: `${name} is required` };
  }

  if (isNaN(numValue)) {
    return { valid: false, error: `${name} must be a valid number` };
  }

  if (min !== undefined && numValue < min) {
    return { valid: false, error: `${name} must be at least ${min}` };
  }

  if (max !== undefined && numValue > max) {
    return { valid: false, error: `${name} must be at most ${max}` };
  }

  return { valid: true };
}

/**
 * Validate URL
 */
export function validateURL(url: string): ValidationResult {
  if (!url || url.trim().length === 0) {
    return { valid: false, error: 'URL is required' };
  }
  if (!URL_REGEX.test(url)) {
    return { valid: false, error: 'Please enter a valid URL' };
  }
  return { valid: true };
}

/**
 * Validate required field
 */
export function validateRequired(value: any, fieldName?: string): ValidationResult {
  const name = fieldName || 'This field';
  if (value === null || value === undefined || value === '') {
    return { valid: false, error: `${name} is required` };
  }
  if (typeof value === 'string' && value.trim().length === 0) {
    return { valid: false, error: `${name} is required` };
  }
  return { valid: true };
}

/**
 * Validate API endpoint path
 */
export function validateEndpointPath(path: string): ValidationResult {
  if (!path || path.trim().length === 0) {
    return { valid: false, error: 'Endpoint path is required' };
  }
  if (!path.startsWith('/')) {
    return { valid: false, error: 'Endpoint path must start with /' };
  }
  if (path.includes(' ')) {
    return { valid: false, error: 'Endpoint path cannot contain spaces' };
  }
  return { valid: true };
}

/**
 * Validate HTTP method
 */
export function validateMethod(method: string): ValidationResult {
  const validMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
  if (!method) {
    return { valid: false, error: 'HTTP method is required' };
  }
  const upperMethod = method.toUpperCase();
  if (!validMethods.includes(upperMethod)) {
    return { valid: false, error: `Method must be one of: ${validMethods.join(', ')}` };
  }
  return { valid: true };
}

/**
 * Validate time range (hours must be positive)
 */
export function validateHours(hours: number | string): ValidationResult {
  return validateNumeric(hours, { min: 0.01, name: 'Time duration' });
}

/**
 * Validate CIDR notation
 */
export function validateCIDR(cidr: string): ValidationResult {
  if (!cidr || cidr.trim().length === 0) {
    return { valid: false, error: 'CIDR notation is required' };
  }
  
  const cidrRegex = /^([0-9]{1,3}\.){3}[0-9]{1,3}\/([0-9]|[1-2][0-9]|3[0-2])$/;
  if (!cidrRegex.test(cidr)) {
    return { valid: false, error: 'Please enter a valid CIDR notation (e.g., 192.168.1.0/24)' };
  }
  
  // Validate the IP part
  const ipPart = cidr.split('/')[0];
  return validateIP(ipPart);
}
