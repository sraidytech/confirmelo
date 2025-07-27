export interface User {
  id: string;
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  phone?: string;
  avatar?: string;
  role: UserRole;
  status: UserStatus;
  isOnline: boolean;
  lastActiveAt?: string;
  organizationId?: string;
  organization?: Organization;
  createdAt: string;
  updatedAt: string;
}

export interface Organization {
  id: string;
  name: string;
  code: string;
  logo?: string;
  website?: string;
  phone?: string;
  email: string;
  address?: string;
  city?: string;
  country: string;
  timezone: string;
  currency: Currency;
  taxId?: string;
  billingEmail?: string;
  createdAt: string;
  updatedAt: string;
}

export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  ADMIN = 'ADMIN',
  TEAM_LEADER = 'TEAM_LEADER',
  CALL_CENTER_AGENT = 'CALL_CENTER_AGENT',
  FOLLOWUP_AGENT = 'FOLLOWUP_AGENT',
  CLIENT_ADMIN = 'CLIENT_ADMIN',
  CLIENT_USER = 'CLIENT_USER',
}

export enum UserStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  PENDING = 'PENDING',
}

export enum Currency {
  USD = 'USD',
  EUR = 'EUR',
  CAD = 'CAD',
  MAD = 'MAD',
}

export interface LoginCredentials {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface RegisterData {
  // Organization details
  organizationName: string;
  organizationEmail: string;
  organizationPhone?: string;
  organizationAddress?: string;
  organizationCity?: string;
  organizationCountry: string;
  organizationWebsite?: string;
  organizationTaxId?: string;
  
  // Admin user details
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  phone?: string;
}

export interface AuthResult {
  user: User;
  tokens: TokenPair;
  sessionId: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface PasswordResetRequest {
  email: string;
}

export interface PasswordResetConfirm {
  token: string;
  newPassword: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface ApiError {
  type: string;
  message: string;
  code: string;
  correlationId: string;
  details?: Record<string, any>;
}

export interface ValidationError {
  field: string;
  message: string;
}

export interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (credentials: LoginCredentials) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  confirmPasswordReset: (token: string, newPassword: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
}

export interface FormState {
  loading: boolean;
  error: string | null;
  success: string | null;
}

export interface PasswordStrength {
  score: number;
  strength: 'weak' | 'medium' | 'strong';
  feedback: string[];
}