// Supply Chain Canvas Controller - Stage 1
const CanvasController = {
    panX: 0,
    panY: 0,
    zoom: 1,
    isDragging: false,
    isDraggingItem: false,
    isResizing: false,
    startX: 0,
    startY: 0,
    items: [],
    selectedItem: null,
    currentTool: 'select',
    nextId: 1,
    
    init() {
        const canvas = document.getElementById('scCanvas');
        if (!canvas) {
            console.error('Canvas element not found');
            return;
        }
        
        console.log('CanvasController initialized');
        
        this.loadFromStorage();
        
        // Mouse events
        canvas.addEventListener('mousedown', this.onMouseDown.bind(this));
        document.addEventListener('mousemove', this.onMouseMove.bind(this));
        document.addEventListener('mouseup', this.onMouseUp.bind(this));
        canvas.addEventListener('wheel', this.onWheel.bind(this), { passive: false });
        canvas.addEventListener('click', this.onCanvasClick.bind(this));
        
        // Zoom buttons
        const zoomInBtn = document.querySelector('.sc-zoom-in');
        const zoomOutBtn = document.querySelector('.sc-zoom-out');
        const zoomLabel = document.querySelector('.sc-zoom-label');
        
        if (zoomInBtn) {
            zoomInBtn.addEventListener('click', () => {
                console.log('Zoom in clicked');
                this.zoomIn();
            });
        }
        if (zoomOutBtn) {
            zoomOutBtn.addEventListener('click', () => {
                console.log('Zoom out clicked');
                this.zoomOut();
            });
        }
        if (zoomLabel) {
            zoomLabel.addEventListener('click', () => {
                console.log('Reset view clicked');
                this.resetView();
            });
        }
        
        // Tool buttons
        document.querySelectorAll('.sc-tool').forEach(tool => {
            tool.addEventListener('click', (e) => {
                console.log('Tool button clicked:', tool.className);
                this.onToolClick(e);
            });
        });
        
        // Delete key handler
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Delete' && this.selectedItem) {
                this.deleteSelectedItem();
            }
        });
        
        this.updateTransform();
        this.updateZoomLabel();
        this.renderItems();
        
        console.log('CanvasController setup complete');
    },
    
    onToolClick(e) {
        const tool = e.currentTarget;
        if (tool.classList.contains('sc-tool--shape')) {
            openShapeModal();
            return;
        }
        
        document.querySelectorAll('.sc-tool').forEach(t => t.classList.remove('is-active'));
        tool.classList.add('is-active');
        
        if (tool.classList.contains('sc-tool--select')) this.currentTool = 'select';
        else if (tool.classList.contains('sc-tool--text')) this.currentTool = 'text';
        else if (tool.classList.contains('sc-tool--note')) this.currentTool = 'note';
        else if (tool.classList.contains('sc-tool--highlight')) this.currentTool = 'highlight';
        
        console.log('Tool changed to:', this.currentTool);
    },
    
    onCanvasClick(e) {
        if (e.target.closest('.sc-toolbar') || e.target.closest('.sc-zoom-control')) return;
        if (e.target.closest('.sc-item')) return;
        if (e.target.closest('.sc-shape-modal') || e.target.closest('.sc-modal-overlay')) return;
        
        const rect = e.currentTarget.getBoundingClientRect();
        const x = (e.clientX - rect.left - this.panX) / this.zoom;
        const y = (e.clientY - rect.top - this.panY) / this.zoom;
        
        console.log('Canvas clicked, current tool:', this.currentTool, 'at position:', x, y);
        
        if (this.currentTool === 'text') this.addText(x, y);
        else if (this.currentTool === 'note') this.addNote(x, y);
        else if (this.currentTool === 'highlight') this.addHighlight(x, y);
    },
    
    onMouseDown(e) {
        if (e.target.closest('.sc-toolbar') || e.target.closest('.sc-zoom-control')) return;
        
        this.isDragging = true;
        this.startX = e.clientX - this.panX;
        this.startY = e.clientY - this.panY;
        
        const canvas = document.getElementById('scCanvas');
        if (canvas) canvas.style.cursor = 'grabbing';
    },
    
    onMouseMove(e) {
        if (this.isDraggingItem && this.draggedItem) {
            this.draggedItem.x = e.clientX / this.zoom - this.dragStartX;
            this.draggedItem.y = e.clientY / this.zoom - this.dragStartY;
            const el = document.querySelector(`[data-id="${this.draggedItem.id}"]`);
            if (el) {
                el.style.left = `${this.draggedItem.x}px`;
                el.style.top = `${this.draggedItem.y}px`;
            }
            return;
        }
        
        if (this.isResizing && this.resizedItem) {
            const dx = e.clientX / this.zoom - this.resizeStartX;
            const dy = e.clientY / this.zoom - this.resizeStartY;
            const item = this.resizedItem;
            const pos = this.resizePosition;
            
            if (pos.includes('e')) item.width = Math.max(50, this.resizeStartWidth + dx);
            if (pos.includes('w')) {
                const newWidth = Math.max(50, this.resizeStartWidth - dx);
                item.x = this.resizeStartLeft + (this.resizeStartWidth - newWidth);
                item.width = newWidth;
            }
            if (pos.includes('s')) item.height = Math.max(40, this.resizeStartHeight + dy);
            if (pos.includes('n')) {
                const newHeight = Math.max(40, this.resizeStartHeight - dy);
                item.y = this.resizeStartTop + (this.resizeStartHeight - newHeight);
                item.height = newHeight;
            }
            
            const el = document.querySelector(`[data-id="${item.id}"]`);
            if (el) {
                el.style.left = `${item.x}px`;
                el.style.top = `${item.y}px`;
                el.style.width = `${item.width}px`;
                el.style.height = `${item.height}px`;
            }
            return;
        }
        
        if (!this.isDragging) return;
        
        this.panX = e.clientX - this.startX;
        this.panY = e.clientY - this.startY;
        this.updateTransform();
    },
    
    onMouseUp() {
        if (this.isDraggingItem || this.isResizing) {
            this.saveToStorage();
        }
        
        this.isDragging = false;
        this.isDraggingItem = false;
        this.isResizing = false;
        this.draggedItem = null;
        this.resizedItem = null;
        
        const canvas = document.getElementById('scCanvas');
        if (canvas) canvas.style.cursor = 'grab';
    },
    
    onWheel(e) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        this.zoom = Math.max(0.5, Math.min(2, this.zoom * delta));
        this.updateTransform();
        this.updateZoomLabel();
    },
    
    zoomIn() {
        this.zoom = Math.min(2, this.zoom * 1.1);
        this.updateTransform();
        this.updateZoomLabel();
    },
    
    zoomOut() {
        this.zoom = Math.max(0.5, this.zoom * 0.9);
        this.updateTransform();
        this.updateZoomLabel();
    },
    
    resetView() {
        this.panX = 0;
        this.panY = 0;
        this.zoom = 1;
        this.updateTransform();
        this.updateZoomLabel();
    },
    
    updateTransform() {
        const canvas = document.getElementById('scCanvas');
        if (canvas) {
            canvas.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
        }
    },
    
    updateZoomLabel() {
        const label = document.querySelector('.sc-zoom-label');
        if (label) {
            label.textContent = `${Math.round(this.zoom * 100)}%`;
        }
    },
    
    addShape(shapeType, x, y) {
        console.log('Adding shape:', shapeType, 'at', x, y);
        const item = {
            id: this.nextId++,
            type: 'shape',
            shapeType: shapeType,
            x: x || 300,
            y: y || 200,
            width: 120,
            height: 80,
            text: '',
            bgColor: '#ffffff',
            borderColor: '#1e3a8a'
        };
        this.items.push(item);
        console.log('Shape added, total items:', this.items.length);
        this.renderItems();
        this.saveToStorage();
    },
    
    addText(x, y) {
        console.log('Adding text at', x, y);
        const item = {
            id: this.nextId++,
            type: 'text',
            x: x,
            y: y,
            width: 150,
            height: 40,
            text: 'Double click to edit',
            fontSize: 14,
            color: '#2D3748',
            bgColor: '#ffffff',
            borderColor: '#1e3a8a'
        };
        this.items.push(item);
        console.log('Text added, total items:', this.items.length);
        this.renderItems();
        this.saveToStorage();
    },
    
    addNote(x, y) {
        console.log('Adding note at', x, y);
        const item = {
            id: this.nextId++,
            type: 'note',
            x: x,
            y: y,
            width: 180,
            height: 120,
            text: 'Note...',
            bgColor: '#FFF8DC',
            borderColor: '#F0E68C'
        };
        this.items.push(item);
        console.log('Note added, total items:', this.items.length);
        this.renderItems();
        this.saveToStorage();
    },
    
    addHighlight(x, y) {
        console.log('Adding highlight at', x, y);
        const item = {
            id: this.nextId++,
            type: 'highlight',
            x: x,
            y: y,
            width: 200,
            height: 100,
            bgColor: 'rgba(255, 255, 0, 0.3)',
            borderColor: 'rgba(255, 255, 0, 0.5)'
        };
        this.items.push(item);
        console.log('Highlight added, total items:', this.items.length);
        this.renderItems();
        this.saveToStorage();
    },
    
    renderItems() {
        const canvas = document.getElementById('scCanvas');
        if (!canvas) return;
        
        canvas.querySelectorAll('.sc-item').forEach(el => el.remove());
        
        this.items.forEach(item => {
            const el = this.createItemElement(item);
            canvas.appendChild(el);
        });
    },
    
    createItemElement(item) {
        const el = document.createElement('div');
        el.className = `sc-item sc-${item.type}`;
        el.dataset.id = item.id;
        el.style.left = `${item.x}px`;
        el.style.top = `${item.y}px`;
        el.style.width = `${item.width}px`;
        el.style.height = `${item.height}px`;
        
        // Add toolbar
        const toolbar = this.createItemToolbar(item);
        el.appendChild(toolbar);
        
        if (item.type === 'shape') {
            el.classList.add(`shape-${item.shapeType}`);
            el.style.background = item.bgColor;
            el.style.borderColor = item.borderColor;
            
            const textEl = document.createElement('div');
            textEl.className = 'sc-shape-text';
            textEl.contentEditable = false;
            textEl.textContent = item.text;
            textEl.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                textEl.contentEditable = true;
                textEl.focus();
            });
            textEl.addEventListener('blur', () => {
                textEl.contentEditable = false;
                item.text = textEl.textContent;
                this.saveToStorage();
            });
            el.appendChild(textEl);
            
            ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].forEach(pos => {
                const handle = document.createElement('div');
                handle.className = `sc-resize-handle ${pos}`;
                handle.addEventListener('mousedown', (e) => this.onResizeStart(e, item, pos));
                el.appendChild(handle);
            });
        } else if (item.type === 'text' || item.type === 'note') {
            const textEl = document.createElement('div');
            textEl.contentEditable = true;
            textEl.textContent = item.text;
            textEl.style.width = '100%';
            textEl.style.height = '100%';
            textEl.style.outline = 'none';
            
            // Apply text styles
            if (item.textColor) textEl.style.color = item.textColor;
            if (item.fontFamily) textEl.style.fontFamily = item.fontFamily;
            if (item.fontSize) textEl.style.fontSize = item.fontSize + 'px';
            if (item.fontWeight) textEl.style.fontWeight = item.fontWeight;
            if (item.fontStyle) textEl.style.fontStyle = item.fontStyle;
            if (item.textDecoration) textEl.style.textDecoration = item.textDecoration;
            
            textEl.addEventListener('blur', () => {
                item.text = textEl.textContent;
                this.saveToStorage();
            });
            el.appendChild(textEl);
            
            if (item.type === 'note') {
                el.style.background = item.bgColor;
                el.style.borderColor = item.borderColor || '#F0E68C';
            } else {
                el.style.background = item.bgColor || '#ffffff';
                el.style.border = `2px solid ${item.borderColor || '#1e3a8a'}`;
            }
        } else if (item.type === 'highlight') {
            el.style.background = item.bgColor;
            el.style.borderColor = item.borderColor || 'rgba(255, 255, 0, 0.5)';
        }
        
        el.addEventListener('mousedown', (e) => this.onItemMouseDown(e, item));
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            this.selectItem(item);
        });
        el.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            if (item.type === 'shape' || item.type === 'note' || item.type === 'highlight') {
                this.showColorPicker(e, item);
            }
        });
        
        return el;
    },
    
    selectItem(item) {
        this.selectedItem = item;
        document.querySelectorAll('.sc-item').forEach(el => el.classList.remove('is-selected'));
        const el = document.querySelector(`[data-id="${item.id}"]`);
        if (el) el.classList.add('is-selected');
    },
    
    deleteSelectedItem() {
        if (!this.selectedItem) return;
        console.log('Deleting item:', this.selectedItem.id);
        this.items = this.items.filter(item => item.id !== this.selectedItem.id);
        this.selectedItem = null;
        this.renderItems();
        this.saveToStorage();
    },
    
    createItemToolbar(item) {
        const toolbar = document.createElement('div');
        toolbar.className = 'sc-item-toolbar';
        toolbar.innerHTML = `
            <button class="sc-toolbar-btn" onclick="CanvasController.changeBgColor(${item.id})" title="背景顏色">🎨</button>
            <button class="sc-toolbar-btn" onclick="CanvasController.changeBorderColor(${item.id})" title="邊框顏色">🖍️</button>
            <div class="sc-toolbar-separator"></div>
            <button class="sc-toolbar-btn" onclick="CanvasController.toggleTextOptions(${item.id})" title="文字選項">T</button>
        `;
        
        // Add text options panel
        const textOptions = document.createElement('div');
        textOptions.className = 'sc-text-options';
        textOptions.id = `text-options-${item.id}`;
        textOptions.innerHTML = `
            <button class="sc-toolbar-btn" onclick="CanvasController.changeTextColor(${item.id})" title="文字顏色">A</button>
            <select onchange="CanvasController.changeFontFamily(${item.id}, this.value)">
                <option value="Arial">Arial</option>
                <option value="Times New Roman">Times</option>
                <option value="Courier New">Courier</option>
                <option value="Georgia">Georgia</option>
                <option value="Verdana">Verdana</option>
            </select>
            <input type="number" value="14" min="8" max="72" style="width:50px" onchange="CanvasController.changeFontSize(${item.id}, this.value)" title="字體大小">
            <div class="sc-toolbar-separator"></div>
            <button class="sc-toolbar-btn" onclick="CanvasController.toggleBold(${item.id})" title="粗體">B</button>
            <button class="sc-toolbar-btn" onclick="CanvasController.toggleItalic(${item.id})" title="斜體"><i>I</i></button>
            <button class="sc-toolbar-btn" onclick="CanvasController.toggleUnderline(${item.id})" title="底線"><u>U</u></button>
            <button class="sc-toolbar-btn" onclick="CanvasController.toggleStrikethrough(${item.id})" title="刪除線"><s>S</s></button>
        `;
        toolbar.appendChild(textOptions);
        
        return toolbar;
    },
    
    changeBgColor(itemId) {
        const item = this.items.find(i => i.id === itemId);
        if (!item) return;
        const color = prompt('輸入背景顏色 (hex 或 rgba):', item.bgColor || '#ffffff');
        if (color) {
            item.bgColor = color;
            this.renderItems();
            this.saveToStorage();
        }
    },
    
    changeBorderColor(itemId) {
        const item = this.items.find(i => i.id === itemId);
        if (!item) return;
        const color = prompt('輸入邊框顏色 (hex 或 rgba):', item.borderColor || '#1e3a8a');
        if (color) {
            item.borderColor = color;
            this.renderItems();
            this.saveToStorage();
        }
    },
    
    toggleTextOptions(itemId) {
        const panel = document.getElementById(`text-options-${itemId}`);
        if (panel) {
            panel.classList.toggle('is-visible');
        }
    },
    
    changeTextColor(itemId) {
        const item = this.items.find(i => i.id === itemId);
        if (!item) return;
        const color = prompt('輸入文字顏色 (hex 或 rgba):', item.textColor || '#2D3748');
        if (color) {
            item.textColor = color;
            this.renderItems();
            this.saveToStorage();
        }
    },
    
    changeFontFamily(itemId, fontFamily) {
        const item = this.items.find(i => i.id === itemId);
        if (!item) return;
        item.fontFamily = fontFamily;
        this.renderItems();
        this.saveToStorage();
    },
    
    changeFontSize(itemId, fontSize) {
        const item = this.items.find(i => i.id === itemId);
        if (!item) return;
        item.fontSize = parseInt(fontSize);
        this.renderItems();
        this.saveToStorage();
    },
    
    toggleBold(itemId) {
        const item = this.items.find(i => i.id === itemId);
        if (!item) return;
        item.fontWeight = item.fontWeight === 'bold' ? 'normal' : 'bold';
        this.renderItems();
        this.saveToStorage();
    },
    
    toggleItalic(itemId) {
        const item = this.items.find(i => i.id === itemId);
        if (!item) return;
        item.fontStyle = item.fontStyle === 'italic' ? 'normal' : 'italic';
        this.renderItems();
        this.saveToStorage();
    },
    
    toggleUnderline(itemId) {
        const item = this.items.find(i => i.id === itemId);
        if (!item) return;
        item.textDecoration = item.textDecoration === 'underline' ? 'none' : 'underline';
        this.renderItems();
        this.saveToStorage();
    },
    
    toggleStrikethrough(itemId) {
        const item = this.items.find(i => i.id === itemId);
        if (!item) return;
        item.textDecoration = item.textDecoration === 'line-through' ? 'none' : 'line-through';
        this.renderItems();
        this.saveToStorage();
    },
    
    showTextOptions(itemId) {
        const item = this.items.find(i => i.id === itemId);
        if (!item) return;
        alert('文字選項功能開發中...');
    },
    
    onItemMouseDown(e, item) {
        if (e.target.classList.contains('sc-resize-handle')) return;
        if (e.target.contentEditable === 'true') return;
        if (e.target.closest('.sc-item-toolbar')) return;
        
        e.stopPropagation();
        this.selectItem(item);
        
        this.isDraggingItem = true;
        this.draggedItem = item;
        this.dragStartX = e.clientX / this.zoom - item.x;
        this.dragStartY = e.clientY / this.zoom - item.y;
    },
    
    onResizeStart(e, item, position) {
        e.stopPropagation();
        this.isResizing = true;
        this.resizedItem = item;
        this.resizePosition = position;
        this.resizeStartX = e.clientX / this.zoom;
        this.resizeStartY = e.clientY / this.zoom;
        this.resizeStartWidth = item.width;
        this.resizeStartHeight = item.height;
        this.resizeStartLeft = item.x;
        this.resizeStartTop = item.y;
    },
    
    showColorPicker(e, item) {
        const colors = ['#ffffff', '#FFF8DC', '#FFE4E1', '#E0F2F7', '#F0F4C3', '#D1C4E9'];
        const color = prompt('Enter color (hex or rgba):', item.bgColor);
        if (color) {
            item.bgColor = color;
            this.renderItems();
            this.saveToStorage();
        }
    },
    
    saveToStorage() {
        localStorage.setItem('supplychain-canvas', JSON.stringify({
            items: this.items,
            nextId: this.nextId
        }));
    },
    
    loadFromStorage() {
        const data = localStorage.getItem('supplychain-canvas');
        if (data) {
            const parsed = JSON.parse(data);
            this.items = parsed.items || [];
            this.nextId = parsed.nextId || 1;
        }
    }
};

// Shape Modal Functions
function openShapeModal() {
    console.log('Opening shape modal');
    const modal = document.getElementById('scShapeModal');
    const overlay = document.getElementById('scShapeOverlay');
    if (modal && overlay) {
        modal.classList.add('is-visible');
        overlay.classList.add('is-visible');
        console.log('Shape modal opened');
    } else {
        console.error('Modal elements not found');
    }
}

function closeShapeModal() {
    console.log('Closing shape modal');
    const modal = document.getElementById('scShapeModal');
    const overlay = document.getElementById('scShapeOverlay');
    if (modal && overlay) {
        modal.classList.remove('is-visible');
        overlay.classList.remove('is-visible');
        console.log('Shape modal closed');
    }
}

function selectShape(shapeType) {
    console.log('Selected shape:', shapeType);
    CanvasController.addShape(shapeType);
    closeShapeModal();
}

window.CanvasController = CanvasController;
window.openShapeModal = openShapeModal;
window.closeShapeModal = closeShapeModal;
window.selectShape = selectShape;

// Expose toolbar methods
CanvasController.changeBgColor = CanvasController.changeBgColor.bind(CanvasController);
CanvasController.changeBorderColor = CanvasController.changeBorderColor.bind(CanvasController);
CanvasController.toggleTextOptions = CanvasController.toggleTextOptions.bind(CanvasController);
CanvasController.changeTextColor = CanvasController.changeTextColor.bind(CanvasController);
CanvasController.changeFontFamily = CanvasController.changeFontFamily.bind(CanvasController);
CanvasController.changeFontSize = CanvasController.changeFontSize.bind(CanvasController);
CanvasController.toggleBold = CanvasController.toggleBold.bind(CanvasController);
CanvasController.toggleItalic = CanvasController.toggleItalic.bind(CanvasController);
CanvasController.toggleUnderline = CanvasController.toggleUnderline.bind(CanvasController);
CanvasController.toggleStrikethrough = CanvasController.toggleStrikethrough.bind(CanvasController);
