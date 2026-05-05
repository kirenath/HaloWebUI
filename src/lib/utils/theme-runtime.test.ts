import { describe, expect, it } from 'vitest';

import {
	createDefaultCustomTheme,
	getThemeCssVariables,
	normalizeCustomTheme,
	normalizeTheme,
	normalizeThemeId
} from './theme-runtime';

describe('theme-runtime', () => {
	it('normalizes built-in and legacy themes', () => {
		expect(normalizeTheme('light')).toBe('light');
		expect(normalizeTheme('dark')).toBe('dark');
		expect(normalizeTheme('system')).toBe('system');
		expect(normalizeTheme('rose-pine dark')).toBe('dark');
		expect(normalizeTheme('rose-pine-dawn light')).toBe('light');
		expect(normalizeTheme('unknown')).toBe('system');
	});

	it('normalizes custom theme ids and token defaults', () => {
		const theme = normalizeCustomTheme({
			id: ' My Theme! ',
			name: '  My Theme  ',
			colorMode: 'dark',
			tokens: {
				primary: '#ABC',
				background: '#000000',
				foreground: '#ffffff',
				surface: '#111111',
				radius: '12px',
				glassOpacity: 0.5
			},
			customCss: '.foo { color: red; }'
		});

		expect(theme.id).toBe('my-theme');
		expect(theme.name).toBe('My Theme');
		expect(theme.tokens.primary).toBe('#aabbcc');
		expect(theme.customCss).toContain('.foo');
	});

	it('builds CSS variables for custom themes', () => {
		const theme = createDefaultCustomTheme({ id: 'blue' });
		const variables = getThemeCssVariables(theme);

		expect(variables['--color-primary-500']).toBe(theme.tokens.primary);
		expect(variables['--halo-theme-background']).toBe(theme.tokens.background);
		expect(variables['--halo-theme-radius']).toBe(theme.tokens.radius);
		expect(variables['--color-gray-900']).toBeTruthy();
	});

	it('rejects invalid colors and oversized CSS', () => {
		expect(() =>
			normalizeCustomTheme({
				...createDefaultCustomTheme(),
				tokens: { ...createDefaultCustomTheme().tokens, primary: 'blue' }
			})
		).toThrow(/hex color/i);

		expect(() =>
			normalizeCustomTheme({
				...createDefaultCustomTheme(),
				customCss: 'x'.repeat(20_001)
			})
		).toThrow(/characters/i);
	});

	it('creates safe ids from arbitrary labels', () => {
		expect(normalizeThemeId('  Halo Blue Theme  ')).toBe('halo-blue-theme');
		expect(normalizeThemeId('***')).toBe('my-theme');
	});
});
