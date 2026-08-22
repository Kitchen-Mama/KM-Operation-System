// ========================================
// Kitchen Mama - Global Namespace
// 全域命名空間，避免全域污染
// ========================================

/**
 * KM (Kitchen Mama) 全域命名空間
 * 所有頁面邏輯、工具函式、狀態管理都統一在此命名空間下
 */
window.KM = {
    /**
     * F1-7N-FA-3C-R6C — CENTRALIZED RELEASE SIGNATURE (asset cache/version authority). Before R6C the frontend had NO
     * central release id: every `?v=` cache-bust token was hand-typed per file in index.html, so a corrected asset could
     * silently keep serving a stale cached copy (the R6B1/R6B2 request-order.js fixes were pinned at `?v=donenotice-
     * 20260811` and may never have loaded live). This is the ONE deterministic release id; the `?v=` token on every asset
     * updated in this release matches it, and debug output surfaces it so "is the deployed correction the code actually
     * running?" is answerable at a glance. Bump this (and the matching `?v=` on changed assets) once per release.
     */
    RELEASE: 'r6a1-request-send-20260822',

    /**
     * 頁面模組
     * 每個頁面的初始化、渲染、狀態管理函式
     */
    pages: {},
    
    /**
     * 工具函式
     * 共用的工具函式，如資料管理、滾動同步等
     */
    utils: {},
    
    /**
     * 全域狀態
     * 跨頁面共享的狀態（預留給 Phase 2）
     */
    state: {},
    
    /**
     * 生命週期管理
     * 頁面的掛載、卸載管理（預留給 Phase 1 後續）
     */
    lifecycle: {}
};

// 向下相容：保留 DataRepo 的全域存取
// 確保現有程式碼不受影響
if (window.DataRepo) {
    KM.utils.data = window.DataRepo;
}

console.log('[KM] Namespace initialized');
