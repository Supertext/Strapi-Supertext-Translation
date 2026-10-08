import type { IntlShape } from 'react-intl';
import type { ApiError } from '../api';
import { getTranslation } from './getTranslation';

/** Messages whose translation already contains `{detail}`; for the others the detail is appended. */
const DETAIL_INLINE = new Set(['unreachable', 'saveFailed']);

/**
 * The error in the user's interface language: `error.<code>` from
 * translations/*.json, falling back to the server's English message.
 */
export const errorText = (formatMessage: IntlShape['formatMessage'], error: ApiError): string => {
  if (!error.code) {
    return error.message;
  }
  const values = error.values ?? {};
  const text = formatMessage({ id: getTranslation(`error.${error.code}`), defaultMessage: error.message }, values);
  if (text === error.message || DETAIL_INLINE.has(error.code) || !values.detail) {
    return text;
  }
  return `${text} (${values.detail})`;
};
