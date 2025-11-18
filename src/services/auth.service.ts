import { User, CreateUserDTO, LoginDTO, AuthToken, JWTPayload, UserRole, UserStatus } from '../types/user.types';
import { CryptoUtil } from '../utils/crypto';
import { Validator } from '../utils/validation';

export class AuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthorizationError';
  }
}

export interface IUserRepository {
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  create(user: Omit<User, 'id' | 'createdAt' | 'updatedAt'>): Promise<User>;
  update(id: string, data: Partial<User>): Promise<User>;
}

export interface IJWTService {
  sign(payload: JWTPayload, expiresIn: string): string;
  verify(token: string): JWTPayload;
}

export class AuthService {
  private readonly TOKEN_EXPIRY = '24h';
  private readonly REFRESH_TOKEN_EXPIRY = '7d';
  private readonly MAX_LOGIN_ATTEMPTS = 5;
  private readonly LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes

  private loginAttempts: Map<string, { count: number; lastAttempt: Date }> = new Map();

  constructor(
    private userRepository: IUserRepository,
    private jwtService: IJWTService
  ) {}

  /**
   * Register a new user
   */
  async register(dto: CreateUserDTO): Promise<{ user: User; token: AuthToken }> {
    // Validate input
    Validator.validateEmail(dto.email);
    Validator.validatePassword(dto.password);
    Validator.validateName(dto.name);

    // Check if user already exists
    const existingUser = await this.userRepository.findByEmail(dto.email);
    if (existingUser) {
      throw new AuthenticationError('User with this email already exists');
    }

    // Hash password
    const passwordHash = await CryptoUtil.hashPassword(dto.password);

    // Create user
    const user = await this.userRepository.create({
      email: dto.email.toLowerCase(),
      name: Validator.sanitizeString(dto.name),
      passwordHash,
      role: dto.role || UserRole.USER,
      status: UserStatus.PENDING_VERIFICATION,
      emailVerified: false,
    });

    // Generate token
    const token = this.generateToken(user);

    return { user, token };
  }

  /**
   * Login user
   */
  async login(dto: LoginDTO): Promise<{ user: User; token: AuthToken }> {
    Validator.validateEmail(dto.email);
    Validator.validateRequired(dto.password, 'Password');

    const email = dto.email.toLowerCase();

    // Check rate limiting
    this.checkRateLimit(email);

    // Find user
    const user = await this.userRepository.findByEmail(email);
    if (!user) {
      this.recordFailedAttempt(email);
      throw new AuthenticationError('Invalid email or password');
    }

    // Verify password
    const isValidPassword = await CryptoUtil.verifyPassword(dto.password, user.passwordHash);
    if (!isValidPassword) {
      this.recordFailedAttempt(email);
      throw new AuthenticationError('Invalid email or password');
    }

    // Check user status
    if (user.status === UserStatus.SUSPENDED) {
      throw new AuthenticationError('Account has been suspended');
    }

    if (user.status === UserStatus.INACTIVE) {
      throw new AuthenticationError('Account is inactive');
    }

    // Clear login attempts
    this.loginAttempts.delete(email);

    // Update last login
    const updatedUser = await this.userRepository.update(user.id, {
      lastLoginAt: new Date(),
    });

    // Generate token
    const token = this.generateToken(updatedUser);

    return { user: updatedUser, token };
  }

  /**
   * Verify JWT token
   */
  verifyToken(token: string): JWTPayload {
    try {
      return this.jwtService.verify(token);
    } catch (error) {
      throw new AuthenticationError('Invalid or expired token');
    }
  }

  /**
   * Check if user has required role
   */
  async authorize(userId: string, requiredRole: UserRole): Promise<void> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new AuthorizationError('User not found');
    }

    const roleHierarchy = {
      [UserRole.ADMIN]: 3,
      [UserRole.USER]: 2,
      [UserRole.VIEWER]: 1,
    };

    if (roleHierarchy[user.role] < roleHierarchy[requiredRole]) {
      throw new AuthorizationError('Insufficient permissions');
    }
  }

  /**
   * Verify email
   */
  async verifyEmail(userId: string): Promise<User> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new AuthenticationError('User not found');
    }

    return await this.userRepository.update(userId, {
      emailVerified: true,
      status: UserStatus.ACTIVE,
    });
  }

  /**
   * Generate JWT token
   */
  private generateToken(user: User): AuthToken {
    const payload: JWTPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
    };

    const token = this.jwtService.sign(payload, this.TOKEN_EXPIRY);
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    return {
      token,
      expiresAt,
      userId: user.id,
    };
  }

  /**
   * Check rate limiting for login attempts
   */
  private checkRateLimit(email: string): void {
    const attempts = this.loginAttempts.get(email);

    if (attempts) {
      const timeSinceLastAttempt = Date.now() - attempts.lastAttempt.getTime();

      if (attempts.count >= this.MAX_LOGIN_ATTEMPTS) {
        if (timeSinceLastAttempt < this.LOCKOUT_DURATION) {
          const remainingTime = Math.ceil((this.LOCKOUT_DURATION - timeSinceLastAttempt) / 1000 / 60);
          throw new AuthenticationError(
            `Too many login attempts. Please try again in ${remainingTime} minutes`
          );
        } else {
          // Reset after lockout duration
          this.loginAttempts.delete(email);
        }
      }
    }
  }

  /**
   * Record failed login attempt
   */
  private recordFailedAttempt(email: string): void {
    const attempts = this.loginAttempts.get(email);

    if (attempts) {
      attempts.count++;
      attempts.lastAttempt = new Date();
    } else {
      this.loginAttempts.set(email, {
        count: 1,
        lastAttempt: new Date(),
      });
    }
  }
}
