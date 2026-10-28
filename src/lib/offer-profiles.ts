"use client";

import { useSyncExternalStore } from "react";

import type { OfferInput } from "@/lib/schemas";

/**
 * Perfis de oferta do SDR, salvos no localStorage do navegador.
 * Toda leitura e escrita é protegida por try/catch: em aba anônima, armazenamento
 * cheio ou bloqueado, o app continua funcionando só em memória.
 */

export interface OfferProfile {
  id: string;
  offer: OfferInput;
  updatedAt: number;
}

export interface ProfilesState {
  profiles: OfferProfile[];
  activeId: string | null;
}

export const STORAGE_KEY = "briefly:offer-profiles:v1";
const EMPTY: ProfilesState = { profiles: [], activeId: null };

let cache: ProfilesState | null = null;
const listeners = new Set<() => void>();

function isProfile(value: unknown): value is OfferProfile {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<OfferProfile>;
  return typeof candidate.id === "string" && !!candidate.offer && typeof candidate.offer === "object";
}

function readStorage(): ProfilesState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<ProfilesState>;
    const profiles = Array.isArray(parsed.profiles) ? parsed.profiles.filter(isProfile) : [];
    const activeId = profiles.some((profile) => profile.id === parsed.activeId)
      ? (parsed.activeId as string)
      : (profiles[0]?.id ?? null);
    return { profiles, activeId };
  } catch {
    return EMPTY;
  }
}

function write(next: ProfilesState) {
  cache = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Sem armazenamento disponível: segue só em memória nesta aba.
  }
  listeners.forEach((listener) => listener());
}

function getSnapshot(): ProfilesState {
  if (cache === null) cache = readStorage();
  return cache;
}

function getServerSnapshot(): ProfilesState {
  return EMPTY;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return;
    cache = readStorage();
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }
}

/** Salva uma oferta. Sem `id`, cria um perfil novo. Retorna o id salvo e o torna ativo. */
export function saveProfile(offer: OfferInput, id?: string): string {
  const state = getSnapshot();
  const profileId = id && state.profiles.some((profile) => profile.id === id) ? id : newId();
  const profile: OfferProfile = { id: profileId, offer, updatedAt: Date.now() };
  const exists = state.profiles.some((item) => item.id === profileId);
  const profiles = exists
    ? state.profiles.map((item) => (item.id === profileId ? profile : item))
    : [...state.profiles, profile];
  write({ profiles, activeId: profileId });
  return profileId;
}

export function deleteProfile(id: string) {
  const state = getSnapshot();
  const profiles = state.profiles.filter((profile) => profile.id !== id);
  const activeId = state.activeId === id ? (profiles[0]?.id ?? null) : state.activeId;
  write({ profiles, activeId });
}

/** Ativa um perfil; `null` deixa nenhum ativo (usado para cadastrar uma oferta nova). */
export function setActiveProfile(id: string | null) {
  const state = getSnapshot();
  if (id === null || state.profiles.some((profile) => profile.id === id)) write({ ...state, activeId: id });
}

export function useOfferProfiles() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const active = state.profiles.find((profile) => profile.id === state.activeId) ?? null;
  return { ...state, active };
}

/** Só para testes: zera o cache em memória. */
export function __resetProfilesCache() {
  cache = null;
}
