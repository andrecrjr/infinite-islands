import * as THREE from 'three';
import { DataManager } from './dataManager';
import { Biome, IslandData, MoveState, ShipOptions } from './types';
import { BIOMES, CAMERA_LERP_FACTOR, CAMERA_OFFSET, CHUNK_SIZE, ISLANDS_PER_CHUNK, ISLAND_NAME_PROMPT_DISTANCE, ISLAND_SIZE_RANGE, PLAYER_REVERSE_SPEED, PLAYER_SPEED, PLAYER_TURN_SPEED, VIEW_DISTANCE, AD_INTERACTION_DISTANCE, MAX_ADS_PER_CHUNK, AD_SPAWN_CHANCE, STARTING_CHUNK_AD_BOOST, STARTING_AREA_RADIUS, AD_RANK_TIERS } from './constants';
import { ShipController } from './ShipController';
import { IslandGenerator } from './IslandGenerator';
import { Ship } from './Ship';

export class Game {
    private scene: THREE.Scene;
    private camera: THREE.PerspectiveCamera;
    private renderer: THREE.WebGLRenderer;
    private playerShip: THREE.Object3D | null = null;
    private playerLabel: HTMLDivElement | null = null;
    private islandLabelsContainer: HTMLDivElement | null = null;
    private coordsElement: HTMLDivElement | null = null;
    private dataManager: DataManager;
    private shipController: ShipController | null = null;
    private islandGenerator: IslandGenerator;
    private shipInstance: Ship | null = null;

    private playerName: string = '';

    // Chunk management related
    private loadedChunks: Set<string> = new Set();

    // Add property for water mesh
    private waterMesh: THREE.Mesh | null = null;

    // Add raycaster functionality to handle outdoor clicks
    private raycaster = new THREE.Raycaster();
    private mouse = new THREE.Vector2();

    private chunkUpdateCounter: number = 0;

    // Add this property in the class
    private animationFrame: number = 0;

    // Add this property to the Game class
    private pendingChunks: string[] = [];
    private isGeneratingChunk: boolean = false;

    // Add these properties to further optimize performance
    private activelyGenerating: boolean = false;
    private lowDetailDistance: number = VIEW_DISTANCE;
    private highDetailDistance: number = 1;
    private lowPolyIslands: Map<string, THREE.Object3D> = new Map();

    // Add these event handler properties at class level
    private onResize = (): void => {
        if (this.camera && this.renderer) {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        }
    }

    private onKeyDown = (e: KeyboardEvent): void => {
        if (!this.shipController) return;
        
        const keyControls: Record<string, keyof MoveState> = {
            'ArrowUp': 'f',
            'ArrowDown': 'b',
            'ArrowLeft': 'l',
            'ArrowRight': 'r',
            'w': 'f',
            's': 'b',
            'a': 'l',
            'd': 'r'
        };
        
        const key = e.key;
        if (key in keyControls) {
            this.shipController.moveState[keyControls[key]] = 1;
        }
    }

    private onKeyUp = (e: KeyboardEvent): void => {
        if (!this.shipController) return;
        
        const keyControls: Record<string, keyof MoveState> = {
            'ArrowUp': 'f',
            'ArrowDown': 'b',
            'ArrowLeft': 'l',
            'ArrowRight': 'r',
            'w': 'f',
            's': 'b',
            'a': 'l',
            'd': 'r'
        };
        
        const key = e.key;
        if (key in keyControls) {
            this.shipController.moveState[keyControls[key]] = 0;
        }
    }

    constructor(private container: HTMLElement) {
        // Initialize core components
        this.dataManager = new DataManager();
        this.scene = new THREE.Scene();
        
        // These will be properly initialized in init()
        this.camera = new THREE.PerspectiveCamera(); // Temporary initialization
        this.renderer = new THREE.WebGLRenderer(); // Temporary initialization
        
        // Initialize island generator
        this.islandGenerator = new IslandGenerator(this.scene);
        
        // Initialize the game
        this.init();
    }

    private init(): void {
        // Load saved data
        this.dataManager.loadData();
        
        // Basic Scene Setup - just like original
        this.scene.background = new THREE.Color(0x87ceeb); // Sky blue
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.container.appendChild(this.renderer.domElement);
        
        // Create the ship using the Ship class
        this.createShip();
        
        // Initialize ship controller
        this.coordsElement = document.getElementById('coords') as HTMLDivElement;
        if (this.playerShip && this.coordsElement) {
            this.shipController = new ShipController({
                ship: this.playerShip,
                speedForward: PLAYER_SPEED,
                speedReverse: PLAYER_REVERSE_SPEED,
                turnSpeed: PLAYER_TURN_SPEED,
                coordsElement: this.coordsElement
            });
        }
        
        // Lighting - same as original
        this.scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1));
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(-100, 100, -100);
        this.scene.add(directionalLight);
        
        // Create "infinite" water that follows the player
        this.createWater();
        
        // UI Elements - matching original
        this.islandLabelsContainer = document.getElementById('islandLabels') as HTMLDivElement;
        
        // Player label - just like original
        this.playerLabel = document.createElement('div');
        this.playerLabel.className = 'ship-label';
        document.body.appendChild(this.playerLabel);
        this.playerLabel.style.display = 'none';
        
        // Event Listeners - for UI elements only now
        this.setupEventListeners();
        
        // Setup raycaster for outdoor billboards interaction
        this.setupRaycaster();
        
        // Initial Chunk Load
        this.updateChunks();
        
        // Start Animation Loop
        this.animate();
    }

    private createPlayerLabel(): HTMLDivElement {
        const label = document.createElement('div');
        label.className = 'ship-label hidden'; // Initially hidden
        document.body.appendChild(label);
        return label;
    }

    private setupEventListeners(): void {
        // Only handle UI-related event listeners here now
        // Name input handling
        const startBtn = document.getElementById('startBtn');
        if (startBtn) {
            startBtn.onclick = () => {
                const nameInput = document.getElementById('nameInput') as HTMLInputElement;
                if (!nameInput) return;
                
                const name = nameInput.value.trim();
                if (!name) return;
                
                this.playerName = name;
                
                // Hide menu, show player label
                const menu = document.getElementById('menu');
                if (menu) menu.style.display = 'none';
                
                if (this.playerLabel) {
                    this.playerLabel.style.display = '';
                }
            };
        }
        
        // Add keyboard controls
        window.addEventListener('keydown', this.onKeyDown);
        window.addEventListener('keyup', this.onKeyUp);
        
        // Handle window resize
        window.addEventListener('resize', this.onResize);
    }

    private updateCamera(): void {
        if (!this.playerShip) return;
        const offset = new THREE.Vector3(CAMERA_OFFSET.x, CAMERA_OFFSET.y, CAMERA_OFFSET.z);
        const targetPosition = this.playerShip.localToWorld(offset);
        this.camera.position.lerp(targetPosition, CAMERA_LERP_FACTOR);
        this.camera.lookAt(this.playerShip.position);
    }

    private getChunkKey(x: number, z: number): string {
        return `${Math.floor(x / CHUNK_SIZE)}_${Math.floor(z / CHUNK_SIZE)}`;
    }

    private updateChunks(): void {
        if (!this.playerShip) return;

        // Get current chunk coordinates
        const currentChunkX = Math.floor(this.playerShip.position.x / CHUNK_SIZE);
        const currentChunkZ = Math.floor(this.playerShip.position.z / CHUNK_SIZE);

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
        this.processNextPendingChunk();
        
        // Periodically clear caches to prevent memory leaks
        this.chunkUpdateCounter++;
        if (this.chunkUpdateCounter > 50) { // Every ~50 chunk updates
            this.islandGenerator.clearUnusedCaches(visibleIslandIds);
            this.chunkUpdateCounter = 0;
        }
    }

    // Add a method to create temporary placeholders until real chunks are generated
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

    // Optimize the chunk processing for better concurrent generation
    private processNextPendingChunk(): void {
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
        const playerChunkX = Math.floor(this.playerShip!.position.x / CHUNK_SIZE);
        const playerChunkZ = Math.floor(this.playerShip!.position.z / CHUNK_SIZE);
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

    // Modify the generateChunk method to accept a detail level parameter
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

    // Simple method to remove placeholders when real chunk is generated
    private removePlaceholdersForChunk(chunkKey: string): void {
        // Find and remove all placeholders for this chunk
        for (const [id, placeholder] of this.lowPolyIslands.entries()) {
            if (id.startsWith(`placeholder_${chunkKey}`)) {
                this.scene.remove(placeholder);
                this.lowPolyIslands.delete(id);
            }
        }
    }

    // Add optimized seeded random functions
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

    // Simple fast hashing function
    private simpleHash(str: string): number {
        let hash = 0;
        if (str.length === 0) return hash;
        
        for (let i = 0; i < Math.min(str.length, 10); i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash = hash & hash; // Convert to 32bit integer
        }
        
        return Math.abs(hash);
    }

    private loadChunk(key: string): void {
        if (this.loadedChunks.has(key)) return;
        console.log(`Loading chunk: ${key}`);
        this.loadedChunks.add(key);
        Object.values(this.dataManager.islandData)
              .filter(island => island.chunk === key)
              .forEach(island => this.addIslandMesh(island));
    }

    private unloadChunk(key: string): void {
        if (!this.loadedChunks.has(key)) return;
         console.log(`Unloading chunk: ${key}`);
        this.loadedChunks.delete(key);
        Object.values(this.dataManager.islandData)
              .filter(island => island.chunk === key)
              .forEach(island => this.removeIslandMesh(island));
    }

    private addIslandMesh(islandData: IslandData): void {
        // Use the island generator to add the island mesh
        this.islandGenerator.addIslandMesh(islandData);
        
        // Create label if the island has a name
        if (islandData.name) {
            this.createIslandLabel(islandData);
        }
    }

    private removeIslandMesh(islandData: IslandData): void {
        // Use the island generator to remove the island mesh
        this.islandGenerator.removeIslandMesh(islandData);
        
        // Clean up label
        if (islandData.label) {
            islandData.label.remove();
            delete islandData.label;
        }
    }

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

    private updateLabels(): void {
        if (!this.playerShip || !this.camera) return;
        
        // Get camera direction similar to original code
        const cameraDirection = new THREE.Vector3();
        this.camera.getWorldDirection(cameraDirection);
        
        // Update island labels - similar to original code
        Object.values(this.dataManager.islandData).forEach(island => {
            // Only process islands that have a name, mesh, and label WITH style property
            if (island.name && island.mesh && island.label && island.label.style) {
                try {
                    // Project island position - like original code
                    const projectedPosition = island.mesh.position.clone().project(this.camera);
                    
                    // Calculate vector to island from camera
                    const toIsland = island.mesh.position.clone().sub(this.camera.position).normalize();
                    
                    // Check visibility - exactly like original
                    const isVisible = cameraDirection.dot(toIsland) > 0 && 
                                     projectedPosition.x >= -1 && projectedPosition.x <= 1 && 
                                     projectedPosition.y >= -1 && projectedPosition.y <= 1;
                    
                    // Update label - with extra safety check
                    if (island.label && island.label.style) {
                        island.label.style.display = isVisible ? '' : 'none';
                        
                        if (isVisible) {
                            // Position label - same formula as original
                            island.label.style.left = `${(projectedPosition.x + 1) / 2 * window.innerWidth}px`;
                            island.label.style.top = `${(-projectedPosition.y + 1) / 2 * window.innerHeight}px`;
                        }
                    }
                } catch (error) {
                    // Gracefully handle any errors
                    console.warn(`Error updating label for island ${island.id}:`, error);
                    // Safe access to style
                    if (island.label && island.label.style) {
                        island.label.style.display = 'none';
                    }
                }
            } else if (island.label && island.label.style) {
                // If criteria not met but label exists, hide it
                island.label.style.display = 'none';
            }
        });
        
        // Update player label - simplified from original
        if (this.playerName && this.playerLabel && this.playerLabel.style && this.playerShip) {
            try {
                // Project player position - like original
                const projectedPosition = this.playerShip.position.clone().project(this.camera);
                
                // Update label
                this.playerLabel.innerText = this.playerName;
                this.playerLabel.style.left = `${(projectedPosition.x + 1) / 2 * window.innerWidth}px`;
                this.playerLabel.style.top = `${(-projectedPosition.y + 1) / 2 * window.innerHeight}px`;
            } catch (error) {
                console.warn("Error updating player label:", error);
            }
        }
    }

    private checkForIslandNaming(): void {
        if (!this.playerShip) return;

        // Check unnamed islands like original code
        Object.values(this.dataManager.islandData).forEach(island => {
            // Skip islands that already have names
            if (island.name) return;
            
            try {
                // Calculate distance using vector difference like original code
                const dx = island.pos.x - this.playerShip!.position.x;
                const dz = island.pos.z - this.playerShip!.position.z;
                const distance = Math.hypot(dx, dz);
                
                // If close enough, prompt for name
                if (distance < ISLAND_NAME_PROMPT_DISTANCE) {
                    // Prompt for name just like original code
                    const newName = prompt(`Nome para ilha (${island.biome}):`);
                    if (newName) {
                        // Update island
                        island.name = newName;
                        this.dataManager.saveData();
                        
                        // Recreate the island mesh and label - exactly like original
                        this.removeIslandMesh(island);
                        this.addIslandMesh(island);
                    }
                }
            } catch (error) {
                console.warn(`Error checking island ${island.id} for naming: ${error}`);
            }
        });
    }

    // Method to create water mesh
    private createWater(): void {
        // Create a large water plane 
        const waterGeometry = new THREE.PlaneGeometry(2000, 2000, 8, 8);
        
        // Use StandardMaterial with slight roughness for better water appearance
        const waterMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x1e90ff,
            roughness: 0.3,
            metalness: 0.1
        });
        
        this.waterMesh = new THREE.Mesh(waterGeometry, waterMaterial);
        this.waterMesh.rotation.x = -Math.PI / 2; // Rotate to be horizontal
        this.waterMesh.position.y = 0; // At water level
        this.scene.add(this.waterMesh);
    }

    // Method to update water position to follow the player
    private updateWater(): void {
        if (!this.waterMesh || !this.playerShip) return;

        // Make water follow player on x and z axes
        this.waterMesh.position.x = this.playerShip.position.x;
        this.waterMesh.position.z = this.playerShip.position.z;
    }

    // Animation Loop - closely matches original
    private animate = (): void => {
        // Store the animation frame ID for cleanup
        this.animationFrame = requestAnimationFrame(this.animate);
        
        // Update ship position
        if (this.shipController) {
            this.shipController.handleGamepadInput();
            this.shipController.updatePosition();
        }
        
        // Update camera position
        this.updateCamera();
        
        // Update island loading based on player position
        this.updateChunks();
        
        // Update water position to follow player
        this.updateWater();
        
        // Update island labels
        this.updateLabels();
        
        // Update ad billboards orientation
        this.updateBillboards();
        
        // Check for ad island proximity
        this.checkForAdIslandProximity();
        
        // Check if player is near an island for naming
        this.checkForIslandNaming();
        
        // Render the scene
        this.renderer.render(this.scene, this.camera);
    }

    // Make billboards always face the camera
    private updateBillboards(): void {
        this.scene.traverse((object) => {
            if (object.userData.isOutdoor) {
                // Make billboard always face the camera
                object.quaternion.copy(this.camera.quaternion);
            }
        });
    }

    // Add raycaster functionality to handle outdoor clicks
    private setupRaycaster(): void {
        // Add click event listener to the renderer DOM element
        this.renderer.domElement.addEventListener('click', (event) => {
            // Calculate mouse position in normalized device coordinates
            this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
            this.mouse.y = - (event.clientY / window.innerHeight) * 2 + 1;
            
            // Update the raycaster
            this.raycaster.setFromCamera(this.mouse, this.camera);
            
            // Find intersections with all objects in the scene
            const intersects = this.raycaster.intersectObjects(this.scene.children, true);
            
            // Check if we clicked on an outdoor billboard
            for (const intersect of intersects) {
                if (intersect.object.userData.isOutdoor && intersect.object.userData.adUrl) {
                    // Open the URL associated with the outdoor
                    window.open(intersect.object.userData.adUrl, '_blank');
                    break;
                }
            }
        });
        
        // Add mousemove event to change cursor when hovering over billboards
        this.renderer.domElement.addEventListener('mousemove', (event) => {
            // Calculate mouse position in normalized device coordinates
            this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
            this.mouse.y = - (event.clientY / window.innerHeight) * 2 + 1;
            
            // Update the raycaster
            this.raycaster.setFromCamera(this.mouse, this.camera);
            
            // Find intersections with all objects in the scene
            const intersects = this.raycaster.intersectObjects(this.scene.children, true);
            
            // Check if we're hovering over an outdoor billboard
            let hoveredOutdoor = false;
            
            for (const intersect of intersects) {
                if (intersect.object.userData.isOutdoor) {
                    hoveredOutdoor = true;
                    this.renderer.domElement.classList.add('interactive-cursor');
                    break;
                }
            }
            
            // Remove the pointer cursor if not hovering over an outdoor
            if (!hoveredOutdoor) {
                this.renderer.domElement.classList.remove('interactive-cursor');
            }
        });
    }

    // Public method to start the game (might be called from index.ts)
    public start(): void {
        console.log("Game started");
        // The constructor already calls init and animate
    }

    // Clean up the dispose method to properly handle the Ship instance
    public dispose(): void {
        // Remove event listeners
        window.removeEventListener('resize', this.onResize);
        window.removeEventListener('keydown', this.onKeyDown);
        window.removeEventListener('keyup', this.onKeyUp);
        
        // Save data before disposing
        this.dataManager.saveData();
        
        // Clean up all island meshes
        Object.values(this.dataManager.islandData).forEach(island => {
            if (island.mesh) {
                this.islandGenerator.removeIslandMesh(island);
            }
            
            // Also remove any labels
            if (island.label && island.label.parentNode) {
                island.label.parentNode.removeChild(island.label);
                delete island.label;
            }
        });
        
        // Clear cached geometries and textures
        this.islandGenerator.dispose();
        
        // Dispose ShipController if it exists
        if (this.shipController) {
            this.shipController.dispose();
        }
        
        // Clean up the water mesh
        if (this.waterMesh) {
            this.scene.remove(this.waterMesh);
            if (this.waterMesh.geometry) this.waterMesh.geometry.dispose();
            if (this.waterMesh.material instanceof THREE.Material) {
                this.waterMesh.material.dispose();
            } else if (Array.isArray(this.waterMesh.material)) {
                this.waterMesh.material.forEach(m => m.dispose());
            }
        }
        
        // Remove ship from scene but don't try to dispose it since it has no dispose method
        if (this.playerShip) {
            this.scene.remove(this.playerShip);
        }
        
        // Clean up player label
        if (this.playerLabel && this.playerLabel.parentNode) {
            this.playerLabel.parentNode.removeChild(this.playerLabel);
        }
        
        // Clean up island labels container
        if (this.islandLabelsContainer) {
            while (this.islandLabelsContainer.firstChild) {
                this.islandLabelsContainer.removeChild(this.islandLabelsContainer.firstChild);
            }
        }
        
        // Stop animation loop
        cancelAnimationFrame(this.animationFrame);
        
        // Clean up renderer
        this.renderer.dispose();
        
        // Remove canvas from container
        if (this.renderer.domElement.parentNode) {
            this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
        }
    }

    private createShip(options: ShipOptions = {}): void {
        // Create a new ship instance
        this.shipInstance = new Ship(options);
        
        // Get the 3D object and assign it to playerShip
        this.playerShip = this.shipInstance.getObject();
        
        // Set initial position
        this.playerShip.position.y = 0.25;
        
        // Add to scene
        this.scene.add(this.playerShip);
    }

    // New method to customize the ship
    public customizeShip(options: ShipOptions): void {
        if (!this.shipInstance) return;
        
        // Remove the current ship from the scene
        if (this.playerShip) {
            this.scene.remove(this.playerShip);
        }
        
        // Create a new ship with the provided options
        this.createShip(options);
        
        // Recreate the ship controller
        if (this.playerShip && this.coordsElement) {
            // Dispose of the old controller first
            if (this.shipController) {
                this.shipController.dispose();
            }
            
            this.shipController = new ShipController({
                ship: this.playerShip,
                speedForward: PLAYER_SPEED,
                speedReverse: PLAYER_REVERSE_SPEED,
                turnSpeed: PLAYER_TURN_SPEED,
                coordsElement: this.coordsElement
            });
        }
    }

    // Method to directly access ship instance for customization
    public getShipInstance(): Ship | null {
        return this.shipInstance;
    }

    private createOutdoorBillboard(islandData: IslandData): void {
        if (!islandData.outdoor || !islandData.mesh) return;
        
        try {
            console.log(`Creating outdoor billboard for island ${islandData.id}`);
            
            // Create billboard geometry
            const billboardWidth = islandData.size * 1.5;
            const billboardHeight = islandData.size * 1.0;
            const billboardGeometry = new THREE.PlaneGeometry(billboardWidth, billboardHeight);
            
            // Create a temporary material while the texture loads
            const tempMaterial = new THREE.MeshBasicMaterial({ 
                color: 0xffff00, 
                transparent: true, 
                opacity: 0.8,
                side: THREE.DoubleSide 
            });
            
            // Calculate position above the island
            const billboardPosition = new THREE.Vector3();
            billboardPosition.copy(islandData.mesh.position);
            billboardPosition.y += islandData.size * 2.5; // Position above the island
            
            // Create mesh with temporary material
            const billboard = new THREE.Mesh(billboardGeometry, tempMaterial);
            billboard.position.copy(billboardPosition);
            billboard.userData.isOutdoor = true;
            billboard.userData.adUrl = islandData.outdoor.url;
            billboard.userData.islandId = islandData.id;
            
            // Add to scene
            this.scene.add(billboard);
            
            // Store reference in island data
            islandData.outdoor.billboard = billboard;
            
            // Load the texture
            const textureLoader = new THREE.TextureLoader();
            textureLoader.load(
                islandData.outdoor.image,
                (texture) => {
                    console.log(`Texture loaded for billboard ${islandData.id}`);
                    // Create material with loaded texture
                    const billboardMaterial = new THREE.MeshBasicMaterial({
                        map: texture,
                        transparent: true,
                        side: THREE.DoubleSide
                    });
                    
                    // Replace the material
                    if (billboard.material instanceof THREE.Material) {
                        billboard.material.dispose();
                    }
                    billboard.material = billboardMaterial;
                },
                undefined,
                (error) => {
                    console.error(`Error loading texture for billboard ${islandData.id}:`, error);
                }
            );
            
        } catch (error) {
            console.error(`Error creating outdoor billboard for island ${islandData.id}:`, error);
        }
    }

    // Check if the player is near ad islands and handle URL redirection
    private checkForAdIslandProximity(): void {
        if (!this.playerShip) return;
        
        // Check all islands with outdoor advertisements
        Object.values(this.dataManager.islandData)
            .filter(island => island.outdoor && island.outdoor.active)
            .forEach(island => {
                // Calculate distance to player
                const dx = island.pos.x - this.playerShip!.position.x;
                const dz = island.pos.z - this.playerShip!.position.z;
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
                        }
                        
                        // Update last interaction time
                        island.outdoor!.lastInteractionTime = Date.now();
                    }
                }
            });
    }

    // Add a method to create a simple low-poly placeholder island
    private createLowPolyPlaceholder(position: { x: number, z: number }, size: number, biome: string): THREE.Object3D {
        // Create a very simple cone shape
        const geometry = new THREE.CylinderGeometry(0, size, size * 0.6, 6, 1);
        const material = new THREE.MeshBasicMaterial({ color: this.getBiomeColor(biome) });
        const mesh = new THREE.Mesh(geometry, material);
        
        // Position at water level
        mesh.position.set(position.x, 0, position.z);
        
        return mesh;
    }

    // Helper to get a biome color
    private getBiomeColor(biomeName: string): number {
        const biome = BIOMES.find(b => b.name === biomeName);
        return biome ? biome.color : 0x00FF00; // Default to green if not found
    }
}