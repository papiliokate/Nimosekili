import puppeteer from 'puppeteer';
import { PuppeteerScreenRecorder } from 'puppeteer-screen-recorder';
import fs from 'fs';
import path from 'path';
import { spawn, execSync } from 'child_process';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { EdgeTTS } from 'node-edge-tts';
import { GoogleGenerativeAI } from '@google/generative-ai';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const TTS_PATH = path.resolve('public/tts.mp3');
const bgmDir = path.resolve('public/bgm');
const bgmFiles = fs.readdirSync(bgmDir).filter(f => f.endsWith('.mp3'));
const randomBgm = bgmFiles[Math.floor(Math.random() * bgmFiles.length)];
const BGM_PATH = path.resolve(bgmDir, randomBgm);
console.log(`Selected BGM: ${randomBgm}`);
const RAW_VIDEO = path.resolve('raw.mp4');
const FINAL_VIDEO = path.resolve('public/daily_video.mp4');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
    const server = spawn('node', ['node_modules/vite/bin/vite.js', '--port', '5173', '--strictPort', '--host', '127.0.0.1', '--clearScreen', 'false'], {
        cwd: process.cwd(),
        shell: false
    });
    
    server.stderr.on('data', (data) => console.error("VITE ERROR:", data.toString()));
    server.stdout.on('data', (data) => console.log("VITE:", data.toString()));

    console.log("Waiting for Vite dev server to boot...");
    let viteReady = false;
    for (let i = 0; i < 30; i++) {
        try {
            const res = await fetch("http://127.0.0.1:5173/");
            if (res.ok) { viteReady = true; break; }
        } catch (e) {}
        await sleep(500);
    }
    if (!viteReady) throw new Error("Vite server failed to start.");
    console.log("Server is ready!");

    const FORMAT = process.env.FORMAT || 'standard';
    console.log(`Generating video for format: ${FORMAT}`);
    
    const ttsPools = {
        standard: [
            "Can you guess today's quote? Watch closely, then click the link in our bio to play all our games for free!"
        ],
        fail: [
            "This quote is genuinely so difficult. Even the bot is struggling! Think you can do better? Try it at the link in our bio!"
        ],
        interactive: [
            "Only 1% of players memorize the board well enough to find this final match. Which one is it? Play for free via the link in our profile!"
        ]
    };

    let urlParam = 'standard';
    let pool = ttsPools.standard;
    
    if (FORMAT === 'fail') {
        urlParam = 'fail';
        pool = ttsPools.fail;
    } else if (FORMAT === 'interactive') {
        urlParam = 'interactive';
        pool = ttsPools.interactive;
    } else if (FORMAT === 'glitch') {
        urlParam = 'glitch';
        pool = ttsPools.standard;
    } else if (FORMAT === 'split') {
        urlParam = 'split';
    }

    let ttsText = pool[Math.floor(Math.random() * pool.length)];

    console.log("Generating dynamic script with Gemini...");
    try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) throw new Error("GEMINI_API_KEY is not set.");
        
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        const gameDirName = path.basename(path.resolve('.'));
        const gameName = gameDirName.replace(/([A-Z])/g, ' $1').trim(); // e.g., "She Sells Sea Shells"

        const prompt = `Write a short, engaging, 1-to-2 sentence hook for a TikTok video about a puzzle game called ${gameName}. The video format is "${FORMAT}".
        Make it sound extremely natural and slightly dramatic, like a real person reacting to the game. 
        Don't use hashtags or emojis.
        If the format is "fail", mock the gameplay and challenge the viewer. 
        If the format is "interactive", ask the viewer to help find the solution. 
        If the format is anything else (like "standard", "glitch", "speedrun", etc.), just excitedly encourage the viewer to play the game based on the name.`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const generatedText = response.text().trim().replace(/["']/g, '');
        if (generatedText) {
            ttsText = generatedText;
            console.log("Dynamic script generated:", ttsText);
        } else {
            throw new Error("Empty response from Gemini.");
        }
    } catch (e) {
        console.warn("Failed to generate dynamic script with Gemini, falling back to static pool.", e.message);
    }

    console.log("Generating TTS audio with Edge TTS...");
    try {
        const tts = new EdgeTTS({
            voice: 'en-US-ChristopherNeural',
            lang: 'en-US',
            outputFormat: 'audio-24khz-48kbitrate-mono-mp3'
        });
        await tts.ttsPromise(ttsText, TTS_PATH);
        console.log("TTS audio successfully generated.");
    } catch (err) {
        console.warn("Failed to generate TTS audio, continuing without it.", err);
        fs.writeFileSync(TTS_PATH, Buffer.from([]));
    }

    const isSplit = FORMAT === 'split';
    
    let asmrFilename = '';
    if (isSplit) {
        const ASMR_DIR = path.resolve('public/asmr');
        if (fs.existsSync(ASMR_DIR)) {
            const asmrFiles = fs.readdirSync(ASMR_DIR).filter(f => f.endsWith('.mp4'));
            if (asmrFiles.length > 0) asmrFilename = asmrFiles[Math.floor(Math.random() * asmrFiles.length)];
        }
    }

    const browser = await puppeteer.launch({
        headless: 'new',
        args: [
            `--window-size=720,1280`,
            '--autoplay-policy=no-user-gesture-required',
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage'
        ]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 720, height: 1280 });
    
    const recorder = new PuppeteerScreenRecorder(page, {
        fps: 30,
        ffmpeg_Path: ffmpegInstaller.path,
        videoFrame: {
            width: 720,
            height: 1280,
        },
        aspectRatio: '9:16',
    });

    console.log("Navigating to game and starting recording...");
    try {
        let gameUrl = `http://127.0.0.1:5173/?autoplay=${urlParam}`;
        if (isSplit && asmrFilename) {
            gameUrl += `&asmr=${encodeURIComponent(asmrFilename)}`;
        }
        await page.goto(gameUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch (e) {
        console.warn("Navigation timeout reached, but we will wait for internal game completion flag.", e.message);
    }

    console.log("Starting Puppeteer Screen Recorder...");
    await recorder.start(RAW_VIDEO);

    let actualDuration = 60;
    
    let ttsDuration = 10; // Default fallback
    if (!isSplit) {
        try {
            if (fs.statSync(TTS_PATH).size > 0) {
                const probe = execSync(`"${ffmpegInstaller.path}" -i "${TTS_PATH}" 2>&1`, {encoding: 'utf8'});
                const match = probe.match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
                if (match) {
                   ttsDuration = parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + Math.ceil(parseFloat(match[3]));
                }
            }
        } catch(e) {}
    }

    console.log("Recording... Waiting for duration to elapse.");
    
    if (isSplit) {
        actualDuration = Math.floor(Math.random() * (25 - 15 + 1)) + 15;
        console.log(`Split format selected. Recording for exactly ${actualDuration} seconds...`);
        await sleep(actualDuration * 1000);
    } else {
        actualDuration = ttsDuration + 2; // Adding a 2-second pad so it doesn't abruptly cut off the millisecond the speech ends
        console.log(`Standard format selected. Recording for exactly ${actualDuration} seconds (TTS duration + padding)...`);
        await sleep(actualDuration * 1000);
    }

    console.log("Gameplay finished. Saving video...");
    await recorder.stop();
    
    try { await browser.close(); } catch(e) {}
    server.kill();

    console.log("Compositing TikTok video using FFmpeg...");
    
    await new Promise((resolve, reject) => {
        let duration = actualDuration; // Set by recorder logic
        if (!isSplit) {
            try {
                const probe = execSync(`"${ffmpegInstaller.path}" -i "${RAW_VIDEO}" 2>&1`, {encoding: 'utf8'});
                const match = probe.match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
                if (match) {
                   duration = parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + Math.ceil(parseFloat(match[3]));
                   console.log("Raw video duration parsed:", duration);
                }
            } catch(e) {}
        } else {
            console.log("Using randomized duration for split video:", duration);
        }

        let cmd = ffmpeg().input(RAW_VIDEO);

        if (FORMAT === 'split') {
            const ASMR_DIR = path.resolve('public/asmr');
            const RELAX_DIR = path.resolve('public/relaxing_audio');
            
            let asmrFile = asmrFilename ? path.resolve(ASMR_DIR, asmrFilename) : '';
            let relaxFile = '';
            
            if (fs.existsSync(RELAX_DIR)) {
                const relaxFiles = fs.readdirSync(RELAX_DIR).filter(f => f.endsWith('.mp3') || f.endsWith('.wav'));
                if (relaxFiles.length > 0) relaxFile = path.resolve(RELAX_DIR, relaxFiles[Math.floor(Math.random() * relaxFiles.length)]);
            }

            if (asmrFile && relaxFile) {
                cmd.input(asmrFile).inputOptions(['-stream_loop', '-1'])
                   .input(relaxFile).inputOptions(['-stream_loop', '-1'])
                   .complexFilter([
                       '[1:v]scale=720:640:force_original_aspect_ratio=increase,crop=720:640[asmr_v]',
                       '[0:v][asmr_v]overlay=0:640[v_out]',
                       '[1:a]volume=0.5[asmr_audio]',
                       '[2:a]volume=0.5[relax_audio]',
                       '[asmr_audio][relax_audio]amix=inputs=2:duration=first:dropout_transition=3[audio_out]'
                   ])
                   .outputOptions([
                       '-y',
                       '-map [v_out]',
                       '-map [audio_out]',
                       '-c:v libx264',
                       '-pix_fmt yuv420p',
                       '-preset ultrafast',
                       '-crf 18',
                       '-c:a aac',
                       '-b:a 192k',
                       `-t ${duration}`
                   ]);
            } else {
                 console.warn("Missing ASMR or Relaxing Audio files! Falling back to raw video.");
                 cmd.outputOptions(['-y', '-map 0:v', '-c:v libx264', '-preset ultrafast', '-crf 18']);
            }
        } else {
            cmd.input(BGM_PATH).inputOptions(['-stream_loop', '-1'])
               .input(TTS_PATH)
               .complexFilter([
                   '[1:a]volume=0.3[bgm_quiet]',
                   '[2:a]volume=1.5[tts_loud]',
                   '[bgm_quiet][tts_loud]amix=inputs=2:duration=first:dropout_transition=3[audio_out]'
               ])
               .outputOptions([
                   '-y',
                   '-map 0:v',
                   '-map [audio_out]',
                   '-c:v libx264',
                   '-pix_fmt yuv420p',
                   '-preset ultrafast',
                   '-crf 18',
                   '-c:a aac',
                   '-b:a 192k',
                   '-shortest'
               ]);
        }
        
        cmd.save(FINAL_VIDEO)
            .on('end', () => {
                console.log(`Successfully generated TikTok video at: ${FINAL_VIDEO}`);
                resolve();
            })
            .on('error', (err) => {
                console.error("FFmpeg Error:", err);
                reject(err);
            });
    });
}

main().then(() => {
    if (!fs.existsSync(FINAL_VIDEO) || fs.statSync(FINAL_VIDEO).size < 1024) {
        throw new Error("Final video was not created or is empty!");
    }
    console.log("Process complete. Exiting natively.");
    process.exit(0);
}).catch(err => {
    console.error("Script failed:", err);
    process.exit(1);
});
