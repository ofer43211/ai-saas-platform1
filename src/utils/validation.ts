export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class Validator {
  static isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  static validateEmail(email: string): void {
    if (!email || typeof email !== 'string') {
      throw new ValidationError('Email is required');
    }

    if (!this.isValidEmail(email)) {
      throw new ValidationError('Invalid email format');
    }
  }

  static validatePassword(password: string): void {
    if (!password || typeof password !== 'string') {
      throw new ValidationError('Password is required');
    }

    if (password.length < 8) {
      throw new ValidationError('Password must be at least 8 characters long');
    }

    if (!/[A-Z]/.test(password)) {
      throw new ValidationError('Password must contain at least one uppercase letter');
    }

    if (!/[a-z]/.test(password)) {
      throw new ValidationError('Password must contain at least one lowercase letter');
    }

    if (!/[0-9]/.test(password)) {
      throw new ValidationError('Password must contain at least one number');
    }

    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      throw new ValidationError('Password must contain at least one special character');
    }
  }

  static sanitizeString(input: string): string {
    if (typeof input !== 'string') {
      return '';
    }

    // Remove HTML tags to prevent XSS
    return input
      .replace(/<[^>]*>/g, '')
      .trim();
  }

  static validateName(name: string): void {
    if (!name || typeof name !== 'string') {
      throw new ValidationError('Name is required');
    }

    const sanitized = this.sanitizeString(name);
    if (sanitized.length < 2) {
      throw new ValidationError('Name must be at least 2 characters long');
    }

    if (sanitized.length > 100) {
      throw new ValidationError('Name must be less than 100 characters');
    }
  }

  static validateRequired(value: any, fieldName: string): void {
    if (value === undefined || value === null || value === '') {
      throw new ValidationError(`${fieldName} is required`);
    }
  }
}
