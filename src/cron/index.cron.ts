import cron from "node-cron";
import { getMidnightYTData } from "../controller/creator/youtube/youtube.controller";

//Run at 1 Am every day
cron.schedule("0 1 * * *", async() => {
    await getMidnightYTData();
}, {
    scheduled: true,
    timezone: "Asia/Kolkata" // Indian Standard Time (IST)
});

//Run at 2 Am every day
cron.schedule("0 2 * * *", () => {
    console.log("Running scheduled task at 2 AM IST...");
}, {
    scheduled: true,
    timezone: "Asia/Kolkata"
});

cron.schedule("* * * * *", async () => {
    console.log("Running task every minute...");
}, {
    scheduled: true,
    timezone: "Asia/Kolkata"
});

export default cron;