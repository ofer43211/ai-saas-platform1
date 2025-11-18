import * as crypto from 'crypto';

export class CryptoUtil {
  private static readonly SALT_ROUNDS = 10;
  private static readonly HASH_LENGTH = 64;
  private static readonly ALGORITHM = 'sha512';

  /**
   * Hash a password using PBKDF2
   */
  static async hashPassword(password: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const salt = crypto.randomBytes(16).toString('hex');

      crypto.pbkdf2(
        password,
        salt,
        100000,
        this.HASH_LENGTH,
        this.ALGORITHM,
        (err, derivedKey) => {
          if (err) reject(err);
          resolve(salt + ':' + derivedKey.toString('hex'));
        }
      );
    });
  }

  /**
   * Verify a password against a hash
   */
  static async verifyPassword(password: string, hash: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const [salt, originalHash] = hash.split(':');

      if (!salt || !originalHash) {
        resolve(false);
        return;
      }

      crypto.pbkdf2(
        password,
        salt,
        100000,
        this.HASH_LENGTH,
        this.ALGORITHM,
        (err, derivedKey) => {
          if (err) reject(err);
          resolve(derivedKey.toString('hex') === originalHash);
        }
      );
    });
  }

  /**
   * Generate a random token
   */
  static generateToken(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Generate a secure random string for API keys
   */
  static generateApiKey(): string {
    const prefix = 'sk_';
    const randomPart = crypto.randomBytes(32).toString('base64url');
    return prefix + randomPart;
  }

  /**
   * Hash sensitive data (like API keys) for storage
   */
  static hashApiKey(apiKey: string): string {
    return crypto.createHash('sha256').update(apiKey).digest('hex');
  }
}
