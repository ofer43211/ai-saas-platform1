import {
  SecurityError,
  SQLSanitizer,
  XSSSanitizer,
  CSRFProtection,
  PathSanitizer,
  CommandSanitizer,
  CSPHelper,
  SecureHeaders,
  InputValidator,
} from '../security';

describe('Security Utilities', () => {
  describe('SQLSanitizer', () => {
    describe('escape', () => {
      it('should escape single quotes', () => {
        const result = SQLSanitizer.escape("It's a test");
        expect(result).toBe("It\\'s a test");
      });

      it('should escape backslashes', () => {
        const result = SQLSanitizer.escape('C:\\path\\to\\file');
        expect(result).toBe('C:\\\\path\\\\to\\\\file');
      });

      it('should escape double quotes', () => {
        const result = SQLSanitizer.escape('He said "hello"');
        expect(result).toBe('He said \\"hello\\"');
      });

      it('should escape null bytes', () => {
        const result = SQLSanitizer.escape('test\x00value');
        expect(result).toContain('\\0');
      });

      it('should throw for non-string input', () => {
        expect(() => SQLSanitizer.escape(123 as any)).toThrow(SecurityError);
      });
    });

    describe('validateIdentifier', () => {
      it('should accept valid identifiers', () => {
        expect(SQLSanitizer.validateIdentifier('table_name')).toBe(true);
        expect(SQLSanitizer.validateIdentifier('column1')).toBe(true);
        expect(SQLSanitizer.validateIdentifier('_private')).toBe(true);
      });

      it('should reject invalid identifiers', () => {
        expect(SQLSanitizer.validateIdentifier('table-name')).toBe(false);
        expect(SQLSanitizer.validateIdentifier('123table')).toBe(false);
        expect(SQLSanitizer.validateIdentifier('table name')).toBe(false);
        expect(SQLSanitizer.validateIdentifier('table;DROP')).toBe(false);
      });
    });

    describe('detectSQLInjection', () => {
      it('should detect SQL keywords', () => {
        expect(SQLSanitizer.detectSQLInjection("'; DROP TABLE users--")).toBe(true);
        expect(SQLSanitizer.detectSQLInjection('SELECT * FROM users')).toBe(true);
        expect(SQLSanitizer.detectSQLInjection('1 OR 1=1')).toBe(true);
        expect(SQLSanitizer.detectSQLInjection('UNION SELECT password')).toBe(true);
      });

      it('should detect SQL comment patterns', () => {
        expect(SQLSanitizer.detectSQLInjection('admin-- ')).toBe(true);
        expect(SQLSanitizer.detectSQLInjection('/* comment */')).toBe(true);
      });

      it('should not flag normal input', () => {
        expect(SQLSanitizer.detectSQLInjection('John Doe')).toBe(false);
        expect(SQLSanitizer.detectSQLInjection('user@example.com')).toBe(false);
        expect(SQLSanitizer.detectSQLInjection('Hello, world!')).toBe(false);
      });
    });
  });

  describe('XSSSanitizer', () => {
    describe('escapeHTML', () => {
      it('should escape HTML special characters', () => {
        expect(XSSSanitizer.escapeHTML('<div>Test</div>')).toBe('&lt;div&gt;Test&lt;&#x2F;div&gt;');
        expect(XSSSanitizer.escapeHTML('A & B')).toBe('A &amp; B');
        expect(XSSSanitizer.escapeHTML('"quoted"')).toBe('&quot;quoted&quot;');
        expect(XSSSanitizer.escapeHTML("It's here")).toBe('It&#x27;s here');
      });

      it('should handle non-string input', () => {
        expect(XSSSanitizer.escapeHTML(null as any)).toBe('');
        expect(XSSSanitizer.escapeHTML(undefined as any)).toBe('');
        expect(XSSSanitizer.escapeHTML(123 as any)).toBe('');
      });
    });

    describe('stripTags', () => {
      it('should remove all HTML tags', () => {
        expect(XSSSanitizer.stripTags('<p>Hello</p>')).toBe('Hello');
        expect(XSSSanitizer.stripTags('<script>alert("xss")</script>')).toBe('alert("xss")');
        expect(XSSSanitizer.stripTags('<div class="test">Content</div>')).toBe('Content');
      });

      it('should handle nested tags', () => {
        expect(XSSSanitizer.stripTags('<div><p><b>Bold</b></p></div>')).toBe('Bold');
      });

      it('should preserve text without tags', () => {
        expect(XSSSanitizer.stripTags('Plain text')).toBe('Plain text');
      });
    });

    describe('detectXSS', () => {
      it('should detect script tags', () => {
        expect(XSSSanitizer.detectXSS('<script>alert(1)</script>')).toBe(true);
        expect(XSSSanitizer.detectXSS('<SCRIPT>alert(1)</SCRIPT>')).toBe(true);
      });

      it('should detect javascript: URLs', () => {
        expect(XSSSanitizer.detectXSS('javascript:alert(1)')).toBe(true);
        expect(XSSSanitizer.detectXSS('JAVASCRIPT:alert(1)')).toBe(true);
      });

      it('should detect event handlers', () => {
        expect(XSSSanitizer.detectXSS('<img onclick="alert(1)">')).toBe(true);
        expect(XSSSanitizer.detectXSS('<div onload="malicious()">')).toBe(true);
        expect(XSSSanitizer.detectXSS('<body onmouseover="hack()">')).toBe(true);
      });

      it('should detect dangerous tags', () => {
        expect(XSSSanitizer.detectXSS('<iframe src="evil.com"></iframe>')).toBe(true);
        expect(XSSSanitizer.detectXSS('<object data="evil.swf"></object>')).toBe(true);
        expect(XSSSanitizer.detectXSS('<embed src="evil.swf">')).toBe(true);
      });

      it('should detect eval and expression', () => {
        expect(XSSSanitizer.detectXSS('eval(userInput)')).toBe(true);
        expect(XSSSanitizer.detectXSS('expression(alert(1))')).toBe(true);
      });

      it('should not flag safe content', () => {
        expect(XSSSanitizer.detectXSS('Normal text')).toBe(false);
        expect(XSSSanitizer.detectXSS('<p>Safe paragraph</p>')).toBe(false);
      });
    });

    describe('sanitizeURL', () => {
      it('should allow safe URLs', () => {
        expect(XSSSanitizer.sanitizeURL('https://example.com')).toBe('https://example.com');
        expect(XSSSanitizer.sanitizeURL('http://example.com/path')).toBe('http://example.com/path');
        expect(XSSSanitizer.sanitizeURL('/relative/path')).toBe('/relative/path');
      });

      it('should block javascript: URLs', () => {
        expect(() => XSSSanitizer.sanitizeURL('javascript:alert(1)')).toThrow(SecurityError);
      });

      it('should block data: URLs', () => {
        expect(() => XSSSanitizer.sanitizeURL('data:text/html,<script>alert(1)</script>')).toThrow(SecurityError);
      });

      it('should block vbscript: URLs', () => {
        expect(() => XSSSanitizer.sanitizeURL('vbscript:msgbox(1)')).toThrow(SecurityError);
      });

      it('should block file: URLs', () => {
        expect(() => XSSSanitizer.sanitizeURL('file:///etc/passwd')).toThrow(SecurityError);
      });

      it('should trim whitespace', () => {
        expect(XSSSanitizer.sanitizeURL('  https://example.com  ')).toBe('https://example.com');
      });
    });
  });

  describe('CSRFProtection', () => {
    describe('generateToken', () => {
      it('should generate random tokens', () => {
        const token1 = CSRFProtection.generateToken();
        const token2 = CSRFProtection.generateToken();

        expect(token1).toBeDefined();
        expect(token2).toBeDefined();
        expect(token1).not.toBe(token2);
      });

      it('should generate tokens of sufficient length', () => {
        const token = CSRFProtection.generateToken();
        expect(token.length).toBeGreaterThan(32);
      });
    });

    describe('verifyToken', () => {
      it('should verify matching tokens', () => {
        const token = CSRFProtection.generateToken();
        expect(CSRFProtection.verifyToken(token, token)).toBe(true);
      });

      it('should reject non-matching tokens', () => {
        const token1 = CSRFProtection.generateToken();
        const token2 = CSRFProtection.generateToken();
        expect(CSRFProtection.verifyToken(token1, token2)).toBe(false);
      });

      it('should reject empty tokens', () => {
        expect(CSRFProtection.verifyToken('', 'token')).toBe(false);
        expect(CSRFProtection.verifyToken('token', '')).toBe(false);
      });

      it('should reject tokens of different lengths', () => {
        expect(CSRFProtection.verifyToken('short', 'muchlongertoken')).toBe(false);
      });
    });
  });

  describe('PathSanitizer', () => {
    describe('detectPathTraversal', () => {
      it('should detect basic path traversal', () => {
        expect(PathSanitizer.detectPathTraversal('../etc/passwd')).toBe(true);
        expect(PathSanitizer.detectPathTraversal('..\\windows\\system32')).toBe(true);
      });

      it('should detect URL-encoded path traversal', () => {
        expect(PathSanitizer.detectPathTraversal('%2e%2e/etc/passwd')).toBe(true);
        expect(PathSanitizer.detectPathTraversal('%252e%252e/etc/passwd')).toBe(true);
      });

      it('should not flag safe paths', () => {
        expect(PathSanitizer.detectPathTraversal('safe/path/file.txt')).toBe(false);
        expect(PathSanitizer.detectPathTraversal('documents/report.pdf')).toBe(false);
      });
    });

    describe('sanitizePath', () => {
      it('should remove leading slashes', () => {
        expect(PathSanitizer.sanitizePath('///path/to/file')).toBe('path/to/file');
      });

      it('should normalize slashes', () => {
        expect(PathSanitizer.sanitizePath('path\\to\\file')).toBe('path/to/file');
      });

      it('should throw on path traversal', () => {
        expect(() => PathSanitizer.sanitizePath('../etc/passwd')).toThrow(SecurityError);
        expect(() => PathSanitizer.sanitizePath('../etc/passwd')).toThrow('Path traversal');
      });

      it('should throw on invalid input', () => {
        expect(() => PathSanitizer.sanitizePath(null as any)).toThrow(SecurityError);
      });
    });

    describe('validateFilename', () => {
      it('should accept safe filenames', () => {
        expect(PathSanitizer.validateFilename('document.pdf')).toBe(true);
        expect(PathSanitizer.validateFilename('file_123.txt')).toBe(true);
        expect(PathSanitizer.validateFilename('my-file.jpg')).toBe(true);
      });

      it('should reject hidden files', () => {
        expect(PathSanitizer.validateFilename('.htaccess')).toBe(false);
        expect(PathSanitizer.validateFilename('.hidden')).toBe(false);
      });

      it('should reject dangerous extensions', () => {
        expect(PathSanitizer.validateFilename('virus.exe')).toBe(false);
        expect(PathSanitizer.validateFilename('script.bat')).toBe(false);
        expect(PathSanitizer.validateFilename('malware.sh')).toBe(false);
        expect(PathSanitizer.validateFilename('hack.ps1')).toBe(false);
      });

      it('should reject special characters', () => {
        expect(PathSanitizer.validateFilename('file name.txt')).toBe(false);
        expect(PathSanitizer.validateFilename('file/path.txt')).toBe(false);
        expect(PathSanitizer.validateFilename('file:stream.txt')).toBe(false);
      });
    });
  });

  describe('CommandSanitizer', () => {
    describe('detectCommandInjection', () => {
      it('should detect shell metacharacters', () => {
        expect(CommandSanitizer.detectCommandInjection('test; rm -rf /')).toBe(true);
        expect(CommandSanitizer.detectCommandInjection('test | cat /etc/passwd')).toBe(true);
        expect(CommandSanitizer.detectCommandInjection('test && malicious')).toBe(true);
        expect(CommandSanitizer.detectCommandInjection('test `whoami`')).toBe(true);
        expect(CommandSanitizer.detectCommandInjection('test $(whoami)')).toBe(true);
      });

      it('should detect redirections', () => {
        expect(CommandSanitizer.detectCommandInjection('test > /dev/null')).toBe(true);
        expect(CommandSanitizer.detectCommandInjection('test < /dev/random')).toBe(true);
      });

      it('should not flag safe input', () => {
        expect(CommandSanitizer.detectCommandInjection('safe-filename.txt')).toBe(false);
        expect(CommandSanitizer.detectCommandInjection('user@example.com')).toBe(false);
      });
    });

    describe('escapeShellArg', () => {
      it('should escape shell arguments safely', () => {
        const result = CommandSanitizer.escapeShellArg("It's safe");
        expect(result).toBe("'It'\\''s safe'");
      });

      it('should throw on injection attempts', () => {
        expect(() => CommandSanitizer.escapeShellArg('test; rm -rf /')).toThrow(SecurityError);
        expect(() => CommandSanitizer.escapeShellArg('test && malicious')).toThrow('Command injection');
      });
    });
  });

  describe('CSPHelper', () => {
    describe('generateCSP', () => {
      it('should generate default CSP', () => {
        const csp = CSPHelper.generateCSP({});

        expect(csp).toContain("default-src 'self'");
        expect(csp).toContain("script-src 'self'");
        expect(csp).toContain("object-src 'none'");
      });

      it('should allow custom directives', () => {
        const csp = CSPHelper.generateCSP({
          scriptSrc: ["'self'", 'https://cdn.example.com'],
          styleSrc: ["'self'", 'https://fonts.googleapis.com'],
        });

        expect(csp).toContain("script-src 'self' https://cdn.example.com");
        expect(csp).toContain("style-src 'self' https://fonts.googleapis.com");
      });

      it('should block objects by default', () => {
        const csp = CSPHelper.generateCSP({});
        expect(csp).toContain("object-src 'none'");
      });
    });
  });

  describe('SecureHeaders', () => {
    it('should provide all recommended security headers', () => {
      const headers = SecureHeaders.getSecurityHeaders();

      expect(headers['X-Content-Type-Options']).toBe('nosniff');
      expect(headers['X-Frame-Options']).toBe('DENY');
      expect(headers['X-XSS-Protection']).toBe('1; mode=block');
      expect(headers['Strict-Transport-Security']).toContain('max-age=31536000');
      expect(headers['Referrer-Policy']).toBeDefined();
      expect(headers['Content-Security-Policy']).toBeDefined();
    });

    it('should include HSTS header', () => {
      const headers = SecureHeaders.getSecurityHeaders();
      expect(headers['Strict-Transport-Security']).toContain('includeSubDomains');
    });
  });

  describe('InputValidator', () => {
    describe('sanitizeInput', () => {
      it('should sanitize basic input', () => {
        const result = InputValidator.sanitizeInput('  Hello World  ');
        expect(result).toBe('Hello World');
      });

      it('should enforce max length', () => {
        const result = InputValidator.sanitizeInput('Very long input', { maxLength: 10 });
        expect(result.length).toBe(10);
      });

      it('should strip HTML by default', () => {
        const result = InputValidator.sanitizeInput('<script>alert(1)</script>');
        expect(result).not.toContain('<script>');
      });

      it('should allow HTML when specified', () => {
        const input = '<p>Safe content</p>';
        const result = InputValidator.sanitizeInput(input, { allowHTML: true });
        expect(result).toBe(input);
      });

      it('should detect SQL injection', () => {
        expect(() => {
          InputValidator.sanitizeInput("'; DROP TABLE users--", { checkSQL: true });
        }).toThrow(SecurityError);
      });

      it('should detect XSS', () => {
        expect(() => {
          InputValidator.sanitizeInput('<script>alert(1)</script>', { checkXSS: true });
        }).toThrow(SecurityError);
      });

      it('should detect path traversal', () => {
        expect(() => {
          InputValidator.sanitizeInput('../etc/passwd', { checkPath: true });
        }).toThrow(SecurityError);
      });

      it('should detect command injection', () => {
        expect(() => {
          InputValidator.sanitizeInput('test; rm -rf /', { checkCommand: true });
        }).toThrow(SecurityError);
      });

      it('should handle empty input', () => {
        expect(InputValidator.sanitizeInput('')).toBe('');
        expect(InputValidator.sanitizeInput(null as any)).toBe('');
      });
    });
  });
});
