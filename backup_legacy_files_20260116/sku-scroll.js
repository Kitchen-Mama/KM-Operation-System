// SKU Details 統一滾動控制
(function() {
    let scrollProxy = null;
    let verticalScrollProxy = null;
    let scrollCols = [];
    let isInitialized = false;
    
    function initSkuScroll() {
        const skuSection = document.getElementById('sku-section');
        if (!skuSection || isInitialized) return;
        
        const skuDetailsSection = skuSection.querySelector('#skuDetailsSection');
        if (!skuDetailsSection) return;
        
        scrollCols = Array.from(skuSection.querySelectorAll('.scroll-col'));
        if (scrollCols.length === 0) return;
        
        // 創建水平虛擬滾動條
        if (!scrollProxy) {
            scrollProxy = document.createElement('div');
            scrollProxy.className = 'sku-scroll-proxy';
            scrollProxy.innerHTML = '<div class="sku-scroll-content"></div>';
            skuDetailsSection.appendChild(scrollProxy);
        }
        
        // 創建垂直虛擬滾動條
        if (!verticalScrollProxy) {
            verticalScrollProxy = document.createElement('div');
            verticalScrollProxy.className = 'sku-vertical-scroll-proxy';
            verticalScrollProxy.innerHTML = '<div class="sku-vertical-scroll-content"></div>';
            document.body.appendChild(verticalScrollProxy);
        }
        
        isInitialized = true;
        
        // 計算最大寬度和高度
        updateScrollWidth();
        updateScrollHeight();
        
        // 監聽水平虛擬滾動條
        scrollProxy.addEventListener('scroll', function() {
            const scrollLeft = this.scrollLeft;
            scrollCols.forEach(col => {
                col.scrollLeft = scrollLeft;
            });
        });
        
        // 監聽垂直虛擬滾動條
        verticalScrollProxy.addEventListener('scroll', function() {
            const mainContent = document.querySelector('.main-content');
            if (mainContent) {
                mainContent.scrollTop = this.scrollTop;
            }
        });
        
        // 監聽 main-content 垂直滾動（同步回虛擬滾動條）
        const mainContent = document.querySelector('.main-content');
        if (mainContent) {
            mainContent.addEventListener('scroll', function() {
                if (verticalScrollProxy && verticalScrollProxy.scrollTop !== this.scrollTop) {
                    verticalScrollProxy.scrollTop = this.scrollTop;
                }
            });
        }
        
        // 監聽各區塊水平滾動（同步回虛擬滾動條）
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
        
        const scrollDistance = maxScrollWidth - maxClientWidth;
        const content = scrollProxy.querySelector('.sku-scroll-content');
        content.style.width = (scrollProxy.clientWidth + scrollDistance) + 'px';
    }
    
    function updateScrollHeight() {
        if (!verticalScrollProxy) return;
        
        const mainContent = document.querySelector('.main-content');
        if (!mainContent) return;
        
        const scrollHeight = mainContent.scrollHeight;
        const clientHeight = mainContent.clientHeight;
        const scrollDistance = Math.max(0, scrollHeight - clientHeight);
        
        const content = verticalScrollProxy.querySelector('.sku-vertical-scroll-content');
        if (content) {
            content.style.height = (verticalScrollProxy.clientHeight + scrollDistance) + 'px';
        }
    }
    
    window.addEventListener('DOMContentLoaded', function() {
        setTimeout(initSkuScroll, 100);
    });
    
    window.addEventListener('resize', function() {
        updateScrollWidth();
        updateScrollHeight();
    });
    
    // 監聽 SKU Details 頁面切換
    const observer = new MutationObserver(function() {
        const skuSection = document.getElementById('sku-section');
        if (skuSection && skuSection.classList.contains('active')) {
            if (!isInitialized) {
                setTimeout(initSkuScroll, 100);
            }
            setTimeout(function() {
                updateScrollHeight();
            }, 200);
        }
    });
    
    setTimeout(function() {
        const skuSection = document.getElementById('sku-section');
        if (skuSection) {
            observer.observe(skuSection, { attributes: true, attributeFilter: ['class'] });
        }
    }, 500);
    
    window.updateSkuScrollWidth = updateScrollWidth;
    window.updateSkuScrollHeight = updateScrollHeight;
    window.initSkuScroll = initSkuScroll;
})();
