import { CryptoUtil } from '../crypto';

describe('CryptoUtil', () => {
  describe('hashPassword', () => {
    it('should hash a password', async () => {
      const password = 'MyPassword123!';
      const hash = await CryptoUtil.hashPassword(password);

      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
      expect(hash.length).toBeGreaterThan(0);
    });

    it('should generate different hashes for same password', async () => {
      const password = 'MyPassword123!';
      const hash1 = await CryptoUtil.hashPassword(password);
      const hash2 = await CryptoUtil.hashPassword(password);

      expect(hash1).not.toBe(hash2);
    });

    it('should contain salt and hash separated by colon', async () => {
      const password = 'MyPassword123!';
      const hash = await CryptoUtil.hashPassword(password);

      expect(hash).toContain(':');
      const parts = hash.split(':');
      expect(parts).toHaveLength(2);
      expect(parts[0].length).toBeGreaterThan(0); // salt
      expect(parts[1].length).toBeGreaterThan(0); // hash
    });
  });

  describe('verifyPassword', () => {
    it('should verify correct password', async () => {
      const password = 'MyPassword123!';
      const hash = await CryptoUtil.hashPassword(password);
      const isValid = await CryptoUtil.verifyPassword(password, hash);

      expect(isValid).toBe(true);
    });

    it('should reject incorrect password', async () => {
      const password = 'MyPassword123!';
      const hash = await CryptoUtil.hashPassword(password);
      const isValid = await CryptoUtil.verifyPassword('WrongPassword!', hash);

      expect(isValid).toBe(false);
    });

    it('should reject password with slight variation', async () => {
      const password = 'MyPassword123!';
      const hash = await CryptoUtil.hashPassword(password);
      const isValid = await CryptoUtil.verifyPassword('MyPassword123', hash);

      expect(isValid).toBe(false);
    });

    it('should handle invalid hash format', async () => {
      const isValid = await CryptoUtil.verifyPassword('password', 'invalid-hash');
      expect(isValid).toBe(false);
    });

    it('should handle empty hash', async () => {
      const isValid = await CryptoUtil.verifyPassword('password', '');
      expect(isValid).toBe(false);
    });
  });

  describe('generateToken', () => {
    it('should generate a random token', () => {
      const token = CryptoUtil.generateToken();

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.length).toBe(64); // 32 bytes = 64 hex chars
    });

    it('should generate tokens of specified length', () => {
      const token16 = CryptoUtil.generateToken(16);
      const token32 = CryptoUtil.generateToken(32);
      const token64 = CryptoUtil.generateToken(64);

      expect(token16.length).toBe(32);  // 16 bytes = 32 hex chars
      expect(token32.length).toBe(64);  // 32 bytes = 64 hex chars
      expect(token64.length).toBe(128); // 64 bytes = 128 hex chars
    });

    it('should generate unique tokens', () => {
      const token1 = CryptoUtil.generateToken();
      const token2 = CryptoUtil.generateToken();

      expect(token1).not.toBe(token2);
    });

    it('should generate hexadecimal tokens', () => {
      const token = CryptoUtil.generateToken();
      const hexRegex = /^[0-9a-f]+$/;

      expect(hexRegex.test(token)).toBe(true);
    });
  });

  describe('generateApiKey', () => {
    it('should generate API key with correct prefix', () => {
      const apiKey = CryptoUtil.generateApiKey();

      expect(apiKey).toMatch(/^sk_/);
    });

    it('should generate unique API keys', () => {
      const apiKey1 = CryptoUtil.generateApiKey();
      const apiKey2 = CryptoUtil.generateApiKey();

      expect(apiKey1).not.toBe(apiKey2);
    });

    it('should generate API keys with sufficient length', () => {
      const apiKey = CryptoUtil.generateApiKey();

      expect(apiKey.length).toBeGreaterThan(40);
    });

    it('should use base64url encoding (no special chars)', () => {
      const apiKey = CryptoUtil.generateApiKey();
      const keyPart = apiKey.substring(3); // Remove 'sk_' prefix

      // base64url should not contain +, /, or =
      expect(keyPart).not.toContain('+');
      expect(keyPart).not.toContain('/');
      expect(keyPart).not.toContain('=');
    });
  });

  describe('hashApiKey', () => {
    it('should hash an API key', () => {
      const apiKey = CryptoUtil.generateApiKey();
      const hash = CryptoUtil.hashApiKey(apiKey);

      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
      expect(hash.length).toBe(64); // SHA-256 produces 64 hex chars
    });

    it('should produce consistent hashes for same input', () => {
      const apiKey = CryptoUtil.generateApiKey();
      const hash1 = CryptoUtil.hashApiKey(apiKey);
      const hash2 = CryptoUtil.hashApiKey(apiKey);

      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different inputs', () => {
      const apiKey1 = CryptoUtil.generateApiKey();
      const apiKey2 = CryptoUtil.generateApiKey();
      const hash1 = CryptoUtil.hashApiKey(apiKey1);
      const hash2 = CryptoUtil.hashApiKey(apiKey2);

      expect(hash1).not.toBe(hash2);
    });

    it('should produce hexadecimal hash', () => {
      const apiKey = CryptoUtil.generateApiKey();
      const hash = CryptoUtil.hashApiKey(apiKey);
      const hexRegex = /^[0-9a-f]+$/;

      expect(hexRegex.test(hash)).toBe(true);
    });
  });

  describe('Security Properties', () => {
    it('should make password verification timing-safe', async () => {
      const password = 'MyPassword123!';
      const hash = await CryptoUtil.hashPassword(password);

      const start1 = Date.now();
      await CryptoUtil.verifyPassword('wrong', hash);
      const time1 = Date.now() - start1;

      const start2 = Date.now();
      await CryptoUtil.verifyPassword(password, hash);
      const time2 = Date.now() - start2;

      // Times should be similar (within 50ms) to prevent timing attacks
      // Note: This is a simplified test; real timing attack prevention is more complex
      expect(Math.abs(time1 - time2)).toBeLessThan(50);
    });

    it('should use sufficient iterations for PBKDF2', async () => {
      // This test ensures that password hashing takes reasonable time
      // indicating sufficient iterations for security
      const password = 'MyPassword123!';
      const start = Date.now();
      await CryptoUtil.hashPassword(password);
      const duration = Date.now() - start;

      // Should take at least a few milliseconds (indicates many iterations)
      expect(duration).toBeGreaterThan(1);
    });
  });
});
