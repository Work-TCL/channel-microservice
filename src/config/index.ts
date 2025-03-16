import dotenv from "dotenv";
dotenv.config();


const { PORT,DB_URL, INSTAGRAM_CLIENT_ID, INSTAGRAM_CLIENT_SECRET, INSTAGRAM_REDIRECT_URI, YOUTUBE_API_KEY , encrypt_decrypt_key} = process.env

const SECRET_KEY = encrypt_decrypt_key || '';

export { PORT,DB_URL, INSTAGRAM_CLIENT_ID, INSTAGRAM_CLIENT_SECRET, INSTAGRAM_REDIRECT_URI, YOUTUBE_API_KEY, SECRET_KEY }