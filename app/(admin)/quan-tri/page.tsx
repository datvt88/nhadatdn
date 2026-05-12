'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BrandLogo } from '../../../components/brand-logo';
import { HeaderNav } from '../../../components/header-nav';
import { API_BASE } from '../../../lib/api';
import { authHeaders, hasAdminAccess, readAuthUser, subscribeAuthUser, writeAuthUser, type AuthUser } from '../../../lib/auth-session';

type DashboardMetrics = {
  totalUsers: number;
  totalListings: number;
  activeListings: number;
  soldListings: number;
  rentedListings: number;
  archivedListings: number;
  newUsers7d: number;
  newListings7d: number;
  needsReview: number;
};

type ModerationLog = {
  id: number;
  listingId: number;
  listingTitle: string;
  action: string;
  reason: string;
  source: string;
  actorUserId: number;
  actorRole: string;
  createdAt: string;
};

type DashboardResponse = {
  metrics?: DashboardMetrics;
  recentModerationLogs?: ModerationLog[];
  error?: string;
};

type AuthProvidersConfig = {
  googleEnabled: boolean;
  googleClientId: string;
  updatedAt: string;
  error?: string;
};

type GlobalGoogleTagConfig = {
  enabled: boolean;
  googleTagId: string;
  updatedAt: string;
  error?: string;
};

type ModerationAIConfig = {
  enabled: boolean;
  endpoint: string;
  model: string;
  timeoutSeconds: number;
  hasApiKey: boolean;
  apiKeyMasked: string;
  updatedAt: string;
  error?: string;
};

type R2StorageConfig = {
  enabled: boolean;
  accountId: string;
  accessKeyId: string;
  hasSecretAccessKey: boolean;
  secretAccessKeyMasked: string;
  bucketName: string;
  publicBaseUrl: string;
  region: string;
  updatedAt: string;
  error?: string;
};

type GoogleDriveBackupConfig = {
  enabled: boolean;
  clientId: string;
  hasClientSecret: boolean;
  clientSecretMasked: string;
  hasRefreshToken: boolean;
  refreshTokenMasked: string;
  folderId: string;
  scheduleHour: number;
  retentionDays: number;
  lastBackupAt: string;
  lastStatus: string;
  lastError: string;
  updatedAt: string;
  error?: string;
};

type GoogleDriveBackupRunResult = {
  fileName?: string;
  driveFileId?: string;
  sizeBytes?: number;
  deletedOldBackups?: number;
  completedAt?: string;
  error?: string;
};

const emptyMetrics: DashboardMetrics = {
  totalUsers: 0,
  totalListings: 0,
  activeListings: 0,
  soldListings: 0,
  rentedListings: 0,
  archivedListings: 0,
  newUsers7d: 0,
  newListings7d: 0,
  needsReview: 0,
};

const emptyModerationAIConfig: ModerationAIConfig = {
  enabled: false,
  endpoint: '',
  model: 'gpt-4o-mini',
  timeoutSeconds: 15,
  hasApiKey: false,
  apiKeyMasked: '',
  updatedAt: '',
};

const emptyR2StorageConfig: R2StorageConfig = {
  enabled: false,
  accountId: '',
  accessKeyId: '',
  hasSecretAccessKey: false,
  secretAccessKeyMasked: '',
  bucketName: '',
  publicBaseUrl: '',
  region: 'auto',
  updatedAt: '',
};

const emptyGoogleDriveBackupConfig: GoogleDriveBackupConfig = {
  enabled: false,
  clientId: '',
  hasClientSecret: false,
  clientSecretMasked: '',
  hasRefreshToken: false,
  refreshTokenMasked: '',
  folderId: '',
  scheduleHour: 2,
  retentionDays: 7,
  lastBackupAt: '',
  lastStatus: '',
  lastError: '',
  updatedAt: '',
};

function actionBadgeClass(action: string): string {
  const normalized = action.trim().toUpperCase();
  if (normalized === 'ARCHIVE' || normalized === 'REMOVE') {
    return 'bg-rose-100 text-rose-700';
  }
  if (normalized === 'RECATEGORIZE') {
    return 'bg-amber-100 text-amber-700';
  }
  if (normalized === 'SET_STATUS') {
    return 'bg-cyan-100 text-cyan-700';
  }
  return 'bg-slate-100 text-slate-700';
}

function normalizeTimeout(value: number): number {
  if (!Number.isFinite(value)) return 15;
  if (value < 3) return 3;
  if (value > 120) return 120;
  return Math.round(value);
}

function normalizeScheduleHour(value: number): number {
  if (!Number.isFinite(value)) return 2;
  if (value < 0) return 0;
  if (value > 23) return 23;
  return Math.round(value);
}

function normalizeRetentionDays(value: number): number {
  if (!Number.isFinite(value)) return 7;
  if (value < 1) return 7;
  if (value > 365) return 365;
  return Math.round(value);
}

function formatBytes(value?: number): string {
  if (!value || value <= 0) return '0 B';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(2)} MB`;
}

export default function AdminHomePage() {
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(false);
  const [metrics, setMetrics] = useState<DashboardMetrics>(emptyMetrics);
  const [logs, setLogs] = useState<ModerationLog[]>([]);
  const [message, setMessage] = useState('');

  const [authProvidersConfig, setAuthProvidersConfig] = useState<AuthProvidersConfig>({ googleEnabled: false, googleClientId: '', updatedAt: '' });
  const [savingAuthProvidersConfig, setSavingAuthProvidersConfig] = useState(false);
  const [globalGoogleTagConfig, setGlobalGoogleTagConfig] = useState<GlobalGoogleTagConfig>({ enabled: false, googleTagId: '', updatedAt: '' });
  const [savingGlobalGoogleTagConfig, setSavingGlobalGoogleTagConfig] = useState(false);

  const [aiConfig, setAiConfig] = useState<ModerationAIConfig>(emptyModerationAIConfig);
  const [aiApiKeyInput, setAiApiKeyInput] = useState('');
  const [clearStoredApiKey, setClearStoredApiKey] = useState(false);
  const [savingAiConfig, setSavingAiConfig] = useState(false);

  const [r2Config, setR2Config] = useState<R2StorageConfig>(emptyR2StorageConfig);
  const [r2SecretAccessKeyInput, setR2SecretAccessKeyInput] = useState('');
  const [clearStoredR2Secret, setClearStoredR2Secret] = useState(false);
  const [savingR2Config, setSavingR2Config] = useState(false);

  const [googleDriveBackupConfig, setGoogleDriveBackupConfig] = useState<GoogleDriveBackupConfig>(emptyGoogleDriveBackupConfig);
  const [googleDriveClientSecretInput, setGoogleDriveClientSecretInput] = useState('');
  const [googleDriveRefreshTokenInput, setGoogleDriveRefreshTokenInput] = useState('');
  const [clearStoredGoogleDriveClientSecret, setClearStoredGoogleDriveClientSecret] = useState(false);
  const [clearStoredGoogleDriveRefreshToken, setClearStoredGoogleDriveRefreshToken] = useState(false);
  const [savingGoogleDriveBackupConfig, setSavingGoogleDriveBackupConfig] = useState(false);
  const [runningGoogleDriveBackup, setRunningGoogleDriveBackup] = useState(false);

  useEffect(() => {
    const syncUser = (): void => {
      setUser(readAuthUser());
      setHydrated(true);
    };

    syncUser();
    return subscribeAuthUser(syncUser);
  }, []);

  useEffect(() => {
    if (hydrated && !hasAdminAccess(user?.role)) {
      router.replace('/dang-nhap?next=/quan-tri');
    }
  }, [hydrated, router, user]);

  function handleUnauthorized(status: number): boolean {
    if (status !== 401) return false;
    writeAuthUser(null);
    setMessage('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
    router.replace('/dang-nhap?next=/quan-tri');
    return true;
  }

  async function loadDashboard() {
    if (!hasAdminAccess(user?.role)) {
      return;
    }
    setLoading(true);
    setMessage('');
    try {
      const res = await fetch(`${API_BASE}/admin/dashboard/metrics`, {
        headers: authHeaders(readAuthUser()),
        cache: 'no-store',
      });
      const payload = (await res.json().catch(() => ({}))) as DashboardResponse;
      if (handleUnauthorized(res.status)) {
        return;
      }
      if (!res.ok) {
        setMessage(`Lỗi tải dashboard: ${String(payload.error ?? 'unknown')}`);
        return;
      }
      setMetrics(payload.metrics ?? emptyMetrics);
      setLogs(payload.recentModerationLogs ?? []);
    } finally {
      setLoading(false);
    }
  }

  async function loadAuthProvidersConfig() {
    if (!hasAdminAccess(user?.role)) {
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/admin/auth/providers`, {
        headers: authHeaders(readAuthUser()),
        cache: 'no-store',
      });
      const payload = (await res.json().catch(() => ({}))) as AuthProvidersConfig;
      if (handleUnauthorized(res.status)) {
        return;
      }
      if (!res.ok) {
        setMessage(`Lỗi tải cấu hình Google đăng nhập: ${String(payload.error ?? 'unknown')}`);
        return;
      }
      setAuthProvidersConfig({
        googleEnabled: Boolean(payload.googleEnabled),
        googleClientId: typeof payload.googleClientId === 'string' ? payload.googleClientId : '',
        updatedAt: typeof payload.updatedAt === 'string' ? payload.updatedAt : '',
      });
    } catch {
      setMessage('Không thể tải cấu hình Google đăng nhập.');
    }
  }

  async function loadGlobalGoogleTagConfig() {
    if (!hasAdminAccess(user?.role)) {
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/admin/tracking/global`, {
        headers: authHeaders(readAuthUser()),
        cache: 'no-store',
      });
      const payload = (await res.json().catch(() => ({}))) as GlobalGoogleTagConfig;
      if (handleUnauthorized(res.status)) {
        return;
      }
      if (!res.ok) {
        setMessage(`Lỗi tải cấu hình Google tag toàn site: ${String(payload.error ?? 'unknown')}`);
        return;
      }
      setGlobalGoogleTagConfig({
        enabled: Boolean(payload.enabled),
        googleTagId: typeof payload.googleTagId === 'string' ? payload.googleTagId : '',
        updatedAt: typeof payload.updatedAt === 'string' ? payload.updatedAt : '',
      });
    } catch {
      setMessage('Không thể tải cấu hình Google tag toàn site.');
    }
  }

  async function saveGlobalGoogleTagConfig() {
    if (!hasAdminAccess(user?.role) || savingGlobalGoogleTagConfig) {
      return;
    }

    setSavingGlobalGoogleTagConfig(true);
    try {
      const res = await fetch(`${API_BASE}/admin/tracking/global`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          ...authHeaders(readAuthUser()),
        },
        body: JSON.stringify({
          enabled: Boolean(globalGoogleTagConfig.enabled),
          googleTagId: globalGoogleTagConfig.googleTagId.trim(),
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as GlobalGoogleTagConfig;
      if (handleUnauthorized(res.status)) {
        return;
      }
      if (!res.ok) {
        setMessage(`Lỗi lưu Google tag toàn site: ${String(payload.error ?? 'unknown')}`);
        return;
      }
      setGlobalGoogleTagConfig({
        enabled: Boolean(payload.enabled),
        googleTagId: typeof payload.googleTagId === 'string' ? payload.googleTagId : '',
        updatedAt: typeof payload.updatedAt === 'string' ? payload.updatedAt : '',
      });
      setMessage('Đã cập nhật Google tag toàn site cho toàn bộ webapp.');
    } catch {
      setMessage('Không thể lưu Google tag toàn site.');
    } finally {
      setSavingGlobalGoogleTagConfig(false);
    }
  }

  async function saveAuthProvidersConfig() {
    if (!hasAdminAccess(user?.role) || savingAuthProvidersConfig) {
      return;
    }

    setSavingAuthProvidersConfig(true);
    try {
      const res = await fetch(`${API_BASE}/admin/auth/providers`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          ...authHeaders(readAuthUser()),
        },
        body: JSON.stringify({
          googleEnabled: Boolean(authProvidersConfig.googleEnabled),
          googleClientId: authProvidersConfig.googleClientId.trim(),
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as AuthProvidersConfig;
      if (handleUnauthorized(res.status)) {
        return;
      }
      if (!res.ok) {
        setMessage(`Lỗi lưu cấu hình Google đăng nhập: ${String(payload.error ?? 'unknown')}`);
        return;
      }
      setAuthProvidersConfig({
        googleEnabled: Boolean(payload.googleEnabled),
        googleClientId: typeof payload.googleClientId === 'string' ? payload.googleClientId : '',
        updatedAt: typeof payload.updatedAt === 'string' ? payload.updatedAt : '',
      });
      setMessage('Đã cập nhật cấu hình Google đăng nhập cho user.');
    } catch {
      setMessage('Không thể lưu cấu hình Google đăng nhập.');
    } finally {
      setSavingAuthProvidersConfig(false);
    }
  }

  async function loadModerationAIConfig() {
    if (!hasAdminAccess(user?.role)) {
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/admin/moderation/config`, {
        headers: authHeaders(readAuthUser()),
        cache: 'no-store',
      });
      const payload = (await res.json().catch(() => ({}))) as ModerationAIConfig;
      if (handleUnauthorized(res.status)) {
        return;
      }
      if (!res.ok) {
        setMessage(`Lỗi tải cấu hình AI moderation: ${String(payload.error ?? 'unknown')}`);
        return;
      }
      setAiConfig({
        enabled: Boolean(payload.enabled),
        endpoint: typeof payload.endpoint === 'string' ? payload.endpoint : '',
        model: typeof payload.model === 'string' && payload.model.trim() !== '' ? payload.model : 'gpt-4o-mini',
        timeoutSeconds: normalizeTimeout(Number(payload.timeoutSeconds)),
        hasApiKey: Boolean(payload.hasApiKey),
        apiKeyMasked: typeof payload.apiKeyMasked === 'string' ? payload.apiKeyMasked : '',
        updatedAt: typeof payload.updatedAt === 'string' ? payload.updatedAt : '',
      });
      setAiApiKeyInput('');
      setClearStoredApiKey(false);
    } catch {
      setMessage('Không thể tải cấu hình AI moderation.');
    }
  }

  async function saveModerationAIConfig() {
    if (!hasAdminAccess(user?.role) || savingAiConfig) {
      return;
    }

    setSavingAiConfig(true);
    try {
      const body: Record<string, unknown> = {
        enabled: Boolean(aiConfig.enabled),
        endpoint: aiConfig.endpoint.trim(),
        model: aiConfig.model.trim(),
        timeoutSeconds: normalizeTimeout(aiConfig.timeoutSeconds),
      };

      if (clearStoredApiKey) {
        body.apiKey = '';
      } else if (aiApiKeyInput.trim() !== '') {
        body.apiKey = aiApiKeyInput.trim();
      }

      const res = await fetch(`${API_BASE}/admin/moderation/config`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          ...authHeaders(readAuthUser()),
        },
        body: JSON.stringify(body),
      });

      const payload = (await res.json().catch(() => ({}))) as ModerationAIConfig;
      if (handleUnauthorized(res.status)) {
        return;
      }
      if (!res.ok) {
        setMessage(`Lỗi lưu cấu hình AI moderation: ${String(payload.error ?? 'unknown')}`);
        return;
      }

      setAiConfig({
        enabled: Boolean(payload.enabled),
        endpoint: typeof payload.endpoint === 'string' ? payload.endpoint : '',
        model: typeof payload.model === 'string' && payload.model.trim() !== '' ? payload.model : 'gpt-4o-mini',
        timeoutSeconds: normalizeTimeout(Number(payload.timeoutSeconds)),
        hasApiKey: Boolean(payload.hasApiKey),
        apiKeyMasked: typeof payload.apiKeyMasked === 'string' ? payload.apiKeyMasked : '',
        updatedAt: typeof payload.updatedAt === 'string' ? payload.updatedAt : '',
      });
      setAiApiKeyInput('');
      setClearStoredApiKey(false);
      setMessage('Đã cập nhật cấu hình AI moderation.');
    } catch {
      setMessage('Không thể lưu cấu hình AI moderation.');
    } finally {
      setSavingAiConfig(false);
    }
  }

  async function loadR2StorageConfig() {
    if (!hasAdminAccess(user?.role)) {
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/admin/storage/r2`, {
        headers: authHeaders(readAuthUser()),
        cache: 'no-store',
      });
      const payload = (await res.json().catch(() => ({}))) as R2StorageConfig;
      if (handleUnauthorized(res.status)) {
        return;
      }
      if (!res.ok) {
        setMessage(`Lỗi tải cấu hình R2 Storage: ${String(payload.error ?? 'unknown')}`);
        return;
      }
      setR2Config({
        enabled: Boolean(payload.enabled),
        accountId: typeof payload.accountId === 'string' ? payload.accountId : '',
        accessKeyId: typeof payload.accessKeyId === 'string' ? payload.accessKeyId : '',
        hasSecretAccessKey: Boolean(payload.hasSecretAccessKey),
        secretAccessKeyMasked: typeof payload.secretAccessKeyMasked === 'string' ? payload.secretAccessKeyMasked : '',
        bucketName: typeof payload.bucketName === 'string' ? payload.bucketName : '',
        publicBaseUrl: typeof payload.publicBaseUrl === 'string' ? payload.publicBaseUrl : '',
        region: typeof payload.region === 'string' && payload.region.trim() !== '' ? payload.region : 'auto',
        updatedAt: typeof payload.updatedAt === 'string' ? payload.updatedAt : '',
      });
      setR2SecretAccessKeyInput('');
      setClearStoredR2Secret(false);
    } catch {
      setMessage('Không thể tải cấu hình R2 Storage.');
    }
  }

  async function saveR2StorageConfig() {
    if (!hasAdminAccess(user?.role) || savingR2Config) {
      return;
    }

    setSavingR2Config(true);
    try {
      const body: Record<string, unknown> = {
        enabled: Boolean(r2Config.enabled),
        accountId: r2Config.accountId.trim(),
        accessKeyId: r2Config.accessKeyId.trim(),
        bucketName: r2Config.bucketName.trim(),
        publicBaseUrl: r2Config.publicBaseUrl.trim(),
        region: r2Config.region.trim() || 'auto',
      };

      if (clearStoredR2Secret) {
        body.secretAccessKey = '';
      } else if (r2SecretAccessKeyInput.trim() !== '') {
        body.secretAccessKey = r2SecretAccessKeyInput.trim();
      }

      const res = await fetch(`${API_BASE}/admin/storage/r2`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          ...authHeaders(readAuthUser()),
        },
        body: JSON.stringify(body),
      });
      const payload = (await res.json().catch(() => ({}))) as R2StorageConfig;
      if (handleUnauthorized(res.status)) {
        return;
      }
      if (!res.ok) {
        setMessage(`Lỗi lưu cấu hình R2 Storage: ${String(payload.error ?? 'unknown')}`);
        return;
      }

      setR2Config({
        enabled: Boolean(payload.enabled),
        accountId: typeof payload.accountId === 'string' ? payload.accountId : '',
        accessKeyId: typeof payload.accessKeyId === 'string' ? payload.accessKeyId : '',
        hasSecretAccessKey: Boolean(payload.hasSecretAccessKey),
        secretAccessKeyMasked: typeof payload.secretAccessKeyMasked === 'string' ? payload.secretAccessKeyMasked : '',
        bucketName: typeof payload.bucketName === 'string' ? payload.bucketName : '',
        publicBaseUrl: typeof payload.publicBaseUrl === 'string' ? payload.publicBaseUrl : '',
        region: typeof payload.region === 'string' && payload.region.trim() !== '' ? payload.region : 'auto',
        updatedAt: typeof payload.updatedAt === 'string' ? payload.updatedAt : '',
      });
      setR2SecretAccessKeyInput('');
      setClearStoredR2Secret(false);
      setMessage('Đã cập nhật cấu hình Cloudflare R2 Object Storage.');
    } catch {
      setMessage('Không thể lưu cấu hình R2 Storage.');
    } finally {
      setSavingR2Config(false);
    }
  }

  async function loadGoogleDriveBackupConfig() {
    if (!hasAdminAccess(user?.role)) {
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/admin/backups/google-drive`, {
        headers: authHeaders(readAuthUser()),
        cache: 'no-store',
      });
      const payload = (await res.json().catch(() => ({}))) as GoogleDriveBackupConfig;
      if (handleUnauthorized(res.status)) {
        return;
      }
      if (!res.ok) {
        setMessage(`Lỗi tải cấu hình Google Drive backup: ${String(payload.error ?? 'unknown')}`);
        return;
      }
      setGoogleDriveBackupConfig({
        enabled: Boolean(payload.enabled),
        clientId: typeof payload.clientId === 'string' ? payload.clientId : '',
        hasClientSecret: Boolean(payload.hasClientSecret),
        clientSecretMasked: typeof payload.clientSecretMasked === 'string' ? payload.clientSecretMasked : '',
        hasRefreshToken: Boolean(payload.hasRefreshToken),
        refreshTokenMasked: typeof payload.refreshTokenMasked === 'string' ? payload.refreshTokenMasked : '',
        folderId: typeof payload.folderId === 'string' ? payload.folderId : '',
        scheduleHour: normalizeScheduleHour(Number(payload.scheduleHour)),
        retentionDays: normalizeRetentionDays(Number(payload.retentionDays)),
        lastBackupAt: typeof payload.lastBackupAt === 'string' ? payload.lastBackupAt : '',
        lastStatus: typeof payload.lastStatus === 'string' ? payload.lastStatus : '',
        lastError: typeof payload.lastError === 'string' ? payload.lastError : '',
        updatedAt: typeof payload.updatedAt === 'string' ? payload.updatedAt : '',
      });
      setGoogleDriveClientSecretInput('');
      setGoogleDriveRefreshTokenInput('');
      setClearStoredGoogleDriveClientSecret(false);
      setClearStoredGoogleDriveRefreshToken(false);
    } catch {
      setMessage('Không thể tải cấu hình Google Drive backup.');
    }
  }

  async function saveGoogleDriveBackupConfig() {
    if (!hasAdminAccess(user?.role) || savingGoogleDriveBackupConfig) {
      return;
    }

    setSavingGoogleDriveBackupConfig(true);
    try {
      const body: Record<string, unknown> = {
        enabled: Boolean(googleDriveBackupConfig.enabled),
        clientId: googleDriveBackupConfig.clientId.trim(),
        folderId: googleDriveBackupConfig.folderId.trim(),
        scheduleHour: normalizeScheduleHour(googleDriveBackupConfig.scheduleHour),
        retentionDays: normalizeRetentionDays(googleDriveBackupConfig.retentionDays),
      };

      if (clearStoredGoogleDriveClientSecret) {
        body.clientSecret = '';
      } else if (googleDriveClientSecretInput.trim() !== '') {
        body.clientSecret = googleDriveClientSecretInput.trim();
      }
      if (clearStoredGoogleDriveRefreshToken) {
        body.refreshToken = '';
      } else if (googleDriveRefreshTokenInput.trim() !== '') {
        body.refreshToken = googleDriveRefreshTokenInput.trim();
      }

      const res = await fetch(`${API_BASE}/admin/backups/google-drive`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          ...authHeaders(readAuthUser()),
        },
        body: JSON.stringify(body),
      });
      const payload = (await res.json().catch(() => ({}))) as GoogleDriveBackupConfig;
      if (handleUnauthorized(res.status)) {
        return;
      }
      if (!res.ok) {
        setMessage(`Lỗi lưu cấu hình Google Drive backup: ${String(payload.error ?? 'unknown')}`);
        return;
      }
      setGoogleDriveBackupConfig({
        enabled: Boolean(payload.enabled),
        clientId: typeof payload.clientId === 'string' ? payload.clientId : '',
        hasClientSecret: Boolean(payload.hasClientSecret),
        clientSecretMasked: typeof payload.clientSecretMasked === 'string' ? payload.clientSecretMasked : '',
        hasRefreshToken: Boolean(payload.hasRefreshToken),
        refreshTokenMasked: typeof payload.refreshTokenMasked === 'string' ? payload.refreshTokenMasked : '',
        folderId: typeof payload.folderId === 'string' ? payload.folderId : '',
        scheduleHour: normalizeScheduleHour(Number(payload.scheduleHour)),
        retentionDays: normalizeRetentionDays(Number(payload.retentionDays)),
        lastBackupAt: typeof payload.lastBackupAt === 'string' ? payload.lastBackupAt : '',
        lastStatus: typeof payload.lastStatus === 'string' ? payload.lastStatus : '',
        lastError: typeof payload.lastError === 'string' ? payload.lastError : '',
        updatedAt: typeof payload.updatedAt === 'string' ? payload.updatedAt : '',
      });
      setGoogleDriveClientSecretInput('');
      setGoogleDriveRefreshTokenInput('');
      setClearStoredGoogleDriveClientSecret(false);
      setClearStoredGoogleDriveRefreshToken(false);
      setMessage('Đã cập nhật cấu hình sao lưu SQLite lên Google Drive.');
    } catch {
      setMessage('Không thể lưu cấu hình Google Drive backup.');
    } finally {
      setSavingGoogleDriveBackupConfig(false);
    }
  }

  async function runGoogleDriveBackupNow() {
    if (!hasAdminAccess(user?.role) || runningGoogleDriveBackup) {
      return;
    }

    setRunningGoogleDriveBackup(true);
    try {
      const res = await fetch(`${API_BASE}/admin/backups/google-drive`, {
        method: 'POST',
        headers: authHeaders(readAuthUser()),
      });
      const payload = (await res.json().catch(() => ({}))) as GoogleDriveBackupRunResult;
      if (handleUnauthorized(res.status)) {
        return;
      }
      if (!res.ok) {
        setMessage(`Lỗi chạy backup Google Drive: ${String(payload.error ?? 'unknown')}`);
        return;
      }
      setMessage(`Đã sao lưu ${payload.fileName ?? 'SQLite'} (${formatBytes(payload.sizeBytes)}) lên Google Drive.`);
      void loadGoogleDriveBackupConfig();
    } catch {
      setMessage('Không thể chạy backup Google Drive.');
    } finally {
      setRunningGoogleDriveBackup(false);
    }
  }

  useEffect(() => {
    if (hydrated && hasAdminAccess(user?.role)) {
      void loadDashboard();
      void loadAuthProvidersConfig();
      void loadGlobalGoogleTagConfig();
      void loadModerationAIConfig();
      void loadR2StorageConfig();
      void loadGoogleDriveBackupConfig();
    }
  }, [hydrated, user?.role]);

  const roleLabel = useMemo(() => (user?.role ?? '').toUpperCase(), [user?.role]);
  const aiReady = aiConfig.enabled && aiConfig.endpoint.trim() !== '' && aiConfig.hasApiKey;
  const r2Ready = r2Config.enabled && r2Config.accountId.trim() !== '' && r2Config.accessKeyId.trim() !== '' && r2Config.hasSecretAccessKey && r2Config.bucketName.trim() !== '';
  const googleDriveBackupReady =
    googleDriveBackupConfig.enabled &&
    googleDriveBackupConfig.clientId.trim() !== '' &&
    googleDriveBackupConfig.hasClientSecret &&
    googleDriveBackupConfig.hasRefreshToken;

  if (!hydrated) {
    return (
      <main>
        <HeaderNav />
        <section className="mx-auto max-w-7xl px-6 py-8 text-slate-600">Đang tải dashboard quản trị...</section>
      </main>
    );
  }

  if (!hasAdminAccess(user?.role)) {
    return null;
  }

  return (
    <main>
      <HeaderNav />
      <section className="admin-neo mx-auto max-w-7xl px-6 py-8">
        <div className="neo-hero rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-900 via-slate-800 to-cyan-900 p-6 text-white shadow-lg">
          <div className="mb-2 flex items-center justify-between gap-4">
            <p className="text-xs uppercase tracking-[0.18em] text-cyan-200">Bảng điều khiển Admin/Mod</p>
            <BrandLogo variant="dark" className="h-7 w-auto sm:h-8" />
          </div>
          <h1 className="mt-2 text-3xl font-extrabold">Quản trị vận hành NhadatDN</h1>
          <p className="mt-2 max-w-3xl text-sm text-cyan-100">
            Giám sát người dùng, tin đăng, kiểm duyệt nội dung và tác vụ AI trong một màn hình thống nhất.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
            <span className="rounded-full bg-white/10 px-3 py-1">Vai trò: {roleLabel}</span>
            <span className="rounded-full bg-white/10 px-3 py-1">Bean: {user?.beanBalance ?? 0}</span>
            <button
              type="button"
              onClick={() => {
                void loadDashboard();
                void loadAuthProvidersConfig();
                void loadGlobalGoogleTagConfig();
                void loadModerationAIConfig();
                void loadR2StorageConfig();
              }}
              className="rounded-full border border-white/30 px-3 py-1 hover:bg-white/10"
            >
              {loading ? 'Đang tải...' : 'Làm mới số liệu'}
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <article className="neo-card rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">Tổng Users</p>
            <p className="mt-2 text-3xl font-bold text-slate-900">{metrics.totalUsers.toLocaleString('vi-VN')}</p>
            <p className="mt-1 text-xs text-emerald-600">+{metrics.newUsers7d.toLocaleString('vi-VN')} trong 7 ngày</p>
          </article>
          <article className="neo-card rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">Tổng tin đăng</p>
            <p className="mt-2 text-3xl font-bold text-slate-900">{metrics.totalListings.toLocaleString('vi-VN')}</p>
            <p className="mt-1 text-xs text-cyan-700">+{metrics.newListings7d.toLocaleString('vi-VN')} trong 7 ngày</p>
          </article>
          <article className="neo-card rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">Tin đang hiển thị</p>
            <p className="mt-2 text-3xl font-bold text-slate-900">{metrics.activeListings.toLocaleString('vi-VN')}</p>
            <p className="mt-1 text-xs text-slate-500">Đã bán: {metrics.soldListings} | Đã thuê: {metrics.rentedListings}</p>
          </article>
          <article className="neo-card rounded-xl border border-amber-300 bg-amber-50 p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-amber-700">Cần kiểm duyệt</p>
            <p className="mt-2 text-3xl font-bold text-amber-900">{metrics.needsReview.toLocaleString('vi-VN')}</p>
            <p className="mt-1 text-xs text-amber-700">Lưu trữ: {metrics.archivedListings.toLocaleString('vi-VN')}</p>
          </article>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
            <h2 className="text-lg font-semibold text-slate-900">Trung tâm kiểm duyệt AI</h2>
            <p className="mt-1 text-sm text-slate-600">
              MOD có thể phân tích tự động, chuyển sai danh mục hoặc lưu trữ tin không phù hợp.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${aiReady ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                {aiReady ? 'AI API đã kết nối' : aiConfig.enabled ? 'AI đang bật nhưng thiếu cấu hình' : 'AI API chưa cấu hình'}
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">Model: {aiConfig.model || 'gpt-4o-mini'}</span>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">Timeout: {normalizeTimeout(aiConfig.timeoutSeconds)}s</span>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${r2Ready ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{r2Ready ? 'R2 Storage: Ready' : r2Config.enabled ? 'R2 thiếu cấu hình' : 'R2 đang tắt'}</span>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${googleDriveBackupReady ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{googleDriveBackupReady ? 'Google Drive backup: Ready' : googleDriveBackupConfig.enabled ? 'Google Drive backup thiếu cấu hình' : 'Google Drive backup đang tắt'}</span>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <Link href="/admin/listings" className="rounded-lg bg-slate-900 px-3 py-2 text-center text-sm font-semibold text-white hover:bg-slate-800">
                Mở kiểm duyệt tin đăng
              </Link>
              <Link href="/admin/users" className="rounded-lg border border-slate-300 px-3 py-2 text-center text-sm font-semibold text-slate-700 hover:bg-slate-50">
                Quản trị users và Bean
              </Link>
            </div>
          </article>

          <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Tác vụ nhanh</h2>
            <ul className="mt-3 space-y-2 text-sm text-slate-700">
              <li>1. Duyệt nhanh các tin cần kiểm duyệt.</li>
              <li>2. Chuẩn hóa danh mục mua-bán/cho-thuê.</li>
              <li>3. Lưu trữ các tin vi phạm chính sách.</li>
            </ul>
          </article>
        </div>

        <article className="neo-panel mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Google tag toàn site</h2>
          <p className="mt-1 text-sm text-slate-600">
            Cấu hình G-tag có hiệu lực cho toàn bộ webapp. Cấu hình này chạy song song với `Google Ads key` và `Facebook Ads key`
            trong dashboard từng user, không ghi đè các key theo tài khoản.
          </p>
          <div className="mt-4 grid gap-3 lg:grid-cols-[220px,1fr,180px] lg:items-end">
            <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={Boolean(globalGoogleTagConfig.enabled)}
                onChange={(event) =>
                  setGlobalGoogleTagConfig((prev) => ({
                    ...prev,
                    enabled: event.target.checked,
                  }))
                }
              />
              Bật Google tag toàn site
            </label>
            <label className="flex flex-col gap-1 text-sm text-slate-700">
              <span>Google tag ID</span>
              <input
                value={globalGoogleTagConfig.googleTagId}
                onChange={(event) =>
                  setGlobalGoogleTagConfig((prev) => ({
                    ...prev,
                    googleTagId: event.target.value.toUpperCase(),
                  }))
                }
                placeholder="Ví dụ: G-XXXXXXX hoặc AW-XXXXXXX"
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <button
              type="button"
              onClick={() => void saveGlobalGoogleTagConfig()}
              disabled={savingGlobalGoogleTagConfig}
              className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-700 disabled:opacity-60"
            >
              {savingGlobalGoogleTagConfig ? 'Đang lưu...' : 'Lưu G-tag'}
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Cập nhật gần nhất: {globalGoogleTagConfig.updatedAt ? new Date(globalGoogleTagConfig.updatedAt).toLocaleString('vi-VN') : 'chưa có'}
          </p>
        </article>

        <article className="neo-panel mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Cấu hình AI kiểm duyệt</h2>
          <p className="mt-1 text-sm text-slate-600">
            Cấu hình endpoint AI, API key, model và timeout để MOD_AI kiểm duyệt tin đăng tự động.
          </p>

          <div className="mt-4 grid gap-3 lg:grid-cols-[220px,1fr,220px,180px] lg:items-end">
            <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={Boolean(aiConfig.enabled)}
                onChange={(event) => setAiConfig((prev) => ({ ...prev, enabled: event.target.checked }))}
              />
              Bật AI moderation
            </label>
            <label className="flex flex-col gap-1 text-sm text-slate-700">
              <span>AI Endpoint</span>
              <input
                value={aiConfig.endpoint}
                onChange={(event) => setAiConfig((prev) => ({ ...prev, endpoint: event.target.value }))}
                placeholder="Ví dụ: https://api.openai.com/v1/chat/completions"
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-slate-700">
              <span>Model</span>
              <input
                value={aiConfig.model}
                onChange={(event) => setAiConfig((prev) => ({ ...prev, model: event.target.value }))}
                placeholder="gpt-4o-mini"
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-slate-700">
              <span>Timeout (giây)</span>
              <input
                type="number"
                min={3}
                max={120}
                value={aiConfig.timeoutSeconds}
                onChange={(event) => setAiConfig((prev) => ({ ...prev, timeoutSeconds: normalizeTimeout(Number(event.target.value)) }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
          </div>

          <div className="mt-3 grid gap-3 lg:grid-cols-[1fr,220px,180px] lg:items-end">
            <label className="flex flex-col gap-1 text-sm text-slate-700">
              <span>AI API Key</span>
              <input
                type="password"
                value={aiApiKeyInput}
                onChange={(event) => {
                  setAiApiKeyInput(event.target.value);
                  if (event.target.value.trim() !== '') {
                    setClearStoredApiKey(false);
                  }
                }}
                placeholder="Để trống để giữ key hiện tại"
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>

            <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={clearStoredApiKey}
                onChange={(event) => {
                  setClearStoredApiKey(event.target.checked);
                  if (event.target.checked) {
                    setAiApiKeyInput('');
                  }
                }}
              />
              Xóa API key đã lưu
            </label>

            <button
              type="button"
              onClick={() => void saveModerationAIConfig()}
              disabled={savingAiConfig}
              className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-700 disabled:opacity-60"
            >
              {savingAiConfig ? 'Đang lưu...' : 'Lưu cấu hình AI'}
            </button>
          </div>

          <div className="mt-2 text-xs text-slate-500">
            <p>API key hiện tại: {aiConfig.hasApiKey ? aiConfig.apiKeyMasked : 'chưa cấu hình'}</p>
            <p>Cập nhật gần nhất: {aiConfig.updatedAt ? new Date(aiConfig.updatedAt).toLocaleString('vi-VN') : 'chưa có'}</p>
          </div>
        </article>

        <article className="neo-panel mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Cấu hình Đăng nhập Google</h2>
          <p className="mt-1 text-sm text-slate-600">
            Bật/tắt Google Sign-In cho user và khai báo Google OAuth Client ID.
          </p>
          <div className="mt-4 grid gap-3 lg:grid-cols-[220px,1fr,180px] lg:items-end">
            <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={Boolean(authProvidersConfig.googleEnabled)}
                onChange={(event) =>
                  setAuthProvidersConfig((prev) => ({
                    ...prev,
                    googleEnabled: event.target.checked,
                  }))
                }
              />
              Bật Google Sign-In
            </label>
            <label className="flex flex-col gap-1 text-sm text-slate-700">
              <span>Google Client ID</span>
              <input
                value={authProvidersConfig.googleClientId}
                onChange={(event) =>
                  setAuthProvidersConfig((prev) => ({
                    ...prev,
                    googleClientId: event.target.value,
                  }))
                }
                placeholder="Ví dụ: 1234567890-xxxxx.apps.googleusercontent.com"
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <button
              type="button"
              onClick={() => void saveAuthProvidersConfig()}
              disabled={savingAuthProvidersConfig}
              className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-700 disabled:opacity-60"
            >
              {savingAuthProvidersConfig ? 'Đang lưu...' : 'Lưu cấu hình'}
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Cập nhật gần nhất: {authProvidersConfig.updatedAt ? new Date(authProvidersConfig.updatedAt).toLocaleString('vi-VN') : 'chưa có'}
          </p>
        </article>

        <article className="neo-panel mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Cấu hình Cloudflare R2 Object Storage</h2>
          <p className="mt-1 text-sm text-slate-600">
            Bật lưu ảnh tin đăng vào Cloudflare R2 để tránh mất dữ liệu khi redeploy container local.
          </p>

          <div className="mt-4 grid gap-3 lg:grid-cols-[220px,1fr,1fr] lg:items-end">
            <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={Boolean(r2Config.enabled)}
                onChange={(event) => setR2Config((prev) => ({ ...prev, enabled: event.target.checked }))}
              />
              Bật R2 Storage
            </label>
            <label className="flex flex-col gap-1 text-sm text-slate-700">
              <span>Account ID</span>
              <input
                value={r2Config.accountId}
                onChange={(event) => setR2Config((prev) => ({ ...prev, accountId: event.target.value }))}
                placeholder="Cloudflare Account ID"
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-slate-700">
              <span>Access Key ID</span>
              <input
                value={r2Config.accessKeyId}
                onChange={(event) => setR2Config((prev) => ({ ...prev, accessKeyId: event.target.value }))}
                placeholder="R2 Access Key ID"
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
          </div>

          <div className="mt-3 grid gap-3 lg:grid-cols-[1fr,1fr,200px] lg:items-end">
            <label className="flex flex-col gap-1 text-sm text-slate-700">
              <span>Bucket Name</span>
              <input
                value={r2Config.bucketName}
                onChange={(event) => setR2Config((prev) => ({ ...prev, bucketName: event.target.value }))}
                placeholder="Ví dụ: nhadatdn-media"
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-slate-700">
              <span>Public Base URL (CDN domain)</span>
              <input
                value={r2Config.publicBaseUrl}
                onChange={(event) => setR2Config((prev) => ({ ...prev, publicBaseUrl: event.target.value }))}
                placeholder="Ví dụ: https://cdn.nhadatdn.vn"
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-slate-700">
              <span>Region</span>
              <input
                value={r2Config.region}
                onChange={(event) => setR2Config((prev) => ({ ...prev, region: event.target.value }))}
                placeholder="auto"
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
          </div>

          <div className="mt-3 grid gap-3 lg:grid-cols-[1fr,220px,180px] lg:items-end">
            <label className="flex flex-col gap-1 text-sm text-slate-700">
              <span>Secret Access Key</span>
              <input
                type="password"
                value={r2SecretAccessKeyInput}
                onChange={(event) => {
                  setR2SecretAccessKeyInput(event.target.value);
                  if (event.target.value.trim() !== '') {
                    setClearStoredR2Secret(false);
                  }
                }}
                placeholder="Để trống để giữ key hiện tại"
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>

            <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={clearStoredR2Secret}
                onChange={(event) => {
                  setClearStoredR2Secret(event.target.checked);
                  if (event.target.checked) {
                    setR2SecretAccessKeyInput('');
                  }
                }}
              />
              Xóa secret đã lưu
            </label>

            <button
              type="button"
              onClick={() => void saveR2StorageConfig()}
              disabled={savingR2Config}
              className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-700 disabled:opacity-60"
            >
              {savingR2Config ? 'Đang lưu...' : 'Lưu cấu hình R2'}
            </button>
          </div>

          <div className="mt-2 text-xs text-slate-500">
            <p>Secret hiện tại: {r2Config.hasSecretAccessKey ? r2Config.secretAccessKeyMasked : 'chưa cấu hình'}</p>
            <p>Cập nhật gần nhất: {r2Config.updatedAt ? new Date(r2Config.updatedAt).toLocaleString('vi-VN') : 'chưa có'}</p>
          </div>
        </article>

        <article className="neo-panel mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Sao lưu SQLite lên Google Drive</h2>
          <p className="mt-1 text-sm text-slate-600">
            Tự động sao lưu database SQLite hằng ngày lên Google Drive API. Mặc định chạy lúc 02:00 và xóa bản backup cũ hơn 7 ngày.
          </p>

          <div className="mt-4 grid gap-3 lg:grid-cols-[220px,1fr,1fr] lg:items-end">
            <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={Boolean(googleDriveBackupConfig.enabled)}
                onChange={(event) => setGoogleDriveBackupConfig((prev) => ({ ...prev, enabled: event.target.checked }))}
              />
              Bật backup Google Drive
            </label>
            <label className="flex flex-col gap-1 text-sm text-slate-700">
              <span>OAuth Client ID</span>
              <input
                value={googleDriveBackupConfig.clientId}
                onChange={(event) => setGoogleDriveBackupConfig((prev) => ({ ...prev, clientId: event.target.value }))}
                placeholder="Google OAuth Client ID"
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-slate-700">
              <span>Google Drive Folder ID</span>
              <input
                value={googleDriveBackupConfig.folderId}
                onChange={(event) => setGoogleDriveBackupConfig((prev) => ({ ...prev, folderId: event.target.value }))}
                placeholder="Để trống nếu lưu ở My Drive"
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
          </div>

          <div className="mt-3 grid gap-3 lg:grid-cols-[1fr,1fr] lg:items-end">
            <label className="flex flex-col gap-1 text-sm text-slate-700">
              <span>OAuth Client Secret</span>
              <input
                type="password"
                value={googleDriveClientSecretInput}
                onChange={(event) => {
                  setGoogleDriveClientSecretInput(event.target.value);
                  if (event.target.value.trim() !== '') {
                    setClearStoredGoogleDriveClientSecret(false);
                  }
                }}
                placeholder="Để trống để giữ secret hiện tại"
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-slate-700">
              <span>OAuth Refresh Token</span>
              <input
                type="password"
                value={googleDriveRefreshTokenInput}
                onChange={(event) => {
                  setGoogleDriveRefreshTokenInput(event.target.value);
                  if (event.target.value.trim() !== '') {
                    setClearStoredGoogleDriveRefreshToken(false);
                  }
                }}
                placeholder="Để trống để giữ token hiện tại"
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
          </div>

          <div className="mt-3 grid gap-3 lg:grid-cols-[160px,180px,220px,220px,180px] lg:items-end">
            <label className="flex flex-col gap-1 text-sm text-slate-700">
              <span>Giờ backup</span>
              <input
                type="number"
                min={0}
                max={23}
                value={googleDriveBackupConfig.scheduleHour}
                onChange={(event) => setGoogleDriveBackupConfig((prev) => ({ ...prev, scheduleHour: normalizeScheduleHour(Number(event.target.value)) }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-slate-700">
              <span>Xóa sau số ngày</span>
              <input
                type="number"
                min={1}
                max={365}
                value={googleDriveBackupConfig.retentionDays}
                onChange={(event) => setGoogleDriveBackupConfig((prev) => ({ ...prev, retentionDays: normalizeRetentionDays(Number(event.target.value)) }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={clearStoredGoogleDriveClientSecret}
                onChange={(event) => {
                  setClearStoredGoogleDriveClientSecret(event.target.checked);
                  if (event.target.checked) {
                    setGoogleDriveClientSecretInput('');
                  }
                }}
              />
              Xóa client secret đã lưu
            </label>
            <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={clearStoredGoogleDriveRefreshToken}
                onChange={(event) => {
                  setClearStoredGoogleDriveRefreshToken(event.target.checked);
                  if (event.target.checked) {
                    setGoogleDriveRefreshTokenInput('');
                  }
                }}
              />
              Xóa refresh token đã lưu
            </label>
            <button
              type="button"
              onClick={() => void saveGoogleDriveBackupConfig()}
              disabled={savingGoogleDriveBackupConfig}
              className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-700 disabled:opacity-60"
            >
              {savingGoogleDriveBackupConfig ? 'Đang lưu...' : 'Lưu backup'}
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void runGoogleDriveBackupNow()}
              disabled={runningGoogleDriveBackup || !googleDriveBackupReady}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              {runningGoogleDriveBackup ? 'Đang chạy backup...' : 'Chạy backup ngay'}
            </button>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${googleDriveBackupReady ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
              {googleDriveBackupReady ? 'Đã sẵn sàng' : googleDriveBackupConfig.enabled ? 'Thiếu OAuth secret/token' : 'Đang tắt'}
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">Lịch: {String(normalizeScheduleHour(googleDriveBackupConfig.scheduleHour)).padStart(2, '0')}:00 hằng ngày</span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">Giữ {normalizeRetentionDays(googleDriveBackupConfig.retentionDays)} ngày</span>
          </div>

          <div className="mt-2 text-xs text-slate-500">
            <p>Client secret hiện tại: {googleDriveBackupConfig.hasClientSecret ? googleDriveBackupConfig.clientSecretMasked : 'chưa cấu hình'}</p>
            <p>Refresh token hiện tại: {googleDriveBackupConfig.hasRefreshToken ? googleDriveBackupConfig.refreshTokenMasked : 'chưa cấu hình'}</p>
            <p>Lần backup gần nhất: {googleDriveBackupConfig.lastBackupAt ? new Date(googleDriveBackupConfig.lastBackupAt).toLocaleString('vi-VN') : 'chưa có'}</p>
            <p>Trạng thái gần nhất: {googleDriveBackupConfig.lastStatus || 'chưa có'}{googleDriveBackupConfig.lastError ? ` - ${googleDriveBackupConfig.lastError}` : ''}</p>
            <p>Cập nhật cấu hình: {googleDriveBackupConfig.updatedAt ? new Date(googleDriveBackupConfig.updatedAt).toLocaleString('vi-VN') : 'chưa có'}</p>
          </div>
        </article>
        {message ? <p className="mt-4 text-sm text-rose-700">{message}</p> : null}

        <article className="neo-panel mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Nhật ký kiểm duyệt gần nhất</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="px-3 py-2">ID</th>
                  <th className="px-3 py-2">Tin đăng</th>
                  <th className="px-3 py-2">Hành động</th>
                  <th className="px-3 py-2">Nguồn</th>
                  <th className="px-3 py-2">Người duyệt</th>
                  <th className="px-3 py-2">Thời gian</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-t border-slate-100">
                    <td className="px-3 py-2">#{log.id}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-900">{log.listingTitle || `Listing #${log.listingId}`}</div>
                      <div className="text-xs text-slate-500">ID: {log.listingId}</div>
                      {log.reason ? <div className="mt-1 text-xs text-slate-600">{log.reason}</div> : null}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`rounded px-2 py-1 text-xs font-semibold ${actionBadgeClass(log.action)}`}>{log.action}</span>
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-600">{log.source}</td>
                    <td className="px-3 py-2 text-xs text-slate-600">{log.actorRole} #{log.actorUserId}</td>
                    <td className="px-3 py-2 text-xs text-slate-500">{new Date(log.createdAt).toLocaleString('vi-VN')}</td>
                  </tr>
                ))}
                {logs.length === 0 ? (
                  <tr>
                    <td className="px-3 py-6 text-center text-slate-500" colSpan={6}>
                      Chưa có log kiểm duyệt.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    </main>
  );
}










