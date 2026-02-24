// ========================================
// Kitchen Mama - State Management
// 集中式狀態管理
// ========================================

/**
 * 集中式狀態管理系統
 * 負責全域狀態的儲存、訂閱、持久化
 */
(function() {
    const store = {}; // 狀態儲存
    const subscribers = {}; // 訂閱者管理
    const persistKeys = new Set(); // 需要持久化的 key

    /**
     * 設定狀態
     * @param {string} key - 狀態鍵名
     * @param {*} value - 狀態值
     */
    KM.state.set = function(key, value) {
        if (!key) {
            console.warn('[State] Invalid key');
            return;
        }

        const oldValue = store[key];
        store[key] = value;

        // 如果該 key 需要持久化，同步到 localStorage
        if (persistKeys.has(key)) {
            try {
                localStorage.setItem(`km_state_${key}`, JSON.stringify(value));
            } catch (error) {
                console.error(`[State] Failed to persist ${key}:`, error);
            }
        }

        // 通知訂閱者
        if (subscribers[key]) {
            subscribers[key].forEach(callback => {
                try {
                    callback(value, oldValue);
                } catch (error) {
                    console.error(`[State] Subscriber error for ${key}:`, error);
                }
            });
        }

        console.log(`[State] Set: ${key}`, value);
    };

    /**
     * 取得狀態
     * @param {string} key - 狀態鍵名
     * @param {*} defaultValue - 預設值（如果狀態不存在）
     * @returns {*} 狀態值
     */
    KM.state.get = function(key, defaultValue = null) {
        if (!key) {
            console.warn('[State] Invalid key');
            return defaultValue;
        }

        // 如果記憶體中沒有，嘗試從 localStorage 讀取
        if (!(key in store) && persistKeys.has(key)) {
            try {
                const stored = localStorage.getItem(`km_state_${key}`);
                if (stored !== null) {
                    store[key] = JSON.parse(stored);
                    console.log(`[State] Restored from localStorage: ${key}`);
                }
            } catch (error) {
                console.error(`[State] Failed to restore ${key}:`, error);
            }
        }

        return key in store ? store[key] : defaultValue;
    };

    /**
     * 訂閱狀態變化
     * @param {string} key - 狀態鍵名
     * @param {Function} callback - 回調函式 (newValue, oldValue) => {}
     * @returns {Function} 取消訂閱函式
     */
    KM.state.subscribe = function(key, callback) {
        if (!key || typeof callback !== 'function') {
            console.warn('[State] Invalid subscription');
            return () => {};
        }

        if (!subscribers[key]) {
            subscribers[key] = [];
        }

        subscribers[key].push(callback);
        console.log(`[State] Subscribed to: ${key}`);

        // 返回取消訂閱函式
        return function unsubscribe() {
            const index = subscribers[key].indexOf(callback);
            if (index > -1) {
                subscribers[key].splice(index, 1);
                console.log(`[State] Unsubscribed from: ${key}`);
            }
        };
    };

    /**
     * 標記狀態需要持久化到 localStorage
     * @param {string} key - 狀態鍵名
     */
    KM.state.persist = function(key) {
        if (!key) {
            console.warn('[State] Invalid key');
            return;
        }

        persistKeys.add(key);

        // 如果狀態已存在，立即持久化
        if (key in store) {
            try {
                localStorage.setItem(`km_state_${key}`, JSON.stringify(store[key]));
                console.log(`[State] Persisted: ${key}`);
            } catch (error) {
                console.error(`[State] Failed to persist ${key}:`, error);
            }
        }
    };

    /**
     * 清除狀態
     * @param {string} key - 狀態鍵名（如果不提供，清除所有狀態）
     */
    KM.state.clear = function(key) {
        if (key) {
            // 清除單一狀態
            delete store[key];
            
            if (persistKeys.has(key)) {
                try {
                    localStorage.removeItem(`km_state_${key}`);
                } catch (error) {
                    console.error(`[State] Failed to clear ${key}:`, error);
                }
            }
            
            console.log(`[State] Cleared: ${key}`);
        } else {
            // 清除所有狀態
            Object.keys(store).forEach(k => delete store[k]);
            
            persistKeys.forEach(k => {
                try {
                    localStorage.removeItem(`km_state_${k}`);
                } catch (error) {
                    console.error(`[State] Failed to clear ${k}:`, error);
                }
            });
            
            console.log('[State] Cleared all states');
        }
    };

    /**
     * 取得所有狀態（用於除錯）
     * @returns {Object} 所有狀態
     */
    KM.state.getAll = function() {
        return { ...store };
    };

    /**
     * 檢查狀態是否存在
     * @param {string} key - 狀態鍵名
     * @returns {boolean}
     */
    KM.state.has = function(key) {
        return key in store;
    };

    console.log('[KM] State management initialized');
})();
