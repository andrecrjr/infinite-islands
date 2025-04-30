import { Biome } from "./types";

export const STORAGE_KEY_DATA = 'islandData';
export const STORAGE_KEY_CHUNKS = 'generatedChunks';
export const CHUNK_SIZE = 100;
export const VIEW_DISTANCE = 2; // Chunks away from player
export const ISLAND_NAME_PROMPT_DISTANCE = 3; // Distance to trigger naming prompt
export const AD_INTERACTION_DISTANCE = 5; // Distance to trigger ad URL redirection
export const ISLANDS_PER_CHUNK = { min: 3, max: 6 }; // Range of islands per chunk
export const ISLAND_SIZE_RANGE = { min: 5, max: 10 }; // Range for island size

// Ad-related constants
export const MAX_ADS_PER_CHUNK = 1; // Maximum 1 ad per chunk to reduce ad density
export const AD_SPAWN_CHANCE = 0.15; // 15% chance for an island to be an ad
export const STARTING_CHUNK_AD_BOOST = 2; // Higher chance multiplier for ads in starting chunks (reduced from 3)
export const STARTING_AREA_RADIUS = 2; // Number of chunks considered as "starting area"
export const AD_RANK_TIERS = [
    { rank: 10, sizeBoost: 1.7, name: "Premium Plus" },  // Highest paying tier
    { rank: 8, sizeBoost: 1.6, name: "Premium" },
    { rank: 6, sizeBoost: 1.5, name: "Plus" },
    { rank: 4, sizeBoost: 1.4, name: "Standard" }, 
    { rank: 2, sizeBoost: 1.3, name: "Basic" }           // Lowest paying tier
];

export const BIOMES: Biome[] = [
    { name: 'Jungle', color: 0x228B22 },
    { name: 'Desert', color: 0xC2B280 },
    { name: 'Snow', color: 0xFFFFFF },
    { name: 'Volcano', color: 0x8B0000 }
];

export const PLAYER_SPEED = 0.5;
export const PLAYER_REVERSE_SPEED = 0.1;
export const PLAYER_TURN_SPEED = 0.03;

export const CAMERA_OFFSET = { x: 0, y: 5, z: -12 };
export const CAMERA_LERP_FACTOR = 0.1; 