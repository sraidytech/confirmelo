'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';

interface LanguageSwitcherProps {
  className?: string;
}

export function LanguageSwitcher({ className }: LanguageSwitcherProps) {
  const [currentLanguage, setCurrentLanguage] = useState('en');

  useEffect(() => {
    // Get saved language preference
    const savedLanguage = localStorage.getItem('language') || 'en';
    setCurrentLanguage(savedLanguage);
  }, []);

  const switchLanguage = (language: string) => {
    setCurrentLanguage(language);
    localStorage.setItem('language', language);
    // TODO: Integrate with i18next when implementing task 9.2
  };

  return (
    <div className={`language-switcher ${className}`}>
      <Button
        variant={currentLanguage === 'en' ? 'default' : 'outline'}
        size="sm"
        onClick={() => switchLanguage('en')}
        className="language-btn"
      >
        EN
      </Button>
      <Button
        variant={currentLanguage === 'fr' ? 'default' : 'outline'}
        size="sm"
        onClick={() => switchLanguage('fr')}
        className="language-btn"
      >
        FR
      </Button>
    </div>
  );
}