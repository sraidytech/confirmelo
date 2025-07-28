'use client';

import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

export function HtmlLangProvider() {
  const { i18n } = useTranslation();

  useEffect(() => {
    // Update the HTML lang attribute when language changes
    document.documentElement.lang = i18n.language;
  }, [i18n.language]);

  return null;
}