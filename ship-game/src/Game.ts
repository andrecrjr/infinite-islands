import * as THREE from 'three';
import { DataManager } from './dataManager';
import { Biome, IslandData, MoveState, ShipOptions } from './types';
import { BIOMES, CAMERA_LERP_FACTOR, CAMERA_OFFSET, CHUNK_SIZE, ISLANDS_PER_CHUNK, ISLAND_NAME_PROMPT_DISTANCE, ISLAND_SIZE_RANGE, PLAYER_REVERSE_SPEED, PLAYER_SPEED, PLAYER_TURN_SPEED, VIEW_DISTANCE, AD_INTERACTION_DISTANCE, MAX_ADS_PER_CHUNK, AD_SPAWN_CHANCE, STARTING_CHUNK_AD_BOOST, STARTING_AREA_RADIUS, AD_RANK_TIERS } from './constants';
import { ShipController } from './ShipController';
import { IslandGenerator } from './IslandGenerator';
import { Ship } from './Ship';
import { ChunkManager } from './ChunkManager';

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
    private chunkManager: ChunkManager;

    private playerName: string = '';

    // Add property for water mesh
    private waterMesh: THREE.Mesh | null = null;

    // Add raycaster functionality to handle outdoor clicks
    private raycaster = new THREE.Raycaster();
    private mouse = new THREE.Vector2();

    // Add this property in the class
    private animationFrame: number = 0;

    // These event handler properties at class level
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

        // Initialize chunk manager
        this.chunkManager = new ChunkManager(this.scene, this.dataManager, this.islandGenerator);
        
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
        return this.chunkManager.getChunkKey(x, z);
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
                        
                        // Update the island in the chunk manager 
                        if (island.mesh) {
                            this.chunkManager.removeIslandMesh(island);
                        }
                        this.chunkManager.addIslandMesh(island);
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
        if (this.playerShip) {
            this.chunkManager.updateChunks(this.playerShip.position);
        }
        
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
        
        // Use the chunk manager to clean up chunks
        this.chunkManager.dispose();
        
        // Clean up cached geometries and textures
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
        
        // Delegate to chunk manager
        this.chunkManager.checkForAdIslandProximity(this.playerShip.position);
    }
}