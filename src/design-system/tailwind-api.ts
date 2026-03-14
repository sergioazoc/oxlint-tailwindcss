/**
 * ÚNICO punto de contacto con @tailwindcss/node.
 * Si Tailwind Labs cambia la API __unstable__, solo se modifica este archivo.
 * Ninguna regla importa de @tailwindcss/node directamente.
 */

import { __unstable__loadDesignSystem } from "@tailwindcss/node";

// Re-exportar el tipo para que las reglas no importen de @tailwindcss/node
export type DesignSystem = Awaited<
	ReturnType<typeof __unstable__loadDesignSystem>
>;

export async function createDesignSystem(
	css: string,
	base: string,
): Promise<DesignSystem> {
	return __unstable__loadDesignSystem(css, { base });
}

export function canonicalize(ds: DesignSystem, classes: string[]): string[] {
	return ds.candidatesToCss(classes).flatMap((css, i) => (css != null ? [classes[i]] : []));
}

export function parseCandidate(
	ds: DesignSystem,
	className: string,
): readonly unknown[] {
	return ds.parseCandidate(className);
}

export function getClassOrder(
	ds: DesignSystem,
	classes: string[],
): [string, bigint | null][] {
	return ds.getClassOrder(classes);
}

export function candidatesToCss(
	ds: DesignSystem,
	classes: string[],
): (string | null)[] {
	return ds.candidatesToCss(classes);
}

export function canonicalizeCandidates(
	ds: DesignSystem,
	classes: string[],
): string[] {
	return ds.canonicalizeCandidates(classes);
}

export function getClassList(
	ds: DesignSystem,
): { className: string; fractions: string[] }[] {
	return ds.getClassList();
}
