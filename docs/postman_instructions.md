# Testing with Postman (Vercel Node.js API)

This guide explains how to test the **Node.js Judge.me API wrapper** (deployed on Vercel or running locally).

## 1. Import the Collection
1. Open **Postman**.
2. Click **Import**.
3. Drag and drop the file `docs/judge_me_api.postman_collection.json`.

## 2. API Base URL
- **Vercel**: `https://armor-judgeme-api.vercel.app`
- **Local**: `http://127.0.0.1:5000`

---

## 3. Step-by-Step Testing

### A. Login (Get JWT Token)
You must login first to get an access token for protected routes.
- **Method**: `POST`
- **URL**: `{{baseUrl}}/api/login`
- **Body** (JSON):
  ```json
  {
      "username": "admin",
      "password": "your_password_here"
  }
  ```
- **Copy the token** from the response.

### A. Get Product Reviews (PUBLIC)
- **Method**: `GET`
- **URL**: `{{baseUrl}}/api/product-reviews?handle=version-h1`
- **Auth**: No Authorization header needed.
- **Expected**: Detailed reviews with profile pictures and stats.

### B. Toggle Pin (PUBLIC)
- **Method**: `POST`
- **URL**: `{{baseUrl}}/api/toggle-pin`
- **Auth**: No Authorization header needed.
- **Body** (JSON):
  ```json
  {
      "id": 1234567,
      "action": "pin"
  }
  ```

### E. Submit Review (PUBLIC)
- **Method**: `POST`
- **URL**: `{{baseUrl}}/api/submit-review`
- **Auth**: No Authorization header needed.
- **Body** (JSON):
  ```json
  {
      "name": "Postman Tester",
      "email": "tester@example.com",
      "rating": 5,
      "title": "Excellent!",
      "body": "Test review body",
      "handle": "version-h1",
      "pictures": [
          "https://example.com/image.jpg"
      ]
  }
  ```

### 📸 Submitting with Images

**Payload:**
```json
{
  "email": "test@example.com",
  "name": "Jane Doe",
  "rating": 5,
  "title": "Amazing product!",
  "body": "The quality is top-notch. See the picture!",
  "handle": "version-h1",
  "pictures": [
    "https://example.com/item_image.jpg"
  ]
}
```

> [!IMPORTANT]
> **Judge.me Delay**: Even if the API returns "success", Judge.me uses a background crawler to download your images. It may take **2-5 minutes** for the images to appear in the dashboard or admin panel. 

> [!TIP]
> **Cloudinary Optimization**: Our server automatically uploads your images to Cloudinary and optimizes the URL format (clean extension, high-speed CDN) to ensure Judge.me's crawler doesn't ignore them.

---

## Troubleshooting
If you get a **401 Unauthorized**, ensure your `Authorization` header is set to `Bearer <token>`.
