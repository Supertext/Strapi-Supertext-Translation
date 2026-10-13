export interface LocaleResult {
  locale: string;
  status: 'created' | 'updated' | 'error';
  fields?: number;
  error?: string;
  code?: string;
  values?: Record<string, string | number>;
}

export interface PluginStatus {
  configured: boolean;
  endpoint: string;
  locales: Record<string, { code?: string; politeness?: string }>;
  contentTypes: string[];
  /** Plugin version from package.json, null if the server couldn't read it. */
  version: string | null;
  /** Every Strapi locale with the Supertext code it is sent as (null: not mapped). */
  languages: LanguageStatus[];
  /** "Send version information to Supertext" and the latest automatic API key check. */
  reports: { enabled: boolean; check: KeyCheck | null };
}

export interface LanguageStatus {
  code: string;
  name: string;
  target: string | null;
  politeness: 'default' | 'more' | 'less';
  politenessSupported: boolean | null;
}

/** The SDK's API key check (`keycheck.<status>` in translations/*.json). */
export interface KeyCheck {
  status: 'ok' | 'invalid' | 'missing' | 'unreachable' | 'error';
  checkedAt: string;
  httpStatus: number | null;
  errorCode: string | null;
}

export interface StrapiLocale {
  id: number;
  code: string;
  name: string;
  isDefault: boolean;
}

/** An error from the plugin's API: English `message`, plus `code`/`values` for a translated text. */
export interface ApiError {
  message: string;
  code?: string;
  values?: Record<string, string | number>;
}

/** Reads the plugin's error out of a fetch-client error. */
export const apiError = (error: unknown): ApiError => {
  const e = error as {
    response?: { data?: { error?: { message?: string; details?: { code?: string; values?: ApiError['values'] } } } };
    message?: string;
  };
  const body = e?.response?.data?.error;
  return {
    message: body?.message ?? e?.message ?? 'Unknown error',
    code: body?.details?.code,
    values: body?.details?.values,
  };
};
