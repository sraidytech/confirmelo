import { useTranslation as useI18nTranslation } from 'react-i18next';

export function useTranslation(namespace?: string) {
  return useI18nTranslation(namespace);
}

export function useAuthTranslation() {
  return useI18nTranslation('auth');
}

export function useCommonTranslation() {
  return useI18nTranslation('common');
}