/**
 * Security utilities for preventing common vulnerabilities (OWASP Top 10)
 */

export class SecurityError extends Error {
  constructor(message: string, public type: string) {
    super(message);
    this.name = 'SecurityError';
  }
}

/**
 * SQL Injection Prevention
 */
export class SQLSanitizer {
  /**
   * Escape special characters in SQL strings
   */
  static escape(value: string): string {
    if (typeof value !== 'string') {
      throw new SecurityError('Value must be a string', 'invalid_type');
    }

    return value
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\x00/g, '\\0')
      .replace(/\x1a/g, '\\Z');
  }

  /**
   * Validate table/column names (alphanumeric and underscore only)
   */
  static validateIdentifier(identifier: string): boolean {
    const identifierRegex = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
    return identifierRegex.test(identifier);
  }

  /**
   * Detect potential SQL injection patterns
   */
  static detectSQLInjection(input: string): boolean {
    const sqlInjectionPatterns = [
      /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE)\b)/i,
      /(;|\-\-|\/\*|\*\/)/,
      /(\bOR\b.*?=.*?=)|(\bAND\b.*?=.*?=)/i,
      /\d+\s+OR\s+\d+/i,
      /(\bUNION\b.*?\bSELECT\b)/i,
      /(\\x[0-9a-f]{2})/i,
    ];

    return sqlInjectionPatterns.some(pattern => pattern.test(input));
  }
}

/**
 * XSS (Cross-Site Scripting) Prevention
 */
export class XSSSanitizer {
  /**
   * Escape HTML special characters
   */
  static escapeHTML(text: string): string {
    if (typeof text !== 'string') {
      return '';
    }

    const htmlEscapeMap: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#x27;',
      '/': '&#x2F;',
    };

    return text.replace(/[&<>"'/]/g, char => htmlEscapeMap[char]);
  }

  /**
   * Remove all HTML tags
   */
  static stripTags(html: string): string {
    if (typeof html !== 'string') {
      return '';
    }

    return html.replace(/<[^>]*>/g, '');
  }

  /**
   * Detect potential XSS patterns
   */
  static detectXSS(input: string): boolean {
    const xssPatterns = [
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      /javascript:/gi,
      /on\w+\s*=/gi, // Event handlers like onclick=
      /<iframe/gi,
      /<object/gi,
      /<embed/gi,
      /eval\s*\(/gi,
      /expression\s*\(/gi,
    ];

    return xssPatterns.some(pattern => pattern.test(input));
  }

  /**
   * Sanitize URL to prevent javascript: and data: schemes
   */
  static sanitizeURL(url: string): string {
    if (!url || typeof url !== 'string') {
      return '';
    }

    const trimmedURL = url.trim();

    // Block dangerous schemes
    const dangerousSchemes = [
      /^javascript:/i,
      /^data:/i,
      /^vbscript:/i,
      /^file:/i,
    ];

    if (dangerousSchemes.some(pattern => pattern.test(trimmedURL))) {
      throw new SecurityError('Dangerous URL scheme detected', 'xss_url');
    }

    return trimmedURL;
  }
}

/**
 * CSRF (Cross-Site Request Forgery) Protection
 */
export class CSRFProtection {
  /**
   * Generate CSRF token
   */
  static generateToken(): string {
    const crypto = require('crypto');
    return crypto.randomBytes(32).toString('base64url');
  }

  /**
   * Verify CSRF token
   */
  static verifyToken(token: string, expectedToken: string): boolean {
    if (!token || !expectedToken) {
      return false;
    }

    // Use constant-time comparison to prevent timing attacks
    return this.constantTimeEqual(token, expectedToken);
  }

  /**
   * Constant-time string comparison
   */
  private static constantTimeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false;
    }

    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }

    return result === 0;
  }
}

/**
 * Path Traversal Prevention
 */
export class PathSanitizer {
  /**
   * Detect path traversal attempts
   */
  static detectPathTraversal(path: string): boolean {
    const traversalPatterns = [
      /\.\./,
      /\.\.\\/,
      /%2e%2e/i,
      /%252e%252e/i,
      /\.\.%2f/i,
      /\.\.%5c/i,
    ];

    return traversalPatterns.some(pattern => pattern.test(path));
  }

  /**
   * Sanitize file path
   */
  static sanitizePath(path: string): string {
    if (!path || typeof path !== 'string') {
      throw new SecurityError('Invalid path', 'invalid_path');
    }

    if (this.detectPathTraversal(path)) {
      throw new SecurityError('Path traversal attempt detected', 'path_traversal');
    }

    // Remove leading slashes and normalize
    return path
      .replace(/^\/+/, '')
      .replace(/\\/g, '/')
      .replace(/\/+/g, '/');
  }

  /**
   * Validate filename
   */
  static validateFilename(filename: string): boolean {
    // Allow alphanumeric, dash, underscore, and dot
    const filenameRegex = /^[a-zA-Z0-9_\-\.]+$/;

    if (!filenameRegex.test(filename)) {
      return false;
    }

    // Prevent hidden files
    if (filename.startsWith('.')) {
      return false;
    }

    // Prevent dangerous extensions
    const dangerousExtensions = ['.exe', '.bat', '.cmd', '.sh', '.ps1'];
    const extension = filename.substring(filename.lastIndexOf('.')).toLowerCase();

    return !dangerousExtensions.includes(extension);
  }
}

/**
 * Command Injection Prevention
 */
export class CommandSanitizer {
  /**
   * Detect command injection patterns
   */
  static detectCommandInjection(input: string): boolean {
    const commandInjectionPatterns = [
      /[;&|`$()]/,
      /\n/,
      />\s*\/dev\//,
      /<\s*\/dev\//,
    ];

    return commandInjectionPatterns.some(pattern => pattern.test(input));
  }

  /**
   * Escape shell arguments
   */
  static escapeShellArg(arg: string): string {
    if (this.detectCommandInjection(arg)) {
      throw new SecurityError('Command injection attempt detected', 'command_injection');
    }

    // Wrap in single quotes and escape any existing single quotes
    return `'${arg.replace(/'/g, "'\\''")}'`;
  }
}

/**
 * Content Security Policy Helper
 */
export class CSPHelper {
  /**
   * Generate Content-Security-Policy header
   */
  static generateCSP(options: {
    defaultSrc?: string[];
    scriptSrc?: string[];
    styleSrc?: string[];
    imgSrc?: string[];
    connectSrc?: string[];
    fontSrc?: string[];
    objectSrc?: string[];
    mediaSrc?: string[];
    frameSrc?: string[];
  }): string {
    const directives: string[] = [];

    const defaultOptions = {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
      ...options,
    };

    for (const [directive, sources] of Object.entries(defaultOptions)) {
      const camelToKebab = directive.replace(/([A-Z])/g, '-$1').toLowerCase();
      directives.push(`${camelToKebab} ${sources.join(' ')}`);
    }

    return directives.join('; ');
  }
}

/**
 * Secure Headers Helper
 */
export class SecureHeaders {
  /**
   * Get recommended security headers
   */
  static getSecurityHeaders(): Record<string, string> {
    return {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
      'Content-Security-Policy': CSPHelper.generateCSP({}),
    };
  }
}

/**
 * Input Validation Helper
 */
export class InputValidator {
  /**
   * Validate and sanitize user input comprehensively
   */
  static sanitizeInput(input: string, options: {
    allowHTML?: boolean;
    maxLength?: number;
    checkSQL?: boolean;
    checkXSS?: boolean;
    checkPath?: boolean;
    checkCommand?: boolean;
  } = {}): string {
    if (!input || typeof input !== 'string') {
      return '';
    }

    let sanitized = input;

    // Check for SQL injection
    if (options.checkSQL && SQLSanitizer.detectSQLInjection(sanitized)) {
      throw new SecurityError('Potential SQL injection detected', 'sql_injection');
    }

    // Check for XSS
    if (options.checkXSS && XSSSanitizer.detectXSS(sanitized)) {
      throw new SecurityError('Potential XSS attack detected', 'xss');
    }

    // Check for path traversal
    if (options.checkPath && PathSanitizer.detectPathTraversal(sanitized)) {
      throw new SecurityError('Potential path traversal detected', 'path_traversal');
    }

    // Check for command injection
    if (options.checkCommand && CommandSanitizer.detectCommandInjection(sanitized)) {
      throw new SecurityError('Potential command injection detected', 'command_injection');
    }

    // Remove HTML if not allowed
    if (!options.allowHTML) {
      sanitized = XSSSanitizer.stripTags(sanitized);
    }

    // Trim whitespace
    sanitized = sanitized.trim();

    // Check length after trimming
    if (options.maxLength && sanitized.length > options.maxLength) {
      sanitized = sanitized.substring(0, options.maxLength);
    }

    return sanitized;
  }
}
