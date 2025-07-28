# Internationalization (i18n) Documentation

This directory contains translation files for the Confirmelo authentication system, supporting English and French languages.

## Structure

```
locales/
├── en/
│   ├── auth.json      # Authentication-related translations
│   └── common.json    # Common UI elements and messages
├── fr/
│   ├── auth.json      # French authentication translations
│   └── common.json    # French common translations
└── README.md          # This documentation
```

## Supported Languages

- **English (en)**: Default language
- **French (fr)**: Secondary language

## Translation Namespaces

### auth.json
Contains translations for authentication flows:
- Login form
- Registration form (multi-step)
- Password reset flow
- Error messages and validation
- Password strength indicators

### common.json
Contains translations for common UI elements:
- Navigation items
- Action buttons
- Status indicators
- General messages
- Language switcher

## Usage in Components

### Basic Usage
```tsx
import { useTranslation } from 'react-i18next';

function MyComponent() {
  const { t } = useTranslation('auth');
  
  return <h1>{t('login.title')}</h1>;
}
```

### With Interpolation
```tsx
const { t } = useTranslation('auth');

// For messages with variables
<p>{t('validation.minLength', { min: 8 })}</p>
```

### Multiple Namespaces
```tsx
const { t: tAuth } = useTranslation('auth');
const { t: tCommon } = useTranslation('common');

return (
  <div>
    <h1>{tAuth('login.title')}</h1>
    <button>{tCommon('actions.submit')}</button>
  </div>
);
```

## Language Detection

The system automatically detects the user's preferred language using:
1. localStorage preference (key: 'language')
2. Browser navigator language
3. HTML lang attribute
4. Fallback to English

## Language Switching

Users can switch languages using the LanguageSwitcher component:
- Persists preference in localStorage
- Updates HTML lang attribute
- Immediate UI language change

## Adding New Translations

### For Existing Languages
1. Add new keys to the appropriate JSON file
2. Maintain consistent key structure across languages
3. Use interpolation for dynamic content: `"message": "Hello {{name}}"`

### For New Languages
1. Create new language directory (e.g., `es/`)
2. Copy structure from `en/` directory
3. Translate all keys maintaining the same structure
4. Update i18n configuration in `src/lib/i18n.ts`
5. Add language option to LanguageSwitcher component

## Translation Key Conventions

- Use dot notation for nested keys: `login.title`
- Group related translations: `errors.*`, `validation.*`
- Use descriptive names: `emailPlaceholder` not `placeholder1`
- Keep consistent naming across namespaces

## Validation Messages

Validation messages support interpolation for dynamic values:
```json
{
  "validation": {
    "minLength": "Must be at least {{min}} characters",
    "maxLength": "Must be no more than {{max}} characters"
  }
}
```

## Best Practices

1. **Consistency**: Maintain consistent terminology across languages
2. **Context**: Provide context for translators when needed
3. **Pluralization**: Use i18next pluralization features for count-based messages
4. **Testing**: Test all languages in different screen sizes
5. **Accessibility**: Ensure translations work with screen readers

## Development Workflow

1. Add English translations first
2. Use translation keys in components
3. Test functionality with English
4. Add French translations
5. Test both languages thoroughly
6. Update this documentation if adding new patterns

## Configuration

The i18n system is configured in `src/lib/i18n.ts` with:
- Language detection settings
- Fallback language (English)
- Namespace separation
- Debug mode for development

## Testing

Translation functionality is tested in:
- `src/components/auth/__tests__/language-switcher.test.tsx`
- Integration tests verify language switching
- Unit tests check translation key usage