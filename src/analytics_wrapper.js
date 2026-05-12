const prodConfig = {
    apiKey: "AIzaSyDgeMPAM9aKivOPLBuF_Fqm8uhedO5jeYc",
    authDomain: "go-rabbit-4af82.firebaseapp.com",
    projectId: "go-rabbit-4af82",
    storageBucket: "go-rabbit-4af82.firebasestorage.app",
    messagingSenderId: "746967187087",
    appId: "1:746967187087:web:d2413f9cb46efae41cbafa",
    measurementId: "G-BJLK9339LN"
};

let actualAnalytics = null;
let actualLogEvent = null;
let eventQueue = [];
let isFailed = false;
let isInitializing = false;

// Dummy object to satisfy `if (analytics)` checks in game code
export const dummyAnalytics = { isWrapper: true };

// Replace the real getAnalytics and initializeApp to return dummies, 
// as we auto-initialize asynchronously below.
export function initializeApp(config) {
    return {}; 
}

export function getAnalytics(app) {
    return dummyAnalytics;
}

export function logEvent(analyticsInstance, eventName, params) {
    if (isFailed) return;
    
    // Automatically inject publisher domain if missing on embed visits
    if (eventName === 'embed_visit' && (!params || !params.publisher_domain)) {
        let pubDomain = 'unknown';
        if (document.referrer) {
            try { pubDomain = new URL(document.referrer).hostname; } catch(e) {}
        }
        params = params || {};
        params.publisher_domain = pubDomain;
    }

    if (actualAnalytics && actualLogEvent) {
        actualLogEvent(actualAnalytics, eventName, params);
    } else {
        eventQueue.push({ eventName, params });
    }
}

// Auto-initialize dynamically and robustly
(async () => {
    if (isInitializing) return;
    isInitializing = true;
    try {
        const fbApp = await import("https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js");
        const fbAnalytics = await import("https://www.gstatic.com/firebasejs/10.9.0/firebase-analytics.js");
        
        let app;
        if (fbApp.getApps().length === 0) {
            app = fbApp.initializeApp(prodConfig);
        } else {
            app = fbApp.getApps()[0];
        }
        
        actualAnalytics = fbAnalytics.getAnalytics(app);
        actualLogEvent = fbAnalytics.logEvent;
        
        // Flush queue
        eventQueue.forEach(q => {
            actualLogEvent(actualAnalytics, q.eventName, q.params);
        });
        eventQueue = [];
    } catch (e) {
        console.warn("Analytics dynamically blocked or failed. Running locally.");
        isFailed = true;
        eventQueue = [];
    }
})();
