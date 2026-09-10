import type { PermissionDefinition } from '../../contracts';

const PERMISSION_KEY_PATTERN = /^[a-z](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z](?:[a-z0-9-]*[a-z0-9])?)+$/;

function containsControlCharacters(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
}

export class PermissionDefinitionValidationError extends Error {
  constructor(
    public readonly field: 'key' | 'description' | 'definitions',
    message: string,
  ) {
    super(message);
    this.name = 'PermissionDefinitionValidationError';
  }
}

export class PermissionDefinitionConflictError extends Error {
  constructor(public readonly key: string) {
    super(`Permission definition conflicts with existing key: ${key}`);
    this.name = 'PermissionDefinitionConflictError';
  }
}

export function normalizePermissionDefinitions(
  definitions: readonly PermissionDefinition[],
): PermissionDefinition[] {
  if (!Array.isArray(definitions)) {
    throw new PermissionDefinitionValidationError('definitions', 'Permission definitions must be an array');
  }

  const normalized = new Map<string, PermissionDefinition>();
  for (const definition of definitions) {
    if (!definition || typeof definition.key !== 'string') {
      throw new PermissionDefinitionValidationError('key', 'Permission key must be a string');
    }
    if (typeof definition.description !== 'string') {
      throw new PermissionDefinitionValidationError('description', 'Permission description must be a string');
    }

    const key = definition.key.trim();
    const description = definition.description.trim();

    if (key.length === 0 || key.length > 120 || !PERMISSION_KEY_PATTERN.test(key)) {
      throw new PermissionDefinitionValidationError(
        'key',
        'Permission key must be 120 characters or fewer and use lowercase dot-separated segments',
      );
    }
    if (description.length === 0 || description.length > 255 || containsControlCharacters(description)) {
      throw new PermissionDefinitionValidationError(
        'description',
        'Permission description must be 1-255 visible characters',
      );
    }

    const previous = normalized.get(key);
    if (previous) {
      if (previous.description !== description) throw new PermissionDefinitionConflictError(key);
      continue;
    }
    normalized.set(key, { key, description });
  }

  return [...normalized.values()];
}
