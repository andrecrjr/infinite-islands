import * as THREE from 'three';
import { ShipOptions, ShipPartColors } from './types';

export class Ship {
    // Main object that contains all parts
    private shipGroup: THREE.Group;
    
    // References to individual parts for customization
    private hull: THREE.Mesh | null = null;
    private deck: THREE.Mesh | null = null;
    private cabin: THREE.Mesh | null = null;
    private mast: THREE.Mesh | null = null;
    private sail: THREE.Mesh | null = null;
    private bowsprit: THREE.Mesh | null = null;
    private leftRailing: THREE.Mesh | null = null;
    private rightRailing: THREE.Mesh | null = null;
    private flagPole: THREE.Mesh | null = null;
    private flag: THREE.Mesh | null = null;
    private windows: THREE.Mesh[] = [];
    
    // Materials for easy updates
    private hullMaterial: THREE.MeshStandardMaterial;
    private deckMaterial: THREE.MeshStandardMaterial;
    private cabinMaterial: THREE.MeshStandardMaterial;
    private mastMaterial: THREE.MeshStandardMaterial;
    private sailMaterial: THREE.MeshStandardMaterial;
    private railingMaterial: THREE.MeshStandardMaterial;
    private flagMaterial: THREE.MeshStandardMaterial;
    private windowMaterial: THREE.MeshStandardMaterial;
    
    // Default colors
    private defaultColors: ShipPartColors = {
        hull: 0x6b5b95,
        deck: 0x9e8b5d,
        cabin: 0x9e8b5d,
        mast: 0x8b4513,
        sail: 0xf5f5f5,
        railings: 0x8b4513,
        flag: 0xff0000,
        windows: 0x87cefa
    };
    
    constructor(options: ShipOptions = {}) {
        this.shipGroup = new THREE.Group();
        
        // Initialize materials with default or custom colors
        const colors = { ...this.defaultColors, ...options.colors };
        
        this.hullMaterial = new THREE.MeshStandardMaterial({ 
            color: colors.hull,
            roughness: 0.5,
            metalness: 0.2
        });
        
        this.deckMaterial = new THREE.MeshStandardMaterial({ 
            color: colors.deck,
            roughness: 0.8,
            metalness: 0
        });
        
        this.cabinMaterial = new THREE.MeshStandardMaterial({ 
            color: colors.cabin,
            roughness: 0.7
        });
        
        this.mastMaterial = new THREE.MeshStandardMaterial({ 
            color: colors.mast,
            roughness: 0.9
        });
        
        this.sailMaterial = new THREE.MeshStandardMaterial({
            color: colors.sail,
            side: THREE.DoubleSide,
            roughness: 1
        });
        
        this.railingMaterial = new THREE.MeshStandardMaterial({ 
            color: colors.railings 
        });
        
        this.flagMaterial = new THREE.MeshStandardMaterial({
            color: colors.flag,
            side: THREE.DoubleSide
        });
        
        this.windowMaterial = new THREE.MeshStandardMaterial({
            color: colors.windows,
            transparent: true,
            opacity: 0.7,
            metalness: 0.2
        });
        
        // Build the ship with specified options
        this.buildShip(options);
    }
    
    public getObject(): THREE.Group {
        return this.shipGroup;
    }
    
    private buildShip(options: ShipOptions): void {
        // Set default values for options
        const showCabin = options.showCabin !== undefined ? options.showCabin : true;
        const showSail = options.showSail !== undefined ? options.showSail : true;
        const showFlag = options.showFlag !== undefined ? options.showFlag : true;
        const showRailings = options.showRailings !== undefined ? options.showRailings : true;
        
        // Default hull size
        const hullSize = options.hullSize || { width: 1.5, height: 0.6, length: 3 };
        
        // Create hull
        this.createHull(hullSize);
        
        // Create deck
        this.createDeck(hullSize);
        
        // Create cabin if enabled
        if (showCabin) {
            this.createCabin();
        }
        
        // Create mast and sail if enabled
        if (showSail) {
            this.createMast();
            this.createSail();
        }
        
        // Create bowsprit (front pole)
        this.createBowsprit();
        
        // Create railings if enabled
        if (showRailings) {
            this.createRailings();
        }
        
        // Create flag if enabled
        if (showFlag && showSail) {
            this.createFlag();
        }
    }
    
    private createHull(size: { width: number, height: number, length: number }): void {
        const hullGeometry = new THREE.BoxGeometry(size.width, size.height, size.length);
        this.hull = new THREE.Mesh(hullGeometry, this.hullMaterial);
        this.hull.position.y = size.height / 2;
        this.shipGroup.add(this.hull);
    }
    
    private createDeck(hullSize: { width: number, height: number, length: number }): void {
        const deckGeometry = new THREE.BoxGeometry(hullSize.width * 0.8, 0.1, hullSize.length * 0.9);
        this.deck = new THREE.Mesh(deckGeometry, this.deckMaterial);
        this.deck.position.y = hullSize.height + 0.05;
        this.shipGroup.add(this.deck);
    }
    
    private createCabin(): void {
        // Create the cabin
        const cabinGeometry = new THREE.BoxGeometry(0.8, 0.5, 1);
        this.cabin = new THREE.Mesh(cabinGeometry, this.cabinMaterial);
        this.cabin.position.set(0, 0.7, 0.5);
        this.shipGroup.add(this.cabin);
        
        // Create windows for the cabin
        this.createWindows();
    }
    
    private createWindows(): void {
        // Front window
        const frontWindowGeometry = new THREE.BoxGeometry(0.5, 0.2, 0.05);
        const frontWindow = new THREE.Mesh(frontWindowGeometry, this.windowMaterial);
        frontWindow.position.set(0, 0.75, 1.01);
        this.shipGroup.add(frontWindow);
        this.windows.push(frontWindow);
        
        // Side windows
        const sideWindowGeometry = new THREE.BoxGeometry(0.05, 0.2, 0.4);
        
        const leftWindow = new THREE.Mesh(sideWindowGeometry, this.windowMaterial);
        leftWindow.position.set(0.41, 0.75, 0.5);
        this.shipGroup.add(leftWindow);
        this.windows.push(leftWindow);
        
        const rightWindow = new THREE.Mesh(sideWindowGeometry, this.windowMaterial);
        rightWindow.position.set(-0.41, 0.75, 0.5);
        this.shipGroup.add(rightWindow);
        this.windows.push(rightWindow);
    }
    
    private createMast(): void {
        const mastGeometry = new THREE.CylinderGeometry(0.05, 0.05, 2, 8);
        this.mast = new THREE.Mesh(mastGeometry, this.mastMaterial);
        this.mast.position.set(0, 1.55, -0.2);
        this.shipGroup.add(this.mast);
    }
    
    private createSail(): void {
        const sailGeometry = new THREE.PlaneGeometry(1.2, 1.5);
        this.sail = new THREE.Mesh(sailGeometry, this.sailMaterial);
        this.sail.rotation.y = Math.PI / 2;
        this.sail.position.set(0, 1.25, -0.2);
        this.shipGroup.add(this.sail);
    }
    
    private createBowsprit(): void {
        const bowspritGeometry = new THREE.CylinderGeometry(0.03, 0.03, 1.2, 8);
        this.bowsprit = new THREE.Mesh(bowspritGeometry, this.mastMaterial);
        this.bowsprit.rotation.x = Math.PI / 4; // 45 degrees angle
        this.bowsprit.position.set(0, 0.6, 1.8);
        this.shipGroup.add(this.bowsprit);
    }
    
    private createRailings(): void {
        // Left railing
        const leftRailingGeometry = new THREE.BoxGeometry(0.05, 0.1, 2.7);
        this.leftRailing = new THREE.Mesh(leftRailingGeometry, this.railingMaterial);
        this.leftRailing.position.set(0.6, 0.7, 0);
        this.shipGroup.add(this.leftRailing);
        
        // Right railing
        const rightRailingGeometry = new THREE.BoxGeometry(0.05, 0.1, 2.7);
        this.rightRailing = new THREE.Mesh(rightRailingGeometry, this.railingMaterial);
        this.rightRailing.position.set(-0.6, 0.7, 0);
        this.shipGroup.add(this.rightRailing);
    }
    
    private createFlag(): void {
        // Flag pole
        const flagPoleGeometry = new THREE.CylinderGeometry(0.02, 0.02, 0.4, 8);
        this.flagPole = new THREE.Mesh(flagPoleGeometry, this.mastMaterial);
        this.flagPole.position.set(0, 2.65, -0.2);
        this.shipGroup.add(this.flagPole);
        
        // Flag
        const flagGeometry = new THREE.PlaneGeometry(0.3, 0.2);
        this.flag = new THREE.Mesh(flagGeometry, this.flagMaterial);
        this.flag.position.set(0.15, 2.65, -0.2);
        this.flag.rotation.y = Math.PI / 2;
        this.shipGroup.add(this.flag);
    }
    
    // Methods for customizing the ship
    
    public setColor(part: keyof ShipPartColors, color: number): void {
        switch (part) {
            case 'hull':
                if (this.hullMaterial) this.hullMaterial.color.setHex(color);
                break;
            case 'deck':
                if (this.deckMaterial) this.deckMaterial.color.setHex(color);
                break;
            case 'cabin':
                if (this.cabinMaterial) this.cabinMaterial.color.setHex(color);
                break;
            case 'mast':
                if (this.mastMaterial) this.mastMaterial.color.setHex(color);
                break;
            case 'sail':
                if (this.sailMaterial) this.sailMaterial.color.setHex(color);
                break;
            case 'railings':
                if (this.railingMaterial) this.railingMaterial.color.setHex(color);
                break;
            case 'flag':
                if (this.flagMaterial) this.flagMaterial.color.setHex(color);
                break;
            case 'windows':
                if (this.windowMaterial) this.windowMaterial.color.setHex(color);
                break;
        }
    }
    
    public togglePart(part: string, visible: boolean): void {
        switch (part) {
            case 'cabin':
                if (this.cabin) this.cabin.visible = visible;
                this.windows.forEach(window => window.visible = visible);
                break;
            case 'sail':
                if (this.sail) this.sail.visible = visible;
                if (this.mast) this.mast.visible = visible;
                break;
            case 'flag':
                if (this.flag) this.flag.visible = visible;
                if (this.flagPole) this.flagPole.visible = visible;
                break;
            case 'railings':
                if (this.leftRailing) this.leftRailing.visible = visible;
                if (this.rightRailing) this.rightRailing.visible = visible;
                break;
        }
    }
    
    public setHullSize(width: number, height: number, length: number): void {
        if (!this.hull) return;
        
        // Remove current hull
        this.shipGroup.remove(this.hull);
        
        // Create new hull with new dimensions
        const hullGeometry = new THREE.BoxGeometry(width, height, length);
        this.hull = new THREE.Mesh(hullGeometry, this.hullMaterial);
        this.hull.position.y = height / 2;
        this.shipGroup.add(this.hull);
        
        // Adjust deck size and position accordingly
        if (this.deck) {
            this.shipGroup.remove(this.deck);
            const deckGeometry = new THREE.BoxGeometry(width * 0.8, 0.1, length * 0.9);
            this.deck = new THREE.Mesh(deckGeometry, this.deckMaterial);
            this.deck.position.y = height + 0.05;
            this.shipGroup.add(this.deck);
        }
        
        // Adjust other elements as needed
        if (this.cabin) this.cabin.position.y = height + 0.35;
        if (this.mast) this.mast.position.y = height + 1.0;
        if (this.sail) this.sail.position.y = height + 0.7;
        
        // Update windows positions
        this.windows.forEach(window => {
            window.position.y = height + 0.4;
        });
        
        // Update railings positions
        if (this.leftRailing) {
            this.leftRailing.position.set(width / 2 + 0.1, height + 0.05, 0);
            this.leftRailing.scale.z = length * 0.9;
        }
        if (this.rightRailing) {
            this.rightRailing.position.set(-width / 2 - 0.1, height + 0.05, 0);
            this.rightRailing.scale.z = length * 0.9;
        }
    }
} 