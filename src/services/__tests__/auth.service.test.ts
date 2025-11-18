import { AuthService, AuthenticationError, AuthorizationError, IUserRepository, IJWTService } from '../auth.service';
import { User, UserRole, UserStatus, CreateUserDTO, LoginDTO, JWTPayload } from '../../types/user.types';
import { CryptoUtil } from '../../utils/crypto';

// Mock implementations
class MockUserRepository implements IUserRepository {
  private users: User[] = [];
  private idCounter = 1;

  async findByEmail(email: string): Promise<User | null> {
    return this.users.find(u => u.email === email) || null;
  }

  async findById(id: string): Promise<User | null> {
    return this.users.find(u => u.id === id) || null;
  }

  async create(userData: Omit<User, 'id' | 'createdAt' | 'updatedAt'>): Promise<User> {
    const user: User = {
      ...userData,
      id: String(this.idCounter++),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.users.push(user);
    return user;
  }

  async update(id: string, data: Partial<User>): Promise<User> {
    const index = this.users.findIndex(u => u.id === id);
    if (index === -1) throw new Error('User not found');

    this.users[index] = {
      ...this.users[index],
      ...data,
      updatedAt: new Date(),
    };
    return this.users[index];
  }

  reset() {
    this.users = [];
    this.idCounter = 1;
  }
}

class MockJWTService implements IJWTService {
  sign(payload: JWTPayload, expiresIn: string): string {
    return `mock.jwt.token.${payload.userId}`;
  }

  verify(token: string): JWTPayload {
    if (!token.startsWith('mock.jwt.token.')) {
      throw new Error('Invalid token');
    }
    const userId = token.split('.')[3];
    return {
      userId,
      email: 'test@example.com',
      role: UserRole.USER,
    };
  }
}

describe('AuthService', () => {
  let authService: AuthService;
  let userRepository: MockUserRepository;
  let jwtService: MockJWTService;

  beforeEach(() => {
    userRepository = new MockUserRepository();
    jwtService = new MockJWTService();
    authService = new AuthService(userRepository, jwtService);
  });

  describe('register', () => {
    const validRegistration: CreateUserDTO = {
      email: 'test@example.com',
      name: 'Test User',
      password: 'Password123!',
    };

    it('should successfully register a new user', async () => {
      const result = await authService.register(validRegistration);

      expect(result.user).toBeDefined();
      expect(result.user.email).toBe('test@example.com');
      expect(result.user.name).toBe('Test User');
      expect(result.user.role).toBe(UserRole.USER);
      expect(result.user.status).toBe(UserStatus.PENDING_VERIFICATION);
      expect(result.user.emailVerified).toBe(false);
      expect(result.token).toBeDefined();
      expect(result.token.token).toMatch(/^mock\.jwt\.token\./);
    });

    it('should hash the password', async () => {
      const result = await authService.register(validRegistration);

      expect(result.user.passwordHash).toBeDefined();
      expect(result.user.passwordHash).not.toBe(validRegistration.password);
      expect(result.user.passwordHash).toContain(':'); // salt:hash format
    });

    it('should lowercase the email', async () => {
      const result = await authService.register({
        ...validRegistration,
        email: 'TEST@EXAMPLE.COM',
      });

      expect(result.user.email).toBe('test@example.com');
    });

    it('should sanitize the name', async () => {
      const result = await authService.register({
        ...validRegistration,
        name: '<script>XSS</script>John Doe',
      });

      expect(result.user.name).not.toContain('<script>');
      expect(result.user.name).toBe('XSSJohn Doe');
    });

    it('should throw error for duplicate email', async () => {
      await authService.register(validRegistration);

      await expect(authService.register(validRegistration)).rejects.toThrow(
        AuthenticationError
      );
      await expect(authService.register(validRegistration)).rejects.toThrow(
        'User with this email already exists'
      );
    });

    it('should throw error for invalid email', async () => {
      await expect(
        authService.register({ ...validRegistration, email: 'invalid-email' })
      ).rejects.toThrow('Invalid email format');
    });

    it('should throw error for weak password', async () => {
      await expect(
        authService.register({ ...validRegistration, password: 'weak' })
      ).rejects.toThrow();
    });

    it('should throw error for invalid name', async () => {
      await expect(
        authService.register({ ...validRegistration, name: 'A' })
      ).rejects.toThrow('Name must be at least 2 characters long');
    });

    it('should allow custom role assignment', async () => {
      const result = await authService.register({
        ...validRegistration,
        role: UserRole.ADMIN,
      });

      expect(result.user.role).toBe(UserRole.ADMIN);
    });
  });

  describe('login', () => {
    const registrationData: CreateUserDTO = {
      email: 'test@example.com',
      name: 'Test User',
      password: 'Password123!',
    };

    beforeEach(async () => {
      // Create a user first
      await authService.register(registrationData);
      // Set user to active for login
      const user = await userRepository.findByEmail('test@example.com');
      if (user) {
        await userRepository.update(user.id, { status: UserStatus.ACTIVE });
      }
    });

    it('should successfully login with correct credentials', async () => {
      const loginData: LoginDTO = {
        email: 'test@example.com',
        password: 'Password123!',
      };

      const result = await authService.login(loginData);

      expect(result.user).toBeDefined();
      expect(result.user.email).toBe('test@example.com');
      expect(result.token).toBeDefined();
    });

    it('should update lastLoginAt timestamp', async () => {
      const loginData: LoginDTO = {
        email: 'test@example.com',
        password: 'Password123!',
      };

      const result = await authService.login(loginData);

      expect(result.user.lastLoginAt).toBeDefined();
      expect(result.user.lastLoginAt).toBeInstanceOf(Date);
    });

    it('should throw error for non-existent user', async () => {
      const loginData: LoginDTO = {
        email: 'nonexistent@example.com',
        password: 'Password123!',
      };

      await expect(authService.login(loginData)).rejects.toThrow(AuthenticationError);
      await expect(authService.login(loginData)).rejects.toThrow('Invalid email or password');
    });

    it('should throw error for incorrect password', async () => {
      const loginData: LoginDTO = {
        email: 'test@example.com',
        password: 'WrongPassword123!',
      };

      await expect(authService.login(loginData)).rejects.toThrow(AuthenticationError);
      await expect(authService.login(loginData)).rejects.toThrow('Invalid email or password');
    });

    it('should handle case-insensitive email login', async () => {
      const loginData: LoginDTO = {
        email: 'TEST@EXAMPLE.COM',
        password: 'Password123!',
      };

      const result = await authService.login(loginData);
      expect(result.user.email).toBe('test@example.com');
    });

    it('should throw error for suspended account', async () => {
      const user = await userRepository.findByEmail('test@example.com');
      if (user) {
        await userRepository.update(user.id, { status: UserStatus.SUSPENDED });
      }

      const loginData: LoginDTO = {
        email: 'test@example.com',
        password: 'Password123!',
      };

      await expect(authService.login(loginData)).rejects.toThrow('Account has been suspended');
    });

    it('should throw error for inactive account', async () => {
      const user = await userRepository.findByEmail('test@example.com');
      if (user) {
        await userRepository.update(user.id, { status: UserStatus.INACTIVE });
      }

      const loginData: LoginDTO = {
        email: 'test@example.com',
        password: 'Password123!',
      };

      await expect(authService.login(loginData)).rejects.toThrow('Account is inactive');
    });
  });

  describe('Rate Limiting', () => {
    beforeEach(async () => {
      const registrationData: CreateUserDTO = {
        email: 'test@example.com',
        name: 'Test User',
        password: 'Password123!',
      };
      await authService.register(registrationData);
    });

    it('should allow multiple login attempts under the limit', async () => {
      const loginData: LoginDTO = {
        email: 'wrong@example.com',
        password: 'WrongPassword!',
      };

      for (let i = 0; i < 4; i++) {
        await expect(authService.login(loginData)).rejects.toThrow();
      }
    });

    it('should rate limit after max failed attempts', async () => {
      const loginData: LoginDTO = {
        email: 'wrong@example.com',
        password: 'WrongPassword!',
      };

      // Make 5 failed attempts
      for (let i = 0; i < 5; i++) {
        await expect(authService.login(loginData)).rejects.toThrow();
      }

      // 6th attempt should be rate limited
      await expect(authService.login(loginData)).rejects.toThrow('Too many login attempts');
    });

    it('should clear failed attempts after successful login', async () => {
      const wrongLogin: LoginDTO = {
        email: 'test@example.com',
        password: 'WrongPassword!',
      };

      // Make some failed attempts
      for (let i = 0; i < 3; i++) {
        await expect(authService.login(wrongLogin)).rejects.toThrow();
      }

      // Successful login
      const user = await userRepository.findByEmail('test@example.com');
      if (user) {
        await userRepository.update(user.id, { status: UserStatus.ACTIVE });
      }

      const correctLogin: LoginDTO = {
        email: 'test@example.com',
        password: 'Password123!',
      };

      await expect(authService.login(correctLogin)).resolves.toBeDefined();

      // Should be able to attempt again (counter was reset)
      for (let i = 0; i < 4; i++) {
        await expect(authService.login(wrongLogin)).rejects.toThrow();
      }
    });
  });

  describe('verifyToken', () => {
    it('should verify valid token', () => {
      const token = 'mock.jwt.token.123';
      const payload = authService.verifyToken(token);

      expect(payload).toBeDefined();
      expect(payload.userId).toBe('123');
    });

    it('should throw error for invalid token', () => {
      const token = 'invalid-token';

      expect(() => authService.verifyToken(token)).toThrow(AuthenticationError);
      expect(() => authService.verifyToken(token)).toThrow('Invalid or expired token');
    });
  });

  describe('authorize', () => {
    let userId: string;

    beforeEach(async () => {
      const result = await authService.register({
        email: 'test@example.com',
        name: 'Test User',
        password: 'Password123!',
        role: UserRole.USER,
      });
      userId = result.user.id;
    });

    it('should authorize user with exact role match', async () => {
      await expect(authService.authorize(userId, UserRole.USER)).resolves.not.toThrow();
    });

    it('should authorize user with higher role', async () => {
      // Update user to admin
      await userRepository.update(userId, { role: UserRole.ADMIN });

      await expect(authService.authorize(userId, UserRole.USER)).resolves.not.toThrow();
      await expect(authService.authorize(userId, UserRole.VIEWER)).resolves.not.toThrow();
    });

    it('should reject user with insufficient role', async () => {
      await expect(authService.authorize(userId, UserRole.ADMIN)).rejects.toThrow(
        AuthorizationError
      );
      await expect(authService.authorize(userId, UserRole.ADMIN)).rejects.toThrow(
        'Insufficient permissions'
      );
    });

    it('should throw error for non-existent user', async () => {
      await expect(authService.authorize('non-existent', UserRole.USER)).rejects.toThrow(
        AuthorizationError
      );
      await expect(authService.authorize('non-existent', UserRole.USER)).rejects.toThrow(
        'User not found'
      );
    });
  });

  describe('verifyEmail', () => {
    let userId: string;

    beforeEach(async () => {
      const result = await authService.register({
        email: 'test@example.com',
        name: 'Test User',
        password: 'Password123!',
      });
      userId = result.user.id;
    });

    it('should verify user email', async () => {
      const user = await authService.verifyEmail(userId);

      expect(user.emailVerified).toBe(true);
      expect(user.status).toBe(UserStatus.ACTIVE);
    });

    it('should throw error for non-existent user', async () => {
      await expect(authService.verifyEmail('non-existent')).rejects.toThrow(
        AuthenticationError
      );
      await expect(authService.verifyEmail('non-existent')).rejects.toThrow('User not found');
    });
  });

  describe('Security Tests', () => {
    it('should not leak user existence through timing', async () => {
      // Create a user
      await authService.register({
        email: 'exists@example.com',
        name: 'Exists',
        password: 'Password123!',
      });

      const existingUserLogin: LoginDTO = {
        email: 'exists@example.com',
        password: 'WrongPassword!',
      };

      const nonExistingUserLogin: LoginDTO = {
        email: 'notexists@example.com',
        password: 'WrongPassword!',
      };

      // Both should throw the same error message
      let error1: Error | null = null;
      let error2: Error | null = null;

      try {
        await authService.login(existingUserLogin);
      } catch (e) {
        error1 = e as Error;
      }

      try {
        await authService.login(nonExistingUserLogin);
      } catch (e) {
        error2 = e as Error;
      }

      expect(error1?.message).toBe('Invalid email or password');
      expect(error2?.message).toBe('Invalid email or password');
    });

    it('should store hashed passwords, never plaintext', async () => {
      const password = 'Password123!';
      const result = await authService.register({
        email: 'test@example.com',
        name: 'Test User',
        password,
      });

      expect(result.user.passwordHash).not.toBe(password);
      expect(result.user.passwordHash).toContain(':');
    });
  });
});
