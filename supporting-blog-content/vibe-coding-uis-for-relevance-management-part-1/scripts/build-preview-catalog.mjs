import { createWriteStream } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { INDEX_NAME, writeNdjsonLine } from './amazon-meta-utils.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputPath = path.join(__dirname, '../data/sample-products.ndjson');

const IMAGE = 'https://m.media-amazon.com/images/I/41MK4AX6QDL._SL500_.jpg';

const PREVIEW_PRODUCTS = [
  { id: 'PREVIEW001', name: 'Wireless Earbuds Bluetooth 5.3 Noise Cancelling', description: 'In-ear wireless earbuds with charging case and active noise cancellation for travel and workouts.', category: 'Headphones', brand: 'SoundPro', image_url: IMAGE },
  { id: 'PREVIEW002', name: 'Premium Wireless Earbuds with Dolby Audio', description: 'True wireless earbuds with immersive sound and 32-hour battery life.', category: 'Headphones', brand: 'AudioMax', image_url: IMAGE },
  { id: 'PREVIEW003', name: '15.6 inch Laptop Intel Core i7 16GB RAM 512GB SSD', description: 'Thin and light laptop for productivity, streaming, and everyday computing.', category: 'Computers', brand: 'TechBook', image_url: IMAGE },
  { id: 'PREVIEW004', name: 'Gaming Laptop 17 inch RTX Graphics 1TB SSD', description: 'High performance gaming laptop with dedicated graphics and fast refresh display.', category: 'Computers', brand: 'GameCore', image_url: IMAGE },
  { id: 'PREVIEW005', name: 'USB C Laptop Charger 65W GaN Fast Charging', description: 'Compact universal USB-C power adapter for laptops, tablets, and phones.', category: 'Accessories', brand: 'ChargePlus', image_url: IMAGE },
  { id: 'PREVIEW006', name: 'Mechanical Keyboard RGB Wireless', description: 'Low profile mechanical keyboard with hot-swappable switches and Bluetooth.', category: 'Accessories', brand: 'KeyLab', image_url: IMAGE },
  { id: 'PREVIEW007', name: '4K Webcam with Microphone for Laptop Streaming', description: 'Ultra HD webcam with auto-focus and dual noise-reducing microphones.', category: 'Cameras', brand: 'StreamCam', image_url: IMAGE },
  { id: 'PREVIEW008', name: 'Portable Bluetooth Speaker Waterproof', description: 'Outdoor speaker with 24-hour playtime and deep bass.', category: 'Speakers', brand: 'BeatWave', image_url: IMAGE },
  { id: 'PREVIEW009', name: 'Smart Watch Fitness Tracker Heart Rate Monitor', description: 'Smartwatch with GPS, sleep tracking, and smartphone notifications.', category: 'Wearables', brand: 'FitPulse', image_url: IMAGE },
  { id: 'PREVIEW010', name: '27 inch 4K Monitor IPS USB-C Hub', description: 'Ultra-slim 4K display with HDR and built-in USB-C docking.', category: 'Monitors', brand: 'ViewOne', image_url: IMAGE },
];

const stream = createWriteStream(outputPath, { encoding: 'utf8' });
for (const product of PREVIEW_PRODUCTS) {
  writeNdjsonLine(stream, INDEX_NAME, product);
}
stream.end();

console.log(`Wrote ${PREVIEW_PRODUCTS.length} preview products -> ${outputPath}`);
console.log('Replace with full catalog: npm run build:catalog');
