# Judge.me API Wrapper

A Node.js/Express backend for managing Judge.me reviews with authentication, Firebase Firestore storage, and dynamic profile pictures.

## Features

- 🔐 **JWT Authentication** - Secure login system
- ☁️ **Firebase Firestore** - Cloud storage for users and pinned reviews
- 📌 **Review Pinning** - Pin important reviews for display
- 🎨 **Dynamic Avatars** - Gender-aware, emotion-based profile pictures using DiceBear API
- 📊 **Admin Dashboard** - Modern UI for managing reviews
- 🔄 **Judge.me Integration** - Seamless API proxy with pagination

## Quick Start

### Local Development

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure Environment**
   - Copy `.env.example` to `.env`
   - Add your credentials (Judge.me, Cloudinary, Firebase)

3. **Add Firebase Service Account**
   - Place your Firebase service account JSON file in the root directory
   - Update the filename in `server.js` if different

4. **Start Server**
   ```bash
   node server.js
   ```

5. **Access Application**
   - Login: `http://localhost:5000/`
   - Dashboard: `http://localhost:5000/public/admin.html`
   - Default credentials: `admin` / `admin123`

## Project Structure

```
├── public/                 # Frontend files
│   ├── login.html         # Login page
│   └── admin.html         # Admin dashboard
├── server.js              # Main Express server
├── package.json           # Dependencies
├── .env                   # Environment variables (not in git)
├── vercel.json            # Vercel deployment config
└── DEPLOYMENT.md          # Deployment guide
```

## API Endpoints

### Public
- `POST /api/submit-review` - Submit a new review

### Protected (requires authentication)
- `POST /api/login` - Login and get JWT token
- `GET /api/product-reviews` - Get all reviews for a product
- `POST /api/toggle-pin` - Pin/unpin a review

## Tech Stack

- **Backend**: Node.js, Express
- **Database**: Firebase Firestore
- **Authentication**: JWT (jsonwebtoken)
- **Image Processing**: Cloudinary
- **Avatars**: DiceBear API v9.x
- **Password Hashing**: bcrypt

## Environment Variables

Required in `.env`:
- `J_API_TOKEN` - Judge.me API token
- `J_SHOP_DOMAIN` - Your Shopify shop domain
- `CLOUDINARY_CLOUD_NAME` - Cloudinary cloud name
- `CLOUDINARY_API_KEY` - Cloudinary API key
- `CLOUDINARY_API_SECRET` - Cloudinary API secret
- `FIREBASE_PROJECT_ID` - Firebase project ID
- `JWT_SECRET` - Secret key for JWT tokens

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed deployment instructions to Vercel.

## Security

- Sensitive files protected by `.gitignore`
- JWT tokens for API authentication
- Passwords hashed with bcrypt
- Firebase service account for Firestore access
- CORS enabled for cross-origin requests

## License

MIT
