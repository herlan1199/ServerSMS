const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = 'https://latanime.org';

app.use(cors());
app.use(express.json());

// Instancia de Axios optimizada con User-Agent por defecto y timeout
const apiClient = axios.create({
    baseURL: BASE_URL,
    timeout: 10000,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
});

// Función auxiliar para resolver URLs relativas
const resolveUrl = (url) => {
    if (!url) return '';
    return url.startsWith('http') ? url : `${BASE_URL}${url}`;
};

// 1. Añadidos recientemente
app.get('/api/recent', async (req, res) => {
    try {
        const { data } = await apiClient.get('/');
        const $ = cheerio.load(data);
        const recentEpisodes = [];

        $('body > div.container > div.row > div').each((i, element) => {
            const $card =$(element);
            const $link =$card.find('a');
            const $img =$link.find('div.imgrec img, img').first();
            
            const rawImage = $img.attr('data-src') || $img.attr('data-original') \vert{}\vert{}$img.attr('src');
            const url = $link.attr('href');
            const title = $link.find('div.info > h2').text().trim() \vert{}\vert{}$card.find('h2').text().trim() || 'Anime / Episodio sin título';
            const episode = $card.find('.episode-number, .badge, span').text().trim();

            if (url) {
                recentEpisodes.push({
                    title,
                    url: resolveUrl(url),
                    image: resolveUrl(rawImage),
                    episode
                });
            }
        });

        res.json({ success: true, data: recentEpisodes });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 2. Realizar búsquedas
app.get('/api/search', async (req, res) => {
    const query = req.query.q;
    if (!query) {
        return res.status(400).json({ success: false, error: 'Falta el parámetro de búsqueda "q"' });
    }

    try {
        const { data } = await apiClient.get(`/buscar?q=${encodeURIComponent(query)}`);
        const $ = cheerio.load(data);
        const results = [];

        $('body > div.container > div.row > div').each((i, element) => {
            const $card =$(element);
            const $link =$card.find('a');

            const title = $card.find('.title, h3, h4, .anime-title').text().trim() \vert{}\vert{}$link.attr('title') || '';
            const url = $link.attr('href');
            const $img =$card.find('img').first();
            const rawImage = $img.attr('data-src') || $img.attr('data-original') \vert{}\vert{}$img.attr('src');
            const synopsis = $card.find('.description, p').text().trim();

            if (title && url) {
                results.push({
                    title,
                    url: resolveUrl(url),
                    image: resolveUrl(rawImage),
                    synopsis
                });
            }
        });

        res.json({ success: true, data: results });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 3. Obtener info, sinopsis y lista de episodios de un anime
app.get('/api/anime', async (req, res) => {
    const animeUrl = req.query.url;
    if (!animeUrl) {
        return res.status(400).json({ success: false, error: 'Falta la URL del anime' });
    }

    try {
        // Permitimos URLs absolutas si vienen de fuera, o relativas
        const targetUrl = animeUrl.startsWith('http') ? animeUrl : resolveUrl(animeUrl);
        const { data } = await axios.get(targetUrl, {
            headers: apiClient.defaults.headers
        });
        const $ = cheerio.load(data);

        const title = $('.anime-title, h1').text().trim();
        const synopsis = $('.sinopsis, .description').text().trim();
        const cover = resolveUrl($('.anime-cover img, .poster img').attr('src'));
        
        const episodes = [];
        $('#chapters-list li, .episodios-list a').each((i, element) => {
            const $el =$(element);
            const epTitle = $el.text().trim();
            const epUrl = $el.attr('href') \vert{}\vert{}$el.find('a').attr('href');
            
            if (epUrl) {
                episodes.push({
                    title: epTitle,
                    url: resolveUrl(epUrl)
                });
            }
        });

        res.json({ success: true, data: { title, synopsis, cover, episodes } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 4. Obtener todos los servidores del episodio
app.get('/api/episode', async (req, res) => {
    const episodeUrl = req.query.url;
    if (!episodeUrl) {
        return res.status(400).json({ success: false, error: 'Falta la URL del episodio' });
    }

    try {
        const targetUrl = episodeUrl.startsWith('http') ? episodeUrl : resolveUrl(episodeUrl);
        const { data } = await axios.get(targetUrl, {
            headers: apiClient.defaults.headers
        });
        const $ = cheerio.load(data);
        const servers = [];

        const serverSelector = 'body > div.container-fluid > div > div > div.col-12.col-lg-8.seiya > ul > li a, body > div.container-fluid > div > div > div.col-12.col-lg-8.seiya > ul > a';

        $(serverSelector).each((i, element) => {
            const $el =$(element);
            const base64Value = $el.attr('data-player') || $el.attr('data-video') \vert{}\vert{}$el.attr('data-url');
            const serverName = $el.text().trim() \vert{}\vert{}$el.attr('data-name') || `Servidor ${i + 1}`;

            if (base64Value) {
                try {
                    let decodedUrl = base64Value;
                    if (!base64Value.startsWith('http')) {
                        decodedUrl = Buffer.from(base64Value, 'base64').toString('utf-8');
                    }

                    if (decodedUrl.startsWith('http')) {
                        servers.push({
                            name: serverName,
                            type: 'iframe',
                            url: decodedUrl
                        });
                    }
                } catch (e) {
                    // Ignorar errores de decodificación Base64 inválida
                }
            }
        });

        const blockedServers = ['mixdrop', 'hexload', 'savefiles', 'byse', 'mega'];
        const filteredServers = servers.filter(server => {
            const lowerUrl = server.url.toLowerCase();
            const lowerName = server.name.toLowerCase();
            return !blockedServers.some(blocked => lowerUrl.includes(blocked) || lowerName.includes(blocked));
        });

        res.json({ success: true, data: { episodeUrl, servers: filteredServers } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`API corriendo en http://localhost:${PORT}`);
});
