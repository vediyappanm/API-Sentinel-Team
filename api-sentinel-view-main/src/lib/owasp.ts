/**
 * OWASP API Security Top 10 (2023) Categories
 */

export interface OWASPCategory {
  id: string;
  name: string;
  description: string;
  color: string;
  icon: string;
}

export const OWASP_TOP_10: OWASPCategory[] = [
  {
    id: 'BOLA',
    name: 'BOLA (Broken Object Level Authorization)',
    description: 'APIs expose endpoints that handle object identifiers, creating a wide attack surface for access control issues.',
    color: '#EF4444',
    icon: '🔑',
  },
  {
    id: 'AUTHENTICATION',
    name: 'Authentication Failures',
    description: 'Authentication mechanisms are implemented incorrectly, allowing attackers to compromise authentication tokens or exploit implementation flaws.',
    color: '#F97316',
    icon: '🛡️',
  },
  {
    id: 'BFLA',
    name: 'BFLA (Broken Function Level Authorization)',
    description: 'APIs rely on the client to enforce authorization, allowing attackers to access unauthorized functionality.',
    color: '#EAB308',
    icon: '⚡',
  },
  {
    id: 'INPUT_VALIDATION',
    name: 'Unrestricted Resource Consumption',
    description: 'APIs do not limit resource consumption, allowing attackers to exhaust system resources through DoS attacks.',
    color: '#22C55E',
    icon: '📊',
  },
  {
    id: 'INJECTION',
    name: 'Injection Attacks',
    description: 'SQL, NoSQL, Command Injection, and other injection attacks occur when untrusted data is sent to an interpreter.',
    color: '#3B82F6',
    icon: '💉',
  },
  {
    id: 'IMPROPER_ASSETS',
    name: 'Improper Assets Management',
    description: 'APIs tend to expose more endpoints than traditional web applications, making proper inventory and version management crucial.',
    color: '#6366F1',
    icon: '📦',
  },
  {
    id: 'SSRF',
    name: 'SSRF (Server Side Request Forgery)',
    description: 'SSRF flaws occur when an API fetches a remote resource without validating the user-supplied URL.',
    color: '#8B5CF6',
    icon: '🌐',
  },
  {
    id: 'SECURITY_MISCONFIG',
    name: 'Security Misconfiguration',
    description: 'Security misconfigurations are usually a result of unhardened systems, misconfigured custom code, or cloud storage.',
    color: '#EC4899',
    icon: '⚙️',
  },
  {
    id: 'STORAGE',
    name: 'Improper Data Storage',
    description: 'Sensitive data is stored without proper encryption or access controls, leading to data breaches.',
    color: '#14B8A6',
    icon: '💾',
  },
  {
    id: 'CONSUMPTION',
    name: 'Unrestricted Consumption',
    description: 'APIs allow unrestricted consumption of resources, leading to rate limiting and DoS vulnerabilities.',
    color: '#06B6D4',
    icon: '🔄',
  },
];

export interface OWASPCoverage {
  categoryId: string;
  detected: number;
  total: number;
  coverage: number;
  tests: number;
}

/**
 * Calculate OWASP coverage based on detected vulnerabilities and tests
 */
export function calculateOWASPCoverage(
  vulnerabilities: any[],
  tests: any[],
  securityEvents: any[]
): OWASPCoverage[] {
  return OWASP_TOP_10.map(cat => {
    const vulnCount = vulnerabilities.filter(
      v => v.category?.toUpperCase().includes(cat.id) || 
           v.severity?.toUpperCase().includes(cat.id)
    ).length;
    
    const testCount = tests.filter(
      t => t.id?.toUpperCase().includes(cat.id) ||
           t.category?.toUpperCase().includes(cat.id)
    ).length;
    
    const eventCount = securityEvents.filter(
      e => e.category?.toUpperCase().includes(cat.id) ||
           e.subCategory?.toUpperCase().includes(cat.id)
    ).length;
    
    const detected = vulnCount + eventCount;
    const total = testCount > 0 ? testCount : 1;
    const coverage = Math.min(100, Math.round((detected / total) * 100));
    
    return {
      categoryId: cat.id,
      detected,
      total,
      coverage: testCount > 0 ? coverage : 0,
      tests: testCount,
    };
  });
}

/**
 * Map threat categories to OWASP Top 10
 */
export function mapToOWASP(category: string): string {
  const catUpper = (category || '').toUpperCase();
  
  if (catUpper.includes('BOLA') || catUpper.includes('OBJECT') || catUpper.includes('IDOR')) {
    return 'BOLA';
  }
  if (catUpper.includes('AUTH') && !catUpper.includes('FUNCTION')) {
    return 'AUTHENTICATION';
  }
  if (catUpper.includes('BFLA') || catUpper.includes('FUNCTION')) {
    return 'BFLA';
  }
  if (catUpper.includes('INJECT') || catUpper.includes('SQL') || catUpper.includes('XSS') || catUpper.includes('COMMAND')) {
    return 'INJECTION';
  }
  if (catUpper.includes('SSRF')) {
    return 'SSRF';
  }
  if (catUpper.includes('MISCONFIG') || catUpper.includes('HEADER') || catUpper.includes('CORS')) {
    return 'SECURITY_MISCONFIG';
  }
  if (catUpper.includes('RATE') || catUpper.includes('LIMIT') || catUpper.includes('DOS')) {
    return 'CONSUMPTION';
  }
  if (catUpper.includes('PII') || catUpper.includes('SENSITIVE') || catUpper.includes('DATA')) {
    return 'STORAGE';
  }
  if (catUpper.includes('ASSET') || catUpper.includes('SHADOW') || catUpper.includes('ZOMBIE')) {
    return 'IMPROPER_ASSETS';
  }
  if (catUpper.includes('RESOURCE') || catUpper.includes('MEMORY') || catUpper.includes('TIMEOUT')) {
    return 'INPUT_VALIDATION';
  }
  
  return 'SECURITY_MISCONFIG'; // Default
}
