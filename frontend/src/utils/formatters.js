/**
 * Utility functions for formatting numbers, money, percentages, and dates
 * with locale awareness.
 */

/**
 * Normalizes language codes like 'ru', 'en', 'ru-RU', 'en-US' to standard BCP 47 locale tags.
 */
function getLocaleTag(locale) {
  if (!locale) return 'ru-RU';
  const lang = String(locale).toLowerCase();
  if (lang.startsWith('en')) return 'en-US';
  if (lang.startsWith('ru')) return 'ru-RU';
  return 'ru-RU';
}

/**
 * Formats an amount in kopecks (cents) into a localized currency string.
 * @param {number} amountKopecks - Amount in kopecks (e.g. 250000 = 2500.00)
 * @param {string} locale - Locale string ('ru', 'en', etc.)
 * @param {string} currency - ISO 4217 Currency Code (default 'RUB')
 * @returns {string} Formatted money string
 */
export function formatMoney(amountKopecks, locale = 'ru', currency = 'RUB') {
  const num = (amountKopecks || 0) / 100;
  const tag = getLocaleTag(locale);

  try {
    return new Intl.NumberFormat(tag, {
      style: 'currency',
      currency: currency || 'RUB',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(num);
  } catch (err) {
    return `${num.toFixed(2)} ${currency}`;
  }
}

/**
 * Formats a raw number with local thousand separators.
 */
export function formatNumber(value, locale = 'ru') {
  const num = Number(value) || 0;
  const tag = getLocaleTag(locale);
  try {
    return new Intl.NumberFormat(tag).format(num);
  } catch (err) {
    return String(num);
  }
}

/**
 * Formats a value as a percentage.
 * Value can be in basis points (e.g. 400 bps = 4%) or raw percentage (4 = 4%).
 * If value > 100, we assume it is in basis points unless explicitly specified.
 */
export function formatPercent(value, locale = 'ru', isBasisPoints = true) {
  const rawNum = Number(value) || 0;
  const percentVal = isBasisPoints ? rawNum / 100 : rawNum;
  const tag = getLocaleTag(locale);

  try {
    return new Intl.NumberFormat(tag, {
      style: 'percent',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }).format(percentVal / 100);
  } catch (err) {
    return `${percentVal}%`;
  }
}

/**
 * Formats a date string or object into a localized date string (e.g., 25.07.2026 or 07/25/2026).
 */
export function formatDate(dateInput, locale = 'ru') {
  if (!dateInput) return '';
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return String(dateInput);

  const tag = getLocaleTag(locale);
  try {
    return new Intl.DateTimeFormat(tag, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(date);
  } catch (err) {
    return date.toISOString().split('T')[0];
  }
}

/**
 * Formats a date string or object into a localized date & time string.
 */
export function formatDateTime(dateInput, locale = 'ru') {
  if (!dateInput) return '';
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return String(dateInput);

  const tag = getLocaleTag(locale);
  try {
    return new Intl.DateTimeFormat(tag, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  } catch (err) {
    return date.toLocaleString();
  }
}
