import { describe, expect, it } from 'vitest';

import {
	buildFontPreludeCss,
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

	it('carries and sanitizes font tokens', () => {
		const theme = normalizeCustomTheme({
			...createDefaultCustomTheme(),
			tokens: {
				...createDefaultCustomTheme().tokens,
				fontBody: "  'Inter', system-ui  ",
				fontHeading: "'Space Grotesk'; } body { display: none",
				fontMono: 'JetBrains Mono',
				fontImportUrl: 'https://fonts.googleapis.com/css2?family=Inter&display=swap',
				fontFaces: [
					{ family: 'My R2 Font', src: 'https://cdn.example.com/font.woff2', weight: '500' },
					{ family: 'Bad', src: 'javascript:alert(1)' },
					{ family: 'NoSrc' }
				]
			}
		});

		expect(theme.tokens.fontBody).toBe("'Inter', system-ui");
		// dangerous characters that could break out of the declaration are stripped
		expect(theme.tokens.fontHeading).toBe("'Space Grotesk' body display none");
		expect(theme.tokens.fontImportUrl).toContain('fonts.googleapis.com');
		// only the valid https font file survives
		expect(theme.tokens.fontFaces).toHaveLength(1);
		expect(theme.tokens.fontFaces?.[0]).toMatchObject({
			family: 'My R2 Font',
			src: 'https://cdn.example.com/font.woff2',
			weight: '500'
		});
	});

	it('drops non-https font urls', () => {
		const theme = normalizeCustomTheme({
			...createDefaultCustomTheme(),
			tokens: {
				...createDefaultCustomTheme().tokens,
				fontImportUrl: 'http://insecure.example.com/font.css'
			}
		});
		expect(theme.tokens.fontImportUrl).toBeUndefined();
	});

	it('derives font CSS variables only when set', () => {
		const withFont = getThemeCssVariables(
			normalizeCustomTheme({
				...createDefaultCustomTheme(),
				tokens: { ...createDefaultCustomTheme().tokens, fontBody: "'Inter', sans-serif" }
			})
		);
		expect(withFont['--halo-theme-font-body']).toBe("'Inter', sans-serif");

		const withoutFont = getThemeCssVariables(createDefaultCustomTheme());
		expect(withoutFont['--halo-theme-font-body']).toBeUndefined();
	});

	it('builds a font prelude with @import first and @font-face blocks', () => {
		const css = buildFontPreludeCss(
			normalizeCustomTheme({
				...createDefaultCustomTheme(),
				tokens: {
					...createDefaultCustomTheme().tokens,
					fontImportUrl: 'https://fonts.googleapis.com/css2?family=Inter&display=swap',
					fontFaces: [{ family: 'My R2 Font', src: 'https://cdn.example.com/font.ttf', weight: '400' }]
				}
			})
		);

		expect(css.indexOf('@import')).toBe(0);
		expect(css.indexOf('@import')).toBeLessThan(css.indexOf('@font-face'));
		expect(css).toContain('font-family: "My R2 Font"');
		expect(css).toContain('format("truetype")');
		expect(css).toContain('font-display: swap;');
	});

	it('returns an empty prelude when no fonts are configured', () => {
		expect(buildFontPreludeCss(createDefaultCustomTheme())).toBe('');
	});
});
