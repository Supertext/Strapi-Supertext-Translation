export interface LocaleResult {
  locale: string;
  status: 'created' | 'updated' | 'error';
  fields?: number;
  error?: string;
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

/** Turns a fetch-client error into a readable message. */
export const errorMessage = (error: unknown): string => {
  const e = error as { response?: { data?: { error?: { message?: string } } }; message?: string };
  return e?.response?.data?.error?.message ?? e?.message ?? 'Unknown error';
};
