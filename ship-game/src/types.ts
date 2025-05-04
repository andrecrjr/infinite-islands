import * as THREE from 'three';

export interface Position {
    x: number;
    y: number;
    z: number;
}

export interface Biome {
    name: string;
    color: number; // Hex color code
}

export interface IslandData {
    id: string;
    pos: Position;
    biome: string; // Name matching a Biome
    size: number;
    name: string | null;
    chunk: string; // Chunk key
    mesh?: THREE.Mesh | THREE.Group; // Can be either a Mesh or a Group containing multiple meshes
    label?: HTMLDivElement; // Optional label reference
    outdoor?: {
        image: string;
        url: string;
        active: boolean;
        billboard?: THREE.Mesh; // Reference to the billboard mesh
        lastInteractionTime?: number; // Timestamp of last interaction to prevent spam
        adRank?: number; // 1-10 ranking based on payment tier, higher ranks appear more prominently
    }; // Optional advertisement data
}

export interface MoveState {
    f: number; // Forward
    b: number; // Backward
    l: number; // Left strafe/turn
    r: number; // Right strafe/turn
}

export interface ShipControllerOptions {
    ship: THREE.Object3D;
    speedForward: number;
    speedReverse: number;
    turnSpeed: number;
    coordsElement?: HTMLDivElement;
}

export interface ShipPartColors {
    hull?: number;
    deck?: number;
    cabin?: number;
    mast?: number;
    sail?: number;
    railings?: number;
    flag?: number;
    windows?: number;
}

export interface ShipOptions {
    colors?: ShipPartColors;
    showCabin?: boolean;
    showSail?: boolean;
    showFlag?: boolean;
    showRailings?: boolean;
    hullSize?: { width: number, height: number, length: number };
} 