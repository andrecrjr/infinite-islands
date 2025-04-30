import { Game } from "../Game";
import { ShipOptions } from "../types";

export function createShipCustomizationUI(game: Game): void {
    // Create container for the customization panel
    const customizePanel = document.createElement('div');
    customizePanel.className = 'customize-panel';
    customizePanel.style.position = 'absolute';
    customizePanel.style.top = '10px';
    customizePanel.style.right = '10px';
    customizePanel.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    customizePanel.style.color = 'white';
    customizePanel.style.padding = '10px';
    customizePanel.style.borderRadius = '5px';
    customizePanel.style.zIndex = '1000';
    customizePanel.style.maxWidth = '250px';
    
    // Add a title
    const title = document.createElement('h3');
    title.textContent = 'Ship Customization';
    title.style.margin = '0 0 10px 0';
    customizePanel.appendChild(title);
    
    // Add color pickers for different parts
    const parts = [
        { id: 'hull', label: 'Hull Color', defaultColor: '#6b5b95' },
        { id: 'deck', label: 'Deck Color', defaultColor: '#9e8b5d' },
        { id: 'sail', label: 'Sail Color', defaultColor: '#f5f5f5' },
        { id: 'flag', label: 'Flag Color', defaultColor: '#ff0000' }
    ];
    
    parts.forEach(part => {
        const container = document.createElement('div');
        container.style.marginBottom = '10px';
        
        const label = document.createElement('label');
        label.textContent = part.label;
        label.style.display = 'block';
        label.style.marginBottom = '5px';
        container.appendChild(label);
        
        const colorPicker = document.createElement('input');
        colorPicker.type = 'color';
        colorPicker.value = part.defaultColor;
        colorPicker.id = `ship-${part.id}-color`;
        colorPicker.style.width = '100%';
        
        colorPicker.addEventListener('change', () => {
            const shipInstance = game.getShipInstance();
            if (shipInstance) {
                // Convert from hex string to number
                const colorValue = parseInt(colorPicker.value.replace('#', ''), 16);
                shipInstance.setColor(part.id as any, colorValue);
            }
        });
        
        container.appendChild(colorPicker);
        customizePanel.appendChild(container);
    });
    
    // Add toggles for ship components
    const toggles = [
        { id: 'cabin', label: 'Show Cabin', defaultChecked: true },
        { id: 'sail', label: 'Show Sail', defaultChecked: true },
        { id: 'flag', label: 'Show Flag', defaultChecked: true },
        { id: 'railings', label: 'Show Railings', defaultChecked: true }
    ];
    
    toggles.forEach(toggle => {
        const container = document.createElement('div');
        container.style.marginBottom = '10px';
        container.style.display = 'flex';
        container.style.alignItems = 'center';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `ship-${toggle.id}-toggle`;
        checkbox.checked = toggle.defaultChecked;
        checkbox.style.marginRight = '10px';
        
        checkbox.addEventListener('change', () => {
            const shipInstance = game.getShipInstance();
            if (shipInstance) {
                shipInstance.togglePart(toggle.id, checkbox.checked);
            }
        });
        
        const label = document.createElement('label');
        label.textContent = toggle.label;
        label.htmlFor = checkbox.id;
        
        container.appendChild(checkbox);
        container.appendChild(label);
        customizePanel.appendChild(container);
    });
    
    // Hull size controls
    const sizeSection = document.createElement('div');
    sizeSection.style.marginTop = '15px';
    sizeSection.style.marginBottom = '10px';
    
    const sizeTitle = document.createElement('h4');
    sizeTitle.textContent = 'Hull Size';
    sizeTitle.style.margin = '0 0 10px 0';
    sizeSection.appendChild(sizeTitle);
    
    // Create sliders for width, height, and length
    const dimensions = [
        { id: 'width', label: 'Width', min: 0.5, max: 3, step: 0.1, default: 1.5 },
        { id: 'height', label: 'Height', min: 0.2, max: 1.5, step: 0.1, default: 0.6 },
        { id: 'length', label: 'Length', min: 1, max: 5, step: 0.1, default: 3 }
    ];
    
    const hullSizeValues = {
        width: 1.5,
        height: 0.6,
        length: 3
    };
    
    dimensions.forEach(dim => {
        const container = document.createElement('div');
        container.style.marginBottom = '5px';
        
        const label = document.createElement('label');
        label.textContent = `${dim.label}: `;
        label.style.display = 'inline-block';
        label.style.width = '60px';
        container.appendChild(label);
        
        const valueDisplay = document.createElement('span');
        valueDisplay.textContent = dim.default.toString();
        valueDisplay.style.display = 'inline-block';
        valueDisplay.style.width = '30px';
        valueDisplay.style.marginLeft = '10px';
        
        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = dim.min.toString();
        slider.max = dim.max.toString();
        slider.step = dim.step.toString();
        slider.value = dim.default.toString();
        
        slider.addEventListener('input', () => {
            valueDisplay.textContent = slider.value;
            hullSizeValues[dim.id as keyof typeof hullSizeValues] = parseFloat(slider.value);
            
            const shipInstance = game.getShipInstance();
            if (shipInstance) {
                shipInstance.setHullSize(
                    hullSizeValues.width,
                    hullSizeValues.height,
                    hullSizeValues.length
                );
            }
        });
        
        container.appendChild(slider);
        container.appendChild(valueDisplay);
        sizeSection.appendChild(container);
    });
    
    customizePanel.appendChild(sizeSection);
    
    // Add a button to apply all changes at once
    const applyButton = document.createElement('button');
    applyButton.textContent = 'Apply All Changes';
    applyButton.style.display = 'block';
    applyButton.style.width = '100%';
    applyButton.style.padding = '8px';
    applyButton.style.marginTop = '10px';
    applyButton.style.backgroundColor = '#4CAF50';
    applyButton.style.color = 'white';
    applyButton.style.border = 'none';
    applyButton.style.borderRadius = '4px';
    applyButton.style.cursor = 'pointer';
    
    applyButton.addEventListener('click', () => {
        // Build ship options from all controls
        const options: ShipOptions = {
            colors: {
                hull: parseInt((document.getElementById('ship-hull-color') as HTMLInputElement).value.replace('#', ''), 16),
                deck: parseInt((document.getElementById('ship-deck-color') as HTMLInputElement).value.replace('#', ''), 16),
                sail: parseInt((document.getElementById('ship-sail-color') as HTMLInputElement).value.replace('#', ''), 16),
                flag: parseInt((document.getElementById('ship-flag-color') as HTMLInputElement).value.replace('#', ''), 16)
            },
            showCabin: (document.getElementById('ship-cabin-toggle') as HTMLInputElement).checked,
            showSail: (document.getElementById('ship-sail-toggle') as HTMLInputElement).checked,
            showFlag: (document.getElementById('ship-flag-toggle') as HTMLInputElement).checked,
            showRailings: (document.getElementById('ship-railings-toggle') as HTMLInputElement).checked,
            hullSize: {
                width: hullSizeValues.width,
                height: hullSizeValues.height,
                length: hullSizeValues.length
            }
        };
        
        // Apply all changes at once by creating a new ship
        game.customizeShip(options);
    });
    
    customizePanel.appendChild(applyButton);
    
    // Add a button to toggle the panel visibility
    const toggleButton = document.createElement('button');
    toggleButton.textContent = 'Customize Ship';
    toggleButton.style.position = 'absolute';
    toggleButton.style.top = '10px';
    toggleButton.style.right = '10px';
    toggleButton.style.padding = '5px 10px';
    toggleButton.style.backgroundColor = '#007BFF';
    toggleButton.style.color = 'white';
    toggleButton.style.border = 'none';
    toggleButton.style.borderRadius = '4px';
    toggleButton.style.zIndex = '1001';
    toggleButton.style.cursor = 'pointer';
    
    // Initially hide the customization panel
    customizePanel.style.display = 'none';
    
    toggleButton.addEventListener('click', () => {
        if (customizePanel.style.display === 'none') {
            customizePanel.style.display = 'block';
            toggleButton.textContent = 'Hide Customization';
        } else {
            customizePanel.style.display = 'none';
            toggleButton.textContent = 'Customize Ship';
        }
    });
    
    // Add elements to the document
    document.body.appendChild(customizePanel);
    document.body.appendChild(toggleButton);
}
