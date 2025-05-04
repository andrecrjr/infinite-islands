import * as THREE from 'three';
import { IslandData, Biome } from './types';
import { DataManager } from './dataManager';
import { BIOMES, CHUNK_SIZE, ISLANDS_PER_CHUNK, ISLAND_SIZE_RANGE, VIEW_DISTANCE, AD_INTERACTION_DISTANCE, MAX_ADS_PER_CHUNK, AD_SPAWN_CHANCE, STARTING_CHUNK_AD_BOOST, STARTING_AREA_RADIUS, AD_RANK_TIERS } from './constants';
import { IslandGenerator } from './IslandGenerator';

export class ChunkManager {
    // Chunk management related
    private loadedChunks: Set<string> = new Set();
    private pendingChunks: string[] = [];
    private isGeneratingChunk: boolean = false;
    private lowPolyIslands: Map<string, THREE.Object3D> = new Map();
    private chunkUpdateCounter: number = 0;

    // Detail level settings
    private lowDetailDistance: number = VIEW_DISTANCE;
    private highDetailDistance: number = 1;

    constructor(
        private scene: THREE.Scene,
        private dataManager: DataManager,
        private islandGenerator: IslandGenerator
    ) {}

    /**
     * Update chunks based on player position
     */
    public updateChunks(playerPosition: THREE.Vector3): Set<string> {
        // Get current chunk coordinates
        const currentChunkX = Math.floor(playerPosition.x / CHUNK_SIZE);
        const currentChunkZ = Math.floor(playerPosition.z / CHUNK_SIZE);

        // Track needed chunks by detail level
        const highDetailChunks = new Set<string>();
        const lowDetailChunks = new Set<string>();
        const visibleIslandIds = new Set<string>();

        // Track high detail chunks (close to player)
        for (let dx = -this.highDetailDistance; dx <= this.highDetailDistance; dx++) {
            for (let dz = -this.highDetailDistance; dz <= this.highDetailDistance; dz++) {
                const chunkX = currentChunkX + dx;
                const chunkZ = currentChunkZ + dz;
                const key = `${chunkX}_${chunkZ}`;
                
                highDetailChunks.add(key);
                lowDetailChunks.add(key); // High detail chunks are also in low detail set
                
                // Queue chunk generation if not already generated
                if (!this.dataManager.generatedChunks.has(key) && !this.pendingChunks.includes(key)) {
                    this.pendingChunks.push(key);
                }
            }
        }
        
        // Add low detail chunks (further from player)
        for (let dx = -this.lowDetailDistance; dx <= this.lowDetailDistance; dx++) {
            for (let dz = -this.lowDetailDistance; dz <= this.lowDetailDistance; dz++) {
                // Skip high detail chunks which are already added
                if (Math.abs(dx) <= this.highDetailDistance && Math.abs(dz) <= this.highDetailDistance) continue;
                
                const chunkX = currentChunkX + dx;
                const chunkZ = currentChunkZ + dz;
                const key = `${chunkX}_${chunkZ}`;
                
                lowDetailChunks.add(key);
                
                // Queue with lower priority if not generated
                if (!this.dataManager.generatedChunks.has(key) && !this.pendingChunks.includes(key)) {
                    this.pendingChunks.push(key);
                }
                
                // If chunk isn't loaded yet but player is approaching it, 
                // add a low-poly placeholder immediately for better visual experience
                if (!this.loadedChunks.has(key) && !this.dataManager.generatedChunks.has(key)) {
                    this.createPlaceholdersForChunk(chunkX, chunkZ, key);
                }
            }
        }

        // Load high-detail chunks
        for (const key of highDetailChunks) {
            if (!this.loadedChunks.has(key) && this.dataManager.generatedChunks.has(key)) {
                // Add islands from this chunk with full detail
                Object.values(this.dataManager.islandData)
                      .filter(island => island.chunk === key)
                      .forEach(island => {
                          this.addIslandMesh(island);
                          visibleIslandIds.add(island.id);
                          
                          // Remove any placeholder that might exist
                          const placeholderId = `placeholder_${island.id}`;
                          if (this.lowPolyIslands.has(placeholderId)) {
                              const placeholder = this.lowPolyIslands.get(placeholderId);
                              if (placeholder) {
                                  this.scene.remove(placeholder);
                                  this.lowPolyIslands.delete(placeholderId);
                              }
                          }
                      });
                      
                this.loadedChunks.add(key);
            } else if (this.loadedChunks.has(key)) {
                // Track visible islands in already loaded chunks
                Object.values(this.dataManager.islandData)
                      .filter(island => island.chunk === key)
                      .forEach(island => {
                          visibleIslandIds.add(island.id);
                      });
            }
        }

        // Unload chunks that are too far away
        for (const key of [...this.loadedChunks]) {
            if (!lowDetailChunks.has(key)) {
                // Remove islands from this chunk
                this.unloadChunk(key);
            } else if (!highDetailChunks.has(key)) {
                // Optionally downgrade to low detail
                // This is where you could swap high-detail models for low-detail ones
            }
        }
        
        // Process one pending chunk per frame to spread out the load
        this.processNextPendingChunk(playerPosition);
        
        // Periodically clear caches to prevent memory leaks
        this.chunkUpdateCounter++;
        if (this.chunkUpdateCounter > 50) { // Every ~50 chunk updates
            this.islandGenerator.clearUnusedCaches(visibleIslandIds);
            this.chunkUpdateCounter = 0;
        }

        return visibleIslandIds;
    }

    /**
     * Create placeholders for chunks that are loading
     */
    private createPlaceholdersForChunk(chunkX: number, chunkZ: number, chunkKey: string): void {
        // Create 1-3 placeholder islands to provide immediate visual feedback
        const islandCount = Math.min(3, 1 + Math.floor(Math.random() * 2));
        
        for (let i = 0; i < islandCount; i++) {
            // Generate consistent positions using chunk key
            const posX = chunkX * CHUNK_SIZE + ((chunkX + i) % CHUNK_SIZE) * 0.7;
            const posZ = chunkZ * CHUNK_SIZE + ((chunkZ + i) % CHUNK_SIZE) * 0.7;
            
            // Choose biome based on position
            const biomeIndex = Math.abs(chunkX + chunkZ + i) % BIOMES.length;
            const biome = BIOMES[biomeIndex].name;
            
            // Create a placeholder ID that won't conflict with real islands
            const placeholderId = `placeholder_${chunkKey}_${i}`;
            
            // If already created, skip
            if (this.lowPolyIslands.has(placeholderId)) continue;
            
            // Create simple placeholder
            const size = 5 + Math.random() * 5; // Simplified size range
            const placeholder = this.createLowPolyPlaceholder({x: posX, z: posZ}, size, biome);
            
            // Add placeholder to scene
            this.scene.add(placeholder);
            
            // Store for later removal
            this.lowPolyIslands.set(placeholderId, placeholder);
        }
    }

    /**
     * Process pending chunks one by one
     */
    private processNextPendingChunk(playerPosition: THREE.Vector3): void {
        // If already generating or no pending chunks, exit
        if (this.isGeneratingChunk || this.pendingChunks.length === 0) return;
        
        // Set flag to prevent multiple simultaneous generations
        this.isGeneratingChunk = true;
        
        // Process chunks from front of queue (nearest to player)
        const chunkKey = this.pendingChunks.shift();
        if (!chunkKey) {
            this.isGeneratingChunk = false;
            return;
        }
        
        // Extract chunk coordinates
        const [chunkXStr, chunkZStr] = chunkKey.split('_');
        const chunkX = parseInt(chunkXStr);
        const chunkZ = parseInt(chunkZStr);
        
        // Calculate chunk priority based on distance to player
        const playerChunkX = Math.floor(playerPosition.x / CHUNK_SIZE);
        const playerChunkZ = Math.floor(playerPosition.z / CHUNK_SIZE);
        const distanceToPlayer = Math.abs(chunkX - playerChunkX) + Math.abs(chunkZ - playerChunkZ);
        
        // Use different timeout based on distance - process nearby chunks faster
        const delay = distanceToPlayer <= this.highDetailDistance ? 0 : 100; 
        
        // Defer the actual generation to prevent UI freezing
        setTimeout(() => {
            try {
                // Generate with optimized settings based on distance
                this.generateChunk(chunkX, chunkZ, distanceToPlayer <= this.highDetailDistance);
                
                // If this was a high priority chunk, load it immediately
                if (distanceToPlayer <= this.highDetailDistance) {
                    const key = `${chunkX}_${chunkZ}`;
                    if (!this.loadedChunks.has(key)) {
                        this.loadChunk(key);
                    }
                }
            } catch (error) {
                console.error(`Error generating chunk ${chunkKey}:`, error);
            } finally {
                this.isGeneratingChunk = false;
            }
        }, delay);
    }

    /**
     * Generate a chunk 
     */
    private generateChunk(chunkX: number, chunkZ: number, highDetail: boolean = true): void {
        const key = `${chunkX}_${chunkZ}`;
        if (this.dataManager.generatedChunks.has(key)) return;
        
        // Reduce calculations when generating low-detail chunks
        const seedFunction = highDetail ? this.getDetailedSeedRandom(key) : this.getSimpleSeedRandom(key);
        
        // Optimize for performance - calculate once and reuse
        const distanceFromOrigin = Math.sqrt(chunkX * chunkX + chunkZ * chunkZ);
        const isStartingArea = distanceFromOrigin <= STARTING_AREA_RADIUS;
        
        // Optimize island count calculation - use fewer islands in low detail mode
        const minIslands = highDetail ? ISLANDS_PER_CHUNK.min : Math.max(1, ISLANDS_PER_CHUNK.min - 1);
        const maxIslands = highDetail ? ISLANDS_PER_CHUNK.max : Math.max(2, ISLANDS_PER_CHUNK.max - 2);
        const islandCount = Math.floor(seedFunction(minIslands, maxIslands + 0.99));
        
        // Track positions of ad islands to ensure they're spread out
        const adIslandPositions: Array<{x: number, z: number}> = [];
        
        // Limit ads per chunk to reduce ad density
        let adIslandsCreated = 0;
        
        // Generate islands for the chunk
        for (let i = 0; i < islandCount; i++) {
            // Use seeded random functions for consistent island placement
            const posX = chunkX * CHUNK_SIZE + seedFunction(0, CHUNK_SIZE, `posX_${i}`);
            const posZ = chunkZ * CHUNK_SIZE + seedFunction(0, CHUNK_SIZE, `posZ_${i}`);
            
            // Simplified size calculation for faster generation
            let size = seedFunction(ISLAND_SIZE_RANGE.min, ISLAND_SIZE_RANGE.max, `size_${i}`);
            
            // More efficient biome selection
            let biomeIndex = Math.floor(seedFunction(0, BIOMES.length, `biome_${i}`));
            let biome = BIOMES[biomeIndex].name;
            
            // Streamlined ad island check
            let canBeAdIsland = adIslandsCreated < MAX_ADS_PER_CHUNK;
            
            // Simpler distance check for ad islands
            if (canBeAdIsland && adIslandPositions.length > 0) {
                for (const adPos of adIslandPositions) {
                    const distanceSquared = (posX - adPos.x)**2 + (posZ - adPos.z)**2;
                    // Using squared distance to avoid square root calculation
                    if (distanceSquared < (CHUNK_SIZE/3)**2) {
                        canBeAdIsland = false;
                        break;
                    }
                }
            }
            
            // Ad chance calculation - reduced complexity
            let adChance = AD_SPAWN_CHANCE;
            if (isStartingArea) adChance *= STARTING_CHUNK_AD_BOOST;
            
            // Consistent ad determination
            const adRandom = seedFunction(0, 1, `adRoll_${i}`);
            const hasOutdoor = canBeAdIsland && adRandom < adChance;
            
            if (hasOutdoor) {
                let adTierIndex;
                
                // Simplified ad tier selection
                if (isStartingArea) {
                    adTierIndex = Math.min(
                        AD_RANK_TIERS.length - 1, 
                        Math.floor(seedFunction(0, AD_RANK_TIERS.length, `adTier_${i}`) * 0.7 + 1)
                    );
                } else {
                    adTierIndex = Math.floor(seedFunction(0, AD_RANK_TIERS.length, `adTier_${i}`));
                }
                
                const adTier = AD_RANK_TIERS[adTierIndex];
                size *= adTier.sizeBoost;
                
                // Simplified biome selection for ads
                biome = seedFunction(0, 1, `adBiomeType_${i}`) < 0.5 ? 'Desert' : 'Volcano';
                
                // Create island data with this enhanced configuration
                const islandData: IslandData = {
                    id: `ad_island_${chunkX}_${chunkZ}_${i}_rank${adTier.rank}`,
                    pos: { x: posX, y: 0, z: posZ },
                    biome,
                    size,
                    name: null,
                    chunk: key
                };
                
                // Add outdoor data with rank information - reuse images for better caching
                const adIndex = 1 + Math.min(5, Math.floor(seedFunction(0, 6, `adImage_${i}`)));
                islandData.outdoor = {
                    image: `https://picsum.photos/seed/${adIndex}/300/200`,
                    url: `https://example.com/ad/${adIndex}_tier_${adTier.name}`,
                    active: true,
                    adRank: adTier.rank
                };
                
                adIslandPositions.push({x: posX, z: posZ});
                adIslandsCreated++;
                
                // Store the island data
                this.dataManager.islandData[islandData.id] = islandData;
            } else {
                // Create regular island data
                const islandData: IslandData = {
                    id: `island_${chunkX}_${chunkZ}_${i}`,
                    pos: { x: posX, y: 0, z: posZ },
                    biome,
                    size,
                    name: null,
                    chunk: key
                };
                
                // Store the island data
                this.dataManager.islandData[islandData.id] = islandData;
            }
        }
        
        // Mark chunk as generated
        this.dataManager.generatedChunks.add(key);
        
        // Remove any placeholders that were created for this chunk
        this.removePlaceholdersForChunk(key);
        
        // Save data to persist between sessions - but don't save too frequently
        if (Math.random() < 0.2) { // Only save ~20% of the time to improve performance
            this.dataManager.saveData();
        }
    }

    /**
     * Remove placeholders for a chunk that has been generated
     */
    private removePlaceholdersForChunk(chunkKey: string): void {
        // Find and remove all placeholders for this chunk
        for (const [id, placeholder] of this.lowPolyIslands.entries()) {
            if (id.startsWith(`placeholder_${chunkKey}`)) {
                this.scene.remove(placeholder);
                this.lowPolyIslands.delete(id);
            }
        }
    }

    /**
     * Load a chunk into the scene
     */
    private loadChunk(key: string): void {
        if (this.loadedChunks.has(key)) return;
        console.log(`Loading chunk: ${key}`);
        this.loadedChunks.add(key);
        Object.values(this.dataManager.islandData)
              .filter(island => island.chunk === key)
              .forEach(island => this.addIslandMesh(island));
    }

    /**
     * Unload a chunk from the scene
     */
    private unloadChunk(key: string): void {
        if (!this.loadedChunks.has(key)) return;
        console.log(`Unloading chunk: ${key}`);
        this.loadedChunks.delete(key);
        Object.values(this.dataManager.islandData)
              .filter(island => island.chunk === key)
              .forEach(island => this.removeIslandMesh(island));
    }

    /**
     * Add an island mesh to the scene
     */
    public addIslandMesh(islandData: IslandData): void {
        // Use the island generator to add the island mesh
        this.islandGenerator.addIslandMesh(islandData);
        
        // Create label if the island has a name
        if (islandData.name) {
            this.createIslandLabel(islandData);
        }
    }

    /**
     * Remove an island mesh from the scene
     */
    public removeIslandMesh(islandData: IslandData): void {
        // Use the island generator to remove the island mesh
        this.islandGenerator.removeIslandMesh(islandData);
        
        // Clean up label
        if (islandData.label) {
            islandData.label.remove();
            delete islandData.label;
        }
    }

    /**
     * Create a label for an island
     */
    private createIslandLabel(islandData: IslandData): void {
        // Don't create label if it already exists
        if (islandData.label) return;
        
        try {
            // Make sure we have the container
            const container = document.getElementById('islandLabels');
            if (!container) {
                console.warn("Island labels container not found");
                return;
            }
            
            // Create the label exactly as in the original code
            const div = document.createElement('div');
            div.className = 'island-label';
            div.innerText = islandData.name || '';
            
            // Force the element to have a style by setting display
            div.style.display = 'none';
            
            // Add to container
            container.appendChild(div);
            
            // Store reference to the label in island data
            islandData.label = div;
            
            console.log(`Created label for island ${islandData.id} with name ${islandData.name}`);
        } catch (error) {
            console.error("Error creating island label:", error);
        }
    }

    /**
     * Check if a player is near an ad island for interaction
     */
    public checkForAdIslandProximity(playerPosition: THREE.Vector3): boolean {
        let hasInteracted = false;
        
        // Check all islands with outdoor advertisements
        Object.values(this.dataManager.islandData)
            .filter(island => island.outdoor && island.outdoor.active)
            .forEach(island => {
                // Calculate distance to player
                const dx = island.pos.x - playerPosition.x;
                const dz = island.pos.z - playerPosition.z;
                const distance = Math.hypot(dx, dz);
                
                // If player is close enough to the ad island, trigger the URL redirection
                if (distance < AD_INTERACTION_DISTANCE) {
                    // Only redirect if not recently redirected (to prevent spam)
                    if (!island.outdoor!.lastInteractionTime || 
                        Date.now() - island.outdoor!.lastInteractionTime > 10000) { // 10 second cooldown
                        
                        console.log(`Player close to ad island ${island.id}, opening URL: ${island.outdoor!.url}`);
                        
                        // Ask user before redirecting
                        const willRedirect = confirm(`Visit advertisement: ${island.outdoor!.url}?`);
                        
                        if (willRedirect) {
                            // Open URL in a new tab
                            window.open(island.outdoor!.url, '_blank');
                            hasInteracted = true;
                        }
                        
                        // Update last interaction time
                        island.outdoor!.lastInteractionTime = Date.now();
                    }
                }
            });
            
        return hasInteracted;
    }

    /**
     * Create a low-poly placeholder island
     */
    private createLowPolyPlaceholder(position: { x: number, z: number }, size: number, biome: string): THREE.Object3D {
        // Create a very simple cone shape
        const geometry = new THREE.CylinderGeometry(0, size, size * 0.6, 6, 1);
        const material = new THREE.MeshBasicMaterial({ color: this.getBiomeColor(biome) });
        const mesh = new THREE.Mesh(geometry, material);
        
        // Position at water level
        mesh.position.set(position.x, 0, position.z);
        
        return mesh;
    }

    /**
     * Create a seeded random function with detailed calculations
     */
    private getDetailedSeedRandom(key: string): (min: number, max: number, salt?: string) => number {
        return (min: number, max: number, salt: string = "") => {
            try {
                const combinedSeed = key + salt + min.toString() + max.toString();
                const hash = this.simpleHash(combinedSeed);
                const val = (hash % 1000) / 1000;
                return min + Math.abs(val) * (max - min);
            } catch (error) {
                return min + Math.random() * (max - min);
            }
        };
    }

    /**
     * Create a simpler seeded random function for low-detail chunks
     */
    private getSimpleSeedRandom(key: string): (min: number, max: number, salt?: string) => number {
        return (min: number, max: number, salt: string = "") => {
            try {
                // Faster calculation for low-detail chunks
                const hash = this.simpleHash(key + salt);
                return min + (hash % 100) / 100 * (max - min);
            } catch (error) {
                return min + Math.random() * (max - min);
            }
        };
    }

    /**
     * Simple hash function for seeded random generation
     */
    private simpleHash(str: string): number {
        let hash = 0;
        if (str.length === 0) return hash;
        
        for (let i = 0; i < Math.min(str.length, 10); i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash = hash & hash; // Convert to 32bit integer
        }
        
        return Math.abs(hash);
    }

    /**
     * Get the color for a biome
     */
    private getBiomeColor(biomeName: string): number {
        const biome = BIOMES.find(b => b.name === biomeName);
        return biome ? biome.color : 0x00FF00; // Default to green if not found
    }

    /**
     * Get the chunk key for a position
     */
    public getChunkKey(x: number, z: number): string {
        return `${Math.floor(x / CHUNK_SIZE)}_${Math.floor(z / CHUNK_SIZE)}`;
    }
    
    /**
     * Check if a chunk is loaded
     */
    public isChunkLoaded(key: string): boolean {
        return this.loadedChunks.has(key);
    }
    
    /**
     * Clean up all resources
     */
    public dispose(): void {
        // Remove all loaded chunks
        for (const key of [...this.loadedChunks]) {
            this.unloadChunk(key);
        }
        
        // Remove all placeholders
        for (const [id, placeholder] of this.lowPolyIslands.entries()) {
            this.scene.remove(placeholder);
        }
        this.lowPolyIslands.clear();
        
        // Clear other collections
        this.loadedChunks.clear();
        this.pendingChunks = [];
    }
} 