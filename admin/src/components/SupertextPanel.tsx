import * as React from 'react';
import { useIntl } from 'react-intl';
import { Box, Button, Checkbox, Flex, Typography } from '@strapi/design-system';
import { useFetchClient, useNotification, useQueryParams } from '@strapi/strapi/admin';
import { apiError, type LocaleResult, type PluginStatus, type StrapiLocale } from '../api';
import { PLUGIN_ID } from '../pluginId';
import { errorText } from '../utils/errorText';
import { getTranslation } from '../utils/getTranslation';

interface PanelProps {
  model: string;
  documentId?: string;
  document?: { locale?: string; documentId?: string; [key: string]: unknown };
  meta?: { availableLocales?: Array<{ locale: string }> };
  collectionType: string;
}

/**
 * Edit-view side panel: pick target locales and translate the current entry
 * with Supertext. Hidden for content types without i18n and for unsaved entries.
 */
const SupertextPanel = (props: PanelProps) => {
  const { formatMessage } = useIntl();
  const { document, meta } = props;
  const documentId = props.documentId ?? document?.documentId;
  const isLocalized = Boolean(document?.locale);

  if (!isLocalized || !documentId) {
    return null;
  }

  return {
    title: formatMessage({ id: getTranslation('panel.title'), defaultMessage: 'Supertext translation' }),
    content: (
      <PanelContent
        model={props.model}
        documentId={documentId}
        sourceLocale={document!.locale as string}
        existing={(meta?.availableLocales ?? []).map((l) => l.locale)}
      />
    ),
  };
};

interface PanelContentProps {
  model: string;
  documentId: string;
  sourceLocale: string;
  existing: string[];
}

const PanelContent = ({ model, documentId, sourceLocale, existing }: PanelContentProps) => {
  const { formatMessage } = useIntl();
  const { get, post } = useFetchClient();
  const { toggleNotification } = useNotification();
  const [{ query }, setQuery] = useQueryParams<{ plugins?: Record<string, unknown> }>();

  const [locales, setLocales] = React.useState<StrapiLocale[]>([]);
  const [status, setStatus] = React.useState<PluginStatus | null>(null);
  const [selected, setSelected] = React.useState<string[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [results, setResults] = React.useState<LocaleResult[]>([]);
  const [created, setCreated] = React.useState<string[]>([]);

  React.useEffect(() => {
    let cancelled = false;
    Promise.all([get<StrapiLocale[]>('/i18n/locales'), get<PluginStatus>(`/${PLUGIN_ID}/status`)])
      .then(([l, s]) => {
        if (!cancelled) {
          setLocales(l.data);
          setStatus(s.data);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [get]);

  // Reset when switching entry or locale.
  React.useEffect(() => {
    setSelected([]);
    setResults([]);
    setCreated([]);
  }, [documentId, sourceLocale]);

  const targets = locales.filter((locale) => locale.code !== sourceLocale);
  const exists = (code: string) => existing.includes(code) || created.includes(code);
  const name = (code: string) => locales.find((l) => l.code === code)?.name ?? code;
  const resultError = (result: LocaleResult) =>
    errorText(formatMessage, { message: result.error ?? '', code: result.code, values: result.values });

  if (status && !status.configured) {
    return (
      <Typography variant="pi" textColor="neutral600">
        {formatMessage({
          id: getTranslation('panel.notConfigured'),
          defaultMessage: 'Supertext is not configured yet. Ask an administrator to set the API key.',
        })}
      </Typography>
    );
  }

  if (!targets.length) {
    return (
      <Typography variant="pi" textColor="neutral600">
        {formatMessage({
          id: getTranslation('panel.noLocales'),
          defaultMessage: 'Add more locales under Settings → Internationalization to translate this entry.',
        })}
      </Typography>
    );
  }

  const toggle = (code: string, checked: boolean) =>
    setSelected((current) => (checked ? [...current, code] : current.filter((c) => c !== code)));

  const translate = async () => {
    setBusy(true);
    setResults([]);
    try {
      const { data } = await post<{ results: LocaleResult[] }>(`/${PLUGIN_ID}/translate`, {
        model,
        documentId,
        sourceLocale,
        targetLocales: selected,
      });
      setResults(data.results);
      const ok = data.results.filter((r) => r.status !== 'error');
      const failed = data.results.filter((r) => r.status === 'error');
      setCreated((current) => [...current, ...ok.map((r) => r.locale)]);
      setSelected([]);
      if (ok.length) {
        toggleNotification({
          type: 'success',
          message: formatMessage(
            { id: getTranslation('panel.success'), defaultMessage: 'Translated into {locales}.' },
            { locales: ok.map((r) => name(r.locale)).join(', ') }
          ),
        });
      }
      if (failed.length) {
        toggleNotification({
          type: 'danger',
          message: failed.map((r) => `${name(r.locale)}: ${resultError(r)}`).join(' · '),
        });
      }
    } catch (error) {
      toggleNotification({ type: 'danger', message: errorText(formatMessage, apiError(error)) });
    } finally {
      setBusy(false);
    }
  };

  const open = (code: string) =>
    setQuery({ plugins: { ...(query.plugins ?? {}), i18n: { locale: code } } }, 'push', true);

  const overwriting = selected.filter(exists);

  return (
    <Flex direction="column" alignItems="stretch" gap={3} width="100%">
      <Typography variant="pi" textColor="neutral600">
        {formatMessage(
          {
            id: getTranslation('panel.intro'),
            defaultMessage: 'Translate the saved {locale} version into:',
          },
          { locale: name(sourceLocale) }
        )}
      </Typography>

      <Flex direction="column" alignItems="flex-start" gap={2}>
        {targets.map((locale) => (
          <Checkbox
            key={locale.code}
            checked={selected.includes(locale.code)}
            onCheckedChange={(checked: boolean | 'indeterminate') => toggle(locale.code, checked === true)}
            disabled={busy}
          >
            {locale.name}
            {exists(locale.code) ? (
              <Typography variant="pi" textColor="neutral500">
                {' '}
                {formatMessage({ id: getTranslation('panel.exists'), defaultMessage: '(exists)' })}
              </Typography>
            ) : null}
          </Checkbox>
        ))}
      </Flex>

      {overwriting.length ? (
        <Typography variant="pi" textColor="warning600">
          {formatMessage(
            {
              id: getTranslation('panel.overwrite'),
              defaultMessage: 'Existing translations will be replaced: {locales}',
            },
            { locales: overwriting.map(name).join(', ') }
          )}
        </Typography>
      ) : null}

      <Button fullWidth onClick={translate} loading={busy} disabled={!selected.length || busy} variant="secondary">
        {formatMessage({ id: getTranslation('panel.button'), defaultMessage: 'Translate with Supertext' })}
      </Button>

      {results.length ? (
        <Box>
          {results.map((result) => (
            <Flex key={result.locale} justifyContent="space-between" gap={2} paddingTop={1}>
              <Typography variant="pi" textColor={result.status === 'error' ? 'danger600' : 'success600'}>
                {name(result.locale)}:{' '}
                {result.status === 'error'
                  ? resultError(result)
                  : formatMessage(
                      { id: getTranslation(`panel.result.${result.status}`), defaultMessage: result.status },
                      { fields: result.fields }
                    )}
              </Typography>
              {result.status !== 'error' ? (
                <Button size="S" variant="ghost" onClick={() => open(result.locale)}>
                  {formatMessage({ id: getTranslation('panel.open'), defaultMessage: 'Open' })}
                </Button>
              ) : null}
            </Flex>
          ))}
        </Box>
      ) : null}
    </Flex>
  );
};

export { SupertextPanel };
