export const BUILTIN_THEMES = ['light', 'dark', 'system'] as const;
export type BuiltinTheme = (typeof BUILTIN_THEMES)[number];
export type ThemeColorMode = BuiltinTheme;

export type CustomThemeTokens = {
	primary: string;
	background: string;
	foreground: string;
	surface: string;
	radius: string;
	glassOpacity: number;
};

export type CustomTheme = {
	schemaVersion: 1;
	id: string;
	name: string;
	colorMode: ThemeColorMode;
	tokens: CustomThemeTokens;
	customCss: string;
};

export type CustomThemeCache = {
	theme: CustomTheme;
	cssVariables: Record<string, string>;
};

declare global {
	interface Window {
		applyTheme?: () => void;
	}
}

export const CUSTOM_THEME_CACHE_KEY = 'halo.customTheme.cache';
export const CUSTOM_THEME_ACTIVE_ID_KEY = 'halo.customTheme.activeId';
export const CUSTOM_THEME_STYLE_ID = 'halo-custom-theme-css';

const THEME_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;
const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const RADIUS_RE = /^\d+(\.\d+)?(px|rem|em|%)$/;
const MAX_CUSTOM_CSS_LENGTH = 20_000;

const LEGACY_THEME_MAP: Record<string, BuiltinTheme> = {
	'oled-dark': 'dark',
	her: 'dark',
	'rose-pine dark': 'dark',
	'rose-pine-dawn light': 'light'
};

const DEFAULT_THEME: CustomTheme = {
	schemaVersion: 1,
	id: 'my-theme',
	name: 'My Theme',
	colorMode: 'dark',
	tokens: {
		primary: '#3b82f6',
		background: '#0a0a0f',
		foreground: '#f4f4f5',
		surface: '#171717',
		radius: '16px',
		glassOpacity: 0.7
	},
	customCss: ''
};

const CUSTOM_THEME_VARIABLES = [
	'--halo-theme-background',
	'--halo-theme-foreground',
	'--halo-theme-surface',
	'--halo-theme-radius',
	'--halo-theme-glass-opacity',
	'--glass-shadow',
	'--color-surface-glass',
	'--color-surface-glass-dark',
	...Array.from({ length: 10 }, (_, i) =>
		`--color-primary-${[50, 100, 200, 300, 400, 500, 600, 700, 800, 900][i]}`
	),
	...['50', '100', '200', '300', '400', '500', '600', '700', '800', '850', '900', '950'].map(
		(step) => `--color-gray-${step}`
	)
];

export const isBuiltinTheme = (value: unknown): value is BuiltinTheme =>
	typeof value === 'string' && BUILTIN_THEMES.includes(value as BuiltinTheme);

export const normalizeTheme = (rawTheme: unknown): BuiltinTheme => {
	if (isBuiltinTheme(rawTheme)) return rawTheme;
	if (typeof rawTheme === 'string' && LEGACY_THEME_MAP[rawTheme]) return LEGACY_THEME_MAP[rawTheme];
	return 'system';
};

export const normalizeThemeId = (rawValue: string) => {
	const normalized = rawValue
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9_-]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 64);

	return normalized || 'my-theme';
};

export const createDefaultCustomTheme = (overrides: Partial<CustomTheme> = {}): CustomTheme =>
	normalizeCustomTheme({
		...DEFAULT_THEME,
		...overrides,
		tokens: {
			...DEFAULT_THEME.tokens,
			...(overrides.tokens ?? {})
		}
	});

const assertValidHexColor = (value: unknown, fieldName: string) => {
	if (typeof value !== 'string' || !HEX_COLOR_RE.test(value)) {
		throw new Error(`${fieldName} must be a hex color.`);
	}
};

const normalizeHex = (value: string) => {
	const hex = value.toLowerCase();
	if (hex.length === 4) {
		return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
	}
	return hex;
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const hexToRgb = (hexColor: string) => {
	const hex = normalizeHex(hexColor).slice(1);
	return {
		r: parseInt(hex.slice(0, 2), 16),
		g: parseInt(hex.slice(2, 4), 16),
		b: parseInt(hex.slice(4, 6), 16)
	};
};

const rgbToHex = ({ r, g, b }: { r: number; g: number; b: number }) =>
	`#${[r, g, b]
		.map((channel) => clamp(Math.round(channel), 0, 255).toString(16).padStart(2, '0'))
		.join('')}`;

const mixHex = (from: string, to: string, amount: number) => {
	const a = hexToRgb(from);
	const b = hexToRgb(to);
	return rgbToHex({
		r: a.r + (b.r - a.r) * amount,
		g: a.g + (b.g - a.g) * amount,
		b: a.b + (b.b - a.b) * amount
	});
};

const hexToRgba = (hexColor: string, alpha: number) => {
	const { r, g, b } = hexToRgb(hexColor);
	return `rgba(${r}, ${g}, ${b}, ${clamp(alpha, 0, 1)})`;
};

export const normalizeCustomTheme = (rawTheme: unknown): CustomTheme => {
	if (!rawTheme || typeof rawTheme !== 'object') {
		throw new Error('Theme must be an object.');
	}

	const theme = rawTheme as Partial<CustomTheme>;
	const tokens = (theme.tokens ?? {}) as Partial<CustomThemeTokens>;
	const id = normalizeThemeId(String(theme.id ?? DEFAULT_THEME.id));
	const name = String(theme.name ?? id).trim().slice(0, 80) || id;
	const colorMode = normalizeTheme(theme.colorMode);
	const customCss = String(theme.customCss ?? '');

	if (!THEME_ID_RE.test(id)) {
		throw new Error('Theme id contains unsupported characters.');
	}
	if (customCss.length > MAX_CUSTOM_CSS_LENGTH) {
		throw new Error(`Custom CSS must be ${MAX_CUSTOM_CSS_LENGTH} characters or fewer.`);
	}

	const normalizedTokens: CustomThemeTokens = {
		primary: normalizeHex(String(tokens.primary ?? DEFAULT_THEME.tokens.primary)),
		background: normalizeHex(String(tokens.background ?? DEFAULT_THEME.tokens.background)),
		foreground: normalizeHex(String(tokens.foreground ?? DEFAULT_THEME.tokens.foreground)),
		surface: normalizeHex(String(tokens.surface ?? DEFAULT_THEME.tokens.surface)),
		radius: String(tokens.radius ?? DEFAULT_THEME.tokens.radius).trim(),
		glassOpacity: clamp(Number(tokens.glassOpacity ?? DEFAULT_THEME.tokens.glassOpacity), 0, 1)
	};

	assertValidHexColor(normalizedTokens.primary, 'Primary color');
	assertValidHexColor(normalizedTokens.background, 'Background color');
	assertValidHexColor(normalizedTokens.foreground, 'Foreground color');
	assertValidHexColor(normalizedTokens.surface, 'Surface color');

	if (!RADIUS_RE.test(normalizedTokens.radius)) {
		throw new Error('Radius must use px, rem, em, or %.');
	}

	return {
		schemaVersion: 1,
		id,
		name,
		colorMode,
		tokens: normalizedTokens,
		customCss
	};
};

const getGrayScale = (theme: CustomTheme) => {
	const { background, foreground, surface } = theme.tokens;
	const effectiveMode = getEffectiveColorMode(theme.colorMode);

	if (effectiveMode === 'dark') {
		return {
			50: mixHex(foreground, '#ffffff', 0.08),
			100: mixHex(foreground, '#ffffff', 0.02),
			200: mixHex(foreground, surface, 0.22),
			300: mixHex(foreground, surface, 0.38),
			400: mixHex(foreground, surface, 0.55),
			500: mixHex(foreground, surface, 0.7),
			600: mixHex(surface, foreground, 0.18),
			700: mixHex(surface, foreground, 0.1),
			800: surface,
			850: mixHex(background, surface, 0.45),
			900: background,
			950: mixHex(background, '#000000', 0.22)
		};
	}

	return {
		50: background,
		100: surface,
		200: mixHex(surface, foreground, 0.1),
		300: mixHex(surface, foreground, 0.2),
		400: mixHex(surface, foreground, 0.35),
		500: mixHex(surface, foreground, 0.5),
		600: mixHex(surface, foreground, 0.65),
		700: mixHex(surface, foreground, 0.78),
		800: mixHex(surface, foreground, 0.88),
		850: mixHex(surface, foreground, 0.92),
		900: foreground,
		950: mixHex(foreground, '#000000', 0.2)
	};
};

export const getThemeCssVariables = (themeInput: unknown): Record<string, string> => {
	const theme = normalizeCustomTheme(themeInput);
	const primary = theme.tokens.primary;
	const gray = getGrayScale(theme);

	return {
		'--halo-theme-background': theme.tokens.background,
		'--halo-theme-foreground': theme.tokens.foreground,
		'--halo-theme-surface': theme.tokens.surface,
		'--halo-theme-radius': theme.tokens.radius,
		'--halo-theme-glass-opacity': String(theme.tokens.glassOpacity),
		'--glass-shadow': `0 18px 50px ${hexToRgba(theme.tokens.background, 0.22)}`,
		'--color-surface-glass': hexToRgba(theme.tokens.surface, theme.tokens.glassOpacity),
		'--color-surface-glass-dark': hexToRgba(theme.tokens.surface, theme.tokens.glassOpacity),
		'--color-primary-50': mixHex(primary, '#ffffff', 0.9),
		'--color-primary-100': mixHex(primary, '#ffffff', 0.8),
		'--color-primary-200': mixHex(primary, '#ffffff', 0.65),
		'--color-primary-300': mixHex(primary, '#ffffff', 0.45),
		'--color-primary-400': mixHex(primary, '#ffffff', 0.22),
		'--color-primary-500': primary,
		'--color-primary-600': mixHex(primary, '#000000', 0.12),
		'--color-primary-700': mixHex(primary, '#000000', 0.25),
		'--color-primary-800': mixHex(primary, '#000000', 0.38),
		'--color-primary-900': mixHex(primary, '#000000', 0.55),
		...Object.fromEntries(Object.entries(gray).map(([step, color]) => [`--color-gray-${step}`, color]))
	};
};

export const getEffectiveColorMode = (colorMode: ThemeColorMode): 'light' | 'dark' => {
	if (colorMode !== 'system') return colorMode;
	if (typeof window === 'undefined') return 'light';
	return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

const setMetaThemeColor = (color: string) => {
	if (typeof document === 'undefined') return;
	document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
};

const applyThemeClass = (colorMode: ThemeColorMode) => {
	if (typeof document === 'undefined') return getEffectiveColorMode(colorMode);

	const effectiveMode = getEffectiveColorMode(colorMode);
	document.documentElement.classList.remove(
		'dark',
		'light',
		'her',
		'rose-pine',
		'rose-pine-dawn',
		'oled-dark'
	);
	document.documentElement.classList.add(effectiveMode);
	return effectiveMode;
};

const ensureCustomStyleElement = () => {
	if (typeof document === 'undefined') return null;
	let style = document.getElementById(CUSTOM_THEME_STYLE_ID) as HTMLStyleElement | null;
	if (!style) {
		style = document.createElement('style');
		style.id = CUSTOM_THEME_STYLE_ID;
		document.head.appendChild(style);
	}
	return style;
};

const persistCustomThemeCache = (theme: CustomTheme, cssVariables: Record<string, string>) => {
	if (typeof localStorage === 'undefined') return;
	const cache: CustomThemeCache = { theme, cssVariables };
	localStorage.setItem(CUSTOM_THEME_CACHE_KEY, JSON.stringify(cache));
	localStorage.setItem(CUSTOM_THEME_ACTIVE_ID_KEY, theme.id);
	localStorage.setItem('theme', theme.colorMode);
};

export const clearCustomTheme = (options: { persist?: boolean } = {}) => {
	if (typeof document !== 'undefined') {
		for (const variableName of CUSTOM_THEME_VARIABLES) {
			document.documentElement.style.removeProperty(variableName);
		}
		document.getElementById(CUSTOM_THEME_STYLE_ID)?.remove();
	}

	if (options.persist !== false && typeof localStorage !== 'undefined') {
		localStorage.removeItem(CUSTOM_THEME_CACHE_KEY);
		localStorage.removeItem(CUSTOM_THEME_ACTIVE_ID_KEY);
	}
};

export const applyBuiltinTheme = (rawTheme: unknown, options: { persist?: boolean } = {}) => {
	const normalizedTheme = normalizeTheme(rawTheme);
	clearCustomTheme({ persist: options.persist });
	const effectiveMode = applyThemeClass(normalizedTheme);
	setMetaThemeColor(effectiveMode === 'dark' ? '#171717' : '#ffffff');

	if (options.persist !== false && typeof localStorage !== 'undefined') {
		localStorage.setItem('theme', normalizedTheme);
	}

	if (typeof window !== 'undefined' && window.applyTheme) {
		window.applyTheme();
	}

	return normalizedTheme;
};

export const applyCustomTheme = (
	rawTheme: unknown,
	options: { persist?: boolean } = {}
): CustomTheme => {
	const theme = normalizeCustomTheme(rawTheme);
	const cssVariables = getThemeCssVariables(theme);
	const effectiveMode = applyThemeClass(theme.colorMode);

	if (typeof document !== 'undefined') {
		for (const [name, value] of Object.entries(cssVariables)) {
			document.documentElement.style.setProperty(name, value);
		}
		const style = ensureCustomStyleElement();
		if (style) {
			style.textContent = theme.customCss;
		}
	}

	setMetaThemeColor(theme.tokens.background || (effectiveMode === 'dark' ? '#171717' : '#ffffff'));

	if (options.persist !== false) {
		persistCustomThemeCache(theme, cssVariables);
	}

	if (typeof window !== 'undefined' && window.applyTheme) {
		window.applyTheme();
	}

	return theme;
};

export const getCachedCustomTheme = (): CustomTheme | null => {
	if (typeof localStorage === 'undefined') return null;

	try {
		const rawCache = localStorage.getItem(CUSTOM_THEME_CACHE_KEY);
		if (!rawCache) return null;
		const cache = JSON.parse(rawCache) as Partial<CustomThemeCache> | CustomTheme;
		return normalizeCustomTheme('theme' in cache ? cache.theme : cache);
	} catch {
		return null;
	}
};

export const applyCachedCustomTheme = () => {
	const cachedTheme = getCachedCustomTheme();
	if (!cachedTheme) return null;
	return applyCustomTheme(cachedTheme, { persist: false });
};
