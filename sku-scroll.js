// SKU Details 統一滾動控制
(function() {
    let scrollProxy = null;
    let scrollCols = [];
    
    function initSkuScroll() {
        const skuSection = document.getElementById('sku-section');
        if (!skuSection) return;
        
        scrollCols = Array.from(skuSection.querySelectorAll('.scroll-col'));
        if (scrollCols.length === 0) return;
        
        // 創建虛擬滾動條
        if (!scrollProxy) {
            scrollProxy = document.createElement('div');
            scrollProxy.className = 'sku-scroll-proxy';
            scrollProxy.innerHTML = '<div class="sku-scroll-content"></div>';
            skuSection.querySelector('#skuDetailsSection').appendChild(scrollProxy);
        }
        
        // 計算最大寬度
        updateScrollWidth();
        
        // 監聽虛擬滾動條
        scrollProxy.addEventListener('scroll', function() {
            const scrollLeft = this.scrollLeft;
            scrollCols.forEach(col => {
                col.scrollLeft = scrollLeft;
            });
        });
        
        // 監聽各區塊滾動（同步回虛擬滾動條）
        scrollCols.forEach(col => {
            col.addEventListener('scroll', function() {
                if (scrollProxy.scrollLeft !== this.scrollLeft) {
                    scrollProxy.scrollLeft = this.scrollLeft;
                }
            });
        });
    }
    
    function updateScrollWidth() {
        if (!scrollProxy || scrollCols.length === 0) return;
        
        // 取得最寬的 scroll-col 內容寬度和可見寬度
        let maxScrollWidth = 0;
        let maxClientWidth = 0;
        
        scrollCols.forEach(col => {
            const scrollWidth = col.scrollWidth;
            const clientWidth = col.clientWidth;
            if (scrollWidth > maxScrollWidth) {
                maxScrollWidth = scrollWidth;
            }
            if (clientWidth > maxClientWidth) {
                maxClientWidth = clientWidth;
            }
        });
        
        // 計算實際需要滾動的距離
        const scrollDistance = maxScrollWidth - maxClientWidth;
        
        // 設置虛擬滾動條內容寬度 = 可見寬度 + 滾動距離
        const content = scrollProxy.querySelector('.sku-scroll-content');
        content.style.width = (scrollProxy.clientWidth + scrollDistance) + 'px';
    }
    
    // 當 SKU Details 頁面顯示時初始化
    window.addEventListener('DOMContentLoaded', function() {
        // 延遲初始化，確保資料已渲染
        setTimeout(initSkuScroll, 100);
    });
    
    // 監聽視窗大小變化
    window.addEventListener('resize', function() {
        updateScrollWidth();
    });
    
    // 暴露更新函數供外部調用
    window.updateSkuScrollWidth = updateScrollWidth;
})();
