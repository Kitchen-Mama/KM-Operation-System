// Supply Chain Canvas Controller - Stage 1
const CanvasController = {
    panX: 0,
    panY: 0,
    zoom: 1,
    isDragging: false,
    isDraggingItem: false,
    isResizing: false,
    isDrawingArrow: false,
    startX: 0,
    startY: 0,
    items: [],
    arrows: [],
    selectedItem: null,
    selectedArrow: null,
    arrowStartItem: null,
    arrowStartAnchor: null,
    currentTool: 'select',
    nextId: 1,
    nextArrowId: 1,
    
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
        
        // Arrow style panel
        const arrowStyleBtn = document.getElementById('arrowStyleBtn');
        const arrowStylePanel = document.getElementById('arrowStylePanel');
        if (arrowStyleBtn && arrowStylePanel) {
            arrowStyleBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.selectedArrow) {
                    arrowStylePanel.classList.toggle('is-visible');
                }
            });
            
            // Stroke width buttons
            arrowStylePanel.querySelectorAll('.sc-stroke-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    if (!this.selectedArrow) return;
                    const width = parseInt(btn.dataset.width);
                    this.selectedArrow.strokeWidth = width;
                    this.renderArrows();
                    this.saveToStorage();
                    this.updateArrowStylePanel();
                });
            });
            
            // Line type buttons
            arrowStylePanel.querySelectorAll('.sc-line-type-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    if (!this.selectedArrow) return;
                    const type = btn.dataset.type;
                    this.selectedArrow.strokeDasharray = type === 'dashed' ? '4 4' : 'none';
                    this.renderArrows();
                    this.saveToStorage();
                    this.updateArrowStylePanel();
                });
            });
        }
        
        // Delete key handler
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Delete' || e.key === 'Backspace') {
                if (this.selectedItem) {
                    this.deleteSelectedItem();
                } else if (this.selectedArrow) {
                    this.deleteSelectedArrow();
                }
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
            // Update arrows connected to this item
            this.renderArrows();
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
        
        this.renderArrows();
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
            textEl.style.color = item.textColor || '#2D3748';
            textEl.style.fontFamily = item.fontFamily || 'Arial';
            textEl.style.fontSize = (item.fontSize || 14) + 'px';
            textEl.style.fontWeight = item.fontWeight || 'normal';
            textEl.style.fontStyle = item.fontStyle || 'normal';
            textEl.style.textDecoration = item.textDecoration || 'none';
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
            
            // Add arrow anchors
            ['top', 'bottom', 'left', 'right'].forEach(pos => {
                const anchor = document.createElement('div');
                anchor.className = `sc-arrow-anchor ${pos}`;
                // Add arrow icon based on position
                const arrows = { top: '↑', bottom: '↓', left: '←', right: '→' };
                anchor.textContent = arrows[pos];
                anchor.addEventListener('mousedown', (e) => this.onArrowAnchorClick(e, item, pos));
                el.appendChild(anchor);
            });
            
            // Add resize handles (only 4 corners)
            ['nw', 'ne', 'se', 'sw'].forEach(pos => {
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
            textEl.style.color = item.textColor || '#2D3748';
            textEl.style.fontFamily = item.fontFamily || 'Arial';
            textEl.style.fontSize = (item.fontSize || 14) + 'px';
            textEl.style.fontWeight = item.fontWeight || 'normal';
            textEl.style.fontStyle = item.fontStyle || 'normal';
            textEl.style.textDecoration = item.textDecoration || 'none';
            
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
        el.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            this.enableTextEditing(item, el);
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
        // Delete arrows connected to this item
        this.arrows = this.arrows.filter(arrow => 
            arrow.startItemId !== this.selectedItem.id && arrow.endItemId !== this.selectedItem.id
        );
        this.items = this.items.filter(item => item.id !== this.selectedItem.id);
        this.selectedItem = null;
        this.renderItems();
        this.renderArrows();
        this.saveToStorage();
    },
    
    deleteSelectedArrow() {
        if (!this.selectedArrow) return;
        console.log('Deleting arrow:', this.selectedArrow.id);
        this.arrows = this.arrows.filter(arrow => arrow.id !== this.selectedArrow.id);
        this.selectedArrow = null;
        const panel = document.getElementById('arrowStylePanel');
        if (panel) panel.classList.remove('is-visible');
        this.renderArrows();
        this.saveToStorage();
    },
    
    onArrowAnchorClick(e, item, anchor) {
        e.stopPropagation();
        e.preventDefault();
        console.log('Arrow anchor clicked:', item.id, anchor);
        this.isDrawingArrow = true;
        this.arrowStartItem = item;
        this.arrowStartAnchor = anchor;
        this.currentTool = 'arrow-drawing';
    },
    
    onCanvasClick(e) {
        if (e.target.closest('.sc-toolbar') || e.target.closest('.sc-zoom-control')) return;
        if (e.target.closest('.sc-shape-modal') || e.target.closest('.sc-modal-overlay')) return;
        if (e.target.closest('.sc-item-toolbar') || e.target.closest('.sc-arrow-anchor')) return;
        if (e.target.closest('.sc-arrow-style-panel') || e.target.closest('.sc-color-picker-panel')) return;
        if (e.target.closest('.sc-text-options')) return;
        
        // Handle arrow drawing
        if (this.isDrawingArrow) {
            const clickedItem = this.getItemAtPosition(e.clientX, e.clientY);
            if (clickedItem && clickedItem !== this.arrowStartItem) {
                this.createArrow(this.arrowStartItem, clickedItem);
            }
            this.isDrawingArrow = false;
            this.arrowStartItem = null;
            this.arrowStartAnchor = null;
            this.currentTool = 'select';
            this.renderArrows();
            return;
        }
        
        if (e.target.closest('.sc-item')) return;
        
        // Deselect when clicking on empty canvas
        this.selectedItem = null;
        this.selectedArrow = null;
        document.querySelectorAll('.sc-item').forEach(el => el.classList.remove('is-selected'));
        document.querySelectorAll('.sc-arrow-line').forEach(el => el.classList.remove('is-selected'));
        const arrowPanel = document.getElementById('arrowStylePanel');
        if (arrowPanel) arrowPanel.classList.remove('is-visible');
        document.querySelectorAll('.sc-text-options').forEach(panel => panel.classList.remove('is-visible'));
        document.querySelectorAll('.sc-color-picker-panel').forEach(panel => panel.classList.remove('is-visible'));
        document.querySelectorAll('.sc-arrow-style-panel').forEach(panel => panel.classList.remove('is-visible'));
        
        const rect = e.currentTarget.getBoundingClientRect();
        const x = (e.clientX - rect.left - this.panX) / this.zoom;
        const y = (e.clientY - rect.top - this.panY) / this.zoom;
        
        console.log('Canvas clicked, current tool:', this.currentTool, 'at position:', x, y);
        
        if (this.currentTool === 'text') this.addText(x, y);
        else if (this.currentTool === 'note') this.addNote(x, y);
        else if (this.currentTool === 'highlight') this.addHighlight(x, y);
    },
    
    getItemAtPosition(clientX, clientY) {
        const elements = document.elementsFromPoint(clientX, clientY);
        for (let el of elements) {
            if (el.classList.contains('sc-item')) {
                const id = parseInt(el.dataset.id);
                return this.items.find(item => item.id === id);
            }
        }
        return null;
    },
    
    createArrow(startItem, endItem) {
        const arrow = {
            id: this.nextArrowId++,
            startItemId: startItem.id,
            endItemId: endItem.id,
            strokeWidth: 2,
            strokeDasharray: 'none'
        };
        this.arrows.push(arrow);
        console.log('Arrow created:', arrow);
        this.saveToStorage();
    },
    
    renderArrows() {
        const canvas = document.getElementById('scCanvas');
        if (!canvas) return;
        
        // Remove existing arrows
        canvas.querySelectorAll('.sc-arrow-line').forEach(el => el.remove());
        
        this.arrows.forEach(arrow => {
            const startItem = this.items.find(i => i.id === arrow.startItemId);
            const endItem = this.items.find(i => i.id === arrow.endItemId);
            if (!startItem || !endItem) return;
            
            const svg = this.createArrowSVG(arrow, startItem, endItem);
            canvas.appendChild(svg);
        });
    },
    
    createArrowSVG(arrow, startItem, endItem) {
        const startCenter = { x: startItem.x + startItem.width / 2, y: startItem.y + startItem.height / 2 };
        const endCenter = { x: endItem.x + endItem.width / 2, y: endItem.y + endItem.height / 2 };
        
        // Calculate edge points
        const startPoint = this.getEdgePoint(startItem, endCenter);
        const endPoint = this.getEdgePoint(endItem, startCenter);
        
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.classList.add('sc-arrow-line');
        svg.dataset.arrowId = arrow.id;
        svg.style.position = 'absolute';
        svg.style.left = '0';
        svg.style.top = '0';
        svg.style.width = '100%';
        svg.style.height = '100%';
        svg.style.pointerEvents = 'none';
        
        const pathType = arrow.pathType || 'straight';
        let pathElement;
        
        if (pathType === 'curved') {
            // Curved path
            pathElement = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            const dx = endPoint.x - startPoint.x;
            const dy = endPoint.y - startPoint.y;
            const curve = Math.abs(dx) * 0.5;
            const pathData = `M ${startPoint.x} ${startPoint.y} C ${startPoint.x + curve} ${startPoint.y}, ${endPoint.x - curve} ${endPoint.y}, ${endPoint.x} ${endPoint.y}`;
            pathElement.setAttribute('d', pathData);
            pathElement.setAttribute('fill', 'none');
        } else if (pathType === 'orthogonal') {
            // Orthogonal (right-angle) path
            pathElement = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            const midX = (startPoint.x + endPoint.x) / 2;
            const pathData = `M ${startPoint.x} ${startPoint.y} L ${midX} ${startPoint.y} L ${midX} ${endPoint.y} L ${endPoint.x} ${endPoint.y}`;
            pathElement.setAttribute('d', pathData);
            pathElement.setAttribute('fill', 'none');
        } else {
            // Straight line (default)
            pathElement = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            pathElement.setAttribute('x1', startPoint.x);
            pathElement.setAttribute('y1', startPoint.y);
            pathElement.setAttribute('x2', endPoint.x);
            pathElement.setAttribute('y2', endPoint.y);
        }
        
        pathElement.setAttribute('stroke', arrow.color || '#1e3a8a');
        pathElement.setAttribute('stroke-width', arrow.strokeWidth);
        if (arrow.strokeDasharray !== 'none') {
            pathElement.setAttribute('stroke-dasharray', arrow.strokeDasharray);
        }
        pathElement.setAttribute('marker-end', 'url(#arrowhead)');
        pathElement.style.pointerEvents = 'stroke';
        
        // Add arrowhead marker
        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
        marker.setAttribute('id', 'arrowhead');
        marker.setAttribute('markerWidth', '10');
        marker.setAttribute('markerHeight', '10');
        marker.setAttribute('refX', '9');
        marker.setAttribute('refY', '3');
        marker.setAttribute('orient', 'auto');
        const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        polygon.setAttribute('points', '0 0, 10 3, 0 6');
        polygon.setAttribute('fill', arrow.color || '#1e3a8a');
        marker.appendChild(polygon);
        defs.appendChild(marker);
        
        svg.appendChild(defs);
        svg.appendChild(pathElement);
        
        svg.addEventListener('click', (e) => {
            e.stopPropagation();
            this.selectArrow(arrow);
        });
        
        return svg;
    },
    
    getEdgePoint(item, targetPoint) {
        const centerX = item.x + item.width / 2;
        const centerY = item.y + item.height / 2;
        const dx = targetPoint.x - centerX;
        const dy = targetPoint.y - centerY;
        
        const angle = Math.atan2(dy, dx);
        const absAngle = Math.abs(angle);
        
        let edgeX, edgeY;
        
        if (absAngle < Math.PI / 4) {
            // Right edge
            edgeX = item.x + item.width;
            edgeY = centerY + (item.width / 2) * Math.tan(angle);
        } else if (absAngle > 3 * Math.PI / 4) {
            // Left edge
            edgeX = item.x;
            edgeY = centerY - (item.width / 2) * Math.tan(angle);
        } else if (angle > 0) {
            // Bottom edge
            edgeY = item.y + item.height;
            edgeX = centerX + (item.height / 2) / Math.tan(angle);
        } else {
            // Top edge
            edgeY = item.y;
            edgeX = centerX - (item.height / 2) / Math.tan(angle);
        }
        
        return { x: edgeX, y: edgeY };
    },
    
    selectArrow(arrow) {
        this.selectedArrow = arrow;
        this.selectedItem = null;
        document.querySelectorAll('.sc-item').forEach(el => el.classList.remove('is-selected'));
        document.querySelectorAll('.sc-arrow-line').forEach(el => el.classList.remove('is-selected'));
        const arrowEl = document.querySelector(`[data-arrow-id="${arrow.id}"]`);
        if (arrowEl) arrowEl.classList.add('is-selected');
        this.updateArrowStylePanel();
        console.log('Arrow selected:', arrow.id);
    },
    
    updateArrowStylePanel() {
        if (!this.selectedArrow) return;
        
        // Update stroke width buttons
        document.querySelectorAll('.sc-stroke-btn').forEach(btn => {
            btn.classList.remove('active');
            if (parseInt(btn.dataset.width) === this.selectedArrow.strokeWidth) {
                btn.classList.add('active');
            }
        });
        
        // Update line type buttons
        document.querySelectorAll('.sc-line-type-btn').forEach(btn => {
            btn.classList.remove('active');
            const isDashed = this.selectedArrow.strokeDasharray !== 'none';
            if ((btn.dataset.type === 'dashed' && isDashed) || (btn.dataset.type === 'solid' && !isDashed)) {
                btn.classList.add('active');
            }
        });
    },
    
    createItemToolbar(item) {
        const toolbar = document.createElement('div');
        toolbar.className = 'sc-item-toolbar';
        toolbar.innerHTML = `
            <button class="sc-toolbar-btn" onclick="CanvasController.toggleColorPicker(${item.id}, 'bg', event)" title="背景顏色">🎨</button>
            <button class="sc-toolbar-btn" onclick="CanvasController.toggleColorPicker(${item.id}, 'border', event)" title="邊框顏色">🖍️</button>
            <button class="sc-toolbar-btn" onclick="CanvasController.toggleArrowPanel(${item.id}, event)" title="箭頭樣式">→</button>
            <div class="sc-toolbar-separator"></div>
            <button class="sc-toolbar-btn" onclick="CanvasController.toggleTextOptions(${item.id})" title="文字選項">T</button>
        `;
        
        // Add color picker panel
        const colorPanel = this.createColorPickerPanel(item.id);
        toolbar.appendChild(colorPanel);
        
        // Add arrow style panel
        const arrowPanel = this.createArrowStylePanel(item.id);
        toolbar.appendChild(arrowPanel);
        
        // Add text options panel
        const textOptions = document.createElement('div');
        textOptions.className = 'sc-text-options';
        textOptions.id = `text-options-${item.id}`;
        textOptions.innerHTML = `
            <button class="sc-toolbar-btn" onclick="CanvasController.toggleColorPicker(${item.id}, 'text', event)" title="文字顏色">A</button>
            <select onchange="CanvasController.changeFontFamily(${item.id}, this.value)" value="${item.fontFamily || 'Arial'}">
                <option value="Arial" ${(item.fontFamily || 'Arial') === 'Arial' ? 'selected' : ''}>Arial</option>
                <option value="Times New Roman" ${item.fontFamily === 'Times New Roman' ? 'selected' : ''}>Times</option>
                <option value="Courier New" ${item.fontFamily === 'Courier New' ? 'selected' : ''}>Courier</option>
                <option value="Georgia" ${item.fontFamily === 'Georgia' ? 'selected' : ''}>Georgia</option>
                <option value="Verdana" ${item.fontFamily === 'Verdana' ? 'selected' : ''}>Verdana</option>
            </select>
            <input type="number" value="${item.fontSize || 14}" min="8" max="72" style="width:50px" onchange="CanvasController.changeFontSize(${item.id}, this.value)" title="字體大小">
            <div class="sc-toolbar-separator"></div>
            <button class="sc-toolbar-btn ${item.fontWeight === 'bold' ? 'active' : ''}" onclick="CanvasController.toggleBold(${item.id})" title="粗體"><b>B</b></button>
            <button class="sc-toolbar-btn ${item.fontStyle === 'italic' ? 'active' : ''}" onclick="CanvasController.toggleItalic(${item.id})" title="斜體"><i>I</i></button>
            <button class="sc-toolbar-btn ${item.textDecoration === 'underline' ? 'active' : ''}" onclick="CanvasController.toggleUnderline(${item.id})" title="底線"><u>U</u></button>
            <button class="sc-toolbar-btn ${item.textDecoration === 'line-through' ? 'active' : ''}" onclick="CanvasController.toggleStrikethrough(${item.id})" title="刪除線"><s>S</s></button>
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
    
    showColorPicker(itemId, colorType) {
        this.currentColorTarget = { itemId, colorType };
        const item = this.items.find(i => i.id === itemId);
        if (!item) return;
        
        // Get or create color picker panel
        let panel = document.getElementById('colorPickerPanel');
        if (!panel) {
            panel = this.createColorPickerPanel();
            document.getElementById('scCanvas').appendChild(panel);
        }
        
        // Position panel near the item
        const itemEl = document.querySelector(`[data-id="${itemId}"]`);
        if (itemEl) {
            const rect = itemEl.getBoundingClientRect();
            const canvasRect = document.getElementById('scCanvas').getBoundingClientRect();
            panel.style.position = 'absolute';
            panel.style.left = (rect.right - canvasRect.left + 8) + 'px';
            panel.style.top = (rect.top - canvasRect.top) + 'px';
        }
        
        panel.classList.add('is-visible');
        
        // Set current opacity
        const currentColor = colorType === 'bg' ? item.bgColor : 
                           colorType === 'border' ? item.borderColor : item.textColor;
        this.updateOpacitySlider(currentColor || '#000000');
    },
    
    toggleColorPicker(itemId, colorType, event) {
        if (event) event.stopPropagation();
        
        this.currentColorTarget = { itemId, colorType };
        const panel = document.getElementById(`color-picker-${itemId}`);
        
        if (panel) {
            const isCurrentlyVisible = panel.classList.contains('is-visible');
            
            // Close all other color pickers
            document.querySelectorAll('.sc-color-picker-panel').forEach(p => {
                p.classList.remove('is-visible');
            });
            
            // Toggle current panel
            if (!isCurrentlyVisible) {
                panel.classList.add('is-visible');
                
                const item = this.items.find(i => i.id === itemId);
                if (item) {
                    const currentColor = colorType === 'bg' ? item.bgColor : 
                                       colorType === 'border' ? item.borderColor : item.textColor;
                    
                    // Extract base color and opacity
                    let baseColor = currentColor || '#000000';
                    let opacity = 1;
                    
                    if (currentColor && currentColor.startsWith('rgba')) {
                        const match = currentColor.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([^)]+)\)/);
                        if (match) {
                            baseColor = `#${parseInt(match[1]).toString(16).padStart(2, '0')}${parseInt(match[2]).toString(16).padStart(2, '0')}${parseInt(match[3]).toString(16).padStart(2, '0')}`;
                            opacity = parseFloat(match[4]);
                        }
                    }
                    
                    if (!this.itemBaseColor) this.itemBaseColor = {};
                    this.itemBaseColor[itemId] = baseColor;
                    
                    this.updateOpacitySlider(baseColor, itemId, opacity);
                    this.updateOpacitySliderGradient(baseColor, itemId);
                }
            }
        }
    },
    
    createColorPickerPanel(itemId) {
        const panel = document.createElement('div');
        panel.id = `color-picker-${itemId}`;
        panel.className = 'sc-color-picker-panel';
        
        // Opacity control
        const opacityHTML = `
            <div class="sc-opacity-control">
                <span class="sc-opacity-label">Opacity</span>
                <span class="sc-opacity-value" id="opacityValue-${itemId}">100%</span>
                <div class="sc-opacity-slider" id="opacitySlider-${itemId}">
                    <div class="sc-opacity-handle" id="opacityHandle-${itemId}" style="left: 100%;"></div>
                </div>
            </div>
        `;
        
        // 14 preset colors + transparent + add button = 16 total
        const colors = [
            'transparent',
            '#000000', '#FFFFFF', '#808080', '#FF0000',
            '#FF6B35', '#FFA500', '#FFFF00', '#00FF00',
            '#00FFFF', '#0000FF', '#800080', '#FFC0CB',
            '#A52A2A', '#FFF8DC'
        ];
        
        const swatchesHTML = `
            <div class="sc-color-swatches">
                ${colors.map(color => `
                    <div class="sc-color-swatch ${color === 'transparent' ? 'transparent' : ''}" 
                         style="${color !== 'transparent' ? 'background-color: ' + color : ''}" 
                         data-color="${color}"
                         onclick="CanvasController.applyColor('${color}', ${itemId})"></div>
                `).join('')}
                <div class="sc-color-swatch add-color" onclick="CanvasController.openCustomColorPicker(${itemId})">+</div>
            </div>
        `;
        
        panel.innerHTML = opacityHTML + swatchesHTML;
        
        // Setup opacity slider after a short delay
        setTimeout(() => this.setupOpacitySlider(itemId), 0);
        
        return panel;
    },
    
    setupOpacitySlider(itemId) {
        const slider = document.getElementById(`opacitySlider-${itemId}`);
        const handle = document.getElementById(`opacityHandle-${itemId}`);
        if (!slider || !handle) return;
        
        let isDragging = false;
        
        const updateOpacity = (e) => {
            const rect = slider.getBoundingClientRect();
            let x = e.clientX - rect.left;
            x = Math.max(0, Math.min(x, rect.width));
            const percent = (x / rect.width) * 100;
            
            handle.style.left = percent + '%';
            document.getElementById(`opacityValue-${itemId}`).textContent = Math.round(percent) + '%';
            
            if (!this.itemOpacity) this.itemOpacity = {};
            this.itemOpacity[itemId] = percent / 100;
            
            // Apply opacity change to current color
            if (this.currentColorTarget && this.itemBaseColor && this.itemBaseColor[itemId]) {
                const baseColor = this.itemBaseColor[itemId];
                const opacity = percent / 100;
                const { colorType } = this.currentColorTarget;
                const item = this.items.find(i => i.id === itemId);
                
                if (item && baseColor !== 'transparent') {
                    let finalColor = baseColor;
                    if (opacity < 1 && baseColor.startsWith('#')) {
                        const r = parseInt(baseColor.slice(1, 3), 16);
                        const g = parseInt(baseColor.slice(3, 5), 16);
                        const b = parseInt(baseColor.slice(5, 7), 16);
                        finalColor = `rgba(${r}, ${g}, ${b}, ${opacity})`;
                    }
                    
                    if (colorType === 'bg') item.bgColor = finalColor;
                    else if (colorType === 'border') item.borderColor = finalColor;
                    else if (colorType === 'text') item.textColor = finalColor;
                    
                    // Update item directly without full re-render
                    const el = document.querySelector(`[data-id="${itemId}"]`);
                    if (el) {
                        if (colorType === 'bg') el.style.background = finalColor;
                        else if (colorType === 'border') el.style.borderColor = finalColor;
                        else if (colorType === 'text') {
                            const textEl = el.querySelector('[contenteditable], .sc-shape-text');
                            if (textEl) textEl.style.color = finalColor;
                        }
                    }
                }
            }
        };
        
        handle.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            isDragging = true;
        });
        
        slider.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            updateOpacity(e);
            isDragging = true;
        });
        
        document.addEventListener('mousemove', (e) => {
            if (isDragging) updateOpacity(e);
        });
        
        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                this.saveToStorage();
            }
        });
    },
    
    updateOpacitySliderGradient(color, itemId) {
        const slider = document.getElementById(`opacitySlider-${itemId}`);
        if (!slider || color === 'transparent') return;
        
        if (color.startsWith('#')) {
            const r = parseInt(color.slice(1, 3), 16);
            const g = parseInt(color.slice(3, 5), 16);
            const b = parseInt(color.slice(5, 7), 16);
            slider.style.background = `linear-gradient(to right, rgba(${r}, ${g}, ${b}, 0), rgba(${r}, ${g}, ${b}, 1))`;
        }
    },
    
    updateOpacitySlider(color, itemId, opacity) {
        // Use provided opacity or extract from color
        if (opacity === undefined) {
            opacity = 1;
            if (color.startsWith('rgba')) {
                const match = color.match(/rgba\([^,]+,[^,]+,[^,]+,([^)]+)\)/);
                if (match) opacity = parseFloat(match[1]);
            } else if (color === 'transparent') {
                opacity = 0;
            }
        }
        
        const percent = opacity * 100;
        const handle = document.getElementById(`opacityHandle-${itemId}`);
        const value = document.getElementById(`opacityValue-${itemId}`);
        if (handle) handle.style.left = percent + '%';
        if (value) value.textContent = Math.round(percent) + '%';
        
        if (!this.itemOpacity) this.itemOpacity = {};
        this.itemOpacity[itemId] = opacity;
    },
    
    applyColor(color, itemId) {
        if (!this.currentColorTarget) return;
        
        const { colorType } = this.currentColorTarget;
        const item = this.items.find(i => i.id === itemId);
        if (!item) return;
        
        // Store the base color for this item
        if (!this.itemBaseColor) this.itemBaseColor = {};
        this.itemBaseColor[itemId] = color;
        
        // Get opacity for this item
        const opacity = this.itemOpacity && this.itemOpacity[itemId] !== undefined ? this.itemOpacity[itemId] : 1;
        
        // Apply opacity
        let finalColor = color;
        if (color !== 'transparent' && opacity < 1) {
            // Convert hex to rgba
            if (color.startsWith('#')) {
                const r = parseInt(color.slice(1, 3), 16);
                const g = parseInt(color.slice(3, 5), 16);
                const b = parseInt(color.slice(5, 7), 16);
                finalColor = `rgba(${r}, ${g}, ${b}, ${opacity})`;
            }
        }
        
        if (colorType === 'bg') item.bgColor = finalColor;
        else if (colorType === 'border') item.borderColor = finalColor;
        else if (colorType === 'text') item.textColor = finalColor;
        
        // Update opacity slider gradient to match selected color
        this.updateOpacitySliderGradient(color, itemId);
        
        // Update item directly without full re-render
        const el = document.querySelector(`[data-id="${itemId}"]`);
        if (el) {
            if (colorType === 'bg') el.style.background = finalColor;
            else if (colorType === 'border') el.style.borderColor = finalColor;
            else if (colorType === 'text') {
                const textEl = el.querySelector('[contenteditable], .sc-shape-text');
                if (textEl) textEl.style.color = finalColor;
            }
        }
        
        this.saveToStorage();
    },
    
    openCustomColorPicker(itemId) {
        const color = prompt('輸入自訂顏色 (hex):', '#000000');
        if (color) {
            this.applyColor(color, itemId);
        }
    },
    
    enableTextEditing(item, element) {
        console.log('Enabling text editing for item:', item.id);
        
        let textEl;
        if (item.type === 'shape') {
            textEl = element.querySelector('.sc-shape-text');
        } else if (item.type === 'text' || item.type === 'note') {
            textEl = element.querySelector('div[contenteditable]');
        }
        
        if (!textEl) return;
        
        // Store original text for ESC cancel
        const originalText = textEl.textContent;
        
        // Enable editing
        textEl.contentEditable = true;
        textEl.focus();
        
        // Select all text
        const range = document.createRange();
        range.selectNodeContents(textEl);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        
        // Handle Enter key
        const handleKeyDown = (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                textEl.blur();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                textEl.textContent = originalText;
                textEl.blur();
            }
        };
        
        // Handle blur
        const handleBlur = () => {
            textEl.removeEventListener('keydown', handleKeyDown);
            textEl.removeEventListener('blur', handleBlur);
            item.text = textEl.textContent;
            this.saveToStorage();
        };
        
        textEl.addEventListener('keydown', handleKeyDown);
        textEl.addEventListener('blur', handleBlur);
    },
    
    toggleTextOptions(itemId) {
        const panel = document.getElementById(`text-options-${itemId}`);
        if (panel) {
            panel.classList.toggle('is-visible');
        }
    },
    
    toggleArrowPanel(itemId, event) {
        if (event) event.stopPropagation();
        const panel = document.getElementById(`arrow-panel-${itemId}`);
        if (panel) {
            panel.classList.toggle('is-visible');
        }
    },
    
    createArrowStylePanel(itemId) {
        const panel = document.createElement('div');
        panel.id = `arrow-panel-${itemId}`;
        panel.className = 'sc-arrow-style-panel';
        
        // Stroke width slider
        const widthHTML = `
            <div class="sc-arrow-width-control">
                <span class="sc-arrow-width-label">粗細</span>
                <span class="sc-arrow-width-value" id="arrowWidthValue-${itemId}">2px</span>
                <div class="sc-arrow-width-slider" id="arrowWidthSlider-${itemId}">
                    <div class="sc-arrow-width-handle" id="arrowWidthHandle-${itemId}" style="left: 25%;"></div>
                </div>
            </div>
        `;
        
        // Color swatches
        const colors = [
            '#000000', '#1e3a8a', '#FF6B35', '#FF0000',
            '#FFA500', '#FFFF00', '#00FF00', '#00FFFF',
            '#0000FF', '#800080', '#FFC0CB', '#A52A2A',
            '#808080', '#FFFFFF'
        ];
        
        const swatchesHTML = `
            <div class="sc-arrow-color-swatches">
                ${colors.map(color => `
                    <div class="sc-color-swatch" 
                         style="background-color: ${color}; ${color === '#FFFFFF' ? 'border: 1px solid #ddd;' : ''}" 
                         data-color="${color}"
                         onclick="CanvasController.applyArrowColor('${color}', ${itemId})"></div>
                `).join('')}
            </div>
        `;
        
        // Line path type buttons
        const pathTypeHTML = `
            <div class="sc-line-path-options">
                <button class="sc-line-path-btn active" onclick="CanvasController.changeArrowPath(${itemId}, 'straight')" data-path="straight" id="path-straight-${itemId}">直線</button>
                <button class="sc-line-path-btn" onclick="CanvasController.changeArrowPath(${itemId}, 'curved')" data-path="curved" id="path-curved-${itemId}">曲線</button>
                <button class="sc-line-path-btn" onclick="CanvasController.changeArrowPath(${itemId}, 'orthogonal')" data-path="orthogonal" id="path-orthogonal-${itemId}">直角線</button>
            </div>
        `;
        
        // Line type buttons (solid/dashed)
        const lineTypeHTML = `
            <div class="sc-line-type-options">
                <button class="sc-line-type-btn active" onclick="CanvasController.changeArrowType(${itemId}, 'solid')" data-type="solid" id="type-solid-${itemId}">實線</button>
                <button class="sc-line-type-btn" onclick="CanvasController.changeArrowType(${itemId}, 'dashed')" data-type="dashed" id="type-dashed-${itemId}">虛線</button>
            </div>
        `;
        
        panel.innerHTML = widthHTML + swatchesHTML + pathTypeHTML + lineTypeHTML;
        
        // Setup width slider after a short delay
        setTimeout(() => this.setupArrowWidthSlider(itemId), 0);
        
        return panel;
    },
    
    setupArrowWidthSlider(itemId) {
        const slider = document.getElementById(`arrowWidthSlider-${itemId}`);
        const handle = document.getElementById(`arrowWidthHandle-${itemId}`);
        if (!slider || !handle) return;
        
        let isDragging = false;
        
        const updateWidth = (e) => {
            const rect = slider.getBoundingClientRect();
            let x = e.clientX - rect.left;
            x = Math.max(0, Math.min(x, rect.width));
            const percent = (x / rect.width) * 100;
            
            // Map 0-100% to 1-8px
            const width = Math.round(1 + (percent / 100) * 7);
            
            handle.style.left = percent + '%';
            document.getElementById(`arrowWidthValue-${itemId}`).textContent = width + 'px';
            
            // Apply width to connected arrows
            const connectedArrows = this.arrows.filter(arrow => 
                arrow.startItemId === itemId || arrow.endItemId === itemId
            );
            connectedArrows.forEach(arrow => {
                arrow.strokeWidth = width;
            });
            this.renderArrows();
        };
        
        handle.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            isDragging = true;
        });
        
        slider.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            updateWidth(e);
            isDragging = true;
        });
        
        document.addEventListener('mousemove', (e) => {
            if (isDragging) updateWidth(e);
        });
        
        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                this.saveToStorage();
            }
        });
    },
    
    applyArrowColor(color, itemId) {
        const connectedArrows = this.arrows.filter(arrow => 
            arrow.startItemId === itemId || arrow.endItemId === itemId
        );
        connectedArrows.forEach(arrow => {
            arrow.color = color;
        });
        this.renderArrows();
        this.saveToStorage();
    },
    
    changeArrowType(itemId, type) {
        // Find arrows connected to this item
        const connectedArrows = this.arrows.filter(arrow => 
            arrow.startItemId === itemId || arrow.endItemId === itemId
        );
        connectedArrows.forEach(arrow => {
            arrow.strokeDasharray = type === 'dashed' ? '4 4' : 'none';
        });
        
        // Update button states
        const solidBtn = document.getElementById(`type-solid-${itemId}`);
        const dashedBtn = document.getElementById(`type-dashed-${itemId}`);
        if (solidBtn && dashedBtn) {
            solidBtn.classList.toggle('active', type === 'solid');
            dashedBtn.classList.toggle('active', type === 'dashed');
        }
        
        this.renderArrows();
        this.saveToStorage();
    },
    
    changeArrowPath(itemId, pathType) {
        // Find arrows connected to this item
        const connectedArrows = this.arrows.filter(arrow => 
            arrow.startItemId === itemId || arrow.endItemId === itemId
        );
        connectedArrows.forEach(arrow => {
            arrow.pathType = pathType;
        });
        
        // Update button states
        const straightBtn = document.getElementById(`path-straight-${itemId}`);
        const curvedBtn = document.getElementById(`path-curved-${itemId}`);
        const orthogonalBtn = document.getElementById(`path-orthogonal-${itemId}`);
        if (straightBtn && curvedBtn && orthogonalBtn) {
            straightBtn.classList.toggle('active', pathType === 'straight');
            curvedBtn.classList.toggle('active', pathType === 'curved');
            orthogonalBtn.classList.toggle('active', pathType === 'orthogonal');
        }
        
        this.renderArrows();
        this.saveToStorage();
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
        const el = document.querySelector(`[data-id="${itemId}"]`);
        const textEl = el?.querySelector('[contenteditable], .sc-shape-text');
        if (textEl) textEl.style.fontFamily = fontFamily;
        this.saveToStorage();
    },
    
    changeFontSize(itemId, fontSize) {
        const item = this.items.find(i => i.id === itemId);
        if (!item) return;
        item.fontSize = parseInt(fontSize);
        const el = document.querySelector(`[data-id="${itemId}"]`);
        const textEl = el?.querySelector('[contenteditable], .sc-shape-text');
        if (textEl) textEl.style.fontSize = fontSize + 'px';
        this.saveToStorage();
    },
    
    toggleBold(itemId) {
        const item = this.items.find(i => i.id === itemId);
        if (!item) return;
        item.fontWeight = item.fontWeight === 'bold' ? 'normal' : 'bold';
        const el = document.querySelector(`[data-id="${itemId}"]`);
        const textEl = el?.querySelector('[contenteditable], .sc-shape-text');
        if (textEl) textEl.style.fontWeight = item.fontWeight;
        const btn = el?.querySelector('.sc-text-options button[onclick*="toggleBold"]');
        if (btn) btn.classList.toggle('active', item.fontWeight === 'bold');
        this.saveToStorage();
    },
    
    toggleItalic(itemId) {
        const item = this.items.find(i => i.id === itemId);
        if (!item) return;
        item.fontStyle = item.fontStyle === 'italic' ? 'normal' : 'italic';
        const el = document.querySelector(`[data-id="${itemId}"]`);
        const textEl = el?.querySelector('[contenteditable], .sc-shape-text');
        if (textEl) textEl.style.fontStyle = item.fontStyle;
        const btn = el?.querySelector('.sc-text-options button[onclick*="toggleItalic"]');
        if (btn) btn.classList.toggle('active', item.fontStyle === 'italic');
        this.saveToStorage();
    },
    
    toggleUnderline(itemId) {
        const item = this.items.find(i => i.id === itemId);
        if (!item) return;
        const newDecoration = item.textDecoration === 'underline' ? 'none' : 'underline';
        item.textDecoration = newDecoration;
        const el = document.querySelector(`[data-id="${itemId}"]`);
        const textEl = el?.querySelector('[contenteditable], .sc-shape-text');
        if (textEl) textEl.style.textDecoration = newDecoration;
        const btn = el?.querySelector('.sc-text-options button[onclick*="toggleUnderline"]');
        if (btn) btn.classList.toggle('active', newDecoration === 'underline');
        this.saveToStorage();
    },
    
    toggleStrikethrough(itemId) {
        const item = this.items.find(i => i.id === itemId);
        if (!item) return;
        const newDecoration = item.textDecoration === 'line-through' ? 'none' : 'line-through';
        item.textDecoration = newDecoration;
        const el = document.querySelector(`[data-id="${itemId}"]`);
        const textEl = el?.querySelector('[contenteditable], .sc-shape-text');
        if (textEl) textEl.style.textDecoration = newDecoration;
        const btn = el?.querySelector('.sc-text-options button[onclick*="toggleStrikethrough"]');
        if (btn) btn.classList.toggle('active', newDecoration === 'line-through');
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
        if (e.target.closest('.sc-text-options')) return;
        if (e.target.closest('.sc-color-picker-panel')) return;
        
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
            arrows: this.arrows,
            nextId: this.nextId,
            nextArrowId: this.nextArrowId
        }));
    },
    
    loadFromStorage() {
        const data = localStorage.getItem('supplychain-canvas');
        if (data) {
            const parsed = JSON.parse(data);
            this.items = parsed.items || [];
            this.arrows = parsed.arrows || [];
            this.nextId = parsed.nextId || 1;
            this.nextArrowId = parsed.nextArrowId || 1;
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
CanvasController.showColorPicker = CanvasController.showColorPicker.bind(CanvasController);
CanvasController.toggleColorPicker = CanvasController.toggleColorPicker.bind(CanvasController);
CanvasController.applyColor = CanvasController.applyColor.bind(CanvasController);
CanvasController.openCustomColorPicker = CanvasController.openCustomColorPicker.bind(CanvasController);
CanvasController.toggleTextOptions = CanvasController.toggleTextOptions.bind(CanvasController);
CanvasController.toggleArrowPanel = CanvasController.toggleArrowPanel.bind(CanvasController);
CanvasController.applyArrowColor = CanvasController.applyArrowColor.bind(CanvasController);
CanvasController.changeArrowType = CanvasController.changeArrowType.bind(CanvasController);
CanvasController.changeArrowPath = CanvasController.changeArrowPath.bind(CanvasController);
CanvasController.changeTextColor = CanvasController.changeTextColor.bind(CanvasController);
CanvasController.changeFontFamily = CanvasController.changeFontFamily.bind(CanvasController);
CanvasController.changeFontSize = CanvasController.changeFontSize.bind(CanvasController);
CanvasController.toggleBold = CanvasController.toggleBold.bind(CanvasController);
CanvasController.toggleItalic = CanvasController.toggleItalic.bind(CanvasController);
CanvasController.toggleUnderline = CanvasController.toggleUnderline.bind(CanvasController);
CanvasController.toggleStrikethrough = CanvasController.toggleStrikethrough.bind(CanvasController);
CanvasController.updateOpacitySliderGradient = CanvasController.updateOpacitySliderGradient.bind(CanvasController);
