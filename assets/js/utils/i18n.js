// ========================================
// i18n (Internationalization) Utility
// Shared module for language switching
// ========================================

const I18N_STORAGE_KEY = 'km_language';
const I18N_DEFAULT_LANG = 'en';

const i18n = {
    _lang: null,
    _packs: {},
    _listeners: [],

    init() {
        this._lang = localStorage.getItem(I18N_STORAGE_KEY) || I18N_DEFAULT_LANG;
    },

    getLang() {
        if (!this._lang) this.init();
        return this._lang;
    },

    setLang(lang) {
        this._lang = lang;
        localStorage.setItem(I18N_STORAGE_KEY, lang);
        this._listeners.forEach(fn => fn(lang));
    },

    // Register a language pack for a namespace (e.g. 'sku-handbook')
    registerPack(namespace, pack) {
        this._packs[namespace] = pack;
    },

    // Get translation: i18n.t('sku-handbook', 'pageTitle')
    t(namespace, key) {
        const lang = this.getLang();
        const pack = this._packs[namespace];
        if (!pack || !pack[lang] || !pack[lang][key]) {
            // Fallback to English, then to key itself
            if (pack && pack['en'] && pack['en'][key]) return pack['en'][key];
            return key;
        }
        return pack[lang][key];
    },

    // Subscribe to language changes
    onChange(fn) {
        this._listeners.push(fn);
    },

    // Get available languages
    getAvailableLanguages() {
        return [
            { code: 'en', label: 'English' },
            { code: 'zh', label: '中文' }
        ];
    }
};

i18n.init();
window.i18n = i18n;
