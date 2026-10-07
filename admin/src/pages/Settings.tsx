import * as React from 'react';
import { useIntl } from 'react-intl';
import { Box, Button, Flex, Table, Tbody, Td, Th, Thead, Tr, Typography } from '@strapi/design-system';
import { Layouts, Page, useFetchClient, useNotification } from '@strapi/strapi/admin';
import { errorMessage, type PluginStatus, type StrapiLocale } from '../api';
import { PLUGIN_ID } from '../pluginId';
import { getTranslation } from '../utils/getTranslation';

const SIGNUP_URL = 'https://www.supertext.com/person/en/account/signin';
const API_KEY_URL = 'https://www.supertext.com/en/integrations/api';
const RELEASES_URL = 'https://github.com/Supertext/Strapi-Supertext-Translation/releases/tag/';
const RELEASE_VERSION = /^\d+\.\d+\.\d+$/;

/**
 * Read-only overview: whether an API key is set, which endpoint is used and how
 * each Strapi locale maps to Supertext. Configuration lives in config/plugins.
 */
const Settings = () => {
  const { formatMessage } = useIntl();
  const { get, post } = useFetchClient();
  const { toggleNotification } = useNotification();
  const [status, setStatus] = React.useState<PluginStatus | null>(null);
  const [locales, setLocales] = React.useState<StrapiLocale[]>([]);
  const [testing, setTesting] = React.useState(false);
  const t = (id: string, defaultMessage: string, values?: Record<string, string>) =>
    formatMessage({ id: getTranslation(id), defaultMessage }, values);

  React.useEffect(() => {
    get<PluginStatus>(`/${PLUGIN_ID}/status`).then(({ data }) => setStatus(data));
    get<StrapiLocale[]>('/i18n/locales').then(({ data }) => setLocales(data));
  }, [get]);

  const test = async () => {
    setTesting(true);
    try {
      await post(`/${PLUGIN_ID}/test-connection`);
      toggleNotification({ type: 'success', message: t('settings.test.ok', 'Connected to Supertext.') });
    } catch (error) {
      toggleNotification({ type: 'danger', message: errorMessage(error) });
    } finally {
      setTesting(false);
    }
  };

  if (!status) {
    return <Page.Loading />;
  }

  const politeness = (value?: string) =>
    value === 'more' ? t('settings.formal', 'Formal') : value === 'less' ? t('settings.informal', 'Informal') : '–';

  return (
    <Layouts.Root>
      <Page.Title>Supertext</Page.Title>
      <Page.Main>
        <Layouts.Header
          title={t('settings.title', 'Supertext translation')}
          subtitle={t('settings.subtitle', 'Translate entries into other locales with Supertext AI.')}
          primaryAction={
            <Button onClick={test} loading={testing} disabled={!status.configured}>
              {t('settings.test', 'Test connection')}
            </Button>
          }
        />
        <Layouts.Content>
          <Flex direction="column" alignItems="stretch" gap={6}>
            <Box background="neutral0" hasRadius shadow="filterShadow" padding={6}>
              <Flex direction="column" alignItems="flex-start" gap={2}>
                <Typography variant="delta" tag="h2">
                  {t('settings.connection', 'Connection')}
                </Typography>
                <Typography textColor={status.configured ? 'success600' : 'danger600'}>
                  {status.configured
                    ? t('settings.key.set', 'API key is set.')
                    : t('settings.key.missing', 'No API key. Set SUPERTEXT_API_KEY on the server and restart Strapi.')}
                </Typography>
                <Typography variant="pi" textColor="neutral600">
                  {formatMessage(
                    {
                      id: getTranslation('settings.key.help'),
                      defaultMessage:
                        'No Supertext account yet? <signup>Create one at supertext.com</signup>. Generate your API key at <key>supertext.com → Integrations → API</key> (requires the Admin role).',
                    },
                    {
                      signup: (chunks: React.ReactNode) => (
                        <a href={SIGNUP_URL} target="_blank" rel="noopener noreferrer">
                          {chunks}
                        </a>
                      ),
                      key: (chunks: React.ReactNode) => (
                        <a href={API_KEY_URL} target="_blank" rel="noopener noreferrer">
                          {chunks}
                        </a>
                      ),
                    }
                  )}
                </Typography>
                <Typography variant="pi" textColor="neutral600">
                  {t('settings.endpoint', 'Endpoint: {endpoint}', { endpoint: status.endpoint })}
                </Typography>
                {status.version && (
                  <Typography variant="pi" textColor="neutral600">
                    {formatMessage(
                      { id: getTranslation('settings.version'), defaultMessage: 'Plugin version: {version}' },
                      {
                        version: RELEASE_VERSION.test(status.version) ? (
                          <a href={`${RELEASES_URL}v${status.version}`} target="_blank" rel="noopener noreferrer">
                            {status.version}
                          </a>
                        ) : (
                          status.version
                        ),
                      }
                    )}
                  </Typography>
                )}
              </Flex>
            </Box>

            <Box background="neutral0" hasRadius shadow="filterShadow" padding={6}>
              <Flex direction="column" alignItems="stretch" gap={4}>
                <Typography variant="delta" tag="h2">
                  {t('settings.languages', 'Languages')}
                </Typography>
                <Table colCount={3} rowCount={locales.length + 1}>
                  <Thead>
                    <Tr>
                      <Th><Typography variant="sigma">{t('settings.col.locale', 'Strapi locale')}</Typography></Th>
                      <Th><Typography variant="sigma">{t('settings.col.code', 'Sent to Supertext as')}</Typography></Th>
                      <Th><Typography variant="sigma">{t('settings.col.politeness', 'Politeness')}</Typography></Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {locales.map((locale) => {
                      const options = status.locales[locale.code] ?? {};
                      return (
                        <Tr key={locale.code}>
                          <Td><Typography>{locale.name}</Typography></Td>
                          <Td><Typography>{options.code ?? locale.code}</Typography></Td>
                          <Td><Typography>{politeness(options.politeness)}</Typography></Td>
                        </Tr>
                      );
                    })}
                  </Tbody>
                </Table>
                <Typography variant="pi" textColor="neutral600">
                  {t(
                    'settings.languages.help',
                    'Change codes and politeness in config/plugins under supertext.config.locales.'
                  )}
                </Typography>
              </Flex>
            </Box>
          </Flex>
        </Layouts.Content>
      </Page.Main>
    </Layouts.Root>
  );
};

export default Settings;
