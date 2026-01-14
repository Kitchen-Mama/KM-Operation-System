# SKU Details 雙層表格結構設計

## DOM 結構
```html
<div class="split-table-container">
  <div class="fixed-column">
    <div class="fixed-header">SKU</div>
    <div class="fixed-body">
      <div class="fixed-cell">SKU-001</div>
      <div class="fixed-cell">SKU-002</div>
    </div>
  </div>
  
  <div class="scroll-column">
    <div class="scroll-header">
      <div class="scroll-header-cell">Image</div>
      <div class="scroll-header-cell">Status</div>
      ...
    </div>
    <div class="scroll-body">
      <div class="scroll-row">
        <div class="scroll-cell">IMG</div>
        <div class="scroll-cell">Active</div>
        ...
      </div>
    </div>
  </div>
</div>
```

## CSS 關鍵設定
```css
.split-table-container {
  display: flex;
  position: relative;
}

.fixed-column {
  width: 200px;
  flex-shrink: 0;
  z-index: 10;
  background: white;
}

.scroll-column {
  flex: 1;
  overflow-x: auto;
  overflow-y: hidden;
}
```

## app.js 需要修改的函數
- `renderSkuLifecycleTable()` 需要改為渲染到 fixed-body 和 scroll-body
