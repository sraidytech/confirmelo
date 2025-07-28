'use client';

import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

interface LanguageSwitcherProps {
  className?: string;
}

export function LanguageSwitcher({ className }: LanguageSwitcherProps) {
  const { i18n, t } = useTranslation('common');

  const switchLanguage = (language: string) => {
    i18n.changeLanguage(language);
  };

  return (
    <div className={`language-switcher flex gap-1 ${className}`}>
      <Button
        variant={i18n.language === 'en' ? 'default' : 'outline'}
        size="sm"
        onClick={() => switchLanguage('en')}
        className="language-btn"
        title={t('language.switchTo', { language: t('language.english') })}
      >
        EN
      </Button>
      <Button
        variant={i18n.language === 'fr' ? 'default' : 'outline'}
        size="sm"
        onClick={() => switchLanguage('fr')}
        className="language-btn"
        title={t('language.switchTo', { language: t('language.french') })}
      >
        FR
      </Button>
    </div>
  );
}