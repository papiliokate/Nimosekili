(function() {
    const urlParams = new URLSearchParams(window.location.search);
    const isCarousel = urlParams.get('carousel') === 'true';
    
    // Identify current game id
    let currentGameId = '';
    const hostname = window.location.hostname || '';
    const path = window.location.pathname || '';
    const fullUrl = window.location.href || '';
    
    if (fullUrl.includes('go-rabbit')) currentGameId = 'GR';
    else if (fullUrl.includes('she-sells') || fullUrl.includes('SheSells')) currentGameId = 'SS';
    else if (fullUrl.includes('smack-that') || fullUrl.includes('SmackThat')) currentGameId = 'ST';
    else if (fullUrl.includes('o-gox') || fullUrl.includes('OGox')) currentGameId = 'OG';
    else if (fullUrl.includes('lightning-words') || fullUrl.includes('LightningWords')) currentGameId = 'LW';
    else if (fullUrl.includes('budbud') || fullUrl.includes('BudBud')) currentGameId = 'BB';
    else if (fullUrl.includes('nimosekili') || fullUrl.includes('Nimosekili') || fullUrl.includes('nomisekili') || fullUrl.includes('Nomisekili')) currentGameId = 'NIM';
    else if (fullUrl.includes('sunny-day') || fullUrl.includes('SunnyDayMaze')) currentGameId = 'SDM';

    const advanceCarousel = async () => {
        const playedGamesStr = urlParams.get('played') || '';
        let currentPlayed = playedGamesStr ? playedGamesStr.split(',').filter(Boolean) : [];
        if (currentGameId && !currentPlayed.includes(currentGameId)) {
            currentPlayed.push(currentGameId);
        }
        
        try {
            const configList = [
                { "id": "GR", "url": "/go-rabbit" },
                { "id": "SS", "url": "/she-sells-sea-shells" },
                { "id": "ST", "url": "/smack-that-donkey" },
                { "id": "OG", "url": "/o-gox" },
                { "id": "BB", "url": "/budbud" },
                { "id": "LW", "url": "/lightning-words" },
                { "id": "NIM", "url": "/nomisekili" },
                { "id": "SDM", "url": "/sunny-day-maze" }
            ];
            
            let unplayed = configList.filter(g => !currentPlayed.includes(g.id));
            
            // True Endless Loop Logic: If no unplayed games, clear history (keep only current game)
            if (unplayed.length === 0) {
                currentPlayed = currentGameId ? [currentGameId] : [];
                unplayed = configList.filter(g => !currentPlayed.includes(g.id));
            }
            
            if (unplayed.length > 0) {
                const nextGame = unplayed[Math.floor(Math.random() * unplayed.length)];
                window.location.href = `${nextGame.url}?carousel=true&played=${currentPlayed.join(',')}`;
            } else {
                window.location.href = 'https://oops-games.com/';
            }
        } catch(e) {
            console.error("Failed to advance carousel", e);
            window.location.href = 'https://oops-games.com/';
        }
    };

    // Use event delegation to handle dynamically injected buttons
    document.addEventListener('click', (e) => {
        if (e.target && (e.target.id === 'carousel-play-next' || e.target.closest('#carousel-play-next'))) {
            advanceCarousel();
        }
        if (e.target && (e.target.id === 'header-carousel-next' || e.target.closest('#header-carousel-next'))) {
            advanceCarousel();
        }
    });

    // Make sure header is visible if we are in carousel mode
    const initHeaderButton = () => {
        if (isCarousel) {
            const headerNextBtn = document.getElementById('header-carousel-next');
            if (headerNextBtn) {
                headerNextBtn.style.display = 'block';
            }
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initHeaderButton);
    } else {
        initHeaderButton();
    }

    // Expose for manual triggering if needed
    window.advanceCarousel = advanceCarousel;
})();
