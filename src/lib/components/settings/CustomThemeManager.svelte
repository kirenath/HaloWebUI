<script lang="ts">
	import { createEventDispatcher, getContext, onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import type { Writable } from 'svelte/store';

	import HaloSelect from '$lib/components/common/HaloSelect.svelte';
	import Textarea from '$lib/components/common/Textarea.svelte';
	import {
		deleteTheme,
		exportTheme,
		getTheme,
		getThemes,
		importTheme,
		saveTheme,
		type ThemeSummary
	} from '$lib/apis/themes';
	import { getErrorDetail } from '$lib/apis/response';
	import {
		applyCustomTheme,
		createDefaultCustomTheme,
		normalizeCustomTheme,
		normalizeThemeId,
		type CustomTheme
	} from '$lib/utils/theme-runtime';

	const dispatch = createEventDispatcher<{
		activeThemeChange: { activeThemeId: string | null; colorMode?: 'light' | 'dark' | 'system'; theme?: CustomTheme };
		dirtyChange: { value: boolean };
	}>();
	const i18n: Writable<any> = getContext('i18n');

	export let activeThemeId: string | null = null;

	let themes: ThemeSummary[] = [];
	let selectedThemeId = '';
	let draft: CustomTheme = createDefaultCustomTheme();
	let savedDraftJson = JSON.stringify(draft);
	let loading = false;
	let saving = false;
	let fileInputElement: HTMLInputElement | null = null;
	const tokenColorFields = [
		{ key: 'primary', label: 'Primary' },
		{ key: 'background', label: 'Background' },
		{ key: 'foreground', label: 'Text' },
		{ key: 'surface', label: 'Surface' }
	] as const;

	$: themeOptions = themes.map((item) => ({
		value: item.id,
		label: item.name,
		description: `${item.id} · ${item.colorMode}`
	}));
	$: draftJson = JSON.stringify(draft);
	$: dirty = draftJson !== savedDraftJson;
	$: dispatch('dirtyChange', { value: dirty });

	const getToken = () => localStorage.token;

	const setDraft = (theme: CustomTheme) => {
		draft = normalizeCustomTheme(theme);
		selectedThemeId = draft.id;
		savedDraftJson = JSON.stringify(draft);
	};

	const loadThemeList = async () => {
		loading = true;
		try {
			themes = await getThemes(getToken());
			const nextId =
				(activeThemeId && themes.some((item) => item.id === activeThemeId) ? activeThemeId : '') ||
				selectedThemeId ||
				themes[0]?.id ||
				'';

			if (nextId) {
				await selectTheme(nextId);
			} else {
				setDraft(createDefaultCustomTheme());
			}
		} catch (error) {
			console.error(error);
			toast.error(getErrorDetail(error, $i18n.t('Failed to load themes')));
		} finally {
			loading = false;
		}
	};

	const selectTheme = async (id: string) => {
		if (!id) return;

		try {
			const theme = await getTheme(getToken(), id);
			setDraft(theme);
		} catch (error) {
			console.error(error);
			toast.error(getErrorDetail(error, $i18n.t('Failed to load theme')));
		}
	};

	const createNewTheme = () => {
		const nextIndex = themes.length + 1;
		setDraft(
			createDefaultCustomTheme({
				id: `my-theme-${nextIndex}`,
				name: `${$i18n.t('Custom Theme')} ${nextIndex}`
			})
		);
		savedDraftJson = '';
	};

	const addFontFace = () => {
		draft.tokens = {
			...draft.tokens,
			fontFaces: [...(draft.tokens.fontFaces ?? []), { family: '', src: '', weight: '', style: 'normal' }]
		};
	};

	const removeFontFace = (index: number) => {
		const faces = [...(draft.tokens.fontFaces ?? [])];
		faces.splice(index, 1);
		draft.tokens = { ...draft.tokens, fontFaces: faces };
	};

	export const save = async () => {
		if (saving) return activeThemeId;
		if (!dirty) return activeThemeId;

		saving = true;
		try {
			const normalized = normalizeCustomTheme({
				...draft,
				id: normalizeThemeId(draft.id)
			});
			const savedTheme = await saveTheme(getToken(), normalized);
			setDraft(savedTheme);
			themes = await getThemes(getToken());

			if (activeThemeId === savedTheme.id) {
				applyCustomTheme(savedTheme);
				dispatch('activeThemeChange', {
					activeThemeId: savedTheme.id,
					colorMode: savedTheme.colorMode,
					theme: savedTheme
				});
			}

			toast.success($i18n.t('Theme saved'));
			return activeThemeId;
		} catch (error) {
			console.error(error);
			toast.error(getErrorDetail(error, $i18n.t('Failed to save theme')));
			throw error;
		} finally {
			saving = false;
		}
	};

	export const reset = async () => {
		if (selectedThemeId) {
			await selectTheme(selectedThemeId);
		} else {
			setDraft(createDefaultCustomTheme());
		}
	};

	export const clearActive = () => {
		activeThemeId = null;
		dispatch('activeThemeChange', { activeThemeId: null });
	};

	const previewTheme = () => {
		try {
			applyCustomTheme(draft, { persist: false });
		} catch (error) {
			toast.error(getErrorDetail(error, $i18n.t('Invalid theme')));
		}
	};

	const activateTheme = async () => {
		const normalized = dirty ? normalizeCustomTheme({ ...draft, id: normalizeThemeId(draft.id) }) : draft;
		if (dirty) {
			await save();
		}

		const theme = normalizeCustomTheme(normalized);
		applyCustomTheme(theme);
		activeThemeId = theme.id;
		dispatch('activeThemeChange', {
			activeThemeId: theme.id,
			colorMode: theme.colorMode,
			theme
		});
		toast.success($i18n.t('Theme activated'));
	};

	const deleteSelectedTheme = async () => {
		if (!selectedThemeId) return;
		if (!confirm($i18n.t('Delete this theme?'))) return;

		try {
			await deleteTheme(getToken(), selectedThemeId);
			if (activeThemeId === selectedThemeId) {
				clearActive();
			}
			selectedThemeId = '';
			await loadThemeList();
			toast.success($i18n.t('Theme deleted'));
		} catch (error) {
			console.error(error);
			toast.error(getErrorDetail(error, $i18n.t('Failed to delete theme')));
		}
	};

	const downloadSelectedTheme = async () => {
		if (!selectedThemeId) return;

		try {
			const theme = await exportTheme(getToken(), selectedThemeId);
			const blob = new Blob([JSON.stringify(theme, null, 2)], { type: 'application/json' });
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `${theme.id}.json`;
			a.click();
			URL.revokeObjectURL(url);
		} catch (error) {
			console.error(error);
			toast.error(getErrorDetail(error, $i18n.t('Failed to export theme')));
		}
	};

	const importSelectedFile = async () => {
		const file = fileInputElement?.files?.[0];
		if (!file) return;

		try {
			const imported = await importTheme(getToken(), JSON.parse(await file.text()));
			setDraft(imported);
			themes = await getThemes(getToken());
			toast.success($i18n.t('Theme imported'));
		} catch (error) {
			console.error(error);
			toast.error(getErrorDetail(error, $i18n.t('Failed to import theme')));
		} finally {
			if (fileInputElement) {
				fileInputElement.value = '';
			}
		}
	};

	onMount(() => {
		void loadThemeList();
	});
</script>

<div class="glass-item p-4 space-y-4">
	<div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
		<div class="space-y-1">
			<div class="text-sm font-medium">{$i18n.t('Custom Theme Files')}</div>
			<div class="text-xs text-gray-500 dark:text-gray-400">
				{$i18n.t('Edit, preview, import, export, and activate file-backed UI themes.')}
			</div>
		</div>
		<div class="flex flex-wrap gap-2">
			<button
				type="button"
				class="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
				on:click={createNewTheme}
			>
				{$i18n.t('New')}
			</button>
			<button
				type="button"
				class="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
				on:click={() => fileInputElement?.click()}
			>
				{$i18n.t('Import')}
			</button>
			<input
				bind:this={fileInputElement}
				type="file"
				accept="application/json,.json"
				class="hidden"
				on:change={importSelectedFile}
			/>
		</div>
	</div>

	<div class="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
		<HaloSelect
			bind:value={selectedThemeId}
			options={themeOptions}
			placeholder={loading ? $i18n.t('Loading...') : $i18n.t('Select a saved theme')}
			className="w-full"
			contentAlign="start"
			searchEnabled={true}
			on:change={(event) => selectTheme(event.detail.value)}
		/>
		<div class="flex flex-wrap gap-2">
			<button
				type="button"
				class="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
				disabled={!selectedThemeId}
				on:click={downloadSelectedTheme}
			>
				{$i18n.t('Export')}
			</button>
			<button
				type="button"
				class="rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-medium text-rose-600 transition hover:bg-rose-50 disabled:opacity-50 dark:border-rose-900/60 dark:bg-gray-900 dark:text-rose-300 dark:hover:bg-rose-950/30"
				disabled={!selectedThemeId || saving}
				on:click={deleteSelectedTheme}
			>
				{$i18n.t('Delete')}
			</button>
		</div>
	</div>

	<div class="grid gap-3 md:grid-cols-2">
		<label class="space-y-1 text-xs font-medium text-gray-600 dark:text-gray-300">
			<span>{$i18n.t('Theme Name')}</span>
			<input
				bind:value={draft.name}
				class="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800 outline-none dark:border-gray-700 dark:bg-gray-850 dark:text-gray-100"
			/>
		</label>
		<label class="space-y-1 text-xs font-medium text-gray-600 dark:text-gray-300">
			<span>{$i18n.t('Theme ID')}</span>
			<input
				bind:value={draft.id}
				on:blur={() => {
					draft.id = normalizeThemeId(draft.id);
				}}
				class="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800 outline-none dark:border-gray-700 dark:bg-gray-850 dark:text-gray-100"
			/>
		</label>
	</div>

	<div class="grid gap-3 md:grid-cols-3">
		<label class="space-y-1 text-xs font-medium text-gray-600 dark:text-gray-300">
			<span>{$i18n.t('Mode')}</span>
			<select
				bind:value={draft.colorMode}
				class="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800 outline-none dark:border-gray-700 dark:bg-gray-850 dark:text-gray-100"
			>
				<option value="dark">{$i18n.t('Dark')}</option>
				<option value="light">{$i18n.t('Light')}</option>
				<option value="system">{$i18n.t('System')}</option>
			</select>
		</label>
		<label class="space-y-1 text-xs font-medium text-gray-600 dark:text-gray-300">
			<span>{$i18n.t('Radius')}</span>
			<input
				bind:value={draft.tokens.radius}
				placeholder="16px"
				class="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800 outline-none dark:border-gray-700 dark:bg-gray-850 dark:text-gray-100"
			/>
		</label>
		<label class="space-y-1 text-xs font-medium text-gray-600 dark:text-gray-300">
			<span>{$i18n.t('Glass Opacity')}</span>
			<input
				bind:value={draft.tokens.glassOpacity}
				type="number"
				min="0"
				max="1"
				step="0.05"
				class="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800 outline-none dark:border-gray-700 dark:bg-gray-850 dark:text-gray-100"
			/>
		</label>
	</div>

	<div class="grid gap-3 md:grid-cols-4">
		{#each tokenColorFields as field}
			<label class="space-y-1 text-xs font-medium text-gray-600 dark:text-gray-300">
				<span>{$i18n.t(field.label)}</span>
				<div class="flex gap-2">
					<input
						bind:value={draft.tokens[field.key]}
						type="color"
						class="h-10 w-12 rounded-lg border border-gray-200 bg-transparent p-1 dark:border-gray-700"
					/>
					<input
						bind:value={draft.tokens[field.key]}
						class="min-w-0 flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800 outline-none dark:border-gray-700 dark:bg-gray-850 dark:text-gray-100"
					/>
				</div>
			</label>
		{/each}
	</div>

	<div class="space-y-3 rounded-2xl border border-gray-200/70 p-4 dark:border-gray-700/60">
		<div class="space-y-1">
			<div class="text-sm font-medium">{$i18n.t('Fonts')}</div>
			<div class="text-xs text-gray-500 dark:text-gray-400">
				{$i18n.t('Set font-family stacks for UI, headings, and code. Leave empty to use the default fonts.')}
			</div>
		</div>

		<div class="grid gap-3 md:grid-cols-3">
			<label class="space-y-1 text-xs font-medium text-gray-600 dark:text-gray-300">
				<span>{$i18n.t('Body Font')}</span>
				<input
					bind:value={draft.tokens.fontBody}
					placeholder="'Inter', system-ui, sans-serif"
					class="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800 outline-none dark:border-gray-700 dark:bg-gray-850 dark:text-gray-100"
				/>
			</label>
			<label class="space-y-1 text-xs font-medium text-gray-600 dark:text-gray-300">
				<span>{$i18n.t('Heading Font')}</span>
				<input
					bind:value={draft.tokens.fontHeading}
					placeholder="'Space Grotesk', sans-serif"
					class="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800 outline-none dark:border-gray-700 dark:bg-gray-850 dark:text-gray-100"
				/>
			</label>
			<label class="space-y-1 text-xs font-medium text-gray-600 dark:text-gray-300">
				<span>{$i18n.t('Code Font')}</span>
				<input
					bind:value={draft.tokens.fontMono}
					placeholder="'JetBrains Mono', monospace"
					class="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800 outline-none dark:border-gray-700 dark:bg-gray-850 dark:text-gray-100"
				/>
			</label>
		</div>

		<label class="space-y-1 text-xs font-medium text-gray-600 dark:text-gray-300">
			<span>{$i18n.t('Font Stylesheet URL (@import)')}</span>
			<input
				bind:value={draft.tokens.fontImportUrl}
				placeholder="https://fonts.googleapis.com/css2?family=Inter&display=swap"
				class="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800 outline-none dark:border-gray-700 dark:bg-gray-850 dark:text-gray-100"
			/>
			<span class="block text-xs font-normal text-gray-400 dark:text-gray-500">
				{$i18n.t('For hosted CSS font stylesheets such as Google Fonts. Must be https.')}
			</span>
		</label>

		<div class="space-y-2">
			<div class="flex items-center justify-between gap-2">
				<div class="text-xs font-medium text-gray-600 dark:text-gray-300">
					{$i18n.t('Custom Font Files (@font-face)')}
				</div>
				<button
					type="button"
					class="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
					on:click={addFontFace}
				>
					{$i18n.t('Add Font')}
				</button>
			</div>
			<div class="text-xs text-gray-400 dark:text-gray-500">
				{$i18n.t('Direct https links to .woff2/.woff/.ttf/.otf files (e.g. a Cloudflare R2 bucket). The font host must allow CORS.')}
			</div>
			{#each draft.tokens.fontFaces ?? [] as face, index (index)}
				<div class="grid gap-2 rounded-xl border border-gray-200/70 p-2 dark:border-gray-700/60 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_5rem_auto]">
					<input
						bind:value={face.family}
						placeholder={$i18n.t('Family name')}
						class="min-w-0 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800 outline-none dark:border-gray-700 dark:bg-gray-850 dark:text-gray-100"
					/>
					<input
						bind:value={face.src}
						placeholder="https://cdn.example.com/font.woff2"
						class="min-w-0 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800 outline-none dark:border-gray-700 dark:bg-gray-850 dark:text-gray-100"
					/>
					<input
						bind:value={face.weight}
						placeholder="400"
						class="min-w-0 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800 outline-none dark:border-gray-700 dark:bg-gray-850 dark:text-gray-100"
					/>
					<button
						type="button"
						class="rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 text-xs font-medium text-rose-600 transition hover:bg-rose-50 dark:border-rose-900/60 dark:bg-gray-900 dark:text-rose-300 dark:hover:bg-rose-950/30"
						on:click={() => removeFontFace(index)}
					>
						{$i18n.t('Remove')}
					</button>
				</div>
			{/each}
		</div>
	</div>

	<div class="rounded-2xl border border-gray-200/70 p-4 dark:border-gray-700/60" style={`background: ${draft.tokens.background}; color: ${draft.tokens.foreground}; border-radius: ${draft.tokens.radius};`}>
		<div class="text-xs uppercase tracking-wide opacity-70">{$i18n.t('Preview')}</div>
		<div class="mt-2 flex flex-wrap items-center gap-3">
			<div class="rounded-xl px-3 py-2 text-sm" style={`background: ${draft.tokens.surface};`}>
				{$i18n.t('Surface Card')}
			</div>
			<div class="rounded-xl px-3 py-2 text-sm text-white" style={`background: ${draft.tokens.primary};`}>
				{$i18n.t('Primary Action')}
			</div>
		</div>
	</div>

	<div class="space-y-1">
		<div class="text-xs font-medium text-gray-600 dark:text-gray-300">
			{$i18n.t('Advanced Custom CSS')}
		</div>
		<Textarea
			bind:value={draft.customCss}
			rows={5}
			minSize={120}
			maxSize={260}
			placeholder={'/* .my-selector { color: var(--color-primary-500); } */'}
			className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-xs text-gray-800 outline-none dark:border-gray-700 dark:bg-gray-850 dark:text-gray-100"
		/>
		<div class="text-xs text-gray-400 dark:text-gray-500">
			{$i18n.t('Custom CSS is stored in the theme JSON file and injected as text into a dedicated style tag.')}
		</div>
	</div>

	<div class="flex flex-wrap items-center justify-between gap-3">
		<div class="text-xs text-gray-500 dark:text-gray-400">
			{#if activeThemeId === draft.id}
				{$i18n.t('This theme is active.')}
			{:else if dirty}
				{$i18n.t('Unsaved theme changes.')}
			{:else}
				{$i18n.t('Saved as a separate theme file.')}
			{/if}
		</div>
		<div class="flex flex-wrap gap-2">
			<button
				type="button"
				class="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
				on:click={previewTheme}
			>
				{$i18n.t('Preview')}
			</button>
			<button
				type="button"
				class="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
				disabled={saving}
				on:click={save}
			>
				{saving ? $i18n.t('Saving...') : $i18n.t('Save Theme')}
			</button>
			<button
				type="button"
				class="rounded-xl bg-gray-800 px-3 py-2 text-xs font-medium text-white transition hover:bg-gray-700 disabled:opacity-50 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
				disabled={saving}
				on:click={activateTheme}
			>
				{$i18n.t('Activate')}
			</button>
		</div>
	</div>
</div>
