require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const admin = require('firebase-admin');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cloudinary = require('cloudinary').v2;
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 5000;

// Root Logging for Vercel debugging
console.log('🚀 Server starting...');
console.log('📂 Runtime: ', process.env.VERCEL ? 'Vercel Serverless' : 'Local Node');
console.log('🔑 Env Keys Present:', {
    JUDGE_METOKEN: !!(process.env.JUDGE_ME_API_TOKEN || process.env.J_API_TOKEN),
    SHOP_DOMAIN: !!(process.env.SHOP_DOMAIN || process.env.J_SHOP_DOMAIN),
    JWT_SECRET: !!process.env.JWT_SECRET,
    FIREBASE_SERVICE_ACCOUNT: !!process.env.FIREBASE_SERVICE_ACCOUNT
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(process.cwd(), 'public')));

// Cloudinary Configuration
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Firebase Admin SDK initialization (optional)
let db = null;
let useFirestore = false;

try {
    const serviceAccountPath = path.join(__dirname, '../config/service-account.json');
    let serviceAccount = null;

    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        try {
            // Option 1: Load from environment variable (JSON string)
            serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
            console.log('✅ Firebase: Using credentials from Environment Variable');
        } catch (parseError) {
            console.error('❌ Firebase: Failed to parse FIREBASE_SERVICE_ACCOUNT environment variable. Ensure it is valid JSON.');
        }
    } else if (fs.existsSync(serviceAccountPath)) {
        // Option 2: Load from local file
        serviceAccount = require(serviceAccountPath);
        console.log('✅ Firebase: Using credentials from local JSON file');
    }

    if (serviceAccount) {
        // Ensure private_key handles newlines correctly if it's single line in env
        if (serviceAccount.private_key && typeof serviceAccount.private_key === 'string') {
            serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
        }

        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        db = admin.firestore();
        useFirestore = true;
        console.log('✅ Firebase Admin SDK initialized - using Firestore');
    } else {
        console.log('⚠️  Firebase credentials not found - using local storage');
        if (process.env.VERCEL) {
            console.warn('⚠️  WARNING: Running on Vercel without Firebase. Persistent storage will NOT work and might fail.');
        }
    }
} catch (error) {
    console.error('Firebase initialization failed:', error.stack || error.message);
    console.log('⚠️  Falling back to local storage');
}

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const GENDER_CACHE = {};
const PINNED_FILE = path.join(__dirname, '../config/pinned_reviews.json');
const USERS_FILE = path.join(__dirname, '../config/users.json');

// --- HELPER FUNCTIONS ---

async function loadPinnedIds() {
    try {
        if (useFirestore && db) {
            const doc = await db.collection('pinned_reviews').doc('pins').get();
            if (doc.exists) {
                return new Set(doc.data().ids || []);
            }
        } else {
            // Local file fallback
            if (fs.existsSync(PINNED_FILE)) {
                const data = fs.readFileSync(PINNED_FILE, 'utf-8');
                return new Set(JSON.parse(data));
            }
        }
    } catch (error) {
        console.error('Error loading pinned reviews:', error);
    }
    return new Set();
}

async function savePinnedIds(pinnedSet) {
    try {
        if (useFirestore && db) {
            await db.collection('pinned_reviews').doc('pins').set({
                ids: [...pinnedSet]
            });
        } else if (!process.env.VERCEL) {
            // Local file fallback (only if not on Vercel)
            fs.writeFileSync(PINNED_FILE, JSON.stringify([...pinnedSet]));
        } else {
            console.warn('⚠️  Vercel: Cannot save pinned reviews to local filesystem. Use Firestore for persistent pinning.');
        }
    } catch (error) {
        console.error('Error saving pinned reviews:', error);
    }
}

async function fetchAllShopReviews() {
    const allReviews = [];
    let page = 1;
    const perPage = 100;
    try {
        console.log('🔄 Fetching all shop reviews...');
        while (page <= 10) { // Safety limit: up to 1000 reviews
            const response = await axios.get('https://judge.me/api/v1/reviews', {
                params: {
                    api_token: process.env.JUDGE_ME_API_TOKEN || process.env.J_API_TOKEN,
                    shop_domain: process.env.SHOP_DOMAIN || process.env.J_SHOP_DOMAIN,
                    page: page,
                    per_page: perPage,
                    _: Date.now() // Cache buster
                }
            });

            const reviews = response.data.reviews || [];
            if (page === 1 && reviews.length > 0) {
                const r = reviews[0];
                console.log('📝 Sample Review Product Info:', {
                    handle: r.product_handle,
                    id: r.product_id,
                    external_id: r.product_external_id
                });
            }
            console.log(`📄 Page ${page}: Found ${reviews.length} reviews`);
            allReviews.push(...reviews);

            if (reviews.length < perPage) {
                console.log('✅ Reached end of reviews list');
                break;
            }
            page++;
        }
    } catch (error) {
        const errorDetails = error.response?.data || error.message;
        console.error('❌ Judge.me API Error Details:', JSON.stringify(errorDetails, null, 2));
        throw new Error(error.response?.data?.message || 'Failed to fetch reviews from Judge.me');
    }

    return allReviews;
}

async function uploadSingleImage(item) {
    try {
        const source = (typeof item === 'string') ? item : (item.url || item.image_url);

        if (!source) {
            console.warn('⚠️ No image source found in item:', item);
            return null;
        }

        // Generate a unique filename like the Python script: img_uuid.jpg
        const uniqueId = Math.random().toString(36).substring(2, 10);
        const fileName = `img_${uniqueId}.jpg`;

        console.log(`📤 Uploading image to Cloudinary [${fileName}]...`);
        const uploadResponse = await cloudinary.uploader.upload(source, {
            folder: 'armor_reviews',
            resource_type: 'auto'
        });

        const secureUrl = uploadResponse.secure_url;
        if (secureUrl) {
            // JUDGE.ME EXPECTS AN OBJECT: { "filename.jpg": "https://url..." }
            // This was the breakthrough from the Python reference.
            console.log(`✅ Cloudinary Uploaded: ${fileName} -> ${secureUrl}`);
            return { [fileName]: secureUrl };
        }
    } catch (error) {
        console.error('❌ Cloudinary Upload failed:', error.message);
    }
    return null;
}

async function detectGender(firstName) {
    const name = firstName.toLowerCase();

    if (GENDER_CACHE[name]) {
        return GENDER_CACHE[name];
    }

    let gender = 'male';
    try {
        const response = await axios.get(`https://api.genderize.io/?name=${name}`, { timeout: 500 });
        if (response.data.gender) {
            gender = response.data.gender;
        }
        GENDER_CACHE[name] = gender;
    } catch (error) {
        GENDER_CACHE[name] = gender;
    }

    return gender;
}

function getRandomItem(array) {
    return array[Math.floor(Math.random() * array.length)];
}

// --- AUTH MIDDLEWARE ---
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid or expired token' });
        }
        req.user = user;
        next();
    });
}

// --- API ROUTES ---

// Login endpoint
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password required' });
        }

        let userData = null;

        if (useFirestore && db) {
            // Fetch user from Firestore
            const userDoc = await db.collection('users').doc('admin').get();

            if (!userDoc.exists) {
                // Create default admin user
                const hashedPassword = await bcrypt.hash('admin123', 10);
                await db.collection('users').doc('admin').set({
                    username: 'admin',
                    password: hashedPassword
                });

                if (username === 'admin' && password === 'admin123') {
                    const token = jwt.sign({ username: 'admin' }, JWT_SECRET, { expiresIn: '24h' });
                    return res.json({ token, message: 'Default admin created' });
                }
            } else {
                userData = userDoc.data();
            }
        } else {
            // Local file fallback
            if (!fs.existsSync(USERS_FILE)) {
                // On Vercel, we can't write the file, but we can allow the default login in-memory for testing
                if (username === 'admin' && password === 'admin123') {
                    const token = jwt.sign({ username: 'admin' }, JWT_SECRET, { expiresIn: '24h' });
                    return res.json({
                        token,
                        message: process.env.VERCEL ? 'Logged in with default credentials (In-memory)' : 'Default admin created'
                    });
                }

                if (!process.env.VERCEL) {
                    const hashedPassword = await bcrypt.hash('admin123', 10);
                    fs.writeFileSync(USERS_FILE, JSON.stringify({
                        admin: { username: 'admin', password: hashedPassword }
                    }));
                }
            } else {
                const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
                userData = users.admin;
            }
        }

        if (!userData) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Verify credentials
        if (userData.username !== username) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const validPassword = await bcrypt.compare(password, userData.password);
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Generate JWT token
        const token = jwt.sign({ username: userData.username }, JWT_SECRET, { expiresIn: '24h' });
        return res.json({ token });
    } catch (error) {
        console.error('Login error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

// Toggle pin (public)
app.post('/api/toggle-pin', async (req, res) => {
    try {
        const { id, action } = req.body;

        if (!id || !action) {
            return res.status(400).json({ error: 'Missing id or action' });
        }

        const pinnedIds = await loadPinnedIds();

        if (action === 'pin') {
            pinnedIds.add(id);
        } else if (action === 'unpin') {
            pinnedIds.delete(id);
        }

        await savePinnedIds(pinnedIds);
        return res.json({ status: 'success', pinned_ids: [...pinnedIds] });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});

// Submit review (public)
app.post('/api/submit-review', async (req, res) => {
    try {
        const { email, name, rating, title, body, product_handle, handle, pictures } = req.body;
        const targetHandle = product_handle || handle;

        if (!email || !name || !rating || !targetHandle) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        let pictureUrlsObject = {};

        if (pictures && pictures.length > 0) {
            console.log(`🖼️ Processing ${pictures.length} images...`);
            const uploadPromises = pictures.map(uploadSingleImage);
            const results = await Promise.all(uploadPromises);

            // Reconstruct the object from individual result objects
            results.forEach(res => {
                if (res) {
                    pictureUrlsObject = { ...pictureUrlsObject, ...res };
                }
            });
            console.log(`✅ Prepared ${Object.keys(pictureUrlsObject).length} images for Judge.me`);
        }

        // SUPER-ROBUST ID LOOKUP:
        // 1. Try to find in raw reviews first (fastest)
        let numericId = null;
        try {
            const rawReviews = await fetchAllShopReviews();
            const matchingReview = rawReviews.find(r =>
                String(r.product_handle).toLowerCase() === String(targetHandle).toLowerCase() &&
                r.product_external_id
            );
            if (matchingReview) {
                numericId = matchingReview.product_external_id;
                console.log(`🎯 Found numeric ID ${numericId} in local review cache`);
            }
        } catch (e) {
            console.warn('⚠️ Local lookup failed, trying Products API fallback...');
        }

        // 2. Fallback: Query the Judge.me Products API using the "-1 ID" handle trick
        if (!numericId) {
            try {
                const token = process.env.JUDGE_ME_API_TOKEN || process.env.J_API_TOKEN;
                const shop = process.env.SHOP_DOMAIN || process.env.J_SHOP_DOMAIN;
                console.log(`🔍 Querying Products API for handle: ${targetHandle}`);

                const productRes = await axios.get(`https://judge.me/api/v1/products/-1`, {
                    params: {
                        api_token: token,
                        shop_domain: shop,
                        handle: targetHandle
                    }
                });

                if (productRes.data && productRes.data.product) {
                    numericId = productRes.data.product.external_id;
                    console.log(`🎯 Found numeric ID ${numericId} via Products API`);
                }
            } catch (productError) {
                console.warn(`❌ Products API lookup failed: ${productError.message}`);
            }
        }

        // 3. Fallback: Try looking for a PRODUCT_ID_HANDLE environment variable (Python style)
        if (!numericId && targetHandle) {
            const envKey = `PRODUCT_ID_${targetHandle.toUpperCase().replace(/[-]/g, '_')}`;
            const envId = process.env[envKey];
            if (envId) {
                numericId = envId;
                console.log(`🎯 Found numeric ID ${numericId} in Environment Variable: ${envKey}`);
            }
        }

        const token = process.env.JUDGE_ME_API_TOKEN || process.env.J_API_TOKEN;

        // Pass ID as a number to match PDF example (999999)
        const finalProductId = numericId ? Number(numericId) : null;

        // OFFICIAL PDF SCHEMA (Page 10/11) - Highly Precise
        // We remove all redundant fields (pictures, images, etc) to follow the strict public spec.
        const reviewData = {
            shop_domain: process.env.SHOP_DOMAIN || process.env.J_SHOP_DOMAIN,
            platform: 'shopify',
            name: name,
            email: email,
            rating: parseInt(rating),
            body: body || '',
            id: finalProductId, // Number
            title: title || '',
            picture_urls: pictureUrlsObject, // NOW AN OBJECT: { "file.jpg": "url" }
            reviewer_name_format: ""
        };

        // Add sanitized IP
        let ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
        reviewData.ip_addr = ip.split(',')[0].trim().replace('::ffff:', '');

        console.log('📤 Submitting PYTHON-STYLE precision review to Judge.me...');

        try {
            const response = await axios.post('https://judge.me/api/v1/reviews', reviewData, {
                params: { api_token: token }
            });

            console.log('📥 Judge.me Official Response:', JSON.stringify(response.data, null, 2));

            return res.json({
                status: 'success',
                message: response.data.message || 'Review submitted successfully',
                review: response.data.review || null,
                uploaded_images: Object.values(pictureUrlsObject),
                is_processing: true
            });
        } catch (apiError) {
            console.error('❌ Judge.me API Error:', apiError.response?.data || apiError.message);
            return res.status(502).json({
                error: 'Judge.me API rejected images or review',
                details: apiError.response?.data || apiError.message,
                debug_urls: Object.values(pictureUrlsObject)
            });
        }
    } catch (error) {
        console.error('Submit error:', error.stack || error.message);
        return res.status(500).json({
            error: 'Failed to process review',
            message: error.message
        });
    }
});

// Get reviews (public)
app.get('/api/product-reviews', async (req, res) => {
    try {
        const targetHandle = req.query.handle;

        if (!targetHandle) {
            return res.status(400).json({ error: 'Missing handle' });
        }

        const pinnedIds = await loadPinnedIds();
        const rawReviews = await fetchAllShopReviews();

        console.log(`📊 Stats for handle "${targetHandle}":`);
        console.log(`- Total shop reviews: ${rawReviews.length}`);

        const filteredReviews = rawReviews.filter(r => {
            const handleMatch = String(r.product_handle).toLowerCase() === String(targetHandle).toLowerCase();
            const isPublished = r.published === true || r.curated === 'ok' || r.hidden === false;

            // Log discrepancy details if handle or status is weird
            if (!handleMatch && r.product_handle && r.product_handle.includes(targetHandle)) {
                console.log(`  🔍 Partial handle match found: "${r.product_handle}" vs "${targetHandle}"`);
            }

            return handleMatch && isPublished;
        });

        console.log(`- Filtered reviews (handle match & published): ${filteredReviews.length}`);

        // Debug: list handles found in the first few reviews to verify format
        const uniqueHandles = [...new Set(rawReviews.map(r => r.product_handle))].slice(0, 10);
        console.log(`- Sample handles in data: ${uniqueHandles.join(', ')}`);

        const cleanReviews = [];

        for (const r of filteredReviews) {
            const media = [];
            const pictures = r.pictures || [];

            for (const pic of pictures) {
                const imageUrl = pic.urls?.original || pic.image_url || pic.url;
                if (imageUrl) {
                    media.push({
                        type: 'image',
                        url: imageUrl
                    });
                }
            }

            let authorName = r.reviewer?.name || r.name || 'Anonymous';
            if (!authorName || authorName.trim() === '') {
                authorName = 'Verified Buyer';
            }

            const rating = parseInt(r.rating || 5);

            // Gender Detection
            const firstName = authorName.split(' ')[0];
            const gender = await detectGender(firstName);

            // Style Customization
            const skinColors = ['f8d25c', 'ffe62e', 'f9c9b6', 'ac6651'];
            const skinColor = getRandomItem(skinColors);

            const bgColors = ['b6e3f4', 'c0aede', 'd1d4f9', 'ffd5dc', 'ffdfbf'];
            const bgColor = getRandomItem(bgColors);

            let top, facialHairProb;
            if (gender === 'female') {
                const tops = ['bob', 'bun', 'curly', 'curvy', 'longButNotTooLong', 'miaWallace', 'straight01', 'straight02', 'straightAndStrand'];
                top = getRandomItem(tops);
                facialHairProb = 0;
            } else {
                const tops = ['shortCurly', 'shortFlat', 'shortRound', 'shortWaved', 'sides', 'theCaesar', 'theCaesarAndSidePart', 'dreads01', 'dreads02', 'frizzle', 'shaggy', 'shaggyMullet'];
                top = getRandomItem(tops);
                facialHairProb = 50;
            }

            // Emotions
            const emotionMap = {
                5: { mouth: 'smile', eyes: 'happy', eyebrows: 'raisedExcited' },
                4: { mouth: 'smile', eyes: 'default', eyebrows: 'default' },
                3: { mouth: 'serious', eyes: 'default', eyebrows: 'default' },
                2: { mouth: 'sad', eyes: 'squint', eyebrows: 'sadConcerned' },
                1: { mouth: 'grimace', eyes: 'squint', eyebrows: 'angry' }
            };
            const features = emotionMap[rating] || emotionMap[5];

            const baseUrl = 'https://api.dicebear.com/9.x/avataaars/svg';
            const params = `seed=${r.id}&mouth=${features.mouth}&eyes=${features.eyes}&eyebrows=${features.eyebrows}&accessoriesProbability=0&skinColor=${skinColor}&backgroundColor=${bgColor}&top=${top}&facialHairProbability=${facialHairProb}`;

            cleanReviews.push({
                id: r.id,
                body: r.body,
                rating: rating,
                author: authorName,
                profile_pic: `${baseUrl}?${params}`,
                is_pinned: pinnedIds.has(r.id),
                is_verified: ['buyer', 'verified_buyer', 'email'].includes(r.verified),
                media: media,
                title: r.title,
                date: r.created_at
            });
        }

        // Statistics
        const count = cleanReviews.length;
        const totalRating = cleanReviews.reduce((sum, r) => sum + r.rating, 0);
        const average = count > 0 ? (totalRating / count).toFixed(1) : '0.0';

        const ratingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        cleanReviews.forEach(r => {
            ratingDistribution[r.rating] = (ratingDistribution[r.rating] || 0) + 1;
        });

        return res.json({
            stats: {
                average: average,
                count: cleanReviews.length,
                distribution: ratingDistribution,
                debug: {
                    total_shop_reviews: rawReviews.length,
                    filtered_matching_handle: filteredReviews.length,
                    sample_handles: uniqueHandles
                }
            },
            reviews: cleanReviews
        });
    } catch (error) {
        console.error('Error fetching product reviews:', error);
        return res.status(500).json({
            error: 'Server Error',
            message: error.message
        });
    }
});

// Serve login page at root
app.get('/', (req, res) => {
    const loginPath = path.join(process.cwd(), 'public', 'login.html');
    if (fs.existsSync(loginPath)) {
        res.sendFile(loginPath);
    } else {
        res.status(404).send('Login page not found. Ensure public folder exists at root.');
    }
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('Unhandled Error:', err);
    res.status(500).json({
        error: 'Internal Server Error',
        message: err.message,
        path: req.path
    });
});

// Export the app for Vercel
module.exports = app;

// Only start the server if not running as a Vercel function
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`✅ Server running on http://127.0.0.1:${PORT}`);
        console.log(`📝 Login at: http://127.0.0.1:${PORT}/`);
        console.log(`🔐 Admin Dashboard at: http://127.0.0.1:${PORT}/public/admin.html`);
    });
}
