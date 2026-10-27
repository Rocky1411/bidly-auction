# Bidly Auction

React/Vite auction room with Firebase Realtime Database chat.

## Development

```powershell
npm install
npm run dev
```

Open `http://localhost:5500`.

Firebase settings are loaded from `.env`. Use `.env.example` as the template for another environment. Never commit `.env`.

## Routes

- `/` - role selection
- `/host-setup` - first-host player setup
- `/auction` - shared auction room
