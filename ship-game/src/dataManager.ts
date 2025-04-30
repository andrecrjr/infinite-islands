import { STORAGE_KEY_DATA, STORAGE_KEY_CHUNKS } from "./constants";
import { IslandData } from "./types";

export class DataManager {
    public islandData: { [id: string]: IslandData } = {};
    public generatedChunks: Set<string> = new Set();

    constructor() {
        this.loadData();
    }

    public loadData(): void {
        try {
            const storedData = localStorage.getItem(STORAGE_KEY_DATA);
            if (storedData) {
                const parsedData: IslandData[] = JSON.parse(storedData);
                // Ensure loaded data is mapped correctly by id
                this.islandData = parsedData.reduce((acc, island) => {
                    acc[island.id] = island;
                    return acc;
                }, {} as { [id: string]: IslandData });
            }
        } catch (error) {
            console.error("Error loading island data:", error);
            this.islandData = {}; // Reset on error
        }

        try {
            const storedChunks = localStorage.getItem(STORAGE_KEY_CHUNKS);
            if (storedChunks) {
                this.generatedChunks = new Set(JSON.parse(storedChunks));
            }
        } catch (error) {
            console.error("Error loading generated chunks:", error);
            this.generatedChunks = new Set(); // Reset on error
        }
    }

    public saveData(): void {
        try {
            // Explicitly type the parameter in the map function
            const dataToStore = Object.values(this.islandData).map((island: IslandData) => {
                const { mesh, label, ...rest } = island; // Destructure inside
                return rest; // Return only the serializable part
            });
            localStorage.setItem(STORAGE_KEY_DATA, JSON.stringify(dataToStore));
            localStorage.setItem(STORAGE_KEY_CHUNKS, JSON.stringify([...this.generatedChunks]));
        } catch (error) {
            console.error("Error saving game data:", error);
        }
    }

    public getIslandById(id: string): IslandData | undefined {
        return this.islandData[id];
    }

    public addIsland(island: IslandData): void {
        this.islandData[island.id] = island;
        // Note: Saving happens typically after chunk generation or naming
    }

    public addGeneratedChunk(chunkKey: string): void {
        this.generatedChunks.add(chunkKey);
        // Note: Saving happens typically after chunk generation
    }
} 