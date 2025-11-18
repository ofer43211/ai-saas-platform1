import { Validator, ValidationError } from '../validation';

describe('Validator', () => {
  describe('isValidEmail', () => {
    it('should return true for valid email addresses', () => {
      expect(Validator.isValidEmail('test@example.com')).toBe(true);
      expect(Validator.isValidEmail('user.name@domain.co.uk')).toBe(true);
      expect(Validator.isValidEmail('user+tag@example.com')).toBe(true);
    });

    it('should return false for invalid email addresses', () => {
      expect(Validator.isValidEmail('invalid')).toBe(false);
      expect(Validator.isValidEmail('invalid@')).toBe(false);
      expect(Validator.isValidEmail('@example.com')).toBe(false);
      expect(Validator.isValidEmail('user@')).toBe(false);
      expect(Validator.isValidEmail('')).toBe(false);
    });
  });

  describe('validateEmail', () => {
    it('should not throw for valid email addresses', () => {
      expect(() => Validator.validateEmail('test@example.com')).not.toThrow();
    });

    it('should throw ValidationError for empty email', () => {
      expect(() => Validator.validateEmail('')).toThrow(ValidationError);
      expect(() => Validator.validateEmail('')).toThrow('Email is required');
    });

    it('should throw ValidationError for invalid email format', () => {
      expect(() => Validator.validateEmail('invalid-email')).toThrow(ValidationError);
      expect(() => Validator.validateEmail('invalid-email')).toThrow('Invalid email format');
    });

    it('should throw ValidationError for non-string input', () => {
      expect(() => Validator.validateEmail(null as any)).toThrow('Email is required');
      expect(() => Validator.validateEmail(undefined as any)).toThrow('Email is required');
    });
  });

  describe('validatePassword', () => {
    it('should not throw for valid passwords', () => {
      expect(() => Validator.validatePassword('Password123!')).not.toThrow();
      expect(() => Validator.validatePassword('MyP@ssw0rd')).not.toThrow();
      expect(() => Validator.validatePassword('Str0ng!Pass')).not.toThrow();
    });

    it('should throw ValidationError for empty password', () => {
      expect(() => Validator.validatePassword('')).toThrow('Password is required');
    });

    it('should throw ValidationError for password shorter than 8 characters', () => {
      expect(() => Validator.validatePassword('Pass1!')).toThrow(
        'Password must be at least 8 characters long'
      );
    });

    it('should throw ValidationError for password without uppercase letter', () => {
      expect(() => Validator.validatePassword('password123!')).toThrow(
        'Password must contain at least one uppercase letter'
      );
    });

    it('should throw ValidationError for password without lowercase letter', () => {
      expect(() => Validator.validatePassword('PASSWORD123!')).toThrow(
        'Password must contain at least one lowercase letter'
      );
    });

    it('should throw ValidationError for password without number', () => {
      expect(() => Validator.validatePassword('Password!')).toThrow(
        'Password must contain at least one number'
      );
    });

    it('should throw ValidationError for password without special character', () => {
      expect(() => Validator.validatePassword('Password123')).toThrow(
        'Password must contain at least one special character'
      );
    });
  });

  describe('sanitizeString', () => {
    it('should remove HTML tags', () => {
      expect(Validator.sanitizeString('<script>alert("xss")</script>')).toBe('alert("xss")');
      expect(Validator.sanitizeString('<b>Bold</b> text')).toBe('Bold text');
      expect(Validator.sanitizeString('<div>Content</div>')).toBe('Content');
    });

    it('should trim whitespace', () => {
      expect(Validator.sanitizeString('  text  ')).toBe('text');
      expect(Validator.sanitizeString('\n\ttext\n\t')).toBe('text');
    });

    it('should handle non-string input', () => {
      expect(Validator.sanitizeString(null as any)).toBe('');
      expect(Validator.sanitizeString(undefined as any)).toBe('');
      expect(Validator.sanitizeString(123 as any)).toBe('');
    });

    it('should preserve safe text', () => {
      expect(Validator.sanitizeString('Normal text')).toBe('Normal text');
      expect(Validator.sanitizeString('Text with "quotes"')).toBe('Text with "quotes"');
    });
  });

  describe('validateName', () => {
    it('should not throw for valid names', () => {
      expect(() => Validator.validateName('John Doe')).not.toThrow();
      expect(() => Validator.validateName('Jane')).not.toThrow();
      expect(() => Validator.validateName('O\'Brien')).not.toThrow();
    });

    it('should throw ValidationError for empty name', () => {
      expect(() => Validator.validateName('')).toThrow('Name is required');
    });

    it('should throw ValidationError for name shorter than 2 characters', () => {
      expect(() => Validator.validateName('A')).toThrow(
        'Name must be at least 2 characters long'
      );
    });

    it('should throw ValidationError for name longer than 100 characters', () => {
      const longName = 'A'.repeat(101);
      expect(() => Validator.validateName(longName)).toThrow(
        'Name must be less than 100 characters'
      );
    });

    it('should sanitize HTML tags in names', () => {
      expect(() => Validator.validateName('<script>XSS</script>')).not.toThrow();
    });
  });

  describe('validateRequired', () => {
    it('should not throw for non-empty values', () => {
      expect(() => Validator.validateRequired('value', 'Field')).not.toThrow();
      expect(() => Validator.validateRequired(123, 'Field')).not.toThrow();
      expect(() => Validator.validateRequired(true, 'Field')).not.toThrow();
      expect(() => Validator.validateRequired({}, 'Field')).not.toThrow();
    });

    it('should throw ValidationError for undefined', () => {
      expect(() => Validator.validateRequired(undefined, 'Field')).toThrow('Field is required');
    });

    it('should throw ValidationError for null', () => {
      expect(() => Validator.validateRequired(null, 'Field')).toThrow('Field is required');
    });

    it('should throw ValidationError for empty string', () => {
      expect(() => Validator.validateRequired('', 'Field')).toThrow('Field is required');
    });
  });
});
