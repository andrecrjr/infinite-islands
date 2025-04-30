import * as THREE from 'three';
import { MoveState, ShipControllerOptions } from './types';

export class ShipController {
    private ship: THREE.Object3D;
    public moveState: MoveState = { f: 0, b: 0, l: 0, r: 0 };
    private gamepadConnected: boolean = false;
    private coordsElement?: HTMLDivElement;
    
    private speedForward: number;
    private speedReverse: number;
    private turnSpeed: number;
    

    constructor(options: ShipControllerOptions) {
        this.ship = options.ship;
        this.speedForward = options.speedForward;
        this.speedReverse = options.speedReverse;
        this.turnSpeed = options.turnSpeed;
        this.coordsElement = options.coordsElement;
        
        this.setupEventListeners();
    }

    private setupEventListeners(): void {
        // Keyboard controls for movement
        window.addEventListener('keydown', this.handleKeyDown);
        window.addEventListener('keyup', this.handleKeyUp);
        
        // Gamepad connection event listeners
        window.addEventListener('gamepadconnected', this.handleGamepadConnected);
        window.addEventListener('gamepaddisconnected', this.handleGamepadDisconnected);
    }

    private handleKeyDown = (e: KeyboardEvent): void => {
        if (e.code === 'ArrowUp') this.moveState.f = 1;
        if (e.code === 'ArrowDown') this.moveState.b = 1;
        if (e.code === 'ArrowLeft') this.moveState.l = 1;
        if (e.code === 'ArrowRight') this.moveState.r = 1;
    }

    private handleKeyUp = (e: KeyboardEvent): void => {
        if (e.code === 'ArrowUp') this.moveState.f = 0;
        if (e.code === 'ArrowDown') this.moveState.b = 0;
        if (e.code === 'ArrowLeft') this.moveState.l = 0;
        if (e.code === 'ArrowRight') this.moveState.r = 0;
    }

    private handleGamepadConnected = (e: GamepadEvent): void => {
        console.log(`Gamepad connected: ${e.gamepad.id}`);
        this.gamepadConnected = true;
    }

    private handleGamepadDisconnected = (e: GamepadEvent): void => {
        console.log(`Gamepad disconnected: ${e.gamepad.id}`);
        this.gamepadConnected = false;
    }

    public handleGamepadInput(): void {
        if (!this.gamepadConnected) return;
        
        const gamepads = navigator.getGamepads();
        if (!gamepads || !gamepads[0]) return;
        
        const gamepad = gamepads[0]; // Use the first connected gamepad
        
        // Reset move state first
        this.moveState = { f: 0, b: 0, l: 0, r: 0 };
        
        // Left analog stick for turning (horizontal axis = 0)
        const leftStickX = gamepad.axes[0]; // Left stick horizontal axis
        if (Math.abs(leftStickX) > 0.1) { // Add deadzone
            if (leftStickX < -0.1) this.moveState.l = Math.abs(leftStickX);
            if (leftStickX > 0.1) this.moveState.r = Math.abs(leftStickX);
        }
        
        // Right trigger (axis 2) and left trigger (axis 3) for forward/backward
        const rightTrigger = gamepad.buttons[7].value; // RT for forward
        const leftTrigger = gamepad.buttons[6].value;  // LT for backward
        
        if (rightTrigger > 0.1) this.moveState.f = rightTrigger;
        if (leftTrigger > 0.1) this.moveState.b = leftTrigger;
        
        // Alternative: D-pad controls
        if (gamepad.buttons[12].pressed) this.moveState.f = 1; // D-pad up
        if (gamepad.buttons[13].pressed) this.moveState.b = 1; // D-pad down
        if (gamepad.buttons[14].pressed) this.moveState.l = 1; // D-pad left
        if (gamepad.buttons[15].pressed) this.moveState.r = 1; // D-pad right
        
        // Alternative: Face buttons
        if (gamepad.buttons[3].pressed) this.moveState.f = 1; // Y/Triangle
        if (gamepad.buttons[0].pressed) this.moveState.b = 1; // A/Cross
        if (gamepad.buttons[2].pressed) this.moveState.l = 1; // X/Square
        if (gamepad.buttons[1].pressed) this.moveState.r = 1; // B/Circle
    }

    public updatePosition(): void {
        if (this.moveState.f) this.ship.translateZ(this.speedForward);
        if (this.moveState.b) this.ship.translateZ(-this.speedReverse);
        if (this.moveState.l) this.ship.rotation.y += this.turnSpeed;
        if (this.moveState.r) this.ship.rotation.y -= this.turnSpeed;

        // Update coords display
        if (this.coordsElement) {
            this.coordsElement.innerText = `X: ${this.ship.position.x.toFixed(1)}, Z: ${this.ship.position.z.toFixed(1)}`;
        }
    }

    public getPosition(): THREE.Vector3 {
        return this.ship.position;
    }

    public getRotation(): THREE.Euler {
        return this.ship.rotation;
    }

    public dispose(): void {
        window.removeEventListener('keydown', this.handleKeyDown);
        window.removeEventListener('keyup', this.handleKeyUp);
        window.removeEventListener('gamepadconnected', this.handleGamepadConnected);
        window.removeEventListener('gamepaddisconnected', this.handleGamepadDisconnected);
    }
} 