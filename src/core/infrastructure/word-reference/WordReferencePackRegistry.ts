import type {
  WordReferenceInstalledPackRef,
  WordReferencePackRegistry,
} from './WordReferencePack.types';

export function emptyWordReferenceRegistry(): WordReferencePackRegistry {
  return { format: 'quran-word-reference-registry-v1', packs: {} };
}

export function activateWordReferencePack(
  registry: WordReferencePackRegistry,
  ref: WordReferenceInstalledPackRef
): WordReferencePackRegistry {
  const current = registry.packs[ref.packId]?.active;
  if (
    current?.version === ref.version &&
    current.manifest.databaseChecksumSha256.toLowerCase() !==
      ref.manifest.databaseChecksumSha256.toLowerCase()
  ) {
    throw new Error('Dictionary pack versions are immutable');
  }
  return {
    ...registry,
    packs: {
      ...registry.packs,
      [ref.packId]: {
        active: ref,
        ...(current && current.version !== ref.version ? { previous: current } : {}),
      },
    },
  };
}

export function rollbackWordReferencePack(
  registry: WordReferencePackRegistry,
  packId: string
): WordReferencePackRegistry {
  const slot = registry.packs[packId];
  if (!slot?.previous) return registry;
  return {
    ...registry,
    packs: { ...registry.packs, [packId]: { active: slot.previous } },
  };
}

export function removeWordReferencePackVersion(
  registry: WordReferencePackRegistry,
  packId: string,
  version: string
): WordReferencePackRegistry {
  const slot = registry.packs[packId];
  if (!slot) return registry;
  const packs = { ...registry.packs };
  if (slot.active.version === version && slot.previous) packs[packId] = { active: slot.previous };
  else if (slot.active.version === version) delete packs[packId];
  else if (slot.previous?.version === version) packs[packId] = { active: slot.active };
  return { ...registry, packs };
}
