import express, { Request, Response } from 'express';
import axios from 'axios';
import * as cheerio from 'cheerio';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = 'https://latanime.org';

app.use(cors());
app.use(express.json());

// 1. Añadidos recientemente
app.get('/api/recent', async (req: Request, res: Response): Promise<void> => {
    try {
        const { data } = await axios.get(BASE_URL, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        const $ = cheerio.load(data);
        const recentEpisodes: any[] = [];

        $('body > div.container > div.row > div').each((i, element) => {
            const $card =$(element);
            const $link =$card.find('a');
            const $img =$link.find('div.imgrec img');
            const rawImage = $img.attr('data-src') || $img.attr('data-original') || $img.attr('src') || $card.find('img').attr('data-src') || $card.find('img').attr('src');

            const image = rawImage?.startsWith('http') ? rawImage : (rawImage ? `${BASE_URL}${rawImage}` : '');
            const url = $link.attr('href');
            //const image = $link.find('div.imgrec img').attr('src') || $card.find('img').attr('src');
            const title = $link.find('div.info > h2').text().trim() || $card.find('h2').text().trim() || '';
            const episode = $card.find('.episode-number, .badge, span').text().trim();

            if (url) {
                recentEpisodes.push({
                    title: title || 'Anime / Episodio sin título',
                    url: url.startsWith('http') ? url : `${BASE_URL}${url}`,
                    image: image?.startsWith('http') ? image : (image ? `${BASE_URL}${image}` : ''),
                    episode
                });
            }
        });

        res.json({ success: true, data: recentEpisodes });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 2. Realizar búsquedas
app.get('/api/search', async (req: Request, res: Response): Promise<void> => {
    const query = req.query.q as string;
    if (!query) {
        res.status(400).json({ success: false, error: 'Falta el parámetro de búsqueda "q"' });
        return;
    }

    try {
        const searchUrl = `${BASE_URL}/buscar?q=${encodeURIComponent(query)}`;
        const { data } = await axios.get(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        const $ = cheerio.load(data);
        const results: any[] = [];

        // Selector corregido basado en la estructura que compartiste
        $('body > div.container > div.row > div').each((i, element) => {
            const $card =$(element);
            const $link =$card.find('a');

            const title = $card.find('.title, h3, h4, .anime-title').text().trim() || $link.attr('title') || '';
            const url = $link.attr('href');
            
            // Extracción de imagen con soporte para lazy loading
            const $img =$card.find('img');
            const rawImage = $img.attr('data-src') || $img.attr('data-original') || $img.attr('src');
            
            const synopsis = $card.find('.description, p').text().trim();

            if (title && url) {
                results.push({
                    title,
                    url: url.startsWith('http') ? url : `${BASE_URL}${url}`,
                    image: rawImage?.startsWith('http') ? rawImage : (rawImage ? `${BASE_URL}${rawImage}` : ''),
                    synopsis
                });
            }
        });

        res.json({ success: true, data: results });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 3. Obtener info, sinopsis y lista de episodios de un anime
app.get('/api/anime', async (req: Request, res: Response): Promise<void> => {
    const animeUrl = req.query.url as string;
    if (!animeUrl) {
        res.status(400).json({ success: false, error: 'Falta la URL del anime' });
        return;
    }

    try {
        const { data } = await axios.get(animeUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        const $ = cheerio.load(data);

        const title = $('.anime-title, h1').text().trim();
        const synopsis = $('.sinopsis, .description').text().trim();
        const cover = $('.anime-cover img, .poster img').attr('src');
        
        const episodes: any[] = [];
        
        $('#chapters-list li, .episodios-list a').each((i, element) => {
            const epTitle = $(element).text().trim();
            const epUrl = $(element).attr('href') || $(element).find('a').attr('href');
            if (epUrl) {
                episodes.push({
                    title: epTitle,
                    url: epUrl.startsWith('http') ? epUrl : `${BASE_URL}${epUrl}`
                });
            }
        });

        res.json({ success: true, data: { title, synopsis, cover, episodes } });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});



app.listen(PORT, () => {
    console.log(`API corriendo en http://localhost:${PORT}`);
});
