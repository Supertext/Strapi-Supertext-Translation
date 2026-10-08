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
