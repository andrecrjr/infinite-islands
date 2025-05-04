import * as THREE from 'three';
import { Biome, IslandData } from './types';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BIOMES } from './constants';

export class IslandGenerator {
    private scene: THREE.Scene;
    private outdoorTextureLoader: THREE.TextureLoader;
    private geometryCache: Map<string, THREE.BufferGeometry> = new Map();
    
    // Add instanced mesh support
    private instancedIslands = new Map<string, THREE.InstancedMesh>();
    private instanceMatrix = new THREE.Matrix4();
    private instanceColors = new Map<string, Float32Array>();
    private maxInstances = 30; // Maximum instances per type
    
    constructor(scene: THREE.Scene) {
        this.scene = scene;
        this.outdoorTextureLoader = new THREE.TextureLoader();
    }

    public addIslandMesh(islandData: IslandData): void {
        // Find biome
        const biome = this.getBiomeById(islandData.biome);
        if (!biome) {
            console.warn(`Biome not found for island: ${islandData.id}`);
            return;
        }

        try {
            // Create a group to hold all island components (terrain, ads, decorations)
            const islandGroup = new THREE.Group();
            islandGroup.userData.id = islandData.id;
            islandGroup.position.set(islandData.pos.x, 0, islandData.pos.z);
            
            // Create procedural island mesh
            const terrainMesh = this.createProceduralIslandMesh(islandData, biome);
            
            // Validate mesh geometry to avoid NaN errors
            if (!this.validateMeshGeometry(terrainMesh)) {
                console.error(`Invalid mesh geometry for island: ${islandData.id}, using fallback`);
                // Create a simple fallback mesh
                const fallbackGeometry = new THREE.CylinderGeometry(0, islandData.size, islandData.size * 0.8, 8);
                terrainMesh.geometry = fallbackGeometry;
                terrainMesh.geometry.computeVertexNormals();
                terrainMesh.geometry.computeBoundingSphere();
            }
            
            // Add terrain mesh to the group (position at origin since the group is positioned)
            terrainMesh.position.set(0, 0, 0);
            islandGroup.add(terrainMesh);
            
            // If this is an ad island, add the outdoor advertisement components to the group
            if (islandData.outdoor && islandData.outdoor.active) {
                this.addOutdoorToIsland(islandData, islandGroup);
            }
            
            // Add the complete island group to the scene
            this.scene.add(islandGroup);
            
            // Store reference to the island group
            islandData.mesh = islandGroup;
        } catch (error) {
            console.error(`Failed to create island mesh for ${islandData.id}:`, error);
        }
    }

    public removeIslandMesh(islandData: IslandData): void {
        // Clean up mesh
        if (islandData.mesh) {
            try {
                // Remove the entire group from the scene
                this.scene.remove(islandData.mesh);
                
                // Recursively dispose of all child meshes and their materials
                islandData.mesh.traverse((child) => {
                    if (child instanceof THREE.Mesh) {
                        if (child.geometry) {
                            child.geometry.dispose();
                        }
                        
                        if (child.material instanceof THREE.Material) {
                            child.material.dispose();
                        } else if (Array.isArray(child.material)) {
                            child.material.forEach((m: THREE.Material) => m.dispose());
                        }
                    }
                });
                
                delete islandData.mesh;
            } catch (error) {
                console.error(`Failed to remove island mesh for ${islandData.id}:`, error);
            }
        }
    }

    private addOutdoorToIsland(islandData: IslandData, islandGroup: THREE.Group): void {
        if (!islandData.outdoor) return;
        
        try {
            const adRank = islandData.outdoor.adRank || 1; // Default to lowest rank if not specified
            
            // Find the terrain mesh to enhance it
            let terrainMesh: THREE.Mesh | null = null;
            islandGroup.traverse((child) => {
                if (child instanceof THREE.Mesh && !child.userData.isOutdoor) {
                    terrainMesh = child;
                }
            });
            
            // Make ad islands visibly distinct based on their rank
            if (terrainMesh) {
                this.enhanceAdIslandMesh(terrainMesh, adRank);
            }
            
            // Create billboard geometry - scale based on island size and ad rank
            // Higher ranked ads get slightly larger billboards
            const rankSizeMultiplier = 1 + (adRank / 20); // 1.05 for rank 1, 1.5 for rank 10
            const billboardWidth = islandData.size * 1.2 * rankSizeMultiplier;
            const billboardHeight = islandData.size * 0.8 * rankSizeMultiplier;
            
            // Use shared geometry for all billboards of similar size for better performance
            const billboardGeometry = this.getBillboardGeometry(billboardWidth, billboardHeight);
            
            // Create initial material with bright color for visibility before texture loads
            // Higher ranked ads get more opaque and brighter colors
            const tempMaterial = new THREE.MeshBasicMaterial({
                color: this.getAdColorByRank(adRank),
                transparent: true,
                opacity: Math.min(0.7 + (adRank / 30), 0.95), // Between 0.73 and 0.95
                side: THREE.DoubleSide
            });
            
            // Create the billboard mesh
            const billboard = new THREE.Mesh(billboardGeometry, tempMaterial);
            
            // Position above the island at an appropriate height - higher rank ads positioned slightly higher
            // Island sizes are typically 5-10 units, so this puts billboards ~7-15 units above water
            const heightMultiplier = 1.3 + (adRank / 50); // Between 1.32 and 1.5
            billboard.position.set(0, islandData.size * heightMultiplier, 0);
            
            // Record important data in userData for interaction
            billboard.userData.isOutdoor = true;
            billboard.userData.adUrl = islandData.outdoor.url;
            billboard.userData.islandId = islandData.id;
            billboard.userData.adRank = adRank;
            
            // Add the billboard to the island group
            islandGroup.add(billboard);
            
            // Store reference to billboard for easier access
            islandData.outdoor.billboard = billboard;
            
            // Load the actual texture - use texture caching if same image is used multiple times
            this.loadTextureForBillboard(islandData, billboard, adRank);
            
            // Add a marker/pedestal on the island to make it more visible
            // Skip for low-ranked ads to improve performance
            if (adRank >= 3) {
                this.addAdMarkerToPedestal(islandData, adRank, islandGroup);
            }
            
            // Only add high-tier decorations if rank is high enough (improved performance)
            if (adRank >= 7) {
                this.addHighTierDecorations(islandData, adRank, islandGroup);
            }
            
        } catch (error) {
            console.error("Error creating outdoor ad for island:", error);
        }
    }

    private getAdColorByRank(rank: number): number {
        // Higher ranks get more premium colors
        switch(true) {
            case rank >= 9: return 0xFFD700; // Gold for top tier
            case rank >= 7: return 0xC0C0C0; // Silver 
            case rank >= 5: return 0xE5C100; // Bronze-gold
            case rank >= 3: return 0xFFFF00; // Yellow
            default: return 0xFFA500;        // Orange for basic tier
        }
    }

    private enhanceAdIslandMesh(mesh: THREE.Mesh, adRank: number): void {
        if (mesh.material instanceof THREE.Material) {
            // Create a new material with enhanced properties based on ad rank
            const adIslandMaterial = new THREE.MeshStandardMaterial();
            
            // If the original material is a MeshStandardMaterial, copy its properties
            if (mesh.material instanceof THREE.MeshStandardMaterial) {
                adIslandMaterial.copy(mesh.material);
            } else {
                // Otherwise, just use the color if available
                if ('color' in mesh.material && mesh.material.color instanceof THREE.Color) {
                    adIslandMaterial.color.copy(mesh.material.color);
                } else {
                    adIslandMaterial.color.set(0x90EE90); // Light green default
                }
            }
            
            // Enhance the appearance with emissive effects - better for higher ranks
            // Optimize material settings for performance
            adIslandMaterial.emissive.set(this.getAdColorByRank(adRank));
            adIslandMaterial.emissiveIntensity = 0.2 + (adRank / 50); // Between 0.22 and 0.4
            adIslandMaterial.metalness = 0.5 + (adRank / 20); // Between 0.55 and 1.0
            adIslandMaterial.roughness = 0.5 - (adRank / 25); // Between 0.46 and 0.1
            
            // Optimize rendering
            adIslandMaterial.flatShading = true;
            
            // Replace the original material
            mesh.material.dispose();
            mesh.material = adIslandMaterial;
        }
    }

    private addAdMarkerToPedestal(islandData: IslandData, adRank: number, islandGroup: THREE.Group): void {
        // Create a pedestal/platform on the island - size varies by rank
        const pedestalHeight = islandData.size * (0.4 + (adRank / 50)); // Higher rank, taller pedestal
        
        // Scale number of segments with ad rank but cap for performance
        const segments = Math.min(12, 8 + Math.floor(adRank/3)); // Cap at 12 segments (was 8-13)
        
        const pedestalGeometry = new THREE.CylinderGeometry(
            islandData.size * 0.25 * (1 + adRank/40), // Top radius - bigger for higher ranks
            islandData.size * 0.4, // Bottom radius
            pedestalHeight, // Height
            segments // More segments for higher ranks
        );
        
        // Create a material for the pedestal based on rank
        const pedestalMaterial = new THREE.MeshStandardMaterial({
            color: this.getAdColorByRank(adRank),
            metalness: 0.7 + (adRank / 40), // Higher ranks more metallic
            roughness: 0.3 - (adRank / 50), // Higher ranks more shiny
            emissive: this.getAdColorByRank(adRank),
            emissiveIntensity: 0.2 + (adRank / 30), // Higher ranks more glowy
            flatShading: true // Optimize for performance
        });
        
        // Create the pedestal mesh
        const pedestal = new THREE.Mesh(pedestalGeometry, pedestalMaterial);
        
        // Position it on top of the island, slightly raised to always be visible
        pedestal.position.set(0, islandData.size * 0.3, 0);
        
        // Add the pedestal to the island group
        islandGroup.add(pedestal);
    }

    private addHighTierDecorations(islandData: IslandData, adRank: number, islandGroup: THREE.Group): void {
        // Add decorative pillars for high-tier ads - limit count for performance
        const pillarCount = Math.min(4, Math.floor(adRank / 2)); // Cap at 4 pillars (was 3-5)
        
        // Reuse the same geometry for all pillars
        const pillarGeometry = new THREE.CylinderGeometry(
            islandData.size * 0.05, // Top radius
            islandData.size * 0.08, // Bottom radius
            islandData.size * 0.8,  // Height
            6,                      // Segments
            1                       // Height segments
        );
        
        // Create a shared material for the pillars
        const pillarMaterial = new THREE.MeshStandardMaterial({
            color: this.getAdColorByRank(adRank),
            metalness: 0.9,
            roughness: 0.1,
            emissive: this.getAdColorByRank(adRank),
            emissiveIntensity: 0.3,
            flatShading: true // Optimize for performance
        });
        
        for (let i = 0; i < pillarCount; i++) {
            // Create the pillar mesh
            const pillar = new THREE.Mesh(pillarGeometry, pillarMaterial);
            
            // Position it in a circle around the island
            const angle = (i / pillarCount) * Math.PI * 2;
            const radius = islandData.size * 0.7;
            pillar.position.set(
                Math.cos(angle) * radius,
                islandData.size * 0.4,
                Math.sin(angle) * radius
            );
            
            // Add the pillar to the island group
            islandGroup.add(pillar);
        }
    }

    private getBiomeById(biomeName: string): Biome | undefined {
        return BIOMES.find(b => b.name === biomeName);
    }

    private createProceduralIslandMesh(islandData: IslandData, biome: Biome): THREE.Mesh {
        // Use deterministic seed based on island id for consistent generation
        const seed = islandData.id || Math.random().toString(); // Fallback to avoid empty seed
        const random = (min: number, max: number) => {
            // Safety checks on input parameters
            if (isNaN(min) || isNaN(max)) {
                return (min + max) / 2; // Return middle value as fallback
            }
            
            try {
                // Simpler seeded random function for better performance
                const hashInput = seed + min.toString() + max.toString();
                const hash = this.hashCode(hashInput);
                const val = (hash % 1000) / 1000;
                return min + Math.abs(val) * (max - min);
            } catch (error) {
                return (min + max) / 2; // Fallback to middle value
            }
        };
        
        // Determine island shape based on biome
        let shapeType = 0;
        
        // Assign different default shapes based on biome - simplified for performance
        switch(biome.name) {
            case 'Forest':
            case 'Jungle':
                shapeType = 1; // Smooth hills for forest/jungle
                break;
            case 'Desert':
                shapeType = 2; // Mesa for desert
                break;
            case 'Volcano':
                shapeType = 3; // Volcano shape
                break;
            case 'Snow':
                shapeType = 0; // Jagged for snow
                break;
            case 'Swamp':
                shapeType = 4; // Unified archipelago-like shape for swamp
                break;
            default:
                shapeType = 1; // Default to smooth hill
        }
        
        // Create a cache key based on shape type and size to enable reuse
        const sizeGroup = Math.round(islandData.size); // Group similar sizes
        const cacheKey = `${biome.name}_${shapeType}_${sizeGroup}`;
        
        // Get or create geometry from cache
        let geometry: THREE.BufferGeometry;
        if (this.geometryCache.has(cacheKey)) {
            geometry = this.geometryCache.get(cacheKey)!.clone();
        } else {
            // Create new geometry with reduced complexity
            switch (shapeType) {
                case 0: // Jagged mountain - simplified
                    geometry = this.createJaggedMountain(sizeGroup, random);
                    break;
                case 1: // Smooth hill - simplified
                    geometry = this.createSmoothHill(sizeGroup, random);
                    break;
                case 2: // Mesa/plateau - simplified
                    geometry = this.createMesa(sizeGroup, random);
                    break;
                case 3: // Volcano - simplified
                    geometry = this.createVolcano(sizeGroup, random);
                    break;
                case 4: // Unified archipelago-like shape
                    geometry = this.createArchipelago(sizeGroup, random);
                    break;
                default:
                    // Fallback to simple cone
                    geometry = new THREE.CylinderGeometry(0, sizeGroup, sizeGroup * 0.8, 6);
            }
            
            // Cache geometry for reuse
            this.geometryCache.set(cacheKey, geometry.clone());
        }
        
        // Create optimized material with minimal properties
        let material = new THREE.MeshStandardMaterial({
            color: biome.color,
            flatShading: true,
            roughness: 0.8,
            metalness: 0.1
        });
        
        // Create and return mesh
        return new THREE.Mesh(geometry, material);
    }

    private createJaggedMountain(size: number, random: (min: number, max: number) => number): THREE.BufferGeometry {
        // Simplify geometry creation for better performance
        const baseRadius = size;
        const height = size * random(0.8, 1.0);
        
        // Use fewer segments for better performance
        const segments = Math.min(8, Math.max(6, Math.floor(size)));
        const heightSegments = Math.min(3, Math.max(2, Math.floor(size/4)));
        
        // Create base cone geometry with minimal segments
        const geometry = new THREE.CylinderGeometry(0, baseRadius, height, segments, heightSegments, false);
        const positionAttribute = geometry.getAttribute('position');
        const vertex = new THREE.Vector3();
        
        // Apply noise to only a subset of vertices for better performance
        for (let i = 0; i < positionAttribute.count; i += 2) { // Process only every other vertex
            vertex.fromBufferAttribute(positionAttribute, i);
            
            // Skip top point
            if (Math.abs(vertex.y - height/2) < 0.001) continue;
            
            // Add simple noise for natural look
            const heightFactor = (vertex.y + height/2) / height;
            const angle = Math.atan2(vertex.z, vertex.x);
            
            // Simpler noise calculation
            const noiseFactor = random(0.8, 1.2) * size * 0.15 * heightFactor;
            const radius = Math.sqrt(vertex.x * vertex.x + vertex.z * vertex.z);
            const newRadius = radius + noiseFactor;
            
            vertex.x = Math.cos(angle) * newRadius;
            vertex.z = Math.sin(angle) * newRadius;
            
            // Update position
            positionAttribute.setXYZ(i, vertex.x, vertex.y, vertex.z);
        }
        
        // Compute normals for lighting
        geometry.computeVertexNormals();
        return geometry;
    }
    
    private createSmoothHill(size: number, random: (min: number, max: number) => number): THREE.BufferGeometry {
        // Create a simpler, more performant hill shape
        const baseRadius = size;
        const height = size * 0.6; // Fixed height for consistency
        
        // Use minimal segments for better performance
        const segments = Math.min(8, Math.max(6, Math.floor(size)));
        
        // Use hemisphere for better performance
        const sphereGeometry = new THREE.SphereGeometry(
            baseRadius * 0.7,
            segments,
            Math.max(4, Math.floor(size/3)),
            0,
            Math.PI * 2,
            0,
            Math.PI / 2
        );
        
        // Flatten the bottom for better performance (no need to adjust vertices)
        sphereGeometry.computeVertexNormals();
        return sphereGeometry;
    }
    
    private createMesa(size: number, random: (min: number, max: number) => number): THREE.BufferGeometry {
        // Create a simpler mesa/plateau shape
        const baseRadius = size;
        const height = size * 0.7; // Fixed height
        const topRadius = baseRadius * 0.5; // Fixed ratio
        
        // Use cylinder with non-zero top radius for mesa - minimal segments
        return new THREE.CylinderGeometry(
            topRadius,
            baseRadius,
            height,
            Math.max(6, Math.floor(size)), // Minimal radial segments
            1, // Only one height segment for performance
            false
        );
    }
    
    private createVolcano(size: number, random: (min: number, max: number) => number): THREE.BufferGeometry {
        // Create a volcano shape - truncated cone with crater
        const baseRadius = size;
        const height = size * random(0.8, 1.2);
        const craterRadius = baseRadius * random(0.2, 0.4);
        const craterDepth = height * random(0.15, 0.3);
        
        // Use buffer geometry for more flexibility - with reduced segments
        const segments = Math.max(8, Math.floor(size * 1.2)); // Scale segments with size
        const heightSegments = Math.min(4, Math.max(2, Math.floor(size/2.5)));
        
        // Create cone geometry with appropriate segments for detail vs performance
        const geometry = new THREE.CylinderGeometry(
            craterRadius,   // Top radius (for crater)
            baseRadius,     // Bottom radius
            height,         // Height
            segments,       // Radial segments
            heightSegments, // Height segments
            false           // Open-ended
        );
        
        // Get position attribute for modification
        const positionAttribute = geometry.getAttribute('position');
        const vertex = new THREE.Vector3();
        
        // Add noise to vertices and create crater depression
        for (let i = 0; i < positionAttribute.count; i++) {
            vertex.fromBufferAttribute(positionAttribute, i);
            
            // Calculate distance from center axis
            const distFromCenter = Math.sqrt(vertex.x * vertex.x + vertex.z * vertex.z);
            
            // Only modify top vertices for crater
            if (vertex.y > height/2 - 0.001) {
                // Create crater depression
                if (distFromCenter < craterRadius * 0.9) {
                    // Push down for crater
                    vertex.y -= craterDepth * (1 - distFromCenter / craterRadius);
                }
            }
            
            // Add some noise to the surface everywhere, but use less intensive calculations
            if (vertex.y < height/2) { // Not at the very top rim
                const heightFactor = (vertex.y + height/2) / height; // 0 at bottom, 1 at top
                const noiseFactor = random(0.9, 1.1) * size * 0.05 * heightFactor;
                
                // Apply noise in horizontal direction
                const angle = Math.atan2(vertex.z, vertex.x);
                const radius = distFromCenter + noiseFactor;
                
                vertex.x = Math.cos(angle) * radius;
                vertex.z = Math.sin(angle) * radius;
            }
            
            // Update position
            positionAttribute.setXYZ(i, vertex.x, vertex.y, vertex.z);
        }
        
        // Recompute normals for proper lighting
        geometry.computeVertexNormals();
        return geometry;
    }

    private createArchipelago(size: number, random: (min: number, max: number) => number): THREE.BufferGeometry {
        // Instead of creating multiple separate islands, create one unified island with varied terrain
        const baseRadius = size;
        const height = size * random(0.6, 0.8);
        
        // Create a base island geometry with moderate complexity
        const segments = Math.max(8, Math.floor(size));
        const heightSegments = Math.max(2, Math.floor(size/4));
        
        // Create a single island with varied surface
        const geometry = new THREE.CylinderGeometry(
            size * 0.3, // Top radius - not pointed
            baseRadius, // Bottom radius
            height,
            segments,
            heightSegments,
            false
        );
        
        // Apply varied height to create the appearance of multiple connected landmasses
        const positionAttribute = geometry.getAttribute('position');
        const vertex = new THREE.Vector3();
        
        // Process vertices to create a varied surface
        for (let i = 0; i < positionAttribute.count; i++) {
            vertex.fromBufferAttribute(positionAttribute, i);
            
            // Skip bottom vertices
            if (Math.abs(vertex.y + height/2) < 0.001) continue;
            
            // Calculate distance from center axis
            const distFromCenter = Math.sqrt(vertex.x * vertex.x + vertex.z * vertex.z);
            const normalizedDist = distFromCenter / baseRadius;
            
            // Create waves in the surface
            const angle = Math.atan2(vertex.z, vertex.x);
            const wave = Math.sin(angle * 3) * Math.cos(angle * 2) * random(0.8, 1.2);
            
            // Apply more height variation to create the appearance of separate peaks
            if (vertex.y > -height/4) {
                // Create dips and peaks
                const heightMod = size * 0.15 * wave * (1 - normalizedDist);
                vertex.y += heightMod;
                
                // Also vary the radius slightly
                const radiusMod = random(0.9, 1.1) * size * 0.1 * wave;
                const newRadius = distFromCenter + radiusMod;
                vertex.x = (vertex.x / distFromCenter) * newRadius;
                vertex.z = (vertex.z / distFromCenter) * newRadius;
            }
            
            // Update position
            positionAttribute.setXYZ(i, vertex.x, vertex.y, vertex.z);
        }
        
        // Compute normals for lighting
        geometry.computeVertexNormals();
        return geometry;
    }

    // Add a texture cache for billboards
    private textureCache: Map<string, THREE.Texture> = new Map();
    private billboardGeometryCache: Map<string, THREE.PlaneGeometry> = new Map();
    
    // Get or create billboard geometry
    private getBillboardGeometry(width: number, height: number): THREE.PlaneGeometry {
        // Round dimensions to nearest 0.5 for caching purposes
        const roundedWidth = Math.round(width * 2) / 2;
        const roundedHeight = Math.round(height * 2) / 2;
        const key = `${roundedWidth}_${roundedHeight}`;
        
        if (!this.billboardGeometryCache.has(key)) {
            this.billboardGeometryCache.set(key, new THREE.PlaneGeometry(roundedWidth, roundedHeight));
        }
        
        return this.billboardGeometryCache.get(key)!;
    }
    
    // Load texture with caching
    private loadTextureForBillboard(islandData: IslandData, billboard: THREE.Mesh, adRank: number): void {
        const imageUrl = islandData.outdoor?.image || '';
        if (!imageUrl) return;
        
        // Check if we already have this texture cached
        if (this.textureCache.has(imageUrl)) {
            const texture = this.textureCache.get(imageUrl)!;
            this.applyTextureToAdBillboard(billboard, texture, adRank);
        } else {
            // Load the texture
            this.outdoorTextureLoader.load(
                imageUrl,
                (texture) => {
                    // Cache the texture for future use
                    this.textureCache.set(imageUrl, texture);
                    this.applyTextureToAdBillboard(billboard, texture, adRank);
                },
                undefined,
                (error) => {
                    console.error(`Failed to load outdoor ad texture for island ${islandData.id}:`, error);
                }
            );
        }
    }
    
    // Apply texture to billboard with optimized material settings
    private applyTextureToAdBillboard(billboard: THREE.Mesh, texture: THREE.Texture, adRank: number): void {
        if (billboard.material instanceof THREE.Material) {
            billboard.material.dispose();
        }
        
        // Create the material with the loaded texture - higher ranked ads get better material properties
        billboard.material = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            side: THREE.DoubleSide,
            // Higher ranked ads look better
            color: new THREE.Color(1, 1, 1).multiplyScalar(1 + adRank/30)
        });
    }

    // Add a new dispose method to clean up resources
    public dispose(): void {
        // Clear texture cache
        this.textureCache.forEach(texture => {
            texture.dispose();
        });
        this.textureCache.clear();
        
        // Clear geometry caches
        this.geometryCache.forEach(geometry => {
            geometry.dispose();
        });
        this.geometryCache.clear();
        
        this.billboardGeometryCache.forEach(geometry => {
            geometry.dispose();
        });
        this.billboardGeometryCache.clear();
    }

    // Add method to clear caches partially when memory gets high
    public clearUnusedCaches(usedIslandIds: Set<string>): void {
        // This method can be called periodically to clean up unused geometries
        // For example, we might only keep geometries for islands that are currently visible
        
        console.log("Clearing unused geometry caches to improve performance");
        
        // Only keep caches that match the size of visible islands
        const visibleSizes = new Set<string>();
        
        // For now, we'll just clear all caches that aren't used recently
        // This is a simplistic approach - a more sophisticated one would track usage
        if (this.geometryCache.size > 50) { // If we have many cached geometries
            this.geometryCache.forEach((geometry, key) => {
                geometry.dispose();
            });
            this.geometryCache.clear();
            console.log("Cleared geometry cache due to high memory usage");
        }
        
        // Also clear billboard geometry cache if it grows too large
        if (this.billboardGeometryCache.size > 20) {
            this.billboardGeometryCache.forEach((geometry, key) => {
                geometry.dispose();
            });
            this.billboardGeometryCache.clear();
            console.log("Cleared billboard geometry cache due to high memory usage");
        }
        
        // Only clear unused textures if we have too many
        if (this.textureCache.size > 30) {
            this.textureCache.forEach((texture, url) => {
                // Keep textures that might still be in use
                if (Math.random() < 0.3) { // Randomly keep 30% of textures
                    return;
                }
                texture.dispose();
                this.textureCache.delete(url);
            });
            console.log("Cleared some texture cache entries due to high memory usage");
        }
    }

    // Add a helper method to validate mesh geometry
    private validateMeshGeometry(mesh: THREE.Mesh | THREE.Group): boolean {
        if (mesh instanceof THREE.Group) {
            // For groups, validate the first mesh found within the group
            let isValid = false;
            mesh.traverse((child) => {
                if (child instanceof THREE.Mesh && !isValid) {
                    isValid = this.validateSingleMeshGeometry(child);
                }
            });
            return isValid;
        } else {
            // For individual meshes
            return this.validateSingleMeshGeometry(mesh);
        }
    }
    
    // Helper method to validate a single mesh's geometry
    private validateSingleMeshGeometry(mesh: THREE.Mesh): boolean {
        if (!mesh.geometry || !mesh.geometry.getAttribute('position')) {
            return false;
        }
        
        // Check for NaN values in position attribute
        const positions = mesh.geometry.getAttribute('position');
        for (let i = 0; i < positions.count; i++) {
            const x = positions.getX(i);
            const y = positions.getY(i);
            const z = positions.getZ(i);
            
            if (isNaN(x) || isNaN(y) || isNaN(z)) {
                console.error(`NaN value detected in mesh at position ${i}: (${x}, ${y}, ${z})`);
                
                // Fix NaN value
                positions.setXYZ(i, 0, 0, 0);
                
                // Mark buffer as needing update
                positions.needsUpdate = true;
            }
        }
        
        // Check for valid bounding sphere
        if (!mesh.geometry.boundingSphere) {
            mesh.geometry.computeBoundingSphere();
        }
        
        // Check if bounding sphere has NaN radius
        if (!mesh.geometry.boundingSphere || isNaN(mesh.geometry.boundingSphere.radius)) {
            console.error("Mesh has invalid bounding sphere radius");
            return false;
        }
        
        return true;
    }

    // Add a helper method to generate a numeric hash from a string
    private hashCode(str: string): number {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return Math.abs(hash);
    }

    // Add a new LOD (Level of Detail) system for distant islands
    private islandLODSystem = new Map<string, THREE.Mesh>();

    // Add a new method to create low-detail islands for distant viewing
    private createLowDetailIsland(size: number, biome: Biome): THREE.Mesh {
        // Create a very simple shape - just a cone
        const geometry = new THREE.CylinderGeometry(0, size, size * 0.7, 6, 1);
        
        // Simple material with no special effects - fix flatShading parameter
        const material = new THREE.MeshBasicMaterial({
            color: biome.color
        });
        
        return new THREE.Mesh(geometry, material);
    }
} 