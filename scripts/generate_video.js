import puppeteer from 'puppeteer';
import { PuppeteerScreenRecorder } from 'puppeteer-screen-recorder';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import * as googleTTS from 'google-tts-api';

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
    const server = spawn(/^win/.test(process.platform) ? 'npm.cmd' : 'npm', ['run', 'dev', '--', '--port', '5173'], {
        cwd: process.cwd(),
        shell: true
    });
    
    server.stderr.on('data', (data) => console.error("VITE ERROR:", data.toString()));
    server.stdout.on('data', (data) => console.log("VITE:", data.toString()));

    console.log("Waiting for Vite dev server to boot...");
    let viteReady = false;
    for (let i = 0; i < 30; i++) {
        try {
            const res = await fetch("http://localhost:5173/");
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
            "Watch how long the bot can survive! Play all our games for free at the link in our bio.",
            "Can you beat this survival time? Play for free at the link in our bio!",
            "I love this music memory game. Can you beat my high score? Play free from our profile!"
        ],
        fail: [
            "Wow, I totally lost track of the pattern. Play for free at the link in our bio!",
            "I can't even remember 4 moves... Can you do better? Play free at the link in our profile.",
            "This memory game gets so fast! See if you can beat my score. Link in bio to play."
        ],
        interactive: [
            "Memorize the pattern! What's the next flower? Comment below!",
            "Which flower lights up next? Let us know in the comments and play at the link in our bio!",
            "Did you catch the pattern? Where should I click next? Test your memory at the link in our bio."
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
    }

    const ttsText = pool[Math.floor(Math.random() * pool.length)];

    console.log("Generating TTS audio...");
    try {
        const ttsUrl = googleTTS.getAudioUrl(ttsText, {
            lang: 'en',
            slow: false,
            host: 'https://translate.google.com',
        });
        const ttsResponse = await fetch(ttsUrl);
        const ttsBuffer = await ttsResponse.arrayBuffer();
        fs.writeFileSync(TTS_PATH, Buffer.from(ttsBuffer));
        console.log("TTS audio successfully generated.");
    } catch (err) {
        console.warn("Failed to generate TTS audio, continuing without it.", err);
        fs.writeFileSync(TTS_PATH, Buffer.from([]));
    }

    const browser = await puppeteer.launch({
        headless: 'new',
        args: [
            '--window-size=450,800',
            '--autoplay-policy=no-user-gesture-required',
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage'
        ]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 450, height: 800 });
    
    const recorder = new PuppeteerScreenRecorder(page, {
        fps: 30,
        ffmpeg_Path: ffmpegInstaller.path,
        videoFrame: {
            width: 450,
            height: 800,
        }
    });

    console.log("Navigating to game and starting recording...");
    try {
        await page.goto(`http://localhost:5173/?autoplay=${urlParam}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch (e) {
        console.warn("Navigation timeout reached, but we will wait for internal game completion flag.", e.message);
    }

    console.log("Starting Puppeteer Screen Recorder...");
    await recorder.start(RAW_VIDEO);

    console.log("Recording... Waiting for game completion.");
    
    let gameWon = false;
    for (let i = 0; i < 240; i++) { 
        gameWon = await page.evaluate(() => window._VIDEO_RECORDING_DONE === true);
        if (gameWon) break;
        await sleep(500);
    }

    console.log("Gameplay finished. Saving video...");
    await recorder.stop();
    
    try { await browser.close(); } catch(e) {}
    server.kill();

    console.log("Compositing TikTok video using FFmpeg...");
    
    await new Promise((resolve, reject) => {
        ffmpeg()
            .input(RAW_VIDEO)
            .input(BGM_PATH).inputOptions(['-stream_loop', '-1'])
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
                '-preset slow',
                '-crf 18',
                '-c:a aac',
                '-b:a 192k',
                '-shortest'
            ])
            .save(FINAL_VIDEO)
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
