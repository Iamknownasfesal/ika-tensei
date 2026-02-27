"use client";

import { useQuery } from "@tanstack/react-query";
import {
  getGuildRealms,
  getGuildProposals,
  getGuildTreasury,
  getGuildStats,
} from "@/lib/api";

/**
 * Fetch all DAO realms.
 */
export function useGuildRealms() {
  return useQuery({
    queryKey: ["guild", "realms"],
    queryFn: () => getGuildRealms(),
    staleTime: 60_000,
  });
}

/**
 * Fetch proposals for a specific realm.
 */
export function useGuildProposals(realmAddress: string | null) {
  return useQuery({
    queryKey: ["guild", "proposals", realmAddress],
    queryFn: () => getGuildProposals(realmAddress!),
    enabled: !!realmAddress,
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
}

/**
 * Fetch treasury balance for a specific realm.
 */
export function useGuildTreasury(realmAddress: string | null) {
  return useQuery({
    queryKey: ["guild", "treasury", realmAddress],
    queryFn: () => getGuildTreasury(realmAddress!),
    enabled: !!realmAddress,
    staleTime: 60_000,
  });
}

/**
 * Fetch aggregate guild stats.
 */
export function useGuildStats() {
  return useQuery({
    queryKey: ["guild", "stats"],
    queryFn: () => getGuildStats(),
    staleTime: 60_000,
  });
}
