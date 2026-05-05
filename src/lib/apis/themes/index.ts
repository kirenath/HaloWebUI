import { WEBUI_API_BASE_URL } from '$lib/constants';
import type { CustomTheme } from '$lib/utils/theme-runtime';
import { parseJsonResponse } from '../response';

export type ThemeSummary = {
	id: string;
	name: string;
	colorMode: 'light' | 'dark' | 'system';
	updatedAt: number;
	size: number;
};

const getJsonHeaders = (token: string) => ({
	'Content-Type': 'application/json',
	Authorization: `Bearer ${token}`
});

export const getThemes = async (token: string): Promise<ThemeSummary[]> => {
	let error = null;
	const res = await fetch(`${WEBUI_API_BASE_URL}/themes`, {
		method: 'GET',
		headers: getJsonHeaders(token)
	})
		.then(parseJsonResponse<ThemeSummary[]>)
		.catch((err) => {
			console.log(err);
			error = err;
			return [];
		});

	if (error) {
		throw error;
	}

	return res;
};

export const getTheme = async (token: string, id: string): Promise<CustomTheme> => {
	let error = null;
	const res = await fetch(`${WEBUI_API_BASE_URL}/themes/${encodeURIComponent(id)}`, {
		method: 'GET',
		headers: getJsonHeaders(token)
	})
		.then(parseJsonResponse<CustomTheme>)
		.catch((err) => {
			console.log(err);
			error = err;
			return null;
		});

	if (error) {
		throw error;
	}
	if (!res) {
		throw new Error('Theme not found');
	}

	return res;
};

export const saveTheme = async (token: string, theme: CustomTheme): Promise<CustomTheme> => {
	let error = null;
	const res = await fetch(`${WEBUI_API_BASE_URL}/themes`, {
		method: 'POST',
		headers: getJsonHeaders(token),
		body: JSON.stringify(theme)
	})
		.then(parseJsonResponse<CustomTheme>)
		.catch((err) => {
			console.log(err);
			error = err;
			return null;
		});

	if (error) {
		throw error;
	}
	if (!res) {
		throw new Error('Theme was not saved');
	}

	return res;
};

export const deleteTheme = async (token: string, id: string) => {
	let error = null;
	const res = await fetch(`${WEBUI_API_BASE_URL}/themes/${encodeURIComponent(id)}`, {
		method: 'DELETE',
		headers: getJsonHeaders(token)
	})
		.then(parseJsonResponse<{ ok: boolean }>)
		.catch((err) => {
			console.log(err);
			error = err;
			return null;
		});

	if (error) {
		throw error;
	}

	return res;
};

export const importTheme = async (token: string, theme: CustomTheme): Promise<CustomTheme> => {
	let error = null;
	const res = await fetch(`${WEBUI_API_BASE_URL}/themes/import`, {
		method: 'POST',
		headers: getJsonHeaders(token),
		body: JSON.stringify({ theme })
	})
		.then(parseJsonResponse<CustomTheme>)
		.catch((err) => {
			console.log(err);
			error = err;
			return null;
		});

	if (error) {
		throw error;
	}
	if (!res) {
		throw new Error('Theme was not imported');
	}

	return res;
};

export const exportTheme = async (token: string, id: string): Promise<CustomTheme> => {
	let error = null;
	const res = await fetch(`${WEBUI_API_BASE_URL}/themes/${encodeURIComponent(id)}/export`, {
		method: 'GET',
		headers: getJsonHeaders(token)
	})
		.then(parseJsonResponse<CustomTheme>)
		.catch((err) => {
			console.log(err);
			error = err;
			return null;
		});

	if (error) {
		throw error;
	}
	if (!res) {
		throw new Error('Theme was not exported');
	}

	return res;
};
